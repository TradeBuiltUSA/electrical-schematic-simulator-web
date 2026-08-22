
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

/* ── The pre-cloud project library ────────────────────────────────────────
   `ac-sim-circuits` held named projects keyed by name, before they moved to
   Firestore. It is now **read-only**: the one reader is
   migrateLocalProjectsToCloud(), which lifts these entries into the user's
   account once and leaves them where they are.

   The matching writer was deliberately deleted rather than left in place. A
   live second writer for named projects is how a single source of truth
   quietly becomes two — a project saved to one store and looked for in the
   other. If something ever genuinely needs to write here again, that is a
   decision worth making explicitly, not one worth inheriting from a helper
   that happened to still exist. */
function getSavedCircuits() {
  try {
    const v = JSON.parse(localStorage.getItem('ac-sim-circuits') || '{}');
    // A stored scalar or array would make Object.keys() enumerate indices and
    // hand the migration junk rows — only a plain object is a usable index.
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch(e) { return {}; }
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

/* The open project's Firestore document id, and the `updatedAt` this session
   last saw for it. The id is what identity actually hangs off now: names
   collide and names change, so a rename must not look like a different project
   and two projects called "Panel" must stay two projects. `updatedAt` is the
   conflict basis — Save-over compares it against the stored copy so a save made
   on another device in the meantime is reported rather than discarded.

   Both are in-memory only, and both are cleared on sign-out: they name a
   document under the previous account's uid, which the next account must never
   be able to write through. */
let currentProjectId = null;
let currentProjectSeenAt = null;

function setCurrentProject(id, name, updatedAt) {
  currentProjectId = id || null;
  currentProjectName = name || null;
  currentProjectSeenAt = (typeof updatedAt === 'number' && isFinite(updatedAt)) ? updatedAt : null;
}

/* Signing out must leave nothing of the previous account behind in memory. The
   canvas itself is deliberately left alone — the working circuit belongs to
   whoever is at the keyboard and is already in localStorage — but the project
   identity points into another user's collection, and any open dialog is
   showing another user's project names. */
function clearUserProjectState() {
  setCurrentProject(null, null, null);
  closeProjectDialogs();
}

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
 * Import flow: pick a file, then store it as a new cloud project. Deliberately
 * does not touch the open canvas — a user importing a file has not asked to
 * lose the circuit in front of them, and the project is one click away in the
 * Load list afterwards.
 *
 * The old "already exists, save as a copy?" prompt is gone with name-as-key.
 * An import is always a new document: the name it carries is a label, and two
 * projects are allowed to share one.
 */
function importProjectFile(onDone) {
  pickProjectFile((name, circuit) => {
    if (!window.TBCloud || TBCloud.status() !== 'ready') {
      alert('Importing needs your account. ' +
            (TBCloud && TBCloud.status() === 'connecting'
              ? 'Still connecting — try again in a moment.'
              : 'Sign in and try again.'));
      return;
    }
    /* The file was written by an export, so it still carries a thumbnail. The
       cloud store strips it; nothing here needs to. */
    TBCloud.create(name, circuit).then(res => {
      setStatus(res.queued ? `Imported "${name}" — will sync when back online`
                           : `Imported "${name}"`);
      if (typeof onDone === 'function') onDone(res.id);
    }).catch(err => {
      console.warn('[projects] import failed', err);
      alert('Could not import this project.\n\n' + (err && err.message ? err.message : err));
    });
  });
}

/* ── One-time lift of the pre-cloud library ──────────────────────────────
   Projects saved before this build live in `ac-sim-circuits`, keyed by name and
   carrying thumbnails. On the first successful connection for an account they
   are copied up as ordinary cloud projects.

   Deliberately additive: the localStorage entries are left exactly where they
   are. A migration that deletes its source has one chance to be correct, and
   this one runs against a network. If it half-fails the user has lost nothing
   and the next sign-in retries whatever did not land.

   The flag is per-uid, because two people sharing a browser each need their own
   copy of that browser's legacy library — it predates accounts and belongs to
   whoever is signed in when it is found. */
function legacyMigrationKey(uid) { return 'tb-cloud-migrated-' + uid; }

function migrateLocalProjectsToCloud(uid) {
  let done;
  try { done = localStorage.getItem(legacyMigrationKey(uid)); } catch (e) { return; }
  if (done) return;

  const circuits = getSavedCircuits();
  const names = Object.keys(circuits);
  if (!names.length) {
    try { localStorage.setItem(legacyMigrationKey(uid), 'empty'); } catch (e) {}
    return;
  }

  /* Serial, not parallel: a legacy library can hold dozens of projects, and
     firing them all at once is how a cold connection turns into a burst of
     failed writes. */
  let uploaded = 0, failed = 0;
  const step = (i) => {
    if (i >= names.length) {
      if (!failed) {
        try { localStorage.setItem(legacyMigrationKey(uid), String(Date.now())); } catch (e) {}
      }
      if (uploaded) {
        setStatus(`Synced ${uploaded} saved project${uploaded === 1 ? '' : 's'} to your account`);
      }
      if (failed) console.warn('[projects] ' + failed + ' project(s) did not migrate; will retry next sign-in');
      return;
    }
    const name = names[i];
    TBCloud.create(name, circuits[name])
      .then(() => { uploaded++; })
      .catch(err => { failed++; console.warn('[projects] migration failed for', name, err); })
      .then(() => step(i + 1));
  };
  step(0);
}

/* Cloud status drives two things in the app: lifting the legacy library once an
   account is available, and dropping the previous account's project identity
   the moment it is not. */
if (window.TBCloud) {
  TBCloud.onChange((status, uid) => {
    if (status === 'ready' && uid) migrateLocalProjectsToCloud(uid);
    else if (status === 'signed-out') clearUserProjectState();
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
 * The thumbnail is optional because the cloud store does not want it: it is a
 * base64 JPEG that outweighs the entire schematic it previews, and it is
 * regenerable from the circuit. It stays on by default so the localStorage
 * library and exported files keep their previews. Resist the urge to fork this
 * into a second builder for the cloud — a field written by one builder and read
 * by the other's restore path is silently dead, which is exactly how the
 * tool-state fields drifted before.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.thumbnail=true] include the rasterized preview
 * @returns {Object} save entry — see README.md for the field contract.
 */
function buildSaveData(opts) {
  const wantThumb = !opts || opts.thumbnail !== false;
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
    thumbnail: wantThumb ? generateThumbnail() : null
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

/* ── Saved projects UI ────────────────────────────────────────────────────
   Both dialogs are driven by the signed-in user's Firestore collection (see
   cloud.js), not by localStorage. That makes them asynchronous and makes their
   non-happy states real: connecting, signed out, unreachable, empty. Each of
   those has to look different from the others, because an empty list rendered
   during a failed read reads as "your projects are gone".

   Rows are identified by document id, never by name. Two projects may share a
   visible name — that is legal now, and the id is what tells them apart.
   The id is never shown; the name is the only user-facing identifier.

   No thumbnails here. They are not stored in the cloud, and re-rasterizing one
   per row on open would cost more than it tells the user.
   ──────────────────────────────────────────────────────────────────────── */

const PROJECT_DIALOG_CLASS = 'tb-project-dialog';

function closeProjectDialogs() {
  for (const el of document.querySelectorAll('.' + PROJECT_DIALOG_CLASS)) el.remove();
}

/* Relative time reads better than a date stamp in a list whose whole point is
   "which copy is the newest" — the absolute date is still in the title attr. */
function formatRelative(ms) {
  if (!ms) return 'Not yet synced';
  const diff = Date.now() - ms;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) { const m = Math.floor(diff / 60000); return m + (m === 1 ? ' minute ago' : ' minutes ago'); }
  if (diff < 86400000) { const h = Math.floor(diff / 3600000); return h + (h === 1 ? ' hour ago' : ' hours ago'); }
  if (diff < 604800000) { const d = Math.floor(diff / 86400000); return d + (d === 1 ? ' day ago' : ' days ago'); }
  return formatSaveDate(new Date(ms).toISOString());
}

function projectOverlay() {
  const overlay = document.createElement('div');
  overlay.className = PROJECT_DIALOG_CLASS;
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:10px;padding:32px;min-width:520px;max-width:620px;max-height:85vh;box-shadow:0 12px 40px rgba(0,0,0,0.25);font-family:Segoe UI,system-ui,sans-serif;display:flex;flex-direction:column;';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  return { overlay, box };
}

/* The four states a cloud-backed list can be in besides "here are your rows".
   Kept in one place so Save and Load cannot drift into describing the same
   condition two different ways. */
function projectStateMessage(err) {
  const status = window.TBCloud ? TBCloud.status() : 'error';
  if (status === 'connecting') return { tone: 'wait',  text: 'Connecting to your account…' };
  if (status === 'signed-out') return { tone: 'warn',  text: 'Sign in to save and sync projects across your devices.' };
  if (status === 'error' || err) {
    return { tone: 'error', text: 'Could not reach your saved projects. Check your connection and try again.' };
  }
  return null;
}

function renderStateBlock(state) {
  const colors = { wait: '#888', warn: '#b45309', error: '#991b1b' };
  return '<p style="color:' + colors[state.tone] + ';text-align:center;padding:24px 12px;font-size:13.5px;">'
       + escapeHTML(state.text) + '</p>';
}

/* Shared row list used by both dialogs. `mode` decides which controls appear.
   Returns the container so callers can re-render just the list. */
function renderProjectRows(rows, mode) {
  if (!rows.length) {
    return '<p style="color:#888;text-align:center;padding:24px 0;">No saved projects yet.</p>';
  }
  let html = '<div id="tb-project-list" style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:8px;max-height:340px;">';
  for (const r of rows) {
    const nAttr = escapeHTML(r.name);      // user text — escape for attribute and label
    const idAttr = escapeHTML(r.id);
    const when = escapeHTML(formatRelative(r.updatedAt));
    const whenTitle = r.updatedAt ? escapeHTML(formatSaveDate(new Date(r.updatedAt).toISOString())) : '';
    const broken = r.circuit ? '' :
      '<div style="font-size:11px;color:#991b1b;margin-top:2px;">Unreadable — this project cannot be opened</div>';
    const controls = mode === 'save'
      ? '<button class="tb-p-overwrite" data-id="' + idAttr + '" title="Save the current circuit over this project" style="padding:5px 10px;border:1px solid #e0a800;border-radius:5px;background:#fff8e1;color:#b45309;cursor:pointer;font-size:11px;font-weight:600;">Overwrite</button>'
      : '';
    html +=
      '<div class="tb-p-row" data-id="' + idAttr + '" data-name="' + nAttr + '" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;' + (mode === 'load' ? 'cursor:pointer;' : '') + '">' +
        '<div style="flex:1;min-width:0;">' +
          '<div class="tb-p-name" style="font-weight:600;font-size:14px;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + nAttr + '</div>' +
          '<div style="font-size:11px;color:#888;margin-top:3px;">' + r.componentCount + ' components · ' + r.wireCount + ' wires</div>' +
          '<div style="font-size:10px;color:#aaa;margin-top:1px;" title="' + whenTitle + '">' + when + '</div>' +
          broken +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-shrink:0;">' +
          controls +
          '<button class="tb-p-rename" data-id="' + idAttr + '" title="Rename" style="padding:5px 10px;border:1px solid #d0d0d0;border-radius:5px;background:#fff;color:#3366cc;cursor:pointer;font-size:11px;font-weight:600;">Rename</button>' +
          '<button class="tb-p-delete" data-id="' + idAttr + '" title="Delete" style="padding:5px 8px;border:1px solid #e0e0e0;border-radius:5px;background:#fff;color:#cc0000;cursor:pointer;font-size:13px;font-weight:600;">&#x2715;</button>' +
        '</div>' +
      '</div>';
  }
  return html + '</div>';
}

/* Rename and delete are identical in both dialogs, so they are wired once.
   `refresh` re-opens the dialog against fresh data rather than patching the DOM
   — the collection may have moved on another device since it was drawn. */
function wireRowActions(box, rows, refresh) {
  const byId = {};
  for (const r of rows) byId[r.id] = r;

  box.querySelectorAll('.tb-p-rename').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = byId[btn.dataset.id];
      if (!row) return;
      const next = prompt('Rename project:', row.name);
      if (next === null) return;
      const trimmed = next.trim();
      if (!trimmed) { alert('A project needs a name.'); return; }
      if (trimmed === row.name) return;
      btn.disabled = true;
      TBCloud.rename(row.id, trimmed).then(res => {
        /* Renaming the project that is currently open has to move the open
           project's name too, or Export would go on proposing the old one. */
        if (currentProjectId === row.id) currentProjectName = res.name;
        setStatus(res.queued ? `Renamed to "${res.name}" — will sync when back online`
                             : `Renamed to "${res.name}"`);
        refresh();
      }).catch(err => {
        btn.disabled = false;
        alert('Could not rename this project.\n\n' + (err && err.message ? err.message : err));
      });
    });
  });

  box.querySelectorAll('.tb-p-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = byId[btn.dataset.id];
      if (!row) return;
      if (!confirm(`Delete "${row.name}"?\nThis removes it from every device signed in to your account.`)) return;
      btn.disabled = true;
      TBCloud.remove(row.id).then(res => {
        /* The open circuit stays on the canvas — deleting a save is not a
           request to lose the work in front of you — but it is no longer a
           saved project, so it stops claiming that document. */
        if (currentProjectId === row.id) setCurrentProject(null, currentProjectName, null);
        setStatus(res.queued ? 'Deleted — will sync when back online' : `Deleted "${row.name}"`);
        refresh();
      }).catch(err => {
        btn.disabled = false;
        alert('Could not delete this project.\n\n' + (err && err.message ? err.message : err));
      });
    });
  });

  box.querySelectorAll('.tb-p-row').forEach(row => {
    row.addEventListener('mouseenter', () => { row.style.borderColor = '#b0c4ff'; row.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; });
    row.addEventListener('mouseleave', () => { row.style.borderColor = '#e5e7eb'; row.style.boxShadow = 'none'; });
  });
}

