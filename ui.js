
// ═══════════════════════════════════════════════════════════════
//  PROPERTIES PANEL
// ═══════════════════════════════════════════════════════════════
let _propsPanelPos = { x: 100, y: 100 };
let _propsPanelComp = null;
let _propsPanelWire = null;
function showWirePropsPanel(wire) {
  _propsPanelComp = null;
  _propsPanelWire = wire;
  const panel = document.getElementById('props-panel');
  const _wasVisible = panel.classList.contains('visible');
  const body = document.getElementById('props-body');
  document.getElementById('props-title').textContent = 'Wire Properties';
  body.innerHTML = '';

  const colorOptions = [
    { label: 'Black', value: '#000000' },
    { label: 'Red', value: '#cc0000' },
    { label: 'Green', value: '#008000' },
    { label: 'Light Grey', value: '#d3d3d3' }
  ];

  const lbl = document.createElement('label');
  lbl.textContent = 'Color';
  body.appendChild(lbl);
  const sel = document.createElement('select');
  for (const opt of colorOptions) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if ((wire.color || '#000000') === opt.value) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => {
    wire.color = sel.value;
    autoSave();
    render();
  });
  body.appendChild(sel);

  panel.classList.add('visible');
  trapFocus(panel, !_wasVisible);   // don't yank focus when only re-rendering
  const pw = panel.offsetWidth || 220;
  const ph = panel.offsetHeight || 200;
  const wrapRect = document.getElementById('canvas-wrap').getBoundingClientRect();
  const midX = (wire.gx1 + wire.gx2) / 2 * GRID * camZoom + camX;
  const midY = (wire.gy1 + wire.gy2) / 2 * GRID * camZoom + camY;
  const px = Math.max(4, Math.min(wrapRect.width - pw - 4, midX + 20));
  const py = Math.max(4, Math.min(wrapRect.height - ph - 4, midY - ph / 2));
  panel.style.left = px + 'px';
  panel.style.top = py + 'px';
  render();
}

