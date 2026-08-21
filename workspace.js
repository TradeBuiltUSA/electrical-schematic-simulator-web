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

// ═══════════════════════════════════════════════════════════════
//  VIEWPORT AND FRAMING
//
//  Two scales share this file and must not be confused with each other:
//
//   • the canvas *backing store*, sized in physical device pixels, which is what
//     devicePixelRatio is for — more pixels behind the same CSS box, so the
//     drawing is sharp on a high-DPI screen;
//   • the *camera*, which lives entirely in CSS pixels and world units and never
//     sees devicePixelRatio at all.
//
//  DPR therefore changes rendering fidelity and nothing else. What the camera
//  measures itself against is the usable CSS viewport, which is exactly what an
//  OS scale factor moves: a 1920×1080 laptop panel at 150% hands the page a
//  1280×720 CSS viewport, not 1920×1080. Framing against that number is what
//  makes a Windows laptop and a Mac land on comparable views.
// ═══════════════════════════════════════════════════════════════

// Breathing room left around the schematic when the app frames it, in CSS pixels.
const FIT_PADDING = 40;
// The drawing area the 1:1 camera was drawn for. A viewport at least this big
// starts at zoom 1, with every symbol at the size it was designed at; a smaller
// one zooms out to show a comparable amount of world instead of cropping the
// same 1:1 scale, which is what made small CSS viewports feel magnified.
const REFERENCE_VIEW = { w: 1400, h: 800 };
// Floor for that baseline, so a genuinely small window does not shrink an empty
// board into unusable specks. Framing actual content keeps the full MIN_ZOOM
// range — fitting a large schematic is worth zooming well out for.
const MIN_BASE_ZOOM = 0.6;

// The usable CSS viewport for the schematic. #canvas-wrap is the flex child the
// topbar and sidebar have already been subtracted from, so its content box *is*
// the drawing area, in the same CSS pixels the camera works in. Deliberately not
// derived from window.innerWidth (which still includes the sidebar) and never
// from devicePixelRatio.
function getViewportCSS() {
  const wrap = document.getElementById('canvas-wrap');
  const w = wrap ? wrap.clientWidth  : 0;
  const h = wrap ? wrap.clientHeight : 0;
  // A display:none ancestor, or a call before first layout, reports 0 — which
  // would divide the fit by zero. Fall back to the reference frame instead.
  return { w: w > 0 ? w : REFERENCE_VIEW.w, h: h > 0 ? h : REFERENCE_VIEW.h };
}

// A comment box's caption wraps to the box's width, but it is typeset at a fixed
// *screen* size — so the lower the zoom, the fewer characters fit per line and the
// taller the block gets. drawCommentBoxes() draws that block above the box, and
// the fit has to know how tall it is, so both go through here rather than each
// wrapping the text their own way.
function commentLabelLines(cb, zoom) {
  if (!cb.text) return [];
  const w = Math.abs(cb.x2 - cb.x1);
  const maxW = w - 12 / zoom - 6 / zoom;          // box width less icon and padding
  ctx.font = `bold ${12 / zoom}px Segoe UI, sans-serif`;
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
  return lines;
}

// How far above its box that caption block reaches, in CSS pixels: the gap, the
// stacked lines, and the ascent of the top one.
function commentLabelRiseCSS(cb, zoom) {
  const n = commentLabelLines(cb, zoom).length;
  return n === 0 ? 0 : 6 + (n - 1) * 15 + 12;
}

