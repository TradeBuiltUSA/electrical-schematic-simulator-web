// ═══════════════════════════════════════════════════════════════
//  FAULT CLASSIFICATION & PROTECTION EVALUATION
// ═══════════════════════════════════════════════════════════════
// The single place abnormal conditions are named and protective devices decide
// to open. Everything here reads SOLVED state — currents and voltages the solver
// already computed — and never inspects the canvas, the DOM, or a user-selected
// fault label to decide what is happening electrically.
//
// solver.js drives one cycle per frame:
//
//     solveElectricalPass()      ← nodal analysis, contacts settle
//   → classifyConditions()       ← this file: solved state → FaultEvent[]
//   → evaluateProtection()       ← this file: advance accumulators, open at most one device
//   → re-solve if a device opened, else settle
//
// The loop is MONOTONIC: within one top-level solve a protective device may go
// closed → open and never the reverse. Each pass therefore strictly shrinks the
// set of closed devices, so the cycle cannot run longer than (device count + 1)
// passes. That is a structural termination guarantee, not a counter — the counter
// in solver.js is only a backstop for a modelling mistake.
//
// ─────────────────────────────────────────────────────────────────────────────
//  SCOPE NOTE
// ─────────────────────────────────────────────────────────────────────────────
// Every model below is a generic educational approximation chosen so that trades
// students see the right BEHAVIOUR and the right ORDER OF MAGNITUDE. None of it
// is manufacturer data. This is not a coordination study, an arc-flash study, or
// an electromagnetic-transient program, and nothing here should be presented as
// a substitute for one. Per-model assumptions are documented at each definition.

// ── Classification vocabulary ────────────────────────────────────────────────
// Internal model. Not every class is surfaced in the UI; the renderer and the
// status line pick what to show. Tests assert on these rather than on strings
// shown to the user.
const FaultClass = {
  NORMAL:             'Normal',
  OPEN_CIRCUIT:       'OpenCircuit',
  OVERLOAD:           'Overload',
  SHORT_CIRCUIT:      'ShortCircuit',
  GROUND_FAULT:       'GroundFault',
  PHASE_LOSS:         'PhaseLoss',
  LOCKED_ROTOR:       'LockedRotor',
  UNDERVOLTAGE:       'Undervoltage',
  OVERVOLTAGE:        'Overvoltage',
  PROTECTION_TRIPPED: 'ProtectionTripped',
  FUSE_BLOWN:         'FuseBlown',
  HIGH_RESISTANCE:    'HighResistance',
  INVALID_SOURCE:     'InvalidSourceConnection',
  UNSOLVABLE:         'UnsolvableTopology',
  STARTING:           'Starting',        // legitimate inrush — informational, never a fault
  SOURCE_OVERLOAD:    'SourceOverload'
};

const FaultSeverity = { INFO: 'info', WARNING: 'warning', CRITICAL: 'critical' };

// Ranking used to pick the one condition worth putting on the status line, and
// to order the published list. Higher wins.
const _SEVERITY_RANK = { info: 0, warning: 1, critical: 2 };

// ═══════════════════════════════════════════════════════════════
//  SOURCE IMPEDANCE  —  the model everything else depends on
// ═══════════════════════════════════════════════════════════════
// MODEL:      Thévenin equivalent. Each source is an ideal EMF behind a series
//             resistance Rs, stamped into the nodal matrix as a Norton pair
//             (current source V/Rs in parallel with conductance 1/Rs).
//
// FORMULA:    Rs = V_nominal / I_available
//
// APPROXIMATES: The combined impedance of the utility transformer, the service
//             conductors and the branch-circuit wiring between the supply and the
//             point of fault — i.e. everything that limits how much current the
//             system can actually deliver into a bolted fault.
//
// ASSUMPTIONS:
//   • Purely resistive — X = 0, so Rs fixes the MAGNITUDE the system can deliver
//     and nothing else. A real system impedance is complex (X/R typically 1–6 at
//     a panel). This is a deliberate simplification, NOT a limit of the
//     arithmetic: the solver has been complex-phasor since phasor.js and would
//     stamp a reactive Rs perfectly well. It is kept resistive so that the single
//     number a trainee sets — available fault current — is enough to define the
//     source, with no second X/R field to get wrong.
//     What it costs is angle: fault current comes out in phase with the source
//     EMF, so anything that depends on source X/R is wrong even where the
//     magnitude is right. Asymmetry and DC offset are out of scope either way —
//     they are transient, and this is a steady-state solve.
//   • Constant with load. No transformer regulation curve, no voltage-dependent
//     behaviour, no motor contribution to fault current.
//   • One impedance from source to every point. There is no per-conductor length
//     or gauge, so a fault at the far end of a long run computes the same current
//     as one at the panel.
//
// WHY IT SUITS TRADES TRAINING: it is the single change that makes every
// downstream protection threshold mean something. Without it a nuisance overload,
// a motor start and a bolted short all compute the same infinite current, so no
// trip curve can distinguish them and no troubleshooting reading is credible.
//
// LIMITATIONS: not an available-fault-current calculation. Do not use these
// numbers for equipment interrupting ratings or any real installation.
//
// DEFAULTS: chosen as round, typical training values, all user-adjustable via the
// source's "Available Fault Current" property.
//   120 V / 240 V branch circuit   1,000 A
//   480 V service                 10,000 A
//   small DC battery                 500 A
const SOURCE_FAULT_DEFAULTS = {
  ac_source:  1000,
  ac_120:     1000,
  ac_240:     1000,
  ac_480:    10000,
  ac_480_wye:10000,
  dc_source:   500
};