function showPropsPanel(comp, clickX, clickY) {
  _propsPanelComp = comp;
  _propsPanelWire = null;
  if (clickX !== undefined && clickY !== undefined) {
    _propsPanelPos = { x: clickX, y: clickY };
  }
  const panel = document.getElementById('props-panel');
  const body = document.getElementById('props-body');
  if (!panel || !body) return;
  const _wasVisible = panel.classList.contains('visible');
  document.getElementById('props-title').textContent = comp.props.label + ' Properties';
  body.innerHTML = '';

  const fields = [];
  if (comp.type === 'ac_source') {
    fields.push({ key: 'on', label: 'On', type: 'checkbox' });
    fields.push({ key: 'voltage', label: 'Voltage (V RMS)', type: 'number' });
    fields.push({ key: 'frequency', label: 'Frequency (Hz)', type: 'number' });
  }
  if (comp.type === 'ac_120') {
    fields.push({ key: 'on', label: 'On', type: 'checkbox' });
    fields.push({ key: 'frequency', label: 'Frequency (Hz)', type: 'number' });
  }
  if (comp.type === 'ac_240') {
    fields.push({ key: 'on', label: 'On', type: 'checkbox' });
    fields.push({ key: 'frequency', label: 'Frequency (Hz)', type: 'number' });
  }
  if (comp.type === 'ac_480') {
    fields.push({ key: 'on', label: 'On', type: 'checkbox' });
    fields.push({ key: 'frequency', label: 'Frequency (Hz)', type: 'number' });
  }
  if (comp.type === 'ac_480_wye') {
    fields.push({ key: 'on', label: 'On', type: 'checkbox' });
    fields.push({ key: 'frequency', label: 'Frequency (Hz)', type: 'number' });
  }
  if (comp.type === 'dc_source') {
    fields.push({ key: 'on', label: 'On', type: 'checkbox' });
    fields.push({ key: 'voltage', label: 'Voltage', type: 'select', options: ['12', '24', '48'] });
  }
  if (comp.type === 'resistor') {
    fields.push({ key: 'resistance', label: 'Resistance (\u03A9)', type: 'number' });
    fields.push({ key: 'faultMode', label: 'Fault Simulation', type: 'select', options: ['none', 'open', 'short'] });
  }
  if (comp.type === 'bulb') {
    fields.push({ key: 'wattRating', label: 'Watt Rating', type: 'number' });
    fields.push({ key: 'resistance', label: 'Resistance (\u03A9)', type: 'number' });
    fields.push({ key: 'bulbColor', label: 'Bulb Color', type: 'select', options: ['yellow', 'red', 'blue', 'orange'] });
    fields.push({ key: 'faultMode', label: 'Fault Simulation', type: 'select', options: ['none', 'open', 'short'] });
  }
  if (comp.type === 'fan') {
    fields.push({ key: 'motorVoltage', label: 'Voltage (V)', type: 'number' });
    fields.push({ key: 'hp', label: 'HP (Motor Size)', type: 'select', options: ['1/6 HP', '1/4 HP', '1/3 HP', '1/2 HP', '3/4 HP', '1 HP', '1.5 HP', '2 HP'] });
    fields.push({ key: 'inductance', label: 'Inductance (H)', type: 'number' });
  }
  if (comp.type === 'compressor') {
    fields.push({ key: 'nominalVoltage', label: 'Voltage (V)', type: 'number' });
    fields.push({ key: 'hp', label: 'HP', type: 'select', options: ['1 HP', '1.5 HP', '2 HP', '3 HP', '5 HP'] });
    fields.push({ key: 'runResistance', label: 'Run R (Ω)', type: 'number' });
    fields.push({ key: 'startResistance', label: 'Start R (Ω)', type: 'number' });
    fields.push({ key: 'runInductance', label: 'Run L (H)', type: 'number' });
    fields.push({ key: 'startInductance', label: 'Start L (H)', type: 'number' });
    fields.push({ key: 'startCutout', label: 'Start Winding Cutout', type: 'checkbox' });
    fields.push({ key: 'startCutoutTime', label: 'Cutout Time (s)', type: 'number' });
    fields.push({ key: 'faultMode', label: 'Fault Simulation', type: 'select', options: ['none', 'open-run', 'open-start', 'short-run', 'short-start'] });
  }
  if (comp.type === 'capacitor') {
    fields.push({ key: 'capacitance', label: 'Capacitance (\u00B5F)', type: 'number' });
    fields.push({ key: 'faultMode', label: 'Fault Simulation', type: 'select', options: ['none', 'open', 'short'] });
    // Show computed Xc as a read-only info line
    if (simRunning) {
      const freq = (() => {
        // Match the solver, which uses the first *any-variant* AC source's frequency
        const src = components.find(c => isACSource(c.type) && c.props.on !== false);
        return src ? (src.props.frequency || 60) : 60;
      })();
      const C_uF = Math.max(comp.props.capacitance || 10, 0.001);
      const Xc = 1 / (2 * Math.PI * freq * C_uF * 1e-6);
      const xcDiv = document.createElement('div');
      xcDiv.style.cssText = 'margin-top:6px; padding:6px 8px; background:#eef4ff; border:1px solid #aac4ee; border-radius:4px; font-family:Courier New,monospace; font-size:11px; color:#2a5a99;';
      xcDiv.textContent = `Xc = 1/(2\u03C0 \u00D7 ${freq}Hz \u00D7 ${C_uF}\u00B5F) = ${Xc.toFixed(1)} \u03A9`;
      body.appendChild(xcDiv);
    }
  }
  if (comp.type === 'fuse' || comp.type === 'lv_fuse' || comp.type === 'td_fuse') {
    fields.push({ key: 'ratedAmps', label: 'Rated Amps', type: 'number' });
    if (comp.type === 'td_fuse') {
      fields.push({ key: 'delaySeconds', label: 'Delay (seconds)', type: 'number' });
    }
    if (comp.props.blown) {
      const resetBtn = document.createElement('button');
      resetBtn.textContent = 'Reset Fuse';
      resetBtn.style.cssText = 'margin-top:8px; width:100%; padding:6px; background:#2a7acc; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:13px;';
      resetBtn.addEventListener('click', () => {
        comp.props.blown = false;
        comp.props._ocStartTime = null;
        if (simRunning) solveCircuit();
        autoSave();
        showPropsPanel(comp);
        render();
        autoMeterUpdate();
      });
      body.appendChild(resetBtn);
    }
  }
  if (comp.type === 'breaker') {
    fields.push({ key: 'ratedAmps', label: 'Trip Amperage (A)', type: 'number' });
    fields.push({ key: 'delaySeconds', label: 'Trip Delay (seconds)', type: 'number' });
    if (comp.props.tripped) {
      const resetBtn = document.createElement('button');
      resetBtn.textContent = 'Reset Breaker';
      resetBtn.style.cssText = 'margin-top:8px; width:100%; padding:6px; background:#2a7acc; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:13px;';
      resetBtn.addEventListener('click', () => {
        comp.props.tripped = false;
        comp.props._ocStartTime = null;
        if (simRunning) solveCircuit();
        autoSave();
        showPropsPanel(comp);
        render();
        autoMeterUpdate();
      });
      body.appendChild(resetBtn);
    }
  }
  if (comp.type === 'transformer') {
    fields.push({ key: 'primaryVoltage', label: 'Primary Voltage (V)', type: 'number' });
    fields.push({ key: 'secondaryVoltage', label: 'Secondary Voltage (V)', type: 'number' });
  }
  if (comp.type === 'switch') fields.push({ key: 'closed', label: 'Closed', type: 'checkbox' });
  if (comp.type === 'time_delay') {
    fields.push({ key: 'delaySeconds', label: 'Delay (seconds)', type: 'number' });
  }
  if (comp.type === 'contactor_coil') {
    fields.push({ key: 'coilVoltage', label: 'Coil Voltage (V)', type: 'number' });
    fields.push({ key: 'coilResistance', label: 'Coil Resistance (Ω)', type: 'number' });
    fields.push({ key: 'contactorGroup', label: 'Contactor Group', type: 'text' });
    fields.push({ key: 'inductance', label: 'Inductance (H)', type: 'number' });
    fields.push({ key: 'faultMode', label: 'Fault Simulation', type: 'select', options: ['none', 'open', 'short'] });
  }
  if (comp.type === 'contactor_contact') {
    fields.push({ key: 'contactorGroup', label: 'Contactor Group', type: 'text' });
  }
  if (comp.type === 'relay_coil') {
    fields.push({ key: 'coilVoltage', label: 'Coil Voltage (V)', type: 'number' });
    fields.push({ key: 'coilResistance', label: 'Coil Resistance (Ω)', type: 'number' });
    fields.push({ key: 'relayGroup', label: 'Relay Group', type: 'text' });
    fields.push({ key: 'inductance', label: 'Inductance (H)', type: 'number' });
    fields.push({ key: 'faultMode', label: 'Fault Simulation', type: 'select', options: ['none', 'open', 'short'] });
  }
  if (comp.type === 'relay_contact') {
    fields.push({ key: 'relayGroup', label: 'Relay Group', type: 'text' });
    fields.push({ key: 'contactMode', label: 'Contact Type', type: 'select', options: ['NO', 'NC'] });
  }
  if (comp.type === 'outlet') {
    fields.push({ key: 'wattage', label: 'Load Wattage (W, 0 = empty)', type: 'number' });
    fields.push({ key: 'faultMode', label: 'Fault Simulation', type: 'select', options: ['none', 'open', 'short'] });
  }
  fields.push({ key: 'label', label: 'Label', type: 'text' });

  // Show live Ohm's law readouts when sim is running.
  // The solver stubs compResults[id] = {} for every component (see solveCircuit's
  // per-net source-type tagging pass), so a component the solver never actually
  // energized \u2014 an open switch, an open contact, an unwired part \u2014 has no numeric
  // fields at all.  Format defensively and only claim "live" when there is real data.
  const cr = compResults[comp.id];
  const hasLiveData = simRunning && cr && isFinite(cr.voltageDrop) && isFinite(cr.current);
  if (hasLiveData) {
    const readout = document.createElement('div');
    readout.style.cssText = 'margin-top:10px; padding:8px; background:#f0f8f0; border:1px solid #aca; border-radius:4px; font-family:Courier New,monospace; font-size:12px; color:#333;';
    const srcType = cr._sourceType || '';
    const showZ = isFinite(cr.impedance) && isFinite(cr.reactance);
    readout.innerHTML = `<b style="color:#006600">Live Readings (Ohm's Law)</b><br>`
      + `V = ${fmtNum(cr.voltageDrop, 1)} V${srcType ? ' <b style="color:#2a7acc">'+escapeHTML(srcType)+'</b>' : ''}<br>`
      + `I = ${fmtNum(cr.current, 3)} A<br>`
      + `R = ${fmtNum(cr.trueResistance != null ? cr.trueResistance : cr.resistance, 1)} \u03A9<br>`
      + (showZ ? `Z = ${fmtNum(cr.impedance, 1)} \u03A9<br>`
      + `X<sub>L</sub> = ${fmtNum(cr.reactance, 1)} \u03A9<br>`
      + `PF = ${fmtNum(cr.powerFactor, 2, '1.00')}<br>` : '')
      + `P = ${fmtNum(cr.watts, 1)} W<br>`
      + (cr._surgeFactor && cr._surgeFactor > 1.05 ? `<b style="color:#e67e00">Surge: ${fmtNum(cr._surgeFactor, 1)}\u00D7</b><br>` : '')
      + `<span style="color:#888;font-size:10px">V=IR &nbsp; P=VI &nbsp; P=I\u00B2R &nbsp; P=V\u00B2/R</span>`;
    body.appendChild(readout);
  } else if (comp.type === 'contactor_coil' || comp.type === 'relay_coil') {
    // Show static coil resistance even when de-energized or sim is off
    const r = (comp.props.coilResistance != null) ? comp.props.coilResistance : 0;
    const label = comp.type === 'relay_coil' ? 'Relay Coil Properties' : 'Coil Properties';
    const readout = document.createElement('div');
    readout.style.cssText = 'margin-top:10px; padding:8px; background:#f0f8f0; border:1px solid #aca; border-radius:4px; font-family:Courier New,monospace; font-size:12px; color:#333;';
    readout.innerHTML = `<b style="color:#006600">${label}</b><br>`
      + `R = ${fmtNum(r, 1)} \u03A9<br>`
      + `<span style="color:#888;font-size:10px">Not energized</span>`;
    body.appendChild(readout);
  } else if (simRunning) {
    // Energized circuit, but the solver found no current path through this part
    const readout = document.createElement('div');
    readout.style.cssText = 'margin-top:10px; padding:8px; background:#f7f7f7; border:1px solid #ddd; border-radius:4px; font-family:Courier New,monospace; font-size:12px; color:#888;';
    readout.textContent = 'No current path \u2014 not in an active circuit.';
    body.appendChild(readout);
  }

  for (const f of fields) {
    const lbl = document.createElement('label'); lbl.textContent = f.label;
    if (f.type === 'select') {
      const sel = document.createElement('select');
      for (const opt of f.options) {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt.charAt(0).toUpperCase() + opt.slice(1);
        if (comp.props[f.key] === opt) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => {
        // Convert numeric select options (voltage) to numbers
        comp.props[f.key] = (f.key === 'voltage') ? Number(sel.value) : sel.value;
        if (comp.type === 'fan' && f.key === 'hp') {
          const hpMap = {'1/6 HP':1/6,'1/4 HP':0.25,'1/3 HP':1/3,'1/2 HP':0.5,'3/4 HP':0.75,'1 HP':1,'1.5 HP':1.5,'2 HP':2};
          const hpNum = hpMap[sel.value] || 0.5;
          const v = comp.props.motorVoltage || 120;
          comp.props.resistance = Math.round((v * v) / (hpNum * 746) * 10) / 10;
        }
        if (comp.type === 'compressor' && f.key === 'hp') {
          // Auto-set R and L per HP (120V). Low R for realistic winding measurement.
          // L scaled so running impedance gives correct RLA. Speed-scaled L gives LRA at startup.
          const csrSpecs = {
            '1 HP':   { runR: 2.5, startR: 4.0, runL: 0.045, startL: 0.035 },
            '1.5 HP': { runR: 2.0, startR: 3.5, runL: 0.038, startL: 0.030 },
            '2 HP':   { runR: 1.5, startR: 2.5, runL: 0.030, startL: 0.025 },
            '3 HP':   { runR: 1.2, startR: 2.0, runL: 0.022, startL: 0.018 },
            '5 HP':   { runR: 1.0, startR: 1.5, runL: 0.015, startL: 0.012 },
          };
          const spec = csrSpecs[sel.value] || csrSpecs['2 HP'];
          comp.props.runResistance = spec.runR;
          comp.props.startResistance = spec.startR;
          comp.props.runInductance = spec.runL;
          comp.props.startInductance = spec.startL;
          showPropsPanel(comp); // refresh panel to show new values
        }
        // When relay contact mode changes, update resting state (NC = closed at rest, NO = open at rest)
        if (comp.type === 'relay_contact' && f.key === 'contactMode') {
          comp.props.contactClosed = sel.value === 'NC';
          comp.props.label = sel.value === 'NC' ? 'Relay Contact (NC)' : 'Relay Contact (NO)';
        }
        if (simRunning) solveCircuit(); autoSave(); render(); autoMeterUpdate();
      });
      body.appendChild(lbl); body.appendChild(sel);
    } else {
      const inp = document.createElement('input');
      inp.type = f.type === 'checkbox' ? 'checkbox' : f.type;
      if (f.type === 'checkbox') {
        inp.checked = comp.props[f.key];
        inp.addEventListener('change', () => { comp.props[f.key] = inp.checked; if (simRunning) solveCircuit(); autoSave(); render(); autoMeterUpdate(); });
      } else {
        inp.value = comp.props[f.key];
        const lim = f.type === 'number' ? PROP_LIMITS[f.key] : null;
        if (lim) { inp.min = lim.min; inp.max = lim.max; }
        inp.addEventListener('change', () => {
          let val = f.type === 'number' ? parseFloat(inp.value) : inp.value;
          if (f.type === 'number') {
            if (!isFinite(val)) val = lim ? lim.min : 0;
            val = lim ? Math.max(lim.min, Math.min(lim.max, val)) : Math.max(0, val);
            inp.value = val;
          }
          comp.props[f.key] = val;
          if (comp.type === 'fan' && f.key === 'motorVoltage') {
            const hpMap = {'1/6 HP':1/6,'1/4 HP':0.25,'1/3 HP':1/3,'1/2 HP':0.5,'3/4 HP':0.75,'1 HP':1,'1.5 HP':1.5,'2 HP':2};
            const hpNum = hpMap[comp.props.hp] || 0.5;
            comp.props.resistance = Math.round((val * val) / (hpNum * 746) * 10) / 10;
          }
          if (simRunning) solveCircuit(); autoSave(); render(); autoMeterUpdate();
        });
      }
      body.appendChild(lbl); body.appendChild(inp);
    }
  }
  panel.classList.add('visible');
  trapFocus(panel, !_wasVisible);   // don't yank focus when only re-rendering
  // Position at click location relative to canvas-wrap, clamped to viewport
  const wrap = document.getElementById('canvas-wrap');
  const wrapRect = wrap.getBoundingClientRect();
  const pw = panel.offsetWidth || 220;
  const ph = panel.offsetHeight || 200;
  const relX = _propsPanelPos.x - wrapRect.left;
  const relY = _propsPanelPos.y - wrapRect.top;
  const px = Math.max(4, Math.min(relX, wrapRect.width - pw - 4));
  const py = Math.max(4, Math.min(relY, wrapRect.height - ph - 4));
  panel.style.left = px + 'px';
  panel.style.top = py + 'px';
  render();
}
function hidePropsPanel() { const panel = document.getElementById('props-panel'); if (panel) { releaseFocus(panel); panel.classList.remove('visible'); } _propsPanelComp = null; _propsPanelWire = null; }

