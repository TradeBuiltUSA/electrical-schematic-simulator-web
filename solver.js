
// ═══════════════════════════════════════════════════════════════
//  ADD / DELETE / ROTATE
// ═══════════════════════════════════════════════════════════════
// Undo / Redo
const undoStack = [];
const redoStack = [];
const MAX_UNDO = 50;
let _skipUndoPush = false;
let _lastSavedSnapshot = null; // tracks pre-mutation state for correct undo

function getStateSnapshot() {
  return JSON.stringify({ components, wires, nextId, commentBoxes });
}

function restoreSnapshot(json) {
  const s = JSON.parse(json);
  components.length = 0; components.push(...s.components);
  wires.length = 0; wires.push(...s.wires);
  commentBoxes.length = 0; commentBoxes.push(...(s.commentBoxes || []));
  nextId = s.nextId;
}

// Push the PREVIOUS state (pre-mutation) to the undo stack.
// `snap` is the post-mutation state; when it matches, nothing actually changed —
// autoSave() runs on plain pans, clicks and no-op drags, and pushing those
// duplicates meant an undo press could appear to do nothing.
function pushUndo(snap) {
  if (_skipUndoPush) return;
  if (_lastSavedSnapshot === null || snap === _lastSavedSnapshot) return;
  undoStack.push(_lastSavedSnapshot);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0; // clear redo on new action
}

function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(getStateSnapshot());
  restoreSnapshot(undoStack.pop());
  _skipUndoPush = true;
  autoSave();
  _skipUndoPush = false;
  if (simRunning) solveCircuit();
  render();
}

function redo() {
  if (redoStack.length === 0) return;
  undoStack.push(getStateSnapshot());
  restoreSnapshot(redoStack.pop());
  _skipUndoPush = true;
  autoSave();
  _skipUndoPush = false;
  if (simRunning) solveCircuit();
  render();
}

function autoSave() {
  const _snap = getStateSnapshot();
  pushUndo(_snap);
  _lastSavedSnapshot = _snap;
  try {
    const meterEl = document.getElementById('multimeter');
    const meterLeft = meterEl ? meterEl.style.left : null;
    const meterTop  = meterEl ? meterEl.style.top  : null;
    const meterBottom = meterEl ? meterEl.style.bottom : null;
    const cbEl = document.getElementById('clipboard-panel');
    const clipboardLeft   = cbEl ? cbEl.style.left   : null;
    const clipboardTop    = cbEl ? cbEl.style.top     : null;
    const clipboardWidth  = cbEl ? cbEl.style.width   : null;
    const clipboardHeight = cbEl ? cbEl.style.height  : null;
    const ncvtEl  = document.getElementById('ncvt-panel');
    const ncvtLeft = ncvtEl ? ncvtEl.style.left : null;
    const ncvtTop  = ncvtEl ? ncvtEl.style.top  : null;
    const clampEl  = document.getElementById('clamp-meter');
    const clampLeft = clampEl ? clampEl.style.left : null;
    const clampTop  = clampEl ? clampEl.style.top  : null;
    const clampActive = window._clampActive ? window._clampActive() : false;
    const _cjp = window._clampJawPos ? window._clampJawPos() : null;
    const clampJawX = _cjp ? _cjp.x : null;
    const clampJawY = _cjp ? _cjp.y : null;
    // camX/camY/camZoom only frame what they framed at the viewport they were
    // written at, so the viewport travels with them — see applySavedCamera().
    const _view = getViewportCSS();
    localStorage.setItem('ac-simulator-circuit', JSON.stringify({
      components, wires, nextId, camX, camY, camZoom, viewW: _view.w, viewH: _view.h,
      simRunning, commentBoxes,
      meterActive, meterLeft, meterTop, meterBottom,
      meterProbe1, meterProbe2, meterMode, meterInrushMode,
      clipboardActive, clipboardLeft, clipboardTop, clipboardWidth, clipboardHeight,
      showData, showTitles, showInfo, showStatus, showComments, showElectrons, showEnergizedColors, showFaults,
      ncvtActive, ncvtLeft, ncvtTop, ncvtSnapped,
      clampActive, clampLeft, clampTop, clampJawX, clampJawY, clampInrushMode
    }));
  } catch (e) {
    console.warn('autoSave: localStorage write failed', e);
  }
}

// Returns true if grid point (px,py) lies strictly on segment (ax,ay)→(bx,by),
// NOT at either endpoint — used for T-junction detection.
function pointOnWireSegment(px, py, ax, ay, bx, by) {
  if ((px === ax && py === ay) || (px === bx && py === by)) return false;
  if ((bx - ax) * (py - ay) !== (by - ay) * (px - ax)) return false; // not collinear
  return px >= Math.min(ax, bx) && px <= Math.max(ax, bx) &&
         py >= Math.min(ay, by) && py <= Math.max(ay, by);
}

// Split any existing wires whose body passes through (px,py), creating a T-junction.
function splitWiresAtPoint(px, py) {
  const hits = wires.filter(w => pointOnWireSegment(px, py, w.gx1, w.gy1, w.gx2, w.gy2));
  for (const w of hits) {
    const col = w.color || '#000000';
    wires.splice(wires.indexOf(w), 1);
    wires.push({ id: nextId++, gx1: w.gx1, gy1: w.gy1, gx2: px, gy2: py, color: col });
    wires.push({ id: nextId++, gx1: px, gy1: py, gx2: w.gx2, gy2: w.gy2, color: col });
  }
}

function addWire(gx1, gy1, gx2, gy2) {
  // A wire with both ends on one node connects nothing and can't be drawn or grabbed
  if (gx1 === gx2 && gy1 === gy2) return;
  const exists = wires.some(w =>
    (w.gx1 === gx1 && w.gy1 === gy1 && w.gx2 === gx2 && w.gy2 === gy2) ||
    (w.gx1 === gx2 && w.gy1 === gy2 && w.gx2 === gx1 && w.gy2 === gy1)
  );
  if (exists) { setStatus('Wire already exists at this location.'); return; }
  // Split any existing wire segments that the new wire's endpoints land on mid-body
  splitWiresAtPoint(gx1, gy1);
  splitWiresAtPoint(gx2, gy2);
  wires.push({ id: nextId++, gx1, gy1, gx2, gy2, color: '#000000' });
  if (simRunning) solveCircuit();
  autoSave();
}

function addComponent(type, gx1, gy1, gx2, gy2, gx3, gy3, gx4, gy4) {
  // A type with no defaults has nothing to build props from, and every caller
  // already tests the return value before touching .props. Without this the
  // stringify/parse below turned an unknown type into an opaque
  // '"undefined" is not valid JSON' throw part-way through placement.
  const defaults = ComponentDefaults[type];
  if (!defaults) { console.warn('addComponent: unknown component type "' + type + '"'); return null; }
  const props = JSON.parse(JSON.stringify(defaults));
  const comp = { id: nextId++, type, gx1, gy1, gx2, gy2, props };
  if (type === 'transformer' || type === 'ac_480_wye') {
    comp.gx3 = gx3; comp.gy3 = gy3;
    comp.gx4 = gx4; comp.gy4 = gy4;
  }
  if (type === 'compressor' || type === 'ac_480') {
    comp.gx3 = gx3; comp.gy3 = gy3;
  }
  // Split any existing wires whose body passes through the component's terminals
  splitWiresAtPoint(gx1, gy1);
  splitWiresAtPoint(gx2, gy2);
  if (type === 'transformer' || type === 'ac_480_wye') {
    splitWiresAtPoint(gx3, gy3);
    splitWiresAtPoint(gx4, gy4);
  }
  if (type === 'compressor' || type === 'ac_480') {
    splitWiresAtPoint(gx3, gy3);
  }
  components.push(comp);
  if (simRunning) solveCircuit();
  autoSave();
  return comp;
}

function deleteItem(item) {
  if (item.kind === 'wire') wires = wires.filter(w => w.id !== item.id);
  else if (item.kind === 'comment') commentBoxes = commentBoxes.filter(cb => cb.id !== item.id);
  else {
    components = components.filter(c => c.id !== item.id);
    // Fix #1: Clean up orphaned state objects to prevent memory leaks
    delete displayValues[item.id];
    delete bulbState[item.id];
    delete fanState[item.id];
    delete surgeState[item.id];
  }
  if (selectedItem && selectedItem.id === item.id) { selectedItem = null; hidePropsPanel(); }
  if (simRunning) solveCircuit();
  autoSave();
  render();
}

// Returns gx1/gy1/gx2/gy2 for a component placed at (hx,hy) with given size and rotation (0-7)
function compCoords(hx, hy, size, rot) {
  const half = Math.floor(size / 2);
  const S = size - half;
  const dirs = [
    [-half, 0,     S,  0   ], // 0: right   (0°)
    [ 0,   -half,  0,  S   ], // 1: down    (90°)
    [ half,  0,   -S,  0   ], // 2: left    (180°)
    [ 0,    half,  0, -S   ], // 3: up      (270°)
    [-half,-half,  S,  S   ], // 4: diag ↘  (45°)
    [ half,-half, -S,  S   ], // 5: diag ↙  (135°)
    [ half, half, -S, -S   ], // 6: diag ↖  (225°)
    [-half, half,  S, -S   ], // 7: diag ↗  (315°)
  ];
  const [dx1, dy1, dx2, dy2] = dirs[rot % 8];
  return { gx1: hx + dx1, gy1: hy + dy1, gx2: hx + dx2, gy2: hy + dy2 };
}

function rotateComponent(item) {
  if (item.kind !== 'component') return;
  const c = components.find(x => x.id === item.id);
  if (!c) return;
  if (c.type === 'earth_ground') return; // grounds don't rotate

  if (c.type === 'transformer' && c.gx3 !== undefined) {
    // Rotate all 4 terminals 90° around center — no rounding (terminals are half-grid, exact is fine)
    const cx = (c.gx1 + c.gx3) / 2, cy = (c.gy1 + c.gy4) / 2;
    function rot90(gx, gy) {
      const dx = gx - cx, dy = gy - cy;
      return { gx: cx + (-dy), gy: cy + dx };
    }
    const r1 = rot90(c.gx1, c.gy1), r2 = rot90(c.gx2, c.gy2);
    const r3 = rot90(c.gx3, c.gy3), r4 = rot90(c.gx4, c.gy4);
    c.gx1 = r1.gx; c.gy1 = r1.gy;
    c.gx2 = r2.gx; c.gy2 = r2.gy;
    c.gx3 = r3.gx; c.gy3 = r3.gy;
    c.gx4 = r4.gx; c.gy4 = r4.gy;
  } else if (c.type === 'compressor' && c.gx3 !== undefined) {
    // Rotate all 3 terminals 90° around center
    const cx = (c.gx1 + c.gx2 + c.gx3) / 3, cy = (c.gy1 + c.gy2 + c.gy3) / 3;
    function rot90c(gx, gy) {
      const dx = gx - cx, dy = gy - cy;
      return { gx: cx + (-dy), gy: cy + dx };
    }
    const r1 = rot90c(c.gx1, c.gy1), r2 = rot90c(c.gx2, c.gy2), r3 = rot90c(c.gx3, c.gy3);
    c.gx1 = r1.gx; c.gy1 = r1.gy;
    c.gx2 = r2.gx; c.gy2 = r2.gy;
    c.gx3 = r3.gx; c.gy3 = r3.gy;
  } else {
    const dx = c.gx2 - c.gx1, dy = c.gy2 - c.gy1;
    const span = Math.abs(dx) + Math.abs(dy);
    if (span % 2 === 1) {
      // Odd-length: pivot at terminal 1 — no rounding, no drift
      c.gx2 = c.gx1 + (-dy);
      c.gy2 = c.gy1 + dx;
    } else {
      // Even-length: center is on-grid — exact, no rounding needed
      const mx = (c.gx1 + c.gx2) / 2, my = (c.gy1 + c.gy2) / 2;
      const ndx = -dy, ndy = dx;
      c.gx1 = mx - ndx / 2; c.gy1 = my - ndy / 2;
      c.gx2 = c.gx1 + ndx;  c.gy2 = c.gy1 + ndy;
    }
  }
  if (simRunning) solveCircuit();
  autoSave();
  render();
}