// Series resistance of a source, in ohms. Never returns 0 or a non-finite value —
// it is stamped as a conductance, so a zero here would put Infinity in the matrix.
function sourceInternalR(src) {
  const V = (src && src.props && src.props.voltage) || 0;
  const declared = src && src.props ? src.props.faultCurrent : undefined;
  const Ifc = (typeof declared === 'number' && isFinite(declared) && declared > 0)
    ? declared
    : (SOURCE_FAULT_DEFAULTS[src && src.type] || 1000);
  if (!(V > 0)) return CONFIG.MIN_RESISTANCE;
  const R = V / Ifc;
  return (isFinite(R) && R > 1e-9) ? R : 1e-9;
}

// Available fault current actually in force for a source (after defaults).
function sourceFaultCurrent(src) {
  const declared = src && src.props ? src.props.faultCurrent : undefined;
  if (typeof declared === 'number' && isFinite(declared) && declared > 0) return declared;
  return SOURCE_FAULT_DEFAULTS[src && src.type] || 1000;
}

// ═══════════════════════════════════════════════════════════════
//  TIME-CURRENT MODELS
// ═══════════════════════════════════════════════════════════════
// MODEL:      One dimensionless damage accumulator M per device, 0 → 1.
//
// FORMULA:    dM/dt = (ratio² − r₀²) / k        ratio = I / I_rated
//             M clamped to [0, 1]; the device opens when M reaches 1.
//
// This is an I²t (Joule-integral) approximation. The (ratio² − r₀²) term is
// heating power minus the power the device can shed continuously; k sets the
// device's thermal capacity. Three properties fall out of it for free, and all
// three are behaviours the request asked for:
//
//   1. INVERSE TIME.       For a constant current the accumulator is equivalent to
//                          t_open = k / (ratio² − r₀²). Bigger overload, faster trip.
//   2. INRUSH TOLERANCE.   A 6× inrush decaying over a few hundred milliseconds
//                          deposits only a fraction of M, so a correctly sized
//                          device rides through a legitimate motor start — while a
//                          rotor that stays locked keeps depositing and does trip.
//   3. THERMAL MEMORY.     Below r₀ the term goes negative and M decays, so a device
//                          cools between events rather than resetting instantly.
//                          Repeated overloads accumulate, which is why the fourth
//                          start in a row trips a breaker the first three did not.
//
// ASSUMPTIONS:
//   • Adiabatic heating with a single lumped thermal mass and one time constant.
//     Real devices have several (element, body, terminals) and an ambient
//     dependence; none of that is modelled.
//   • r₀ = 1.1 — the classic "carries 110 % indefinitely" teaching rule. At exactly
//     r₀ the derivative is zero, so the no-damage band emerges from the formula
//     instead of being a separate special case.
//   • Cooling uses the same k as heating. Real cooling is slower than heating.
//
// LIMITATIONS: not a manufacturer time-current curve. No ambient derating, no
// pre-loading history across sessions, no interrupting rating, no arc energy.
const PROTECTION = {
  NO_DAMAGE_RATIO: 1.1,     // r₀ — carries this multiple of rating indefinitely
  // Fast-acting fuse: k such that 200 % of rating clears in ~1 s.
  //   k = t₂₀₀ × (2² − r₀²) = 1 × 2.79
  FAST_FUSE_K: 2.79,
  // Generic thermal-magnetic breaker instantaneous pickup, as a multiple of
  // rating. Real general-purpose breakers pick up somewhere in the 5–10× band
  // depending on curve letter; 10× is a defensible generic and matches the
  // threshold the simulator used before this model existed.
  DEFAULT_MAGNETIC: 10,
  // Floor on how fast a device can physically clear, whatever the multiple. These
  // are what make coordination come out right on a severe fault: a fuse element
  // melts and a current-limiting one clears inside a half cycle, while a breaker
  // has to move mechanical contacts. Give both the same floor and a 20 A breaker
  // beats a 3 A fuse on a bolted fault, which is backwards.
  FUSE_MIN_CLEAR: 0.002,      // ~1/8 cycle at 60 Hz — element melts, no moving parts
  BREAKER_MIN_CLEAR: 0.008    // ~1/2 cycle — solenoid pickup plus contact travel
};

// Convert a user-facing "delay" property into an accumulator constant.
// The property means: clearing time at 200 % of rating. Deriving k from it keeps
// the existing user-visible numbers meaningful instead of adding a new field.
function _kFromDelay(delaySeconds, fallback) {
  const d = (typeof delaySeconds === 'number' && isFinite(delaySeconds) && delaySeconds > 0)
    ? delaySeconds : fallback;
  const r0 = PROTECTION.NO_DAMAGE_RATIO;
  return Math.max(d * (4 - r0 * r0), 1e-4);
}

// Returns the protection model for a component, or null if it is not a
// protective device. `magnetic` is null for devices with no instantaneous element
// (a fuse's fast clearing emerges from the curve rather than a separate trip).
function protectionModelFor(c) {
  if (!c || !c.props) return null;
  switch (c.type) {
    case 'fuse':
    case 'lv_fuse':
      return { kind: 'fuse', k: PROTECTION.FAST_FUSE_K, magnetic: null, minClear: PROTECTION.FUSE_MIN_CLEAR };
    case 'td_fuse':
      // Time-delay fuse: same curve shape, much larger thermal mass. The default
      // delaySeconds of 10 puts 200 % of rating at 10 s — roughly ten times the
      // fast-acting element, which is the distinction the two classes exist for.
      return { kind: 'fuse', k: _kFromDelay(c.props.delaySeconds, 10), magnetic: null, minClear: PROTECTION.FUSE_MIN_CLEAR };
    case 'breaker':
      return {
        kind: 'breaker',
        k: _kFromDelay(c.props.delaySeconds, 5),
        magnetic: (typeof c.props.magneticTrip === 'number' && isFinite(c.props.magneticTrip) && c.props.magneticTrip > 1)
          ? c.props.magneticTrip : PROTECTION.DEFAULT_MAGNETIC,
        minClear: PROTECTION.BREAKER_MIN_CLEAR
      };
    default:
      return null;
  }
}