// World-space bounds of everything the user expects to see framed, or null when
// the board is empty and there is nothing to frame. Non-finite geometry is
// skipped rather than poisoning the bounds: sanitizeComponents() already drops it
// on load, but a live edit is not gated the same way.
//
// `zoom` is optional. Passing it also reserves room for the decoration that is
// drawn outside a shape's own geometry — today that means comment captions, whose
// block is measured at that zoom and converted back into world units. Without it
// the bounds are the raw geometry, which is what a caller that just wants the
// extent of the circuit is asking for.
function getContentBoundsWorld(zoom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  function grow(x, y) {
    if (!isFinite(x) || !isFinite(y)) return;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (const c of components) {
    grow(c.gx1 * GRID, c.gy1 * GRID);
    grow(c.gx2 * GRID, c.gy2 * GRID);
  }
  for (const w of wires) {
    grow(w.gx1 * GRID, w.gy1 * GRID);
    grow(w.gx2 * GRID, w.gy2 * GRID);
  }
  // Comment boxes are already stored in world units, not grid units.
  for (const cb of commentBoxes) {
    grow(cb.x1, cb.y1);
    grow(cb.x2, cb.y2);
    if (zoom > 0) grow(cb.x1, Math.min(cb.y1, cb.y2) - commentLabelRiseCSS(cb, zoom) / zoom);
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

// The camera that frames `bounds` — or the reference working area, when the board
// is empty — inside a CSS viewport. Pure: it returns the camera, callers apply it.
//
// Zoom is capped at 1 in both branches. Framing may zoom *out*, to bring a large
// schematic or a small viewport into view, but it never magnifies past the scale
// the symbols were drawn at.
function computeFitCamera(view, bounds) {
  let cx, cy, zoom;
  if (bounds) {
    // A single component has zero extent on one axis; floor it at a grid cell so
    // the division stays finite and one part does not fill the screen.
    const rectW = Math.max(bounds.maxX - bounds.minX, GRID);
    const rectH = Math.max(bounds.maxY - bounds.minY, GRID);
    cx = (bounds.minX + bounds.maxX) / 2;
    cy = (bounds.minY + bounds.maxY) / 2;
    const availW = Math.max(1, view.w - FIT_PADDING * 2);
    const availH = Math.max(1, view.h - FIT_PADDING * 2);
    zoom = clampZoom(Math.min(1, availW / rectW, availH / rectH));
  } else {
    cx = 0; cy = 0;
    zoom = clampZoom(Math.max(MIN_BASE_ZOOM,
      Math.min(1, view.w / REFERENCE_VIEW.w, view.h / REFERENCE_VIEW.h)));
  }
  return { camX: view.w / 2 - cx * zoom, camY: view.h / 2 - cy * zoom, camZoom: zoom };
}

// The framing a viewport actually wants, decoration included.
//
// Comment captions are typeset at a fixed screen size, so how much room they need
// above their box depends on the very zoom being solved for: fit the raw geometry
// and the caption wraps to more lines than the padding was holding room for, and
// the top one is clipped off the edge — which bit hardest on exactly the small
// viewports this framing exists to serve. So measure the decoration at the zoom
// the geometry asks for, then fit again with it included. Each pass can only zoom
// out, and the second pass moves little enough that a third would be noise the
// padding already covers.
function solveFitCamera(view) {
  const raw = getContentBoundsWorld();
  if (!raw) return computeFitCamera(view, null);
  const first = computeFitCamera(view, raw);
  return computeFitCamera(view, getContentBoundsWorld(first.camZoom));
}

// Frame the board in the viewport it is actually being shown in.
//
// This is the app's *initial* framing, and only that: it runs on first load and
// on a load whose saved camera cannot be trusted to this viewport. It is not
// wired to resize and never runs after the user has moved the camera themselves —
// an auto-fit that fought the user's pan and zoom would be worse than the bug.
function fitCameraToViewport() {
  const cam = solveFitCamera(getViewportCSS());
  camX = cam.camX; camY = cam.camY; camZoom = cam.camZoom;
}

// CSS size the camera was last laid against, so a resize can hold the same world
// point at the centre instead of pinning the scene to the top-left corner.
let _lastViewCSS = null;

function resizeCanvas() {
  const view = getViewportCSS();
  // DPR sizes the backing store only: the buffer gets `dpr` device pixels per CSS
  // pixel so the drawing stays sharp, while the CSS box — and therefore every
  // number the camera is built from — is unchanged. render() cancels this out
  // with a matching ctx.scale(dpr, dpr) before the camera transform, so the
  // logical scene is the same size at any DPR.
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(view.w * dpr);
  canvas.height = Math.round(view.h * dpr);
  canvas.style.width  = view.w + 'px';
  canvas.style.height = view.h + 'px';

  // Keep whatever was in the middle of the canvas in the middle of it. Zoom is
  // left alone — a resize is not a reason to overrule a camera the user chose —
  // and the first call has no previous frame to preserve.
  if (_lastViewCSS && (_lastViewCSS.w !== view.w || _lastViewCSS.h !== view.h) &&
      isFinite(camX) && isFinite(camY) && camZoom > 0) {
    const worldCx = (_lastViewCSS.w / 2 - camX) / camZoom;
    const worldCy = (_lastViewCSS.h / 2 - camY) / camZoom;
    camX = view.w / 2 - worldCx * camZoom;
    camY = view.h / 2 - worldCy * camZoom;
  }
  _lastViewCSS = view;

  invalidateCanvasRect();
  render();
}
window.addEventListener('resize', () => {
  invalidateCanvasRect();
  resizeCanvas();
});

// The app's initial framing has to be computed against the viewport that ends up
// on screen, and at the point engine.js runs that is not yet knowable. #canvas-wrap
// has *a* layout by then, but not its final one: the topbar logo and the sidebar
// artwork are still decoding, and the topbar settles ~25px shorter once they land.
// Framing against the pre-settle height left the canvas taller than its own
// wrapper — the bottom strip quietly clipped by overflow:hidden — and framed the
// schematic for a viewport that never existed. How long that settling takes is
// exactly the sort of thing that differs between one machine and the next, so it
// is not something to race with a timeout.
//
// engine.js hands its initial camera decision here; until the user takes the
// camera themselves, any change to the wrapper's box re-runs that decision against
// the real numbers. The decision recomputes from the saved payload and the content
// bounds rather than from the current camera, so running it again is not a second
// approximation — it is the same answer with the right inputs.
let _reframe = null;
function setInitialFraming(fn) { _reframe = fn; }
// Called the moment the camera becomes the user's: from here on the app never
// reframes on its own, which is the line between initial framing and a pan or
// zoom somebody chose.
function releaseInitialFraming() { _reframe = null; }

// A ResizeObserver catches every reason the drawing area can change size — an
// image landing, a font swapping, a breakpoint moving the sidebar — not just the
// window resizes the listener above sees.
if (window.ResizeObserver) {
  const wrapEl = document.getElementById('canvas-wrap');
  if (wrapEl) {
    new ResizeObserver(() => {
      const view = getViewportCSS();
      const dpr  = window.devicePixelRatio || 1;
      // Nothing actually moved. Re-cutting the buffer to the numbers it already
      // has would only risk feeding this observer its own output.
      if (_lastViewCSS && _lastViewCSS.w === view.w && _lastViewCSS.h === view.h &&
          canvas.width === Math.round(view.w * dpr)) return;
      invalidateCanvasRect();
      resizeCanvas();
      if (_reframe) { _reframe(); render(); }
    }).observe(wrapEl);
  }
}

// The camera stops being the app's to frame the first time the user does anything
// with the board. A pan or a zoom obviously counts, but so does placing a part:
// reframing the board around a component somebody just added would be its own kind
// of wrong. One capturing listener per input kind is the whole rule — every camera
// path in the app goes through the canvas, so there is nothing to keep in sync
// elsewhere. Releasing is idempotent, so these stay attached rather than firing
// once: a null assignment per input event is not worth the sharper edges of `once`.
['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(type => {
  canvas.addEventListener(type, releaseInitialFraming, { capture: true, passive: true });
});

// devicePixelRatio can change with no resize event behind it — the window dragged
// to a monitor with a different scale factor, or the OS scale factor changed under
// a window that keeps its CSS size. Only the backing store is stale in that case,
// so re-cut the buffer for sharpness and leave the camera alone. A resolution
// media query only fires for the ratio it was built with, so each change re-arms
// a query for the new one.
let _dprQuery = null;
function _onDevicePixelRatioChange() {
  resizeCanvas();
  watchDevicePixelRatio();
}
function watchDevicePixelRatio() {
  if (!window.matchMedia) return;
  if (_dprQuery && _dprQuery.removeEventListener) {
    _dprQuery.removeEventListener('change', _onDevicePixelRatioChange);
  }
  _dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  if (_dprQuery.addEventListener) _dprQuery.addEventListener('change', _onDevicePixelRatioChange);
}
watchDevicePixelRatio();

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
      const lines = commentLabelLines(cb, camZoom);   // also sets ctx.font to match
      ctx.fillStyle = '#222';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      const pad = 6 / camZoom;
      const iconW = 12 / camZoom;
      const lineH = 15 / camZoom;
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

