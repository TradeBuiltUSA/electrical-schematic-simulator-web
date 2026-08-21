
// ═══════════════════════════════════════════════════════════════
//  MULTIMETER
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  MULTIMETER — DRAG-BASED PROBES
// ═══════════════════════════════════════════════════════════════

// Extra state for drag probes
let probeBlackPos = { x: 0, y: 0 };  // current screen position of black probe tip
let probeRedPos   = { x: 0, y: 0 };  // current screen position of red probe tip
let probeDragging = null; // 'red' | 'black' | null
let probeDragOffset = { x: 0, y: 0 };

function getJackScreenPos(jackId) {
  const jack = document.getElementById(jackId);
  if (!jack) return { x: 0, y: 0 };
  const hole = jack.querySelector('.jack-hole');
  const r = (hole || jack).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function updateTethers() {
  const svgEl = document.getElementById('probe-svg');
  if (!svgEl) return;

  function drawTether(elId, jx, jy, ex, ey) {
    const el = document.getElementById(elId);
    if (!el) return;
    const dy = ey - jy, dx = ex - jx;
    const dist = Math.hypot(dx, dy);
    const sag = Math.min(dist * 0.45, 80);
    const cx1 = jx, cy1 = jy + sag;
    const cx2 = ex, cy2 = ey - sag * 0.2;
    el.setAttribute('d', `M ${jx} ${jy} C ${cx1} ${cy1} ${cx2} ${cy2} ${ex} ${ey}`);
    el.setAttribute('opacity', '1');
  }

  if (meterActive) {
    // If probes are snapped to grid nodes, recompute screen pos from grid coords
    // so they stay locked when camera pans or zooms
    if (meterProbe1 && !probeDragging) {
      probeBlackPos = gridToScreen(meterProbe1.gx, meterProbe1.gy);
      updateProbeEls();
    }
    if (meterProbe2 && !probeDragging) {
      probeRedPos = gridToScreen(meterProbe2.gx, meterProbe2.gy);
      updateProbeEls();
    }

    const jackB = getJackScreenPos('jack-black');
    const jackR = getJackScreenPos('jack-red');

    // Black tether
    const tb = document.getElementById('tether-black');
    if (meterProbe1 !== null || probeDragging === 'black') {
      drawTether('tether-black', jackB.x, jackB.y, probeBlackPos.x, probeBlackPos.y);
    } else {
      tb && tb.setAttribute('opacity', '0');
    }

    // Red tether
    const tr = document.getElementById('tether-red');
    if (meterProbe2 !== null || probeDragging === 'red') {
      drawTether('tether-red', jackR.x, jackR.y, probeRedPos.x, probeRedPos.y);
    } else {
      tr && tr.setAttribute('opacity', '0');
    }

    // Dot indicators on snapped nodes
    const db = document.getElementById('probe-dot-black');
    const dr = document.getElementById('probe-dot-red');
    if (meterProbe1) {
      db.setAttribute('cx', probeBlackPos.x); db.setAttribute('cy', probeBlackPos.y); db.setAttribute('opacity','1');
    } else { db.setAttribute('opacity','0'); }
    if (meterProbe2) {
      dr.setAttribute('cx', probeRedPos.x); dr.setAttribute('cy', probeRedPos.y); dr.setAttribute('opacity','1');
    } else { dr.setAttribute('opacity','0'); }
  } else {
    ['tether-black','tether-red','probe-dot-black','probe-dot-red'].forEach(id => {
      const el = document.getElementById(id); if (el) el.setAttribute('opacity','0');
    });
  }

  // ── NCV tether ──
  updateNcvtTether(drawTether);

  // ── Clamp meter tether ──
  if (window._clampUpdateTether) window._clampUpdateTether();

}

function getNcvtTipHomePos() {
  // Returns screen coords of the downward-pointing tip apex (bottom of ncvt-tip-point triangle)
  const pt = document.getElementById('ncvt-tip-point');
  if (!pt) return null;
  const r = pt.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.bottom };
}

function updateNcvtTether(drawTetherFn) {
  const tetherEl = document.getElementById('tether-ncvt');
  const dotEl    = document.getElementById('probe-dot-ncvt');
  const tipEl    = document.getElementById('ncvt-probe-tip');
  if (!tetherEl || !dotEl) return;

  if (!ncvtActive) {
    tetherEl.setAttribute('opacity', '0');
    dotEl.setAttribute('opacity', '0');
    return;
  }

  function moveTipEl(pos) {
    if (tipEl) {
      if (!ncvtSnapAnimating) tipEl.style.transition = 'box-shadow 0.15s';
      tipEl.style.transform = `translate(${pos.x - 13}px, ${pos.y - 13}px)`;
    }
    ncvtTipPos = pos;
  }

  // If tip is at home (not dragging, not snapped, not mid-animation) keep it glued to panel tip
  if (!ncvtDragging && !ncvtSnapped && !ncvtSnapAnimating) {
    const home = getNcvtTipHomePos();
    if (home) moveTipEl({ x: home.x, y: home.y + 13 });
  }

  // If tip is snapped to a canvas node, lock its screen pos to the grid node
  if (ncvtSnapped && !ncvtDragging) {
    moveTipEl(gridToScreen(ncvtSnapped.gx, ncvtSnapped.gy));
  }

  const home = getNcvtTipHomePos();
  if (!home) return;

  const dist = Math.hypot(ncvtTipPos.x - home.x, ncvtTipPos.y - home.y);

  // Only draw tether when tip is away from home
  if (dist > 20) {
    drawTetherFn('tether-ncvt', home.x, home.y, ncvtTipPos.x, ncvtTipPos.y);
  } else {
    tetherEl.setAttribute('opacity', '0');
  }

  // Dot on canvas when snapped
  if (ncvtSnapped) {
    dotEl.setAttribute('cx', ncvtTipPos.x);
    dotEl.setAttribute('cy', ncvtTipPos.y);
    dotEl.setAttribute('opacity', '1');
  } else {
    dotEl.setAttribute('opacity', '0');
  }
}