function isProtectiveDevice(c) { return protectionModelFor(c) !== null; }

// Has this device already operated? Fuses blow (not resettable in place);
// breakers trip (resettable).
function deviceIsOpen(c) {
  if (c.type === 'breaker') return c.props.tripped === true;
  return c.props.blown === true;
}

// Rated current, guarded — a corrupt or hand-edited save can carry anything.
function deviceRating(c) {
  const r = c.props ? c.props.ratedAmps : undefined;
  return (typeof r === 'number' && isFinite(r) && r > 0) ? r : 1;
}

// ── Multi-pole grouping ──────────────────────────────────────────────────────
// Decision: poles are linked by a shared group label, reusing the pattern users
// already know from contactor and relay groups, rather than introducing a
// six-terminal three-pole component with its own geometry, rotation and hit
// testing. Any pole that opens takes its whole group with it, which is the
// behaviour that matters electrically — a real multi-pole device opens all poles
// together regardless of which one saw the fault.
function deviceGroup(c) {
  const g = c.props ? c.props.poleGroup : undefined;
  return (typeof g === 'string' && g.trim() !== '') ? g.trim() : null;
}

// ═══════════════════════════════════════════════════════════════
//  THE PROTECTION LAYER
// ═══════════════════════════════════════════════════════════════
const TBProtection = (function () {
  let events = [];           // FaultEvent[] for the current solve
  let lastTime = null;       // animTime at the previous frame boundary
  let frameDt = 0;           // seconds of simulated time this frame
  let openedThisSolve = [];  // ids opened during the current top-level solve

  // ── Frame clock ────────────────────────────────────────────────────────────
  // Protection timing runs on animTime, the simulation clock, which already
  // accumulates real elapsed time clamped to 100 ms per frame. It is therefore
  // frame-rate independent and pauses with the simulation. dt is computed ONCE
  // per top-level solve, so the re-solve passes inside one frame advance no
  // accumulators — a device cannot trip twice on the same slice of time.
  //
  // Tests drive animTime directly instead of waiting on real frames, which is what
  // makes the whole protection suite deterministic.
  function beginFrame(now, running) {
    events = [];
    openedThisSolve = [];
    if (!running) { lastTime = null; frameDt = 0; return; }
    if (lastTime === null || !isFinite(lastTime) || now < lastTime) { frameDt = 0; }
    else { frameDt = Math.min(Math.max(now - lastTime, 0), 0.1); }
    lastTime = now;
  }

  // A static solve (an edit while de-energized, an undo) must not advance time.
  function freezeClock() { frameDt = 0; }

  function dt() { return frameDt; }

  // ── Event recording ────────────────────────────────────────────────────────
  // `measured`, `threshold`, `reason` and `action` are all optional; a caller
  // records what it actually knows rather than padding the shape.
  function record(ev) {
    if (!ev || !ev.class) return;
    events.push({
      class:       ev.class,
      severity:    ev.severity || FaultSeverity.WARNING,
      componentId: ev.componentId !== undefined ? ev.componentId : null,
      conductor:   ev.conductor || null,
      measured:    ev.measured || null,
      threshold:   ev.threshold || null,
      reason:      ev.reason || '',
      action:      ev.action || null
    });
  }

  function all() { return events.slice(); }

  // Highest-severity event, for the one-line status readout. Ties break toward
  // the earliest recorded, which is the one nearest the source of the problem.
  function primary() {
    let best = null;
    for (const e of events) {
      if (e.severity === FaultSeverity.INFO) continue;
      if (!best || _SEVERITY_RANK[e.severity] > _SEVERITY_RANK[best.severity]) best = e;
    }
    return best;
  }

  // ── Accumulator ────────────────────────────────────────────────────────────
  // Advances one device's damage fraction and reports how close it is to opening.
  // Returns { ratio, M, timeToOpen, instantaneous }.
  //   timeToOpen  seconds of remaining simulated time at the PRESENT current;
  //               Infinity when the device is not heating.
  function advance(c, current, seconds) {
    const model = protectionModelFor(c);
    if (!model) return null;
    const In = deviceRating(c);
    const I = (typeof current === 'number' && isFinite(current)) ? Math.abs(current) : 0;
    const ratio = I / In;
    const r0 = PROTECTION.NO_DAMAGE_RATIO;

    // Instantaneous magnetic element: a breaker's solenoid does not integrate,
    // it picks up on the current itself.
    const instantaneous = model.magnetic !== null && ratio >= model.magnetic;

    let M = c.props._thermal;
    if (typeof M !== 'number' || !isFinite(M)) M = 0;
    const rate = (ratio * ratio - r0 * r0) / model.k;
    if (seconds > 0) M = Math.max(0, Math.min(1, M + rate * seconds));
    c.props._thermal = M;
    c.props._thermalRatio = ratio;

    // Time to open at the PRESENT current, floored at what the device can
    // physically achieve. A severe fault drives the curve below that floor, so the
    // device is already "reached" on the frame the fault appears rather than
    // waiting for the accumulator to fill over several frames — which is the
    // closest this fixed-step model can get to a sub-cycle clearing time.
    const floor = model.minClear;
    let timeToOpen;
    if (instantaneous)  timeToOpen = floor;
    else if (rate > 0)  timeToOpen = Math.max((1 - M) / rate, floor);
    else                timeToOpen = Infinity;
    const reached = M >= 1 || timeToOpen <= floor;

    return { ratio, M, timeToOpen, instantaneous, rate, reached };
  }

  // ── Coordination ───────────────────────────────────────────────────────────
  // Given every armed device and the current through each, decide which ONE opens
  // this pass. Selection is by time-to-open — the device electrically closest to
  // the fault normally has the smallest rating and therefore the steepest
  // accumulator, so it clears first without anyone consulting the component array.
  // That replaces the old "first device found in placement order" rule, which made
  // coordination depend on the sequence the user dropped parts on the canvas.
  //
  // Ties are broken by higher current ratio, then by lower component id — both
  // deterministic, so a test never depends on array order.
  //
  // `devices` is [{ comp, current }]. Returns the component to open, or null.
  function selectToOpen(devices, seconds) {
    let winner = null, winnerScore = null;
    for (const d of devices) {
      const c = d.comp;
      if (deviceIsOpen(c)) continue;
      const st = advance(c, d.current, seconds);
      if (!st) continue;
      if (!st.reached) continue;
      const score = { t: st.timeToOpen, ratio: st.ratio, id: c.id, st };
      if (!winner) { winner = c; winnerScore = score; continue; }
      if (score.t < winnerScore.t ||
         (score.t === winnerScore.t && score.ratio > winnerScore.ratio) ||
         (score.t === winnerScore.t && score.ratio === winnerScore.ratio && score.id < winnerScore.id)) {
        winner = c; winnerScore = score;
      }
    }
    return winner ? { comp: winner, state: winnerScore.st } : null;
  }

  // Open a device and every pole grouped with it. Records the reason and the
  // measured values so the UI never has to reconstruct why.
  function open(comp, state, allComponents) {
    const group = deviceGroup(comp);
    const poles = group
      ? allComponents.filter(x => isProtectiveDevice(x) && deviceGroup(x) === group)
      : [comp];
    const isFuse = comp.type !== 'breaker';
    for (const p of poles) {
      if (p.type === 'breaker') p.props.tripped = true;
      else p.props.blown = true;
      p.props._thermal = 1;
      p.props._ocStartTime = null;
      openedThisSolve.push(p.id);
    }
    const In = deviceRating(comp);
    const I  = state.ratio * In;
    // Remembered so the standing diagnostic can keep quoting the current that
    // actually opened the device, not just the fact that it is open.
    comp.props._tripCurrent = I;
    comp.props._tripMagnetic = state.instantaneous === true;
    record({
      class:       isFuse ? FaultClass.FUSE_BLOWN : FaultClass.PROTECTION_TRIPPED,
      severity:    FaultSeverity.CRITICAL,
      componentId: comp.id,
      measured:    { current: I },
      threshold:   { rating: In, magnetic: state.instantaneous },
      reason:      state.instantaneous
        ? 'short-circuit current exceeded the instantaneous threshold'
        : 'sustained overcurrent reached the device’s thermal limit',
      action:      isFuse
        ? `Fuse blown — ${I.toFixed(1)} A on a ${In} A fuse`
        : `Breaker tripped — ${I.toFixed(1)} A detected on a ${In} A circuit`
    });
    return poles.length;
  }

  function opened() { return openedThisSolve.slice(); }

  // Clear accumulators for devices that are open, so a reset device starts cold.
  function rearm(c) {
    c.props._thermal = 0;
    c.props._thermalRatio = 0;
    c.props._ocStartTime = null;
  }

  return { beginFrame, freezeClock, dt, record, all, primary, advance, selectToOpen, open, opened, rearm };
})();

