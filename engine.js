
document.querySelectorAll('#meter-modes button').forEach(btn => {
  btn.addEventListener('click', () => {
    meterMode = btn.dataset.mode;
    // Cancel any running animation frame but preserve charge state — switching
    // the dial doesn't discharge the cap, only energizing the circuit does.
    if (_capChargeAnimId) { cancelAnimationFrame(_capChargeAnimId); _capChargeAnimId = null; }
    meterDisplayedValue = 0; // snap to 0 on mode switch so it lerps up from 0
    meterInrushPeak = null; // reset peak on mode switch
    document.querySelectorAll('#meter-modes button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // If both probes are already placed, re-read immediately — don't retract them
    if (meterProbe1 && meterProbe2) {
      takeMeasurement();
      startMeterAnimation();
    } else {
      meterDisplayMode = 'text';
      meterTargetValue = 0;
      meterDisplayedValue = 0;
      updateMeterDisplay('---', '');
      setMeterStatus('Drag probes to measure');
    }
    updateTethers();
    render();
  });
});

// Inrush peak-hold toggle
document.getElementById('meter-inrush-btn').addEventListener('click', () => {
  meterInrushMode = !meterInrushMode;
  meterInrushPeak = null;
  document.getElementById('meter-inrush-btn').classList.toggle('active', meterInrushMode);
  document.getElementById('meter-inrush-label').textContent = 'Inrush';
  document.getElementById('meter-inrush-label').classList.toggle('visible', meterInrushMode);
  if (meterProbe1 && meterProbe2) { takeMeasurement(); startMeterAnimation(); }
});

// Make multimeter draggable by header
(function() {
  const meter = document.getElementById('multimeter');
  const header = document.getElementById('meter-header');
  if (!meter || !header) return;
  let dragging = false, ox = 0, oy = 0;
  header.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    dragging = true;
    const r = meter.getBoundingClientRect();
    ox = e.clientX - r.left; oy = e.clientY - r.top;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    meter.style.left = (e.clientX - ox) + 'px';
    meter.style.top  = (e.clientY - oy) + 'px';
    meter.style.bottom = 'auto';
    _setBagHover(_isOverBag(e.clientX, e.clientY));
    // Un-snapped probes follow their jack holes as the meter moves
    if (!meterProbe1) {
      const jb = getJackScreenPos('jack-black');
      probeBlackPos = { x: jb.x, y: jb.y + 44 };
    }
    if (!meterProbe2) {
      const jr = getJackScreenPos('jack-red');
      probeRedPos = { x: jr.x, y: jr.y + 44 };
    }
    updateProbeEls();
    updateTethers();
  });
  document.addEventListener('mouseup', e => {
    if (!dragging) return;
    dragging = false;
    _setBagHover(false);
    if (_isOverBag(e.clientX, e.clientY)) { document.getElementById('meter-close').click(); }
    else { autoSave(); }
  });
})();

// Shared bag-drop helpers used by all tool panel drag handlers
function _isOverBag(x, y) {
  const bag = document.getElementById('toolbox-bag');
  if (!bag) return false;
  const r = bag.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}
function _setBagHover(on) {
  const bag = document.getElementById('toolbox-bag');
  if (bag) bag.classList.toggle('bag-drag-hover', on);
}

// Init probe drag listeners
initProbeListeners();

document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);

// Keyboard shortcuts for undo/redo
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
});

document.getElementById('btn-clear').addEventListener('click', () => {
  if (confirm('Clear entire circuit? This will also close all tools and clear clipboard notes.')) {
    // Clear circuit
    components = []; wires = []; commentBoxes = []; selectedItem = null;
    multiSelected = []; clipboardData = null; pasteCount = 0;
    clearRenderFailures();
    resetRuntimeState();
    hidePropsPanel();

    // Close multimeter if open
    if (meterActive) {
      document.getElementById('meter-close').click();
    }

    // Close NCV tester if open
    if (ncvtActive && window.closeNCVT) window.closeNCVT();

    // Close clamp meter if open
    if (window._clampActive && window._clampActive()) window._clampClose && window._clampClose();

    // Close clipboard and clear its notes
    if (clipboardActive && window.closeClipboard) window.closeClipboard();
    safeSaveToStorage('ac-simulator-clipboard-pages', JSON.stringify(['']));
    safeRemoveFromStorage('ac-sim-clipboard-ui');

    // De-energize if running
    if (simRunning) {
      simRunning = false;
      syncSimButton(false);
    }

    autoSave();
    render();
  }
});

// ── Copy / Paste ──
function copySelection() {
  const selections = multiSelected.length > 0 ? multiSelected : (selectedItem ? [selectedItem] : []);
  if (selections.length === 0) return;

  const items = [];
  let minGx = Infinity, minGy = Infinity, maxGx = -Infinity, maxGy = -Infinity;

  for (const sel of selections) {
    if (sel.kind === 'component') {
      const c = components.find(x => x.id === sel.id);
      if (!c) continue;
      const copy = JSON.parse(JSON.stringify(c));
      items.push({ kind: 'component', data: copy });
      minGx = Math.min(minGx, c.gx1, c.gx2); minGy = Math.min(minGy, c.gy1, c.gy2);
      maxGx = Math.max(maxGx, c.gx1, c.gx2); maxGy = Math.max(maxGy, c.gy1, c.gy2);
      if (c.type === 'transformer' && c.gx3 !== undefined) {
        minGx = Math.min(minGx, c.gx3, c.gx4); minGy = Math.min(minGy, c.gy3, c.gy4);
        maxGx = Math.max(maxGx, c.gx3, c.gx4); maxGy = Math.max(maxGy, c.gy3, c.gy4);
      }
      if (c.type === 'compressor' && c.gx3 !== undefined) {
        minGx = Math.min(minGx, c.gx3); minGy = Math.min(minGy, c.gy3);
        maxGx = Math.max(maxGx, c.gx3); maxGy = Math.max(maxGy, c.gy3);
      }
    } else if (sel.kind === 'wire') {
      const w = wires.find(x => x.id === sel.id);
      if (!w) continue;
      const copy = JSON.parse(JSON.stringify(w));
      items.push({ kind: 'wire', data: copy });
      minGx = Math.min(minGx, w.gx1, w.gx2); minGy = Math.min(minGy, w.gy1, w.gy2);
      maxGx = Math.max(maxGx, w.gx1, w.gx2); maxGy = Math.max(maxGy, w.gy1, w.gy2);
    } else if (sel.kind === 'comment') {
      const cb = commentBoxes.find(x => x.id === sel.id);
      if (!cb) continue;
      const copy = JSON.parse(JSON.stringify(cb));
      items.push({ kind: 'comment', data: copy });
      minGx = Math.min(minGx, cb.x1 / GRID, cb.x2 / GRID); minGy = Math.min(minGy, cb.y1 / GRID, cb.y2 / GRID);
      maxGx = Math.max(maxGx, cb.x1 / GRID, cb.x2 / GRID); maxGy = Math.max(maxGy, cb.y1 / GRID, cb.y2 / GRID);
    }
  }

  if (items.length === 0) return;
  clipboardData = { items, anchorGx: (minGx + maxGx) / 2, anchorGy: (minGy + maxGy) / 2 };
  pasteCount = 0;
  setStatus('Copied ' + items.length + ' item' + (items.length > 1 ? 's' : ''));
}