/* Fetch the list, then hand it to `draw`. The dialog is put on screen straight
   away in its loading state rather than after the round trip, so a slow network
   looks like a dialog that is working instead of a button that did nothing. */
function openProjectDialog(mode, title, draw) {
  closeProjectDialogs();
  const { overlay, box } = projectOverlay();
  const heading = '<h3 style="margin:0 0 20px;font-size:18px;color:#222;font-weight:700;">' + title + '</h3>';
  const cancelRow = '<div style="display:flex;justify-content:flex-end;margin-top:20px;">'
    + '<button class="tb-p-cancel" style="padding:8px 20px;border:1px solid #d0d0d0;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;color:#555;">Cancel</button></div>';

  const wireCancel = () => {
    const c = box.querySelector('.tb-p-cancel');
    if (c) c.addEventListener('click', () => overlay.remove());
  };

  const blocked = projectStateMessage(null);
  if (blocked && blocked.tone !== 'wait') {
    box.innerHTML = heading + renderStateBlock(blocked) + cancelRow;
    wireCancel();
    return;
  }

  box.innerHTML = heading + renderStateBlock({ tone: 'wait', text: 'Loading your projects…' }) + cancelRow;
  wireCancel();

  TBCloud.list().then(rows => {
    if (!overlay.isConnected) return;      // dismissed while we were waiting
    draw(overlay, box, rows, heading, cancelRow, wireCancel);
  }).catch(err => {
    if (!overlay.isConnected) return;
    console.warn('[projects] list failed', err);
    const state = projectStateMessage(err) || { tone: 'error', text: 'Could not load your saved projects.' };
    box.innerHTML = heading + renderStateBlock(state)
      + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">'
      + '<button class="tb-p-retry" style="padding:8px 20px;border:none;border-radius:6px;background:#3366cc;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">Try again</button>'
      + '<button class="tb-p-cancel" style="padding:8px 20px;border:1px solid #d0d0d0;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;color:#555;">Cancel</button></div>';
    wireCancel();
    const retry = box.querySelector('.tb-p-retry');
    if (retry) retry.addEventListener('click', () => openProjectDialog(mode, title, draw));
  });
}