// ═══════════════════════════════════════════════════════════════
//  CONDITION CLASSIFIERS
// ═══════════════════════════════════════════════════════════════
// Each takes solved state and records events. None of them mutates the circuit.

// ── Overload vs short circuit vs legitimate inrush ───────────────────────────
// The distinction the request asks for, made from solved values rather than from
// which code path happened to run:
//
//   ratio ≥ magnetic multiple ............ ShortCircuit   (severe, clears fast)
//   ratio > 1.1 while a motor is starting  Starting       (informational, no fault)
//   ratio > 1.1 otherwise ................ Overload       (sustained overcurrent)
//
// "A motor is starting" is not a guess: solver.js records a surge factor per motor
// while its inrush is decaying, and passes the set of motor ids still in that
// window. Once the surge has decayed the same current is classified as an overload,
// which is exactly the locked-rotor case.
function classifyDeviceCurrent(c, current, startingNearby) {
  const model = protectionModelFor(c);
  if (!model) return;
  const In = deviceRating(c);
  const I = Math.abs(current || 0);
  const ratio = I / In;
  if (ratio <= PROTECTION.NO_DAMAGE_RATIO) return;

  const magnetic = model.magnetic !== null ? model.magnetic : PROTECTION.DEFAULT_MAGNETIC;
  if (ratio >= magnetic) {
    TBProtection.record({
      class: FaultClass.SHORT_CIRCUIT, severity: FaultSeverity.CRITICAL,
      componentId: c.id,
      measured: { current: I }, threshold: { rating: In, multiple: ratio },
      reason: `fault current is ${ratio.toFixed(1)}× the ${In} A rating`
    });
    return;
  }
  if (startingNearby) {
    TBProtection.record({
      class: FaultClass.STARTING, severity: FaultSeverity.INFO,
      componentId: c.id,
      measured: { current: I }, threshold: { rating: In, multiple: ratio },
      reason: 'motor starting current — within the inrush window'
    });
    return;
  }
  TBProtection.record({
    class: FaultClass.OVERLOAD, severity: FaultSeverity.WARNING,
    componentId: c.id,
    measured: { current: I }, threshold: { rating: In, multiple: ratio },
    reason: `sustained ${I.toFixed(1)} A on a ${In} A device`
  });
}