function flipComponent(item) {
  if (item.kind !== 'component') return;
  const c = components.find(x => x.id === item.id);
  if (!c || (!isACSource(c.type) && c.type !== 'dc_source')) return;
  // Swap terminals in place — reverses polarity (+/- or L1/N) without moving the component
  [c.gx1, c.gx2] = [c.gx2, c.gx1];
  [c.gy1, c.gy2] = [c.gy2, c.gy1];
  if (simRunning) solveCircuit();
  autoSave();
  render();
}

// Drop every coil and return its contacts to their mechanical rest position.
// Cutting power drops a contactor out — but the coil/contact sync only runs inside
// solveCircuit(), which stops with the simulation, so de-energizing used to leave a
// dead circuit drawn with its contacts still made (and the coil's pickup/dropout
// hysteresis flag still set, so the next energize used the 60% dropout threshold
// instead of the 80% pickup threshold).
function releaseAllCoils() {
  for (const c of components) {
    if (c.type === 'contactor_coil' || c.type === 'relay_coil') {
      c.props._wasEnergized = false;
    } else if (c.type === 'contactor_contact') {
      c.props.contactClosed = false;                          // NO — open at rest
    } else if (c.type === 'relay_contact') {
      c.props._coilEnergized = false;
      c.props.contactClosed = c.props.contactMode === 'NC';   // NC — closed at rest
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  CIRCUIT SOLVER
// ═══════════════════════════════════════════════════════════════

// Gaussian elimination with partial pivoting
function solveLinear(A, b, n) {
  // Create augmented matrix
  const M = [];
  for (let i = 0; i < n; i++) {
    M[i] = new Float64Array(n + 1);
    for (let j = 0; j < n; j++) M[i][j] = A[i][j];
    M[i][n] = b[i];
  }
  // Forward elimination
  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col, maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > maxVal) { maxVal = Math.abs(M[row][col]); maxRow = row; }
    }
    if (maxVal < 1e-12) return null; // singular
    if (maxRow !== col) { const tmp = M[col]; M[col] = M[maxRow]; M[maxRow] = tmp; }
    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / M[col][col];
      for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j];
    }
  }
  // Back substitution
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i];
  }
  return x;
}

let _solveDepth = 0;
let _solveStateHistory = []; // Track contactor states to detect oscillations
/**
 * Solve the circuit currently on the canvas.
 *
 * Takes no arguments and returns nothing: it reads the shared state
 * (`components`, `wires`, and each component's `props`) and writes its answers
 * back into the shared result maps, which the renderer and the meters then read.
 *
 * Writes (all cleared on entry, so a component absent from `compResults` was
 * simply never solved this pass — treat missing fields as absent, not zero):
 *   - `compResults`    compId → { voltageDrop, current, watts, resistance, … }
 *   - `nodeVoltages`   net key → volts
 *   - `branchCurrents` branch key → amps
 *
 * Re-entrant by design: a coil that picks up or drops out changes the contact
 * states mid-solve and the solver calls itself again to settle. `_solveDepth`
 * caps that at 5 levels and `_solveStateHistory` detects a contact set that
 * oscillates, so a chattering control circuit stops instead of hanging the tab.
 * Blowing a fuse or tripping a breaker also mutates props and re-solves.
 */
