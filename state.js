
// ═══════════════════════════════════════════════════════════════
//  CONSTANTS & DATA MODEL
// ═══════════════════════════════════════════════════════════════
const GRID = 40;
// Component sizes in grid units (how many grid cells the component spans)
const COMP_SIZE = { ac_source: 1, ac_120: 1, ac_240: 1, ac_480: 1, ac_480_wye: 1, dc_source: 1, resistor: 1, bulb: 1, switch: 1, fuse: 1, fan: 1, breaker: 1, transformer: 2, time_delay: 1, lv_fuse: 1, td_fuse: 1, contactor_coil: 1, contactor_contact: 1, capacitor: 1, outlet: 1, relay_coil: 1, relay_contact: 1, earth_ground: 1, compressor: 2 };
const GROUND_BUS = { earth: { gx: 999999, gy: 0 } };

// Configuration object for magic numbers used in solver
const CONFIG = {
  SHORT_CIRCUIT_CURRENT: 1e8,      // Unrealistic current for short circuit detection
  OPEN_CIRCUIT_RESISTANCE: 1e6,    // Very high resistance for open circuits
  MIN_RESISTANCE: 0.01,             // Minimum resistance floor (near-zero ohms)
  ANIMATION_TIMEOUT_MS: 600,        // Long-press timeout and animation delays
  SURGE_PEAK_FACTOR: 6,              // LRA ≈ 6× FLA (locked-rotor inrush)
  SURGE_TAU: 0.3,                    // Exponential decay time constant (seconds)
  SURGE_THRESHOLD: 1.05              // Stop surge when factor drops below this
};

// Per-field bounds for the numeric inputs in the properties panel.
// Resistance floors are MIN_RESISTANCE rather than 0: every solver path filters
// loads on `resistance > 0`, so a 0 Ω part silently vanishes from the circuit
// (reading as an open) instead of behaving like the short the user expected.
const PROP_LIMITS = {
  resistance:      { min: CONFIG.MIN_RESISTANCE, max: 1e9 },
  coilResistance:  { min: CONFIG.MIN_RESISTANCE, max: 1e9 },
  runResistance:   { min: CONFIG.MIN_RESISTANCE, max: 1e9 },
  startResistance: { min: CONFIG.MIN_RESISTANCE, max: 1e9 },
  voltage:          { min: 0,     max: 1e5 },
  motorVoltage:     { min: 0,     max: 1e5 },
  nominalVoltage:   { min: 0,     max: 1e5 },
  primaryVoltage:   { min: 0.1,   max: 1e5 },
  secondaryVoltage: { min: 0.1,   max: 1e5 },
  ratedAmps:        { min: 0.1,   max: 1e5 },
  frequency:        { min: 1,     max: 1000 },
  wattRating:       { min: 0.1,   max: 1e6 },
  wattage:          { min: 0,     max: 1e6 },
  capacitance:      { min: 0.001, max: 1e6 },
  inductance:       { min: 0,     max: 1e3 },
  runInductance:    { min: 0,     max: 1e3 },
  startInductance:  { min: 0,     max: 1e3 },
  delaySeconds:     { min: 0.1,   max: 3600 },  // > 0: the countdown arc divides by it
  startCutoutTime:  { min: 0.1,   max: 3600 },
};