// ── Source loading ───────────────────────────────────────────────────────────
// A source is overloaded when it is delivering a substantial fraction of its own
// available fault current — i.e. the supply itself, not just a downstream device,
// is the thing being stressed.
function classifySourceLoading(src, current) {
  const Ifc = sourceFaultCurrent(src);
  const I = Math.abs(current || 0);
  if (I >= Ifc * 0.5) {
    TBProtection.record({
      class: FaultClass.SOURCE_OVERLOAD, severity: FaultSeverity.CRITICAL,
      componentId: src.id,
      measured: { current: I }, threshold: { available: Ifc },
      reason: `drawing ${I.toFixed(0)} A against ${Ifc} A available — no protection operated`
    });
  }
}

// ── Ground faults ────────────────────────────────────────────────────────────
// MODEL: a ground fault requires a COMPLETE PATH, not merely a connection to earth.
//
// Earth is modelled as one equipotential bus at 0 V shared by every ground symbol
// on the canvas — an ideal bonding conductor with no resistance. That abstraction
// is deliberate and is what the grounding exercises are built on, but it means the
// simulator cannot represent earth resistance, a high-impedance ground, or a
// ground-return path that limits current. It is a bonding model, not a soil model.
//
// Each ground symbol is classified by the net it sits on BEFORE the earth bond is
// applied:
//   • on a source reference (neutral) net .......... intentional bond
//   • on any other live circuit net ................ fault connection
//
// A ground FAULT exists only when a fault connection has somewhere to return to:
// either an intentional bond, or a second fault connection on a different net.
// A single ground on a hot leg with nothing else grounded is an ungrounded
// reference — unusual, possibly a wiring mistake, but no current flows and it is
// NOT a ground fault. Reporting it as one (with the load's own current quoted as
// the fault current) was the Stage 1 defect this replaces.
//
// Fault current is the current in the fault path — which, because the bond is
// ideal, is the bolted fault current the source computed — never a load current.
function classifyGrounds(ctx) {
  const { grounds, isBond, isOnCircuit, faultCurrentFor, earthVoltage } = ctx;
  const bonds = [], faultsOn = [];
  for (const g of grounds) {
    if (isBond(g)) bonds.push(g);
    else if (isOnCircuit(g)) faultsOn.push(g);
  }
  // Two fault connections count as a return path only if they are on different
  // pre-bond nets; two grounds on the same conductor bond nothing new.
  const distinctFaultNets = new Set(faultsOn.map(g => g.net));
  const hasReturn = bonds.length > 0 || distinctFaultNets.size > 1;

  const results = {};
  for (const g of grounds) {
    const bond = isBond(g);
    const onFault = !bond && isOnCircuit(g);
    const isFault = onFault && hasReturn;
    const Ifault = isFault ? faultCurrentFor(g) : 0;
    results[g.id] = {
      _groundFault:  isFault,
      _groundBond:   bond,
      _faultVoltage: isFault ? earthVoltage : 0,
      _faultCurrent: Ifault
    };
    if (isFault) {
      TBProtection.record({
        class: FaultClass.GROUND_FAULT, severity: FaultSeverity.CRITICAL,
        componentId: g.id, conductor: g.conductor || null,
        measured: { current: Ifault, voltage: earthVoltage },
        reason: 'energized conductor bonded to earth with a return path',
        action: g.conductor ? `Ground fault detected: ${g.conductor} → Ground`
                            : 'Ground fault detected'
      });
    } else if (onFault) {
      // Worth naming, but not a fault: no path, no current.
      TBProtection.record({
        class: FaultClass.NORMAL, severity: FaultSeverity.INFO,
        componentId: g.id,
        reason: 'ground reference on an energized conductor — no return path, no current flows'
      });
    }
  }
  return results;
}

// ── Source topology ──────────────────────────────────────────────────────────
// Classifies how multiple sources are tied together, instead of the previous
// behaviour where a load sitting between two sources silently produced no result
// at all. Per the agreed decision: annotate and keep solving whenever the topology
// is solvable, and refuse only what is genuinely contradictory.
//
//   AC tied to DC ........................... contradictory, unsolvable as modelled
//   different nominal voltages in parallel ... contradictory (ideal sources fight)
//   equal AC sources in parallel ............. solvable, annotated
//
// The "solvable" case is still annotated because this solver handles one source at
// a time; a genuine simultaneous multi-source solution needs superposition, which
// belongs with the phasor stage.
function classifySourceTopology(pairs) {
  let worst = null;
  for (const p of pairs) {
    const { a, b, sharedNets } = p;
    if (!sharedNets) continue;
    const aAC = isACSource(a.type), bAC = isACSource(b.type);
    const va = a.props.voltage || 0, vb = b.props.voltage || 0;

    if (aAC !== bAC) {
      TBProtection.record({
        class: FaultClass.INVALID_SOURCE, severity: FaultSeverity.CRITICAL,
        componentId: a.id,
        measured: { voltage: va }, threshold: { voltage: vb },
        reason: 'an AC source and a DC source are tied to the same conductors',
        action: 'Invalid source connection — AC and DC sources cannot share a circuit'
      });
      worst = FaultClass.INVALID_SOURCE;
      continue;
    }
    if (Math.abs(va - vb) > 0.5) {
      TBProtection.record({
        class: FaultClass.INVALID_SOURCE, severity: FaultSeverity.CRITICAL,
        componentId: a.id,
        measured: { voltage: va }, threshold: { voltage: vb },
        reason: `sources of ${va} V and ${vb} V are tied in parallel — circulating current flows between them`,
        action: `Invalid source connection — ${va} V tied to ${vb} V`
      });
      worst = FaultClass.INVALID_SOURCE;
      continue;
    }
    // Matched sources in parallel are no longer a limitation to warn about. The
    // phasor solver stamps each as a Norton pair in one system, so the network
    // distributes the load between them according to their impedances — which is
    // simply how paralleled supplies behave. Nothing to report.
  }
  return worst;
}

