
// ── Ghost preview when placing a component ──
const GHOST_BASE_ALPHA = 0.4;
const GHOST_FADE_SECONDS = 0.18;   // full fade-out / fade-in time

// render() only runs on demand, so the fade drives its own rAF loop and stops
// as soon as ghostFade reaches its target.
let _ghostFadeRaf = null;
let _ghostFadeLast = 0;
function setGhostFadeTarget(visible) {
  const target = visible ? 1 : 0;
  if (ghostFadeTarget === target) return;
  ghostFadeTarget = target;
  if (_ghostFadeRaf !== null) return;   // loop already running — it reads the new target
  _ghostFadeLast = performance.now();
  const stepFade = (ts) => {
    const dt = Math.min((ts - _ghostFadeLast) / 1000, 0.1);  // cap after a backgrounded tab
    _ghostFadeLast = ts;
    const stepAmt = dt / GHOST_FADE_SECONDS;
    ghostFade = ghostFade < ghostFadeTarget
      ? Math.min(ghostFadeTarget, ghostFade + stepAmt)
      : Math.max(ghostFadeTarget, ghostFade - stepAmt);
    if (Math.abs(ghostFade - ghostFadeTarget) < 0.005) {
      ghostFade = ghostFadeTarget;
      _ghostFadeRaf = null;
      render();
      return;
    }
    render();
    _ghostFadeRaf = requestAnimationFrame(stepFade);
  };
  _ghostFadeRaf = requestAnimationFrame(stepFade);
}