const ComponentDefaults = {
  ac_source: { resistance: 0, voltage: 120, frequency: 60, label: 'AC Power Source', on: true },
  ac_120:    { resistance: 0, voltage: 120, frequency: 60, label: '120V Power Source', on: true },
  ac_240:    { resistance: 0, voltage: 240, frequency: 60, label: '240V Power Source', on: true },
  ac_480:    { resistance: 0, voltage: 480, frequency: 60, label: '480V \u0394 3\u03c6 (Delta)', on: true },
  ac_480_wye: { resistance: 0, voltage: 480, frequency: 60, label: '480V Wye Power Source', on: true },
  dc_source: { resistance: 0, voltage: 12, label: 'DC Battery', on: true },
  resistor:  { resistance: 100, voltage: 0, label: 'Resistor', faultMode: 'none' },
  bulb:      { resistance: 144, voltage: 0, label: 'Light Bulb', wattRating: 100, bulbColor: 'yellow', faultMode: 'none' },
  switch:    { resistance: 0, voltage: 0, closed: true, label: 'SPST Switch' },
  fuse:      { resistance: 0.5, voltage: 0, ratedAmps: 15, blown: false, label: 'High Voltage Fuse' },
  lv_fuse:   { resistance: 0.5, voltage: 0, ratedAmps: 3, blown: false, label: 'Low Voltage Fuse' },
  td_fuse:   { resistance: 0.5, voltage: 0, ratedAmps: 30, blown: false, delaySeconds: 10, label: 'Time Delay Fuse' },
  breaker:   { resistance: 0, voltage: 0, ratedAmps: 20, tripped: false, delaySeconds: 5, label: 'Single Pole Breaker' },
  fan:       { resistance: 38.6, voltage: 0, label: 'Fan Motor', motorVoltage: 120, hp: '1/2 HP', wattRating: 300, faultMode: 'none', powerFactor: 0.75, inductance: 0.09 },
  transformer: { primaryVoltage: 120, secondaryVoltage: 24, label: 'Transformer' },
  time_delay: { resistance: 0, voltage: 0, closed: false, delaySeconds: 5, label: 'Time Delay Switch' },
  contactor_coil: { coilVoltage: 24, coilResistance: 200, contactorGroup: 'A', label: 'SP Contactor Coil', faultMode: 'none', powerFactor: 0.60, inductance: 0.71 },
  contactor_contact: { resistance: 0, contactorGroup: 'A', contactClosed: false, label: 'SP Contactor Contact' },
  capacitor: { capacitance: 10, resistance: 265, label: 'Capacitor', condition: 'good', faultMode: 'none' },
  outlet:    { wattage: 0, resistance: 1e6, label: 'Outlet', faultMode: 'none' },
  relay_coil: { coilVoltage: 24, coilResistance: 150, relayGroup: 'A', label: 'Relay Coil', faultMode: 'none', powerFactor: 0.60, inductance: 0.53 },
  relay_contact: { resistance: 0, relayGroup: 'A', contactMode: 'NO', contactClosed: false, label: 'Relay Contact (NO)' },
  earth_ground:  { resistance: 0, label: 'Earth Ground' },
  compressor: { nominalVoltage: 120, hp: '2 HP', runResistance: 1.5, startResistance: 2.5, runInductance: 0.03, startInductance: 0.025, backEMF: 0, startCutout: true, startCutoutTime: 1.5, label: 'Compressor', faultMode: 'none' },
};

const HP_TO_NUM = {'1/6 HP':1/6,'1/4 HP':0.25,'1/3 HP':1/3,'1/2 HP':0.5,'3/4 HP':0.75,'1 HP':1,'1.5 HP':1.5,'2 HP':2};

// Wipe every per-component runtime map. All of them are keyed by component id and
// ids restart at 1, so replacing the circuit without this hands a brand-new part
// the readings, spin and glow of whatever used to hold its id.
function resetRuntimeState() {
  for (const k in displayValues) delete displayValues[k];
  for (const k in fanState)      delete fanState[k];
  for (const k in bulbState)     delete bulbState[k];
  for (const k in surgeState)    delete surgeState[k];
  compResults = {}; nodeVoltages = {}; branchCurrents = {};
}

const _isFiniteNum = v => typeof v === 'number' && isFinite(v);

// Persisted booleans. Every writer stores a real boolean, so anything else in
// storage is corrupt input rather than an older shape worth honouring — and `!!`
// would turn the string "false" into true. Absent fields are handled by the
// callers, which leave the current state alone.
const _asSavedBool = v => v === true;

// Scrub a component list coming out of storage. Anything that reaches the renderer
// is assumed to be well-formed, so this is the gate that keeps it that way:
//
//  • Non-finite geometry is dropped. A NaN/Infinity coordinate flows straight into
//    ctx.createLinearGradient(), which throws and used to abort the whole render.
//  • Missing props are refilled from the type's defaults instead of discarding the
//    part — an older save that predates a field should still load.
//  • Underscore-prefixed props are runtime-only (countdown timers, coil latch state,
//    solver scratch). They were being serialized with the circuit, so a reload
//    resurrected a stale countdown or a stale impedance. Drop them and let the
//    solver rebuild.
//  • Fan resistance is re-derived, since an older build could leave it holding a
//    compounded impedance rather than the motor's true winding resistance.
// `list` is whatever was in storage, so it is not necessarily an array. A saved
// circuit holding `components: 5` used to throw "not iterable" straight out of the
// load dialog's click handler — after components.length had already been zeroed,
// leaving a cleared canvas, a half-applied load and an uncaught error.
function sanitizeComponents(list) {
  const kept = [];
  let dropped = 0;
  for (const c of Array.isArray(list) ? list : []) {
    if (!c || typeof c !== 'object' || typeof c.type !== 'string') { dropped++; continue; }

    const coordKeys = ['gx1', 'gy1', 'gx2', 'gy2'];
    if (c.gx3 !== undefined || c.gy3 !== undefined) coordKeys.push('gx3', 'gy3');
    if (c.gx4 !== undefined || c.gy4 !== undefined) coordKeys.push('gx4', 'gy4');
    if (!coordKeys.every(k => _isFiniteNum(c[k]))) { dropped++; continue; }

    const defaults = ComponentDefaults[c.type];
    if (!c.props || typeof c.props !== 'object') {
      if (!defaults) { dropped++; continue; }   // unknown type with no props to rebuild
      c.props = JSON.parse(JSON.stringify(defaults));
    } else if (defaults) {
      for (const k of Object.keys(defaults)) {
        if (c.props[k] === undefined) c.props[k] = defaults[k];
      }
    }

    for (const k of Object.keys(c.props)) {
      if (k.charAt(0) === '_') delete c.props[k];
    }
    if (c.type === 'fan') {
      const hpNum = HP_TO_NUM[c.props.hp] || 0.5;
      const v = c.props.motorVoltage || 120;
      c.props.resistance = Math.round((v * v) / (hpNum * 746) * 10) / 10;
    }
    kept.push(c);
  }
  if (dropped > 0) console.warn(`Discarded ${dropped} unreadable component(s) while loading the circuit.`);
  return kept;
}