// ── Standing conditions ──────────────────────────────────────────────────────
// A device that has already operated is still a condition the user is looking at,
// but nothing re-records it: the frame after a breaker trips, the fault is gone
// from the circuit and so was the diagnostic. Re-assert it every solve for as long
// as the device stays open, so "Breaker tripped — 47.2 A on a 20 A circuit" is on
// screen while the trainee is troubleshooting it rather than for a single frame.
function recordOpenDevices(list) {
  for (const c of list) {
    if (!isProtectiveDevice(c) || !deviceIsOpen(c)) continue;
    const isFuse = c.type !== 'breaker';
    const In = deviceRating(c);
    const I  = c.props._tripCurrent;
    const known = typeof I === 'number' && isFinite(I);
    TBProtection.record({
      class:       isFuse ? FaultClass.FUSE_BLOWN : FaultClass.PROTECTION_TRIPPED,
      severity:    FaultSeverity.CRITICAL,
      componentId: c.id,
      measured:    known ? { current: I } : null,
      threshold:   { rating: In, magnetic: c.props._tripMagnetic === true },
      reason:      isFuse ? 'fuse is open' : 'breaker is in the tripped position',
      action:      isFuse
        ? (known ? `Fuse blown — ${I.toFixed(1)} A on a ${In} A fuse` : `Fuse blown — ${In} A`)
        : (known ? `Breaker tripped — ${I.toFixed(1)} A detected on a ${In} A circuit`
                 : `Breaker tripped — ${In} A circuit`)
    });
  }
}