function solveCircuit() {
  if (_solveDepth > 5) return; // prevent infinite recursion
  // The oscillation guard only means anything WITHIN one top-level solve.  Carrying
  // it across frames made a legitimate contact change match a stale entry from an
  // earlier frame (or an earlier circuit entirely), suppressing the re-solve and
  // leaving the frame showing contacts in one state and currents from the other.
  if (_solveDepth === 0) _solveStateHistory.length = 0;
  _solveDepth++;
  try {
  nodeVoltages = {};
  branchCurrents = {};
  compResults = {};
  if (components.length === 0) return;

  // ── Build net graph using Union-Find ──
  // Wires, closed switches, and intact fuses merge their endpoint nodes into nets.
  // Loads (resistors, bulbs) do NOT merge — they sit between two nets.
  const parent = {};
  function find(n) {
    if (parent[n] === undefined) parent[n] = n;
    if (parent[n] !== n) parent[n] = find(parent[n]);
    return parent[n];
  }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  function key(gx, gy) { return gx + ',' + gy; }

  // Wires merge nodes
  for (const w of wires) union(key(w.gx1, w.gy1), key(w.gx2, w.gy2));

  // Closed switches and intact fuses merge nodes (zero resistance connections)
  for (const c of components) {
    if (((c.type === 'switch' || c.type === 'time_delay') && c.props.closed) || ((c.type === 'contactor_contact' || c.type === 'relay_contact') && c.props.contactClosed)) union(key(c.gx1, c.gy1), key(c.gx2, c.gy2));
    if ((c.type === 'fuse' || c.type === 'lv_fuse' || c.type === 'td_fuse') && !c.props.blown) union(key(c.gx1, c.gy1), key(c.gx2, c.gy2));
    if (c.type === 'breaker' && !c.props.tripped) union(key(c.gx1, c.gy1), key(c.gx2, c.gy2));
    // Short-circuit fault: merge the two terminal nodes (load becomes a wire)
    if (c.props.faultMode === 'short') union(key(c.gx1, c.gy1), key(c.gx2, c.gy2));
    // Compressor short faults: merge specific winding terminals
    if (c.type === 'compressor' && c.gx3 !== undefined) {
      if (c.props.faultMode === 'short-run') union(key(c.gx1, c.gy1), key(c.gx2, c.gy2));
      if (c.props.faultMode === 'short-start') union(key(c.gx1, c.gy1), key(c.gx3, c.gy3));
    }
  }

  // Ensure all component terminal nodes exist in parent
  for (const c of components) {
    find(key(c.gx1, c.gy1));
    find(key(c.gx2, c.gy2));
    if (c.type === 'transformer' && c.gx3 !== undefined) {
      find(key(c.gx3, c.gy3));
      find(key(c.gx4, c.gy4));
    }
    if (c.type === 'compressor' && c.gx3 !== undefined) {
      find(key(c.gx3, c.gy3));
    }
  }
  for (const w of wires) {
    find(key(w.gx1, w.gy1));
    find(key(w.gx2, w.gy2));
  }

  // Record pre-bond roots before earth grounds merge with the virtual bus.
  // Needed so fault detection can distinguish intentional neutral bonds from fault paths.
  const _earthPreBond = new Map(); // earth ground id → pre-bond root of gx1
  const _neutralPreBond = new Set(); // pre-bond roots of source neutral (gx2) terminals
  const _circuitNets = new Set(); // pre-bond roots of all non-ground component terminals
  for (const c of components) {
    if (c.type === 'earth_ground') { _earthPreBond.set(c.id, find(key(c.gx1, c.gy1))); continue; }
    if (isSource(c.type)) {
      _neutralPreBond.add(find(key(c.gx2, c.gy2)));
    }
    _circuitNets.add(find(key(c.gx1, c.gy1)));
    _circuitNets.add(find(key(c.gx2, c.gy2)));
    if (c.gx3 !== undefined) _circuitNets.add(find(key(c.gx3, c.gy3)));
  }

  // ── Auto-union ground components to their virtual bus nodes ──
  for (const c of components) {
    if (c.type === 'earth_ground') union(key(c.gx1, c.gy1), '999999,0');
  }

  // ── Build a graph of nets connected by resistive components ──
  // Each net is identified by its Union-Find root.
  // Edges are loads (resistors/bulbs) connecting two different nets.
  const sources = components.filter(c => isSource(c.type) && c.props.on !== false);

  // Detect circuit source type for physics rules
  const hasAC = sources.some(s => isACSource(s.type));
  const hasDC = sources.some(s => s.type === 'dc_source');
  const isDCOnly = sources.length > 0 && !hasAC;
  // Expose source type globally for data labels (per Electrical Accuracy Rule #4)
  window._circuitSourceType = isDCOnly ? 'DC' : hasAC ? 'AC' : (hasDC ? 'DC' : '');

  // ── Per-net source type tracking ──
  // Maps each net root to which source types feed it ('AC', 'DC', or both)
  const netSourceTypes = {}; // netRoot → { ac: bool, dc: bool }
  for (const src of sources) {
    const srcType = src.type === 'dc_source' ? 'dc' : 'ac';
    const net1 = find(key(src.gx1, src.gy1));
    const net2 = find(key(src.gx2, src.gy2));
    if (!netSourceTypes[net1]) netSourceTypes[net1] = { ac: false, dc: false };
    if (!netSourceTypes[net2]) netSourceTypes[net2] = { ac: false, dc: false };
    netSourceTypes[net1][srcType] = true;
    netSourceTypes[net2][srcType] = true;
    // For 3-phase sources, tag the third terminal too
    if (src.gx3 !== undefined) {
      const net3 = find(key(src.gx3, src.gy3));
      if (!netSourceTypes[net3]) netSourceTypes[net3] = { ac: false, dc: false };
      netSourceTypes[net3][srcType] = true;
    }
  }
  // Propagate source types through component terminal pairs so intermediate nets in
  // series circuits (not directly adjacent to source terminals) get correctly tagged.
  { let _chg = true;
    while (_chg) {
      _chg = false;
      for (const c of components) {
        if (isSource(c.type)) continue;
        const n1 = find(key(c.gx1, c.gy1));
        const n2 = find(key(c.gx2, c.gy2));
        const s1 = netSourceTypes[n1], s2 = netSourceTypes[n2];
        if (!s1 && !s2) continue;
        if (s1 && !s2) { netSourceTypes[n2] = { ac: s1.ac, dc: s1.dc }; _chg = true; }
        else if (s2 && !s1) { netSourceTypes[n1] = { ac: s2.ac, dc: s2.dc }; _chg = true; }
        else {
          if (s1.ac && !s2.ac) { s2.ac = true; _chg = true; }
          if (s1.dc && !s2.dc) { s2.dc = true; _chg = true; }
          if (s2.ac && !s1.ac) { s1.ac = true; _chg = true; }
          if (s2.dc && !s1.dc) { s1.dc = true; _chg = true; }
        }
      }
    }
  }
  // Expose per-node source types globally so wire renderer can determine DC vs AC flow
  window._nodeSourceTypes = {};
  for (const k of Object.keys(parent)) {
    const root = find(k);
    const st = netSourceTypes[root];
    if (st) window._nodeSourceTypes[k] = st;
  }

  // Helper: get source type for a component based on which nets its terminals touch
  function compSourceType(c) {
    const n1 = find(key(c.gx1, c.gy1));
    const n2 = find(key(c.gx2, c.gy2));
    const s1 = netSourceTypes[n1] || { ac: false, dc: false };
    const s2 = netSourceTypes[n2] || { ac: false, dc: false };
    const hasAC = s1.ac || s2.ac;
    const hasDC = s1.dc || s2.dc;
    if (hasAC && hasDC) return 'AC/DC';
    if (hasDC) return 'DC';
    if (hasAC) return 'AC';
    return '';
  }

  // ── Compute impedance Z for inductive loads ──
  // AC: Z = √(R² + XL²), XL = 2πfL, PF = R/Z
  // DC or no inductance: Z = R, PF = 1.0
  function computeImpedance(R, inductance, frequency, sourceType) {
    if (!inductance || inductance <= 0 || sourceType === 'DC') return { Z: R, XL: 0, pf: 1.0 };
    const XL = 2 * Math.PI * frequency * inductance;
    const Z = Math.sqrt(R * R + XL * XL);
    const pf = Z > 0 ? R / Z : 1.0;
    return { Z, XL, pf };
  }

  // ── Motor/coil startup surge factor ──
  // Returns multiplier that decays from SURGE_PEAK_FACTOR → 1.0
  // tau scales with motor HP: tau = 0.5 + (HP × 0.2), capped at 3s
  const _hpMap = {'1/6 HP':1/6,'1/4 HP':0.25,'1/3 HP':1/3,'1/2 HP':0.5,'3/4 HP':0.75,'1 HP':1,'1.5 HP':1.5,'2 HP':2};
  function computeSurgeFactor(ss, currentTime, tau) {
    const elapsed = currentTime - ss.startTime;
    if (elapsed < 0 || elapsed > tau * 5) return 1.0;
    const factor = 1 + (CONFIG.SURGE_PEAK_FACTOR - 1) * Math.exp(-elapsed / tau);
    return factor < CONFIG.SURGE_THRESHOLD ? 1.0 : factor;
  }

  // ── AC frequency for reactance calculations ──
  const _acSrc = sources.find(s => isACSource(s.type));
  const _acFreq = _acSrc ? (_acSrc.props.frequency || 60) : 60;

  // ── Pre-compute capacitive reactance Xc = 1 / (2πfC) for each capacitor ──
  // AC: Uses the first AC source's frequency. DC: capacitors block DC (open circuit).
  {
    const acSource = _acSrc;
    const srcFreq = _acFreq;
    for (const c of components) {
      if (c.type === 'capacitor') {
        const capSrc = compSourceType(c);
        if (capSrc === 'DC') {
          // Capacitors block DC — act as open circuit (no steady-state current)
          c.props.resistance = CONFIG.OPEN_CIRCUIT_RESISTANCE;
        } else {
          const C_uF = Math.max(c.props.capacitance || 10, 0.001); // μF, clamp > 0
          const Xc = 1 / (2 * Math.PI * srcFreq * C_uF * 1e-6);
          c.props.resistance = Math.round(Xc * 10) / 10; // round to 1 decimal
        }
      }
      if (c.type === 'outlet') {
        const srcV = sources.length > 0 ? (sources[0].props.voltage || 120) : 120;
        c.props.resistance = c.props.wattage > 0
          ? Math.round((srcV * srcV / c.props.wattage) * 10) / 10
          : 1e6; // open circuit when empty
      }
    }
  }

  // Give every motor/coil a surge record before anything reads one.  An absent
  // record used to be read as "999 s since start", so on a compressor's very first
  // energized frame the start winding was already cut out and the rotor was
  // modelled at full speed.  A -Infinity startTime still means "settled long ago",
  // which is how a reload restores an already-running motor.
  if (simRunning) {
    for (const c of components) {
      if (c.type === 'fan' || c.type === 'contactor_coil' || c.type === 'relay_coil' || c.type === 'compressor') {
        if (!surgeState[c.id]) surgeState[c.id] = { startTime: animTime, prevEnergized: false };
      }
    }
  }

  // Open fault = exclude entirely; short fault = already merged above (no resistance to model)
  //
  // Each entry is a per-solve WRAPPER, not the component itself.  The impedance pass
  // below overwrites ld.props.resistance with Z; when ld was the live component that
  // wrote Z back onto the fan and the next frame recomputed Z from it, compounding
  // the impedance every frame until the motor's current decayed to nothing.
  const loads = components
    .filter(c => ['resistor', 'bulb', 'fan', 'capacitor', 'outlet'].includes(c.type) && c.props.faultMode !== 'open' && c.props.faultMode !== 'short')
    .map(c => ({ id: c.id, type: c.type, gx1: c.gx1, gy1: c.gy1, gx2: c.gx2, gy2: c.gy2, props: { ...c.props } }));
  // Contactor coils act as loads (draw current like a resistor)
  for (const c of components) {
    if (c.type === 'contactor_coil' && c.props.coilResistance > 0 && c.props.faultMode !== 'open' && c.props.faultMode !== 'short') {
      loads.push({ id: c.id, type: 'resistor', gx1: c.gx1, gy1: c.gy1, gx2: c.gx2, gy2: c.gy2,
        props: { resistance: c.props.coilResistance, powerFactor: c.props.powerFactor, inductance: c.props.inductance || 0 } });
    }
    if (c.type === 'relay_coil' && c.props.coilResistance > 0 && c.props.faultMode !== 'open' && c.props.faultMode !== 'short') {
      loads.push({ id: c.id, type: 'resistor', gx1: c.gx1, gy1: c.gy1, gx2: c.gx2, gy2: c.gy2,
        props: { resistance: c.props.coilResistance, powerFactor: c.props.powerFactor, inductance: c.props.inductance || 0 } });
    }
    // Compressor: two windings — run (C→R) and start (C→S)
    if (c.type === 'compressor' && c.gx3 !== undefined) {
      const fm = c.props.faultMode || 'none';
      if (fm !== 'open-run' && fm !== 'short-run' && c.props.runResistance > 0) {
        loads.push({ id: c.id + '_run', type: 'fan', _compressorId: c.id, _winding: 'run',
          gx1: c.gx1, gy1: c.gy1, gx2: c.gx2, gy2: c.gy2,
          props: { resistance: c.props.runResistance, inductance: c.props.runInductance || 0, powerFactor: 0.8, hp: c.props.hp, _backEMF: c.props.backEMF || 0 } });
      }
      // Start winding: check for automatic cutout (potential relay / centrifugal switch)
      let startCutoff = false;
      if (c.props.startCutout && simRunning) {
        // No record = not started yet (elapsed 0), not "started ages ago"
        const ss = surgeState[c.id];
        const elapsed = ss ? Math.max(0, animTime - ss.startTime) : 0;
        startCutoff = elapsed >= (c.props.startCutoutTime || 1.5);
      }
      if (!startCutoff && fm !== 'open-start' && fm !== 'short-start' && c.props.startResistance > 0) {
        loads.push({ id: c.id + '_start', type: 'fan', _compressorId: c.id, _winding: 'start',
          gx1: c.gx1, gy1: c.gy1, gx2: c.gx3, gy2: c.gy3,
          props: { resistance: c.props.startResistance, inductance: c.props.startInductance || 0, powerFactor: 0.6, hp: c.props.hp, _backEMF: c.props.backEMF || 0 } });
      }
    }
  }

  // id → component, so the per-load lookups below don't rescan the array (this runs
  // for every load on every animation frame)
  const compById = new Map();
  for (const c of components) compById.set(c.id, c);

  // ── Compute impedance Z for inductive loads (fans, coils) ──
  for (const ld of loads) {
    const origComp = compById.get(ld.id);
    let L = origComp ? (origComp.props.inductance || ld.props.inductance || 0) : (ld.props.inductance || 0);

    // Compressor motor speed model:
    // At locked rotor (startup): impedance ≈ R only (inductance effect minimal)
    // As motor accelerates: effective inductance increases, current drops from LRA to RLA
    // backEMF further reduces effective voltage at running speed
    if (ld._compressorId && simRunning) {
      const compId = ld._compressorId;
      const ss = surgeState[compId];
      const elapsed = ss ? Math.max(0, animTime - ss.startTime) : 0;
      // Motor speed ramps: 0 at startup → 1 at full speed (tau ~0.5s, settled ~2.5s)
      const speedFactor = 1 - Math.exp(-elapsed / 0.5);
      ld.props._speedFactor = speedFactor;
      // Scale inductance with speed: locked rotor has near-zero effective inductance
      L = L * speedFactor;
      // Back-EMF reduces voltage at running speed
      if (ld.props._backEMF && ld.props._backEMF > 0) {
        ld.props._emfReduction = speedFactor * ld.props._backEMF;
      }
    }

    if (L > 0) {
      const ldSrcType = compSourceType(origComp || ld);
      const imp = computeImpedance(ld.props.resistance, L, _acFreq, ldSrcType);
      ld.props._impedance = imp.Z;
      ld.props._XL = imp.XL;
      ld.props._derivedPF = imp.pf;
      ld.props._origResistance = ld.props.resistance;
      ld.props.resistance = imp.Z;
      // Compressor windings keep their specified PF (accounts for back-EMF/motor effects)
      if (!ld._compressorId) ld.props.powerFactor = imp.pf;
    }
  }

  // ── Motor/coil startup surge: compute per-load surge factors (applied post-solve) ──
  // Only active when simulation is running (not during tests or static solves)
  const _surgeLookup = {};
  if (simRunning) for (const ld of loads) {
    const origComp = compById.get(ld.id);
    if (!origComp) continue;
    const isInductive = origComp.type === 'fan' || origComp.type === 'contactor_coil' || origComp.type === 'relay_coil';
    if (!isInductive) continue;
    if (!surgeState[ld.id]) surgeState[ld.id] = { startTime: -Infinity, prevEnergized: false };
    const ss = surgeState[ld.id];
    if (!ss.prevEnergized && ss.startTime === -Infinity) ss.startTime = animTime;
    const hpNum = origComp.type === 'fan' ? (_hpMap[origComp.props.hp] || 0.5) : 0;
    const tau = origComp.type === 'fan' ? Math.min(0.09 + hpNum * 0.04, 0.5) : CONFIG.SURGE_TAU;
    const surgeFactor = computeSurgeFactor(ss, animTime, tau);
    if (surgeFactor > 1.001) _surgeLookup[ld.id] = surgeFactor;
  }

  if (sources.length === 0) return;

  // Adjacency: net -> [{ net, load, resistance }]
  const adj = {};
  function addAdj(netA, netB, load) {
    if (!adj[netA]) adj[netA] = [];
    if (!adj[netB]) adj[netB] = [];
    adj[netA].push({ net: netB, load, resistance: load.props.resistance });
    adj[netB].push({ net: netA, load, resistance: load.props.resistance });
  }

  for (const ld of loads) {
    const n1 = find(key(ld.gx1, ld.gy1));
    const n2 = find(key(ld.gx2, ld.gy2));
    if (n1 !== n2 && ld.props.resistance > 0) {
      addAdj(n1, n2, ld);
    }
  }

  // Expand 3-phase sources into virtual 2-terminal source pairings
  // Each pair of terminals (L1-L2, L2-L3, L1-L3) is treated as an independent source
  const expandedSources = [];
  for (const src of sources) {
    if (src.type === 'ac_480' && src.gx3 !== undefined) {
      // Delta 3-phase: 3 line-to-line pairings at 480V
      expandedSources.push({ ...src, _virtual: true, _pairLabel: 'L1-L2', gx1: src.gx1, gy1: src.gy1, gx2: src.gx2, gy2: src.gy2 });
      expandedSources.push({ ...src, _virtual: true, _pairLabel: 'L2-L3', id: src.id + '_23', gx1: src.gx2, gy1: src.gy2, gx2: src.gx3, gy2: src.gy3 });
      expandedSources.push({ ...src, _virtual: true, _pairLabel: 'L1-L3', id: src.id + '_13', gx1: src.gx1, gy1: src.gy1, gx2: src.gx3, gy2: src.gy3 });
    } else if (src.type === 'ac_480_wye' && src.gx4 !== undefined) {
      // Wye 3-phase: 3 line-to-line at 480V + 3 line-to-neutral at 277V
      const llV = src.props.voltage || 480;
      const lnV = Math.round(llV / Math.sqrt(3));  // 480/√3 ≈ 277V
      const lnProps = { ...src.props, voltage: lnV };
      // Line-to-line pairings (480V)
      expandedSources.push({ ...src, _virtual: true, _pairLabel: 'L1-L2', gx1: src.gx1, gy1: src.gy1, gx2: src.gx2, gy2: src.gy2 });
      expandedSources.push({ ...src, _virtual: true, _pairLabel: 'L2-L3', id: src.id + '_23', gx1: src.gx2, gy1: src.gy2, gx2: src.gx3, gy2: src.gy3 });
      expandedSources.push({ ...src, _virtual: true, _pairLabel: 'L1-L3', id: src.id + '_13', gx1: src.gx1, gy1: src.gy1, gx2: src.gx3, gy2: src.gy3 });
      // Line-to-neutral pairings (277V)
      expandedSources.push({ ...src, _virtual: true, _pairLabel: 'L1-N', id: src.id + '_1n', props: lnProps, gx1: src.gx1, gy1: src.gy1, gx2: src.gx4, gy2: src.gy4 });
      expandedSources.push({ ...src, _virtual: true, _pairLabel: 'L2-N', id: src.id + '_2n', props: lnProps, gx1: src.gx2, gy1: src.gy2, gx2: src.gx4, gy2: src.gy4 });
      expandedSources.push({ ...src, _virtual: true, _pairLabel: 'L3-N', id: src.id + '_3n', props: lnProps, gx1: src.gx3, gy1: src.gy3, gx2: src.gx4, gy2: src.gy4 });
    } else {
      expandedSources.push(src);
    }
  }

  for (const src of expandedSources) {
    const srcNet1 = find(key(src.gx1, src.gy1));
    const srcNet2 = find(key(src.gx2, src.gy2));
    const voltage = src.props.voltage;

    // Check if srcNet1 can reach srcNet2 through zero-resistance paths
    // (other sources act as zero-resistance bridges between their terminals)
    // BFS through nets, bridging via any AC source terminals
    const shortCheck = new Set([srcNet1]);
    const sq = [srcNet1];
    while (sq.length > 0) {
      const currentNet = sq.shift();
      for (const otherSrc of sources) {
        if (otherSrc.id === src.id) continue;
        const oN1 = find(key(otherSrc.gx1, otherSrc.gy1));
        const oN2 = find(key(otherSrc.gx2, otherSrc.gy2));
        if (find(oN1) === find(currentNet) && !shortCheck.has(find(oN2))) {
          shortCheck.add(find(oN2)); sq.push(find(oN2));
        }
        if (find(oN2) === find(currentNet) && !shortCheck.has(find(oN1))) {
          shortCheck.add(find(oN1)); sq.push(find(oN1));
        }
      }
    }
    const isShort = srcNet1 === srcNet2 || shortCheck.has(srcNet2);

    if (isShort) {
      // ── SHORT CIRCUIT: source terminals on same net (zero resistance path) ──
      // Extremely high current flows — limited only by wire/internal resistance
      const wireResistance = CONFIG.MIN_RESISTANCE; // near-zero ohms
      const shortCurrent = voltage / wireResistance;
      const shortWatts = voltage * shortCurrent;

      // Check for fuses/breakers in the short path — trip/blow the first one found
      for (const c of components) {
        if (((c.type === 'fuse' || c.type === 'lv_fuse' || c.type === 'td_fuse') && !c.props.blown) || (c.type === 'breaker' && !c.props.tripped)) {
          const fNet1 = find(key(c.gx1, c.gy1));
          const fNet2 = find(key(c.gx2, c.gy2));
          // Component is in the short net (either terminal on srcNet1 or srcNet2)
          if (fNet1 === srcNet1 || fNet2 === srcNet1 || fNet1 === srcNet2 || fNet2 === srcNet2) {
            if ((c.type === 'fuse' || c.type === 'lv_fuse' || c.type === 'td_fuse')) { c.props.blown = true; announceToSR('Fuse tripped - overcurrent detected'); }
            if (c.type === 'breaker') { c.props.tripped = true; announceToSR('Breaker tripped - overcurrent detected'); }
            compResults[c.id] = { voltageDrop: 0, current: shortCurrent, watts: 0, resistance: 0 };
            branchCurrents[c.id] = shortCurrent;
            autoSave();
            solveCircuit(); // re-solve with blown fuse
            return;
          }
        }
      }

      // No fuse protection — source overloads
      branchCurrents[src.id] = shortCurrent;
      compResults[src.id] = {
        voltageDrop: voltage, current: shortCurrent, watts: shortWatts,
        resistance: wireResistance,
        overload: true,
        shortCircuit: true
      };

      // Also mark any other sources in the short path as shorted
      for (const otherSrc of sources) {
        if (otherSrc.id === src.id) continue;
        const oN1 = find(key(otherSrc.gx1, otherSrc.gy1));
        const oN2 = find(key(otherSrc.gx2, otherSrc.gy2));
        if (shortCheck.has(oN1) || shortCheck.has(oN2)) {
          const oV = otherSrc.props.voltage;
          const oShortCurrent = oV / wireResistance;
          branchCurrents[otherSrc.id] = oShortCurrent;
          compResults[otherSrc.id] = {
            voltageDrop: oV, current: oShortCurrent, watts: oV * oShortCurrent,
            resistance: wireResistance, overload: true, shortCircuit: true
          };
        }
      }

      // Mark all nodes in the short path as energized
      for (const k of Object.keys(parent)) {
        if (shortCheck.has(find(k))) nodeVoltages[k] = voltage;
      }
      for (const w of wires) {
        for (const k of [key(w.gx1, w.gy1), key(w.gx2, w.gy2)]) {
          if (shortCheck.has(find(k))) nodeVoltages[k] = voltage;
        }
      }

      // Zero out all loads (all shorted — no voltage drop across them)
      for (const ld of loads) {
        const n1 = find(key(ld.gx1, ld.gy1));
        const n2 = find(key(ld.gx2, ld.gy2));
        if (n1 === n2) {
          compResults[ld.id] = { voltageDrop: 0, current: 0, watts: 0, resistance: ld.props.resistance };
          branchCurrents[ld.id] = 0;
        }
      }

      continue;
    }

    // ── Find loads reachable from this source using BFS ──
    // BFS from srcNet1 through loads to find which nets srcNet1 can reach
    const reachFromL1 = new Set([srcNet1]);
    const q1 = [srcNet1];
    while (q1.length > 0) {
      const net = q1.shift();
      for (const ld of loads) {
        const n1 = find(key(ld.gx1, ld.gy1));
        const n2 = find(key(ld.gx2, ld.gy2));
        if (n1 === n2 || ld.props.resistance <= 0) continue;
        if (n1 === net && !reachFromL1.has(n2)) { reachFromL1.add(n2); q1.push(n2); }
        if (n2 === net && !reachFromL1.has(n1)) { reachFromL1.add(n1); q1.push(n1); }
      }
    }
    // BFS from srcNet2 through loads to find which nets srcNet2 can reach
    const reachFromN = new Set([srcNet2]);
    const q2 = [srcNet2];
    while (q2.length > 0) {
      const net = q2.shift();
      for (const ld of loads) {
        const n1 = find(key(ld.gx1, ld.gy1));
        const n2 = find(key(ld.gx2, ld.gy2));
        if (n1 === n2 || ld.props.resistance <= 0) continue;
        if (n1 === net && !reachFromN.has(n2)) { reachFromN.add(n2); q2.push(n2); }
        if (n2 === net && !reachFromN.has(n1)) { reachFromN.add(n1); q2.push(n1); }
      }
    }
    // A load is part of the circuit only if BOTH its terminals can reach
    // both source terminals (forming a complete loop L1 → load → N)
    const reachableNets = new Set();
    for (const n of reachFromL1) { if (reachFromN.has(n)) reachableNets.add(n); }
    // Always include source nets
    reachableNets.add(srcNet1);
    reachableNets.add(srcNet2);

    // Only include loads where BOTH terminals are reachable from BOTH source terminals
    const srcLoads = loads.filter(ld => {
      const n1 = find(key(ld.gx1, ld.gy1));
      const n2 = find(key(ld.gx2, ld.gy2));
      if (n1 === n2 || ld.props.resistance <= 0) return false;
      return reachFromL1.has(n1) && reachFromN.has(n2) || reachFromL1.has(n2) && reachFromN.has(n1);
    });

    // If no loads found but source terminals are connected, it's a short
    if (srcLoads.length === 0 && reachableNets.has(srcNet1) && reachableNets.has(srcNet2)) {
      // Check if the two source nets can reach each other through other sources
      const shortCheck2 = new Set([srcNet1]);
      const sq2 = [srcNet1];
      while (sq2.length > 0) {
        const n = sq2.shift();
        for (const otherSrc of sources) {
          if (otherSrc.id === src.id) continue;
          const oN1 = find(key(otherSrc.gx1, otherSrc.gy1));
          const oN2 = find(key(otherSrc.gx2, otherSrc.gy2));
          if (oN1 === n && !shortCheck2.has(oN2)) { shortCheck2.add(oN2); sq2.push(oN2); }
          if (oN2 === n && !shortCheck2.has(oN1)) { shortCheck2.add(oN1); sq2.push(oN1); }
        }
      }
      if (shortCheck2.has(srcNet2)) {
        // Short through other sources — trigger short circuit
        const wireResistance = CONFIG.MIN_RESISTANCE;
        const shortCurrent = voltage / wireResistance;
        branchCurrents[src.id] = shortCurrent;
        compResults[src.id] = {
          voltageDrop: voltage, current: shortCurrent, watts: voltage * shortCurrent,
          resistance: wireResistance, overload: true, shortCircuit: true
        };
        for (const k of Object.keys(parent)) {
          const net = find(k);
          if (shortCheck2.has(net)) nodeVoltages[k] = voltage;
        }
        continue;
      }
    }
    if (srcLoads.length === 0) {
      // No standard loads, but set node voltages for transformer primary detection
      nodeVoltages[key(src.gx1, src.gy1)] = voltage;
      nodeVoltages[key(src.gx2, src.gy2)] = 0;
      // Set voltages on all nodes in the source nets
      for (const k of Object.keys(parent)) {
        const net = find(k);
        if (net === srcNet1) nodeVoltages[k] = voltage;
        else if (net === srcNet2) nodeVoltages[k] = 0;
      }
      for (const w of wires) {
        for (const k of [key(w.gx1, w.gy1), key(w.gx2, w.gy2)]) {
          const net = find(k);
          if (net === srcNet1) nodeVoltages[k] = voltage;
          else if (net === srcNet2) nodeVoltages[k] = 0;
        }
      }
      // 240V split-phase: shift reference so L1=+120V, L2=-120V (each leg 120V to ground)
      if (src.type === 'ac_240') {
        const shift = voltage / 2;
        for (const k of Object.keys(nodeVoltages)) {
          if (nodeVoltages[k] === undefined) continue;
          const net = find(k);
          if (net === srcNet1 || net === srcNet2) nodeVoltages[k] -= shift;
        }
      }
      // Still set source results (no current, no watts)
      compResults[src.id] = { voltageDrop: voltage, current: 0, watts: 0, resistance: Infinity };
      branchCurrents[src.id] = 0;
      continue;
    }

    // ── Nodal Analysis using conductance matrix ──
    const allNets = new Set([srcNet1, srcNet2]);
    for (const ld of srcLoads) {
      const n1 = find(key(ld.gx1, ld.gy1));
      const n2 = find(key(ld.gx2, ld.gy2));
      allNets.add(n1); allNets.add(n2);
    }

    // Index nets: ground (srcNet2) excluded from matrix
    const netList = [...allNets].filter(n => n !== srcNet2);
    const ni = {}; // net -> index
    netList.forEach((n, i) => ni[n] = i);
    const N = netList.length;
    if (N === 0) continue;

    // Build NxN conductance matrix + N+1 augmented column for known voltages
    // Using regular arrays for reliability
    const A = [];
    for (let i = 0; i < N; i++) { A[i] = []; for (let j = 0; j <= N; j++) A[i][j] = 0; }

    // Stamp conductances (only reachable loads)
    for (const ld of srcLoads) {
      const n1 = find(key(ld.gx1, ld.gy1));
      const n2 = find(key(ld.gx2, ld.gy2));
      const g = 1 / ld.props.resistance;
      const i1 = ni[n1], i2 = ni[n2]; // undefined if ground
      if (i1 !== undefined) A[i1][i1] += g;
      if (i2 !== undefined) A[i2][i2] += g;
      if (i1 !== undefined && i2 !== undefined) { A[i1][i2] -= g; A[i2][i1] -= g; }
    }

    // Voltage source: V(srcNet1) = voltage
    const si = ni[srcNet1];
    if (si === undefined) continue;
    for (let j = 0; j < N; j++) A[si][j] = 0;
    A[si][si] = 1;
    A[si][N] = voltage; // RHS

    // Gaussian elimination with partial pivoting (inline, no separate function needed)
    let singular = false;
    for (let col = 0; col < N; col++) {
      let maxR = col, maxV = Math.abs(A[col][col]);
      for (let r = col + 1; r < N; r++) { if (Math.abs(A[r][col]) > maxV) { maxV = Math.abs(A[r][col]); maxR = r; } }
      if (maxV < 1e-12) {
        // Matrix is singular — no unique solution.  Zero every load on this source
        // and move on; falling through to back substitution here would divide by a
        // ~0 pivot and feed garbage into the per-load results.
        for (const ld of srcLoads) {
          branchCurrents[ld.id] = 0;
          compResults[ld.id] = { voltageDrop: 0, current: 0, watts: 0, resistance: ld.props.resistance };
        }
        branchCurrents[src.id] = 0;
        compResults[src.id] = { voltageDrop: voltage, current: 0, watts: 0, resistance: Infinity, overload: false };
        singular = true;
        break;
      }
      if (maxR !== col) { const tmp = A[col]; A[col] = A[maxR]; A[maxR] = tmp; }
      for (let r = col + 1; r < N; r++) {
        const f = A[r][col] / A[col][col];
        for (let j = col; j <= N; j++) A[r][j] -= f * A[col][j];
      }
    }
    if (singular) continue; // next source
    // Back substitution
    const Vn = new Array(N).fill(0);
    for (let i = N - 1; i >= 0; i--) {
      Vn[i] = A[i][N];
      for (let j = i + 1; j < N; j++) Vn[i] -= A[i][j] * Vn[j];
      Vn[i] /= A[i][i];
      if (!isFinite(Vn[i])) Vn[i] = 0;
    }

    // ── Calculate per-load results from solved voltages ──
    for (const ld of srcLoads) {
      const n1 = find(key(ld.gx1, ld.gy1));
      const n2 = find(key(ld.gx2, ld.gy2));
      const v1 = (n1 === srcNet2) ? 0 : (ni[n1] !== undefined ? Vn[ni[n1]] : 0);
      const v2 = (n2 === srcNet2) ? 0 : (ni[n2] !== undefined ? Vn[ni[n2]] : 0);
      const vDrop = Math.abs(v1 - v2);
      const ldI = vDrop / ld.props.resistance;
      const S = ldI * vDrop; // apparent power (VA)
      const pf = (ld.props.powerFactor && compSourceType(ld) !== 'DC') ? ld.props.powerFactor : 1.0;
      const realP = S * pf;
      branchCurrents[ld.id] = ldI;
      compResults[ld.id] = { voltageDrop: vDrop, current: ldI, watts: realP, resistance: ld.props.resistance,
        ...(pf < 1 ? { apparentPower: S, reactivePower: S * Math.sqrt(1 - pf * pf), powerFactor: pf, phaseAngle: Math.acos(pf) * (180 / Math.PI) } : {}) };
      if (ld.type === 'bulb' || ld.type === 'fan') ld.props._actualWatts = realP;
      if (ld.props._impedance) { compResults[ld.id].impedance = ld.props._impedance; compResults[ld.id].reactance = ld.props._XL; }
      if (ld.props._origResistance) compResults[ld.id].trueResistance = ld.props._origResistance;
      // Apply back-EMF: motor generates counter-voltage when spinning
      // At running speed, effective voltage = V × (1 - backEMF)
      if (ld.props._emfReduction && ld.props._emfReduction > 0) {
        const emfFactor = 1 - ld.props._emfReduction;
        compResults[ld.id].current *= emfFactor;
        compResults[ld.id].watts *= emfFactor;
        if (compResults[ld.id].apparentPower) compResults[ld.id].apparentPower *= emfFactor;
        if (compResults[ld.id].reactivePower) compResults[ld.id].reactivePower *= emfFactor;
        compResults[ld.id]._backEMF = ld.props._emfReduction;
        compResults[ld.id]._speedFactor = ld.props._speedFactor;
        branchCurrents[ld.id] = compResults[ld.id].current;
        if (ld.type === 'fan') ld.props._actualWatts = compResults[ld.id].watts;
      }
      // Apply startup surge: multiply running current by surge factor
      if (_surgeLookup[ld.id]) {
        const sf = _surgeLookup[ld.id];
        compResults[ld.id].current *= sf;
        compResults[ld.id].watts *= sf;
        if (compResults[ld.id].apparentPower) compResults[ld.id].apparentPower *= sf;
        if (compResults[ld.id].reactivePower) compResults[ld.id].reactivePower *= sf;
        compResults[ld.id]._surgeFactor = sf;
        branchCurrents[ld.id] = compResults[ld.id].current;
        if (ld.type === 'fan') ld.props._actualWatts = compResults[ld.id].watts;
      }
    }

    // ── Total source current (KCL at srcNet1) ──
    let totalCurrent = 0;
    for (const ld of srcLoads) {
      const n1 = find(key(ld.gx1, ld.gy1));
      const n2 = find(key(ld.gx2, ld.gy2));
      if (n1 === srcNet1 || n2 === srcNet1) {
        totalCurrent += compResults[ld.id].current;
      }
    }
    // Fallback for series with fuse/switch between source and first load
    if (totalCurrent < 1e-9) {
      for (const ld of srcLoads) {
        if (compResults[ld.id] && compResults[ld.id].current > 0) {
          totalCurrent = Math.max(totalCurrent, compResults[ld.id].current);
        }
      }
    }

    const totalWatts = srcLoads.reduce((sum, ld) => sum + (compResults[ld.id] ? compResults[ld.id].watts : 0), 0);
    const totalResistance = totalCurrent > 0 ? voltage / totalCurrent : Infinity;
    branchCurrents[src.id] = totalCurrent;
    compResults[src.id] = {
      voltageDrop: voltage, current: totalCurrent, watts: totalWatts,
      resistance: totalResistance,
      overload: false
    };

    // ── Mark node voltages for wire rendering ──
    for (const k of Object.keys(parent)) {
      const net = find(k);
      if (net === srcNet2) nodeVoltages[k] = 0;
      else if (ni[net] !== undefined) nodeVoltages[k] = Vn[ni[net]];
    }
    nodeVoltages[key(src.gx1, src.gy1)] = voltage;
    nodeVoltages[key(src.gx2, src.gy2)] = 0;
    // Fill any remaining wire nodes
    for (const w of wires) {
      for (const k of [key(w.gx1, w.gy1), key(w.gx2, w.gy2)]) {
        if (nodeVoltages[k] === undefined) {
          const net = find(k);
          if (net === srcNet2) nodeVoltages[k] = 0;
          else if (ni[net] !== undefined) nodeVoltages[k] = Vn[ni[net]];
        }
      }
    }
    // 240V split-phase: shift reference so L1=+120V, L2=-120V (each leg 120V to ground)
    if (src.type === 'ac_240') {
      const shift = voltage / 2;
      for (const k of Object.keys(nodeVoltages)) {
        if (nodeVoltages[k] === undefined) continue;
        const net = find(k);
        if (net === srcNet1 || net === srcNet2) nodeVoltages[k] -= shift;
      }
    }

    // ── Fuse and Switch: find current through zero-resistance components ──
    // Since fuses/switches are merged into nets, find the current flowing
    // through their net by summing load currents on connected loads.
    for (const c of components) {
      if (((c.type === 'fuse' || c.type === 'lv_fuse' || c.type === 'td_fuse') && !c.props.blown) || ((c.type === 'switch' || c.type === 'time_delay') && c.props.closed) || ((c.type === 'contactor_contact' || c.type === 'relay_contact') && c.props.contactClosed) || (c.type === 'breaker' && !c.props.tripped)) {
        const cNet = find(key(c.gx1, c.gy1));
        if (nodeVoltages[key(c.gx1, c.gy1)] === undefined) continue;

        // Find loads that have a terminal on this component's net
        // and sum their currents. If the component is on the main trunk
        // (srcNet1 or srcNet2), use total current.
        let currentThrough = 0;
        if (cNet === srcNet1 || cNet === srcNet2) {
          currentThrough = totalCurrent;
        } else {
          for (const ld of srcLoads) {
            if (!compResults[ld.id]) continue;
            const ln1 = find(key(ld.gx1, ld.gy1));
            const ln2 = find(key(ld.gx2, ld.gy2));
            if (ln1 === cNet || ln2 === cNet) {
              currentThrough = Math.max(currentThrough, compResults[ld.id].current);
            }
          }
        }
        if (currentThrough === 0) currentThrough = totalCurrent;

        compResults[c.id] = { voltageDrop: 0, current: currentThrough, watts: 0, resistance: 0 };
        branchCurrents[c.id] = currentThrough;

        // Blow fuse if over-current
        if ((c.type === 'fuse' || c.type === 'lv_fuse') && currentThrough > c.props.ratedAmps) {
          c.props.blown = true;
          autoSave();
          solveCircuit();
          return;
        }
        // Time delay fuse: instant blow at ≥10× rated, delayed blow for moderate overcurrent
        if (c.type === 'td_fuse' && currentThrough > c.props.ratedAmps) {
          if (currentThrough >= c.props.ratedAmps * 10) {
            // Extreme overcurrent — blow instantly
            c.props.blown = true;
            autoSave();
            solveCircuit();
            return;
          }
          // Moderate overcurrent — start/continue delay timer
          if (!c.props._ocStartTime) c.props._ocStartTime = animTime;
          if (animTime - c.props._ocStartTime >= c.props.delaySeconds) {
            c.props.blown = true;
            c.props._ocStartTime = null;
            autoSave();
            solveCircuit();
            return;
          }
        } else if (c.type === 'td_fuse') {
          // Current within rating — reset timer
          c.props._ocStartTime = null;
        }
        // Trip breaker if over-current (with time delay for moderate overcurrent)
        if (c.type === 'breaker' && currentThrough > c.props.ratedAmps) {
          if (currentThrough >= c.props.ratedAmps * 10) {
            // Extreme overcurrent — trip instantly
            c.props.tripped = true;
            autoSave();
            solveCircuit();
            return;
          }
          // Moderate overcurrent — start/continue delay timer
          if (!c.props._ocStartTime) c.props._ocStartTime = animTime;
          if (animTime - c.props._ocStartTime >= c.props.delaySeconds) {
            c.props.tripped = true;
            c.props._ocStartTime = null;
            autoSave();
            solveCircuit();
            return;
          }
        } else if (c.type === 'breaker') {
          // Current within rating — reset timer
          c.props._ocStartTime = null;
        }
      }
    }
  }

  // ── Aggregate 3-phase source results ──
  // For ac_480, merge results from virtual pairings into the original component
  for (const src of sources) {
    if (src.type === 'ac_480' && src.gx3 !== undefined) {
      const r12 = compResults[src.id] || {};
      const r23 = compResults[src.id + '_23'] || {};
      const r13 = compResults[src.id + '_13'] || {};
      compResults[src.id] = {
        voltageDrop: src.props.voltage,
        current: (r12.current || 0) + (r23.current || 0) + (r13.current || 0),
        watts: (r12.watts || 0) + (r23.watts || 0) + (r13.watts || 0),
        resistance: 0,
        overload: r12.overload || r23.overload || r13.overload || false,
        shortCircuit: r12.shortCircuit || r23.shortCircuit || r13.shortCircuit || false
      };
      branchCurrents[src.id] = compResults[src.id].current;
    }
    if (src.type === 'ac_480_wye' && src.gx4 !== undefined) {
      const r12 = compResults[src.id] || {};
      const r23 = compResults[src.id + '_23'] || {};
      const r13 = compResults[src.id + '_13'] || {};
      const r1n = compResults[src.id + '_1n'] || {};
      const r2n = compResults[src.id + '_2n'] || {};
      const r3n = compResults[src.id + '_3n'] || {};
      compResults[src.id] = {
        voltageDrop: src.props.voltage,
        current: (r12.current||0) + (r23.current||0) + (r13.current||0) + (r1n.current||0) + (r2n.current||0) + (r3n.current||0),
        watts: (r12.watts||0) + (r23.watts||0) + (r13.watts||0) + (r1n.watts||0) + (r2n.watts||0) + (r3n.watts||0),
        resistance: 0,
        overload: r12.overload || r23.overload || r13.overload || r1n.overload || r2n.overload || r3n.overload || false,
        shortCircuit: r12.shortCircuit || r23.shortCircuit || r13.shortCircuit || r1n.shortCircuit || r2n.shortCircuit || r3n.shortCircuit || false
      };
      branchCurrents[src.id] = compResults[src.id].current;
    }
  }

  // ── Ensure all phase terminals of 3-phase sources have non-zero nodeVoltages ──
  // The solver assigns one terminal per pairing as 0V reference, which can leave a hot
  // phase leg at 0V in nodeVoltages. This breaks NCV, energized colors, and voltage reads.
  // Set any 0V phase net to the source voltage so it registers as hot everywhere.
  for (const src of sources) {
    if (src.props.on === false) continue;
    const srcV = src.props.voltage || 0;
    const phaseTerms = [];
    if (src.type === 'ac_480' && src.gx3 !== undefined) {
      phaseTerms.push([src.gx1, src.gy1], [src.gx2, src.gy2], [src.gx3, src.gy3]);
    } else if (src.type === 'ac_480_wye' && src.gx4 !== undefined) {
      phaseTerms.push([src.gx1, src.gy1], [src.gx2, src.gy2], [src.gx3, src.gy3]);
    }
    for (const [gx, gy] of phaseTerms) {
      const termNet = find(key(gx, gy));
      if (nodeVoltages[key(gx, gy)] === 0 || !nodeVoltages[key(gx, gy)]) {
        // Propagate srcV to all nodes in this phase net
        for (const k of Object.keys(nodeVoltages)) {
          if (find(k) === termNet) nodeVoltages[k] = srcV;
        }
      }
    }
  }

  // ── Transformer solver: treat secondary as virtual voltage source ──
  const transformers = components.filter(c => c.type === 'transformer' && c.gx3 !== undefined);
  for (const xfmr of transformers) {
    const priNet1 = find(key(xfmr.gx1, xfmr.gy1));
    const priNet2 = find(key(xfmr.gx2, xfmr.gy2));
    const secNet1 = find(key(xfmr.gx3, xfmr.gy3));
    const secNet2 = find(key(xfmr.gx4, xfmr.gy4));

    // Verify BOTH primary terminals are connected to a source (complete primary circuit)
    // Primary needs L1 connected to one source terminal AND N connected to the other
    let priHasCompleteCircuit = false;
    let priVoltage = 0;
    for (const src of sources) {
      const sNet1 = find(key(src.gx1, src.gy1)); // L1 side of source
      const sNet2 = find(key(src.gx2, src.gy2)); // N side of source
      // Check if transformer primary terminals connect to BOTH source terminals
      if ((priNet1 === sNet1 && priNet2 === sNet2) || (priNet1 === sNet2 && priNet2 === sNet1)) {
        priHasCompleteCircuit = true;
        priVoltage = src.props.voltage;
        break;
      }
    }

    // Check if primary is fed by DC — transformers require AC (changing magnetic flux)
    let priSourceIsDC = false;
    for (const src of sources) {
      if (src.type !== 'dc_source') continue;
      const sNet1 = find(key(src.gx1, src.gy1));
      const sNet2 = find(key(src.gx2, src.gy2));
      if ((priNet1 === sNet1 && priNet2 === sNet2) || (priNet1 === sNet2 && priNet2 === sNet1)) {
        priSourceIsDC = true;
        break;
      }
    }

    if (priSourceIsDC || !priHasCompleteCircuit || priVoltage < 0.01 || secNet1 === secNet2) {
      // DC source: transformer cannot induce voltage (no changing flux)
      // Also handles: no complete primary circuit or secondary shorted
      compResults[xfmr.id] = {
        voltageDrop: priSourceIsDC ? priVoltage : 0, current: 0, watts: 0, resistance: Infinity,
        secVoltage: 0, secCurrent: 0, secWatts: 0,
        _dcBlocked: priSourceIsDC
      };
      continue;
    }

    // Calculate secondary voltage using turns ratio
    const ratio = xfmr.props.secondaryVoltage / xfmr.props.primaryVoltage;
    const secVoltage = priVoltage * ratio;

    // Find loads reachable from secondary terminals (BFS through loads)
    const secReachFromT1 = new Set([secNet1]);
    const sq1 = [secNet1];
    while (sq1.length > 0) {
      const net = sq1.shift();
      for (const ld of loads) {
        const n1 = find(key(ld.gx1, ld.gy1));
        const n2 = find(key(ld.gx2, ld.gy2));
        if (n1 === n2 || ld.props.resistance <= 0) continue;
        if (n1 === net && !secReachFromT1.has(n2)) { secReachFromT1.add(n2); sq1.push(n2); }
        if (n2 === net && !secReachFromT1.has(n1)) { secReachFromT1.add(n1); sq1.push(n1); }
      }
    }
    const secReachFromT2 = new Set([secNet2]);
    const sq2 = [secNet2];
    while (sq2.length > 0) {
      const net = sq2.shift();
      for (const ld of loads) {
        const n1 = find(key(ld.gx1, ld.gy1));
        const n2 = find(key(ld.gx2, ld.gy2));
        if (n1 === n2 || ld.props.resistance <= 0) continue;
        if (n1 === net && !secReachFromT2.has(n2)) { secReachFromT2.add(n2); sq2.push(n2); }
        if (n2 === net && !secReachFromT2.has(n1)) { secReachFromT2.add(n1); sq2.push(n1); }
      }
    }

    const secLoads = loads.filter(ld => {
      if (compResults[ld.id]) return false; // already solved by a source
      const n1 = find(key(ld.gx1, ld.gy1));
      const n2 = find(key(ld.gx2, ld.gy2));
      if (n1 === n2 || ld.props.resistance <= 0) return false;
      return (secReachFromT1.has(n1) && secReachFromT2.has(n2)) ||
             (secReachFromT1.has(n2) && secReachFromT2.has(n1));
    });

    if (secLoads.length === 0) {
      // No secondary loads — open secondary, no current
      compResults[xfmr.id] = {
        voltageDrop: priVoltage, current: 0, watts: 0, resistance: Infinity,
        secVoltage: secVoltage, secCurrent: 0, secWatts: 0
      };
      // Set secondary node voltages — propagate to ALL nodes in each secondary net
      nodeVoltages[key(xfmr.gx3, xfmr.gy3)] = secVoltage;
      nodeVoltages[key(xfmr.gx4, xfmr.gy4)] = 0;
      for (const k of Object.keys(parent)) {
        const net = find(k);
        if (net === secNet1) nodeVoltages[k] = secVoltage;
        else if (net === secNet2) nodeVoltages[k] = 0;
      }
      for (const w of wires) {
        for (const k of [key(w.gx1, w.gy1), key(w.gx2, w.gy2)]) {
          const net = find(k);
          if (net === secNet1) nodeVoltages[k] = secVoltage;
          else if (net === secNet2) nodeVoltages[k] = 0;
        }
      }
      continue;
    }

    // Nodal analysis on secondary circuit (same approach as main solver)
    const secAllNets = new Set([secNet1, secNet2]);
    for (const ld of secLoads) {
      secAllNets.add(find(key(ld.gx1, ld.gy1)));
      secAllNets.add(find(key(ld.gx2, ld.gy2)));
    }
    const secNetList = [...secAllNets].filter(n => n !== secNet2);
    const sni = {};
    secNetList.forEach((n, i) => sni[n] = i);
    const sN = secNetList.length;

    if (sN === 0) continue;

    const sA = [];
    for (let i = 0; i < sN; i++) { sA[i] = []; for (let j = 0; j <= sN; j++) sA[i][j] = 0; }

    for (const ld of secLoads) {
      const n1 = find(key(ld.gx1, ld.gy1));
      const n2 = find(key(ld.gx2, ld.gy2));
      const g = 1 / ld.props.resistance;
      const i1 = sni[n1], i2 = sni[n2];
      if (i1 !== undefined) sA[i1][i1] += g;
      if (i2 !== undefined) sA[i2][i2] += g;
      if (i1 !== undefined && i2 !== undefined) { sA[i1][i2] -= g; sA[i2][i1] -= g; }
    }

    const ssi = sni[secNet1];
    if (ssi === undefined) continue;
    for (let j = 0; j < sN; j++) sA[ssi][j] = 0;
    sA[ssi][ssi] = 1;
    sA[ssi][sN] = secVoltage;

    // Gaussian elimination
    let singular = false;
    for (let col = 0; col < sN; col++) {
      let maxR = col, maxV = Math.abs(sA[col][col]);
      for (let r = col + 1; r < sN; r++) { if (Math.abs(sA[r][col]) > maxV) { maxV = Math.abs(sA[r][col]); maxR = r; } }
      if (Math.abs(maxV) < 1e-12) { 
        singular = true;
        break;
      }
      if (maxR !== col) { const tmp = sA[col]; sA[col] = sA[maxR]; sA[maxR] = tmp; }
      for (let r = col + 1; r < sN; r++) {
        const f = sA[r][col] / sA[col][col];
        for (let j = col; j <= sN; j++) sA[r][j] -= f * sA[col][j];
      }
    }
    const sVn = new Array(sN).fill(0);
    for (let i = sN - 1; i >= 0; i--) {
      sVn[i] = sA[i][sN];
      for (let j = i + 1; j < sN; j++) sVn[i] -= sA[i][j] * sVn[j];
      sVn[i] /= sA[i][i];
      if (!isFinite(sVn[i])) sVn[i] = 0;
    }

    // Calculate secondary load results
    let totalSecCurrent = 0;
    for (const ld of secLoads) {
      const n1 = find(key(ld.gx1, ld.gy1));
      const n2 = find(key(ld.gx2, ld.gy2));
      const v1 = (n1 === secNet2) ? 0 : (sni[n1] !== undefined ? sVn[sni[n1]] : 0);
      const v2 = (n2 === secNet2) ? 0 : (sni[n2] !== undefined ? sVn[sni[n2]] : 0);
      const vDrop = Math.abs(v1 - v2);
      const ldI = vDrop / ld.props.resistance;
      const S = ldI * vDrop; // apparent power (VA)
      const pf = ld.props.powerFactor || 1.0;
      const realP = S * pf;
      branchCurrents[ld.id] = ldI;
      compResults[ld.id] = { voltageDrop: vDrop, current: ldI, watts: realP, resistance: ld.props.resistance,
        ...(pf < 1 ? { apparentPower: S, reactivePower: S * Math.sqrt(1 - pf * pf), powerFactor: pf, phaseAngle: Math.acos(pf) * (180 / Math.PI) } : {}) };
      if (ld.type === 'bulb' || ld.type === 'fan') ld.props._actualWatts = realP;
      if (ld.props._impedance) { compResults[ld.id].impedance = ld.props._impedance; compResults[ld.id].reactance = ld.props._XL; }
      if (ld.props._origResistance) compResults[ld.id].trueResistance = ld.props._origResistance;
      if (_surgeLookup[ld.id]) {
        const sf = _surgeLookup[ld.id];
        compResults[ld.id].current *= sf;
        compResults[ld.id].watts *= sf;
        if (compResults[ld.id].apparentPower) compResults[ld.id].apparentPower *= sf;
        if (compResults[ld.id].reactivePower) compResults[ld.id].reactivePower *= sf;
        compResults[ld.id]._surgeFactor = sf;
        branchCurrents[ld.id] = compResults[ld.id].current;
        if (ld.type === 'fan') ld.props._actualWatts = compResults[ld.id].watts;
      }
      if (n1 === secNet1 || n2 === secNet1) totalSecCurrent += ldI;
    }
    if (totalSecCurrent < 1e-9) {
      for (const ld of secLoads) {
        if (compResults[ld.id] && compResults[ld.id].current > 0)
          totalSecCurrent = Math.max(totalSecCurrent, compResults[ld.id].current);
      }
    }

    const secWatts = secVoltage * totalSecCurrent;
    // Reflect power back to primary: P_pri = P_sec (ideal transformer)
    const priCurrent = priVoltage > 0 ? secWatts / priVoltage : 0;

    compResults[xfmr.id] = {
      voltageDrop: priVoltage, current: priCurrent, watts: secWatts,
      resistance: priCurrent > 0 ? priVoltage / priCurrent : Infinity,
      secVoltage: secVoltage, secCurrent: totalSecCurrent, secWatts: secWatts
    };
    branchCurrents[xfmr.id] = priCurrent;

    // Update the AC source feeding this transformer to reflect the primary draw
    const processedSources = new Set();
    for (const src of sources) {
      const sNet1 = find(key(src.gx1, src.gy1));
      const sNet2 = find(key(src.gx2, src.gy2));
      if ((priNet1 === sNet1 || priNet1 === sNet2) && (priNet2 === sNet1 || priNet2 === sNet2)) {
        if (!processedSources.has(src.id) && compResults[src.id]) {
          processedSources.add(src.id);
          compResults[src.id].current += priCurrent;
          compResults[src.id].watts += secWatts;
          branchCurrents[src.id] = compResults[src.id].current;
        }
      }
    }

    // Set secondary node voltages
    nodeVoltages[key(xfmr.gx3, xfmr.gy3)] = secVoltage;
    nodeVoltages[key(xfmr.gx4, xfmr.gy4)] = 0;
    for (const k of Object.keys(parent)) {
      const net = find(k);
      if (net === secNet2) nodeVoltages[k] = 0;
      else if (sni[net] !== undefined) nodeVoltages[k] = sVn[sni[net]];
    }
    for (const w of wires) {
      for (const k of [key(w.gx1, w.gy1), key(w.gx2, w.gy2)]) {
        if (nodeVoltages[k] === undefined) {
          const net = find(k);
          if (net === secNet2) nodeVoltages[k] = 0;
          else if (sni[net] !== undefined) nodeVoltages[k] = sVn[sni[net]];
        }
      }
    }

    // Check fuses/breakers on secondary side
    for (const c of components) {
      if (((c.type === 'fuse' || c.type === 'lv_fuse' || c.type === 'td_fuse') && !c.props.blown) || ((c.type === 'switch' || c.type === 'time_delay') && c.props.closed) || ((c.type === 'contactor_contact' || c.type === 'relay_contact') && c.props.contactClosed) || (c.type === 'breaker' && !c.props.tripped)) {
        const cNet = find(key(c.gx1, c.gy1));
        if (!secReachFromT1.has(cNet) && !secReachFromT2.has(cNet)) continue;
        if (nodeVoltages[key(c.gx1, c.gy1)] === undefined) continue;
        // Calculate per-branch current based on loads connected to this contact's net
        let currentThrough = 0;
        for (const ld of secLoads) {
          const ln1 = find(key(ld.gx1, ld.gy1));
          const ln2 = find(key(ld.gx2, ld.gy2));
          if (ln1 === cNet || ln2 === cNet) {
            currentThrough = Math.max(currentThrough, compResults[ld.id].current);
          }
        }
        if (currentThrough === 0) currentThrough = totalSecCurrent;
        compResults[c.id] = { voltageDrop: 0, current: currentThrough, watts: 0, resistance: 0 };
        branchCurrents[c.id] = currentThrough;
        if ((c.type === 'fuse' || c.type === 'lv_fuse') && currentThrough > c.props.ratedAmps) {
          c.props.blown = true; autoSave(); solveCircuit(); return;
        }
        if (c.type === 'td_fuse' && currentThrough > c.props.ratedAmps) {
          if (currentThrough >= c.props.ratedAmps * 10) {
            c.props.blown = true; autoSave(); solveCircuit(); return;
          }
          if (!c.props._ocStartTime) c.props._ocStartTime = animTime;
          if (animTime - c.props._ocStartTime >= c.props.delaySeconds) {
            c.props.blown = true; c.props._ocStartTime = null; autoSave(); solveCircuit(); return;
          }
        } else if (c.type === 'td_fuse') {
          c.props._ocStartTime = null;
        }
        if (c.type === 'breaker' && currentThrough > c.props.ratedAmps) {
          if (currentThrough >= c.props.ratedAmps * 10) {
            c.props.tripped = true; autoSave(); solveCircuit(); return;
          }
          if (!c.props._ocStartTime) c.props._ocStartTime = animTime;
          if (animTime - c.props._ocStartTime >= c.props.delaySeconds) {
            c.props.tripped = true; c.props._ocStartTime = null; autoSave(); solveCircuit(); return;
          }
        } else if (c.type === 'breaker') {
          c.props._ocStartTime = null;
        }
      }
    }
  }
  // ── Time delay relay countdown — only when electricity is reaching it ──
  for (const c of components) {
    if (c.type !== 'time_delay') continue;
    if (c.props.closed) continue; // already active

    // Check if power is reaching this component (either terminal has voltage)
    const k1 = c.gx1 + ',' + c.gy1;
    const k2 = c.gx2 + ',' + c.gy2;
    const hasVoltage = (nodeVoltages[k1] !== undefined && nodeVoltages[k1] !== 0) ||
                       (nodeVoltages[k2] !== undefined && nodeVoltages[k2] !== 0);

    if (!hasVoltage) {
      // No power — reset countdown
      c.props._counting = false;
      c.props._remainingTime = c.props.delaySeconds;
      continue;
    }

    // Countdown runs on animTime (the simulation clock), like every other timer
    // here. Date.now() kept ticking while the sim was paused, and _startTime is
    // persisted with the circuit, so a reload made the elapsed time enormous and
    // the contact snapped closed the instant power arrived.
    if (!c.props._counting) {
      // Power just arrived — start countdown
      c.props._counting = true;
      c.props._startTime = animTime;
      c.props._remainingTime = c.props.delaySeconds;
    } else {
      // Guard: ensure _startTime is set when _counting is true
      if (typeof c.props._startTime !== 'number' || !isFinite(c.props._startTime)) {
        c.props._startTime = animTime;
      }
      const elapsed = Math.max(0, animTime - c.props._startTime);
      c.props._remainingTime = Math.max(0, c.props.delaySeconds - elapsed);
      if (c.props._remainingTime <= 0) {
        c.props.closed = true;
        c.props._counting = false;
        c.props._remainingTime = 0;
        // Will re-solve on next iteration to propagate the contact closure
      }
    }
  }

  // ── Coil excitation voltage ──
  // A node the solver never reached has NO entry in nodeVoltages — that means the
  // terminal is floating (open switch upstream, broken return leg), not that it sits
  // at 0 V.  Treating a floating terminal as 0 V made a coil fed hot on one side read
  // full coil voltage and stay picked up forever with its control switch open.
  // A coil needs a complete circuit — both terminals solved — to develop any drop.
  function coilVoltageDrop(coil) {
    const v1 = nodeVoltages[key(coil.gx1, coil.gy1)];
    const v2 = nodeVoltages[key(coil.gx2, coil.gy2)];
    if (v1 === undefined || v2 === undefined) return 0; // open circuit — no excitation
    return Math.abs(v1 - v2);
  }

  // ── Contactor: sync coil → contacts by matching contactorGroup ──
  // Runs after transformer solver so coils on secondary side have correct voltages
  let contactorChanged = false;
  const coilGroupEnergized = {};
  for (const coil of components) {
    if (coil.type !== 'contactor_coil') continue;
    if (coil.props.faultMode === 'open') continue;
    const vDrop = coilVoltageDrop(coil);

    // Hysteresis: pickup at 80%, dropout at 60%
    const coilV = coil.props.coilVoltage || 24; // Default 24V if not set
    let isEnergized;
    if (!coil.props._wasEnergized) {
      // Not currently energized, needs 80% to pick up
      isEnergized = vDrop >= coilV * 0.8;
    } else {
      // Already energized, needs to drop below 60% to dropout
      isEnergized = vDrop >= coilV * 0.6;
    }
    coil.props._wasEnergized = isEnergized;
    
    // Use OR so if ANY coil in the group is energized, the group is energized
    coilGroupEnergized[coil.props.contactorGroup] = (coilGroupEnergized[coil.props.contactorGroup] || false) || isEnergized;
  }
  for (const contact of components) {
    if (contact.type !== 'contactor_contact') continue;
    const shouldClose = coilGroupEnergized[contact.props.contactorGroup] || false;
    if (contact.props.contactClosed !== shouldClose) {
      contact.props.contactClosed = shouldClose;
      contactorChanged = true;
    }
  }
  if (contactorChanged) {
    // Check for oscillation: if this state has been seen before, stop recursing
    const currentState = JSON.stringify(
      components.filter(c => c.type === 'contactor_contact').map(c => ({ id: c.id, closed: c.props.contactClosed }))
    );
    if (_solveStateHistory.includes(currentState)) {
      // Oscillation detected, stop recursing
      console.warn('Contactor oscillation detected, stopping recursion');
    } else {
      _solveStateHistory.push(currentState);
      if (_solveStateHistory.length > 10) _solveStateHistory.shift(); // Keep history limited
      solveCircuit();
      return;
    }
  }

  // ── Relay: sync coil → contacts by matching relayGroup (supports NO/NC) ──
  let relayChanged = false;
  const relayGroupEnergized = {};
  for (const coil of components) {
    if (coil.type !== 'relay_coil') continue;
    if (coil.props.faultMode === 'open') continue;
    const vDrop = coilVoltageDrop(coil);

    // Hysteresis: pickup at 80%, dropout at 60%
    const coilV = coil.props.coilVoltage || 24;
    let isEnergized;
    if (!coil.props._wasEnergized) {
      isEnergized = vDrop >= coilV * 0.8;
    } else {
      isEnergized = vDrop >= coilV * 0.6;
    }
    coil.props._wasEnergized = isEnergized;

    relayGroupEnergized[coil.props.relayGroup] = (relayGroupEnergized[coil.props.relayGroup] || false) || isEnergized;
  }
  for (const contact of components) {
    if (contact.type !== 'relay_contact') continue;
    const groupOn = relayGroupEnergized[contact.props.relayGroup] || false;
    contact.props._coilEnergized = groupOn;
    // NO = closes when energized; NC = opens when energized (inverted)
    const shouldClose = contact.props.contactMode === 'NC' ? !groupOn : groupOn;
    if (contact.props.contactClosed !== shouldClose) {
      contact.props.contactClosed = shouldClose;
      relayChanged = true;
    }
  }
  if (relayChanged) {
    const currentState = JSON.stringify(
      components.filter(c => c.type === 'relay_contact').map(c => ({ id: c.id, closed: c.props.contactClosed }))
    );
    if (_solveStateHistory.includes(currentState)) {
      console.warn('Relay oscillation detected, stopping recursion');
    } else {
      _solveStateHistory.push(currentState);
      if (_solveStateHistory.length > 10) _solveStateHistory.shift();
      solveCircuit();
      return;
    }
  }
  // ── Ground fault detection ──
  // A fault occurs when an earth ground is NOT the neutral bond AND is connected to
  // live circuit nodes — detected via current flow or raw voltage on the earth bus.
  if (_earthPreBond.size > 0) {
    const earthV = nodeVoltages['999999,0'] || 0;
    const circuitCurrent = components.reduce((max, c) => {
      if (isSource(c.type) || c.type === 'earth_ground') return max;
      return Math.max(max, Math.abs(compResults[c.id]?.current || 0));
    }, 0);
    for (const c of components) {
      if (c.type !== 'earth_ground') continue;
      if (!compResults[c.id]) compResults[c.id] = {};
      const preBondRoot = _earthPreBond.get(c.id);
      const isNeutralBond = _neutralPreBond.has(preBondRoot);
      const isConnected  = _circuitNets.has(preBondRoot);
      compResults[c.id]._groundFault   = !isNeutralBond && isConnected && (circuitCurrent > 0.01 || Math.abs(earthV) > 0.5);
      compResults[c.id]._faultVoltage  = earthV;
      compResults[c.id]._faultCurrent  = circuitCurrent;
    }
  }

  // ── Tag every component with its per-net source type (AC/DC/AC·DC) ──
  for (const c of components) {
    if (!compResults[c.id]) compResults[c.id] = {};
    compResults[c.id]._sourceType = compSourceType(c);
  }

  // ── Merge compressor winding results into single component result ──
  for (const c of components) {
    if (c.type !== 'compressor') continue;
    const runCr = compResults[c.id + '_run'] || { current: 0, watts: 0, voltageDrop: 0 };
    const startCr = compResults[c.id + '_start'] || { current: 0, watts: 0, voltageDrop: 0 };
    compResults[c.id] = {
      voltageDrop: Math.max(runCr.voltageDrop || 0, startCr.voltageDrop || 0),
      current: (runCr.current || 0) + (startCr.current || 0),
      runCurrent: runCr.current || 0,
      startCurrent: startCr.current || 0,
      watts: (runCr.watts || 0) + (startCr.watts || 0),
      runWatts: runCr.watts || 0,
      startWatts: startCr.watts || 0,
      resistance: c.props.runResistance,
      _sourceType: compSourceType(c),
      _surgeFactor: runCr._surgeFactor || startCr._surgeFactor
    };
    if (runCr.impedance) compResults[c.id].runImpedance = runCr.impedance;
    if (startCr.impedance) compResults[c.id].startImpedance = startCr.impedance;
    // Tag start winding cutout state + model back-EMF at S terminal
    if (c.props.startCutout && simRunning) {
      const ss = surgeState[c.id];
      const elapsed = ss ? Math.max(0, animTime - ss.startTime) : 0;
      const isCutout = elapsed >= (c.props.startCutoutTime || 1.5);
      compResults[c.id]._startCutout = isCutout;
      if (isCutout && c.gx3 !== undefined) {
        branchCurrents[c.id + '_start'] = 0;
        // Back-EMF: spinning rotor induces voltage in the start winding (still connected S→C internally).
        // Turns ratio ≈ √(R_start/R_run); V_S = V_nominal × turnsRatio × speedFactor.
        // Open-start fault = broken winding, no EMF generated.
        const fm = c.props.faultMode || 'none';
        if (fm !== 'open-start') {
          const rRun = c.props.runResistance || 1.5;
          const rStart = c.props.startResistance || 2.5;
          const turnsRatio = rRun > 0 ? Math.sqrt(rStart / rRun) : 1;
          const speedFactor = 1 - Math.exp(-elapsed / 0.5);
          const backEMFVoltage = (c.props.nominalVoltage || 120) * turnsRatio * speedFactor;
          compResults[c.id]._startBackEMFVoltage = backEMFVoltage;
          // Set all nodes in the S-terminal net to back-EMF voltage
          const sNet = find(key(c.gx3, c.gy3));
          for (const k of Object.keys(parent)) {
            if (find(k) === sNet) nodeVoltages[k] = backEMFVoltage;
          }
          for (const w of wires) {
            for (const k of [key(w.gx1, w.gy1), key(w.gx2, w.gy2)]) {
              if (find(k) === sNet) nodeVoltages[k] = backEMFVoltage;
            }
          }
          // Update capacitors connected to S-net: show held voltage, 0 current (open circuit)
          for (const cap of components) {
            if (cap.type !== 'capacitor') continue;
            const cn1 = find(key(cap.gx1, cap.gy1));
            const cn2 = find(key(cap.gx2, cap.gy2));
            if (cn1 === sNet || cn2 === sNet) {
              const cv1 = nodeVoltages[key(cap.gx1, cap.gy1)] || 0;
              const cv2 = nodeVoltages[key(cap.gx2, cap.gy2)] || 0;
              compResults[cap.id] = {
                voltageDrop: Math.abs(cv1 - cv2), current: 0, watts: 0,
                resistance: compResults[cap.id]?.resistance || cap.props.resistance,
                _sourceType: compResults[cap.id]?._sourceType || 'AC'
              };
            }
          }
        }
        // Electron animation is handled separately in wires.js getWireCurrentMap().
      }
    }
  }

  // ── Update surge state: detect energized transitions for inrush tracking ──
  if (simRunning) for (const c of components) {
    if (c.type !== 'fan' && c.type !== 'contactor_coil' && c.type !== 'relay_coil' && c.type !== 'compressor') continue;
    const cr = compResults[c.id];
    const isEnergized = cr && cr.current > 0.001;
    if (!surgeState[c.id]) surgeState[c.id] = { startTime: -Infinity, prevEnergized: false };
    const ss = surgeState[c.id];
    if (isEnergized && !ss.prevEnergized) ss.startTime = animTime;
    if (!isEnergized && ss.prevEnergized) ss.startTime = -Infinity;
    ss.prevEnergized = isEnergized;
  }

  } finally {
    _solveDepth--;
    // Auto-refresh multimeter and NCV tester after every top-level solve
    if (_solveDepth === 0) {
      if (meterActive && meterProbe1 && meterProbe2) takeMeasurement();
      if (ncvtActive && window.detectNCV) window.detectNCV();
    }
  }
}

