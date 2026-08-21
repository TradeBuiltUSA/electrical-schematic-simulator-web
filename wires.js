// ── Wire rendering ──

// Build per-wire and per-node current maps for electron animation.
// Per-wire current is computed from the component directly connected to each wire endpoint,
// so parallel branches correctly show their own lower current rather than the trunk current.
function getWireCurrentMap() {
  const nodeCurrent = {}; // grid key → current (used for energization and flood fill)
  const termCurrent = {}; // grid key → current of the component whose terminal is at that point
  let hasCurrent = false;

  // Seed component terminals with each component's own solved current
  for (const c of components) {
    // Ignore sub-mA leakage currents (e.g. empty outlet R=1e6 → 0.12mA); use voltage fallback instead
    if (compResults[c.id] && compResults[c.id].current > 1e-3) {
      hasCurrent = true;
      const cur = compResults[c.id].current;
      const k1 = c.gx1 + ',' + c.gy1, k2 = c.gx2 + ',' + c.gy2;
      // termCurrent: max at junctions where multiple components share a node (KCL trunk current)
      termCurrent[k1] = Math.max(termCurrent[k1] || 0, cur);
      termCurrent[k2] = Math.max(termCurrent[k2] || 0, cur);
      nodeCurrent[k1]  = Math.max(nodeCurrent[k1]  || 0, cur);
      nodeCurrent[k2]  = Math.max(nodeCurrent[k2]  || 0, cur);
    }
    // Transformer: seed terminals with voltage presence or actual current
    if (c.type === 'transformer' && c.gx3 !== undefined && compResults[c.id]) {
      const priCur = compResults[c.id].current || 0;
      if (priCur > 0) {
        nodeCurrent[c.gx1 + ',' + c.gy1] = Math.max(nodeCurrent[c.gx1 + ',' + c.gy1] || 0, priCur);
        nodeCurrent[c.gx2 + ',' + c.gy2] = Math.max(nodeCurrent[c.gx2 + ',' + c.gy2] || 0, priCur);
      } else if ((compResults[c.id].voltageDrop || 0) > 0) {
        hasCurrent = true;
        nodeCurrent[c.gx1 + ',' + c.gy1] = Math.max(nodeCurrent[c.gx1 + ',' + c.gy1] || 0, 0.01);
      }
      const secCur = compResults[c.id].secCurrent || 0;
      if (secCur > 0) {
        nodeCurrent[c.gx3 + ',' + c.gy3] = Math.max(nodeCurrent[c.gx3 + ',' + c.gy3] || 0, secCur);
        nodeCurrent[c.gx4 + ',' + c.gy4] = Math.max(nodeCurrent[c.gx4 + ',' + c.gy4] || 0, secCur);
        // Also seed termCurrent so wires directly adjacent to secondary terminals get
        // the full secondary current instead of an adjacent fan's branch current.
        termCurrent[c.gx3 + ',' + c.gy3] = Math.max(termCurrent[c.gx3 + ',' + c.gy3] || 0, secCur);
        termCurrent[c.gx4 + ',' + c.gy4] = Math.max(termCurrent[c.gx4 + ',' + c.gy4] || 0, secCur);
      } else if ((compResults[c.id].secVoltage || 0) > 0) {
        hasCurrent = true;
        nodeCurrent[c.gx3 + ',' + c.gy3] = Math.max(nodeCurrent[c.gx3 + ',' + c.gy3] || 0, 0.01);
      }
    }
  }

  // Seed open time delay terminals with voltage presence so electrons flow up to them
  for (const c of components) {
    if (c.type === 'time_delay' && !c.props.closed) {
      const k1 = c.gx1 + ',' + c.gy1, k2 = c.gx2 + ',' + c.gy2;
      if ((nodeVoltages[k1] !== undefined && nodeVoltages[k1] !== 0) ||
          (nodeVoltages[k2] !== undefined && nodeVoltages[k2] !== 0)) {
        hasCurrent = true;
        if (nodeVoltages[k1] !== undefined && nodeVoltages[k1] !== 0) nodeCurrent[k1] = Math.max(nodeCurrent[k1] || 0, 0.02);
        if (nodeVoltages[k2] !== undefined && nodeVoltages[k2] !== 0) nodeCurrent[k2] = Math.max(nodeCurrent[k2] || 0, 0.02);
      }
    }
  }

  // Check for energized nodes so open-circuit electron animation still works,
  // but don't seed nodeCurrent yet — doing so before the flood fill blocks real
  // current values (e.g. 0.83A) from propagating through intermediate wire nodes.
  if (!hasCurrent) {
    for (const k of Object.keys(nodeVoltages)) {
      if (nodeVoltages[k] !== 0) { hasCurrent = true; break; }
    }
  }

  if (!hasCurrent) return { wireCurrent: {}, nodeCurrent, wireFlow: {} };

  // ── Per-wire current: use the component terminal value at each wire endpoint ──
  // A wire touching a load terminal (2A) shows 2A even if the junction it also touches has 5A.
  // This correctly shows slower electrons in high-resistance parallel branches.
  const wireCurrent = {};
  for (const w of wires) {
    const k1 = w.gx1 + ',' + w.gy1, k2 = w.gx2 + ',' + w.gy2;
    const tc1 = termCurrent[k1] || 0, tc2 = termCurrent[k2] || 0;
    if (tc1 > 0 && tc2 > 0) {
      // Wire spans two component terminals — use the larger (trunk wires at junctions carry
      // the switch/source current, not just the downstream branch's current).
      wireCurrent[w.id] = Math.max(tc1, tc2);
    } else if (tc1 > 0) {
      wireCurrent[w.id] = tc1;
    } else if (tc2 > 0) {
      wireCurrent[w.id] = tc2;
    }
    // Wires with no direct component terminal get filled below
  }

  // Flood fill: propagate current to wires not directly touching a component terminal,
  // and through closed switches/fuses/breakers.
  let changed = true;
  while (changed) {
    changed = false;
    for (const w of wires) {
      const k1 = w.gx1 + ',' + w.gy1, k2 = w.gx2 + ',' + w.gy2;
      // Update nodeCurrent from already-computed wire currents (use > so trunk beats branch)
      if (wireCurrent[w.id]) {
        if (wireCurrent[w.id] > (nodeCurrent[k1] || 0)) { nodeCurrent[k1] = wireCurrent[w.id]; changed = true; }
        if (wireCurrent[w.id] > (nodeCurrent[k2] || 0)) { nodeCurrent[k2] = wireCurrent[w.id]; changed = true; }
        continue;
      }
      // Wire not yet computed — fill from nodeCurrent
      const nc1 = nodeCurrent[k1] || 0, nc2 = nodeCurrent[k2] || 0;
      if (nc1 || nc2) {
        wireCurrent[w.id] = Math.max(nc1, nc2);
        if (wireCurrent[w.id] > (nodeCurrent[k1] || 0)) { nodeCurrent[k1] = wireCurrent[w.id]; changed = true; }
        if (wireCurrent[w.id] > (nodeCurrent[k2] || 0)) { nodeCurrent[k2] = wireCurrent[w.id]; changed = true; }
        changed = true;
      }
    }
    // Propagate through closed zero-resistance components
    for (const c of components) {
      if (((c.type === 'switch' || c.type === 'time_delay') && c.props.closed) ||
          (c.type === 'contactor_contact' && c.props.contactClosed) ||
          ((c.type === 'fuse' || c.type === 'lv_fuse' || c.type === 'td_fuse') && !c.props.blown) ||
          (c.type === 'breaker' && !c.props.tripped)) {
        const k1 = c.gx1 + ',' + c.gy1, k2 = c.gx2 + ',' + c.gy2;
        if ((nodeCurrent[k1] || 0) > (nodeCurrent[k2] || 0)) { nodeCurrent[k2] = nodeCurrent[k1]; changed = true; }
        else if ((nodeCurrent[k2] || 0) > (nodeCurrent[k1] || 0)) { nodeCurrent[k1] = nodeCurrent[k2]; changed = true; }
      }
    }
  }

  // Post-flood-fill upgrade: a wire initially seeded from a load terminal (e.g. 2.5A fan)
  // may pass through a pure chain node (no component terminal, ≤1 other wire) that
  // received a higher nodeCurrent from trunk propagation (e.g. 7.5A).  The flood-fill
  // loop skips already-computed wires, so we need this separate pass to upgrade them.
  for (const w of wires) {
    if (!wireCurrent[w.id]) continue;
    for (const [gx, gy] of [[w.gx1, w.gy1], [w.gx2, w.gy2]]) {
      const k = gx + ',' + gy;
      const nc = nodeCurrent[k] || 0;
      if (nc <= wireCurrent[w.id]) continue;
      const hasComp = components.some(c =>
        (c.gx1 === gx && c.gy1 === gy) || (c.gx2 === gx && c.gy2 === gy));
      if (hasComp) continue; // real junction — don't override branch wire
      const otherWireCount = wires.filter(ow => ow.id !== w.id &&
        ((ow.gx1 === gx && ow.gy1 === gy) || (ow.gx2 === gx && ow.gy2 === gy))).length;
      if (otherWireCount <= 1) wireCurrent[w.id] = nc;
    }
  }

  // Seed 0.01 for energized nodes that the flood fill never reached
  // (open-circuit side of a switch, etc.) so electrons animate up to the open point.
  for (const k of Object.keys(nodeVoltages)) {
    if (nodeVoltages[k] !== 0 && !nodeCurrent[k]) nodeCurrent[k] = 0.01;
  }

  // Seed all hot (line) terminals of energized sources so electrons flow on all L wires.
  // The solver treats one terminal as "return" (voltage=0) which blocks electron animation.
  // N (neutral) is NOT seeded — it only carries current when a load returns through it.
  function floodFillWires(startK) {
    const visited = new Set([startK]);
    const queue = [startK];
    nodeCurrent[startK] = 0.01;
    while (queue.length > 0) {
      const nk = queue.shift();
      for (const w of wires) {
        const wk1 = w.gx1 + ',' + w.gy1, wk2 = w.gx2 + ',' + w.gy2;
        if (wk1 === nk && !visited.has(wk2)) {
          visited.add(wk2);
          if (!wireCurrent[w.id]) wireCurrent[w.id] = 0.01;
          if (!nodeCurrent[wk2]) nodeCurrent[wk2] = 0.01;
          queue.push(wk2);
        } else if (wk2 === nk && !visited.has(wk1)) {
          visited.add(wk1);
          if (!wireCurrent[w.id]) wireCurrent[w.id] = 0.01;
          if (!nodeCurrent[wk1]) nodeCurrent[wk1] = 0.01;
          queue.push(wk1);
        }
      }
    }
  }
  for (const c of components) {
    if (c.props.on === false) continue;
    // 240V: both L1 and L2 are hot lines
    if (c.type === 'ac_240') {
      for (const [gx, gy] of [[c.gx1, c.gy1], [c.gx2, c.gy2]]) {
        const k = gx + ',' + gy;
        if (!nodeCurrent[k]) floodFillWires(k);
      }
    }
    // 3-phase: L1, L2, L3 are all hot lines (not N)
    if ((c.type === 'ac_480' || c.type === 'ac_480_wye') && c.gx3 !== undefined) {
      for (const [gx, gy] of [[c.gx1, c.gy1], [c.gx2, c.gy2], [c.gx3, c.gy3]]) {
        const k = gx + ',' + gy;
        if (!nodeCurrent[k]) floodFillWires(k);
      }
    }
  }

  // Zero out electron flow on start winding path when compressor start cutout is active.
  // Only zero wires that are exclusively on the dead start path (not shared with live circuit).
  for (const comp of components) {
    // gx3 === 0 is a valid grid column — test for undefined, never falsiness
    if (comp.type !== 'compressor' || comp.gx3 === undefined || !compResults[comp.id]?._startCutout) continue;
    const sKey = comp.gx3 + ',' + comp.gy3;
    // Build set of "live" nodes (terminals of source, run winding, switches, etc.)
    const liveNodes = new Set();
    for (const cc of components) {
      if (isSource(cc.type)) {
        liveNodes.add(cc.gx1 + ',' + cc.gy1); liveNodes.add(cc.gx2 + ',' + cc.gy2);
        if (cc.gx3 !== undefined) liveNodes.add(cc.gx3 + ',' + cc.gy3);
      }
      // Compressor R and C terminals are live
      if (cc.type === 'compressor') {
        liveNodes.add(cc.gx1 + ',' + cc.gy1); liveNodes.add(cc.gx2 + ',' + cc.gy2);
      }
    }
    // Zero wires directly touching S terminal, and capacitors connected to S
    nodeCurrent[sKey] = 0;
    for (const w of wires) {
      const wk1 = w.gx1 + ',' + w.gy1, wk2 = w.gx2 + ',' + w.gy2;
      if (wk1 === sKey || wk2 === sKey) {
        wireCurrent[w.id] = 0;
        // Zero the other end too if it's not a live node
        const otherKey = wk1 === sKey ? wk2 : wk1;
        if (!liveNodes.has(otherKey)) nodeCurrent[otherKey] = 0;
      }
    }
    // Zero capacitors whose terminal touches S (or a wire connected to S)
    for (const cc of components) {
      if (cc.type !== 'capacitor') continue;
      const ck1 = cc.gx1 + ',' + cc.gy1, ck2 = cc.gx2 + ',' + cc.gy2;
      if (ck1 === sKey || ck2 === sKey) {
        // Zero the capacitor's other terminal and wires touching it
        const otherCapKey = ck1 === sKey ? ck2 : ck1;
        if (!liveNodes.has(otherCapKey)) {
          nodeCurrent[otherCapKey] = 0;
          for (const w of wires) {
            const wk1 = w.gx1 + ',' + w.gy1, wk2 = w.gx2 + ',' + w.gy2;
            if ((wk1 === otherCapKey || wk2 === otherCapKey) && !liveNodes.has(wk1) && !liveNodes.has(wk2)) {
              wireCurrent[w.id] = 0;
            }
          }
        }
      }
    }
  }

  // ── Wire flow directions: BFS from each source's hot terminal ──
  // Determines which endpoint is "upstream" for every wire so electrons always
  // flow away from the source, regardless of which direction the user drew the wire.
  const wireFlow = {}; // wire.id → true (draw gx1→gx2 as-is) | false (flip to gx2→gx1)

  // BFS start points: source hot terminals + transformer secondary hot terminals
  const bfsStarts = [];
  for (const c of components) {
    if (isSource(c.type)) {
      bfsStarts.push(c.gx1 + ',' + c.gy1); // L1 / positive terminal
      // For 3-phase sources, add L2, L3, and N as BFS starts too
      if (c.gx3 !== undefined && isACSource(c.type)) {
        bfsStarts.push(c.gx2 + ',' + c.gy2);
        bfsStarts.push(c.gx3 + ',' + c.gy3);
        if (c.gx4 !== undefined) bfsStarts.push(c.gx4 + ',' + c.gy4);
      }
    }
    if (c.type === 'transformer' && c.gx3 !== undefined &&
        compResults[c.id] && (compResults[c.id].secCurrent || 0) > 0) {
      bfsStarts.push(c.gx3 + ',' + c.gy3); // secondary hot terminal
    }
  }

  // Types that act as circuit boundaries — don't traverse through them
  const BLOCKED = new Set(['ac_source', 'ac_120', 'ac_240', 'ac_480', 'ac_480_wye', 'dc_source', 'transformer']);

  for (const startKey of bfsStarts) {
    const visited = new Set([startKey]);
    const queue = [startKey];

    while (queue.length > 0) {
      const key = queue.shift();

      for (const w of wires) {
        if (wireFlow[w.id] !== undefined) continue;
        const k1 = w.gx1 + ',' + w.gy1, k2 = w.gx2 + ',' + w.gy2;
        if (k1 === key) {
          wireFlow[w.id] = true;  // always set direction even if far end already visited
          if (!visited.has(k2)) { visited.add(k2); queue.push(k2); }
        } else if (k2 === key) {
          wireFlow[w.id] = false;
          if (!visited.has(k1)) { visited.add(k1); queue.push(k1); }
        }
      }

      for (const c of components) {
        if (BLOCKED.has(c.type)) continue;
        const k1 = c.gx1 + ',' + c.gy1, k2 = c.gx2 + ',' + c.gy2;
        if (k1 === key && !visited.has(k2)) { visited.add(k2); queue.push(k2); }
        else if (k2 === key && !visited.has(k1)) { visited.add(k1); queue.push(k1); }
      }
    }
  }

  // Fallback for wires not reached by BFS (isolated segments): use voltage comparison
  for (const w of wires) {
    if (wireFlow[w.id] === undefined) {
      const v1 = nodeVoltages[w.gx1 + ',' + w.gy1] || 0;
      const v2 = nodeVoltages[w.gx2 + ',' + w.gy2] || 0;
      wireFlow[w.id] = v2 <= v1;
    }
  }

  return { wireCurrent, nodeCurrent, wireFlow };
}