function gridToScreen(gx, gy) {
  // Use the same worldToScreen the rest of the app uses, offset by canvas rect
  const rect = getCanvasRectCached();
  const s = worldToScreen(gx * GRID, gy * GRID);
  return { x: rect.left + s.x, y: rect.top + s.y };
}

function screenToGrid(sx, sy) {
  // Convert viewport coords → canvas-local → world → grid
  const rect = getCanvasRectCached();
  const w = screenToWorld(sx - rect.left, sy - rect.top);
  return snapToGrid(w.x, w.y);
}

function isOnCanvas(sx, sy) {
  const rect = getCanvasRectCached();
  return sx >= rect.left && sx <= rect.right && sy >= rect.top && sy <= rect.bottom;
}

function isOverEl(sx, sy, id) {
  const el = document.getElementById(id);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return sx >= r.left && sx <= r.right && sy >= r.top && sy <= r.bottom;
}

function positionProbesAtJacks() {
  const jackB = getJackScreenPos('jack-black');
  const jackR = getJackScreenPos('jack-red');
  probeBlackPos = { x: jackB.x, y: jackB.y + 40 };
  probeRedPos = { x: jackR.x, y: jackR.y + 40 };
  updateProbeEls();
}

function updateProbeEls() {
  const pb = document.getElementById('probe-black');
  const pr = document.getElementById('probe-red');
  if (pb) {
    pb.style.left = (probeBlackPos.x - 11) + 'px';
    pb.style.top  = (probeBlackPos.y - 11) + 'px';
  }
  if (pr) {
    pr.style.left = (probeRedPos.x - 11) + 'px';
    pr.style.top  = (probeRedPos.y - 11) + 'px';
  }
}

// Voltage at a grid point — checks exact node first, then walks wire segments
// BFS from a grid point to detect if the connected circuit is AC-sourced
function isACCircuit(gx, gy) {
  const visited = new Set();
  const queue = [gx + ',' + gy];
  visited.add(gx + ',' + gy);
  while (queue.length) {
    const key = queue.shift();
    const [cx, cy] = key.split(',').map(Number);
    for (const c of components) {
      // Direct AC source
      if (isACSource(c.type)) {
        if ((c.gx1 === cx && c.gy1 === cy) || (c.gx2 === cx && c.gy2 === cy)) return true;
        if (c.gx3 !== undefined && (c.gx3 === cx && c.gy3 === cy)) return true;
      }
      // Transformer secondary also outputs AC
      if (c.type === 'transformer' && c.gx3 !== undefined) {
        if ((c.gx3 === cx && c.gy3 === cy) || (c.gx4 === cx && c.gy4 === cy)) return true;
      }
      let ox, oy;
      if (c.gx1 === cx && c.gy1 === cy) { ox = c.gx2; oy = c.gy2; }
      else if (c.gx2 === cx && c.gy2 === cy) { ox = c.gx1; oy = c.gy1; }
      else continue;
      const nk = ox + ',' + oy;
      if (!visited.has(nk)) { visited.add(nk); queue.push(nk); }
    }
    for (const w of wires) {
      if (w.gx1 === cx && w.gy1 === cy) {
        const nk = w.gx2 + ',' + w.gy2;
        if (!visited.has(nk)) { visited.add(nk); queue.push(nk); }
      }
      if (w.gx2 === cx && w.gy2 === cy) {
        const nk = w.gx1 + ',' + w.gy1;
        if (!visited.has(nk)) { visited.add(nk); queue.push(nk); }
      }
    }
  }
  return false;
}

// so probes placed mid-wire (not at an endpoint) still read correctly
function getVoltageAt(gx, gy) {
  const k = gx + ',' + gy;
  if (nodeVoltages[k] !== undefined) return nodeVoltages[k];
  for (const w of wires) {
    const dx = w.gx2 - w.gx1, dy = w.gy2 - w.gy1;
    const lenSq = dx*dx + dy*dy;
    if (lenSq === 0) continue;
    const t = ((gx - w.gx1)*dx + (gy - w.gy1)*dy) / lenSq;
    if (t < -0.01 || t > 1.01) continue;
    if (Math.hypot((w.gx1 + t*dx) - gx, (w.gy1 + t*dy) - gy) < 0.1) {
      const v1 = nodeVoltages[w.gx1 + ',' + w.gy1];
      const v2 = nodeVoltages[w.gx2 + ',' + w.gy2];
      if (v1 !== undefined) return v1;
      if (v2 !== undefined) return v2;
    }
  }
  return 0; // unsolved node — no source driving it, so reference potential (0V)
}

// Returns true if component is a switching type (switch, contactor, fuse, breaker)
function isSwitchType(c) {
  return ['switch','time_delay','contactor_contact','fuse','lv_fuse','td_fuse','breaker'].includes(c.type);
}