// Make props panel draggable by its title bar
(function() {
  const panel = document.getElementById('props-panel');
  const title = document.getElementById('props-title');
  let draggingPanel = false, panelDragStart = null;
  title.addEventListener('mousedown', (e) => {
    draggingPanel = true;
    panelDragStart = { x: e.clientX - panel.offsetLeft, y: e.clientY - panel.offsetTop };
    title.style.cursor = 'grabbing';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!draggingPanel) return;
    let newLeft = e.clientX - panelDragStart.x;
    let newTop = e.clientY - panelDragStart.y;
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    const minX = -panelWidth + 50;
    const maxX = window.innerWidth - 50;
    const minY = -panelHeight + 50;
    const maxY = window.innerHeight - 50;
    newLeft = Math.max(minX, Math.min(newLeft, maxX));
    newTop = Math.max(minY, Math.min(newTop, maxY));
    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
    render();
  });
  document.addEventListener('mouseup', () => {
    if (draggingPanel) { draggingPanel = false; title.style.cursor = 'grab'; render(); }
  });
})();

// ═══════════════════════════════════════════════════════════════
//  CONTEXT MENU
// ═══════════════════════════════════════════════════════════════
function showContextMenu(x, y) {
  const menu = document.getElementById('context-menu');
  const wrap = document.getElementById('canvas-wrap');
  // Show Flip button when a source is selected. Named to avoid shadowing the
  // global isSource(type) helper from state.js, and matched with the same
  // predicate flipComponent() actually accepts (any AC variant, or DC).
  const flippable = selectedItem && selectedItem.kind === 'component' &&
    components.some(c => c.id === selectedItem.id && (isACSource(c.type) || c.type === 'dc_source'));
  document.getElementById('ctx-flip').style.display = flippable ? '' : 'none';
  const wrapRect = wrap.getBoundingClientRect();
  const relX = x - wrapRect.left;
  const relY = y - wrapRect.top;
  menu.style.left = '0px'; menu.style.top = '0px';
  menu.style.visibility = 'hidden'; menu.classList.add('visible');
  const rect = menu.getBoundingClientRect();
  const maxX = wrapRect.width - rect.width - 4;
  const maxY = wrapRect.height - rect.height - 4;
  menu.style.left = Math.max(0, Math.min(relX, maxX)) + 'px';
  menu.style.top = Math.max(0, Math.min(relY, maxY)) + 'px';
  menu.style.visibility = 'visible';
}
function hideContextMenu() { document.getElementById('context-menu').classList.remove('visible'); }