// ── Capacitor ohmmeter charge animation ──
// Charge state lives on the COMPONENT (via _capCharged Set), not on the meter.
// Mode switches never reset charge state — only energizing the circuit does.
const _capCharged    = new Set(); // IDs of caps that have been charged (ohmmeter or circuit)
let _capChargeStart  = null;      // performance.now() when current animation began
let _capChargeAnimId = null;      // RAF handle
let _capChargeCompId = null;      // ID of cap currently animating
let _capChargeTau    = 1.0;       // time constant for current animation

function _capChargeTick(now) {
  if (!meterActive || !meterProbe1 || !meterProbe2 || simRunning) {
    _stopCapCharge(); return; // probes lifted or circuit energized — cancel
  }
  if (meterMode !== 'ohm') {
    _capChargeAnimId = null; return; // mode switched — pause frame, keep start time
  }
  const elapsed  = (now - _capChargeStart) / 1000;
  const progress = 1 - Math.exp(-elapsed / _capChargeTau);

  if (progress >= 0.93) {
    _capCharged.add(_capChargeCompId); // mark component as charged
    _capChargeAnimId = null; _capChargeCompId = null; _capChargeStart = null;
    meterDisplayMode = 'text';
    updateMeterDisplay('O.L.', ' \u03A9');
    setMeterStatus('');
    return;
  }

  const R = 5 * Math.pow(200000, progress);
  const rStr = R >= 1e6 ? (R / 1e6).toFixed(1) + 'M'
             : R >= 1000 ? (R / 1000).toFixed(0) + 'k'
             : R.toFixed(0);
  meterDisplayMode = 'text';
  updateMeterDisplay(rStr, ' \u03A9');
  setMeterStatus('');
  _capChargeAnimId = requestAnimationFrame(_capChargeTick);
}

