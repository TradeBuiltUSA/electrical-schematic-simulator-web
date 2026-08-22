// ═══════════════════════════════════════════════════════════════
//  COMPLEX PHASOR NETWORK SOLVER
// ═══════════════════════════════════════════════════════════════
// Steady-state, fundamental-frequency AC analysis using complex phasors, plus DC
// as the ω = 0 case of the same machinery. This replaces the previous approach,
// which solved a three-phase source as three independent real-valued RMS problems
// sharing one node map — an approximation that could not represent neutral
// current, unbalance, or the difference between a phase-to-phase and a
// phase-to-ground fault.
//
// ─────────────────────────────────────────────────────────────────────────────
//  CONVENTIONS  —  stated explicitly, because every sign in here depends on them
// ─────────────────────────────────────────────────────────────────────────────
//
// PHASOR CONVENTION
//   Every phasor is an RMS quantity, not a peak. A source labelled 120 V is
//   120 V RMS, and |V| read off a solved node is directly what an RMS meter
//   displays. Time dependence e^{jωt} is implicit and never represented.
//
// ANGLE CONVENTION
//   Angles are in radians, counter-clockwise positive, referred to phase A.
//   Three-phase sources use POSITIVE (ABC) SEQUENCE:
//
//       L1 (A)    0°
//       L2 (B)  −120°
//       L3 (C)  +120°
//
//   With that convention and a wye source of line-to-neutral magnitude E:
//       V_L1N = E∠0°,  V_L2N = E∠−120°,  V_L3N = E∠+120°
//       V_L1L2 = V_L1N − V_L2N = √3·E∠+30°
//   so line-to-line magnitude is √3 times line-to-neutral, which is where
//   480/√3 ≈ 277 comes from. That relationship is now a RESULT of the phasor
//   arithmetic rather than a constant divided in by hand.
//
// IMPEDANCE CONVENTION
//   Z = R + jX.  Inductive reactance X_L = +ωL (current lags voltage).
//   Capacitive reactance X_C = −1/(ωC) (current leads voltage).
//   Admittance Y = 1/Z. A capacitor is stamped directly as Y = jωC, which makes
//   it an open circuit at ω = 0 with no special case — DC blocking falls out of
//   the arithmetic instead of being asserted.
//
// POWER CONVENTION
//   Complex power S = V · conj(I), so:
//       P = Re(S)   real power, watts       (positive = consumed)
//       Q = Im(S)   reactive power, VAR     (positive = inductive / lagging)
//       |S|         apparent power, VA
//       PF = P/|S|  power factor, lagging when Q > 0
//   Power factor is therefore SOLVED, not carried as a per-component property.
//
// ─────────────────────────────────────────────────────────────────────────────
//  SCOPE
// ─────────────────────────────────────────────────────────────────────────────
// This is steady-state fundamental-frequency analysis and nothing more. It does
// NOT perform harmonic analysis, transient or waveform simulation, symmetrical-
// component or sequence-network studies, arc-flash calculation, or any
// manufacturer-specific protection study. One frequency, one steady state.

// ── Complex scalars ──────────────────────────────────────────────────────────
// Kept as a tiny function namespace over {re, im} literals. These are used to
// build and interpret the system; the solver core itself works on flat typed
// arrays and allocates nothing, because it runs every animation frame.
const Cx = {
  make: (re, im) => ({ re: re || 0, im: im || 0 }),
  zero: () => ({ re: 0, im: 0 }),
  fromPolar: (mag, ang) => ({ re: mag * Math.cos(ang), im: mag * Math.sin(ang) }),
  add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
  sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
  mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
  conj: a => ({ re: a.re, im: -a.im }),
  scale: (a, k) => ({ re: a.re * k, im: a.im * k }),
  abs: a => Math.hypot(a.re, a.im),
  arg: a => Math.atan2(a.im, a.re),
  isFinite: a => isFinite(a.re) && isFinite(a.im),
  div(a, b) {
    // Smith's method: divide through by the larger component so that neither
    // |b.re|² nor |b.im|² can overflow or underflow on its own.
    const { re: ar, im: ai } = a, { re: br, im: bi } = b;
    if (br === 0 && bi === 0) return { re: 0, im: 0 };
    if (Math.abs(br) >= Math.abs(bi)) {
      const r = bi / br, d = br + bi * r;
      return { re: (ar + ai * r) / d, im: (ai - ar * r) / d };
    }
    const r = br / bi, d = br * r + bi;
    return { re: (ar * r + ai) / d, im: (ai * r - ar) / d };
  },
  inv(a) { return Cx.div({ re: 1, im: 0 }, a); }
};

// Impedance of a series R-L-C leg at angular frequency w, as an admittance.
// At w = 0 (DC): an inductor is its winding resistance, a capacitor is an open
// circuit. Both fall out of the formula rather than needing a branch.
function admittanceOf(R, L, C, w) {
  if (C > 0) {
    // Capacitive branch: Y = jωC. Zero at DC — a true open circuit.
    return { re: 0, im: w * C };
  }
  const X = w * (L || 0);
  const Rr = (R > 0) ? R : 0;
  if (Rr === 0 && X === 0) return { re: 0, im: 0 };   // caller must avoid this
  return Cx.inv({ re: Rr, im: X });
}