document.getElementById('ctx-delete').addEventListener('click', (e) => {
  e.stopPropagation(); hideContextMenu();
  if (editLocked()) return;
  if (selectedItem) deleteItem(selectedItem);
});
document.getElementById('ctx-props').addEventListener('click', (e) => {
  e.stopPropagation(); hideContextMenu();
  if (selectedItem && selectedItem.kind === 'component') {
    const c = components.find(c => c.id === selectedItem.id);
    if (c) showPropsPanel(c);
  } else if (selectedItem && selectedItem.kind === 'wire') {
    const w = wires.find(wr => wr.id === selectedItem.id);
    if (w) showWirePropsPanel(w);
  }
});
document.getElementById('ctx-rotate').addEventListener('click', (e) => {
  e.stopPropagation(); hideContextMenu();
  if (editLocked()) return;
  if (selectedItem) rotateComponent(selectedItem);
});
document.getElementById('ctx-flip').addEventListener('click', (e) => {
  e.stopPropagation(); hideContextMenu();
  if (editLocked()) return;
  if (selectedItem) flipComponent(selectedItem);
});

// ═══════════════════════════════════════════════════════════════
//  TOOLBAR
// ═══════════════════════════════════════════════════════════════
document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentTool = btn.dataset.tool;
    wireStart = null;
    if (isComponentTool(currentTool)) placeRotation = 0; // always start in horizontal orientation
    syncToolButtons(currentTool);
    const ghostInfo = document.getElementById('ghost-info');
    const isComp = isComponentTool(currentTool);
    ghostInfo.textContent = (isACSource(currentTool) || currentTool === 'dc_source')
      ? 'Click to place — R to rotate · F to flip +/−'
      : 'Click to place — R to rotate';
    ghostInfo.classList.toggle('visible', isComp);
    render();
  });
});