// Returns true if the switching component is currently conducting (closed/intact)
function isConducting(c) {
  if (c.type === 'switch' || c.type === 'time_delay') return !!c.props.closed;
  if (c.type === 'contactor_contact') return !!c.props.contactClosed;
  if (c.type === 'fuse' || c.type === 'lv_fuse' || c.type === 'td_fuse') return !c.props.blown;
  if (c.type === 'breaker') return !c.props.tripped;
  return true;
}

function takeMeasurement() {
  // Always reset — only the AAC branch re-sets it when a valid series connection is found.
  // This ensures switching modes (VAC/VDC/ohm/cap) immediately restores the wire.
  window._meterSeriesWireId = null;
  if (!simRunning && meterMode !== 'ohm' && meterMode !== 'cap') {
    setMeterStatus('Press Energize first (\u03A9 and \u00B5F work anytime)');
    meterDisplayMode = 'text';
    if (meterMode === 'vac') updateMeterDisplay('0.0', ' V~');
    else if (meterMode === 'vdc') updateMeterDisplay('0.0', ' V\u2393');
    else if (meterMode === 'aac') updateMeterDisplay('0.00', ' A~');
    else updateMeterDisplay('---', '');
    return;
  }

  const k1 = meterProbe1.gx + ',' + meterProbe1.gy;
  const k2 = meterProbe2.gx + ',' + meterProbe2.gy;

  // Returns { comp, winding } where winding is 'primary' or 'secondary' for transformers
  function findProbedComponent() {
    const p1x = meterProbe1.gx, p1y = meterProbe1.gy;
    const p2x = meterProbe2.gx, p2y = meterProbe2.gy;
    for (const c of components) {
      // Primary terminals (gx1/gy1 and gx2/gy2)
      if ((c.gx1 === p1x && c.gy1 === p1y && c.gx2 === p2x && c.gy2 === p2y) ||
          (c.gx2 === p1x && c.gy2 === p1y && c.gx1 === p2x && c.gy1 === p2y))
        return { comp: c, winding: 'primary' };
      // Secondary terminals for transformers (gx3/gy3 and gx4/gy4)
      if (c.type === 'transformer' && c.gx3 !== undefined) {
        if ((c.gx3 === p1x && c.gy3 === p1y && c.gx4 === p2x && c.gy4 === p2y) ||
            (c.gx4 === p1x && c.gy4 === p1y && c.gx3 === p2x && c.gy3 === p2y))
          return { comp: c, winding: 'secondary' };
      }
    }
    return null;
  }

  if (meterMode === 'vac' || meterMode === 'vdc') {
    // 3-phase / multi-leg source: probes on two different phase nets → return line-to-line voltage
    // (nodeVoltages can't represent 3-phase correctly without phasor math)
    // BFS through wires to find which source terminal index a probe is connected to
    if (meterMode === 'vac') {
      function probePhaseIndex(px, py, terms) {
        const visited = new Set();
        const queue = [px + ',' + py];
        visited.add(px + ',' + py);
        while (queue.length > 0) {
          const k = queue.shift();
          const [cx, cy] = k.split(',').map(Number);
          for (let i = 0; i < terms.length; i++) {
            if (terms[i][0] === cx && terms[i][1] === cy) return i;
          }
          for (const w of wires) {
            if (w.gx1 === cx && w.gy1 === cy) {
              const nk = w.gx2 + ',' + w.gy2;
              if (!visited.has(nk)) { visited.add(nk); queue.push(nk); }
            }
            if (w.gx2 === cx && w.gy2 === cy) {
              const nk = w.gx1 + ',' + w.gy1;
              if (!visited.has(nk)) { visited.add(nk); queue.push(nk); }
            }
          }
        }
        return -1;
      }
      const p1x = meterProbe1.gx, p1y = meterProbe1.gy;
      const p2x = meterProbe2.gx, p2y = meterProbe2.gy;
      for (const c of components) {
        if (c.type === 'ac_480' && c.gx3 !== undefined && c.props.on !== false) {
          const terms = [[c.gx1,c.gy1],[c.gx2,c.gy2],[c.gx3,c.gy3]];
          const p1on = probePhaseIndex(p1x, p1y, terms);
          const p2on = probePhaseIndex(p2x, p2y, terms);
          if (p1on !== -1 && p2on !== -1 && p1on !== p2on) {
            const v = c.props.voltage || 480;
            meterTargetValue = v; meterDisplayUnit = ' V~'; meterDisplayMode = 'value';
            setMeterStatus('Voltage: ' + v.toFixed(1) + 'V AC (line-to-line)');
            return;
          }
        }
        // 480Y/277V wye source: L1-L2/L2-L3/L1-L3 = 480V, L1-N/L2-N/L3-N = 277V
        if (c.type === 'ac_480_wye' && c.gx4 !== undefined && c.props.on !== false) {
          const phaseTerms = [[c.gx1,c.gy1],[c.gx2,c.gy2],[c.gx3,c.gy3]]; // L1, L2, L3
          const allTerms = [...phaseTerms, [c.gx4, c.gy4]]; // include N as index 3
          const p1on = probePhaseIndex(p1x, p1y, allTerms);
          const p2on = probePhaseIndex(p2x, p2y, allTerms);
          if (p1on !== -1 && p2on !== -1 && p1on !== p2on) {
            const p1isPhase = p1on < 3, p2isPhase = p2on < 3;
            if (p1isPhase && p2isPhase) {
              // Two different phase legs → 480V line-to-line
              meterTargetValue = 480; meterDisplayUnit = ' V~'; meterDisplayMode = 'value';
              setMeterStatus('Voltage: 480.0V AC (line-to-line)');
              return;
            }
            if ((p1isPhase && !p2isPhase) || (!p1isPhase && p2isPhase)) {
              // Phase to neutral → 277V line-to-neutral
              meterTargetValue = 277; meterDisplayUnit = ' V~'; meterDisplayMode = 'value';
              setMeterStatus('Voltage: 277.0V AC (line-to-neutral)');
              return;
            }
          }
        }
        // 240V split-phase: probes on L1 and L2 → return full line-to-line voltage
        if (c.type === 'ac_240' && c.props.on !== false) {
          const terms = [[c.gx1,c.gy1],[c.gx2,c.gy2]];
          const p1on = probePhaseIndex(p1x, p1y, terms);
          const p2on = probePhaseIndex(p2x, p2y, terms);
          if (p1on !== -1 && p2on !== -1 && p1on !== p2on) {
            const v = c.props.voltage || 240;
            meterTargetValue = v; meterDisplayUnit = ' V~'; meterDisplayMode = 'value';
            setMeterStatus('Voltage: ' + v.toFixed(1) + 'V AC (line-to-line)');
            return;
          }
        }
      }
    }

    const v1raw = getVoltageAt(meterProbe1.gx, meterProbe1.gy);
    const v2raw = getVoltageAt(meterProbe2.gx, meterProbe2.gy);
    // If either probe is floating (not on any circuit node), no measurement possible.
    // A probe on empty space is not a ground reference — it's electrically meaningless.
    if (v1raw === undefined || v2raw === undefined) {
      meterDisplayMode = 'text';
      if (meterMode === 'vac') updateMeterDisplay('0.0', ' V~');
      else updateMeterDisplay('0.0', ' V\u2393');
      setMeterStatus(v1raw === undefined && v2raw === undefined ? 'Probes not on circuit' : 'One probe is floating — place both on circuit');
      return;
    }
    const v1 = v1raw;
    const v2 = v2raw;
    if (meterMode === 'vac') {
      // VAC on a DC circuit reads 0V — AC meter can't read steady DC
      if (!isACCircuit(meterProbe1.gx, meterProbe1.gy) && !isACCircuit(meterProbe2.gx, meterProbe2.gy)) {
        meterTargetValue = 0; meterDisplayUnit = ' V~'; meterDisplayMode = 'value';
        setMeterStatus('0.0V — AC mode on DC circuit reads 0');
        return;
      }
      const r = Math.abs(v1 - v2);
      meterTargetValue = r; meterDisplayUnit = ' V~'; meterDisplayMode = 'value';
      setMeterStatus('Voltage: ' + r.toFixed(1) + 'V AC');
    } else {
      // VDC on an AC circuit reads ~0V — AC averages to zero on a DC meter
      if (isACCircuit(meterProbe1.gx, meterProbe1.gy) || isACCircuit(meterProbe2.gx, meterProbe2.gy)) {
        meterTargetValue = 0; meterDisplayUnit = ' V\u2393'; meterDisplayMode = 'value';
        setMeterStatus('0.0V — DC mode on AC circuit reads 0');
        return;
      }
      const r = v1 - v2;
      meterTargetValue = r; meterDisplayUnit = ' V\u2393'; meterDisplayMode = 'value';
      setMeterStatus('Voltage: ' + r.toFixed(2) + 'V DC');
    }
  } else if (meterMode === 'aac') {
    const probed = findProbedComponent();
    const c = probed ? probed.comp : null;
    const winding = probed ? probed.winding : null;
    if (c) {
      // Probes across any component (load, switch, fuse, etc.) — wrong technique for an ammeter
      meterDisplayMode = 'text';
      updateMeterDisplay('O.L.', '');
      setMeterStatus('⚠ Connect in series — never place ammeter across a component');
    } else {
      // No component directly between probes — read wire/node current (series connection)
      const { wireCurrent, nodeCurrent } = window._lastWireCurrentMap || getWireCurrentMap();
      const seriesWire = wires.find(w =>
        (w.gx1 === meterProbe1.gx && w.gy1 === meterProbe1.gy && w.gx2 === meterProbe2.gx && w.gy2 === meterProbe2.gy) ||
        (w.gx2 === meterProbe1.gx && w.gy2 === meterProbe1.gy && w.gx1 === meterProbe2.gx && w.gy1 === meterProbe2.gy)
      );
      const cur = seriesWire
        ? (wireCurrent[seriesWire.id] || Math.max(nodeCurrent[k1] || 0, nodeCurrent[k2] || 0))
        : Math.max(nodeCurrent[k1] || 0, nodeCurrent[k2] || 0);
      if (cur > 0) {
        window._meterSeriesWireId = seriesWire ? seriesWire.id : null;
        meterTargetValue = cur; meterDisplayUnit = ' A~'; meterDisplayMode = 'value';
        setMeterStatus('Current: ' + cur.toFixed(2) + 'A (series measurement)');
      } else {
        meterTargetValue = 0; meterDisplayUnit = ' A~'; meterDisplayMode = 'value';
        setMeterStatus('Break circuit and connect meter in series to read current');
      }
    }
  } else if (meterMode === 'cap') {
    // ── Capacitance measurement (µF) — works sim ON or OFF ──
    // Real cap meters inject a small AC signal and measure µF.
    // On a live circuit they typically read 0 or garbage — so we show a warning.
    if (simRunning) {
      meterDisplayMode = 'text';
      updateMeterDisplay('---', '');
      setMeterStatus('De-energize circuit to measure capacitance');
      return;
    }
    const probedResult = findProbedComponent();
    const probedComp = probedResult ? probedResult.comp : null;
    if (probedComp && probedComp.type === 'capacitor') {
      if (probedComp.props.faultMode === 'short') {
        meterDisplayMode = 'text';
        updateMeterDisplay('0.00', ' \u00B5F');
        setMeterStatus('0.00\u00B5F \u2014 Cap is SHORTED');
      } else if (probedComp.props.faultMode === 'open') {
        meterDisplayMode = 'text';
        updateMeterDisplay('O.L.', ' \u00B5F');
        setMeterStatus('O.L. \u2014 Cap is OPEN (failed)');
      } else {
        const uF = probedComp.props.capacitance || 0;
        meterTargetValue = uF; meterDisplayUnit = ' \u00B5F'; meterDisplayMode = 'value';
        setMeterStatus('Capacitance: ' + uF.toFixed(2) + '\u00B5F');
      }
    } else {
      meterDisplayMode = 'text';
      updateMeterDisplay('O.L.', ' \u00B5F');
      setMeterStatus('Place probes across a capacitor');
    }
  } else if (meterMode === 'ohm') {
    // ── Warn if circuit is live — ohmmeter on live circuit = false readings & meter damage ──
    if (simRunning) {
      showCautionToast('Ohms must be tested on a de-energized circuit', '', 3000);
      meterDisplayMode = 'text';
      updateMeterDisplay('---', '');
      return;
    }
    // ── Switch / fuse / breaker directly under probes — report state, skip nodal analysis ──
    // (nodal analysis can find a path through other circuit components and return a misleading value)
    const probedSwitch = findProbedComponent();
    if (probedSwitch && isSwitchType(probedSwitch.comp)) {
      if (isConducting(probedSwitch.comp)) {
        updateMeterDisplay('0.0', ' \u03A9');
        setMeterStatus('0.0\u03A9 \u2014 Closed (continuity)');
      } else {
        meterDisplayMode = 'text';
        updateMeterDisplay('O.L.', ' \u03A9');
        setMeterStatus('O.L. \u2014 Open (no continuity)');
      }
      return;
    }
    // ── Compressor windings — the standard C / R / S ohm check ──
    // The solver models a compressor as two virtual windings rather than a plain
    // two-terminal load, so the nodal pass below finds no resistive path between
    // its terminals and every pair read O.L. — which left the open-run /
    // open-start / short-run / short-start fault modes impossible to diagnose
    // with the tool's own meter, the one test those modes exist for.
    for (const cmp of components) {
      if (cmp.type !== 'compressor' || cmp.gx3 === undefined) continue;
      const on = (p, gx, gy) => p && p.gx === gx && p.gy === gy;
      const onC = p => on(p, cmp.gx1, cmp.gy1);
      const onR = p => on(p, cmp.gx2, cmp.gy2);
      const onS = p => on(p, cmp.gx3, cmp.gy3);
      const across = (a, b) => (a(meterProbe1) && b(meterProbe2)) || (b(meterProbe1) && a(meterProbe2));
      const fm     = cmp.props.faultMode || 'none';
      const runR   = cmp.props.runResistance   || 0;
      const startR = cmp.props.startResistance || 0;
      let reading = null, note = '';
      if (across(onC, onR)) {
        if (fm === 'open-run')       { reading = 'OL'; note = 'Run winding OPEN'; }
        else if (fm === 'short-run') { reading = 0;    note = 'Run winding SHORTED'; }
        else reading = runR;
      } else if (across(onC, onS)) {
        if (fm === 'open-start')       { reading = 'OL'; note = 'Start winding OPEN'; }
        else if (fm === 'short-start') { reading = 0;    note = 'Start winding SHORTED'; }
        else reading = startR;
      } else if (across(onR, onS)) {
        // R → C → S: the two windings measured in series
        if (fm === 'open-run')         { reading = 'OL'; note = 'Run winding OPEN'; }
        else if (fm === 'open-start')  { reading = 'OL'; note = 'Start winding OPEN'; }
        else if (fm === 'short-run')   { reading = startR; note = 'Run winding SHORTED'; }
        else if (fm === 'short-start') { reading = runR;   note = 'Start winding SHORTED'; }
        else reading = runR + startR;
      }
      if (reading === 'OL') {
        meterDisplayMode = 'text';
        updateMeterDisplay('O.L.', ' Ω');
        setMeterStatus('O.L. — ' + note);
        return;
      }
      if (reading !== null) {
        meterTargetValue = reading; meterDisplayUnit = ' Ω'; meterDisplayMode = 'value';
        setMeterStatus(note ? reading.toFixed(1) + 'Ω — ' + note
                            : 'Resistance: ' + reading.toFixed(1) + 'Ω');
        return;
      }
    }
    // ── Load directly under probes — read component's own resistance, skip nodal analysis ──
    if (probedSwitch && ['resistor','bulb','fan','outlet','contactor_coil','relay_coil'].includes(probedSwitch.comp.type)) {
      const comp = probedSwitch.comp;
      const fm = comp.props && comp.props.faultMode;
      if (fm === 'short') {
        meterTargetValue = 0; meterDisplayUnit = ' \u03A9'; meterDisplayMode = 'value';
        setMeterStatus('0.0\u03A9 \u2014 Short circuit fault');
        return;
      }
      if (fm === 'open') {
        meterDisplayMode = 'text';
        updateMeterDisplay('O.L.', ' \u03A9');
        setMeterStatus('O.L. \u2014 Open circuit fault');
        return;
      }
      const r = (comp.type === 'contactor_coil' || comp.type === 'relay_coil')
        ? (comp.props.coilResistance || 0)
        : ((comp.props && comp.props.resistance) || 0);
      if (r > 0) {
        meterTargetValue = r; meterDisplayUnit = ' \u03A9'; meterDisplayMode = 'value';
        setMeterStatus('Resistance: ' + r.toFixed(1) + '\u03A9');
        return;
      }
    }
    // ── Network-aware resistance measurement ──
    // Build union-find of zero-resistance nets (wires + closed switches/fuses/breakers/contacts)
    // then solve Thevenin resistance between the two probe nodes using nodal analysis.
    const nk = (gx, gy) => `${gx},${gy}`;
    const par = {};
    const find = x => { if (!par[x]) par[x] = x; return par[x] === x ? x : (par[x] = find(par[x])); };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };

    // Wires merge nodes
    for (const w of wires) union(nk(w.gx1, w.gy1), nk(w.gx2, w.gy2));

    // Zero-resistance components merge their two nodes into one net
    for (const c of components) {
      const k1 = nk(c.gx1, c.gy1), k2 = nk(c.gx2, c.gy2);
      const fm = c.props.faultMode;
      if (fm === 'open') continue;
      if (fm === 'short') { union(k1, k2); continue; }
      // Voltage sources treated as OPEN in ohm mode — de-energized measurement,
      // sources do not form a back-path through the circuit.
      if (isSource(c.type)) continue;
      if ((c.type === 'switch'            && c.props.closed) ||
          (c.type === 'time_delay'        && c.props.closed) ||
          (c.type === 'breaker'           && !c.props.tripped) ||
          (c.type === 'contactor_contact' && c.props.contactClosed) ||
          ((c.type === 'fuse' || c.type === 'lv_fuse' || c.type === 'td_fuse') && !c.props.blown)) {
        union(k1, k2);
      }
    }

    const pnet1 = find(nk(meterProbe1.gx, meterProbe1.gy));
    const pnet2 = find(nk(meterProbe2.gx, meterProbe2.gy));

    // ── Capacitor check: only when sim is OFF (ohmmeter uses its own battery) ──
    if (!simRunning && pnet1 !== pnet2) {
      const probedCap = components.find(c => {
        if (c.type !== 'capacitor') return false;
        const cn1 = find(nk(c.gx1, c.gy1)), cn2 = find(nk(c.gx2, c.gy2));
        return (cn1 === pnet1 && cn2 === pnet2) || (cn1 === pnet2 && cn2 === pnet1);
      });
      if (probedCap) {
        if (probedCap.props.faultMode === 'open') {
          _stopCapCharge();
          meterDisplayMode = 'text';
          updateMeterDisplay('O.L.', ' \u03A9');
          setMeterStatus('');
        } else if (_capCharged.has(probedCap.id)) {
          // Component-level state says cap is charged — immediate O.L., no animation
          _stopCapCharge();
          meterDisplayMode = 'text';
          updateMeterDisplay('O.L.', ' \u03A9');
          setMeterStatus('');
        } else if (_capChargeCompId === probedCap.id) {
          // Animation in progress or paused (mode switch) — resume if needed
          _resumeCapCharge();
        } else {
          // Fresh probe on uncharged cap — start climb animation
          _stopCapCharge();
          _startCapCharge(probedCap.props.capacitance || 10, probedCap.id);
        }
        return;
      }
    }
    if (!simRunning) _stopCapCharge(); // probes moved off the cap

    if (pnet1 === pnet2) {
      // Probes on the same electrical net → continuity / 0 Ω
      updateMeterDisplay('0.0', ' \u03A9');
      setMeterStatus('0.0\u03A9 \u2014 Continuity');
    } else {
      // Build conductance edges from resistive components that span two different nets
      const edges = [];
      for (const c of components) {
        const cn1 = find(nk(c.gx1, c.gy1)), cn2 = find(nk(c.gx2, c.gy2));
        if (cn1 === cn2) continue; // already merged → zero resistance edge, already handled
        const fm = c.props.faultMode;
        if (fm === 'open') continue;
        // Open-state components → infinite resistance → omit from conductance graph
        if ((c.type === 'switch'            && !c.props.closed) ||
            (c.type === 'time_delay'        && !c.props.closed) ||
            (c.type === 'breaker'           &&  c.props.tripped) ||
            (c.type === 'contactor_contact' && !c.props.contactClosed) ||
            ((c.type === 'fuse' || c.type === 'lv_fuse' || c.type === 'td_fuse') && c.props.blown)) continue;
        // Capacitor blocks DC — ohmmeter sees OL on a good cap (short fault already merged above)
        if (c.type === 'capacitor') continue;
        // Contactor coil stores resistance in coilResistance, not resistance
        const r = c.type === 'contactor_coil'
          ? (c.props.coilResistance || 0)
          : ((c.props && c.props.resistance) || 0);
        if (r <= 0) continue; // zero-R components already merged via union-find
        edges.push({ n1: cn1, n2: cn2, r });
      }

      // Collect all nets that appear in edges + the two probe nets
      const allNets = new Set([pnet1, pnet2]);
      for (const e of edges) { allNets.add(e.n1); allNets.add(e.n2); }
      const nets = [...allNets];
      const sz = nets.length;
      const idx = {};
      nets.forEach((net, i) => idx[net] = i);

      // Build conductance matrix G (sz × sz) and RHS vector
      const G = Array.from({length: sz}, () => new Array(sz).fill(0));
      const Iv = new Array(sz).fill(0);
      for (const e of edges) {
        const i = idx[e.n1], j = idx[e.n2], g = 1 / e.r;
        G[i][i] += g; G[j][j] += g; G[i][j] -= g; G[j][i] -= g;
      }

      // Thevenin: fix pnet2 = 0 V (ground), inject 1 A into pnet1
      const i1 = idx[pnet1], i2 = idx[pnet2];
      for (let j = 0; j < sz; j++) G[i2][j] = 0;
      G[i2][i2] = 1; Iv[i2] = 0;
      Iv[i1] += 1;

      // Gaussian elimination with partial pivoting
      const Gm = G.map(r => [...r]), Im = [...Iv];
      for (let k = 0; k < sz; k++) {
        let mx = k;
        for (let r = k + 1; r < sz; r++) if (Math.abs(Gm[r][k]) > Math.abs(Gm[mx][k])) mx = r;
        [Gm[k], Gm[mx]] = [Gm[mx], Gm[k]]; [Im[k], Im[mx]] = [Im[mx], Im[k]];
        if (Math.abs(Gm[k][k]) < 1e-15) continue;
        for (let r = k + 1; r < sz; r++) {
          const f = Gm[r][k] / Gm[k][k];
          for (let col = k; col < sz; col++) Gm[r][col] -= f * Gm[k][col];
          Im[r] -= f * Im[k];
        }
      }
      // Back substitution
      const V = new Array(sz).fill(0);
      for (let k = sz - 1; k >= 0; k--) {
        if (Math.abs(Gm[k][k]) < 1e-15) continue;
        let s = Im[k];
        for (let j = k + 1; j < sz; j++) s -= Gm[k][j] * V[j];
        V[k] = s / Gm[k][k];
      }

      // Thevenin resistance = V at probe1 node (probe2 is ground = 0 V)
      const Rth = V[i1];
      if (isFinite(Rth) && Rth > 1e-6) {
        meterTargetValue = Rth; meterDisplayUnit = ' \u03A9'; meterDisplayMode = 'value';
        setMeterStatus('Resistance: ' + Rth.toFixed(1) + '\u03A9');
      } else {
        meterDisplayMode = 'text';
        updateMeterDisplay('O.L.', ' \u03A9');
        setMeterStatus('O.L. \u2014 No path between probes');
      }
    }
  }

  // Inrush peak hold: capture and hold maximum reading
  // Reset peak when probes move to a different location
  if (meterInrushMode && meterDisplayMode === 'value') {
    const probeKey = (meterProbe1 ? meterProbe1.gx+','+meterProbe1.gy : '') + '|' + (meterProbe2 ? meterProbe2.gx+','+meterProbe2.gy : '');
    if (window._inrushProbeKey && window._inrushProbeKey !== probeKey) {
      meterInrushPeak = null; // probes moved — reset peak
    }
    window._inrushProbeKey = probeKey;
    const absVal = Math.abs(meterTargetValue);
    if (meterInrushPeak === null || absVal > meterInrushPeak) {
      meterInrushPeak = absVal;
    }
    meterTargetValue = meterInrushPeak;
  }
}