// Same gate for wires: a non-finite endpoint breaks hit-testing and the solver's
// net keys, and a zero-length wire is noise the renderer can't draw.
function sanitizeWires(list) {
  return (Array.isArray(list) ? list : []).filter(w =>
    w && typeof w === 'object' &&
    _isFiniteNum(w.gx1) && _isFiniteNum(w.gy1) && _isFiniteNum(w.gx2) && _isFiniteNum(w.gy2) &&
    !(w.gx1 === w.gx2 && w.gy1 === w.gy2)
  );
}

// Camera limits. These mirror the clamp every interactive zoom path already
// applies (wheel, pinch); they exist here so the storage boundary can enforce the
// same range.
const MIN_ZOOM = 0.1, MAX_ZOOM = 5;

// The camera gets the same treatment as components and wires: it is restored from
// storage, so it is not necessarily sane. Every interactive path clamps zoom, but
// the load paths assigned camZoom straight out of the saved JSON, so a corrupt or
// hand-edited save could carry a value far below the interactive floor. drawGrid
// walks the whole visible world, and its step stops coarsening at 64 — at a zoom
// of 1e-6 that is ~1.5e11 fillRect calls in a single frame, which hangs the tab
// outright with no way back. A non-finite camera was just as bad in the other
// direction: every component's geometry became NaN, so every one of them failed
// to draw and got struck off, leaving the canvas permanently blank.
// Absent fields keep the current camera, which is what the callers expect.
function applySavedCamera(src) {
  if (!src || typeof src !== 'object') return;
  if (src.camX !== undefined && _isFiniteNum(src.camX)) camX = src.camX;
  if (src.camY !== undefined && _isFiniteNum(src.camY)) camY = src.camY;
  if (src.camZoom !== undefined && _isFiniteNum(src.camZoom)) {
    camZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, src.camZoom));
  }
}

// AC source type helper — returns true for any AC source variant (including legacy ac_source)
function isACSource(type) { return type === 'ac_source' || type === 'ac_120' || type === 'ac_240' || type === 'ac_480' || type === 'ac_480_wye'; }
function isSource(type) { return isACSource(type) || type === 'dc_source'; }

// Simulation results per component: { voltageDrop, current, watts, resistance }
let compResults = {};
// Animated display values that lerp toward targets
let displayValues = {};

let components = [];
let wires = [];
let commentBoxes = []; // { id, x1, y1, x2, y2, text, color }
let nextId = 1;

// ═══════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════
let currentTool = 'select';
let simRunning = false;
let animTime = 0;
let renderDt = 1 / 60;            // delta-time for coast physics (set each frame)
const fanState  = {};             // compId → { angle, speed }
const bulbState = {};             // compId → { glow }
const surgeState = {};            // compId → { startTime, prevEnergized } (runtime only)
let placeRotation = 0; // 0=right, 1=down, 2=left, 3=up
let placeFlipped = false; // swaps +/- or L1/N on sources during placement

// Wire drawing: click start, click end
let wireStart = null;

let selectedItem = null;
let hoveredNode = null;
let showData = true;
let showTitles = true;
let showInfo = true;
let showStatus = true;
let showComments = true;
let showElectrons = true;
let showEnergizedColors = true;
let showFaults = true;

// Comment box drawing
let commentDrawStart = null; // { x, y } world coords
let commentDrawEnd = null;
let resizingComment = null; // { cb, corner, origX1, origY1, origX2, origY2 }