function showSaveDialog() {
  openProjectDialog('save', 'Save Project', (overlay, box, rows, heading, cancelRow, wireCancel) => {
    const refresh = () => showSaveDialog();
    box.innerHTML = heading +
      '<div style="display:flex;gap:8px;">' +
        '<input id="tb-p-newname" type="text" placeholder="Enter project name..." maxlength="' + TBCloud.maxName + '" style="flex:1;padding:10px 14px;border:1px solid #d0d0d0;border-radius:6px;font-size:14px;box-sizing:border-box;outline:none;">' +
        '<button id="tb-p-savenew" style="padding:10px 20px;border:none;border-radius:6px;background:#3366cc;color:#fff;cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;">Save New</button>' +
      '</div>' +
      '<div id="tb-p-warn" style="font-size:11px;color:#b45309;margin-top:6px;display:none;"></div>' +
      (rows.length
        ? '<div style="margin-top:16px;"><div style="font-size:12px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">Saved Projects (' + rows.length + ')</div>' + renderProjectRows(rows, 'save') + '</div>'
        : '') +
      cancelRow;
    wireCancel();
    wireRowActions(box, rows, refresh);

    const inp  = box.querySelector('#tb-p-newname');
    const warn = box.querySelector('#tb-p-warn');
    inp.value = currentProjectName || '';
    inp.focus();
    inp.select();

    /* A duplicate name is allowed — the document id keeps the projects apart —
       but it is worth saying out loud, because the list will then show two rows
       the user cannot tell apart by name alone. */
    inp.addEventListener('input', () => {
      const v = inp.value.trim();
      const clash = v && rows.some(r => r.name === v);
      warn.style.display = clash ? 'block' : 'none';
      if (clash) warn.textContent = 'You already have a project called "' + v + '". This will be saved as a separate project.';
    });

    const saveNew = () => {
      const name = inp.value.trim();
      if (!name) { inp.style.borderColor = '#cc0000'; inp.focus(); return; }
      const btn = box.querySelector('#tb-p-savenew');
      btn.disabled = true; btn.textContent = 'Saving…';
      TBCloud.create(name, buildSaveData({ thumbnail: false })).then(res => {
        setCurrentProject(res.id, name, Date.now());
        overlay.remove();
        setStatus(res.queued ? `Saved "${name}" — will sync when back online` : `Project saved as "${name}"`);
      }).catch(err => {
        btn.disabled = false; btn.textContent = 'Save New';
        console.warn('[projects] create failed', err);
        alert('Could not save this project.\n\n' + (err && err.message ? err.message : err));
      });
    };
    box.querySelector('#tb-p-savenew').addEventListener('click', saveNew);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveNew(); });

    box.querySelectorAll('.tb-p-overwrite').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = rows.filter(r => r.id === btn.dataset.id)[0];
        if (!row) return;
        if (!confirm(`Overwrite "${row.name}" with the current circuit?`)) return;
        btn.disabled = true; btn.textContent = 'Saving…';
        const payload = buildSaveData({ thumbnail: false });
        TBCloud.overwrite(row.id, payload, row.updatedAt).then(res => {
          setCurrentProject(row.id, row.name, Date.now());
          overlay.remove();
          setStatus(res.queued ? `Saved over "${row.name}" — will sync when back online`
                               : `Project saved over "${row.name}"`);
        }).catch(err => {
          btn.disabled = false; btn.textContent = 'Overwrite';
          /* Two devices wrote the same project. Never resolve this by
             whichever request happened to arrive second — say what the other
             copy is and let the user decide which one survives. */
          if (err && err.code === 'conflict') {
            const other = formatRelative(err.serverUpdatedAt);
            if (confirm(
                `"${row.name}" was changed on another device ${other.toLowerCase()}.\n\n` +
                'OK to overwrite that newer version with what is on screen, or ' +
                'Cancel to keep it and save this as a new project instead.')) {
              btn.disabled = true; btn.textContent = 'Saving…';
              TBCloud.forceOverwrite(row.id, payload).then(res2 => {
                setCurrentProject(row.id, row.name, Date.now());
                overlay.remove();
                setStatus(`Project saved over "${row.name}"`);
              }).catch(e2 => {
                btn.disabled = false; btn.textContent = 'Overwrite';
                alert('Could not save this project.\n\n' + (e2 && e2.message ? e2.message : e2));
              });
            } else {
              overlay.remove();
              showSaveDialog();
            }
            return;
          }
          console.warn('[projects] overwrite failed', err);
          alert('Could not save this project.\n\n' + (err && err.message ? err.message : err));
        });
      });
    });

    box.querySelectorAll('.tb-p-overwrite').forEach(btn => {
      btn.addEventListener('mouseenter', () => { btn.style.background = '#fef3c7'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = '#fff8e1'; });
    });
  });
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
  /* Clears the document id as well as setting the name. A restore through this
     path is not, by itself, a claim to any cloud document — the Load dialog
     re-establishes the id straight after, and every other caller (file import,
     future restore paths) genuinely has no document to point at. Leaving a
     stale id here would aim the next Save-over at the previously open
     project. */
  setCurrentProject(null, label, null);
  autoSave();
  render();
  setStatus(`Loaded "${label}"`);
}