function updateMeterDisplay(v, u) {
  document.getElementById('meter-display').innerHTML = v + '<span id="meter-unit">' + u + '</span>';
}
function setMeterStatus(m) { /* status locked to "Drag probes to measure" */ }

// ── Restoring persisted tool state ──────────────────────────────────────────
// The startup autosave restore and a named project load both come through here,
// so the two paths cannot drift apart again, and neither can a variable and the
// control that is supposed to show it. Each applier is a no-op for a field the
// save doesn't carry, which is what keeps older saves loading unchanged.

// The dial has a fixed set of positions, and the markup is the authority on what
// they are. A stored string outside that set is corrupt: keep the current mode
// rather than putting the meter in a position that no button can represent.
function isValidMeterMode(mode) {
  if (typeof mode !== 'string') return false;
  const btns = document.querySelectorAll('#meter-modes button');
  for (const b of btns) if (b.dataset.mode === mode) return true;
  return false;
}

function applyMeterMode(mode) {
  if (!isValidMeterMode(mode)) return false;
  meterMode = mode;
  document.querySelectorAll('#meter-modes button').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  return true;
}

function applyMeterInrushMode(on) {
  meterInrushMode = on === true;
  meterInrushPeak = null;   // a peak captured on another circuit means nothing here
  const btn = document.getElementById('meter-inrush-btn');
  const label = document.getElementById('meter-inrush-label');
  if (btn) btn.classList.toggle('active', meterInrushMode);
  if (label) { label.textContent = 'Inrush'; label.classList.toggle('visible', meterInrushMode); }
  return meterInrushMode;
}