function pasteSelection() {
  if (!clipboardData || clipboardData.items.length === 0) return;
  if (editLocked()) return;

  pasteCount++;
  const offsetGx = pasteCount;  // offset by 1 grid cell per paste
  const offsetGy = pasteCount;

  const newSelections = [];

  for (const item of clipboardData.items) {
    const d = JSON.parse(JSON.stringify(item.data)); // deep copy
    const newId = nextId++;

    if (item.kind === 'component') {
      d.id = newId;
      d.gx1 += offsetGx; d.gy1 += offsetGy;
      d.gx2 += offsetGx; d.gy2 += offsetGy;
      if (d.type === 'transformer' && d.gx3 !== undefined) {
        d.gx3 += offsetGx; d.gy3 += offsetGy;
        d.gx4 += offsetGx; d.gy4 += offsetGy;
      }
      if (d.type === 'compressor' && d.gx3 !== undefined) {
        d.gx3 += offsetGx; d.gy3 += offsetGy;
      }
      // Clear transient state
      delete d.dataBoxOffset;
      delete d.priDataBoxOffset;
      delete d.secDataBoxOffset;
      components.push(d);
      newSelections.push({ kind: 'component', id: newId });
    } else if (item.kind === 'wire') {
      d.id = newId;
      d.gx1 += offsetGx; d.gy1 += offsetGy;
      d.gx2 += offsetGx; d.gy2 += offsetGy;
      wires.push(d);
      newSelections.push({ kind: 'wire', id: newId });
    } else if (item.kind === 'comment') {
      d.id = newId;
      d.x1 += offsetGx * GRID; d.y1 += offsetGy * GRID;
      d.x2 += offsetGx * GRID; d.y2 += offsetGy * GRID;
      commentBoxes.push(d);
      newSelections.push({ kind: 'comment', id: newId });
    }
  }

  // Select the pasted items
  selectedItem = newSelections.length === 1 ? newSelections[0] : null;
  multiSelected = newSelections.length > 1 ? newSelections : [];

  if (simRunning) solveCircuit();
  autoSave();
  render();
  setStatus('Pasted ' + newSelections.length + ' item' + (newSelections.length > 1 ? 's' : ''));
}

// ── Named Circuit Save/Load System ──
function getSavedCircuits() {
  try {
    const v = JSON.parse(localStorage.getItem('ac-sim-circuits') || '{}');
    // A stored scalar or array would make Object.keys() enumerate indices and fill
    // the dialog with junk rows — only a plain object is a usable index.
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch(e) { return {}; }
}
function saveSavedCircuits(circuits) {
  try {
    localStorage.setItem('ac-sim-circuits', JSON.stringify(circuits));
  } catch (e) {
    console.warn('saveSavedCircuits: localStorage write failed', e);
    alert('Could not save circuit: storage is full. Try deleting some saved projects first.');
  }
}

// Generate a thumbnail of the full workspace (canvas + sidebar + tools)
// Captures just the circuit canvas for reliability, rendered at the current viewport
function generateThumbnail() {
  try {
    const src = document.getElementById('circuit-canvas');
    const wrap = document.getElementById('canvas-wrap');
    if (!src || !wrap) return null;
    // Use the visible viewport dimensions, not the raw buffer
    const wrapW = wrap.clientWidth;
    const wrapH = wrap.clientHeight;
    const thumbW = 200, thumbH = Math.round(200 * (wrapH / wrapW));
    const tc = document.createElement('canvas');
    tc.width = thumbW; tc.height = thumbH;
    const tctx = tc.getContext('2d');
    // Background
    tctx.fillStyle = '#f5f5f5';
    tctx.fillRect(0, 0, thumbW, thumbH);
    // Draw the circuit canvas scaled to thumbnail size
    tctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, thumbW, thumbH);

    // Composite visible tool panels on top (multimeter, NCV, clamp, clipboard)
    const panels = ['multimeter', 'ncvt-panel', 'clamp-meter', 'clipboard-panel'];
    const wrapRect = wrap.getBoundingClientRect();
    for (const id of panels) {
      const el = document.getElementById(id);
      if (!el || !el.classList.contains('visible')) continue;
      const r = el.getBoundingClientRect();
      // Panel position relative to the canvas-wrap area
      const px = (r.left - wrapRect.left) / wrapW * thumbW;
      const py = (r.top - wrapRect.top) / wrapH * thumbH;
      const pw = r.width / wrapW * thumbW;
      const ph = r.height / wrapH * thumbH;
      // Draw a simplified panel rectangle with label
      tctx.fillStyle = 'rgba(40,40,40,0.75)';
      tctx.strokeStyle = 'rgba(255,255,255,0.5)';
      tctx.lineWidth = 1;
      const cr = 3;
      tctx.beginPath();
      tctx.moveTo(px + cr, py); tctx.lineTo(px + pw - cr, py);
      tctx.quadraticCurveTo(px + pw, py, px + pw, py + cr);
      tctx.lineTo(px + pw, py + ph - cr);
      tctx.quadraticCurveTo(px + pw, py + ph, px + pw - cr, py + ph);
      tctx.lineTo(px + cr, py + ph);
      tctx.quadraticCurveTo(px, py + ph, px, py + ph - cr);
      tctx.lineTo(px, py + cr);
      tctx.quadraticCurveTo(px, py, px + cr, py);
      tctx.closePath();
      tctx.fill(); tctx.stroke();
      // Amber accent bar at top
      tctx.fillStyle = '#f59e0b';
      tctx.fillRect(px, py, pw, 2);
      // Tool label
      const labels = { 'multimeter': 'DMM', 'ncvt-panel': 'NCV', 'clamp-meter': 'CLAMP', 'clipboard-panel': 'NOTES' };
      tctx.fillStyle = '#fff';
      tctx.font = `bold ${Math.max(6, Math.round(thumbW / 30))}px sans-serif`;
      tctx.textAlign = 'center';
      tctx.textBaseline = 'middle';
      tctx.fillText(labels[id] || '', px + pw / 2, py + ph / 2);
    }

    return tc.toDataURL('image/jpeg', 0.65);
  } catch(e) { return null; }
}

// ═══════════════════════════════════════════════════════════════
//  PROJECT FILE EXPORT / IMPORT
// ═══════════════════════════════════════════════════════════════
// localStorage is the only home a saved project has, and it is a fragile one:
// clearing "cookies and other site data" wipes it, Safari's storage policy can
// evict it after about a week of not visiting, and it never follows a user from
// one device or browser to another. These two functions are the escape hatch —
// they move a project between a browser and a real file the user controls.

// Bumped only when a change to the save entry makes older files unreadable.
// A file outlives the build that wrote it, so imports check this and refuse a
// file from a future version rather than half-applying fields they can't read.
const SAVE_FORMAT_VERSION = 1;