function drawGhostComponent() {
  if (!isComponentTool(currentTool) || !hoveredNode) return;

  // Ghosts draw at 0.4 alpha, scaled by the sidebar-hover fade. Bail once it is
  // effectively invisible so a faded-out preview costs nothing per frame.
  const gAlpha = GHOST_BASE_ALPHA * ghostFade;
  if (gAlpha < 0.005) return;

  const size = COMP_SIZE[currentTool] || 2;
  const half = Math.floor(size / 2);

  const hx = hoveredNode.gx, hy = hoveredNode.gy;
  let { gx1, gy1, gx2, gy2 } = compCoords(hx, hy, size, placeRotation);

  if (currentTool === 'earth_ground') {
    const busGx = GROUND_BUS.earth.gx;
    drawOneComponent({ id: -1, type: currentTool, gx1: hx, gy1: hy, gx2: busGx, gy2: 0,
      props: JSON.parse(JSON.stringify(ComponentDefaults[currentTool])) }, gAlpha);
    return;
  }

  if (currentTool === 'contactor') {
    // Dual ghost: coil + contact
    const coilSize = COMP_SIZE['contactor_coil'];
    const cc = compCoords(hx, hy, coilSize, placeRotation);
    drawOneComponent({ id: -1, type: 'contactor_coil', gx1: cc.gx1, gy1: cc.gy1, gx2: cc.gx2, gy2: cc.gy2,
      props: JSON.parse(JSON.stringify(ComponentDefaults['contactor_coil'])) }, gAlpha);
    const contSize = COMP_SIZE['contactor_contact'];
    const isH = placeRotation % 2 === 0;
    const offset = 3;
    const tc = compCoords(isH ? hx : hx + offset, isH ? hy + offset : hy, contSize, placeRotation);
    drawOneComponent({ id: -2, type: 'contactor_contact', gx1: tc.gx1, gy1: tc.gy1, gx2: tc.gx2, gy2: tc.gy2,
      props: JSON.parse(JSON.stringify(ComponentDefaults['contactor_contact'])) }, gAlpha);
    return;
  }

  if (currentTool === 'dpdt') {
    // Dual ghost: two linked switches with dashed link showing grouping
    const swSize = COMP_SIZE['switch'];
    const sw1 = compCoords(hx, hy, swSize, placeRotation);
    drawOneComponent({ id: -1, type: 'switch', gx1: sw1.gx1, gy1: sw1.gy1, gx2: sw1.gx2, gy2: sw1.gy2,
      props: JSON.parse(JSON.stringify(ComponentDefaults['switch'])) }, gAlpha);
    const isH = placeRotation % 2 === 0;
    const offset = 1.5;
    const sw2 = compCoords(isH ? hx : hx + offset, isH ? hy + offset : hy, swSize, placeRotation);
    drawOneComponent({ id: -2, type: 'switch', gx1: sw2.gx1, gy1: sw2.gy1, gx2: sw2.gx2, gy2: sw2.gy2,
      props: JSON.parse(JSON.stringify(ComponentDefaults['switch'])) }, gAlpha);
    // Dashed link line between switches showing mechanical coupling
    const midX1 = ((sw1.gx1 + sw1.gx2) / 2) * GRID;
    const midY1 = ((sw1.gy1 + sw1.gy2) / 2) * GRID;
    const midX2 = ((sw2.gx1 + sw2.gx2) / 2) * GRID;
    const midY2 = ((sw2.gy1 + sw2.gy2) / 2) * GRID;
    ctx.save();
    ctx.globalAlpha = gAlpha;
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.5 / camZoom;
    ctx.setLineDash([4 / camZoom, 3 / camZoom]);
    ctx.beginPath(); ctx.moveTo(midX1, midY1); ctx.lineTo(midX2, midY2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }

  if (currentTool === 'relay') {
    // Dual ghost: coil + contact
    const coilSize = COMP_SIZE['relay_coil'];
    const cc = compCoords(hx, hy, coilSize, placeRotation);
    drawOneComponent({ id: -1, type: 'relay_coil', gx1: cc.gx1, gy1: cc.gy1, gx2: cc.gx2, gy2: cc.gy2,
      props: JSON.parse(JSON.stringify(ComponentDefaults['relay_coil'])) }, gAlpha);
    const contSize = COMP_SIZE['relay_contact'];
    const isH = placeRotation % 2 === 0;
    const offset = 3;
    const tc = compCoords(isH ? hx : hx + offset, isH ? hy + offset : hy, contSize, placeRotation);
    drawOneComponent({ id: -2, type: 'relay_contact', gx1: tc.gx1, gy1: tc.gy1, gx2: tc.gx2, gy2: tc.gy2,
      props: JSON.parse(JSON.stringify(ComponentDefaults['relay_contact'])) }, gAlpha);
    return;
  }

  const ghost = {
    id: -1, type: currentTool, gx1, gy1, gx2, gy2,
    props: JSON.parse(JSON.stringify(ComponentDefaults[currentTool]))
  };

  // Flip source polarity in ghost preview (swap terminals)
  if (placeFlipped && (isACSource(currentTool) || currentTool === 'dc_source')) {
    [ghost.gx1, ghost.gx2] = [ghost.gx2, ghost.gx1];
    [ghost.gy1, ghost.gy2] = [ghost.gy2, ghost.gy1];
  }

  // Transformer: 4 terminals
  if (currentTool === 'transformer') {
    const tSpread = 0.5;
    const isVert = placeRotation % 2 === 1;
    const a = compCoords(hx, hy, size, placeRotation);
    if (!isVert) {
      ghost.gx1 = a.gx1; ghost.gy1 = hy - tSpread; ghost.gx2 = a.gx1; ghost.gy2 = hy + tSpread;
      ghost.gx3 = a.gx2; ghost.gy3 = hy - tSpread; ghost.gx4 = a.gx2; ghost.gy4 = hy + tSpread;
    } else {
      ghost.gx1 = hx - tSpread; ghost.gy1 = a.gy1; ghost.gx2 = hx + tSpread; ghost.gy2 = a.gy1;
      ghost.gx3 = hx - tSpread; ghost.gy3 = a.gy2; ghost.gx4 = hx + tSpread; ghost.gy4 = a.gy2;
    }
  }

  // ac_480: 3 terminals at 90° intervals — L1(left), L2(top), L3(right)
  if (currentTool === 'ac_480') {
    if (placeRotation % 2 === 0) {
      ghost.gx1 = hx - 0.5; ghost.gy1 = hy;           // L1 (left)
      ghost.gx2 = hx;       ghost.gy2 = hy - 0.5;     // L2 (top)
      ghost.gx3 = hx + 0.5; ghost.gy3 = hy;           // L3 (right)
    } else {
      ghost.gx1 = hx;       ghost.gy1 = hy - 0.5;     // L1 (top)
      ghost.gx2 = hx + 0.5; ghost.gy2 = hy;           // L2 (right)
      ghost.gx3 = hx;       ghost.gy3 = hy + 0.5;     // L3 (bottom)
    }
  }

  // ac_480_wye: 4 terminals at 90° intervals — L1(left), L2(top), L3(right), N(bottom)
  if (currentTool === 'ac_480_wye') {
    if (placeRotation % 2 === 0) {
      ghost.gx1 = hx - 0.5; ghost.gy1 = hy;           // L1 (left)
      ghost.gx2 = hx;       ghost.gy2 = hy - 0.5;     // L2 (top)
      ghost.gx3 = hx + 0.5; ghost.gy3 = hy;           // L3 (right)
      ghost.gx4 = hx;       ghost.gy4 = hy + 0.5;     // N (bottom)
    } else {
      ghost.gx1 = hx;       ghost.gy1 = hy - 0.5;     // L1 (top)
      ghost.gx2 = hx + 0.5; ghost.gy2 = hy;           // L2 (right)
      ghost.gx3 = hx;       ghost.gy3 = hy + 0.5;     // L3 (bottom)
      ghost.gx4 = hx - 0.5; ghost.gy4 = hy;           // N (left)
    }
  }

  // Compressor: 3 terminals — R(top-left), S(bottom-left), C(right)
  if (currentTool === 'compressor') {
    const tSpread = 0.5;
    const isVert = placeRotation % 2 === 1;
    const a = compCoords(hx, hy, size, placeRotation);
    if (!isVert) {
      ghost.gx1 = a.gx2; ghost.gy1 = hy;              // C (right, center)
      ghost.gx2 = a.gx1; ghost.gy2 = hy - tSpread;    // R (left, top)
      ghost.gx3 = a.gx1; ghost.gy3 = hy + tSpread;    // S (left, bottom)
    } else {
      ghost.gx1 = hx;              ghost.gy1 = a.gy2;  // C (bottom, center)
      ghost.gx2 = hx - tSpread;    ghost.gy2 = a.gy1;  // R (top, left)
      ghost.gx3 = hx + tSpread;    ghost.gy3 = a.gy1;  // S (top, right)
    }
  }

  drawOneComponent(ghost, gAlpha);
}

// ── Wire preview ──
function drawWirePreview() {
  if (currentTool === 'wire' && wireStart && hoveredNode) {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2.5 / camZoom;
    ctx.setLineDash([6 / camZoom, 4 / camZoom]);
    ctx.beginPath();
    ctx.moveTo(wireStart.gx * GRID, wireStart.gy * GRID);
    ctx.lineTo(hoveredNode.gx * GRID, hoveredNode.gy * GRID);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawHoveredNode() {
  if (!hoveredNode) return;
  if (meterActive) return;
  if (currentTool === 'select') return;
  // Rides the same sidebar fade as the ghost — otherwise fading the preview out
  // leaves this ring behind as a stray dot on an empty board.
  if (ghostFade < 0.005) return;
  ctx.save();
  ctx.globalAlpha = ghostFade;
  ctx.strokeStyle = '#cc8800';
  ctx.lineWidth = 1.5 / camZoom;
  ctx.beginPath();
  ctx.arc(hoveredNode.gx * GRID, hoveredNode.gy * GRID, 5 / camZoom, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawBoxSelect() {
  // Draw selection rectangle
  if (boxSelectStart && boxSelectEnd) {
    const x1 = Math.min(boxSelectStart.x, boxSelectEnd.x);
    const y1 = Math.min(boxSelectStart.y, boxSelectEnd.y);
    const w = Math.abs(boxSelectEnd.x - boxSelectStart.x);
    const h = Math.abs(boxSelectEnd.y - boxSelectStart.y);
    ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
    ctx.fillRect(x1, y1, w, h);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1 / camZoom;
    ctx.setLineDash([4 / camZoom, 3 / camZoom]);
    ctx.strokeRect(x1, y1, w, h);
    ctx.setLineDash([]);
  }
  // Highlight multi-selected items
  if (multiSelected.length > 0) {
    for (const sel of multiSelected) {
      if (sel.kind === 'component') {
        const c = components.find(comp => comp.id === sel.id);
        if (!c) continue;
        const mx = (c.type === 'earth_ground') ? c.gx1 * GRID : (c.gx1 + c.gx2) / 2 * GRID;
        const my = (c.type === 'earth_ground') ? c.gy1 * GRID : (c.gy1 + c.gy2) / 2 * GRID;
        const pad = 20;
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2 / camZoom;
        ctx.setLineDash([4 / camZoom, 3 / camZoom]);
        ctx.strokeRect(mx - pad, my - pad, pad * 2, pad * 2);
        ctx.setLineDash([]);
      } else if (sel.kind === 'wire') {
        const w = wires.find(wr => wr.id === sel.id);
        if (!w) continue;
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 4 / camZoom;
        ctx.beginPath();
        ctx.moveTo(w.gx1 * GRID, w.gy1 * GRID);
        ctx.lineTo(w.gx2 * GRID, w.gy2 * GRID);
        ctx.stroke();
      } else if (sel.kind === 'comment') {
        const cb = commentBoxes.find(c => c.id === sel.id);
        if (!cb) continue;
        const bx = Math.min(cb.x1, cb.x2), by = Math.min(cb.y1, cb.y2);
        const bw = Math.abs(cb.x2 - cb.x1), bh = Math.abs(cb.y2 - cb.y1);
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2 / camZoom;
        ctx.setLineDash([4 / camZoom, 3 / camZoom]);
        ctx.strokeRect(bx - 3, by - 3, bw + 6, bh + 6);
        ctx.setLineDash([]);
      }
    }
  }
}

function getItemsInBox(x1, y1, x2, y2) {
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  const items = [];
  for (const c of components) {
    const cx = (c.type === 'earth_ground') ? c.gx1 * GRID : (c.gx1 + c.gx2) / 2 * GRID;
    const cy = (c.type === 'earth_ground') ? c.gy1 * GRID : (c.gy1 + c.gy2) / 2 * GRID;
    if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
      items.push({ kind: 'component', id: c.id });
    }
  }
  for (const w of wires) {
    const wx1 = w.gx1 * GRID, wy1 = w.gy1 * GRID;
    const wx2 = w.gx2 * GRID, wy2 = w.gy2 * GRID;
    const wmx = (wx1 + wx2) / 2, wmy = (wy1 + wy2) / 2;
    if (wmx >= minX && wmx <= maxX && wmy >= minY && wmy <= maxY) {
      items.push({ kind: 'wire', id: w.id });
    }
  }
  for (const cb of commentBoxes) {
    const cbcx = (cb.x1 + cb.x2) / 2, cbcy = (cb.y1 + cb.y2) / 2;
    if (cbcx >= minX && cbcx <= maxX && cbcy >= minY && cbcy <= maxY) {
      items.push({ kind: 'comment', id: cb.id });
    }
  }
  return items;
}

function countConnections(gx, gy) {
  let n = 0;
  for (const w of wires)
    if ((w.gx1 === gx && w.gy1 === gy) || (w.gx2 === gx && w.gy2 === gy)) n++;
  for (const c of components) {
    if ((c.gx1 === gx && c.gy1 === gy) || (c.gx2 === gx && c.gy2 === gy)) n++;
    if (c.type === 'transformer' && c.gx3 !== undefined)
      if ((c.gx3 === gx && c.gy3 === gy) || (c.gx4 === gx && c.gy4 === gy)) n++;
    if (c.type === 'compressor' && c.gx3 !== undefined)
      if (c.gx3 === gx && c.gy3 === gy) n++;
  }
  return n;
}

function isComponentTool(t) {
  return ['ac_source', 'ac_120', 'ac_240', 'ac_480', 'ac_480_wye', 'dc_source', 'resistor', 'bulb', 'switch', 'fuse', 'lv_fuse', 'td_fuse', 'fan', 'breaker', 'transformer', 'time_delay', 'contactor', 'capacitor', 'outlet', 'relay', 'earth_ground', 'compressor', 'dpdt'].includes(t);
}

// ═══════════════════════════════════════════════════════════════
//  INPUT HANDLING
// ═══════════════════════════════════════════════════════════════
canvas.addEventListener('mousedown', onMouseDown);
canvas.addEventListener('mousemove', onMouseMove);
// mouseup on document so releasing over a panel/modal still clears drag/pan state
document.addEventListener('mouseup', onMouseUp);
canvas.addEventListener('wheel', onWheel, { passive: false });
// Prevent browser zoom (Ctrl+scroll / trackpad pinch) anywhere on the page —
// tool panels are HTML overlays so their wheel events bypass the canvas handler
document.addEventListener('wheel', e => {
  if (e.ctrlKey || e.metaKey) e.preventDefault();
}, { passive: false });
canvas.addEventListener('contextmenu', onContextMenu);

// Fade the placement ghost out while the pointer is over the left component
// menu. hoveredNode keeps its last canvas value there (it has to — the ghost
// must reappear where it was when the pointer comes back), so without this the
// preview just sits on the board while the user reads the menu.
// mouseenter/mouseleave only, so an iPad touch never leaves the ghost hidden.
const _sidebarEl = document.getElementById('sidebar');
if (_sidebarEl) {
  _sidebarEl.addEventListener('mouseenter', () => setGhostFadeTarget(false));
  _sidebarEl.addEventListener('mouseleave', () => setGhostFadeTarget(true));
}
canvas.addEventListener('dblclick', (e) => {
  if (currentTool !== 'select') return;
  const { sx, sy } = canvasMousePos(e);
  const { x, y } = screenToWorld(sx, sy);
  const hit = hitTest(x, y);
  if (hit && hit.kind === 'wire') {
    const w = wires.find(wr => wr.id === hit.id);
    if (w) showWirePropsPanel(w);
  }
  if (hit && hit.kind === 'comment') {
    const cb = commentBoxes.find(c => c.id === hit.id);
    if (cb) {
      showCommentEditor(cb, false);
    }
  }
});
document.addEventListener('click', () => hideContextMenu());

function onMouseDown(e) {
  hideContextMenu();
  // Touch has no mousemove before the tap, so restore the preview here too —
  // otherwise a sidebar tap on iPad could leave the ghost faded out.
  setGhostFadeTarget(true);
  const { sx, sy } = canvasMousePos(e);
  const { x, y } = screenToWorld(sx, sy);
  const g = snapToGrid(x, y);

  // Pan: middle click or Alt+click
  if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
    isPanning = true;
    didPan = false;
    panStart = { sx, sy, cx: camX, cy: camY };
    return;
  }
  if (e.button !== 0) return;

  if (currentTool === 'select') {
  }

  // ── Comment tool: click-drag to draw box ──
  if (currentTool === 'comment') {
    if (editLocked()) return;
    commentDrawStart = { x, y };
    commentDrawEnd = { x, y };
    render();
    return;
  }

  // ── Wire tool: click to set start point, click again to drop the wire and finish ──
  if (currentTool === 'wire') {
    if (editLocked()) { wireStart = null; render(); return; }
    if (!wireStart) {
      wireStart = g;
    } else {
      if (g.gx !== wireStart.gx || g.gy !== wireStart.gy) {
        addWire(wireStart.gx, wireStart.gy, g.gx, g.gy);
      }
      wireStart = null; // second click always ends the wire
    }
    render();
    return;
  }

  // ── Select tool ──
  if (currentTool === 'select') {
    // Check if clicking on a data box first (for dragging)
    for (let i = renderedDataBoxes.length - 1; i >= 0; i--) {
      const db = renderedDataBoxes[i];
      if (x >= db.x && x <= db.x + db.w && y >= db.y && y <= db.y + db.h) {
        const comp = components.find(c => c.id === db.compId);
        if (comp) {
          const _boxKeyMap = { pri: 'priDataBoxOffset', sec: 'secDataBoxOffset', c: 'cDataBoxOffset', r: 'rDataBoxOffset', s: 'sDataBoxOffset' };
          const offsetProp = _boxKeyMap[db.boxKey] || 'dataBoxOffset';
          if (!comp[offsetProp]) comp[offsetProp] = { x: 0, y: 0 };
          draggingDataBox = {
            compId: db.compId, boxKey: db.boxKey, offsetProp,
            startOx: comp[offsetProp].x, startOy: comp[offsetProp].y,
            mouseStartX: x, mouseStartY: y
          };
          return;
        }
      }
    }

    // Check for comment box resize handles (corners + edges)
    if (selectedItem && selectedItem.kind === 'comment') {
      const cb = commentBoxes.find(c => c.id === selectedItem.id);
      if (cb) {
        const bx = Math.min(cb.x1, cb.x2), by = Math.min(cb.y1, cb.y2);
        const bw = Math.abs(cb.x2 - cb.x1), bh = Math.abs(cb.y2 - cb.y1);
        const hs = 14 / camZoom;
        const handle = getCommentResizeHandle(x, y, bx, by, bw, bh, hs);
        if (handle) {
          resizingComment = { cb, corner: handle, origX1: cb.x1, origY1: cb.y1, origX2: cb.x2, origY2: cb.y2, mouseStartX: x, mouseStartY: y };
          return;
        }
      }
    }

    const hit = hitTest(x, y);
    if (hit) {
      // Check if clicking on an already multi-selected item → start multi-drag
      const isInMulti = multiSelected.some(s => s.kind === hit.kind && s.id === hit.id);
      if (isInMulti && multiSelected.length > 1) {
        // Start dragging all multi-selected items
        const origPositions = [];
        for (const sel of multiSelected) {
          if (sel.kind === 'component') {
            const c = components.find(comp => comp.id === sel.id);
            if (c) origPositions.push({ kind: 'component', id: c.id, gx1: c.gx1, gy1: c.gy1, gx2: c.gx2, gy2: c.gy2, gx3: c.gx3, gy3: c.gy3, gx4: c.gx4, gy4: c.gy4 });
          } else if (sel.kind === 'wire') {
            const w = wires.find(wr => wr.id === sel.id);
            if (w) origPositions.push({ kind: 'wire', id: w.id, gx1: w.gx1, gy1: w.gy1, gx2: w.gx2, gy2: w.gy2 });
          } else if (sel.kind === 'comment') {
            const cb = commentBoxes.find(c => c.id === sel.id);
            if (cb) origPositions.push({ kind: 'comment', id: cb.id, x1: cb.x1, y1: cb.y1, x2: cb.x2, y2: cb.y2 });
          }
        }
        if (!editLocked()) {
          draggingMulti = { startGx: g.gx, startGy: g.gy, origPositions };
        }
        render();
        return;
      }

      selectedItem = hit;
      multiSelected = [];
      // Allow click-to-toggle on switches/breakers even when energized (but not drag)
      const _hitComp = hit.kind === 'component' ? components.find(c => c.id === hit.id) : null;
      const _isTogglable = _hitComp && ['switch','time_delay','breaker','fuse','lv_fuse','td_fuse'].includes(_hitComp.type);
      if (hit.kind === 'component' && simRunning && !_isTogglable) {
        showCautionToast();
      }
      if (hit.kind === 'component' && (!simRunning || _isTogglable)) {
        const c = components.find(c => c.id === hit.id);
        if (c) {
          // Capture which wires are connected NOW (before dragging)
          const connectedWireIds = new Set();
          for (const w of wires) {
            if ((w.gx1 === c.gx1 && w.gy1 === c.gy1) || (w.gx2 === c.gx1 && w.gy2 === c.gy1) ||
                (w.gx1 === c.gx2 && w.gy1 === c.gy2) || (w.gx2 === c.gx2 && w.gy2 === c.gy2)) {
              connectedWireIds.add(w.id);
            }
            if (c.gx3 !== undefined) {
              if ((w.gx1 === c.gx3 && w.gy1 === c.gy3) || (w.gx2 === c.gx3 && w.gy2 === c.gy3) ||
                  (w.gx1 === c.gx4 && w.gy1 === c.gy4) || (w.gx2 === c.gx4 && w.gy2 === c.gy4)) {
                connectedWireIds.add(w.id);
              }
            }
          }
          dragging = {
            comp: c,
            origGx1: c.gx1, origGy1: c.gy1,
            origGx2: c.gx2, origGy2: c.gy2,
            startGx1: c.gx1, startGy1: c.gy1,
            startGx2: c.gx2, startGy2: c.gy2,
            startGx3: c.gx3, startGy3: c.gy3,
            startGx4: c.gx4, startGy4: c.gy4,
            connectedWireIds
          };
          dragStartMouse = { gx: g.gx, gy: g.gy };
        }
      }
      if (hit.kind === 'comment') {
        const cb = commentBoxes.find(c => c.id === hit.id);
        if (cb) {
          dragging = {
            comment: cb,
            origX1: cb.x1, origY1: cb.y1, origX2: cb.x2, origY2: cb.y2,
            mouseStartX: x, mouseStartY: y
          };
        }
      }
    } else {
      // Start box select on empty space
      selectedItem = null;
      multiSelected = [];
      dragging = null;
      hidePropsPanel();
      boxSelectStart = { x, y };
      boxSelectEnd = { x, y };
    }
    render();
    return;
  }

  // ── Component placement: single click to place ──
  if (isComponentTool(currentTool)) {
    if (editLocked()) return;
    const size = COMP_SIZE[currentTool] || 2;
    const half = Math.floor(size / 2);

    const hx = g.gx, hy = g.gy;
    let { gx1, gy1, gx2, gy2 } = compCoords(hx, hy, size, placeRotation);

    if (currentTool === 'transformer') {
      const tSpread = 0.5;
      const isVert = placeRotation % 2 === 1;
      const a = compCoords(hx, hy, size, placeRotation);
      let t;
      if (!isVert) {
        t = { gx1: a.gx1, gy1: hy - tSpread, gx2: a.gx1, gy2: hy + tSpread,
              gx3: a.gx2, gy3: hy - tSpread, gx4: a.gx2, gy4: hy + tSpread };
      } else {
        t = { gx1: hx - tSpread, gy1: a.gy1, gx2: hx + tSpread, gy2: a.gy1,
              gx3: hx - tSpread, gy3: a.gy2, gx4: hx + tSpread, gy4: a.gy2 };
      }
      addComponent(currentTool, t.gx1, t.gy1, t.gx2, t.gy2, t.gx3, t.gy3, t.gx4, t.gy4);
    } else if (currentTool === 'contactor') {
      const grp = nextContactorGroup();
      const coilSize = COMP_SIZE['contactor_coil'];
      const cc = compCoords(hx, hy, coilSize, placeRotation);
      const coil = addComponent('contactor_coil', cc.gx1, cc.gy1, cc.gx2, cc.gy2);
      if (coil) coil.props.contactorGroup = grp;
      const contSize = COMP_SIZE['contactor_contact'];
      const isH = placeRotation % 2 === 0;
      const offset = 3;
      const tc = compCoords(isH ? hx : hx + offset, isH ? hy + offset : hy, contSize, placeRotation);
      const contact = addComponent('contactor_contact', tc.gx1, tc.gy1, tc.gx2, tc.gy2);
      if (contact) contact.props.contactorGroup = grp;
    } else if (currentTool === 'relay') {
      const grp = nextRelayGroup();
      const coilSize = COMP_SIZE['relay_coil'];
      const cc = compCoords(hx, hy, coilSize, placeRotation);
      const coil = addComponent('relay_coil', cc.gx1, cc.gy1, cc.gx2, cc.gy2);
      if (coil) coil.props.relayGroup = grp;
      const contSize = COMP_SIZE['relay_contact'];
      const isH = placeRotation % 2 === 0;
      const offset = 3;
      const tc = compCoords(isH ? hx : hx + offset, isH ? hy + offset : hy, contSize, placeRotation);
      const contact = addComponent('relay_contact', tc.gx1, tc.gy1, tc.gx2, tc.gy2);
      if (contact) contact.props.relayGroup = grp;
    } else if (currentTool === 'dpdt') {
      const grp = nextSwitchGroup();
      const swSize = COMP_SIZE['switch'];
      const sw1c = compCoords(hx, hy, swSize, placeRotation);
      const sw1 = addComponent('switch', sw1c.gx1, sw1c.gy1, sw1c.gx2, sw1c.gy2);
      if (sw1) { sw1.props.switchGroup = grp; sw1.props.label = 'DPDT Pole 1'; }
      const isH = placeRotation % 2 === 0;
      const offset = 1.5;
      const sw2c = compCoords(isH ? hx : hx + offset, isH ? hy + offset : hy, swSize, placeRotation);
      const sw2 = addComponent('switch', sw2c.gx1, sw2c.gy1, sw2c.gx2, sw2c.gy2);
      if (sw2) { sw2.props.switchGroup = grp; sw2.props.label = 'DPDT Pole 2'; }
    } else if (currentTool === 'ac_480') {
      // 3-terminal source: L1(left), L2(top), L3(right) at 90° intervals
      if (placeRotation % 2 === 0) {
        addComponent(currentTool, hx - 0.5, hy, hx, hy - 0.5, hx + 0.5, hy);
      } else {
        addComponent(currentTool, hx, hy - 0.5, hx + 0.5, hy, hx, hy + 0.5);
      }
    } else if (currentTool === 'ac_480_wye') {
      // 4-terminal wye: L1(left), L2(top), L3(right), N(bottom) at 90° intervals
      if (placeRotation % 2 === 0) {
        addComponent(currentTool, hx - 0.5, hy, hx, hy - 0.5, hx + 0.5, hy, hx, hy + 0.5);
      } else {
        addComponent(currentTool, hx, hy - 0.5, hx + 0.5, hy, hx, hy + 0.5, hx - 0.5, hy);
      }
    } else if (currentTool === 'compressor') {
      const tSpread = 0.5;
      const isVert = placeRotation % 2 === 1;
      const a = compCoords(hx, hy, size, placeRotation);
      let t;
      if (!isVert) {
        t = { gx1: a.gx2, gy1: hy, gx2: a.gx1, gy2: hy - tSpread, gx3: a.gx1, gy3: hy + tSpread };
      } else {
        t = { gx1: hx, gy1: a.gy2, gx2: hx - tSpread, gy2: a.gy1, gx3: hx + tSpread, gy3: a.gy1 };
      }
      addComponent(currentTool, t.gx1, t.gy1, t.gx2, t.gy2, t.gx3, t.gy3);
    } else if (currentTool === 'earth_ground') {
      // Place at click position; gx2,gy2 = virtual bus (constant — not visible)
      addComponent(currentTool, hx, hy, GROUND_BUS.earth.gx, GROUND_BUS.earth.gy);
    } else {
      // Apply flip for source polarity
      if (placeFlipped && (isACSource(currentTool) || currentTool === 'dc_source')) {
        addComponent(currentTool, gx2, gy2, gx1, gy1);
      } else {
        addComponent(currentTool, gx1, gy1, gx2, gy2);
      }
    }
    render();
    return;
  }
}

function onMouseMove(e) {
  const { sx, sy } = canvasMousePos(e);
  if (isPanning) {
    const dx = sx - panStart.sx, dy = sy - panStart.sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPan = true;
    camX = panStart.cx + dx;
    camY = panStart.cy + dy;
    scheduleRender();
    return;
  }
  const { x, y } = screenToWorld(sx, sy);
  hoveredNode = snapToGrid(x, y);
  setGhostFadeTarget(true);   // no-op unless the sidebar faded it out

  // Resize comment box
  if (resizingComment) {
    const dx = x - resizingComment.mouseStartX;
    const dy = y - resizingComment.mouseStartY;
    const rc = resizingComment;
    const cb = rc.cb;
    // Determine which coordinates to adjust based on corner
    // x1,y1 is one corner, x2,y2 is the opposite
    const minX = Math.min(rc.origX1, rc.origX2), maxX = Math.max(rc.origX1, rc.origX2);
    const minY = Math.min(rc.origY1, rc.origY2), maxY = Math.max(rc.origY1, rc.origY2);
    if (rc.corner === 'tl') { cb.x1 = minX + dx; cb.y1 = minY + dy; cb.x2 = maxX; cb.y2 = maxY; }
    else if (rc.corner === 'tr') { cb.x1 = minX; cb.y1 = minY + dy; cb.x2 = maxX + dx; cb.y2 = maxY; }
    else if (rc.corner === 'bl') { cb.x1 = minX + dx; cb.y1 = minY; cb.x2 = maxX; cb.y2 = maxY + dy; }
    else if (rc.corner === 'br') { cb.x1 = minX; cb.y1 = minY; cb.x2 = maxX + dx; cb.y2 = maxY + dy; }
    else if (rc.corner === 't') { cb.x1 = minX; cb.y1 = minY + dy; cb.x2 = maxX; cb.y2 = maxY; }
    else if (rc.corner === 'b') { cb.x1 = minX; cb.y1 = minY; cb.x2 = maxX; cb.y2 = maxY + dy; }
    else if (rc.corner === 'l') { cb.x1 = minX + dx; cb.y1 = minY; cb.x2 = maxX; cb.y2 = maxY; }
    else if (rc.corner === 'r') { cb.x1 = minX; cb.y1 = minY; cb.x2 = maxX + dx; cb.y2 = maxY; }
    scheduleRender();
    return;
  }

  // Comment box drag
  if (commentDrawStart) {
    commentDrawEnd = { x, y };
    scheduleRender();
    return;
  }

  // Box select drag
  if (boxSelectStart) {
    boxSelectEnd = { x, y };
    scheduleRender();
    return;
  }

  // Multi-drag
  if (draggingMulti) {
    const dgx = hoveredNode.gx - draggingMulti.startGx;
    const dgy = hoveredNode.gy - draggingMulti.startGy;
    if (dgx !== 0 || dgy !== 0) {
      for (const orig of draggingMulti.origPositions) {
        if (orig.kind === 'component') {
          const c = components.find(comp => comp.id === orig.id);
          if (!c) continue;
          c.gx1 = orig.gx1 + dgx; c.gy1 = orig.gy1 + dgy;
          if (c.type !== 'earth_ground') {
            c.gx2 = orig.gx2 + dgx; c.gy2 = orig.gy2 + dgy;
          }
          if (c.type === 'transformer' && orig.gx3 !== undefined) {
            c.gx3 = orig.gx3 + dgx; c.gy3 = orig.gy3 + dgy;
            c.gx4 = orig.gx4 + dgx; c.gy4 = orig.gy4 + dgy;
          }
          if (c.type === 'compressor' && orig.gx3 !== undefined) {
            c.gx3 = orig.gx3 + dgx; c.gy3 = orig.gy3 + dgy;
          }
        } else if (orig.kind === 'wire') {
          const w = wires.find(wr => wr.id === orig.id);
          if (!w) continue;
          w.gx1 = orig.gx1 + dgx; w.gy1 = orig.gy1 + dgy;
          w.gx2 = orig.gx2 + dgx; w.gy2 = orig.gy2 + dgy;
        } else if (orig.kind === 'comment') {
          const cb = commentBoxes.find(c => c.id === orig.id);
          if (!cb) continue;
          cb.x1 = orig.x1 + dgx * GRID; cb.y1 = orig.y1 + dgy * GRID;
          cb.x2 = orig.x2 + dgx * GRID; cb.y2 = orig.y2 + dgy * GRID;
        }
      }
      scheduleRender();
    }
    return;
  }

  // Drag comment box
  if (dragging && dragging.comment) {
    const dx = x - dragging.mouseStartX;
    const dy = y - dragging.mouseStartY;
    dragging.comment.x1 = dragging.origX1 + dx;
    dragging.comment.y1 = dragging.origY1 + dy;
    dragging.comment.x2 = dragging.origX2 + dx;
    dragging.comment.y2 = dragging.origY2 + dy;
    scheduleRender();
    return;
  }

  // Drag data box
  if (draggingDataBox) {
    const comp = components.find(c => c.id === draggingDataBox.compId);
    if (comp) {
      const dx = x - draggingDataBox.mouseStartX;
      const dy = y - draggingDataBox.mouseStartY;
      if (!comp[draggingDataBox.offsetProp]) comp[draggingDataBox.offsetProp] = { x: 0, y: 0 };
      comp[draggingDataBox.offsetProp].x = draggingDataBox.startOx + dx;
      comp[draggingDataBox.offsetProp].y = draggingDataBox.startOy + dy;
      scheduleRender();
    }
    return;
  }

  // Drag component (blocked when sim is running — only click-toggle is allowed)
  if (dragging && dragStartMouse && simRunning) {
    showCautionToast();
  }
  if (dragging && dragStartMouse && !simRunning) {
    const dgx = hoveredNode.gx - dragStartMouse.gx;
    const dgy = hoveredNode.gy - dragStartMouse.gy;
    if (dgx !== 0 || dgy !== 0) {
      const c = dragging.comp;
      const oldGx1 = c.gx1, oldGy1 = c.gy1, oldGx2 = c.gx2, oldGy2 = c.gy2;
      const oldGx3 = c.gx3, oldGy3 = c.gy3, oldGx4 = c.gx4, oldGy4 = c.gy4;
      c.gx1 = dragging.startGx1 + dgx;
      c.gy1 = dragging.startGy1 + dgy;
      if (c.type !== 'earth_ground') {
        c.gx2 = dragging.startGx2 + dgx;
        c.gy2 = dragging.startGy2 + dgy;
      }
      if ((c.type === 'transformer' || c.type === 'ac_480_wye') && c.gx3 !== undefined) {
        c.gx3 = dragging.startGx3 + dgx;
        c.gy3 = dragging.startGy3 + dgy;
        c.gx4 = dragging.startGx4 + dgx;
        c.gy4 = dragging.startGy4 + dgy;
      }
      if ((c.type === 'compressor' || c.type === 'ac_480') && c.gx3 !== undefined) {
        c.gx3 = dragging.startGx3 + dgx;
        c.gy3 = dragging.startGy3 + dgy;
      }
      // Move only wires that were connected at drag start
      for (const w of wires) {
        if (!dragging.connectedWireIds || !dragging.connectedWireIds.has(w.id)) continue;
        if (w.gx1 === oldGx1 && w.gy1 === oldGy1) { w.gx1 = c.gx1; w.gy1 = c.gy1; }
        if (w.gx2 === oldGx1 && w.gy2 === oldGy1) { w.gx2 = c.gx1; w.gy2 = c.gy1; }
        if (w.gx1 === oldGx2 && w.gy1 === oldGy2) { w.gx1 = c.gx2; w.gy1 = c.gy2; }
        if (w.gx2 === oldGx2 && w.gy2 === oldGy2) { w.gx2 = c.gx2; w.gy2 = c.gy2; }
        if (oldGx3 !== undefined) {
          if (w.gx1 === oldGx3 && w.gy1 === oldGy3) { w.gx1 = c.gx3; w.gy1 = c.gy3; }
          if (w.gx2 === oldGx3 && w.gy2 === oldGy3) { w.gx2 = c.gx3; w.gy2 = c.gy3; }
          if (w.gx1 === oldGx4 && w.gy1 === oldGy4) { w.gx1 = c.gx4; w.gy1 = c.gy4; }
          if (w.gx2 === oldGx4 && w.gy2 === oldGy4) { w.gx2 = c.gx4; w.gy2 = c.gy4; }
        }
      }
      // Update start positions for next move delta
      dragging.startGx1 = c.gx1; dragging.startGy1 = c.gy1;
      dragging.startGx2 = c.gx2; dragging.startGy2 = c.gy2;
      if ((c.type === 'transformer' || c.type === 'ac_480_wye') && c.gx3 !== undefined) {
        dragging.startGx3 = c.gx3; dragging.startGy3 = c.gy3;
        dragging.startGx4 = c.gx4; dragging.startGy4 = c.gy4;
      }
      if ((c.type === 'compressor' || c.type === 'ac_480') && c.gx3 !== undefined) {
        dragging.startGx3 = c.gx3; dragging.startGy3 = c.gy3;
      }
      dragStartMouse = { gx: hoveredNode.gx, gy: hoveredNode.gy };
    }
  }

  updateStatus(hoveredNode);

  // Show/hide ghost info
  const ghostEl = document.getElementById('ghost-info');
  ghostEl.classList.toggle('visible', isComponentTool(currentTool));

  // Update cursor for comment box resize handles
  let cursorSet = false;
  if (currentTool === 'select' && selectedItem && selectedItem.kind === 'comment') {
    const cb = commentBoxes.find(c => c.id === selectedItem.id);
    if (cb) {
      const bx = Math.min(cb.x1, cb.x2), by = Math.min(cb.y1, cb.y2);
      const bw = Math.abs(cb.x2 - cb.x1), bh = Math.abs(cb.y2 - cb.y1);
      const hs = 14 / camZoom;
      const handle = getCommentResizeHandle(x, y, bx, by, bw, bh, hs);
      if (handle) {
        const cursors = { tl: 'nwse-resize', br: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize',
                          t: 'ns-resize', b: 'ns-resize', l: 'ew-resize', r: 'ew-resize' };
        canvas.style.cursor = cursors[handle] || 'default';
        cursorSet = true;
      }
    }
  }
  if (resizingComment) { cursorSet = true; } // keep resize cursor during drag
  if (!cursorSet) canvas.style.cursor = currentTool === 'select' ? 'default' : 'crosshair';

  scheduleRender();
}

function onMouseUp(e) {
  if (isPanning) { isPanning = false; autoSave(); return; }

  // End comment box resize
  if (resizingComment) {
    resizingComment = null;
    autoSave();
    render();
    return;
  }

  // End comment box drawing
  if (commentDrawStart) {
    const { x, y } = screenToWorld(canvasMousePos(e).sx, canvasMousePos(e).sy);
    commentDrawEnd = { x, y };
    const w = Math.abs(commentDrawEnd.x - commentDrawStart.x);
    const h = Math.abs(commentDrawEnd.y - commentDrawStart.y);
    if (w > 10 && h > 10) {
      const cb = {
        id: nextId++,
        x1: commentDrawStart.x, y1: commentDrawStart.y,
        x2: commentDrawEnd.x, y2: commentDrawEnd.y,
        text: '',
        colorIndex: commentBoxes.length % 7 // 7 swatches are offered in the editor
      };
      commentBoxes.push(cb);
      commentDrawStart = null;
      commentDrawEnd = null;
      render();
      showCommentEditor(cb, true);
      return;
    }
    commentDrawStart = null;
    commentDrawEnd = null;
    render();
    return;
  }

  // End box select
  if (boxSelectStart) {
    const { x, y } = screenToWorld(canvasMousePos(e).sx, canvasMousePos(e).sy);
    boxSelectEnd = { x, y };
    multiSelected = getItemsInBox(boxSelectStart.x, boxSelectStart.y, boxSelectEnd.x, boxSelectEnd.y);
    boxSelectStart = null;
    boxSelectEnd = null;
    if (multiSelected.length === 1) {
      selectedItem = multiSelected[0];
      multiSelected = [];
    } else if (multiSelected.length === 0) {
      selectedItem = null;
    }
    render();
    return;
  }

  // End multi-drag
  if (draggingMulti) {
    draggingMulti = null;
    autoSave();
    if (simRunning) solveCircuit();
    render();
    return;
  }

  // End data box drag
  if (draggingDataBox) {
    draggingDataBox = null;
    autoSave();
    render();
    return;
  }

  // End comment box drag
  if (dragging && dragging.comment) {
    dragging = null;
    autoSave();
    render();
    return;
  }

  // End component drag
  if (dragging) {
    const c = dragging.comp;
    if (!c) { dragging = null; dragStartMouse = null; return; }
    const wasDragged = c.gx1 !== dragging.origGx1 || c.gy1 !== dragging.origGy1;

    if (!wasDragged) {
      // It was a click, not a drag — do toggle actions
      if (c.type === 'switch') {
        c.props.closed = !c.props.closed;
        // Sync DPDT: toggle all switches in the same switchGroup
        if (c.props.switchGroup) {
          for (const other of components) {
            if (other.id !== c.id && other.type === 'switch' && other.props.switchGroup === c.props.switchGroup) {
              other.props.closed = c.props.closed;
            }
          }
        }
        if (simRunning) solveCircuit();
      }
      if (c.type === 'time_delay') {
        c.props.closed = !c.props.closed;
        if (!c.props.closed && simRunning) {
          // Reopened — restart countdown
          c.props._counting = false;
          c.props._remainingTime = c.props.delaySeconds;
        } else {
          c.props._counting = false;
        }
        if (simRunning) solveCircuit();
      }
      if ((c.type === 'fuse' || c.type === 'lv_fuse' || c.type === 'td_fuse') && c.props.blown) {
        c.props.blown = false;
        TBProtection.rearm(c);   // a replacement device starts cold, not part-melted
        if (simRunning) solveCircuit();
      }
      if (c.type === 'breaker') {
        c.props.tripped = !c.props.tripped;
        TBProtection.rearm(c);
        if (simRunning) solveCircuit();
      }
    }

    if (simRunning) solveCircuit();
    autoSave();
    dragging = null;
    dragStartMouse = null;
    render();
    autoMeterUpdate();
  }
}

// A mouse notch and a trackpad swipe cannot be told apart by delta size alone.
// macOS delivers a slow wheel notch as a handful of pixels — the same magnitude a
// two-finger swipe reports — a high-resolution wheel adds fractional deltas, and
// Firefox reports lines instead of pixels. Cadence is the reliable signal: a wheel
// notch arrives on its own, a swipe arrives as a stream. So an isolated event gets
// a fixed step that is always visible no matter how small its delta, and a stream
// gets a continuous factor that tracks the fingers.
let _lastWheelAt = -Infinity;
const WHEEL_STREAM_GAP_MS = 120;
const WHEEL_LINE_PX = 16;

function onWheel(e) {
  e.preventDefault();
  const now = performance.now();
  const isolated = now - _lastWheelAt > WHEEL_STREAM_GAP_MS;
  _lastWheelAt = now;

  // deltaMode is not always pixels — normalize lines and pages before using it.
  let dy = e.deltaY;
  if (e.deltaMode === 1) dy *= WHEEL_LINE_PX;
  else if (e.deltaMode === 2) dy *= canvas.clientHeight || 800;
  if (!Number.isFinite(dy) || dy === 0) return;

  // Every wheel gesture zooms about the pointer — mouse notch, trackpad pinch
  // (which arrives as ctrlKey+wheel) and trackpad two-finger scroll alike.
  // Panning stays on right-click/middle/Alt drag, and on two-finger touch drag.
  const pinch = e.ctrlKey || e.metaKey;
  const discreteNotch = isolated && !pinch && e.deltaX === 0;
  // exp() keeps the continuous factor symmetric and positive at any delta, so a
  // violent flick can never invert the zoom; the clamp keeps one momentum spike
  // (macOS inertia reports deltas in the hundreds) from teleporting to the limit.
  const zoomFactor = discreteNotch
    ? (dy < 0 ? 1.1 : 0.9)
    : Math.max(0.8, Math.min(1.25, Math.exp(-dy * 0.005)));

  const { sx, sy } = canvasMousePos(e);
  const worldBefore = screenToWorld(sx, sy);
  camZoom = Math.max(0.1, Math.min(5, camZoom * zoomFactor));
  const worldAfter = screenToWorld(sx, sy);
  camX += (worldAfter.x - worldBefore.x) * camZoom;
  camY += (worldAfter.y - worldBefore.y) * camZoom;
  autoSave();
  render();
}

// Touch support — single finger (tap/drag) + two-finger (pinch-zoom/pan)
let lastTouches = null;
let lastTouchDist = 0;
let longPressTimer = null;
let touchMoved = false;
let longPressHandled = false; // Guard to prevent double-firing of long-press

function fakeMouseEvent(touch, button = 0) {
  return { clientX: touch.clientX, clientY: touch.clientY, button, altKey: false, shiftKey: false, ctrlKey: false, preventDefault: () => {} };
}

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (e.touches.length === 1) {
    touchMoved = false;
    longPressHandled = false; // Reset guard on new touch
    const t = e.touches[0];
    onMouseDown(fakeMouseEvent(t));
    // Long press = context menu after CONFIG.ANIMATION_TIMEOUT_MS without moving
    longPressTimer = setTimeout(() => {
      if (!touchMoved && !longPressHandled) {
        longPressHandled = true; // Set guard to prevent double-firing
        onMouseUp(fakeMouseEvent(t));
        onContextMenu(fakeMouseEvent(t, 2));
      }
    }, CONFIG.ANIMATION_TIMEOUT_MS);
  } else if (e.touches.length === 2) {
    // Cancel single-finger handling when second finger added
    clearTimeout(longPressTimer);
    onMouseUp(fakeMouseEvent(e.touches[0]));
    lastTouches = [
      { x: e.touches[0].clientX, y: e.touches[0].clientY },
      { x: e.touches[1].clientX, y: e.touches[1].clientY }
    ];
    lastTouchDist = Math.hypot(lastTouches[1].x - lastTouches[0].x, lastTouches[1].y - lastTouches[0].y);
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (e.touches.length === 1) {
    touchMoved = true;
    clearTimeout(longPressTimer);
    onMouseMove(fakeMouseEvent(e.touches[0]));
  } else if (e.touches.length === 2 && lastTouches) {
    const t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    const t1 = { x: e.touches[1].clientX, y: e.touches[1].clientY };

    // Pan: average movement of both fingers
    const avgDx = ((t0.x - lastTouches[0].x) + (t1.x - lastTouches[1].x)) / 2;
    const avgDy = ((t0.y - lastTouches[0].y) + (t1.y - lastTouches[1].y)) / 2;
    camX += avgDx;
    camY += avgDy;

    // Zoom: distance change between fingers
    const dist = Math.hypot(t1.x - t0.x, t1.y - t0.y);
    if (lastTouchDist > 0) {
      const midX = (t0.x + t1.x) / 2;
      const midY = (t0.y + t1.y) / 2;
      const rect = getCanvasRectCached();
      const sx = midX - rect.left, sy = midY - rect.top;
      const worldBefore = screenToWorld(sx, sy);
      camZoom = Math.max(0.1, Math.min(5, camZoom * (dist / lastTouchDist)));
      const worldAfter = screenToWorld(sx, sy);
      camX += (worldAfter.x - worldBefore.x) * camZoom;
      camY += (worldAfter.y - worldBefore.y) * camZoom;
    }

    lastTouches = [t0, t1];
    lastTouchDist = dist;
    scheduleRender();
  }
}, { passive: false });

// The OS can revoke a touch at any time — an incoming call, the notification
// shade, palm rejection. Without this the gesture never "ends": box-select,
// panning, comment drawing and component drags all stayed armed, leaving the
// canvas stuck mid-interaction with no way out but a reload.
canvas.addEventListener('touchcancel', (e) => {
  clearTimeout(longPressTimer);
  longPressHandled = true;
  touchMoved = false;
  lastTouches = null;
  lastTouchDist = 0;
  isPanning = false;
  panStart = null;
  dragging = null;
  dragStartMouse = null;
  draggingMulti = null;
  draggingDataBox = null;
  resizingComment = null;
  boxSelectStart = null;
  boxSelectEnd = null;
  commentDrawStart = null;
  commentDrawEnd = null;
  render();
}, { passive: true });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  clearTimeout(longPressTimer);
  if (e.touches.length === 0) {
    if (lastTouches) {
      lastTouches = null;
      lastTouchDist = 0;
    } else {
      onMouseUp(fakeMouseEvent(e.changedTouches[0]));
    }
    autoSave();
  } else if (e.touches.length === 1) {
    // Went from 2 fingers to 1 — reset two-finger state
    lastTouches = null;
    lastTouchDist = 0;
  }
}, { passive: false });