// ═══════════════════════════════════════════════════════════════
//  COMPLEX LINEAR SOLVER
// ═══════════════════════════════════════════════════════════════
// Gaussian elimination with partial pivoting, generalized from the real solver
// this replaces rather than living alongside it. One implementation, one set of
// numerical guards.
//
// Storage is a single flat Float64Array holding the augmented matrix with
// interleaved real and imaginary parts:
//
//     A[(row * (n + 1) + col) * 2]      real part
//     A[(row * (n + 1) + col) * 2 + 1]  imaginary part
//
// Column n is the right-hand side. Nothing is allocated during elimination,
// which matters because this runs on every animation frame.
//
// Returns a Float64Array of 2n interleaved values, or null when the matrix is
// singular — the caller must treat null as "this network has no unique
// solution" and report a topology problem rather than pressing on with garbage.
function solveComplexLinear(A, n) {
  const stride = (n + 1) * 2;
  const idx = (r, c) => r * stride + c * 2;

  for (let col = 0; col < n; col++) {
    // ── Partial pivoting on complex magnitude ──
    let piv = col, best = -1;
    for (let r = col; r < n; r++) {
      const k = idx(r, col);
      const m = Math.hypot(A[k], A[k + 1]);
      if (m > best) { best = m; piv = r; }
    }
    // A pivot this small means the network has no unique solution — a floating
    // sub-network, or ideal sources fighting each other. Report it; never divide.
    if (!(best > 1e-12)) return null;

    if (piv !== col) {
      for (let j = 0; j < stride; j++) {
        const t = A[col * stride + j];
        A[col * stride + j] = A[piv * stride + j];
        A[piv * stride + j] = t;
      }
    }

    const pk = idx(col, col);
    const pr = A[pk], pi = A[pk + 1];

    for (let r = col + 1; r < n; r++) {
      const rk = idx(r, col);
      const ar = A[rk], ai = A[rk + 1];
      if (ar === 0 && ai === 0) continue;
      // factor = A[r][col] / A[col][col], by Smith's method
      let fr, fi;
      if (Math.abs(pr) >= Math.abs(pi)) {
        const q = pi / pr, d = pr + pi * q;
        fr = (ar + ai * q) / d; fi = (ai - ar * q) / d;
      } else {
        const q = pr / pi, d = pr * q + pi;
        fr = (ar * q + ai) / d; fi = (ai * q - ar) / d;
      }
      if (!isFinite(fr) || !isFinite(fi)) return null;
      for (let c = col; c <= n; c++) {
        const sk = idx(col, c), tk = idx(r, c);
        const sr = A[sk], si = A[sk + 1];
        A[tk]     -= fr * sr - fi * si;
        A[tk + 1] -= fr * si + fi * sr;
      }
    }
  }

  // ── Back substitution ──
  const x = new Float64Array(n * 2);
  for (let i = n - 1; i >= 0; i--) {
    let sr = A[idx(i, n)], si = A[idx(i, n) + 1];
    for (let j = i + 1; j < n; j++) {
      const ak = idx(i, j);
      const ar = A[ak], ai = A[ak + 1];
      const xr = x[j * 2], xi = x[j * 2 + 1];
      sr -= ar * xr - ai * xi;
      si -= ar * xi + ai * xr;
    }
    const dk = idx(i, i);
    const dr = A[dk], di = A[dk + 1];
    let vr, vi;
    if (Math.abs(dr) >= Math.abs(di)) {
      const q = di / dr, d = dr + di * q;
      vr = (sr + si * q) / d; vi = (si - sr * q) / d;
    } else {
      const q = dr / di, d = dr * q + di;
      vr = (sr * q + si) / d; vi = (si * q - sr) / d;
    }
    if (!isFinite(vr) || !isFinite(vi)) return null;
    x[i * 2] = vr; x[i * 2 + 1] = vi;
  }
  return x;
}

// ═══════════════════════════════════════════════════════════════
//  NETWORK BUILDER
// ═══════════════════════════════════════════════════════════════
// A network is a set of nodes joined by branches. Every branch is stamped in its
// Norton form — an admittance Y in parallel with a current source J — which is
// the one shape that handles passive elements and real sources uniformly:
//
//   passive element    Y = 1/Z,            J = 0
//   source behind Z    Y = 1/Zs,           J = E·Y      (E = internal EMF)
//
// Stamping sources this way rather than forcing a node to a fixed voltage is what
// makes multiple sources solvable at all: two supplies feeding one circuit simply
// contribute two Norton pairs, and the solve distributes the load between them
// according to their impedances. It also guarantees that every node a source
// touches has a conductance path to the reference, which removes a whole class of
// singular matrices.
function createNetwork(omega) {
  return {
    omega: omega || 0,
    nodes: new Map(),      // node key → matrix index
    branches: [],          // { a, b, Y, J, id, meta }
    _order: []
  };
}

