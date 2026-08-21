// ═══════════════════════════════════════════════════════════════
//  CANVAS SETUP
// ═══════════════════════════════════════════════════════════════
const canvas = document.getElementById('circuit-canvas');
const ctx = canvas.getContext('2d');

// Cache for getBoundingClientRect to avoid recalculation every frame
let canvasRectCache = null;
function getCanvasRectCached() {
  if (canvasRectCache === null) {
    canvasRectCache = canvas.getBoundingClientRect();
  }
  return canvasRectCache;
}
function invalidateCanvasRect() {
  canvasRectCache = null;
}

// Coalesce high-frequency redraws (mousemove, panning, touch drag) into one frame.
// Pointer events can fire several times per frame; each one used to run a full
// synchronous render, so the canvas was redrawn far more often than the display
// could show it.  Callers that need the canvas up to date *now* still call render()
// directly — this only batches the input-driven ones.
let _renderScheduled = false;
function scheduleRender() {
  if (_renderScheduled) return;
  _renderScheduled = true;
  requestAnimationFrame(() => { _renderScheduled = false; render(); });
}

function resizeCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(wrap.clientWidth  * dpr);
  canvas.height = Math.round(wrap.clientHeight * dpr);
  canvas.style.width  = wrap.clientWidth  + 'px';
  canvas.style.height = wrap.clientHeight + 'px';
  invalidateCanvasRect();
  render();
}
window.addEventListener('resize', () => {
  invalidateCanvasRect();
  resizeCanvas();
});