// ── Publishing ───────────────────────────────────────────────────────────────
// One ordered, de-duplicated list. The renderer, the status line and the tests all
// read this rather than each deciding for themselves what counts as a fault.
function publishFaults() {
  const seen = new Set();
  const out = [];
  for (const e of TBProtection.all()) {
    const k = e.class + '|' + e.componentId + '|' + (e.conductor || '');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  out.sort((a, b) => _SEVERITY_RANK[b.severity] - _SEVERITY_RANK[a.severity]);
  window.TBFaults = out;
  return out;
}

// ═══════════════════════════════════════════════════════════════
//  FAULT REGISTRY  —  one source of truth for the whole app
// ═══════════════════════════════════════════════════════════════
// The solver, the properties panel, the renderer and the meters all read this.
// Keeping it in one table is what stops a repeat of the Stage 1 defect where the
// fan's fault modes worked in the solver, had no properties-panel control, and
// were advertised in the README regardless. A mode listed here is reachable from
// the UI; a mode the solver honours but which is absent here is unreachable, and
// that mismatch is now a single table to check rather than four files.
const FAULT_MODES = {
  resistor:          ['none', 'open', 'short', 'high-resistance', 'ground-fault'],
  bulb:              ['none', 'open', 'short', 'high-resistance', 'ground-fault'],
  outlet:            ['none', 'open', 'short', 'high-resistance', 'ground-fault'],
  fan:               ['none', 'open', 'short', 'locked-rotor', 'ground-fault'],
  compressor:        ['none', 'open-run', 'open-start', 'short-run', 'short-start',
                      'locked-rotor', 'open-start-circuit', 'cutout-failure', 'ground-fault'],
  capacitor:         ['none', 'open', 'short', 'weak', 'out-of-tolerance'],
  contactor_coil:    ['none', 'open', 'short'],
  relay_coil:        ['none', 'open', 'short'],
  contactor_contact: ['none', 'welded', 'stuck-open', 'high-resistance'],
  relay_contact:     ['none', 'welded', 'stuck-open', 'high-resistance'],
  switch:            ['none', 'welded', 'stuck-open', 'high-resistance'],
  transformer:       ['none', 'open-primary', 'open-secondary', 'short-primary', 'short-secondary'],
};

// Wording aimed at a trainee reading a properties panel, not at the code.
const FAULT_LABELS = {
  'none':               'None (healthy)',
  'open':               'Open',
  'short':              'Shorted',
  'high-resistance':    'High resistance',
  'ground-fault':       'Ground fault (to frame)',
  'locked-rotor':       'Locked rotor',
  'open-run':           'Run winding open',
  'open-start':         'Start winding open',
  'short-run':          'Run winding shorted',
  'short-start':        'Start winding shorted',
  'open-start-circuit': 'Start circuit open (relay)',
  'cutout-failure':     'Start cutout failed closed',
  'weak':               'Weak (lost capacitance)',
  'out-of-tolerance':   'Out of tolerance',
  'welded':             'Contacts welded closed',
  'stuck-open':         'Contacts stuck open',
  'open-primary':       'Primary winding open',
  'open-secondary':     'Secondary winding open',
  'short-primary':      'Primary winding shorted',
  'short-secondary':    'Secondary winding shorted',
};

// Parts whose 'short' really is a bolted short across their terminals. Coils and
// transformer windings are excluded on purpose: they fail by losing turns, so
// they are modelled as collapsed resistance and still draw a finite (large)
// current the upstream device can respond to.
// Compressor faults that leave the rotor stationary. A single-phase CSR motor
// develops no starting torque without a working start winding, so losing it in any
// way — open winding, shorted winding, or an open start circuit outside the motor —
// stalls the machine just as a seized bearing would. An open run winding stalls it
// from the other side. Everything else about locked-rotor behaviour (current,
// effective inductance, absent back-EMF, start winding never cutting out) follows
// from the rotor being stationary rather than being asserted per fault.
const COMPRESSOR_STALL_FAULTS = new Set([
  'locked-rotor', 'open-start-circuit', 'open-start', 'short-start', 'open-run'
]);

const BOLTED_SHORT_TYPES = new Set(['resistor', 'bulb', 'outlet', 'capacitor', 'fan']);

// The switching family, in one place — used for net merging, ohmmeter continuity
// and fault handling alike.
function isSwitchingType(type) {
  return type === 'switch' || type === 'time_delay' ||
         type === 'contactor_contact' || type === 'relay_contact';
}

function faultModesFor(type) { return FAULT_MODES[type] || null; }
function faultLabel(mode) { return FAULT_LABELS[mode] || mode; }
function faultOf(c) { return (c && c.props && c.props.faultMode) || 'none'; }
function hasFaultMode(c, mode) { return faultOf(c) === mode; }

// ── Fault model constants ────────────────────────────────────────────────────
// Each is a single representative value chosen for teaching, not a measurement.
// A student should learn the SHAPE of the symptom — what the meter does and which
// protective device responds — not treat these numbers as typical of any real part.
const FAULT_MODEL = {
  // A degraded connection or partially open element. Ten times nominal is enough
  // to be obvious on a meter and to starve the load visibly, without looking open.
  HIGH_R_FACTOR: 10,
  // Series resistance a set of pitted/burned contacts adds to a circuit that
  // should read near zero. Enough to drop meaningful voltage under load.
  CONTACT_HIGH_R: 5,
  // Winding-to-frame insulation failure. Low but deliberately NOT bolted, so the
  // ground-fault path is distinguishable from a dead short and the student sees a
  // fault current that depends on the grounding path being intact.
  GROUND_FAULT_R: 5,
  // Shorted turns in a coil: resistance collapses but does not vanish. Expressed
  // as a fraction of the coil's healthy resistance so it scales with the part.
  COIL_SHORT_FRACTION: 0.05,
  // Shorted turns in a transformer winding, same idea.
  WINDING_SHORT_FRACTION: 0.05,
  // A capacitor that has lost capacitance, and one that has merely drifted out of
  // its tolerance band. The second is the subtle one — it only shows on a meter.
  WEAK_CAP_FRACTION: 0.5,
  OUT_OF_TOL_FRACTION: 0.8,
  // Motor terminal-voltage band, the conventional ±10 % teaching limits.
  UNDERVOLTAGE: 0.9,
  OVERVOLTAGE: 1.1,
};

// ── Capacitance actually present ─────────────────────────────────────────────
// The single place a capacitor's real value is decided. The solver uses it for
// reactance and the multimeter uses it for the µF reading, so a weak capacitor
// cannot read healthy on the meter while behaving weak in the circuit, or the
// reverse. That consistency is the whole point of the troubleshooting exercise.
function effectiveCapacitance(c) {
  const rated = Math.max((c && c.props && c.props.capacitance) || 10, 0.001);
  switch (faultOf(c)) {
    case 'short': return 0;               // plates shorted — no dielectric left
    case 'open':  return 0;               // reads OL; no capacitance at all
    case 'weak':  return rated * FAULT_MODEL.WEAK_CAP_FRACTION;
    case 'out-of-tolerance': return rated * FAULT_MODEL.OUT_OF_TOL_FRACTION;
    default:      return rated;
  }
}

// ── Contact state under failure ──────────────────────────────────────────────
// A welded contact is closed no matter what the coil is doing — that is the whole
// hazard, and the reason it is worth simulating. Stuck-open is the mirror image.
// Both override the control command rather than being overridden by it.
//
// `commanded` is what the coil (or the user's switch position) is asking for.
function contactConducts(c, commanded) {
  switch (faultOf(c)) {
    case 'welded':     return true;
    case 'stuck-open': return false;
    default:           return commanded;
  }
}
// A high-resistance contact still conducts, but through real resistance rather
// than as a net merge — so it drops voltage under load and reads on an ohmmeter.
function contactSeriesR(c) {
  return faultOf(c) === 'high-resistance' ? FAULT_MODEL.CONTACT_HIGH_R : 0;
}

// ── Effective resistance of a faulted load ───────────────────────────────────
function loadResistanceFor(c, baseR) {
  return faultOf(c) === 'high-resistance' ? baseR * FAULT_MODEL.HIGH_R_FACTOR : baseR;
}

// ── Motor terminal voltage ───────────────────────────────────────────────────
// Classification only: the simulator does not model what sustained undervoltage
// eventually does to a winding. A student should read this as "this motor is not
// getting what its nameplate asks for", which is the diagnosis, not a prediction
// of failure.
function classifyMotorVoltage(c, nameplateV, measuredV) {
  if (!(nameplateV > 0) || !(measuredV > 0)) return;
  const ratio = measuredV / nameplateV;
  if (ratio < FAULT_MODEL.UNDERVOLTAGE) {
    TBProtection.record({
      class: FaultClass.UNDERVOLTAGE, severity: FaultSeverity.WARNING, componentId: c.id,
      measured: { voltage: measuredV }, threshold: { rating: nameplateV },
      reason: `${measuredV.toFixed(1)} V at a ${nameplateV} V motor (${(ratio * 100).toFixed(0)}%)`,
      action: `Undervoltage — ${measuredV.toFixed(1)} V on a ${nameplateV} V motor`
    });
  } else if (ratio > FAULT_MODEL.OVERVOLTAGE) {
    TBProtection.record({
      class: FaultClass.OVERVOLTAGE, severity: FaultSeverity.WARNING, componentId: c.id,
      measured: { voltage: measuredV }, threshold: { rating: nameplateV },
      reason: `${measuredV.toFixed(1)} V at a ${nameplateV} V motor (${(ratio * 100).toFixed(0)}%)`,
      action: `Overvoltage — ${measuredV.toFixed(1)} V on a ${nameplateV} V motor`
    });
  }
}

// ── Load power ───────────────────────────────────────────────────────────────
// A bulb or resistor dissipating past its rating. Classified, never destroyed:
// the simulator has no model for what actually fails first, and inventing one
// would be fake precision.
function classifyLoadPower(c, watts, rating) {
  if (!(rating > 0) || !(watts > rating * PROTECTION.NO_DAMAGE_RATIO)) return;
  TBProtection.record({
    class: FaultClass.OVERLOAD, severity: FaultSeverity.WARNING, componentId: c.id,
    measured: { watts }, threshold: { rating },
    reason: `dissipating ${watts.toFixed(0)} W in a ${rating} W part`,
    action: `Overloaded — ${watts.toFixed(0)} W in a ${rating} W part`
  });
}

// ── Motor thermal accumulation ───────────────────────────────────────────────
// MODEL:   the same I²t accumulator the protective devices use, run against the
//          motor's own full-load current instead of a device rating.
//
// FORMULA: dM/dt = (ratio² − r₀²) / k,  ratio = I / I_FLA,  k from the trip class
//
// APPROXIMATES an overload relay's heater — which is exactly what it is meant to
// represent. Class 20 (trip at 20 s on 600 % of FLA) is the training default;
// k is derived so the accumulator reaches 1 at that point.
//
// This does NOT damage the motor. It classifies, so a student can see a stalled
// motor accumulating heat while a healthy start does not. The simulator has no
// winding-temperature model and should not be read as predicting burnout.
const MOTOR_TRIP_CLASS_SECONDS = 20;   // seconds to trip at 600 % of FLA
function motorThermalK() {
  const r0 = PROTECTION.NO_DAMAGE_RATIO;
  return MOTOR_TRIP_CLASS_SECONDS * (36 - r0 * r0);
}
function accumulateMotorHeat(c, current, fla, seconds) {
  if (!(fla > 0)) return 0;
  const ratio = Math.abs(current || 0) / fla;
  const r0 = PROTECTION.NO_DAMAGE_RATIO;
  let M = c.props._motorHeat;
  if (typeof M !== 'number' || !isFinite(M)) M = 0;
  if (seconds > 0) {
    M = Math.max(0, Math.min(1, M + ((ratio * ratio - r0 * r0) / motorThermalK()) * seconds));
  }
  c.props._motorHeat = M;
  return M;
}

// ── Locked rotor ─────────────────────────────────────────────────────────────
// A rotor that never accelerates. The current follows from the electrical model
// rather than being asserted: with the rotor stationary there is no back-EMF and
// the effective inductance stays at its locked-rotor value, so the winding draws
// its locked-rotor current for as long as the condition lasts. That is what makes
// it distinguishable from a start — a start looks identical for a moment and then
// decays, a locked rotor does not.
function classifyLockedRotor(c, current, fla, heat) {
  const ratio = fla > 0 ? Math.abs(current || 0) / fla : 0;
  TBProtection.record({
    class: FaultClass.LOCKED_ROTOR,
    severity: heat > 0.5 ? FaultSeverity.CRITICAL : FaultSeverity.WARNING,
    componentId: c.id,
    measured: { current: Math.abs(current || 0) },
    threshold: { rating: fla, multiple: ratio },
    reason: `rotor is not turning — current holding at ${ratio.toFixed(1)}x full-load`,
    action: `Motor stalled — ${Math.abs(current || 0).toFixed(1)} A, ${ratio.toFixed(1)}x FLA`
  });
}

// ── Component ground faults ──────────────────────────────────────────────────
// A winding or element leaking to the equipment frame. The solver models this as
// a real resistive branch from the component to the earth bus, so current only
// flows when the grounding path is actually complete — an ungrounded system shows
// the fault present and no current, which is the lesson.
function classifyComponentGroundFault(c, current) {
  const I = Math.abs(current || 0);
  TBProtection.record({
    class: FaultClass.GROUND_FAULT,
    severity: I > 0.01 ? FaultSeverity.CRITICAL : FaultSeverity.WARNING,
    componentId: c.id,
    measured: { current: I },
    reason: I > 0.01
      ? `winding-to-frame fault carrying ${I.toFixed(2)} A to ground`
      : 'winding-to-frame fault present, but no complete path to ground so no current flows',
    action: I > 0.01
      ? `Ground fault — ${I.toFixed(2)} A to ground`
      : 'Ground fault present — system not grounded, no fault current'
  });
}