function onContextMenu(e) {
  e.preventDefault();
  // Don't show context menu if we were panning
  if (didPan) return;
  // Right-click cancels an active wire path
  if (currentTool === 'wire' && wireStart) { wireStart = null; render(); return; }
  const { sx, sy } = canvasMousePos(e);
  const { x, y } = screenToWorld(sx, sy);
  const hit = hitTest(x, y);
  if (hit) {
    selectedItem = hit;
    _propsPanelPos = { x: e.clientX, y: e.clientY };
    showContextMenu(e.clientX, e.clientY);
    render();
  }
}

// ═══════════════════════════════════════════════════════════════
//  HIT TESTING
// ═══════════════════════════════════════════════════════════════
function hitTest(wx, wy) {
  const threshold = 12 / camZoom;
  for (const c of components) {
    // Multi-terminal parts (transformer 4, wye 4, compressor/delta 3): bound the box
    // to every terminal.  The 2-terminal path below only sees gx1/gx2, so the third
    // and fourth legs fell outside the clickable area.
    if (c.gx3 !== undefined && c.type !== 'earth_ground') {
      const pad = 15 + 5 / camZoom;
      const xs = [c.gx1, c.gx2, c.gx3], ys = [c.gy1, c.gy2, c.gy3];
      if (c.gx4 !== undefined) { xs.push(c.gx4); ys.push(c.gy4); }
      const minX = Math.min(...xs) * GRID - pad;
      const maxX = Math.max(...xs) * GRID + pad;
      const minY = Math.min(...ys) * GRID - pad;
      const maxY = Math.max(...ys) * GRID + pad;
      if (wx >= minX && wx <= maxX && wy >= minY && wy <= maxY)
        return { kind: 'component', id: c.id };
      continue;
    }
    // Ground components: hit test based on gx1,gy1 only (gx2,gy2 is virtual bus)
    if (c.type === 'earth_ground') {
      const gpad = 18 + 5 / camZoom;
      const tx = c.gx1 * GRID, ty = c.gy1 * GRID;
      if (wx >= tx - gpad && wx <= tx + gpad && wy >= ty - gpad && wy <= ty + gpad + 22)
        return { kind: 'component', id: c.id };
      continue;
    }
    // Bounding box hit test for all components
    const pad = 15 + 5 / camZoom;
    const cx = (c.gx1 + c.gx2) / 2 * GRID, cy = (c.gy1 + c.gy2) / 2 * GRID;
    const hw = Math.max(Math.abs(c.gx2 - c.gx1) / 2 * GRID, 10) + pad;
    const hh = Math.max(Math.abs(c.gy2 - c.gy1) / 2 * GRID, 10) + pad;
    if (wx >= cx - hw && wx <= cx + hw && wy >= cy - hh && wy <= cy + hh)
      return { kind: 'component', id: c.id };
  }
  for (const w of wires) {
    if (distToSegment(wx, wy, w.gx1 * GRID, w.gy1 * GRID, w.gx2 * GRID, w.gy2 * GRID) < threshold)
      return { kind: 'wire', id: w.id };
  }
  // Comment boxes — click anywhere inside or on border/label to select
  for (const cb of commentBoxes) {
    const x = Math.min(cb.x1, cb.x2), y = Math.min(cb.y1, cb.y2);
    const w = Math.abs(cb.x2 - cb.x1), h = Math.abs(cb.y2 - cb.y1);
    const pad = 5 / camZoom;
    const inside = wx >= x - pad && wx <= x + w + pad && wy >= y - 20 / camZoom && wy <= y + h + pad;
    if (inside) return { kind: 'comment', id: cb.id };
  }
  return null;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