// Re-assert the camera transform absolutely. Used to recover after a draw call
// throws part-way through a component, where the canvas save()/restore() stack
// can no longer be trusted.
function restoreWorldTransform() {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(camX, camY);
  ctx.scale(camZoom, camZoom);
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function screenToWorld(sx, sy) {
  return { x: (sx - camX) / camZoom, y: (sy - camY) / camZoom };
}
function worldToScreen(wx, wy) {
  return { x: wx * camZoom + camX, y: wy * camZoom + camY };
}
const HALF_GRID = GRID / 2;
function snapToGrid(wx, wy) {
  return { gx: Math.round(wx / HALF_GRID) * 0.5, gy: Math.round(wy / HALF_GRID) * 0.5 };
}
function canvasMousePos(e) {
  const r = getCanvasRectCached();
  return { sx: e.clientX - r.left, sy: e.clientY - r.top };
}

// ═══════════════════════════════════════════════════════════════
//  RENDERING
// ═══════════════════════════════════════════════════════════════
function render() {
  // Lerp display values toward targets — only advance when inside the animation loop
  // (renderDt > 0). Mouse-triggered renders (e.g. probe snap) have renderDt=0
  // so no lerp step runs, preventing data-box jumps on other components.
  const lerpSpeed = renderDt > 0 ? Math.min(1, renderDt * 11) : 0;
  for (const c of components) {
    const isNew = !displayValues[c.id];
    if (isNew) displayValues[c.id] = {};
    const dv = displayValues[c.id];
    const cr = compResults[c.id] || {};

    // Determine target values
    let targets;
    if (isACSource(c.type)) {
      const srcOn = (c.props || {}).on !== false;
      targets = { v: srcOn ? (simRunning ? (cr.voltageDrop || 0) : ((c.props || {}).voltage || 120)) : 0, a: cr.current || 0, w: cr.watts || 0 };
    } else if (c.type === 'transformer') {
      targets = {
        v: cr.voltageDrop || 0, a: cr.current || 0, w: cr.watts || 0,
        sv: cr.secVoltage || 0, sa: cr.secCurrent || 0, sw: cr.secWatts || 0
      };
    } else if (c.type === 'fuse' || c.type === 'lv_fuse' || c.type === 'td_fuse' || c.type === 'breaker') {
      targets = { a: cr.current || 0 };
    } else {
      const p = c.props || {};
      targets = { v: cr.voltageDrop || 0, a: cr.current || 0, w: cr.watts || 0, r: cr.resistance || p.coilResistance || p.resistance || 0, va: cr.apparentPower || 0 };
    }

    for (const key in targets) {
      if (isNew || dv[key] === undefined) {
        // Snap instantly on first render (page load)
        dv[key] = targets[key];
      } else {
        dv[key] += (targets[key] - dv[key]) * lerpSpeed;
        if (Math.abs(dv[key] - targets[key]) < 0.005) dv[key] = targets[key];
      }
    }
  }

  // Snap meter display value instantly to target (real meter behavior)
  if (meterActive && meterDisplayMode === 'value') {
    meterDisplayedValue = meterTargetValue;
    const decimals = meterDisplayUnit.includes('A') ? 2 : 1;
    updateMeterDisplay(meterDisplayedValue.toFixed(decimals), meterDisplayUnit);
  }

  renderedDataBoxes = [];
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width, H = canvas.height;

  // Begin every frame from an absolute transform rather than trusting the
  // save()/restore() stack to still be balanced. A component draw that throws
  // between its own save() and restore() leaks a stack level; the single
  // restore() at the end of this function then pops *that* level instead of the
  // one pushed below, so the camera transform was still applied when the next
  // frame started. The result was permanent: clearRect() no longer covered the
  // visible area and the whole circuit drew double-scaled and offset, with no
  // way back but a reload. The per-component catch already re-asserts the
  // transform mid-frame; this makes the recovery hold across frames.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.translate(camX, camY);
  ctx.scale(camZoom, camZoom);

  // drawGrid works in CSS pixels (screenToWorld's space) — passing the raw device
  // buffer size made it lay out the grid over a dpr× larger area and draw ~4× the
  // dots on a 2× display, most of them off-screen.
  drawGrid(W / dpr, H / dpr);
  drawCommentBoxes();
  drawWires();
  drawComponents();
  drawWirePreview();
  drawGhostComponent();
  drawHoveredNode();
  drawBoxSelect();

  // Tether line from props panel to component
  if (_propsPanelComp && document.getElementById('props-panel').classList.contains('visible')) {
    const c = _propsPanelComp;
    const compX = (c.gx1 + c.gx2) / 2 * GRID;
    const compY = (c.gy1 + c.gy2) / 2 * GRID;
    const panel = document.getElementById('props-panel');
    const panelCX = (panel.offsetLeft + panel.offsetWidth / 2 - camX) / camZoom;
    const panelCY = (panel.offsetTop + panel.offsetHeight / 2 - camY) / camZoom;
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1 / camZoom;
    ctx.setLineDash([4 / camZoom, 3 / camZoom]);
    ctx.beginPath();
    ctx.moveTo(compX, compY);
    ctx.lineTo(panelCX, panelCY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Tether line from props panel to wire
  if (_propsPanelWire && document.getElementById('props-panel').classList.contains('visible')) {
    const w = _propsPanelWire;
    const wireX = (w.gx1 + w.gx2) / 2 * GRID;
    const wireY = (w.gy1 + w.gy2) / 2 * GRID;
    const panel = document.getElementById('props-panel');
    const panelCX = (panel.offsetLeft + panel.offsetWidth / 2 - camX) / camZoom;
    const panelCY = (panel.offsetTop + panel.offsetHeight / 2 - camY) / camZoom;
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1 / camZoom;
    ctx.setLineDash([4 / camZoom, 3 / camZoom]);
    ctx.beginPath();
    ctx.moveTo(wireX, wireY);
    ctx.lineTo(panelCX, panelCY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
  updateTethers();
  // Zero out renderDt after each render so mouse-triggered renders
  // don't advance fan/bulb physics between animation frames
  renderDt = 0;
}

// Comment box resize handle detection (corners + edges)
function getCommentResizeHandle(px, py, bx, by, bw, bh, hs) {
  // Corners first (higher priority)
  if (Math.abs(px - bx) < hs && Math.abs(py - by) < hs) return 'tl';
  if (Math.abs(px - (bx + bw)) < hs && Math.abs(py - by) < hs) return 'tr';
  if (Math.abs(px - bx) < hs && Math.abs(py - (by + bh)) < hs) return 'bl';
  if (Math.abs(px - (bx + bw)) < hs && Math.abs(py - (by + bh)) < hs) return 'br';
  // Edges
  if (Math.abs(py - by) < hs && px > bx + hs && px < bx + bw - hs) return 't';
  if (Math.abs(py - (by + bh)) < hs && px > bx + hs && px < bx + bw - hs) return 'b';
  if (Math.abs(px - bx) < hs && py > by + hs && py < by + bh - hs) return 'l';
  if (Math.abs(px - (bx + bw)) < hs && py > by + hs && py < by + bh - hs) return 'r';
  return null;
}

// Inline comment text editor
let activeCommentEdit = null; // { cb, isNew }
function showCommentEditor(cb, isNew) {
  hideCommentEditor(true); // close any existing
  activeCommentEdit = { cb, isNew };
  const wrap = document.getElementById('canvas-wrap');
  const sx = cb.x1 * camZoom + camX;
  const sy = Math.min(cb.y1, cb.y2) * camZoom + camY - 28;
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.id = 'comment-editor';
  inp.value = cb.text || '';
  inp.placeholder = 'Enter comment...';
  // Color swatches
  const editorWrap = document.createElement('div');
  editorWrap.id = 'comment-editor-wrap';
  editorWrap.style.cssText = `
    position: absolute; left: ${sx}px; top: ${sy}px; z-index: 100;
    background: #fff; border: 2px solid #3b82f6; border-radius: 8px;
    padding: 8px 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    display: flex; flex-direction: column; gap: 6px;
  `;
  inp.style.cssText = `
    font: bold 13px Segoe UI, sans-serif; color: #333; background: transparent;
    border: none; border-bottom: 1px solid #ddd; padding: 2px 0 4px;
    outline: none; min-width: 160px;
  `;
  editorWrap.appendChild(inp);

  const swatchRow = document.createElement('div');
  swatchRow.style.cssText = 'display: flex; gap: 4px;';
  const swatchColors = [
    { hex: '#222222' },
    { hex: '#9ca3af' },
    { hex: '#3b82f6' },
    { hex: '#22c55e' },
    { hex: '#eab308' },
    { hex: '#ef4444' },
    { hex: '#f97316' },
  ];
  swatchColors.forEach((sc, i) => {
    const swatch = document.createElement('div');
    swatch.style.cssText = `
      width: 18px; height: 18px; border-radius: 4px; cursor: pointer;
      background: ${sc.hex}; border: 2px solid ${i === (cb.colorIndex || 0) ? '#333' : 'transparent'};
      transition: border-color 0.15s;
    `;
    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      cb.colorIndex = i;
      // Update swatch borders
      swatchRow.querySelectorAll('div').forEach((s, j) => {
        s.style.borderColor = j === i ? '#333' : 'transparent';
      });
      render();
    });
    swatchRow.appendChild(swatch);
  });
  editorWrap.appendChild(swatchRow);
  wrap.appendChild(editorWrap);

  inp.focus();
  inp.select();
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { hideCommentEditor(false); e.stopPropagation(); }
    else if (e.key === 'Escape') { hideCommentEditor(true); e.stopPropagation(); }
    e.stopPropagation();
  });
  inp.addEventListener('blur', () => {
    setTimeout(() => { if (!editorWrap.contains(document.activeElement)) hideCommentEditor(false); }, 150);
  });
  inp.addEventListener('input', () => {
    if (activeCommentEdit) { activeCommentEdit.cb.text = inp.value; render(); }
  });
}
function hideCommentEditor(cancel) {
  const wrap = document.getElementById('comment-editor-wrap');
  const inp = document.getElementById('comment-editor');
  if (!inp && !wrap) return;
  if (activeCommentEdit) {
    if (cancel && activeCommentEdit.isNew) {
      // Remove the comment box if cancelled during creation
      commentBoxes = commentBoxes.filter(c => c.id !== activeCommentEdit.cb.id);
    } else {
      activeCommentEdit.cb.text = inp.value.trim();
    }
    activeCommentEdit = null;
  }
  if (wrap) wrap.remove();
  else if (inp) inp.remove();
  autoSave();
  render();
}

function drawCommentBoxes() {
  if (!showComments) return;
  const colors = ['rgba(0,0,0,0.06)', 'rgba(156,163,175,0.1)', 'rgba(59,130,246,0.08)', 'rgba(34,197,94,0.08)', 'rgba(234,179,8,0.08)', 'rgba(239,68,68,0.08)', 'rgba(249,115,22,0.08)'];
  const borderColors = ['rgba(0,0,0,0.4)', 'rgba(156,163,175,0.5)', 'rgba(59,130,246,0.5)', 'rgba(34,197,94,0.5)', 'rgba(234,179,8,0.5)', 'rgba(239,68,68,0.5)', 'rgba(249,115,22,0.5)'];

  for (const cb of commentBoxes) {
    const x = Math.min(cb.x1, cb.x2), y = Math.min(cb.y1, cb.y2);
    const w = Math.abs(cb.x2 - cb.x1), h = Math.abs(cb.y2 - cb.y1);
    const ci = (cb.colorIndex || 0) % colors.length;

    // Border
    ctx.strokeStyle = borderColors[ci];
    ctx.lineWidth = 1.5 / camZoom;
    ctx.setLineDash([5 / camZoom, 3 / camZoom]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    // Selected highlight + resize handles
    if (selectedItem && selectedItem.kind === 'comment' && selectedItem.id === cb.id) {
      ctx.strokeStyle = '#cc8800';
      ctx.lineWidth = 2 / camZoom;
      ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
      // Corner + edge resize handles
      const hs = 4 / camZoom;
      ctx.fillStyle = '#cc8800';
      // Corners
      for (const [hx, hy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
        ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
      }
      // Edge midpoints
      const ehs = 3 / camZoom;
      for (const [hx, hy] of [[x + w / 2, y], [x + w / 2, y + h], [x, y + h / 2], [x + w, y + h / 2]]) {
        ctx.fillRect(hx - ehs * 1.5, hy - ehs, ehs * 3, ehs * 2);
      }
    }

    // Text label with note icon above the box
    if (cb.text) {
      const fontSize = 12 / camZoom;
      ctx.font = `bold ${fontSize}px Segoe UI, sans-serif`;
      ctx.fillStyle = '#222';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      const pad = 6 / camZoom;
      const iconW = 12 / camZoom;
      const maxW = w - iconW - pad;
      const lineH = 15 / camZoom;
      const words = cb.text.split(' ');
      const lines = [];
      let line = '';
      for (let i = 0; i < words.length; i++) {
        const testLine = line ? line + ' ' + words[i] : words[i];
        if (ctx.measureText(testLine).width > maxW && line) {
          lines.push(line);
          line = words[i];
        } else {
          line = testLine;
        }
      }
      if (line) lines.push(line);
      // Draw note icon next to first line
      const firstLineY = y - pad - (lines.length - 1) * lineH;
      const iy = firstLineY - fontSize * 0.7;
      const ix = x + pad;
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1.2 / camZoom;
      // Small notepad icon
      const ns = 8 / camZoom;
      ctx.strokeRect(ix, iy, ns, ns * 1.1);
      ctx.beginPath();
      ctx.moveTo(ix + ns * 0.25, iy + ns * 0.35);
      ctx.lineTo(ix + ns * 0.75, iy + ns * 0.35);
      ctx.moveTo(ix + ns * 0.25, iy + ns * 0.6);
      ctx.lineTo(ix + ns * 0.75, iy + ns * 0.6);
      ctx.moveTo(ix + ns * 0.25, iy + ns * 0.85);
      ctx.lineTo(ix + ns * 0.55, iy + ns * 0.85);
      ctx.stroke();
      // Draw text lines
      ctx.fillStyle = '#222';
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], x + pad + iconW + pad, y - pad - (lines.length - 1 - i) * lineH);
      }
      ctx.textBaseline = 'alphabetic';
    }
  }

  // Preview while drawing
  if (commentDrawStart && commentDrawEnd) {
    const x = Math.min(commentDrawStart.x, commentDrawEnd.x);
    const y = Math.min(commentDrawStart.y, commentDrawEnd.y);
    const w = Math.abs(commentDrawEnd.x - commentDrawStart.x);
    const h = Math.abs(commentDrawEnd.y - commentDrawStart.y);
    ctx.fillStyle = 'rgba(59,130,246,0.08)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(59,130,246,0.4)';
    ctx.lineWidth = 1.5 / camZoom;
    ctx.setLineDash([5 / camZoom, 3 / camZoom]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }
}

// W/H are CSS pixels — the same space screenToWorld maps from.
function drawGrid(W, H) {
  const tl = screenToWorld(0, 0);
  const br = screenToWorld(W, H);

  // How wide one grid cell is on screen.  Once the grid gets denser than a few
  // pixels it just reads as flat noise, so coarsen the step and drop the
  // half-grid dots rather than emitting hundreds of thousands of sub-pixel dots
  // every frame (at min zoom the old loop issued ~700k arc fills per render).
  const cellPx = GRID * camZoom;
  const step = cellPx >= 6 ? 1 : Math.min(64, Math.pow(2, Math.ceil(Math.log2(6 / cellPx))));
  const showHalfDots = cellPx >= 14;

  const endGx = Math.ceil(br.x / GRID) + 1;
  const endGy = Math.ceil(br.y / GRID) + 1;
  // Snap the loop origin to the step so the pattern doesn't shimmer while panning
  const gx0 = Math.floor((Math.floor(tl.x / GRID) - 1) / step) * step;
  const gy0 = Math.floor((Math.floor(tl.y / GRID) - 1) / step) * step;

  const halfG = GRID / 2;

  // fillRect is markedly cheaper than beginPath+arc+fill at these sizes, and at
  // 2-3 screen pixels a square and a circle are indistinguishable.
  if (showHalfDots) {
    const s = 2 / camZoom, o = s / 2;
    ctx.fillStyle = '#bbb';
    for (let gx = gx0; gx <= endGx; gx += step) {
      const x = gx * GRID;
      for (let gy = gy0; gy <= endGy; gy += step) {
        const y = gy * GRID;
        ctx.fillRect(x + halfG - o, y - o, s, s);
        ctx.fillRect(x - o, y + halfG - o, s, s);
        ctx.fillRect(x + halfG - o, y + halfG - o, s, s);
      }
    }
  }

  // Main grid dots
  const ms = 3 / camZoom, mo = ms / 2;
  ctx.fillStyle = '#ccc';
  for (let gx = gx0; gx <= endGx; gx += step) {
    const x = gx * GRID - mo;
    for (let gy = gy0; gy <= endGy; gy += step) {
      ctx.fillRect(x, gy * GRID - mo, ms, ms);
    }
  }
}

