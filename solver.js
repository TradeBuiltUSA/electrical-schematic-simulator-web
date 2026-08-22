
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

// NOTE: the real-valued Gaussian elimination that used to live here is gone. It
// was generalized into solveComplexLinear() in phasor.js rather than kept
// alongside it, so the engine has exactly one linear solver and one set of
// numerical guards — partial pivoting, singular detection, finite checks.

let _solveDepth = 0;
let _solveStateHistory = []; // Track contactor states to detect oscillations
// Per-solve register of the current flowing through each protective device, and
// which motors are still inside their legitimate inrush window. Written by
// solveElectricalPass(), read by the protection layer between passes. It lives
// out here rather than on `props` because it is measurement, not state.
let _deviceCurrents = new Map();   // protective-device id → amps
let _startingMotors = new Set();   // motor ids whose surge has not yet decayed

/**
 * Solve the circuit currently on the canvas, then let protection act on the
 * result — the full cycle, and the function every caller should use.
 *
 *     solveElectricalPass()   nodal analysis; contactors and relays settle
 *   → classify               solved state → FaultEvent[]  (protection.js)
 *   → evaluate protection    advance accumulators, open at most one device
 *   → re-solve if a device opened, otherwise settle
 *
 * TERMINATION IS STRUCTURAL, not a counter. Within one call a protective device
 * may only go closed → open, never the reverse, so every extra pass strictly
 * shrinks the set of closed devices and the loop cannot outlast them. The
 * iteration cap below is a backstop against a modelling mistake, and reaching it
 * is reported rather than swallowed.
 *
 * Protection timing advances on `animTime` and is computed once per call, so the
 * re-solve passes inside one frame consume no simulated time — a device cannot
 * trip twice on the same slice of the clock, and a test that drives `animTime`
 * by hand gets exactly reproducible results at any frame rate.
 */
function solveCircuit() {
  if (_solveDepth > 0) { solveElectricalPass(); return; } // nested settle — no protection

  TBProtection.beginFrame(animTime, simRunning);
  if (!simRunning) TBProtection.freezeClock();

  const deviceCount = components.reduce((n, c) => n + (isProtectiveDevice(c) ? 1 : 0), 0);
  const maxPasses = deviceCount + 2;

  let pass = 0, settled = false;
  for (; pass < maxPasses; pass++) {
    _deviceCurrents = new Map();
    _startingMotors = new Set();
    solveElectricalPass();
    classifyComponents();

    if (!simRunning) { settled = true; break; }

    // Classify what the solved circuit is doing before anything acts on it.
    for (const [id, amps] of _deviceCurrents) {
      const c = components.find(x => x.id === id);
      if (!c || deviceIsOpen(c)) continue;
      classifyDeviceCurrent(c, amps, _startingMotors.size > 0);
    }

    // One device opens per pass — the one that reaches its limit first.
    const armed = [];
    for (const [id, amps] of _deviceCurrents) {
      const c = components.find(x => x.id === id);
      if (c && !deviceIsOpen(c)) armed.push({ comp: c, current: amps });
    }
    // Devices carrying no current still cool, so their accumulators must advance too.
    for (const c of components) {
      if (!isProtectiveDevice(c) || deviceIsOpen(c)) continue;
      if (!_deviceCurrents.has(c.id)) armed.push({ comp: c, current: 0 });
    }

    const pick = TBProtection.selectToOpen(armed, pass === 0 ? TBProtection.dt() : 0);
    if (!pick) { settled = true; break; }
    TBProtection.open(pick.comp, pick.state, components);
    announceToSR(pick.comp.type === 'breaker' ? 'Breaker tripped - overcurrent detected'
                                              : 'Fuse blown - overcurrent detected');
  }

  if (!settled) {
    console.warn('solveCircuit: protection did not settle in ' + maxPasses + ' passes');
    TBProtection.record({
      class: FaultClass.UNSOLVABLE, severity: FaultSeverity.CRITICAL, componentId: null,
      reason: 'protective devices did not reach a stable state', action: 'Protection model did not settle'
    });
  }
  if (TBProtection.opened().length > 0) autoSave();

  // Devices that are already open stay reported for as long as they are open.
  if (simRunning) recordOpenDevices(components);
  publishFaults();

  if (meterActive && meterProbe1 && meterProbe2) takeMeasurement();
  if (ncvtActive && window.detectNCV) window.detectNCV();
}

/**
 * One electrical pass: read the shared state (`components`, `wires`, each
 * component's `props`) and write the answers back into the shared result maps
 * that the renderer and the meters read.
 *
 * Writes (all cleared on entry, so a component absent from `compResults` was
 * simply never solved this pass — treat missing fields as absent, not zero):
 *   - `compResults`    compId → { voltageDrop, current, watts, resistance, … }
 *   - `nodeVoltages`   net key → volts
 *   - `branchCurrents` branch key → amps
 *
 * Re-entrant by design: a coil that picks up or drops out changes the contact
 * states mid-pass and the pass calls itself again to settle. `_solveDepth` caps
 * that at 5 levels and `_solveStateHistory` detects a contact set that
 * oscillates, so a chattering control circuit stops instead of hanging the tab.
 * Protective devices are NOT touched here — that is solveCircuit's job.
 */

// ── Per-component condition classification ──
// Runs ONCE per electrical pass, from solveCircuit(), after the pass has fully
// settled. It deliberately does not live inside solveElectricalPass(): a coil
// picking up re-enters that function and returns early, so anything at its tail
// was silently skipped on exactly the frames where contacts changed state.
//
// Every condition here is derived from solved current and voltage rather than from
// the fault label alone — a ground fault with no path to earth reports no current,
// an open winding is only an open circuit when it is actually in circuit, and a
// stalled motor is recognised by current that does not decay.
function classifyComponents() {
  if (!simRunning) return;
  const dtNow = TBProtection.dt();
  for (const c of components) {
    const cr = compResults[c.id];
    const fm = faultOf(c);

    // Winding-to-frame faults: report the current actually flowing to ground.
    if (fm === 'ground-fault') {
      const gfr = compResults[c.id + '_gf'];
      classifyComponentGroundFault(c, gfr ? gfr.current : 0);
    }

    // Motors: voltage band, stall, and overload heat.
    if (c.type === 'fan' || c.type === 'compressor') {
      const nameplateV = c.type === 'fan' ? c.props.motorVoltage : c.props.nominalVoltage;
      const I = cr && isFinite(cr.current) ? cr.current : 0;
      // Full-load current from the nameplate: the reference the overload element
      // and the stall classifier both measure against.
      const hpNum = HP_TO_NUM[c.props.hp] || (c.type === 'compressor' ? 2 : 0.5);
      const fla = nameplateV > 0 ? (hpNum * 746) / nameplateV : 0;
      if (cr && cr.current > 0.001) {
        classifyMotorVoltage(c, nameplateV, cr.voltageDrop);
        const heat = accumulateMotorHeat(c, I, fla, dtNow);
        if (cr) cr._motorHeat = heat;
        const stalled = c.type === 'compressor'
          ? COMPRESSOR_STALL_FAULTS.has(fm)
          : fm === 'locked-rotor';
        if (stalled) {
          classifyLockedRotor(c, I, fla, heat);
        } else if (fla > 0 && I > fla * PROTECTION.NO_DAMAGE_RATIO && !_startingMotors.has(c.id)
                   && !_startingMotors.has(c.id + '_run')) {
          TBProtection.record({
            class: FaultClass.OVERLOAD, severity: heat > 0.5 ? FaultSeverity.CRITICAL : FaultSeverity.WARNING,
            componentId: c.id, measured: { current: I }, threshold: { rating: fla },
            reason: `motor drawing ${I.toFixed(1)} A against ${fla.toFixed(1)} A full-load`,
            action: `Motor overloaded — ${(I / fla).toFixed(1)}x full-load current`
          });
        }
      } else {
        accumulateMotorHeat(c, 0, fla, dtNow);   // cools while de-energized
      }
    }

    // Open elements that are wired into a live circuit: an open bulb is only
    // interesting when there was supposed to be current through it.
    if ((fm === 'open' || fm === 'open-run' || fm === 'open-start') &&
        (c.type === 'resistor' || c.type === 'bulb' || c.type === 'outlet' ||
         c.type === 'fan' || c.type === 'compressor' ||
         c.type === 'contactor_coil' || c.type === 'relay_coil')) {
      TBProtection.record({
        class: FaultClass.OPEN_CIRCUIT, severity: FaultSeverity.WARNING, componentId: c.id,
        reason: fm === 'open' ? 'element is open — no current can flow through it'
                              : `${fm === 'open-run' ? 'run' : 'start'} winding is open`,
        action: fm === 'open' ? 'Open circuit' : `Compressor ${fm === 'open-run' ? 'run' : 'start'} winding open`
      });
    }

    // Degraded connections and contacts.
    if (fm === 'high-resistance') {
      const drop = cr && isFinite(cr.voltageDrop) ? cr.voltageDrop : 0;
      TBProtection.record({
        class: FaultClass.HIGH_RESISTANCE, severity: FaultSeverity.WARNING, componentId: c.id,
        measured: { voltage: drop, current: cr && isFinite(cr.current) ? cr.current : 0 },
        reason: `high-resistance connection dropping ${drop.toFixed(1)} V`,
        action: `High resistance — ${drop.toFixed(1)} V dropped across it`
      });
    }
    if (fm === 'welded') {
      TBProtection.record({
        class: FaultClass.SHORT_CIRCUIT, severity: FaultSeverity.WARNING, componentId: c.id,
        reason: 'contacts are welded closed and no longer follow the control command',
        action: 'Contacts welded closed'
      });
    }
    if (fm === 'stuck-open') {
      TBProtection.record({
        class: FaultClass.OPEN_CIRCUIT, severity: FaultSeverity.WARNING, componentId: c.id,
        reason: 'contacts are stuck open and no longer follow the control command',
        action: 'Contacts stuck open'
      });
    }

    // Resistive loads past their power rating.
    if ((c.type === 'bulb' || c.type === 'resistor') && cr && isFinite(cr.watts)) {
      classifyLoadPower(c, cr.watts, c.props.wattRating);
    }

    // Capacitors that are not what the nameplate says.
    if (c.type === 'capacitor' && (fm === 'weak' || fm === 'out-of-tolerance')) {
      const actual = effectiveCapacitance(c);
      TBProtection.record({
        class: FaultClass.HIGH_RESISTANCE,
        severity: fm === 'weak' ? FaultSeverity.WARNING : FaultSeverity.INFO,
        componentId: c.id,
        measured: { capacitance: actual }, threshold: { rating: c.props.capacitance },
        reason: `measures ${actual.toFixed(1)} µF against a ${c.props.capacitance} µF nameplate`,
        action: `Capacitor ${fm === 'weak' ? 'weak' : 'out of tolerance'} — ${actual.toFixed(1)} µF of ${c.props.capacitance} µF`
      });
    }
  }

}