document.getElementById('topbar-logo').addEventListener('click', () => {
  const logo = document.getElementById('topbar-logo');
  logo.classList.remove('flip');
  void logo.offsetWidth; // force reflow to restart animation
  logo.classList.add('flip');
  logo.addEventListener('animationend', () => logo.classList.remove('flip'), { once: true });
});

// Single place that reflects the energized state, mirroring syncToolButtons().
// Four separate sites used to rebuild this button by hand — the toggle, Clear All,
// project load and the startup restore — and only the toggle set aria-pressed, so
// clearing or loading while energized left assistive tech announcing "pressed"
// (circuit live) on a button whose label had already flipped back to "Energize".
function syncSimButton(running) {
  const simBtn = document.getElementById('btn-sim');
  if (!simBtn) return;
  const svgIcon = simBtn.querySelector('svg');
  if (svgIcon) { simBtn.innerHTML = ''; simBtn.appendChild(svgIcon); }
  simBtn.appendChild(document.createTextNode(running ? 'De-Energize' : 'Energize'));
  simBtn.classList.toggle('active', running);
  simBtn.setAttribute('aria-pressed', running ? 'true' : 'false');
}

document.getElementById('btn-sim').addEventListener('click', () => {
  simRunning = !simRunning;
  // Reset time delay relays on sim toggle
  for (const c of components) {
    if (c.type === 'time_delay') {
      c.props.closed = false;
      c.props._counting = false;
      c.props._remainingTime = c.props.delaySeconds;
      c.props._startTime = 0;
    }
  }
  syncSimButton(simRunning);
  if (simRunning) {
    _stopCapCharge(); _capCharged.clear(); // fresh run — caps start uncharged
    for (const k in surgeState) delete surgeState[k]; // reset surge for fresh inrush
    animTime = 0;
    solveCircuit(); autoMeterUpdate(); startAnimation(); announceToSR('Circuit energized');
  } else {
    // De-energize: mark all good caps as charged (AC circuit had them energized)
    for (const c of components) {
      if (c.type === 'capacitor' && c.props.faultMode !== 'open') _capCharged.add(c.id);
    }
    _stopCapCharge();
    releaseAllCoils(); // contactors/relays drop out when power is removed
    compResults = {}; nodeVoltages = {}; branchCurrents = {}; startLerpTransition(); autoMeterUpdate(); startAnimation(); announceToSR('Circuit de-energized');
  }
  autoSave();
  render();
});