function showLoadDialog() {
  openProjectDialog('load', 'Load Project', (overlay, box, rows, heading, cancelRow, wireCancel) => {
    const refresh = () => showLoadDialog();
    box.innerHTML = heading + renderProjectRows(rows, 'load') + cancelRow;
    wireCancel();
    wireRowActions(box, rows, refresh);

    box.querySelectorAll('.tb-p-row').forEach(item => {
      item.addEventListener('click', (e) => {
        /* The row is the click target; its own buttons are not. */
        if (e.target.closest('.tb-p-rename, .tb-p-delete')) return;
        const id = item.dataset.id;
        const listed = rows.filter(r => r.id === id)[0];
        item.style.opacity = '0.6';
        /* Re-read rather than loading the copy fetched when the dialog opened —
           it may be seconds stale, and this is the read whose `updatedAt`
           becomes the conflict basis for the next save. */
        TBCloud.get(id).then(row => {
          if (!row) { alert('That project no longer exists.'); overlay.remove(); return; }
          if (!row.circuit) {
            /* Envelope survived, payload did not. Refuse rather than handing
               the restore path something that is not a circuit. */
            alert(`"${row.name}" could not be opened — its saved data is unreadable.`);
            item.style.opacity = '1';
            return;
          }
          overlay.remove();
          /* Untrusted, exactly like localStorage and picked files: everything
             below this line is the same single restore path, sanitizers and
             all. Nothing from Firestore reaches the renderer or the solver
             without going through it. */
          applyLoadedCircuit(row.circuit, row.name);
          setCurrentProject(row.id, row.name, row.updatedAt);
        }).catch(err => {
          item.style.opacity = '1';
          console.warn('[projects] load failed', err);
          alert('Could not open this project.\n\n' + (err && err.message ? err.message : err));
        });
      });
    });

    box.querySelectorAll('.tb-p-delete, .tb-p-rename').forEach(btn => {
      btn.addEventListener('mouseenter', () => { btn.style.background = '#f7f7f7'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = '#fff'; });
    });
  });
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
  _lastStatusMsg = msg;
  setStatus(msg);
}

// ── Diagnostic line ──────────────────────────────────────────────────────────
// The electrical results stay authoritative — meters, energized colouring and
// component state say what is happening. This is one concise sentence naming the
// most severe condition the protection layer classified, so a trainee is not left
// guessing why a circuit went dead. Deliberately not a banner and not an alert.
let _lastStatusMsg = '';
let _diagnostic = '';
function updateDiagnostics() {
  const ev = (simRunning && typeof TBProtection !== 'undefined') ? TBProtection.primary() : null;
  const line = ev ? (ev.action || ev.reason || '') : '';
  if (line === _diagnostic) return;
  _diagnostic = line;
  const bar = document.getElementById('statusbar');
  if (bar) bar.classList.toggle('has-fault', !!line);
  setStatus(_lastStatusMsg);
}
function setStatus(msg) {
  _lastStatusMsg = msg;
  const bar = document.getElementById('statusbar');
  if (!bar) return;
  // While a condition is classified the strip carries only that — mixing the
  // pointer read-out into it would bury the one line that matters.
  bar.textContent = _diagnostic || msg;
}
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
  updateDiagnostics();

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