// Multi-select (box select)
let multiSelected = []; // [{ kind, id }]
let boxSelectStart = null; // { x, y } world coords
let boxSelectEnd = null;
let draggingMulti = null; // { startGx, startGy, origPositions }

// Dragging components
let dragging = null;       // { comp, startGx1, startGy1, startGx2, startGy2, offsetGx, offsetGy }
let dragStartMouse = null; // { gx, gy } — to detect click vs drag
let draggingDataBox = null; // { compId, boxKey, startOx, startOy, mouseStartX, mouseStartY }
let renderedDataBoxes = []; // [{ compId, boxKey, x, y, w, h }] — for hit testing

// Pan / zoom
let camX = 0, camY = 0, camZoom = 1;
let isPanning = false, panStart = null, didPan = false;

// Multimeter
let meterMode = 'vac';
let meterInrushMode = false;    // inrush peak-hold active
let meterInrushPeak = null;     // highest absolute reading while active
let clampInrushMode = false;    // clamp meter inrush peak-hold
let clampInrushPeak = null;     // clamp meter highest reading
let meterProbe1 = null;
let meterProbe2 = null;
let meterActive = false;
let meterDisplayedValue = 0;  // smoothly lerped value shown on display
let meterTargetValue = 0;     // target set by takeMeasurement
let meterDisplayUnit = '';    // unit string e.g. ' V~'
let meterDisplayMode = 'value'; // 'value' | 'text' (for '---', 'O.L.' etc)
let clipboardActive = false;
let ncvtActive = false;
let ncvtSnapped = null;        // { gx, gy } grid node the probe tip is on, or null
let ncvtTipPos = { x: 0, y: 0 };
let ncvtDragging = false;
let ncvtSnapAnimating = false; // true while snap-back CSS transition is playing
let ncvtDragOffset = { x: 0, y: 0 };
let ncvtBlockRects  = [];      // cached collision rects, populated at drag-start

// Simulation results
let nodeVoltages = {};
let branchCurrents = {};

// Copy/Paste clipboard
let clipboardData = null;  // { items: [...], anchorGx, anchorGy }
let pasteCount = 0;        // increments each paste to offset position


// ═══════════════════════════════════════════════════════════════
//  GROUP LABELS (contactor / relay / DPDT switch pairing)
// ═══════════════════════════════════════════════════════════════
// Derived from what is actually on the canvas rather than from a counter, so the
// next label stays correct after a page reload, a project load, a paste, or an
// undo — a plain counter reset to 1 on every load and handed out duplicate groups
// that wired new contacts to an existing coil.

// 1→A, 26→Z, 27→AA, 28→AB … (spreadsheet-column style; never emits punctuation)
function _groupLabelFor(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function _nextUnusedGroup(propKey, makeLabel) {
  const used = new Set();
  for (const c of components) {
    const g = c.props && c.props[propKey];
    if (g !== undefined && g !== null && g !== '') used.add(String(g));
  }
  for (let n = 1; n <= 100000; n++) {
    const label = makeLabel(n);
    if (!used.has(label)) return label;
  }
  return makeLabel(1); // unreachable in practice
}

function nextContactorGroup() { return _nextUnusedGroup('contactorGroup', _groupLabelFor); }
function nextRelayGroup()     { return _nextUnusedGroup('relayGroup',     _groupLabelFor); }
function nextSwitchGroup()    { return _nextUnusedGroup('switchGroup',    n => 'SW' + n); }

// ═══════════════════════════════════════════════════════════════
//  FORMATTING HELPERS
// ═══════════════════════════════════════════════════════════════
// Safe fixed-decimal formatter — solver results are sparse (a component the
// solver never energized has no numeric fields), so never call .toFixed() on a
// raw result field.  Returns `fallback` for undefined/NaN/Infinity.
function fmtNum(v, decimals, fallback) {
  return (typeof v === 'number' && isFinite(v)) ? v.toFixed(decimals) : (fallback !== undefined ? fallback : '—');
}

// Escape a string for safe interpolation into innerHTML — both element text and
// double-quoted attribute values.  Used by the save/load dialogs, which build
// their rows from user-supplied project names.
function escapeHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════════════════════════════
//  STORAGE HELPER FUNCTION
// ═══════════════════════════════════════════════════════════════
function safeSaveToStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn('Storage save failed for key "' + key + '":', e.message);
    setStatus('⚠ Storage full — could not save. Try clearing old circuits.');
    return false;
  }
}

function safeRemoveFromStorage(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    console.warn('Storage remove failed for key "' + key + '":', e.message);
    return false;
  }
}