document.getElementById('btn-reset').addEventListener('click', () => {
  // Reset all stateful components
  for (const c of components) {
    if (c.type === 'time_delay') {
      c.props.closed = false;
      c.props._counting = false;
      c.props._remainingTime = c.props.delaySeconds;
      c.props._startTime = 0;
    }
    if ((c.type === 'fuse' || c.type === 'lv_fuse' || c.type === 'td_fuse') && c.props.blown) { c.props.blown = false; c.props._ocStartTime = null; }
    if (c.type === 'breaker' && c.props.tripped) { c.props.tripped = false; c.props._ocStartTime = null; }
  }
  releaseAllCoils(); // coils drop out too; a live solve below picks the energized ones back up
  // Re-energize if running
  if (simRunning) { solveCircuit(); }
  autoSave();
  render();
});

document.getElementById('chk-data').addEventListener('change', (e) => {
  showData = e.target.checked;
  render(); autoSave();
});
document.getElementById('chk-titles').addEventListener('change', (e) => {
  showTitles = e.target.checked;
  render(); autoSave();
});
document.getElementById('chk-info').addEventListener('change', (e) => {
  showInfo = e.target.checked;
  render(); autoSave();
});
document.getElementById('chk-status').addEventListener('change', (e) => {
  showStatus = e.target.checked;
  render(); autoSave();
});