function netNode(net, key) {
  if (!net.nodes.has(key)) { net.nodes.set(key, net._order.length); net._order.push(key); }
  return net.nodes.get(key);
}

// Add a branch between two node keys. `Y` is complex admittance; `J` is a complex
// current injected from `a` to `b` (the Norton source), and may be omitted.
function addBranch(net, aKey, bKey, Y, J, id, meta) {
  netNode(net, aKey); netNode(net, bKey);
  net.branches.push({ a: aKey, b: bKey, Y, J: J || Cx.zero(), id: id || null, meta: meta || null });
}

/**
 * Solve a network.
 *
 * `refKey` is the reference node, held at 0 V. Every other node voltage is
 * relative to it, exactly as a meter's common lead defines what it reads.
 *
 * Returns { ok, voltages: Map(key → complex), reason } — `ok: false` carries an
 * electrical/topological reason rather than leaving the caller to interpret NaN.
 */
function solveNetwork(net, refKey) {
  const keys = net._order;
  if (!net.nodes.has(refKey)) return { ok: false, reason: 'reference node is not in the network' };

  // Index every node except the reference, which is the grounded row we omit.
  const index = new Map();
  let n = 0;
  for (const k of keys) if (k !== refKey) index.set(k, n++);

  const voltages = new Map();
  voltages.set(refKey, Cx.zero());
  if (n === 0) return { ok: true, voltages };

  const stride = (n + 1) * 2;
  const A = new Float64Array(n * stride);
  const at = (r, c) => r * stride + c * 2;

  for (const br of net.branches) {
    const { Y, J } = br;
    if (!Cx.isFinite(Y) || !Cx.isFinite(J)) {
      return { ok: false, reason: 'a branch produced a non-finite admittance' };
    }
    const ia = index.has(br.a) ? index.get(br.a) : -1;
    const ib = index.has(br.b) ? index.get(br.b) : -1;
    if (ia === ib) continue;                      // both on the reference

    if (ia >= 0) {
      const k = at(ia, ia); A[k] += Y.re; A[k + 1] += Y.im;
      const j = at(ia, n);  A[j] += J.re; A[j + 1] += J.im;
    }
    if (ib >= 0) {
      const k = at(ib, ib); A[k] += Y.re; A[k + 1] += Y.im;
      const j = at(ib, n);  A[j] -= J.re; A[j + 1] -= J.im;
    }
    if (ia >= 0 && ib >= 0) {
      const k1 = at(ia, ib); A[k1] -= Y.re; A[k1 + 1] -= Y.im;
      const k2 = at(ib, ia); A[k2] -= Y.re; A[k2 + 1] -= Y.im;
    }
  }

  const x = solveComplexLinear(A, n);
  if (!x) {
    return { ok: false, reason: 'the network has no unique solution — a floating section, or sources that cannot be satisfied together' };
  }
  for (const [k, i] of index) {
    const v = { re: x[i * 2], im: x[i * 2 + 1] };
    if (!Cx.isFinite(v)) return { ok: false, reason: 'the solution contained a non-finite node voltage' };
    voltages.set(k, v);
  }
  return { ok: true, voltages };
}

// Current through a branch, from a → b, given solved node voltages.
//
//     I = (Va − Vb)·Y − J
//
// The −J term matters: for a source branch the Norton current source and the
// admittance are in parallel, so the terminal current is what the admittance
// carries minus what the source injects. Getting this right is what lets a
// protective device read the current it is actually carrying, including when it
// sits in one leg of a parallel pair — the case the previous scalar attribution
// could not represent at all.
function branchCurrent(br, voltages) {
  const Va = voltages.get(br.a) || Cx.zero();
  const Vb = voltages.get(br.b) || Cx.zero();
  const I = Cx.sub(Cx.mul(Cx.sub(Va, Vb), br.Y), br.J);
  return Cx.isFinite(I) ? I : Cx.zero();
}

// Complex power delivered into a branch: S = V·conj(I).
function branchPower(br, voltages) {
  const Va = voltages.get(br.a) || Cx.zero();
  const Vb = voltages.get(br.b) || Cx.zero();
  const V = Cx.sub(Va, Vb);
  const I = branchCurrent(br, voltages);
  const S = Cx.mul(V, Cx.conj(I));
  const apparent = Cx.abs(S);
  const pf = apparent > 1e-12 ? S.re / apparent : 1;
  return {
    real: S.re,                              // watts
    reactive: S.im,                          // VAR, positive = lagging/inductive
    apparent,                                // VA
    powerFactor: Math.max(-1, Math.min(1, pf)),
    phaseAngle: Cx.arg(V) - Cx.arg(I)        // radians, positive = current lags
  };
}

// ── Three-phase source angles ────────────────────────────────────────────────
// Positive (ABC) sequence, phase A as the reference. See the convention block at
// the top of this file — every three-phase result in the simulator depends on
// these three numbers and nothing else.
const PHASE_ANGLES = [0, -2 * Math.PI / 3, 2 * Math.PI / 3];   // L1, L2, L3