// Register the current a protective device is carrying, for the protection layer
// to act on after the whole circuit is solved. Highest reading wins: a device can
// be reached by more than one source pairing (three-phase especially), and it is
// the worst case that decides whether it opens.
function recordDeviceCurrent(c, amps) {
  if (!isProtectiveDevice(c)) return;
  const I = (typeof amps === 'number' && isFinite(amps)) ? Math.abs(amps) : 0;
  const prev = _deviceCurrents.get(c.id);
  if (prev === undefined || I > prev) _deviceCurrents.set(c.id, I);
}

let _sourceConflict = null;                 // set per pass by classifySourceTopology
const _xfmrPriBranch = new Map();           // transformer id → its solved primary branch
const _shortedSources = new Map();          // source id → bolted fault current, per pass

function solveElectricalPass() {
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
  if (_solveDepth === 1) { _sourceConflict = null; _shortedSources.clear(); _xfmrPriBranch.clear(); }
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

  // Closed switches and intact fuses merge nodes (zero resistance connections).
  //
  // Contact faults are decided by contactConducts(), which lets a welded contact
  // stay closed regardless of what the coil is asking for and a stuck-open one
  // stay open regardless. A high-resistance contact conducts but is NOT merged
  // here — it becomes a resistive branch further down, so it drops real voltage
  // under load and reads on an ohmmeter instead of being invisible.
  // NOTE: closed switches, contacts, fuses and breakers are deliberately NOT
  // merged here any more. They are stamped as low-impedance BRANCHES in the phasor
  // solve, which is what gives each of them a real, solved current — including a
  // device sitting in one leg of a parallel pair, which net merging could never
  // represent. Only genuinely ideal connections (wires, bolted faults) merge.
  for (const c of components) {
    // Bolted short across a two-terminal element: it becomes a wire. Restricted to
    // the parts where that is the right model — a shorted coil or winding is
    // modelled as collapsed resistance instead (see FAULT_MODEL), because those
    // fail by losing turns rather than by becoming a bar of copper, and the
    // difference is what lets the control fuse do its job.
    if (c.props.faultMode === 'short' && BOLTED_SHORT_TYPES.has(c.type)) {
      union(key(c.gx1, c.gy1), key(c.gx2, c.gy2));
    }
    // Compressor short faults: merge specific winding terminals
    if (c.type === 'compressor' && c.gx3 !== undefined) {
      if (c.props.faultMode === 'short-run') union(key(c.gx1, c.gy1), key(c.gx2, c.gy2));
      if (c.props.faultMode === 'short-start') union(key(c.gx1, c.gy1), key(c.gx3, c.gy3));
    }
    // Transformer primary/secondary winding shorted through to its own terminals.
    if (c.type === 'transformer' && c.gx3 !== undefined) {
      if (c.props.faultMode === 'short-primary') union(key(c.gx1, c.gy1), key(c.gx2, c.gy2));
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
  // Pre-bond root → conductor name, so a ground fault can say WHICH conductor is
  // faulted. It has to be captured here: once the earth bond is applied the roots
  // move, and looking them up afterwards never matches.
  const _conductorPreBond = new Map();
  for (const c of components) {
    if (c.type === 'earth_ground') { _earthPreBond.set(c.id, find(key(c.gx1, c.gy1))); continue; }
    if (isSource(c.type)) {
      _neutralPreBond.add(find(key(c.gx2, c.gy2)));
      const hot = find(key(c.gx1, c.gy1));
      if (!_conductorPreBond.has(hot)) _conductorPreBond.set(hot, c.type === 'dc_source' ? 'DC+' : 'L1');
      const second = find(key(c.gx2, c.gy2));
      if (!_conductorPreBond.has(second)) {
        _conductorPreBond.set(second, c.type === 'dc_source' ? 'DC-' : (c.type === 'ac_240' ? 'L2' : 'N'));
      }
      if (c.gx3 !== undefined) {
        const l3 = find(key(c.gx3, c.gy3));
        if (!_conductorPreBond.has(l3)) _conductorPreBond.set(l3, 'L3');
      }
      if (c.gx4 !== undefined) {
        const n4 = find(key(c.gx4, c.gy4));
        if (!_conductorPreBond.has(n4)) _conductorPreBond.set(n4, 'N');
      }
      // The middle terminal of a delta/wye source is L2.
      if (c.gx3 !== undefined) {
        const l2 = find(key(c.gx2, c.gy2));
        _conductorPreBond.set(l2, 'L2');
      }
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

  // ── Source topology check ──
  // Two sources sharing conductors used to make the reachability filter reject
  // every load between them, so the load silently produced no result at all.
  // Classify the pairing explicitly instead — the request's "annotate and keep
  // solving unless the topology is contradictory".
  {
    const pairs = [];
    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const a = sources[i], b = sources[j];
        const aNets = new Set([find(key(a.gx1, a.gy1)), find(key(a.gx2, a.gy2))]);
        if (a.gx3 !== undefined) aNets.add(find(key(a.gx3, a.gy3)));
        if (a.gx4 !== undefined) aNets.add(find(key(a.gx4, a.gy4)));
        const bNets = [find(key(b.gx1, b.gy1)), find(key(b.gx2, b.gy2))];
        if (b.gx3 !== undefined) bNets.push(find(key(b.gx3, b.gy3)));
        if (b.gx4 !== undefined) bNets.push(find(key(b.gx4, b.gy4)));
        const shared = bNets.filter(n => aNets.has(n)).length;
        if (shared > 0) pairs.push({ a, b, sharedNets: shared });
      }
    }
    if (pairs.length > 0) _sourceConflict = classifySourceTopology(pairs);
  }

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
          // Reactance follows the capacitance ACTUALLY present, which for a weak or
          // out-of-tolerance part is not its nameplate. effectiveCapacitance() is
          // shared with the µF meter, so what the student measures and what the
          // circuit does can never disagree.
          const fmCap = faultOf(c);
          if (fmCap === 'open') {
            c.props.resistance = CONFIG.OPEN_CIRCUIT_RESISTANCE;   // no path at all
          } else if (fmCap === 'short') {
            c.props.resistance = CONFIG.MIN_RESISTANCE;            // plates shorted
          } else {
            const C_uF = Math.max(effectiveCapacitance(c), 0.001); // μF, clamp > 0
            const Xc = 1 / (2 * Math.PI * srcFreq * C_uF * 1e-6);
            c.props.resistance = Math.round(Xc * 10) / 10; // round to 1 decimal
          }
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
    .map(c => ({ id: c.id, type: c.type, gx1: c.gx1, gy1: c.gy1, gx2: c.gx2, gy2: c.gy2,
      // A high-resistance element still conducts, just badly — it starves the load
      // and shows up on an ohmmeter rather than reading open.
      props: { ...c.props, resistance: loadResistanceFor(c, c.props.resistance) } }));

  // NOTE: contacts are no longer added to `loads`. Every switching and protective
  // device — healthy or high-resistance — is stamped once by stampDevices() in the
  // phasor solve, which is also where its solved branch current comes from.

  // ── Winding-to-frame ground faults ──
  // Modelled as a real resistive branch from the faulted terminal to the earth
  // bus, so current flows only when the grounding path is genuinely complete. On
  // an ungrounded system the fault is present and draws nothing — which is the
  // point of the exercise, and something a boolean flag could never show.
  for (const c of components) {
    if (faultOf(c) !== 'ground-fault') continue;
    loads.push({ id: c.id + '_gf', type: 'resistor', _groundFaultOf: c.id,
      gx1: c.gx1, gy1: c.gy1, gx2: GROUND_BUS.earth.gx, gy2: GROUND_BUS.earth.gy,
      props: { resistance: FAULT_MODEL.GROUND_FAULT_R, powerFactor: 1, inductance: 0 } });
  }

  // Contactor coils act as loads (draw current like a resistor)
  for (const c of components) {
    const coilFault = faultOf(c);
    // Shorted turns: resistance collapses but the coil is still a coil. It draws
    // heavy current the control fuse can clear, rather than becoming a dead short
    // that the source alone has to absorb.
    const coilR = coilFault === 'short'
      ? Math.max(c.props.coilResistance * FAULT_MODEL.COIL_SHORT_FRACTION, CONFIG.MIN_RESISTANCE)
      : c.props.coilResistance;
    if ((c.type === 'contactor_coil' || c.type === 'relay_coil') && c.props.coilResistance > 0 && coilFault !== 'open') {
      // Shorted turns take the inductance down with the resistance — a coil with
      // part of its winding bypassed has fewer effective turns, so both fall
      // together. Scaling L by the same fraction keeps the impedance dominated by
      // the loss rather than by a nameplate reactance the coil no longer has.
      const coilL = coilFault === 'short'
        ? (c.props.inductance || 0) * FAULT_MODEL.COIL_SHORT_FRACTION
        : (c.props.inductance || 0);
      loads.push({ id: c.id, type: 'resistor', _inductanceOverride: true,
        gx1: c.gx1, gy1: c.gy1, gx2: c.gx2, gy2: c.gy2,
        props: { resistance: coilR, powerFactor: c.props.powerFactor, inductance: coilL } });
    }
    // Compressor: two windings — run (C→R) and start (C→S)
    if (c.type === 'compressor' && c.gx3 !== undefined) {
      const fm = c.props.faultMode || 'none';
      // A rotor that never comes up to speed. Mechanical seizure is only one way
      // to get there: a single-phase CSR motor develops NO starting torque without
      // a working start winding, so an open or shorted start winding — or an open
      // start circuit outside it — leaves the machine humming at locked-rotor
      // current exactly as a seized bearing would. An open run winding is the same
      // story from the other side: the start winding alone cannot carry it to
      // speed. All of them stall, and the locked-rotor current that follows is a
      // result of the speed model, not a separate assertion.
      const stalled = COMPRESSOR_STALL_FAULTS.has(fm);
      if (fm !== 'open-run' && fm !== 'short-run' && c.props.runResistance > 0) {
        loads.push({ id: c.id + '_run', type: 'fan', _compressorId: c.id, _winding: 'run', _stalled: stalled,
          gx1: c.gx1, gy1: c.gy1, gx2: c.gx2, gy2: c.gy2,
          props: { resistance: c.props.runResistance, inductance: c.props.runInductance || 0, powerFactor: 0.8, hp: c.props.hp, _backEMF: c.props.backEMF || 0 } });
      }
      // Start winding: check for automatic cutout (potential relay / centrifugal switch)
      let startCutoff = false;
      if (c.props.startCutout && simRunning && fm !== 'cutout-failure' && !stalled) {
        // No record = not started yet (elapsed 0), not "started ages ago"
        const ss = surgeState[c.id];
        const elapsed = ss ? Math.max(0, animTime - ss.startTime) : 0;
        startCutoff = elapsed >= (c.props.startCutoutTime || 1.5);
      }
      // 'cutout-failure' = the potential relay never drops the start winding out, so
      //   it stays energized past its duty and the machine draws start current
      //   continuously — the classic burned start winding.
      // 'open-start-circuit' = the winding itself is healthy but its external
      //   circuit is broken. The winding still ohms out normally C→S, and the motor
      //   hums without starting: the fault a student is meant to distinguish from a
      //   genuinely open winding.
      // A stalled rotor keeps the start winding in circuit too, because the cutout
      //   is speed-driven and the rotor never gets there.
      if (!startCutoff && fm !== 'open-start' && fm !== 'short-start' &&
          fm !== 'open-start-circuit' && c.props.startResistance > 0) {
        loads.push({ id: c.id + '_start', type: 'fan', _compressorId: c.id, _winding: 'start', _stalled: stalled,
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
    // A load that computed its own inductance keeps it. Without this the original
    // component's nameplate value won, so a shorted coil kept full reactance and
    // drew a near-normal current.
    let L = ld._inductanceOverride
      ? (ld.props.inductance || 0)
      : (origComp ? (origComp.props.inductance || ld.props.inductance || 0) : (ld.props.inductance || 0));

    // Compressor motor speed model:
    // At locked rotor (startup): impedance ≈ R only (inductance effect minimal)
    // As motor accelerates: effective inductance increases, current drops from LRA to RLA
    // backEMF further reduces effective voltage at running speed
    if (ld._compressorId && simRunning) {
      const compId = ld._compressorId;
      const ss = surgeState[compId];
      const elapsed = ss ? Math.max(0, animTime - ss.startTime) : 0;
      // Motor speed ramps: 0 at startup → 1 at full speed (tau ~0.5s, settled ~2.5s).
      // A stalled rotor is pinned at zero, and everything that follows from speed —
      // effective inductance, back-EMF, start-winding cutout — follows from that one
      // fact rather than being asserted separately. The locked-rotor current is
      // therefore a RESULT of the electrical model, not a number typed in.
      const stalledRotor = ld._stalled === true;
      const speedFactor = stalledRotor ? 0 : (1 - Math.exp(-elapsed / 0.5));
      ld.props._speedFactor = speedFactor;
      // Scale inductance with speed: locked rotor has near-zero effective inductance
      L = L * speedFactor;
      // Back-EMF reduces voltage at running speed
      if (ld.props._backEMF && ld.props._backEMF > 0) {
        ld.props._emfReduction = speedFactor * ld.props._backEMF;
      }
    }

    // The phasor solver stamps R + jωL directly, so the true winding resistance
    // and the effective inductance both have to survive this pass. `resistance` is
    // still overwritten with the scalar |Z| because the properties panel, the data
    // boxes and the ohmmeter all read it, but the solve no longer depends on it.
    ld.props._effectiveL = L;
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
    // A locked rotor never accelerates, so the inrush never decays. Holding the
    // surge factor at its peak is what makes locked-rotor current sustained rather
    // than a transient — and it is deliberately NOT added to _startingMotors, so
    // the protection layer classifies it as an overload instead of a legitimate
    // start. That single difference is what lets a breaker ride through a start
    // and still trip a stall.
    if (faultOf(origComp) === 'locked-rotor') {
      _surgeLookup[ld.id] = CONFIG.SURGE_PEAK_FACTOR;
      continue;
    }
    const surgeFactor = computeSurgeFactor(ss, animTime, tau);
    if (surgeFactor > 1.001) { _surgeLookup[ld.id] = surgeFactor; _startingMotors.add(ld.id); }
  }
  // Compressors accelerate on their own speed ramp rather than the surge lookup,
  // so their inrush window is the time it takes the rotor to come up to speed.
  // A rotor that never accelerates leaves this window and the same current is then
  // classified as an overload — which is exactly the locked-rotor case.
  if (simRunning) for (const c of components) {
    if (c.type !== 'compressor') continue;
    // A stalled compressor is never "starting" — the window it would occupy is
    // exactly the window it can never leave.
    const fm = faultOf(c);
    if (COMPRESSOR_STALL_FAULTS.has(fm)) continue;
    const ss = surgeState[c.id];
    if (!ss || !isFinite(ss.startTime)) continue;
    if (Math.max(0, animTime - ss.startTime) < 1.5) _startingMotors.add(c.id);
  }

  if (sources.length === 0) return;

  // ═══════════════════════════════════════════════════════════════
  //  PHASOR NETWORK SOLVE
  // ═══════════════════════════════════════════════════════════════
  // One complex-valued nodal solution for the whole board, replacing the previous
  // approach of solving each source — and each three-phase pairing — as a separate
  // real-valued RMS problem writing into a shared node map. Three consequences
  // matter, and all three were impossible before:
  //
  //   • Phase relationships are real. L1/L2/L3 sit at 0°, −120°, +120°, so
  //     line-to-line voltage, neutral current and unbalance are computed rather
  //     than asserted.
  //   • Multiple sources are genuinely solved together. Each contributes a Norton
  //     pair and the network distributes the load between them.
  //   • Every branch has a current. Switching devices are low-impedance branches
  //     instead of net merges, so a protective device in a parallel path reads the
  //     current it actually carries.
  //
  // See phasor.js for the sign, angle and power conventions everything here obeys.

  const EARTH_KEY = key(GROUND_BUS.earth.gx, GROUND_BUS.earth.gy);
  const nodePhasors = {};              // net root → complex voltage
  const _branchOf = new Map();         // component id → { br, net } for current read-back

  // ── Which frequency does each galvanically-connected island run at? ──
  // AC and DC cannot share one phasor solution: they are different frequencies,
  // and superposing them would be meaningless. Islands are solved independently,
  // each at its own ω, and a single island fed by both is a topology fault rather
  // than something to force through the matrix.
  const _srcFreqOf = src => (src.type === 'dc_source') ? 0 : (src.props.frequency || 60);

  // Terminal keys a source drives, and the internal nodes it needs.
  function sourceTerminals(src) {
    const t = [[src.gx1, src.gy1], [src.gx2, src.gy2]];
    if (src.gx3 !== undefined) t.push([src.gx3, src.gy3]);
    if (src.gx4 !== undefined) t.push([src.gx4, src.gy4]);
    return t.map(([x, y]) => find(key(x, y)));
  }

  // ── Stamp one source as Norton pairs ──
  // Sources are never ideal: each winding sits behind its own Rs, derived from the
  // declared available fault current. That is what lets several of them coexist in
  // one matrix, and what keeps a bolted fault finite.
  function stampSource(net, src) {
    const V = src.props.voltage || 0;
    const Rs = sourceInternalR(src);
    const Y = Cx.make(1 / Rs, 0);
    const emf = (mag, ang) => Cx.fromPolar(mag, ang);
    const put = (aKey, bKey, E, tag) => addBranch(net, aKey, bKey, Y, Cx.mul(E, Y), src.id + tag, { source: src.id });

    const n1 = find(key(src.gx1, src.gy1));
    const n2 = find(key(src.gx2, src.gy2));

    if (src.type === 'ac_480' && src.gx3 !== undefined) {
      // Delta source as its wye equivalent behind impedance: three phase windings
      // to an INTERNAL neutral that is not brought out to a terminal — which is
      // exactly what a delta source is. Each winding carries V/√3, so the
      // line-to-line voltage the network computes comes out at V, and the 30°
      // shift between line-to-line and line-to-neutral appears on its own.
      const n3 = find(key(src.gx3, src.gy3));
      const mid = src.id + ':wye';
      const phaseV = V / Math.sqrt(3);
      [n1, n2, n3].forEach((nk, i) => put(nk, mid, emf(phaseV, PHASE_ANGLES[i]), ':p' + i));
      return;
    }
    if (src.type === 'ac_480_wye' && src.gx4 !== undefined) {
      // Wye source: the neutral IS a terminal, so neutral current is a real branch
      // current the solve produces.
      const n3 = find(key(src.gx3, src.gy3));
      const n4 = find(key(src.gx4, src.gy4));
      const phaseV = V / Math.sqrt(3);
      [n1, n2, n3].forEach((nk, i) => put(nk, n4, emf(phaseV, PHASE_ANGLES[i]), ':p' + i));
      return;
    }
    if (src.type === 'ac_240') {
      // Split phase, modelled as what it physically is: a centre-tapped winding.
      // Two half-sources in series about an internal centre tap, 180° apart, so
      // L1-L2 is the full 240 V and each leg is half that from the centre. The
      // centre tap is internal — this component brings out no neutral terminal.
      const mid = src.id + ':ct';
      put(n1, mid, emf(V / 2, 0), ':a');
      put(mid, n2, emf(V / 2, 0), ':b');
      return;
    }
    // Everything else is a plain two-terminal source at 0°: 120 V AC, the legacy
    // AC source, and DC (where ω = 0 makes the phasor a real number).
    put(n1, n2, emf(V, 0), '');
  }

  // ── Stamp the passive network ──
  // Loads carry R, L and C separately so the phasor form is exact; the scalar
  // impedance the older code folded into `resistance` is only kept for display.
  function stampLoads(net, w, only) {
    for (const ld of loads) {
      const a = find(key(ld.gx1, ld.gy1));
      const b = find(key(ld.gx2, ld.gy2));
      if (a === b) continue;                       // shorted out by the topology
      if (only && !(only.has(a) && only.has(b))) continue;
      let Y;
      if (ld.type === 'capacitor') {
        const orig = compById.get(ld.id);
        const C = (orig ? effectiveCapacitance(orig) : (ld.props.capacitance || 0)) * 1e-6;
        if (!(C > 0)) continue;                    // open or shorted cap: no branch
        Y = admittanceOf(0, 0, C, w);
        if (Cx.abs(Y) < 1e-15) continue;           // blocks DC outright
      } else {
        const R = (ld.props._origResistance != null) ? ld.props._origResistance : ld.props.resistance;
        const L = (ld.props._effectiveL != null) ? ld.props._effectiveL : (ld.props.inductance || 0);
        if (!(R > 0) && !(L > 0)) continue;
        Y = admittanceOf(R, L, 0, w);
      }
      // Behavioural scaling, applied as admittance so the whole network sees it.
      let k = 1;
      if (_surgeLookup[ld.id]) k *= _surgeLookup[ld.id];
      if (ld.props._emfReduction > 0) k *= Math.max(0, 1 - ld.props._emfReduction);
      if (k !== 1) Y = Cx.scale(Y, k);
      if (!Cx.isFinite(Y) || Cx.abs(Y) < 1e-15) continue;
      const br = { a, b, Y, J: Cx.zero(), id: ld.id, meta: { load: ld } };
      net.branches.push(br); netNode(net, a); netNode(net, b);
      _branchOf.set(ld.id, { br, net });
    }
  }

  // ── Stamp switching and protective devices as real branches ──
  // These used to merge their two nodes into one net, which made their current
  // unreadable: the old code had to guess it from surrounding loads, and a device
  // in a parallel path was credited with nothing at all. As a branch with a small
  // but real closed resistance, its current is simply (Va − Vb)·Y — correct in
  // every topology, including parallel ones.
  //
  // CONFIG.CONTACT_RESISTANCE is ~1 mΩ, the order of a real closed contact. It is
  // small enough to be invisible on a meter (15 mV at 15 A) and large enough to
  // keep the matrix well conditioned.
  function stampDevices(net, only) {
    for (const c of components) {
      let conducting = false, R = CONFIG.CONTACT_RESISTANCE;
      if (isSwitchingType(c.type)) {
        const commanded = (c.type === 'switch' || c.type === 'time_delay') ? c.props.closed : c.props.contactClosed;
        conducting = contactConducts(c, commanded);
        const extra = contactSeriesR(c);
        if (extra > 0) R = extra;
      } else if (c.type === 'fuse' || c.type === 'lv_fuse' || c.type === 'td_fuse') {
        conducting = !c.props.blown;
      } else if (c.type === 'breaker') {
        conducting = !c.props.tripped;
      } else continue;
      if (!conducting) continue;
      const a = find(key(c.gx1, c.gy1));
      const b = find(key(c.gx2, c.gy2));
      if (a === b) continue;                        // shorted across by wiring
      if (only && !(only.has(a) && only.has(b))) continue;
      const br = { a, b, Y: Cx.make(1 / R, 0), J: Cx.zero(), id: c.id, meta: { device: c } };
      net.branches.push(br); netNode(net, a); netNode(net, b);
      _branchOf.set(c.id, { br, net });
    }
  }

  // ── Reflected transformer load ──
  // A transformer's primary is a real load on whatever feeds it, and until now it
  // was not stamped into the network at all: its draw was added to the source
  // afterwards, so the primary never sagged under its own load and the secondary
  // EMF was derived from an unloaded primary voltage.
  //
  // The fix is clean because the reflected impedance is VOLTAGE-INDEPENDENT — no
  // circular dependency, no iteration:
  //
  //     Z_primary = (N1/N2)² · Z_secondary_total
  //
  // which is the standard impedance-reflection relationship. Z_secondary_total is
  // the winding impedance plus whatever the secondary terminals see, and that can
  // be measured from the secondary topology alone by injecting a test current —
  // exactly how you would measure input impedance on a bench.
  //
  // With the primary stamped as a genuine branch, the sag, the secondary EMF and
  // the current in every upstream protective device all fall out of the one solve.
  function secondaryInputImpedance(xf, w, secA, secB) {
    const island = islandOf(secA, new Set());
    if (!island.has(secB)) return null;              // open secondary: no return path
    const probe = createNetwork(w);
    stampLoads(probe, w, island);
    stampDevices(probe, island);
    if (!probe.nodes.has(secA) || !probe.nodes.has(secB)) return null;
    // A 1 A test injection: a branch with zero admittance still contributes its
    // Norton current to the right-hand side, so this is an ideal current source.
    addBranch(probe, secA, secB, Cx.zero(), Cx.make(1, 0), null, null);
    const res = solveNetwork(probe, secB);
    if (!res.ok) return null;                        // nothing for the current to flow through
    const V = res.voltages.get(secA);
    return (V && Cx.isFinite(V)) ? V : null;         // Z = V / 1 A
  }

  function reflectedPrimaryImpedance(xf, w) {
    const Vp = xf.props.primaryVoltage, Vsn = xf.props.secondaryVoltage;
    if (!(Vp > 0) || !(Vsn > 0)) return null;
    const fm = faultOf(xf);
    if (fm === 'open-primary' || fm === 'open-secondary') return null;
    const secA = find(key(xf.gx3, xf.gy3));
    const secB = find(key(xf.gx4, xf.gy4));
    // Winding impedance from the nameplate, the same percent-impedance figure the
    // secondary solve uses.
    const vaRating = (xf.props.vaRating > 0) ? xf.props.vaRating : 40;
    const secRatedA = vaRating / Vsn;
    const secZ = (Vsn / secRatedA) * 0.05;
    const shortWinding = fm === 'short-secondary';
    const wz = shortWinding
      ? Math.max(secZ * FAULT_MODEL.WINDING_SHORT_FRACTION, CONFIG.MIN_RESISTANCE)
      : secZ;
    let Ztot;
    if (secA === secB || shortWinding) {
      // Faulted secondary: the winding impedance and the fault itself, matching
      // exactly what the secondary short path computes.
      Ztot = Cx.make(wz + CONFIG.FAULT_RESISTANCE, 0);
    } else {
      const Zin = secondaryInputImpedance(xf, w, secA, secB);
      if (!Zin) return null;                          // unloaded secondary: no reflected load
      Ztot = Cx.add(Cx.make(wz + CONFIG.MIN_RESISTANCE, 0), Zin);
    }
    const turns = Vp / Vsn;
    return Cx.scale(Ztot, turns * turns);
  }

  // ── Partition the board into galvanically-connected islands ──
  // Two circuits that share no conductor are two independent problems, and may run
  // at different frequencies. Solving them separately is both correct and what
  // keeps an unpowered corner of the board from making the whole matrix singular.
  const _adjacency = new Map();
  const _touch = (a, b) => {
    if (!_adjacency.has(a)) _adjacency.set(a, new Set());
    if (!_adjacency.has(b)) _adjacency.set(b, new Set());
    _adjacency.get(a).add(b); _adjacency.get(b).add(a);
  };
  {
    const probe = createNetwork(0);
    stampLoads(probe, 2 * Math.PI * (_acFreq || 60));
    stampDevices(probe);
    for (const br of probe.branches) _touch(br.a, br.b);
    for (const src of sources) {
      const terms = sourceTerminals(src);
      for (let i = 1; i < terms.length; i++) _touch(terms[0], terms[i]);
    }
    // A transformer primary is a load on its island. Only the primary pair is
    // joined — primary and secondary are galvanically isolated and must stay in
    // separate islands, which is what lets them be solved independently.
    for (const c of components) {
      if (c.type !== 'transformer' || c.gx3 === undefined) continue;
      _touch(find(key(c.gx1, c.gy1)), find(key(c.gx2, c.gy2)));
    }
    _branchOf.clear();
  }
  function islandOf(startKey, seen) {
    const island = new Set([startKey]);
    const q = [startKey];
    seen.add(startKey);
    while (q.length) {
      const nk = q.shift();
      for (const nb of (_adjacency.get(nk) || [])) {
        if (island.has(nb)) continue;
        island.add(nb); seen.add(nb); q.push(nb);
      }
    }
    return island;
  }

  const _islands = [];
  {
    const seen = new Set();
    for (const src of sources) {
      for (const t of sourceTerminals(src)) {
        if (seen.has(t)) continue;
        _islands.push(islandOf(t, seen));
      }
    }
  }

  // ── Solve each island ──
  const _solvedVoltages = new Map();        // net root → complex voltage
  let _anySolveFailure = null;

  for (const island of _islands) {
    const inSrcs = sources.filter(s => sourceTerminals(s).some(t => island.has(t)));
    if (inSrcs.length === 0) continue;

    // Frequency: every AC source in one island must agree, and AC cannot share an
    // island with DC. Both cases are reported rather than forced.
    const freqs = new Set(inSrcs.map(_srcFreqOf));
    if (freqs.size > 1) {
      TBProtection.record({
        class: FaultClass.INVALID_SOURCE, severity: FaultSeverity.CRITICAL,
        componentId: inSrcs[0].id,
        reason: freqs.has(0)
          ? 'an AC source and a DC source are tied to the same conductors — they cannot share one steady state'
          : 'sources of different frequencies are tied to the same conductors',
        action: freqs.has(0)
          ? 'Invalid source connection — AC and DC sources cannot share a circuit'
          : 'Invalid source connection — mismatched frequencies'
      });
      continue;
    }
    const freq = freqs.values().next().value;
    const w = 2 * Math.PI * freq;

    // Only this island's branches. Stamping the whole board would drag in nodes
    // from other islands that have no path to this reference, which makes the
    // matrix singular for a circuit that is perfectly well defined.
    const net = createNetwork(w);
    stampLoads(net, w, island);
    stampDevices(net, island);
    // Transformer primaries in this island, as reflected impedance. Only on AC —
    // a transformer presents nothing at ω = 0.
    if (w > 0) {
      for (const xf of components) {
        if (xf.type !== 'transformer' || xf.gx3 === undefined) continue;
        const pA = find(key(xf.gx1, xf.gy1)), pB = find(key(xf.gx2, xf.gy2));
        if (pA === pB || !island.has(pA) || !island.has(pB)) continue;
        const Zp = reflectedPrimaryImpedance(xf, w);
        if (!Zp || !Cx.isFinite(Zp)) continue;
        const Y = Cx.inv(Zp);
        if (!Cx.isFinite(Y) || Cx.abs(Y) < 1e-15) continue;
        const br = { a: pA, b: pB, Y, J: Cx.zero(), id: xf.id + ':pri', meta: { xfmrPri: xf } };
        net.branches.push(br); netNode(net, pA); netNode(net, pB);
        _xfmrPriBranch.set(xf.id, { br, voltages: null });
      }
    }
    for (const s of inSrcs) stampSource(net, s);

    // Reference node: earth if this island is bonded to it, otherwise the island's
    // own supply reference. A meter's common lead has to sit somewhere, and an
    // ungrounded island is only defined relative to itself.
    let refKey = null;
    if (net.nodes.has(EARTH_KEY)) refKey = EARTH_KEY;
    if (refKey === null) {
      for (const s of inSrcs) {
        const cand = (s.type === 'ac_480_wye' && s.gx4 !== undefined)
          ? find(key(s.gx4, s.gy4)) : find(key(s.gx2, s.gy2));
        if (net.nodes.has(cand)) { refKey = cand; break; }
      }
    }
    if (refKey === null) refKey = net._order[0];
    if (refKey === undefined) continue;

    const res = solveNetwork(net, refKey);
    if (!res.ok) {
      _anySolveFailure = res.reason;
      // Report the electrical reason rather than letting non-finite values escape.
      TBProtection.record({
        class: FaultClass.UNSOLVABLE, severity: FaultSeverity.CRITICAL,
        componentId: inSrcs[0].id,
        reason: res.reason,
        action: 'Circuit cannot be solved — ' + res.reason
      });
      continue;
    }
    for (const [k, v] of res.voltages) _solvedVoltages.set(k, v);

    // ── Read results back off the solved network ──
    for (const br of net.branches) {
      if (!br.id) continue;
      if (br.meta && br.meta.xfmrPri) {
        // The transformer block reads this back as its true primary current.
        const rec = _xfmrPriBranch.get(br.meta.xfmrPri.id);
        if (rec) rec.voltages = res.voltages;
        continue;
      }
      const I = branchCurrent(br, res.voltages);
      const P = branchPower(br, res.voltages);
      const Va = res.voltages.get(br.a) || Cx.zero();
      const Vb = res.voltages.get(br.b) || Cx.zero();
      const vDrop = Cx.abs(Cx.sub(Va, Vb));
      const iMag = Cx.abs(I);

      if (br.meta && br.meta.device) {
        const c = br.meta.device;
        compResults[c.id] = {
          voltageDrop: vDrop, current: iMag, watts: Math.abs(P.real),
          resistance: iMag > 1e-12 ? vDrop / iMag : 0,
          _phasorI: I
        };
        branchCurrents[c.id] = iMag;
        // Protection reads the ACTUAL branch current now — no attribution guess.
        recordDeviceCurrent(c, iMag);
        continue;
      }
      if (br.meta && br.meta.load) {
        const ld = br.meta.load;
        const Zmag = iMag > 1e-12 ? vDrop / iMag : Infinity;
        const cr = {
          voltageDrop: vDrop, current: iMag,
          watts: P.real,
          resistance: (ld.props._origResistance != null) ? ld.props._origResistance : ld.props.resistance,
          _phasorV: Cx.sub(Va, Vb), _phasorI: I
        };
        // Power factor, reactive power and phase angle are now SOLVED rather than
        // carried as per-component constants.
        if (Math.abs(P.powerFactor) < 0.9999 && P.apparent > 1e-9) {
          cr.apparentPower = P.apparent;
          cr.reactivePower = Math.abs(P.reactive);
          cr.powerFactor = Math.abs(P.powerFactor);
          cr.phaseAngle = Math.abs(P.phaseAngle) * (180 / Math.PI);
        }
        if (isFinite(Zmag) && ld.props._effectiveL > 0) {
          cr.impedance = Zmag;
          cr.reactance = w * ld.props._effectiveL;
        }
        if (ld.type === 'capacitor') { cr.impedance = Zmag; cr.reactance = Zmag; }
        if (ld.props._origResistance != null) cr.trueResistance = ld.props._origResistance;
        compResults[ld.id] = cr;
        branchCurrents[ld.id] = iMag;
        if (ld.type === 'bulb' || ld.type === 'fan') ld.props._actualWatts = P.real;
      }
    }

    // ── Source terminal results ──
    for (const s of inSrcs) {
      let total = Cx.zero();
      let vTerm = 0;
      let maxPhase = 0, realPower = 0;
      for (const br of net.branches) {
        if (!(br.meta && br.meta.source === s.id)) continue;
        const Ib = branchCurrent(br, res.voltages);
        total = Cx.add(total, Ib);
        maxPhase = Math.max(maxPhase, Cx.abs(Ib));
        realPower += Math.abs(branchPower(br, res.voltages).real);
      }
      const n1 = find(key(s.gx1, s.gy1));
      const n2 = find(key(s.gx2, s.gy2));
      const V1 = res.voltages.get(n1) || Cx.zero();
      const V2 = res.voltages.get(n2) || Cx.zero();
      vTerm = Cx.abs(Cx.sub(V1, V2));
      // For a two-terminal source the phasor sum IS the delivered current. For a
      // three-phase source it is not: three balanced winding currents sum to zero
      // at the star point, so reporting the sum showed a perfectly healthy 480 V
      // supply as delivering 0 A and 0 W. What a three-phase source is actually
      // doing is per-phase, so report the busiest conductor — the number a clamp
      // reads — and the real power summed across the windings.
      const threePhase = s.gx3 !== undefined;
      const iMag = threePhase ? maxPhase : Cx.abs(total);
      compResults[s.id] = {
        voltageDrop: vTerm, current: iMag,
        watts: threePhase ? realPower : vTerm * iMag,
        resistance: iMag > 1e-9 ? vTerm / iMag : Infinity,
        sourceImpedance: sourceInternalR(s),
        availableFault: sourceFaultCurrent(s),
        nominalVoltage: s.props.voltage,
        sag: (s.props.voltage || 0) - vTerm,
        overload: false
      };
      branchCurrents[s.id] = iMag;
      classifySourceLoading(s, iMag);

      // Per-phase currents, for three-phase protection and per-conductor metering.
      if (s.gx3 !== undefined) {
        const per = [];
        for (let i = 0; i < 3; i++) {
          const br = net.branches.find(b => b.id === s.id + ':p' + i);
          per.push(br ? Cx.abs(branchCurrent(br, res.voltages)) : 0);
        }
        compResults[s.id].phaseCurrents = per;
        // Neutral current on a wye source is a real branch quantity: the phasor sum
        // of the three phase currents. Balanced load → near zero. Unbalanced → not.
        if (s.type === 'ac_480_wye' && s.gx4 !== undefined) {
          let nSum = Cx.zero();
          for (let i = 0; i < 3; i++) {
            const br = net.branches.find(b => b.id === s.id + ':p' + i);
            if (br) nSum = Cx.add(nSum, branchCurrent(br, res.voltages));
          }
          compResults[s.id].neutralCurrent = Cx.abs(nSum);
        }
        const maxI = Math.max.apply(null, per), minI = Math.min.apply(null, per);
        compResults[s.id].imbalance = maxI > 1e-9 ? (maxI - minI) / maxI : 0;
      }
    }
  }

  // Tag the motor results with what was applied, for the data boxes and the
  // protection classifier. The electrical effect is already in the solve.
  for (const ld of loads) {
    const cr = compResults[ld.id];
    if (!cr) continue;
    if (_surgeLookup[ld.id]) cr._surgeFactor = _surgeLookup[ld.id];
    if (ld.props._emfReduction > 0) {
      cr._backEMF = ld.props._emfReduction;
      cr._speedFactor = ld.props._speedFactor;
    }
  }

  // ── Publish node voltages ──
  // `nodeVoltages` stays a real scalar because the renderer, the NCV tester and
  // the wire animation all read it as one: RMS magnitude on AC, signed value on
  // DC so polarity still means something. The full complex value lives alongside
  // in `nodePhasors` for anything that needs an angle.
  const _dcIsland = new Set();
  for (const island of _islands) {
    const inSrcs = sources.filter(s => sourceTerminals(s).some(t => island.has(t)));
    if (inSrcs.length && inSrcs.every(s => s.type === 'dc_source')) {
      for (const k of island) _dcIsland.add(k);
    }
  }
  for (const k of Object.keys(parent)) {
    const root = find(k);
    const v = _solvedVoltages.get(root);
    if (v === undefined) continue;
    nodeVoltages[k] = _dcIsland.has(root) ? v.re : Cx.abs(v);
    nodePhasors[k] = v;
  }
  for (const w of wires) {
    for (const k of [key(w.gx1, w.gy1), key(w.gx2, w.gy2)]) {
      if (nodeVoltages[k] !== undefined) continue;
      const root = find(k);
      const v = _solvedVoltages.get(root);
      if (v === undefined) continue;
      nodeVoltages[k] = _dcIsland.has(root) ? v.re : Cx.abs(v);
      nodePhasors[k] = v;
    }
  }
  window._nodePhasors = nodePhasors;

  // ── Bolted fault directly across a two-terminal source ──
  // A source whose own two terminals have been wired together is ONE node, so its
  // branch is degenerate and the network has nothing to stamp. That is the only
  // case needing special handling, and it only arises for a genuinely two-terminal
  // source.
  //
  // It deliberately does NOT cover three-phase sources. Their windings run from
  // each line to an internal neutral that no wiring can reach, so a line-to-line
  // fault leaves both branches perfectly well formed and the network solves it
  // correctly — including the per-phase currents. Treating that as a degenerate
  // short overwrote a correct solve with a scalar guess: a bolted L1-L2 fault on a
  // 480 V delta reported 9057 A instead of the correct 5000 A, and left L2 reading
  // zero. Independent hand calculation caught it.
  //
  // Nor does it cover the split-phase source, whose two half-windings meet at an
  // internal centre tap and stay solvable for the same reason.
  //
  // The fault path here is WIRE, so the only thing limiting the current is the
  // source's own impedance — which is exactly what "available fault current"
  // means. CONFIG.FAULT_RESISTANCE is not added: it models a fault that has some
  // impedance of its own (an internal winding short), not a conductor. The
  // network path applies the same rule, so both agree.
  for (const src of sources) {
    if (src.gx3 !== undefined || src.type === 'ac_240') continue;
    const a = find(key(src.gx1, src.gy1));
    const b = find(key(src.gx2, src.gy2));
    if (a !== b) continue;
    const V = src.props.voltage || 0;
    const Rs = sourceInternalR(src);
    const Isc = V / Rs;
    const faultV = 0;   // a wire short collapses the conductor to the return
    compResults[src.id] = {
      voltageDrop: faultV, current: Isc, watts: V * Isc,
      resistance: Rs,
      sourceImpedance: Rs, availableFault: sourceFaultCurrent(src),
      overload: true, shortCircuit: true
    };
    branchCurrents[src.id] = Isc;
    _shortedSources.set(src.id, Isc);
    classifySourceLoading(src, Isc);
    for (const c of components) {
      if (!isProtectiveDevice(c) || deviceIsOpen(c)) continue;
      const n1 = find(key(c.gx1, c.gy1)), n2 = find(key(c.gx2, c.gy2));
      if (n1 === a || n2 === a || n1 === b || n2 === b) {
        compResults[c.id] = { voltageDrop: 0, current: Isc, watts: 0, resistance: 0 };
        branchCurrents[c.id] = Isc;
        recordDeviceCurrent(c, Isc);
      }
    }
    for (const k of Object.keys(parent)) {
      if (find(k) === a || find(k) === b) { nodeVoltages[k] = faultV; nodePhasors[k] = Cx.make(faultV, 0); }
    }
  }
  // The transformer's primary current, as the network solved it. Falls back to the
  // ampere-turn estimate only when the primary was not stamped (a secondary with
  // nothing on it, or a DC island).
  function solvedPrimaryCurrent(xfmr, fallback) {
    const rec = _xfmrPriBranch.get(xfmr.id);
    if (!rec || !rec.voltages) return fallback;
    const I = Cx.abs(branchCurrent(rec.br, rec.voltages));
    return isFinite(I) ? I : fallback;
  }

  // ── Transformer solver ──
  // The secondary is solved as its own phasor island, driven by an EMF derived
  // from the SOLVED primary voltage rather than from a topological guess about
  // which source the primary is wired to. That matters now that fuses, breakers
  // and contacts are branches instead of net merges: the primary is very rarely
  // on the same net as a source terminal, and the old "are these the same net?"
  // test would have said no every time.
  //
  // PHASE CONVENTION: the secondary EMF is the primary phasor scaled by the turns
  // ratio, with NO phase shift — a 0° (additive-polarity) two-winding transformer.
  // Real transformers can introduce a shift depending on winding configuration
  // (a delta-wye bank gives 30°); this model represents the single-phase control
  // transformer the simulator is built around, where in-phase is correct.
  //
  // Not modelled, deliberately: magnetising current, core loss, saturation, and
  // any inrush on energization. The winding impedance below is the only
  // non-ideality, and it exists to make fault current finite.
  const transformers = components.filter(c => c.type === 'transformer' && c.gx3 !== undefined);
  for (const xfmr of transformers) {
    const priNet1 = find(key(xfmr.gx1, xfmr.gy1));
    const priNet2 = find(key(xfmr.gx2, xfmr.gy2));
    const secNet1 = find(key(xfmr.gx3, xfmr.gy3));
    const secNet2 = find(key(xfmr.gx4, xfmr.gy4));
    const xfmrFault = faultOf(xfmr);

    // What is actually across the primary, from the solved network.
    const Vp1 = _solvedVoltages.get(priNet1);
    const Vp2 = _solvedVoltages.get(priNet2);
    const priPhasor = (Vp1 && Vp2) ? Cx.sub(Vp1, Vp2) : null;
    const priVoltage = priPhasor ? Cx.abs(priPhasor) : 0;
    const priSourceIsDC = _dcIsland.has(priNet1) || _dcIsland.has(priNet2);

    // ── Open windings ──
    if (xfmrFault === 'open-primary' || xfmrFault === 'open-secondary') {
      compResults[xfmr.id] = {
        voltageDrop: xfmrFault === 'open-primary' ? 0 : priVoltage,
        current: 0, watts: 0, resistance: Infinity,
        secVoltage: 0, secCurrent: 0, secWatts: 0,
        _openWinding: xfmrFault === 'open-primary' ? 'primary' : 'secondary'
      };
      branchCurrents[xfmr.id] = 0;
      TBProtection.record({
        class: FaultClass.OPEN_CIRCUIT, severity: FaultSeverity.WARNING, componentId: xfmr.id,
        conductor: xfmrFault === 'open-primary' ? 'primary' : 'secondary',
        reason: `${xfmrFault === 'open-primary' ? 'primary' : 'secondary'} winding is open`,
        action: `Transformer ${xfmrFault === 'open-primary' ? 'primary' : 'secondary'} winding open`
      });
      continue;
    }

    if (priSourceIsDC || priVoltage < 0.01) {
      // A transformer needs changing flux. On DC — or with nothing across the
      // primary — it induces nothing at all.
      compResults[xfmr.id] = {
        voltageDrop: priSourceIsDC ? priVoltage : 0, current: 0, watts: 0, resistance: Infinity,
        secVoltage: 0, secCurrent: 0, secWatts: 0,
        _dcBlocked: priSourceIsDC
      };
      branchCurrents[xfmr.id] = 0;
      continue;
    }

    const ratio = xfmr.props.secondaryVoltage / xfmr.props.primaryVoltage;
    const secEMF = Cx.scale(priPhasor, ratio);
    const secVoltage = Cx.abs(secEMF);

    // Winding impedance from the nameplate — see the percent-impedance note in the
    // README. This is what limits fault current on the secondary.
    // Winding impedance and rated current are NAMEPLATE properties, fixed by the
    // transformer's construction. Deriving them from the solved secondary voltage
    // made %Z shrink whenever the supply sagged — so a loaded transformer quietly
    // reported a lower fault impedance and a higher fault current than its own
    // nameplate allows. Independent benchmarking caught it once the primary began
    // sagging for real.
    const vaRating   = (xfmr.props.vaRating > 0) ? xfmr.props.vaRating : 40;
    const secNominal = xfmr.props.secondaryVoltage > 0 ? xfmr.props.secondaryVoltage : secVoltage;
    const secRatedA  = secNominal > 0 ? vaRating / secNominal : 0;
    const secZ       = secRatedA > 0 ? (secNominal / secRatedA) * 0.05 : CONFIG.MIN_RESISTANCE;
    const shortedSecWinding = xfmrFault === 'short-secondary';
    const faultZ = shortedSecWinding
      ? Math.max(secZ * FAULT_MODEL.WINDING_SHORT_FRACTION, CONFIG.MIN_RESISTANCE)
      : secZ;

    // ── Secondary bolted short, internal or external ──
    if (secNet1 === secNet2 || shortedSecWinding) {
      const secFaultI = secVoltage / (faultZ + CONFIG.FAULT_RESISTANCE);
      const priFaultI = priVoltage > 0 ? secFaultI * (secVoltage / priVoltage) : 0;
      compResults[xfmr.id] = {
        voltageDrop: priVoltage, current: priFaultI, watts: 0,
        resistance: priFaultI > 0 ? priVoltage / priFaultI : Infinity,
        secVoltage: secFaultI * CONFIG.FAULT_RESISTANCE,
        secCurrent: secFaultI, secWatts: 0,
        secRatedCurrent: secRatedA, secImpedance: secZ,
        vaRating, shortCircuit: true, overload: true,
        _shortedWinding: shortedSecWinding ? 'secondary' : null
      };
      compResults[xfmr.id].current = solvedPrimaryCurrent(xfmr, priFaultI);
      branchCurrents[xfmr.id] = compResults[xfmr.id].current;
      TBProtection.record({
        class: FaultClass.SHORT_CIRCUIT, severity: FaultSeverity.CRITICAL,
        componentId: xfmr.id, conductor: 'secondary',
        measured: { current: secFaultI, voltage: 0 }, threshold: { rating: secRatedA },
        reason: `secondary bolted short — ${secFaultI.toFixed(1)} A against a ${secRatedA.toFixed(2)} A winding`,
        action: `Transformer secondary shorted — ${priFaultI.toFixed(2)} A reflected to the primary`
      });
      for (const c of components) {
        if (!isProtectiveDevice(c) || deviceIsOpen(c)) continue;
        const n1 = find(key(c.gx1, c.gy1)), n2 = find(key(c.gx2, c.gy2));
        if (n1 === secNet1 || n2 === secNet1 || n1 === secNet2 || n2 === secNet2) {
          compResults[c.id] = { voltageDrop: 0, current: secFaultI, watts: 0, resistance: 0 };
          branchCurrents[c.id] = secFaultI;
          recordDeviceCurrent(c, secFaultI);
        }
      }
      continue;
    }

    // ── Normal operation: solve the secondary island ──
    const secIsland = islandOf(secNet1, new Set());
    const secNet = createNetwork(2 * Math.PI * (_acFreq || 60));
    stampLoads(secNet, 2 * Math.PI * (_acFreq || 60), secIsland);
    stampDevices(secNet, secIsland);
    const Ysec = Cx.make(1 / (faultZ + CONFIG.MIN_RESISTANCE), 0);
    addBranch(secNet, secNet1, secNet2, Ysec, Cx.mul(secEMF, Ysec), xfmr.id + ':sec', { source: xfmr.id });

    const secRes = solveNetwork(secNet, secNet2);
    if (!secRes.ok) {
      compResults[xfmr.id] = {
        voltageDrop: priVoltage, current: 0, watts: 0, resistance: Infinity,
        secVoltage, secCurrent: 0, secWatts: 0, secRatedCurrent: secRatedA,
        secImpedance: secZ, vaRating
      };
      // An unloaded secondary is the ordinary case of "no unique solution" here:
      // there is nothing for the solver to determine beyond the source itself.
      nodeVoltages[key(xfmr.gx3, xfmr.gy3)] = secVoltage;
      nodeVoltages[key(xfmr.gx4, xfmr.gy4)] = 0;
      for (const k of Object.keys(parent)) {
        const root = find(k);
        if (root === secNet1) { nodeVoltages[k] = secVoltage; nodePhasors[k] = secEMF; }
        else if (root === secNet2) { nodeVoltages[k] = 0; nodePhasors[k] = Cx.zero(); }
      }
      continue;
    }

    for (const [k, v] of secRes.voltages) _solvedVoltages.set(k, v);
    let secTotal = Cx.zero();
    for (const br of secNet.branches) {
      if (br.meta && br.meta.source === xfmr.id) { secTotal = Cx.add(secTotal, branchCurrent(br, secRes.voltages)); continue; }
      if (!br.id) continue;
      const I = branchCurrent(br, secRes.voltages);
      const Pw = branchPower(br, secRes.voltages);
      const Va = secRes.voltages.get(br.a) || Cx.zero();
      const Vb = secRes.voltages.get(br.b) || Cx.zero();
      const vDrop = Cx.abs(Cx.sub(Va, Vb));
      const iMag = Cx.abs(I);
      if (br.meta && br.meta.device) {
        const c = br.meta.device;
        compResults[c.id] = { voltageDrop: vDrop, current: iMag, watts: Math.abs(Pw.real),
          resistance: iMag > 1e-12 ? vDrop / iMag : 0, _phasorI: I };
        branchCurrents[c.id] = iMag;
        recordDeviceCurrent(c, iMag);
      } else if (br.meta && br.meta.load) {
        const ld = br.meta.load;
        const cr = { voltageDrop: vDrop, current: iMag, watts: Pw.real,
          resistance: (ld.props._origResistance != null) ? ld.props._origResistance : ld.props.resistance,
          _phasorV: Cx.sub(Va, Vb), _phasorI: I };
        if (Math.abs(Pw.powerFactor) < 0.9999 && Pw.apparent > 1e-9) {
          cr.apparentPower = Pw.apparent;
          cr.reactivePower = Math.abs(Pw.reactive);
          cr.powerFactor = Math.abs(Pw.powerFactor);
          cr.phaseAngle = Math.abs(Pw.phaseAngle) * (180 / Math.PI);
        }
        if (ld.props._origResistance != null) cr.trueResistance = ld.props._origResistance;
        if (_surgeLookup[ld.id]) {
          const sf = _surgeLookup[ld.id];
          cr.current *= sf; cr.watts *= sf; cr._surgeFactor = sf;
        }
        compResults[ld.id] = cr;
        branchCurrents[ld.id] = cr.current;
        if (ld.type === 'bulb' || ld.type === 'fan') ld.props._actualWatts = cr.watts;
      }
    }

    const totalSecCurrent = Cx.abs(secTotal);
    const secWatts = secVoltage * totalSecCurrent;
    const priCurrent = priVoltage > 0 ? secWatts / priVoltage : 0;

    compResults[xfmr.id] = {
      voltageDrop: priVoltage, current: priCurrent, watts: secWatts,
      resistance: priCurrent > 0 ? priVoltage / priCurrent : Infinity,
      secVoltage, secCurrent: totalSecCurrent, secWatts,
      secRatedCurrent: secRatedA, secImpedance: secZ, vaRating
    };
    compResults[xfmr.id].current = solvedPrimaryCurrent(xfmr, priCurrent);
    branchCurrents[xfmr.id] = compResults[xfmr.id].current;

    if (secRatedA > 0 && totalSecCurrent > secRatedA * PROTECTION.NO_DAMAGE_RATIO) {
      const heat = accumulateMotorHeat(xfmr, totalSecCurrent, secRatedA,
                                       _solveDepth === 1 ? TBProtection.dt() : 0);
      compResults[xfmr.id]._thermalLoad = heat;
      TBProtection.record({
        class: FaultClass.OVERLOAD,
        severity: heat > 0.5 ? FaultSeverity.CRITICAL : FaultSeverity.WARNING,
        componentId: xfmr.id, conductor: 'secondary',
        measured: { current: totalSecCurrent }, threshold: { rating: secRatedA },
        reason: `secondary drawing ${totalSecCurrent.toFixed(2)} A from a ${vaRating} VA winding`,
        action: `Transformer overloaded — ${(totalSecCurrent / secRatedA * 100).toFixed(0)}% of rating`
      });
    } else if (secRatedA > 0) {
      accumulateMotorHeat(xfmr, totalSecCurrent, secRatedA, _solveDepth === 1 ? TBProtection.dt() : 0);
      compResults[xfmr.id]._thermalLoad = xfmr.props._motorHeat || 0;
    }

    // Publish secondary node voltages, magnitude for display and phasor alongside.
    for (const k of Object.keys(parent)) {
      const root = find(k);
      const v = secRes.voltages.get(root);
      if (v === undefined) continue;
      nodeVoltages[k] = Cx.abs(v);
      nodePhasors[k] = v;
    }
    for (const w2 of wires) {
      for (const k of [key(w2.gx1, w2.gy1), key(w2.gx2, w2.gy2)]) {
        const v = secRes.voltages.get(find(k));
        if (v === undefined) continue;
        nodeVoltages[k] = Cx.abs(v);
        nodePhasors[k] = v;
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
    const commanded = coilGroupEnergized[contact.props.contactorGroup] || false;
    // What the coil is ASKING for is recorded, so the properties panel and the
    // symbol can show that the command and the reality disagree. What the contact
    // actually does is contactConducts()'s call — a welded contact stays closed
    // with the coil de-energized, which is the whole hazard being taught.
    contact.props._commanded = commanded;
    const shouldClose = contactConducts(contact, commanded);
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
      solveElectricalPass();
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
    // NO = closes when energized; NC = opens when energized (inverted). The fault
    // is applied AFTER the NO/NC logic, so a welded NC contact stays closed even
    // when the coil pulls in — the inversion is part of the command, not of the
    // failure.
    const commanded = contact.props.contactMode === 'NC' ? !groupOn : groupOn;
    contact.props._commanded = commanded;
    const shouldClose = contactConducts(contact, commanded);
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
      solveElectricalPass();
      return;
    }
  }
  // ── Ground fault detection ──
  // Delegated to protection.js, which requires a COMPLETE PATH rather than mere
  // contact with earth. The old test here fired whenever a ground touched any
  // non-neutral net and anything anywhere drew more than 10 mA, and it quoted the
  // largest LOAD current as the fault current — so a single ground on a hot leg
  // with no return path reported a ground fault carrying the load's own amps.
  if (_earthPreBond.size > 0 && _solveDepth === 1) {
    const earthV = nodeVoltages['999999,0'] || 0;
    const groundList = [];
    for (const c of components) {
      if (c.type !== 'earth_ground') continue;
      const root = _earthPreBond.get(c.id);
      groundList.push({ id: c.id, net: root, conductor: _conductorPreBond.get(root) || null });
    }
    // Fault current is the current in the fault PATH. An ideal bond makes a
    // line-to-ground fault a bolted short, so the magnitude the source computed
    // for that short is the fault current — never a load current.
    let boltedFault = 0;
    for (const [, amps] of _shortedSources) boltedFault = Math.max(boltedFault, amps);
    const results = classifyGrounds({
      grounds: groundList,
      isBond:       g => _neutralPreBond.has(g.net),
      isOnCircuit:  g => _circuitNets.has(g.net),
      earthVoltage: earthV,
      faultCurrentFor: () => boltedFault
    });
    for (const c of components) {
      if (c.type !== 'earth_ground') continue;
      if (!compResults[c.id]) compResults[c.id] = {};
      Object.assign(compResults[c.id], results[c.id] || {});
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
    // Instruments are refreshed by solveCircuit() once protection has settled,
    // so a reading is never taken from a half-settled intermediate pass.
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