function drawWires() {
  // Per-wire current so parallel branches show their own speed, not the trunk speed
  // Cache result so takeMeasurement() can reuse it without a second solve() call
  window._lastWireCurrentMap = simRunning ? getWireCurrentMap() : { wireCurrent: {}, nodeCurrent: {}, wireFlow: {} };
  const { wireCurrent, nodeCurrent, wireFlow } = window._lastWireCurrentMap;

  for (const w of wires) {
    const isSelected = selectedItem && selectedItem.kind === 'wire' && selectedItem.id === w.id;
    const isMeterSeries = window._meterSeriesWireId === w.id;
    const key1 = w.gx1 + ',' + w.gy1;
    const key2 = w.gx2 + ',' + w.gy2;
    // Use per-wire current for speed; fall back to node map for energization color
    const wCur    = wireCurrent[w.id] || nodeCurrent[key1] || nodeCurrent[key2] || 0;
    const energized = simRunning && wCur > 0;

    const wireColor = w.color || '#000000';

    if (isMeterSeries) {
      const wx1 = w.gx1 * GRID, wy1 = w.gy1 * GRID;
      const wx2 = w.gx2 * GRID, wy2 = w.gy2 * GRID;
      const wLen = Math.hypot(wx2 - wx1, wy2 - wy1);
      const ux = wLen > 0 ? (wx2 - wx1) / wLen : 1;
      const uy = wLen > 0 ? (wy2 - wy1) / wLen : 0;
      // Stub = 20 screen-px from each end, max 30% of wire length
      const stubLen = Math.min(wLen * 0.30, 20 / camZoom);

      // Dashed center — shows wire is absorbed by the meter
      ctx.strokeStyle = 'rgba(37,99,235,0.35)';
      ctx.lineWidth = 2.5 / camZoom;
      ctx.lineCap = 'round';
      ctx.setLineDash([8 / camZoom, 5 / camZoom]);
      ctx.beginPath();
      ctx.moveTo(wx1, wy1);
      ctx.lineTo(wx2, wy2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Faded wire stubs at each break point — butt cap makes the cut clearly visible
      ctx.save();
      ctx.strokeStyle = wireColor;
      ctx.lineWidth = 2.5 / camZoom;
      ctx.lineCap = 'butt';
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(wx1, wy1);
      ctx.lineTo(wx1 + ux * stubLen, wy1 + uy * stubLen);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(wx2, wy2);
      ctx.lineTo(wx2 - ux * stubLen, wy2 - uy * stubLen);
      ctx.stroke();
      ctx.restore();

      // Label centered between the two probe points (= wire midpoint)
      // ctx.save() MUST come before any state changes so ctx.restore() fully
      // resets fillStyle, textAlign, textBaseline, font — nothing leaks to drawComponents()
      const mx = (wx1 + wx2) / 2;
      const my = (wy1 + wy2) / 2;
      const label = '\u201CMETER IN SERIES\u201D';
      const isVertical = Math.abs(w.gy2 - w.gy1) > Math.abs(w.gx2 - w.gx1);
      const offset = 26 / camZoom;
      ctx.save();
      ctx.fillStyle = '#cc0000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${10 / camZoom}px sans-serif`;
      ctx.translate(mx, my);
      if (isVertical) ctx.rotate(-Math.PI / 2);
      ctx.fillText(label, 0, -offset);
      ctx.restore();
    } else {
      ctx.strokeStyle = isSelected ? '#cc8800' : (energized && showEnergizedColors) ? '#cc3300' : wireColor;
      ctx.lineWidth = isSelected ? 4 / camZoom : 2.5 / camZoom;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w.gx1 * GRID, w.gy1 * GRID);
      ctx.lineTo(w.gx2 * GRID, w.gy2 * GRID);
      ctx.stroke();
    }

    if (simRunning && energized && showElectrons) {
      const wireSpeed = Math.max(8, Math.min(120, wCur * 60));
      // Use BFS-determined flow direction: electrons always travel away from the source
      // hot terminal, regardless of which direction the user originally drew the wire.
      const asDrawn = wireFlow[w.id] !== false;
      const [fx1, fy1, fx2, fy2] = asDrawn
        ? [w.gx1 * GRID, w.gy1 * GRID, w.gx2 * GRID, w.gy2 * GRID]
        : [w.gx2 * GRID, w.gy2 * GRID, w.gx1 * GRID, w.gy1 * GRID];
      // Determine if this wire is on a DC circuit (conventional flow, no oscillation)
      const nst = window._nodeSourceTypes || {};
      const ws1 = nst[key1] || { ac: false, dc: false };
      const ws2 = nst[key2] || { ac: false, dc: false };
      const wireDC = (ws1.dc || ws2.dc) && !ws1.ac && !ws2.ac;
      drawCurrentDots(fx1, fy1, fx2, fy2, wireSpeed, wireDC);
    }

    // Junction dots at nodes with 3+ connections
    ctx.fillStyle = isSelected ? '#cc8800' : (energized && showEnergizedColors) ? '#cc3300' : wireColor;
    for (const [gx, gy] of [[w.gx1, w.gy1], [w.gx2, w.gy2]]) {
      if (countConnections(gx, gy) > 2) {
        ctx.beginPath();
        ctx.arc(gx * GRID, gy * GRID, 4 / camZoom, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawCurrentDots(x1, y1, x2, y2, speed, isDC) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len === 0) return;
  const dx = (x2 - x1) / len, dy = (y2 - y1) / len;
  const spd = speed || 60;
  const spacing = 20;

  let offset;
  if (isDC) {
    // DC: conventional current flow — steady movement from + to − (gx1→gx2 direction)
    offset = (animTime * spd) % spacing;
  } else {
    // AC: all wires use one global phase so direction is always in sync across the circuit.
    // Amplitude is constant relative to spacing so short and long wires oscillate the same way.
    offset = Math.sin(animTime * 9) * spacing * 0.9;
  }

  ctx.fillStyle = '#cc8800';
  // Start 2 steps before 0 and end 2 steps past the wire length so the clip boundary
  // always has a dot ready to slide in — eliminates bare gaps at wire ends during AC swing.
  for (let i = -2; i <= Math.ceil(len / spacing) + 2; i++) {
    const d = i * spacing + offset;
    if (d < 0 || d > len) continue;
    const px = x1 + dx * d, py = y1 + dy * d;
    ctx.beginPath();
    ctx.arc(px, py, 4 / camZoom, 0, Math.PI * 2);
    ctx.fill();
  }
}