// Restore the tool state a save carries. Missing fields keep the current state —
// the same rule the view toggles already follow — so a save written before any of
// these fields existed loads exactly as it did before.
function applySavedToolState(src) {
  if (!src || typeof src !== 'object') return;
  if (src.meterMode !== undefined) applyMeterMode(src.meterMode);
  if (src.meterInrushMode !== undefined) applyMeterInrushMode(_asSavedBool(src.meterInrushMode));
  if (src.clampInrushMode !== undefined && window._applyClampInrush) {
    window._applyClampInrush(_asSavedBool(src.clampInrushMode));
  }
}

// ── Probe drag event listeners ──
function initProbeListeners() {
  ['black','red'].forEach(color => {
    const el = document.getElementById('probe-' + color);
    if (!el) return;
    el.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      probeDragging = color;
      // Track offset from probe CENTER so the tip follows mouse precisely
      const curPos = color === 'black' ? probeBlackPos : probeRedPos;
      probeDragOffset.x = e.clientX - curPos.x;
      probeDragOffset.y = e.clientY - curPos.y;
      el.style.cursor = 'grabbing';
      el.classList.remove('snapped');
      // Null out the grabbed probe
      if (color === 'black') { meterProbe1 = null; }
      else { meterProbe2 = null; }
      setMeterStatus('Drop probe on a circuit point...');

      // Immediately read at grab position — don't zero if there's a valid reading
      let gotReading = false;
      if (simRunning && (meterMode === 'vac' || meterMode === 'vdc' || meterMode === 'aac')) {
        const hoverGrid = screenToGrid(curPos.x, curPos.y);
        const p1 = color === 'black' ? hoverGrid : meterProbe1;
        const p2 = color === 'red'   ? hoverGrid : meterProbe2;
        if (p1 && p2) {
          const save1 = meterProbe1, save2 = meterProbe2;
          meterProbe1 = p1; meterProbe2 = p2;
          takeMeasurement();
          meterProbe1 = save1; meterProbe2 = save2;
          gotReading = true;
        }
      }
      if (!gotReading) {
        meterTargetValue = 0;
        meterDisplayMode = 'text';
        meterDisplayedValue = 0;
        if (meterMode === 'vac') updateMeterDisplay('0.0', ' V~');
        else if (meterMode === 'vdc') updateMeterDisplay('0.0', ' V\u2393');
        else if (meterMode === 'aac') updateMeterDisplay('0.00', ' A~');
        else updateMeterDisplay('---', '');
      }
      updateTethers();
    });
  });

  document.addEventListener('mousemove', e => {
    if (!probeDragging) return;
    // Center of probe = mouse position minus grab offset
    const cx = e.clientX - probeDragOffset.x;
    const cy = e.clientY - probeDragOffset.y;
    if (probeDragging === 'black') {
      probeBlackPos = { x: cx, y: cy };
    } else {
      probeRedPos = { x: cx, y: cy };
    }
    updateProbeEls();
    updateTethers();

    // Live hover reading while dragging over canvas
    if (simRunning && isOnCanvas(e.clientX, e.clientY) &&
        (meterMode === 'vac' || meterMode === 'vdc' || meterMode === 'aac')) {
      const hoverGrid = screenToGrid(cx, cy);
      const p1 = probeDragging === 'black' ? hoverGrid : meterProbe1;
      const p2 = probeDragging === 'red'   ? hoverGrid : meterProbe2;
      if (p1 && p2) {
        const save1 = meterProbe1, save2 = meterProbe2;
        meterProbe1 = p1; meterProbe2 = p2;
        takeMeasurement();
        meterProbe1 = save1; meterProbe2 = save2;
      }
    }
  });

  document.addEventListener('mouseup', e => {
    if (!probeDragging) return;
    const color = probeDragging;
    probeDragging = null;
    const el = document.getElementById('probe-' + color);
    if (el) el.style.cursor = 'grab';

    // Anchor probe if dropped on canvas but NOT on the meter body itself
    if (isOnCanvas(e.clientX, e.clientY) && !isOverEl(e.clientX, e.clientY, 'multimeter')) {
      const snapped = screenToGrid(e.clientX, e.clientY);
      const snapPos = gridToScreen(snapped.gx, snapped.gy);
      if (color === 'black') {
        meterProbe1 = snapped;
        probeBlackPos = snapPos;
        if (el) el.classList.add('snapped');
      } else {
        meterProbe2 = snapped;
        probeRedPos = snapPos;
        if (el) el.classList.add('snapped');
      }
      updateProbeEls();
      setMeterStatus(color === 'black' ? 'COM probe placed — now place red probe' : 'V\u03A9mA probe placed!');
      if (meterProbe1 && meterProbe2) {
        takeMeasurement();
        startMeterAnimation();
      }
    } else {
      // Dropped outside canvas — retract to jack
      positionProbesAtJacks();
      if (color === 'black') meterProbe1 = null;
      else meterProbe2 = null;
      setMeterStatus('Drag probes onto circuit points');
    }
    updateTethers();
    autoSave();
  });
}


// Focus trap utility for modal dialogs.
// `takeFocus` should be false when the panel is only re-rendering in place —
// showPropsPanel() re-runs on every selection change and on the HP / fault-mode
// selects, and pulling focus back to the first field each time fought the user.
function trapFocus(element, takeFocus) {
  // Never stack traps: each re-show used to install another keydown listener and
  // remove none, so a session's worth of panel opens leaked a listener apiece.
  releaseFocus(element);
  const focusable = element.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (takeFocus !== false) first.focus({ preventScroll: true });
  element._trapHandler = function(e) {
    if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    if (e.key === 'Escape') {
      element.classList.remove('visible');
      releaseFocus(element);
    }
  };
  element.addEventListener('keydown', element._trapHandler);
}
function releaseFocus(element) {
  if (element._trapHandler) {
    element.removeEventListener('keydown', element._trapHandler);
    element._trapHandler = null;
  }
}

// Helper function for screen reader announcements
function announceToSR(msg) {
  const el = document.getElementById('sr-announce');
  if (el) { el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 50); }
}