// Name of the project currently in play, set whenever one is saved or loaded.
// Its only job is to give the toolbar's Export a name worth proposing — nothing
// reads it back, and it is deliberately not persisted: after a reload the
// circuit is the autosave, which has no project name to claim.
let currentProjectName = null;
const SAVE_FILE_APP = 'tradebuilt-electrical-schematic-simulator';

/**
 * Turn a project name into a safe download filename.
 * Names are free text, so strip anything a filesystem would object to and keep
 * a non-empty fallback.
 */
function projectFilename(name) {
  const base = String(name || 'circuit')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return (base || 'circuit') + '.tbss.json';
}

/**
 * Write a save entry out as a file the user can keep, email, or carry to
 * another device.
 *
 * The entry is wrapped rather than written bare: the wrapper carries the app
 * id and format version that `readProjectFile()` checks on the way back in, so
 * an unrelated .json cannot be mistaken for a circuit.
 *
 * @param {Object} data save entry from buildSaveData()
 * @param {string} name project name to embed and to base the filename on
 */
function exportProjectFile(data, name) {
  try {
    const payload = {
      app: SAVE_FILE_APP,
      formatVersion: SAVE_FORMAT_VERSION,
      name: String(name || 'Untitled Circuit'),
      exportedAt: new Date().toISOString(),
      circuit: data
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = projectFilename(name);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoking synchronously can cancel the download in some browsers; give the
    // click a turn of the event loop to start it first.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Exported "${name}"`);
    return true;
  } catch (e) {
    console.warn('exportProjectFile failed', e);
    alert('Could not export this project.\n\n' + (e && e.message ? e.message : e));
    return false;
  }
}

/**
 * Parse and vet the text of a picked file.
 *
 * Returns `{ ok: true, name, circuit }` or `{ ok: false, error }`. This only
 * establishes that the file is a circuit file this build can read — it does not
 * sanitize the circuit itself. That stays the job of `applyLoadedCircuit()`,
 * which treats the result as untrusted exactly like a localStorage entry.
 *
 * @param {string} text raw file contents
 */
function readProjectFile(text) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) { return { ok: false, error: 'That file is not valid JSON, so it is not a circuit file.' }; }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'That file does not contain a circuit.' };
  }
  if (parsed.app !== SAVE_FILE_APP) {
    return { ok: false, error: 'That file was not exported from this simulator.' };
  }
  // A file from a newer build may use fields this one cannot read. Refuse it
  // outright rather than importing a circuit that is silently half-applied.
  const v = parsed.formatVersion;
  if (typeof v !== 'number' || !isFinite(v) || v > SAVE_FORMAT_VERSION) {
    return { ok: false, error: 'That file was saved by a newer version of the simulator. Update the page and try again.' };
  }
  const circuit = parsed.circuit;
  if (!circuit || typeof circuit !== 'object' || Array.isArray(circuit) || !Array.isArray(circuit.components)) {
    return { ok: false, error: 'That circuit file is incomplete or corrupt.' };
  }
  const name = (typeof parsed.name === 'string' && parsed.name.trim()) ? parsed.name.trim() : 'Imported Circuit';
  return { ok: true, name, circuit };
}

// The one file input the picker uses, created on first import and reused after.
// Reusing it is what keeps cancelled imports from piling up hidden nodes in the
// body: cancelling fires no `change`, so a per-call input parked in the DOM
// would never be cleaned up. Kept attached rather than detached because an
// attached input is the shape every browser has always supported, and iPad is a
// primary target we cannot easily re-verify.
let _projectFileInput = null;
let _projectFileCallback = null;

/**
 * Open the OS file picker and hand the chosen file's vetted contents to `onOk`.
 *
 * @param {function(string, Object)} onOk called with (name, circuit) on success
 */
function pickProjectFile(onOk) {
  if (!_projectFileInput) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const res = readProjectFile(String(reader.result || ''));
        if (!res.ok) { alert('Import failed.\n\n' + res.error); return; }
        if (_projectFileCallback) _projectFileCallback(res.name, res.circuit);
      };
      reader.onerror = () => { alert('Could not read that file.'); };
      reader.readAsText(file);
    });
    document.body.appendChild(input);
    _projectFileInput = input;
  }
  _projectFileCallback = onOk;
  // Clearing the value is what lets the same file be imported twice in a row.
  // Picking an identical path is not a change, so without this the second
  // import fires no event and looks like nothing happened.
  _projectFileInput.value = '';
  _projectFileInput.click();
}

/**
 * Toolbar Export: name the file, then download the circuit on the canvas.
 *
 * Prompts rather than exporting straight to a default name. An export is a
 * backup the user has to recognize later, and a folder of "Untitled Circuit"
 * files is no better than losing them — so the name is asked for once, with the
 * best guess already filled in for anyone who just wants to press Enter.
 */
function exportCurrentProject() {
  const suggested = currentProjectName || 'Untitled Circuit';
  const name = prompt('Name this exported file:', suggested);
  if (name === null) return;                     // cancelled
  const trimmed = name.trim() || suggested;
  exportProjectFile(buildSaveData(), trimmed);
}

/**
 * Import flow: pick a file, then store it in the saved-projects library under a
 * free name. Deliberately does not touch the open canvas — a user importing a
 * file has not asked to lose the circuit in front of them, and the project is
 * one click away in the Load list afterwards.
 */
function importProjectFile(onDone) {
  pickProjectFile((name, circuit) => {
    const circuits = getSavedCircuits();
    let finalName = name;
    if (circuits[finalName]) {
      const overwrite = confirm(
        `A project named "${finalName}" already exists.\n\n` +
        'OK to overwrite it, or Cancel to import as a copy.'
      );
      if (!overwrite) {
        let i = 2;
        while (circuits[`${name} (${i})`]) i++;
        finalName = `${name} (${i})`;
      }
    }
    circuits[finalName] = circuit;
    saveSavedCircuits(circuits);
    setStatus(`Imported "${finalName}"`);
    if (typeof onDone === 'function') onDone(finalName);
  });
}

/**
 * Build a named-project save entry (the value stored under a name in
 * `ac-sim-circuits`).
 *
 * Not a pure snapshot of the data model: alongside `components` / `wires` /
 * camera / view toggles it reads live panel geometry straight off the DOM, pulls
 * the clipboard pages out of `localStorage`, and rasterizes a thumbnail. It is
 * therefore only meaningful to call while the app is mounted.
 *
 * `autoSave()` in solver.js writes a similar but not identical payload to a
 * different key; see the Save data format section of README.md for the
 * field-by-field differences before changing either one.
 *
 * @returns {Object} save entry — see README.md for the field contract.
 */