document.getElementById('chk-comments').addEventListener('change', (e) => {
  showComments = e.target.checked;
  render(); autoSave();
});

document.getElementById('chk-electrons').addEventListener('change', (e) => {
  showElectrons = e.target.checked;
  render(); autoSave();
});

document.getElementById('chk-energized-colors').addEventListener('change', (e) => {
  showEnergizedColors = e.target.checked;
  render(); autoSave();
});
document.getElementById('chk-faults').addEventListener('change', (e) => {
  showFaults = e.target.checked;
  render(); autoSave();
});

// ── Multimeter toggle ──
// ── Toolbox hub hover: keep items open while mouse travels to them ──
(function() {
  const hub = document.getElementById('toolbox-hub');
  if (!hub) return;
  let leaveTimer = null;
  hub.addEventListener('mouseenter', () => {
    clearTimeout(leaveTimer);
    hub.classList.add('hub-open');
  });
  hub.addEventListener('mouseleave', () => {
    leaveTimer = setTimeout(() => hub.classList.remove('hub-open'), 220);
  });
})();

document.getElementById('btn-multimeter').addEventListener('click', () => {
  meterActive = true;
  const meterEl  = document.getElementById('multimeter');
  const bagEl    = document.getElementById('toolbox-bag');
  const canvasWrap = document.getElementById('canvas-wrap');
  document.getElementById('btn-multimeter').classList.add('active');

  // Target resting position: bottom-left of canvas work area
  const wr = canvasWrap.getBoundingClientRect();
  const destLeft = wr.left + 16;
  const destTop  = wr.bottom - 420; // rough height offset, refined after render

  // Place meter at destination (hidden) so we can measure it
  meterEl.style.left       = destLeft + 'px';
  meterEl.style.top        = destTop  + 'px';
  meterEl.style.bottom     = 'auto';
  meterEl.style.transition = 'none';
  meterEl.style.opacity    = '0';
  meterEl.classList.add('visible');

  requestAnimationFrame(() => {
    // Now we can measure the rendered meter height accurately
    const mr  = meterEl.getBoundingClientRect();
    const finalTop = wr.bottom - mr.height - 16;
    meterEl.style.top = finalTop + 'px';

    // Get bag center as the animation origin
    const br  = bagEl ? bagEl.getBoundingClientRect() : { left: wr.left, top: wr.bottom, width: 60, height: 60 };
    const mCx = mr.left + mr.width  / 2;
    const mCy = finalTop + mr.height / 2;
    const bCx = br.left + br.width  / 2;
    const bCy = br.top  + br.height / 2;
    const tx  = bCx - mCx;
    const ty  = bCy - mCy;

    // Start shrunken at bag position
    meterEl.style.transformOrigin = 'center center';
    meterEl.style.transform       = `translate(${tx}px, ${ty}px) scale(0.08)`;
    meterEl.style.opacity         = '0';

    requestAnimationFrame(() => {
      // Animate to full size at destination
      meterEl.classList.add('slide-to-bag');
      meterEl.style.transform = 'translate(0,0) scale(1)';
      meterEl.style.opacity   = '1';
    });
  });

  // After animation finishes, clean up and show probes
  setTimeout(() => {
    meterEl.classList.remove('slide-to-bag');
    meterEl.style.transform  = '';
    meterEl.style.opacity    = '';
    meterEl.style.transition = '';
    const pb = document.getElementById('probe-black');
    const pr = document.getElementById('probe-red');
    positionProbesAtJacks();   // position before making visible — no flash from {0,0}
    if (pb) pb.classList.add('visible');
    if (pr) pr.classList.add('visible');
    updateTethers();
    setMeterStatus('Drag probes to measure');
    autoSave();
    render();
  }, 400);
});