function _stopCapCharge() {
  if (_capChargeAnimId) { cancelAnimationFrame(_capChargeAnimId); _capChargeAnimId = null; }
  _capChargeStart = null; _capChargeCompId = null;
}

function _startCapCharge(C_uF, compId) {
  _capChargeCompId = compId;
  _capChargeStart  = performance.now();
  _capChargeTau    = Math.max(0.3, C_uF * 0.06);
  _capChargeAnimId = requestAnimationFrame(_capChargeTick);
}

function _resumeCapCharge() {
  // Re-enqueue tick after returning to ohm mode — start time is preserved so elapsed continues
  if (_capChargeCompId && _capChargeStart && !_capChargeAnimId) {
    _capChargeAnimId = requestAnimationFrame(_capChargeTick);
  }
}

// Auto-refresh multimeter and NCV tester whenever state changes
function autoMeterUpdate() {
  if (meterActive && meterProbe1 && meterProbe2) {
    takeMeasurement();
  } else if (meterActive && !probeDragging) {
    // Probes not placed and not dragging — show zero with units for VAC/VDC/AAC
    meterDisplayMode = 'text';
    meterTargetValue = 0;
    meterDisplayedValue = 0;
    if (meterMode === 'vac') updateMeterDisplay('0.0', ' V~');
    else if (meterMode === 'vdc') updateMeterDisplay('0.0', ' V\u2393');
    else if (meterMode === 'aac') updateMeterDisplay('0.00', ' A~');
    else updateMeterDisplay('---', '');
  }
  if (ncvtActive && window.detectNCV) window.detectNCV();
  if (window._clampActive && window._clampActive()) window._clampDetect && window._clampDetect();
}