function buildSaveData() {
  const meterEl  = document.getElementById('multimeter');
  const cbEl     = document.getElementById('clipboard-panel');
  const ncvtEl   = document.getElementById('ncvt-panel');
  const clampEl  = document.getElementById('clamp-meter');
  const _cjp     = window._clampJawPos ? window._clampJawPos() : null;
  const view = getViewportCSS();
  return {
    components, wires, nextId, camX, camY, camZoom, commentBoxes,
    // The viewport the camera was framed against, so a load into a different one
    // can renormalize instead of replaying pixel offsets that no longer fit.
    viewW: view.w, viewH: view.h,
    simRunning,
    meterActive,
    meterLeft:   meterEl ? meterEl.style.left   : null,
    meterTop:    meterEl ? meterEl.style.top     : null,
    meterBottom: meterEl ? meterEl.style.bottom  : null,
    meterProbe1, meterProbe2, meterMode, meterInrushMode,
    showData, showTitles, showInfo, showStatus, showComments, showElectrons, showEnergizedColors, showFaults,
    clipboardActive,
    clipboardLeft:   cbEl ? cbEl.style.left   : null,
    clipboardTop:    cbEl ? cbEl.style.top     : null,
    clipboardWidth:  cbEl ? cbEl.style.width   : null,
    clipboardHeight: cbEl ? cbEl.style.height  : null,
    clipboardPages: (function() { try { return JSON.parse(localStorage.getItem('ac-simulator-clipboard-pages') || '[""]'); } catch(e) { return ['']; } })(),
    ncvtActive,
    ncvtLeft:    ncvtEl ? ncvtEl.style.left : null,
    ncvtTop:     ncvtEl ? ncvtEl.style.top  : null,
    ncvtSnapped,
    clampActive: window._clampActive ? window._clampActive() : false, clampInrushMode,
    clampLeft:   clampEl ? clampEl.style.left : null,
    clampTop:    clampEl ? clampEl.style.top  : null,
    clampJawX:   _cjp ? _cjp.x : null,
    clampJawY:   _cjp ? _cjp.y : null,
    formatVersion: SAVE_FORMAT_VERSION,
    savedAt: new Date().toISOString(),
    thumbnail: generateThumbnail()
  };
}

// Format a date nicely for display
function formatSaveDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  const timeOpts = { hour: 'numeric', minute: '2-digit' };
  return d.toLocaleDateString(undefined, opts) + ' at ' + d.toLocaleTimeString(undefined, timeOpts);
}