// Badge "put back in bag" buttons
document.getElementById('badge-multimeter').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('meter-close').click();
});
document.getElementById('badge-clipboard').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('clipboard-close').click();
});

document.getElementById('meter-close').addEventListener('click', (e) => {
  e.stopPropagation();
  const meterEl = document.getElementById('multimeter');
  const bagEl   = document.getElementById('toolbox-bag');

  // Hide probes and tethers immediately
  const pb = document.getElementById('probe-black');
  const pr = document.getElementById('probe-red');
  if (pb) pb.classList.remove('visible');
  if (pr) pr.classList.remove('visible');
  meterProbe1 = null; meterProbe2 = null;
  ['tether-black','tether-red','probe-dot-black','probe-dot-red'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('opacity','0');
  });

  // Calculate vector from meter center to bag center
  const mr = meterEl.getBoundingClientRect();
  const br = bagEl  ? bagEl.getBoundingClientRect() : { left: 0, top: window.innerHeight, width: 60, height: 60 };
  const mCx = mr.left + mr.width  / 2;
  const mCy = mr.top  + mr.height / 2;
  const bCx = br.left + br.width  / 2;
  const bCy = br.top  + br.height / 2;
  const tx = bCx - mCx;
  const ty = bCy - mCy;

  // Animate slide toward bag + shrink + fade
  meterEl.style.transformOrigin = 'center center';
  meterEl.style.transform = 'none';
  meterEl.style.opacity   = '1';
  meterEl.classList.add('slide-to-bag');

  requestAnimationFrame(() => {
    meterEl.style.transform = `translate(${tx}px, ${ty}px) scale(0.08)`;
    meterEl.style.opacity   = '0';
  });

  // After animation finishes, fully hide and reset
  setTimeout(() => {
    meterActive = false;
    meterEl.classList.remove('visible', 'slide-to-bag');
    meterEl.style.transform = '';
    meterEl.style.opacity   = '';
    document.getElementById('btn-multimeter').classList.remove('active');
    updateMeterDisplay('---', '');
    autoSave();
    render();
  }, 380);
});