function showSaveDialog() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:10px;padding:32px;min-width:520px;max-width:620px;max-height:85vh;box-shadow:0 12px 40px rgba(0,0,0,0.25);font-family:Segoe UI,system-ui,sans-serif;display:flex;flex-direction:column;';

  const existingCircuits = getSavedCircuits();
  const existingNames = Object.keys(existingCircuits).sort();

  // Build saved projects list
  let listHTML = '';
  if (existingNames.length > 0) {
    listHTML = `<div style="margin-top:16px;"><div style="font-size:12px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Saved Projects (${existingNames.length})</div><div id="save-list" style="max-height:320px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">`;
    for (const n of existingNames) {
      const c = existingCircuits[n];
      const date = formatSaveDate(c.savedAt);
      const compCount = Array.isArray(c.components) ? c.components.length : 0;
      const wireCount = Array.isArray(c.wires) ? c.wires.length : 0;
      const thumbSrc = c.thumbnail || '';
      // Project names are user text — escape for both the attribute and the label.
      // Interpolating raw broke data-name at the first quote (so Load/Delete
      // silently targeted a name that did not exist) and injected arbitrary HTML.
      const nAttr = escapeHTML(n);
      const thumbHTML = thumbSrc
        ? `<img src="${escapeHTML(thumbSrc)}" style="width:64px;height:40px;object-fit:cover;border-radius:4px;border:1px solid #e0e0e0;flex-shrink:0;">`
        : `<div style="width:64px;height:40px;border-radius:4px;border:1px solid #e0e0e0;background:#f0f0f0;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#bbb" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15l5-5 4 4 3-3 6 6"/></svg></div>`;
      listHTML += `
        <div class="save-row" data-name="${nAttr}" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;transition:border-color 0.15s,box-shadow 0.15s;">
          ${thumbHTML}
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:14px;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${nAttr}</div>
            <div style="font-size:11px;color:#888;margin-top:3px;">${compCount} components · ${wireCount} wires</div>
            <div style="font-size:10px;color:#aaa;margin-top:1px;">${escapeHTML(date)}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button class="save-overwrite-btn" data-name="${nAttr}" title="Overwrite with current circuit" style="padding:5px 10px;border:1px solid #e0a800;border-radius:5px;background:#fff8e1;color:#b45309;cursor:pointer;font-size:11px;font-weight:600;transition:background 0.15s;">Overwrite</button>
            <button class="save-delete-btn" data-name="${nAttr}" title="Delete this save" style="padding:5px 8px;border:1px solid #e0e0e0;border-radius:5px;background:#fff;color:#cc0000;cursor:pointer;font-size:13px;font-weight:600;transition:background 0.15s;">&#x2715;</button>
          </div>
        </div>`;
    }
    listHTML += '</div></div>';
  }

  box.innerHTML = `
    <h3 style="margin:0 0 20px;font-size:18px;color:#222;font-weight:700;">Save Project</h3>
    <div style="display:flex;gap:8px;">
      <input id="save-name" type="text" placeholder="Enter project name..." style="flex:1;padding:10px 14px;border:1px solid #d0d0d0;border-radius:6px;font-size:14px;box-sizing:border-box;outline:none;transition:border-color 0.15s;">
      <button id="save-confirm" style="padding:10px 20px;border:none;border-radius:6px;background:#3366cc;color:#fff;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;transition:background 0.15s;">Save New</button>
    </div>
    <div id="save-name-warning" style="font-size:11px;color:#b45309;margin-top:6px;display:none;"></div>
    ${listHTML}
    <div style="display:flex;justify-content:flex-end;margin-top:20px;">
      <button id="save-cancel" style="padding:8px 20px;border:1px solid #d0d0d0;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;color:#555;transition:background 0.15s;">Cancel</button>
    </div>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const inp = box.querySelector('#save-name');
  const saveBtn = box.querySelector('#save-confirm');
  const warning = box.querySelector('#save-name-warning');
  inp.focus();

  // Update button state when name matches an existing save
  inp.addEventListener('input', () => {
    const name = inp.value.trim();
    inp.style.borderColor = '#d0d0d0';
    if (name && existingCircuits[name]) {
      saveBtn.textContent = 'Overwrite';
      saveBtn.style.background = '#d97706';
      warning.textContent = `"${name}" already exists — clicking will overwrite it.`;
      warning.style.display = 'block';
    } else {
      saveBtn.textContent = 'Save New';
      saveBtn.style.background = '#3366cc';
      warning.style.display = 'none';
    }
  });

  // Row hover effects
  box.querySelectorAll('.save-row').forEach(row => {
    row.addEventListener('mouseenter', () => { row.style.borderColor = '#b0c4ff'; row.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; });
    row.addEventListener('mouseleave', () => { row.style.borderColor = '#e5e7eb'; row.style.boxShadow = 'none'; });
  });
  box.querySelectorAll('.save-overwrite-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => { btn.style.background = '#fef3c7'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#fff8e1'; });
  });
  box.querySelectorAll('.save-delete-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => { btn.style.background = '#fef2f2'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#fff'; });
  });

  // Overwrite button on each row
  box.querySelectorAll('.save-overwrite-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = btn.dataset.name;
      if (!confirm(`Overwrite "${name}"?\nThis cannot be undone.`)) return;
      const circuits = getSavedCircuits();
      circuits[name] = buildSaveData();
      saveSavedCircuits(circuits);
      currentProjectName = name;
      document.body.removeChild(overlay);
      setStatus(`Project saved over "${name}"`);
    });
  });

  // Delete button on each row
  box.querySelectorAll('.save-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = btn.dataset.name;
      if (!confirm(`Delete "${name}"?`)) return;
      const circuits = getSavedCircuits();
      delete circuits[name];
      saveSavedCircuits(circuits);
      // Remove the row from the list
      const row = btn.closest('.save-row');
      if (row) row.remove();
      // Update count label
      const remaining = box.querySelectorAll('.save-row').length;
      const countLabel = box.querySelector('#save-list')?.parentElement?.querySelector('div');
      if (countLabel && remaining > 0) countLabel.textContent = `Saved Projects (${remaining})`;
      else if (remaining === 0) {
        const listWrap = box.querySelector('#save-list')?.parentElement;
        if (listWrap) listWrap.remove();
      }
      // Update input warning if name matches deleted
      inp.dispatchEvent(new Event('input'));
    });
  });

  // Save new / overwrite via input
  const doSave = () => {
    const name = inp.value.trim();
    if (!name) { inp.style.borderColor = '#cc0000'; inp.focus(); return; }
    const circuits = getSavedCircuits();
    if (circuits[name] && !confirm(`Overwrite "${name}"?\nThis cannot be undone.`)) return;
    circuits[name] = buildSaveData();
    saveSavedCircuits(circuits);
    currentProjectName = name;
    document.body.removeChild(overlay);
    setStatus(`Project saved as "${name}"`);
  };
  saveBtn.addEventListener('click', doSave);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSave(); });
  box.querySelector('#save-cancel').addEventListener('click', () => document.body.removeChild(overlay));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) document.body.removeChild(overlay); });
}

/**
 * Apply a save entry to the live app: geometry, camera, sim state, view
 * toggles, and every floating tool panel.
 *
 * `c` is untrusted — it comes from `localStorage` or, since export/import, from
 * a file the user picked. Every field is therefore gated through the same
 * validators (`sanitizeComponents`, `sanitizeWires`, `applySavedCamera`,
 * `resetRuntimeState`, `applySavedToolState`) rather than being trusted to have
 * the type it should. This is the single restore path shared by the Load dialog
 * and by Import — do not add a second one.
 *
 * @param {Object} c     save entry (see README.md for the field contract)
 * @param {string} label name to report in the status line
 */
function applyLoadedCircuit(c, label) {
  // Create undo point for current circuit before loading new one
  undoStack.push(getStateSnapshot());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0; // a load is a new action — nothing to redo forward into
  // Circuit geometry
  components.length = 0; components.push(...sanitizeComponents(c.components));
  wires.length = 0; wires.push(...sanitizeWires(c.wires));
  clearRenderFailures();   // a fresh circuit gets a fresh chance to draw
  // Same reasoning as the sanitizers above — a scalar here would break the spread.
  commentBoxes.length = 0; commentBoxes.push(...(Array.isArray(c.commentBoxes) ? c.commentBoxes : []));
  nextId = c.nextId || 1;
  // Per-component runtime state is keyed by id, and the incoming circuit
  // reuses ids 1..n — without this a fan from the old circuit carries its
  // spin, glow and surge timing straight onto an unrelated new component.
  resetRuntimeState();
  // A project saved on another machine — or the same one under a different
  // OS scale factor — carries a camera framed for that viewport. Normalize
  // it to this one where the save says what that viewport was, and frame
  // the circuit outright where it does not.
  if (!applySavedCamera(c, getViewportCSS())) fitCameraToViewport();
  // A deliberate load owns the camera outright — the startup framing must
  // not still be armed behind it and reframe to the circuit that was open
  // when the page loaded.
  releaseInitialFraming();

  // Sim state
  simRunning = !!c.simRunning;
  syncSimButton(simRunning);
  if (simRunning) {
    // Loaded motors were already running — start them settled, not inrushing
    for (const lc of components) {
      if (lc.type === 'fan' || lc.type === 'contactor_coil' || lc.type === 'relay_coil' || lc.type === 'compressor') {
        surgeState[lc.id] = { startTime: -Infinity, prevEnergized: true };
      }
    }
    solveCircuit(); startAnimation();
  } else {
    compResults = {}; nodeVoltages = {}; branchCurrents = {};
    // animLoop will self-stop on next frame since simRunning is false
  }

  // View toggles
  if (c.showData !== undefined)           { showData           = c.showData;           document.getElementById('chk-data').checked            = showData; }
  if (c.showTitles !== undefined)         { showTitles         = c.showTitles;         document.getElementById('chk-titles').checked          = showTitles; }
  if (c.showInfo !== undefined)           { showInfo           = c.showInfo;           document.getElementById('chk-info').checked            = showInfo; }
  if (c.showStatus !== undefined)         { showStatus         = c.showStatus;         document.getElementById('chk-status').checked          = showStatus; }
  if (c.showComments !== undefined)        { showComments        = c.showComments;        document.getElementById('chk-comments').checked         = showComments; }
  if (c.showElectrons !== undefined)       { showElectrons       = c.showElectrons;       document.getElementById('chk-electrons').checked        = showElectrons; }
  if (c.showEnergizedColors !== undefined) { showEnergizedColors = c.showEnergizedColors; document.getElementById('chk-energized-colors').checked = showEnergizedColors; }
  if (c.showFaults !== undefined)          { showFaults          = c.showFaults;          document.getElementById('chk-faults').checked           = showFaults; }

  // Tool state (meter dial, both inrush holds) — same appliers the startup
  // restore uses. Applied before the meter block so the re-read below
  // happens in the restored mode.
  applySavedToolState(c);

  // Multimeter
  const meterEl = document.getElementById('multimeter');
  if (c.meterActive) {
    meterActive = true;
    meterProbe1 = c.meterProbe1 || null;
    meterProbe2 = c.meterProbe2 || null;
    if (c.meterLeft) { meterEl.style.left = c.meterLeft; meterEl.style.right  = 'auto'; }
    if (c.meterTop)  { meterEl.style.top  = c.meterTop;  meterEl.style.bottom = 'auto'; }
    meterEl.classList.add('visible');
    document.getElementById('btn-multimeter').classList.add('active');
    const pb = document.getElementById('probe-black');
    const pr = document.getElementById('probe-red');
    positionProbesAtJacks();
    if (pb) pb.classList.add('visible');
    if (pr) pr.classList.add('visible');
    updateTethers();
    if (meterProbe1 && meterProbe2) takeMeasurement();
  } else {
    meterActive = false;
    meterEl.classList.remove('visible');
    document.getElementById('btn-multimeter').classList.remove('active');
    const pb = document.getElementById('probe-black'); if (pb) pb.classList.remove('visible');
    const pr = document.getElementById('probe-red');   if (pr) pr.classList.remove('visible');
  }

  // Clipboard
  if (c.clipboardPages) safeSaveToStorage('ac-simulator-clipboard-pages', JSON.stringify(c.clipboardPages));
  if (c.clipboardActive && window._restoreClipboard) {
    // Close first if already open, then reopen at saved position
    if (clipboardActive && window.closeClipboard) window.closeClipboard();
    setTimeout(() => {
      safeSaveToStorage('ac-sim-clipboard-ui', JSON.stringify({
        active: true,
        left: c.clipboardLeft || '', top: c.clipboardTop || '',
        width: c.clipboardWidth || '', height: c.clipboardHeight || ''
      }));
      window._restoreClipboard();
    }, 50);
  } else if (clipboardActive && window.closeClipboard) {
    window.closeClipboard();
  }

  // NCV Tester
  if (ncvtActive && window.closeNCVT) window.closeNCVT();
  if (c.ncvtActive && window._restoreNcvt) {
    setTimeout(() => window._restoreNcvt(c), 50);
  }

  // Clamp Meter
  if (window._clampActive && window._clampActive()) window._clampClose && window._clampClose();
  if (c.clampActive && window._restoreClamp) {
    setTimeout(() => window._restoreClamp(c), 50);
  }

  selectedItem = null; hidePropsPanel();
  currentProjectName = label;
  autoSave();
  render();
  setStatus(`Loaded "${label}"`);
}

function showLoadDialog() {
  const circuits = getSavedCircuits();
  const names = Object.keys(circuits);
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9999;display:flex;align-items:center;justify-content:center;';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:10px;padding:32px;min-width:520px;max-width:620px;max-height:85vh;box-shadow:0 12px 40px rgba(0,0,0,0.25);font-family:Segoe UI,system-ui,sans-serif;display:flex;flex-direction:column;';

  let listHTML = '';
  if (names.length === 0) {
    listHTML = '<p style="color:#888;text-align:center;padding:24px 0;">No saved projects yet.</p>';
  } else {
    listHTML = '<div style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:8px;">';
    for (const name of names.sort()) {
      const c = circuits[name];
      const date = formatSaveDate(c.savedAt);
      const compCount = Array.isArray(c.components) ? c.components.length : 0;
      const wireCount = Array.isArray(c.wires) ? c.wires.length : 0;
      const thumbSrc = c.thumbnail || '';
      const nAttr = escapeHTML(name); // user-supplied — escape for attribute + label
      const thumbHTML = thumbSrc
        ? `<img src="${escapeHTML(thumbSrc)}" style="width:64px;height:40px;object-fit:cover;border-radius:4px;border:1px solid #e0e0e0;flex-shrink:0;">`
        : `<div style="width:64px;height:40px;border-radius:4px;border:1px solid #e0e0e0;background:#f0f0f0;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#bbb" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15l5-5 4 4 3-3 6 6"/></svg></div>`;
      listHTML += `
        <div class="circuit-item" data-name="${nAttr}" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;transition:border-color 0.15s,box-shadow 0.15s;">
          ${thumbHTML}
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:14px;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${nAttr}</div>
            <div style="font-size:11px;color:#888;margin-top:3px;">${compCount} components · ${wireCount} wires</div>
            <div style="font-size:10px;color:#aaa;margin-top:1px;">${escapeHTML(date)}</div>
          </div>
          <button class="del-circuit" data-name="${nAttr}" title="Delete" style="padding:5px 8px;border:1px solid #e0e0e0;border-radius:5px;background:#fff;color:#cc0000;cursor:pointer;font-size:13px;font-weight:600;transition:background 0.15s;flex-shrink:0;">&#x2715;</button>
        </div>`;
    }
    listHTML += '</div>';
  }

  box.innerHTML = `
    <h3 style="margin:0 0 20px;font-size:18px;color:#222;font-weight:700;">Load Project</h3>
    ${listHTML}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
      <button id="load-cancel" style="padding:8px 20px;border:1px solid #d0d0d0;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;color:#555;transition:background 0.15s;">Cancel</button>
    </div>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Hover effects
  box.querySelectorAll('.circuit-item').forEach(item => {
    item.addEventListener('mouseenter', () => { item.style.borderColor = '#b0c4ff'; item.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; });
    item.addEventListener('mouseleave', () => { item.style.borderColor = '#e5e7eb'; item.style.boxShadow = 'none'; });
  });
  box.querySelectorAll('.del-circuit').forEach(btn => {
    btn.addEventListener('mouseenter', () => { btn.style.background = '#fef2f2'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#fff'; });
  });

  // Load on click
  box.querySelectorAll('.circuit-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('del-circuit')) return;
      const name = item.dataset.name;
      const c = circuits[name];
      if (c) {
        applyLoadedCircuit(c, name);
      }
      document.body.removeChild(overlay);
    });
  });

  // Delete button
  box.querySelectorAll('.del-circuit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = btn.dataset.name;
      if (confirm(`Delete "${name}"?`)) {
        delete circuits[name];
        saveSavedCircuits(circuits);
        document.body.removeChild(overlay);
        showLoadDialog(); // refresh
      }
    });
  });

  box.querySelector('#load-cancel').addEventListener('click', () => document.body.removeChild(overlay));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) document.body.removeChild(overlay); });
}

document.getElementById('btn-save').addEventListener('click', showSaveDialog);
document.getElementById('btn-load').addEventListener('click', showLoadDialog);
document.getElementById('btn-export').addEventListener('click', exportCurrentProject);
// Straight to the picker — the import lands in the library, and the Load dialog
// opens on top so the newly imported project is right there to click.
document.getElementById('btn-import').addEventListener('click', () => importProjectFile(showLoadDialog));
document.getElementById('btn-manual').addEventListener('click', () => { window.open('manual.html', '_blank'); });

// Dropdown toggle logic
function closeAllDropdowns() {
  document.querySelectorAll('.dropdown').forEach(d => {
    d.classList.remove('open');
    const m = d.querySelector('.dropdown-menu');
    if (m) m.classList.remove('visible');
    const b = d.querySelector('.dropdown-btn');
    if (b) b.setAttribute('aria-expanded', 'false');
  });
}
document.querySelectorAll('.dropdown').forEach(dd => {
  const btn = dd.querySelector('.dropdown-btn');
  const menu = dd.querySelector('.dropdown-menu');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = dd.classList.contains('open');
    closeAllDropdowns();
    if (!wasOpen) { dd.classList.add('open'); menu.classList.add('visible'); btn.setAttribute('aria-expanded', 'true'); }
  });
  // Close menu on button clicks, but NOT on label/checkbox clicks (toggles)
  menu.addEventListener('click', (e) => {
    if (e.target.closest('label.toggle-item')) { e.stopPropagation(); return; }
    closeAllDropdowns();
  });
});
document.addEventListener('click', closeAllDropdowns);

document.getElementById('props-close').addEventListener('click', hidePropsPanel);
document.getElementById('props-delete').addEventListener('click', () => {
  if (editLocked()) return;
  if (selectedItem) deleteItem(selectedItem); hidePropsPanel();
});

// ═══════════════════════════════════════════════════════════════
//  STATUS
// ═══════════════════════════════════════════════════════════════
function updateStatus(g) {
  let msg = `Grid: (${g.gx}, ${g.gy})`;
  if (currentTool === 'wire' && wireStart) msg += ` | Wire from (${wireStart.gx}, ${wireStart.gy})`;
  if (isComponentTool(currentTool)) msg += ` | Placing ${currentTool} (R to rotate)`;
  if (meterActive) msg += ' | Multimeter active';
  if (simRunning) msg += ' | Simulation running';
  setStatus(msg);
}
function setStatus(msg) { document.getElementById('statusbar').textContent = msg; }
let _cautionTimer = null;
function showCautionToast(title, sub, duration) {
  const toast = document.getElementById('caution-toast');
  if (!toast) return;
  if (title) {
    const t = toast.querySelector('.caution-text');
    const s = toast.querySelector('.caution-sub');
    if (t) t.textContent = title;
    if (s) s.textContent = sub || '';
  } else {
    // Restore defaults
    const t = toast.querySelector('.caution-text');
    const s = toast.querySelector('.caution-sub');
    if (t) t.textContent = 'Circuit is energized!';
    if (s) s.textContent = 'De-energize before editing';
  }
  toast.classList.add('show');
  if (_cautionTimer) clearTimeout(_cautionTimer);
  _cautionTimer = setTimeout(() => { toast.classList.remove('show'); }, duration || 3000);
}
function editLocked() {
  if (!simRunning) return false;
  showCautionToast();
  return true;
}

// ═══════════════════════════════════════════════════════════════
//  ANIMATION
// ═══════════════════════════════════════════════════════════════
let lastFrameTime = 0, animating = false;
let lerpTransition = false;
function startLerpTransition() {
  if (lerpTransition) return;
  lerpTransition = true;
  function lerpLoop() {
    render();
    // Check if all values have settled
    let settled = true;
    for (const c of components) {
      const dv = displayValues[c.id];
      if (!dv) continue;
      for (const key in dv) {
        if (Math.abs(dv[key]) > 0.01) { settled = false; break; }
      }
      if (!settled) break;
    }
    if (!settled && !simRunning) {
      requestAnimationFrame(lerpLoop);
    } else {
      lerpTransition = false;
    }
  }
  requestAnimationFrame(lerpLoop);
}

// Snap meter display instantly (real meter behavior — no lerp)
let meterAnimating = false;
function startMeterAnimation() {
  meterDisplayedValue = meterTargetValue;
  render();
}

function startAnimation() {
  if (animating) return;
  animating = true; lastFrameTime = performance.now();
  requestAnimationFrame(animLoop);
}
function animLoop(ts) {
  invalidateCanvasRect();
  renderDt = Math.min((ts - lastFrameTime) / 1000, 0.1); // cap at 100ms
  lastFrameTime = ts;

  // Keep looping while sim running OR while fans/bulbs still coasting down.
  // Compare |speed|: a DC fan wired reverse-polarity spins backwards, and the old
  // `speed > 0.02` test read a negative speed as "already stopped", ending the loop
  // and freezing the blades mid-spin instead of coasting them down.
  const stillCoasting = !simRunning && (
    Object.values(fanState).some(s => Math.abs(s.speed) > 0.02) ||
    Object.values(bulbState).some(s => s.glow > 0.002)
  );
  if (!simRunning && !stillCoasting) { animating = false; return; }

  if (simRunning) animTime += renderDt;

  // Re-solve circuit each frame so time delay countdowns progress
  // and contactor state changes propagate in real time
  if (simRunning) { solveCircuit(); autoMeterUpdate(); }

  render();
  requestAnimationFrame(animLoop);
}

// ═══════════════════════════════════════════════════════════════
//  KEYBOARD
// ═══════════════════════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

  // Save / Load
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); showSaveDialog(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'l') { e.preventDefault(); showLoadDialog(); return; }
  // Duplicate
  if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); copySelection(); pasteSelection(); return; }
  // Copy / Paste / Select All
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); copySelection(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); pasteSelection(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    e.preventDefault();
    multiSelected = [
      ...components.map(c => ({ kind: 'component', id: c.id })),
      ...wires.map(w => ({ kind: 'wire', id: w.id })),
      ...commentBoxes.map(cb => ({ kind: 'comment', id: cb.id }))
    ];
    selectedItem = null;
    render();
    return;
  }
  // Clear circuit
  if ((e.ctrlKey || e.metaKey) && (e.key === 'Delete' || e.key === 'Backspace')) {
    e.preventDefault(); document.getElementById('btn-clear').click(); return;
  }

  // Everything below is a bare single-key shortcut — never fire it for a browser
  // or OS chord (Ctrl+R reload, Cmd+Q quit, Alt+F menus, …)
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  if (e.key === 'r' || e.key === 'R') {
    placeRotation = (placeRotation + 1) % 4;
    // If a component is selected, rotate it
    if (selectedItem && selectedItem.kind === 'component') {
      if (!editLocked()) rotateComponent(selectedItem);
    }
    render();
  }
  if (e.key === 'q' || e.key === 'Q') {
    e.preventDefault();
    const btn = document.getElementById('btn-reset');
    btn.classList.add('active');
    btn.click();
    setTimeout(() => btn.classList.remove('active'), 150);
    return;
  }
  if (e.key === 'f' || e.key === 'F') {
    if (isACSource(currentTool) || currentTool === 'dc_source') {
      // Toggle flip — swaps which end is L1/N or +/- without moving the component
      placeFlipped = !placeFlipped;
      render();
    } else if (selectedItem && selectedItem.kind === 'component') {
      const c = components.find(x => x.id === selectedItem.id);
      if (c && (isACSource(c.type) || c.type === 'dc_source') && !editLocked()) flipComponent(selectedItem);
    }
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (editLocked()) return;
    if (multiSelected.length > 0) {
      for (const sel of multiSelected) deleteItem(sel);
      multiSelected = [];
    } else if (selectedItem) deleteItem(selectedItem);
  }
  if (e.key === 'Escape') {
    wireStart = null; selectedItem = null; multiSelected = []; boxSelectStart = null; boxSelectEnd = null;
    document.getElementById('ghost-info').classList.remove('visible');
    hidePropsPanel(); hideContextMenu(); render();
  }
  if (e.key === '1') selectToolByKey('select');
  if (e.key === '2') selectToolByKey('comment');
  // Spacebar — toggle energize
  if (e.key === ' ') { e.preventDefault(); document.getElementById('btn-sim').click(); return; }
});

// Tab — cycle through components while the canvas itself has focus.
//
// This used to run for every Tab press anywhere on the page, and it called
// preventDefault() before the components.length check, so Tab never moved focus
// at all — not even on an empty canvas. Every button on the page carries an
// aria-label and a :focus-visible ring, but none of them could be reached by
// keyboard, because the very first Tab was swallowed.
//
// Scoping it to the canvas keeps the documented behaviour for someone working on
// the drawing while leaving normal focus traversal intact everywhere else. The
// cycle also stops at the ends rather than wrapping, so Tab still walks out of
// the canvas and the canvas never becomes a keyboard trap.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  if (document.activeElement !== canvas) return;
  if (components.length === 0) return;
  const dir = e.shiftKey ? -1 : 1;
  const curIdx = selectedItem && selectedItem.kind === 'component'
    ? components.findIndex(c => c.id === selectedItem.id) : -1;
  const nextIdx = curIdx === -1 ? (dir === 1 ? 0 : components.length - 1) : curIdx + dir;
  if (nextIdx < 0 || nextIdx >= components.length) { selectedItem = null; render(); return; }
  e.preventDefault();
  e.stopPropagation();
  selectedItem = { kind: 'component', id: components[nextIdx].id };
  multiSelected = [];
  currentTool = 'select';
  syncToolButtons('select');
  render();
}, true);

// Single place that reflects the active tool, so the CSS class and the
// aria-pressed state assistive tech reads can never drift apart.
function syncToolButtons(tool) {
  document.querySelectorAll('.tool-btn').forEach(b => {
    const on = b.dataset.tool === tool;
    b.classList.toggle('selected', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function selectToolByKey(tool) {
  currentTool = tool; wireStart = null; placeFlipped = false;
  syncToolButtons(tool);
  const ghostInfo = document.getElementById('ghost-info');
  ghostInfo.textContent = (isACSource(tool) || tool === 'dc_source')
    ? 'Click to place — R to rotate · F to flip +/\u2212'
    : 'Click to place — R to rotate';
  ghostInfo.classList.toggle('visible', isComponentTool(tool));
  render();
}

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════
// Auto-load saved circuit on startup
let saved = null;
try {
  saved = localStorage.getItem('ac-simulator-circuit');
} catch (e) {
  console.warn('Failed to read saved circuit from storage:', e.message);
}
let savedData = null;
if (saved) {
  try {
    savedData = JSON.parse(saved);
    components = sanitizeComponents(savedData.components);
    wires = sanitizeWires(savedData.wires);
    commentBoxes = Array.isArray(savedData.commentBoxes) ? savedData.commentBoxes : [];
    nextId = savedData.nextId || 1;
    // The camera is restored further down, after resizeCanvas() has settled the
    // viewport it has to be framed against.
    if (savedData.simRunning) simRunning = true;
    if (savedData.meterActive)     meterActive     = true;
    if (savedData.clipboardActive) clipboardActive = true;
    if (savedData.meterProbe1) meterProbe1 = savedData.meterProbe1;
    if (savedData.meterProbe2) meterProbe2 = savedData.meterProbe2;
    applySavedToolState(savedData);
    // Restore view toggles (only override if explicitly saved)
    if (savedData.showData !== undefined)           { showData           = savedData.showData;           document.getElementById('chk-data').checked            = showData; }
    if (savedData.showTitles !== undefined)         { showTitles         = savedData.showTitles;         document.getElementById('chk-titles').checked          = showTitles; }
    if (savedData.showInfo !== undefined)           { showInfo           = savedData.showInfo;           document.getElementById('chk-info').checked            = showInfo; }
    if (savedData.showStatus !== undefined)         { showStatus         = savedData.showStatus;         document.getElementById('chk-status').checked          = showStatus; }
    if (savedData.showComments !== undefined)        { showComments        = savedData.showComments;        document.getElementById('chk-comments').checked         = showComments; }
    if (savedData.showElectrons !== undefined)       { showElectrons       = savedData.showElectrons;       document.getElementById('chk-electrons').checked        = showElectrons; }
    if (savedData.showEnergizedColors !== undefined) { showEnergizedColors = savedData.showEnergizedColors; document.getElementById('chk-energized-colors').checked = showEnergizedColors; }
    if (savedData.showFaults !== undefined)          { showFaults          = savedData.showFaults;          document.getElementById('chk-faults').checked           = showFaults; }
  } catch(e) { console.warn('Failed to load saved circuit:', e); }
}

// Initialize undo stack and capture initial state for undo tracking
undoStack.length = 0;
redoStack.length = 0;
_lastSavedSnapshot = getStateSnapshot();

// Restore sim state if it was running
if (simRunning) {
  syncSimButton(true);
  // Suppress startup surge on page reload — motors were already running
  for (const c of components) {
    if (c.type === 'fan' || c.type === 'contactor_coil' || c.type === 'relay_coil') {
      surgeState[c.id] = { startTime: -Infinity, prevEnergized: true };
    }
  }
  solveCircuit();
  startAnimation();
}

// Restore clipboard if it was open
if (window._restoreClipboard) window._restoreClipboard();

// Restore NCV tester if it was open
if (window._restoreNcvt) window._restoreNcvt(savedData);

// Restore clamp meter if it was open
if (window._restoreClamp) window._restoreClamp(savedData);

// Restore multimeter if it was open
if (meterActive) {
  const meterEl = document.getElementById('multimeter');
  meterEl.classList.add('visible');
  document.getElementById('btn-multimeter').classList.add('active');
  // Restore saved position
  if (savedData && savedData.meterLeft) {
    meterEl.style.left   = savedData.meterLeft;
    meterEl.style.top    = savedData.meterTop;
    meterEl.style.bottom = savedData.meterBottom || 'auto';
  }
  const pb = document.getElementById('probe-black');
  const pr = document.getElementById('probe-red');
  setTimeout(() => {
    // Position un-snapped probes at jacks; snapped probes recompute from grid in updateTethers
    if (!meterProbe1) {
      const jb = getJackScreenPos('jack-black');
      probeBlackPos = { x: jb.x, y: jb.y + 44 };
    }
    if (!meterProbe2) {
      const jr = getJackScreenPos('jack-red');
      probeRedPos = { x: jr.x, y: jr.y + 44 };
    }
    updateProbeEls();
    updateTethers();
    // Show probes only after positions are computed — prevents flash at (0,0)
    if (pb) pb.classList.add('visible');
    if (pr) pr.classList.add('visible');
    if (meterProbe1 && meterProbe2) {
      takeMeasurement();
      // When sim is off the animLoop isn't running, so if takeMeasurement produced
      // a value-based reading (ohm/cap), write it directly to the display now.
      if (!simRunning && meterDisplayMode === 'value') {
        meterDisplayedValue = meterTargetValue;
        const dec = meterDisplayUnit.includes('A') ? 2 : 1;
        updateMeterDisplay(meterDisplayedValue.toFixed(dec), meterDisplayUnit);
      }
    }
  }, 120);
}

resizeCanvas();
// Camera last, once the viewport it is framed against exists. A saved camera that
// carries its own viewport is restored — renormalized first if this viewport is
// materially different, which is what a Windows OS scale factor of 125% or 150%
// amounts to. Anything else — a first run, or a save predating viewW/viewH — gets
// framed against the viewport that actually exists.
//
// Recomputed from `savedData` and the content bounds every time, so workspace.js
// can re-run it once the layout finishes settling and get the right answer rather
// than a correction applied to a wrong one.
function applyInitialCamera() {
  if (!applySavedCamera(savedData, getViewportCSS())) fitCameraToViewport();
}
applyInitialCamera();
setInitialFraming(applyInitialCamera);
render();
