// ── Clipboard Tool ──────────────────────────────────────────────
(function() {
  // clipboardActive is a global declared above

  // ── Pages storage ──────────────────────────────────
  function loadPages() {
    try {
      const p = JSON.parse(localStorage.getItem('ac-simulator-clipboard-pages'));
      return (Array.isArray(p) && p.length) ? p : [''];
    }
    catch(e) { return ['']; }
  }
  // Write ONE page back, addressed by the textarea's own data-page index.
  //
  // Only a single page element is ever mounted, so the old implementation —
  // "collect every .clipboard-page-ta and store that array" — replaced the whole
  // book with the one visible sheet: typing on page 2 of 3 silently deleted pages
  // 1 and 3.  Indexing by the element also keeps the 460 ms page-flip animation
  // honest, since during the flip the mounted textarea still belongs to the page
  // being turned away from.
  function savePages(ta) {
    const el = ta || document.querySelector('.clipboard-page-ta');
    if (!el) return;
    const idx = Number(el.dataset.page);
    if (!Number.isInteger(idx) || idx < 0) return;
    const all = loadPages();
    while (all.length <= idx) all.push('');
    all[idx] = el.value;
    safeSaveToStorage('ac-simulator-clipboard-pages', JSON.stringify(all));
  }
  function autoResizeTa(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.max(288, ta.scrollHeight) + 'px';
  }
  let currentClipPage = 0;

  function showClipPage(index, direction) {
    const pages = loadPages();
    if (index < 0 || index >= pages.length) return;
    const container = document.getElementById('clipboard-pages-container');
    const oldPage = container.querySelector('.clipboard-page');

    // Build new page
    const pageDiv = document.createElement('div');
    pageDiv.className = 'clipboard-page';

    const ta = document.createElement('textarea');
    ta.className = 'clipboard-page-ta';
    ta.dataset.page = index;
    ta.placeholder = 'Write notes here\u2026';
    ta.value = pages[index];
    ta.addEventListener('input', () => { autoResizeTa(ta); savePages(ta); });

    const hdr = document.createElement('div');
    hdr.className = 'clipboard-page-header';

    const delBtn = document.createElement('button');
    delBtn.className = 'clipboard-page-delete';
    delBtn.title = 'Remove page';
    delBtn.innerHTML = '&#x2715;';
    delBtn.addEventListener('click', () => {
      const allPages = loadPages();
      if (allPages.length <= 1) {
        allPages[0] = '';
        safeSaveToStorage('ac-simulator-clipboard-pages', JSON.stringify(allPages));
        currentClipPage = 0;
        showClipPage(0, 0);
        updatePageNav();
        return;
      }
      container.style.overflow = 'visible';
      pageDiv.classList.add('flipping-off');
      setTimeout(() => {
        container.style.overflow = '';
        allPages.splice(index, 1);
        safeSaveToStorage('ac-simulator-clipboard-pages', JSON.stringify(allPages));
        if (currentClipPage >= allPages.length) currentClipPage = allPages.length - 1;
        showClipPage(currentClipPage, 0);
        updatePageNav();
      }, 460);
    });

    const num = document.createElement('span');
    num.className = 'clipboard-page-num';
    num.textContent = 'Pg. ' + (index + 1);

    hdr.appendChild(num);
    hdr.appendChild(delBtn);

    pageDiv.appendChild(ta);
    pageDiv.appendChild(hdr);

    // currentClipPage moves immediately so back-to-back nav clicks compute the right
    // target, but the sheet only swaps when the flip animation finishes. Update the
    // "Pg. n / m" label with the sheet, and lock the outgoing textarea for the
    // duration — otherwise the header reads page 2 for 460 ms while page 1 is still
    // mounted and taking keystrokes.
    currentClipPage = index;
    if (oldPage && direction !== 0) {
      const oldTa = oldPage.querySelector('.clipboard-page-ta');
      if (oldTa) oldTa.readOnly = true;
      container.style.overflow = 'visible';
      oldPage.classList.add('flipping-off');
      setTimeout(() => {
        container.style.overflow = '';
        container.innerHTML = '';
        container.appendChild(pageDiv);
        autoResizeTa(ta);
        updatePageNav();
      }, 460);
    } else {
      container.innerHTML = '';
      container.appendChild(pageDiv);
      autoResizeTa(ta);
      updatePageNav();
    }
  }

  function updatePageNav() {
    const pages = loadPages();
    const navEl = document.getElementById('clipboard-page-nav');
    if (!navEl) return;
    const prevBtn = navEl.querySelector('.clip-prev');
    const nextBtn = navEl.querySelector('.clip-next');
    const label = navEl.querySelector('.clip-page-label');
    if (prevBtn) prevBtn.disabled = currentClipPage <= 0;
    if (nextBtn) nextBtn.disabled = currentClipPage >= pages.length - 1;
    if (label) label.textContent = 'Pg. ' + (currentClipPage + 1) + ' / ' + pages.length;
  }

  function buildPages(pages) {
    currentClipPage = Math.min(currentClipPage, pages.length - 1);
    showClipPage(currentClipPage, 0);
  }

  function openClipboard() {
    if (clipboardActive) return;
    clipboardActive = true;
    const cbEl  = document.getElementById('clipboard-panel');
    const bagEl = document.getElementById('toolbox-bag');
    const canvasWrap = document.getElementById('canvas-wrap');
    document.getElementById('btn-clipboard').classList.add('active');

    // Build pages from saved data
    buildPages(loadPages());

    // Target: bottom-left of canvas work area (same as multimeter)
    const wr = canvasWrap.getBoundingClientRect();
    const destLeft = wr.left + 16;
    const destTop  = wr.bottom - 500;

    cbEl.style.left       = destLeft + 'px';
    cbEl.style.top        = destTop  + 'px';
    cbEl.style.right      = 'auto';
    cbEl.style.transition = 'none';
    cbEl.style.opacity    = '0';
    cbEl.classList.add('visible');

    requestAnimationFrame(() => {
      const cr  = cbEl.getBoundingClientRect();
      const finalTop = wr.bottom - cr.height - 16;
      cbEl.style.top = finalTop + 'px';

      const br  = bagEl ? bagEl.getBoundingClientRect() : { left: wr.left, top: wr.bottom, width: 60, height: 60 };
      const cCx = destLeft + cr.width  / 2;
      const cCy = finalTop  + cr.height / 2;
      const bCx = br.left + br.width  / 2;
      const bCy = br.top  + br.height / 2;
      const tx  = bCx - cCx;
      const ty  = bCy - cCy;

      cbEl.style.transformOrigin = 'center center';
      cbEl.style.transform       = `translate(${tx}px, ${ty}px) scale(0.08)`;
      cbEl.style.opacity         = '0';

      requestAnimationFrame(() => {
        cbEl.style.transition = 'transform 0.35s cubic-bezier(0.6,0,0.8,0.6), opacity 0.35s ease';
        cbEl.style.transform  = 'translate(0,0) scale(1)';
        cbEl.style.opacity    = '1';
      });
    });

    setTimeout(() => {
      cbEl.style.transition = '';
      cbEl.style.transform  = '';
      cbEl.style.opacity    = '';
      saveClipboardUIState();
      autoSave();
    }, 400);
  }

  function closeClipboard() {
    if (!clipboardActive) return;
    const cbEl  = document.getElementById('clipboard-panel');
    const bagEl = document.getElementById('toolbox-bag');

    const cr  = cbEl.getBoundingClientRect();
    const br  = bagEl ? bagEl.getBoundingClientRect() : { left: 0, top: window.innerHeight, width: 60, height: 60 };
    const cCx = cr.left + cr.width  / 2;
    const cCy = cr.top  + cr.height / 2;
    const bCx = br.left + br.width  / 2;
    const bCy = br.top  + br.height / 2;
    const tx  = bCx - cCx;
    const ty  = bCy - cCy;

    cbEl.style.transformOrigin = 'center center';
    cbEl.style.transform       = 'none';
    cbEl.style.opacity         = '1';
    cbEl.style.transition      = 'transform 0.35s cubic-bezier(0.6,0,0.8,0.6), opacity 0.35s ease';

    requestAnimationFrame(() => {
      cbEl.style.transform = `translate(${tx}px, ${ty}px) scale(0.08)`;
      cbEl.style.opacity   = '0';
    });

    setTimeout(() => {
      clipboardActive = false;
      cbEl.classList.remove('visible');
      cbEl.style.transform  = '';
      cbEl.style.opacity    = '';
      cbEl.style.transition = '';
      document.getElementById('btn-clipboard').classList.remove('active');
      saveClipboardUIState();
      autoSave();
    }, 380);
  }

  // Expose open/close globally so handlers outside this IIFE can reach them
  window.openClipboard  = openClipboard;
  window.closeClipboard = closeClipboard;

  document.getElementById('btn-clipboard').addEventListener('click', openClipboard);
  document.getElementById('clipboard-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeClipboard();
  });

  // ═══════════════════════════════════════════════════════════════
  //  NCV TESTER
  // ═══════════════════════════════════════════════════════════════

  // Lerp state for smooth NCV display
  let _ncvtDisplayed = 0;
  let _ncvtTarget    = 0;
  let _ncvtLerpId    = null;

  function _ncvtApplyDisplay(v) {
    const statEl = document.getElementById('ncvt-status-text');
    if (!statEl) return;
    // Use target value for label so it doesn't flash LOW while lerping to HIGH
    const label = _ncvtTarget >= 90 ? 'HIGH' : _ncvtTarget >= 12 ? 'LOW' : 'NONE';
    statEl.textContent = label;
    if (label === 'HIGH') {
      statEl.style.color      = '#ff4444';
      statEl.style.textShadow = '0 0 5px rgba(255,50,50,0.8), 0 0 10px rgba(255,0,0,0.4)';
    } else if (label === 'LOW') {
      statEl.style.color      = '#ffaa00';
      statEl.style.textShadow = '0 0 5px rgba(255,170,0,0.75), 0 0 10px rgba(255,140,0,0.35)';
    } else {
      statEl.style.color      = '#00e84e';
      statEl.style.textShadow = '0 0 5px rgba(0,240,70,0.75), 0 0 10px rgba(0,200,60,0.35)';
    }
  }

  function _ncvtLerpStep() {
    const diff = _ncvtTarget - _ncvtDisplayed;
    if (Math.abs(diff) < 0.5) {
      _ncvtDisplayed = _ncvtTarget;
      _ncvtApplyDisplay(_ncvtDisplayed);
      _ncvtLerpId = null;
      return;
    }
    _ncvtDisplayed += diff * 0.15;
    _ncvtApplyDisplay(_ncvtDisplayed);
    _ncvtLerpId = requestAnimationFrame(_ncvtLerpStep);
  }

  function _ncvtSetTarget(v) {
    _ncvtTarget = v;
    if (!_ncvtLerpId) _ncvtLerpId = requestAnimationFrame(_ncvtLerpStep);
  }

  function detectNCV() {
    const ledEl   = document.getElementById('ncvt-led-window');
    const fillEl  = document.getElementById('ncvt-led-fill');
    const indHigh = document.getElementById('ncvt-ind-high');
    const indLow  = document.getElementById('ncvt-ind-low');
    const tipEl   = document.getElementById('ncvt-probe-tip');
    if (!ledEl) return;

    // Minimum distance from point (px,py) to segment (ax,ay)→(bx,by) in grid units
    function distToSeg(px, py, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay, len2 = dx*dx + dy*dy;
      if (len2 === 0) return Math.hypot(px - ax, py - ay);
      const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / len2));
      return Math.hypot(px - (ax + t*dx), py - (ay + t*dy));
    }

    let maxV = 0;
    const tipOnCanvas = isOnCanvas(ncvtTipPos.x, ncvtTipPos.y);
    if (tipOnCanvas) {
      const rect = canvas.getBoundingClientRect();
      const w    = screenToWorld(ncvtTipPos.x - rect.left, ncvtTipPos.y - rect.top);
      const gx   = w.x / GRID;
      const gy   = w.y / GRID;

      // Detection radius: ~15 screen-pixels converted to grid units at current zoom
      // Probe circle is 26×26px (radius 13px) — only detect when tip is essentially touching
      const tipR = 15 / (camZoom * GRID);

      // 1. Check energized node endpoints (component terminals, wire joints)
      for (const [k, v] of Object.entries(nodeVoltages)) {
        const [nx, ny] = k.split(',').map(Number);
        if (Math.hypot(nx - gx, ny - gy) <= tipR) maxV = Math.max(maxV, Math.abs(v));
      }

      // 2. Check full wire segments — catches mid-wire and long runs between nodes
      for (const wire of wires) {
        const v1 = nodeVoltages[wire.gx1 + ',' + wire.gy1];
        const v2 = nodeVoltages[wire.gx2 + ',' + wire.gy2];
        const wireV = v1 !== undefined ? Math.abs(v1) : (v2 !== undefined ? Math.abs(v2) : 0);
        if (wireV < 0.1) continue;
        if (distToSeg(gx, gy, wire.gx1, wire.gy1, wire.gx2, wire.gy2) <= tipR) {
          maxV = Math.max(maxV, wireV);
        }
      }

      // 3. Check component bodies — probe hovering over any part of a component
      for (const comp of components) {
        if (comp.gx1 === undefined) continue;
        // A ground's second terminal is the virtual bus at gx 999999, not a real
        // point on the canvas.  Measuring against that segment made the entire line
        // out to x=999999 read as live during a ground fault — test the symbol only.
        if (comp.type === 'earth_ground') {
          const gv = nodeVoltages[comp.gx1 + ',' + comp.gy1];
          if (gv !== undefined && Math.abs(gv) >= 0.1 &&
              Math.hypot(comp.gx1 - gx, comp.gy1 - gy) <= tipR) {
            maxV = Math.max(maxV, Math.abs(gv));
          }
          continue;
        }
        const v1 = nodeVoltages[comp.gx1 + ',' + comp.gy1];
        const v2 = nodeVoltages[comp.gx2 + ',' + comp.gy2];
        const compV = Math.max(
          v1 !== undefined ? Math.abs(v1) : 0,
          v2 !== undefined ? Math.abs(v2) : 0
        );
        if (compV < 0.1) continue;
        if (distToSeg(gx, gy, comp.gx1, comp.gy1, comp.gx2, comp.gy2) <= tipR) {
          maxV = Math.max(maxV, compV);
        }
        // Transformer has a separate secondary winding side
        if (comp.type === 'transformer' && comp.gx3 !== undefined) {
          const v3 = nodeVoltages[comp.gx3 + ',' + comp.gy3];
          const v4 = nodeVoltages[comp.gx4 + ',' + comp.gy4];
          const secV = Math.max(
            v3 !== undefined ? Math.abs(v3) : 0,
            v4 !== undefined ? Math.abs(v4) : 0
          );
          if (secV >= 0.1 && distToSeg(gx, gy, comp.gx3, comp.gy3, comp.gx4, comp.gy4) <= tipR) {
            maxV = Math.max(maxV, secV);
          }
        }
        // Compressor's start-winding leg (C→S); the C→R leg is covered above
        if (comp.type === 'compressor' && comp.gx3 !== undefined) {
          const v3 = nodeVoltages[comp.gx3 + ',' + comp.gy3];
          if (v3 !== undefined && Math.abs(v3) >= 0.1 &&
              distToSeg(gx, gy, comp.gx1, comp.gy1, comp.gx3, comp.gy3) <= tipR) {
            maxV = Math.max(maxV, Math.abs(v3));
          }
        }
      }

      // 4. Energized power sources: hot terminals and connected wires
      //    Skip known neutral/ground terminals so NCV doesn't false-trigger on them.
      //    Use explicit type checks (not nodeVoltages) because the solver can't
      //    represent 3-phase voltages with scalars — some hot legs may read 0V.
      const srcTermKeys = new Map();
      for (const comp of components) {
        if (!isACSource(comp.type) && comp.type !== 'dc_source') continue;
        if (comp.props.on === false) continue;
        const srcV = comp.props.voltage || 0;
        if (srcV < 1) continue;
        const terms = [[comp.gx1, comp.gy1], [comp.gx2, comp.gy2]];
        if (comp.gx3 !== undefined) terms.push([comp.gx3, comp.gy3]);
        if (comp.gx4 !== undefined) terms.push([comp.gx4, comp.gy4]);
        for (const [tx, ty] of terms) {
          // Skip neutral/ground reference terminals by source type
          const isNeutral =
            ((comp.type === 'ac_120' || comp.type === 'ac_source') && tx === comp.gx2 && ty === comp.gy2) ||
            (comp.type === 'dc_source' && tx === comp.gx2 && ty === comp.gy2) ||
            (comp.type === 'ac_480_wye' && comp.gx4 !== undefined && tx === comp.gx4 && ty === comp.gy4);
          if (isNeutral) continue;
          srcTermKeys.set(tx + ',' + ty, srcV);
          if (Math.hypot(tx - gx, ty - gy) <= tipR) {
            maxV = Math.max(maxV, srcV);
          }
        }
      }
      // Check wires connected to source terminals (the "legs")
      for (const wire of wires) {
        const wk1 = wire.gx1 + ',' + wire.gy1, wk2 = wire.gx2 + ',' + wire.gy2;
        const sv = srcTermKeys.get(wk1) || srcTermKeys.get(wk2) || 0;
        if (sv > 0 && distToSeg(gx, gy, wire.gx1, wire.gy1, wire.gx2, wire.gy2) <= tipR) {
          maxV = Math.max(maxV, sv);
        }
      }
    }

    // Smooth number transition — LED states switch immediately, number lerps
    _ncvtSetTarget(maxV);

    // Update fill bar — log scale, solid color by zone
    if (fillEl) {
      const pct = maxV > 0 ? Math.min(100, (Math.log10(maxV + 1) / Math.log10(1001)) * 100) : 0;
      fillEl.style.height = pct + '%';
      fillEl.style.background = maxV >= 90 ? '#ff2200' : maxV >= 40 ? '#ff8800' : '#00cc00';
    }

    if (maxV >= 90) {
      ledEl.className = 'led-high';
      if (indHigh) indHigh.className = 'ncvt-range-row active-high';
      if (indLow)  indLow.className  = 'ncvt-range-row';
      if (tipEl)  { tipEl.classList.add('detecting-high'); tipEl.classList.remove('detecting-low'); }
    } else if (maxV >= 12) {
      ledEl.className = 'led-low';
      if (indHigh) indHigh.className = 'ncvt-range-row';
      if (indLow)  indLow.className  = 'ncvt-range-row active-low';
      if (tipEl)  { tipEl.classList.add('detecting-low'); tipEl.classList.remove('detecting-high'); }
    } else {
      ledEl.className = '';
      if (indHigh) indHigh.className = 'ncvt-range-row';
      if (indLow)  indLow.className  = 'ncvt-range-row';
      if (tipEl)  tipEl.classList.remove('detecting-high', 'detecting-low');
    }
  }

  function updateNCVTTipEl() {
    const el = document.getElementById('ncvt-probe-tip');
    if (!el) return;
    el.style.transform = `translate(${ncvtTipPos.x - 13}px, ${ncvtTipPos.y - 13}px)`;
  }

  function openNCVT() {
    if (ncvtActive) return;
    ncvtActive = true;
    const panelEl    = document.getElementById('ncvt-panel');
    const bagEl      = document.getElementById('toolbox-bag');
    const canvasWrap = document.getElementById('canvas-wrap');
    document.getElementById('btn-ncvt').classList.add('active');

    const wr       = canvasWrap.getBoundingClientRect();
    const destLeft = wr.left + 16;
    const destTop  = wr.bottom - 380;

    panelEl.style.left       = destLeft + 'px';
    panelEl.style.top        = destTop  + 'px';
    panelEl.style.right      = 'auto';
    panelEl.style.transition = 'none';
    panelEl.style.opacity    = '0';
    panelEl.classList.add('visible');

    requestAnimationFrame(() => {
      const pr       = panelEl.getBoundingClientRect();
      const finalTop = wr.bottom - pr.height - 16;
      panelEl.style.top = finalTop + 'px';

      const br  = bagEl ? bagEl.getBoundingClientRect() : { left: wr.left, top: wr.bottom, width: 60, height: 60 };
      const pCx = destLeft + pr.width  / 2;
      const pCy = finalTop  + pr.height / 2;
      const bCx = br.left + br.width  / 2;
      const bCy = br.top  + br.height / 2;
      const tx  = bCx - pCx;
      const ty  = bCy - pCy;

      panelEl.style.transformOrigin = 'center center';
      panelEl.style.transform       = `translate(${tx}px, ${ty}px) scale(0.08)`;
      panelEl.style.opacity         = '0';

      requestAnimationFrame(() => {
        panelEl.style.transition = 'transform 0.35s cubic-bezier(0.6,0,0.8,0.6), opacity 0.35s ease';
        panelEl.style.transform  = 'translate(0,0) scale(1)';
        panelEl.style.opacity    = '1';
      });
    });

    setTimeout(() => {
      panelEl.style.transition = '';
      panelEl.style.transform  = '';
      panelEl.style.opacity    = '';

      // Attach tip to panel's physical tip point (home position)
      ncvtSnapped = null;
      ncvtDragging = false;
      const tipElO = document.getElementById('ncvt-probe-tip');
      if (tipElO) {
        tipElO.style.transition = 'none';
        tipElO.classList.remove('snapped', 'detecting-high', 'detecting-low');
      }
      const home = getNcvtTipHomePos();
      if (home) {
        ncvtTipPos = { x: home.x, y: home.y + 13 };
        updateNCVTTipEl();
      }
      document.getElementById('ncvt-probe-tip').classList.add('visible');
      detectNCV();
      autoSave();
    }, 400);
  }

  function closeNCVT() {
    if (!ncvtActive) return;
    if (_ncvtLerpId) { cancelAnimationFrame(_ncvtLerpId); _ncvtLerpId = null; }
    _ncvtDisplayed = 0; _ncvtTarget = 0;
    const panelEl = document.getElementById('ncvt-panel');
    const bagEl   = document.getElementById('toolbox-bag');
    const tipEl   = document.getElementById('ncvt-probe-tip');

    tipEl.classList.remove('visible', 'detecting-high', 'detecting-low', 'snapped');
    ncvtSnapped = null;
    ncvtDragging = false;
    detectNCV();

    const pr  = panelEl.getBoundingClientRect();
    const br  = bagEl ? bagEl.getBoundingClientRect() : { left: 0, top: window.innerHeight, width: 60, height: 60 };
    const pCx = pr.left + pr.width  / 2;
    const pCy = pr.top  + pr.height / 2;
    const bCx = br.left + br.width  / 2;
    const bCy = br.top  + br.height / 2;
    const tx  = bCx - pCx;
    const ty  = bCy - pCy;

    panelEl.style.transformOrigin = 'center center';
    panelEl.style.transform       = 'none';
    panelEl.style.opacity         = '1';
    panelEl.classList.add('slide-to-bag');

    requestAnimationFrame(() => {
      panelEl.style.transform = `translate(${tx}px, ${ty}px) scale(0.08)`;
      panelEl.style.opacity   = '0';
    });

    setTimeout(() => {
      ncvtActive = false;
      panelEl.classList.remove('visible', 'slide-to-bag');
      panelEl.style.transform = '';
      panelEl.style.opacity   = '';
      document.getElementById('btn-ncvt').classList.remove('active');
      autoSave();
    }, 380);
  }

  // NCVT probe tip dragging — tip starts attached to panel, snaps back when released off canvas
  (function() {
    const tipEl = document.getElementById('ncvt-probe-tip');
    if (!tipEl) return;

    tipEl.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      // Cancel any snap-back animation immediately
      ncvtSnapAnimating = false;
      tipEl.style.transition = 'box-shadow 0.15s';
      tipEl.classList.remove('snapped');
      ncvtSnapped = null;
      ncvtDragging = true;
      ncvtDragOffset.x = e.clientX - ncvtTipPos.x;
      ncvtDragOffset.y = e.clientY - ncvtTipPos.y;
      tipEl.style.cursor = 'grabbing';
      // Cache collision rects once at drag-start (avoids layout thrash per-mousemove)
      ncvtBlockRects = ['multimeter', 'clamp-meter', 'clipboard-panel'].map(id => {
        const el = document.getElementById(id);
        return (el && el.classList.contains('visible')) ? el.getBoundingClientRect() : null;
      }).filter(Boolean);
    });

    document.addEventListener('mousemove', e => {
      if (!ncvtDragging) return;
      let tx = e.clientX - ncvtDragOffset.x;
      let ty = e.clientY - ncvtDragOffset.y;

      // Block tip from passing through other tool panels (rects cached at drag-start)
      for (const br of ncvtBlockRects) {
        const pad = 14;
        if (tx > br.left - pad && tx < br.right + pad && ty > br.top - pad && ty < br.bottom + pad) {
          const dL = tx - (br.left - pad), dR = (br.right + pad) - tx;
          const dT = ty - (br.top - pad),  dB = (br.bottom + pad) - ty;
          const min = Math.min(dL, dR, dT, dB);
          if (min === dL) tx = br.left - pad;
          else if (min === dR) tx = br.right + pad;
          else if (min === dT) ty = br.top - pad;
          else ty = br.bottom + pad;
        }
      }

      ncvtTipPos = { x: tx, y: ty };
      updateNCVTTipEl();
      updateTethers();
      detectNCV();
    });

    document.addEventListener('mouseup', e => {
      if (!ncvtDragging) return;
      ncvtDragging = false;
      tipEl.style.cursor = 'grab';

      if (isOnCanvas(e.clientX, e.clientY) && !isOverEl(e.clientX, e.clientY, 'ncvt-panel')) {
        // Snap to nearest grid node and stay there
        const snapped = screenToGrid(e.clientX, e.clientY);
        const snapPos = gridToScreen(snapped.gx, snapped.gy);
        ncvtSnapped = snapped;
        ncvtTipPos  = snapPos;
        tipEl.style.transition = 'none';
        updateNCVTTipEl();
        tipEl.classList.add('snapped');
      } else {
        // Animate tip back to panel
        ncvtSnapped = null;
        tipEl.classList.remove('snapped', 'detecting-high', 'detecting-low');
        const home = getNcvtTipHomePos();
        if (home) {
          ncvtSnapAnimating = true;
          tipEl.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1), box-shadow 0.15s';
          void tipEl.getBoundingClientRect(); // flush so browser registers current transform as "from"
          ncvtTipPos = { x: home.x, y: home.y + 13 };
          updateNCVTTipEl();
          setTimeout(() => { ncvtSnapAnimating = false; tipEl.style.transition = 'box-shadow 0.15s'; }, 300);
        }
      }
      detectNCV();
      autoSave();
    });
  })();

  // NCVT panel drag (header)
  (function() {
    const panel  = document.getElementById('ncvt-panel');
    const header = document.getElementById('ncvt-header');
    if (!panel || !header) return;
    let dragging = false, ox = 0, oy = 0;
    header.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      dragging = true;
      const r = panel.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      panel.style.left   = (e.clientX - ox) + 'px';
      panel.style.top    = (e.clientY - oy) + 'px';
      panel.style.right  = 'auto';
      panel.style.bottom = 'auto';
      _setBagHover(_isOverBag(e.clientX, e.clientY));
      // Keep tip glued to panel tip point when not snapped/dragging (mirrors meter probe behavior)
      if (!ncvtSnapped && !ncvtDragging) {
        const home = getNcvtTipHomePos();
        if (home) {
          const tipEl = document.getElementById('ncvt-probe-tip');
          ncvtTipPos = { x: home.x, y: home.y + 13 };
          if (tipEl) tipEl.style.transform = `translate(${ncvtTipPos.x - 13}px, ${ncvtTipPos.y - 13}px)`;
        }
      }
      updateTethers();
    });
    document.addEventListener('mouseup', e => {
      if (!dragging) return;
      dragging = false;
      _setBagHover(false);
      if (_isOverBag(e.clientX, e.clientY)) { document.getElementById('ncvt-close').click(); }
      else { autoSave(); }
    });
  })();

  window.addEventListener('beforeunload', () => { if (ncvtActive) autoSave(); });

  // Expose restore function for use during page init (no open animation)
  window._restoreNcvt = function(savedData) {
    if (!savedData || !savedData.ncvtActive) return;
    ncvtActive = true;
    const panelEl = document.getElementById('ncvt-panel');
    const tipEl   = document.getElementById('ncvt-probe-tip');
    // Restore panel position
    if (savedData.ncvtLeft) {
      panelEl.style.left   = savedData.ncvtLeft;
      panelEl.style.top    = savedData.ncvtTop || '';
      panelEl.style.right  = 'auto'; panelEl.style.bottom = 'auto';
    }
    panelEl.classList.add('visible');
    document.getElementById('btn-ncvt').classList.add('active');
    // Restore tip snap state
    if (savedData.ncvtSnapped) {
      ncvtSnapped = savedData.ncvtSnapped;
      if (tipEl) tipEl.classList.add('snapped');
    } else {
      ncvtSnapped = null;
    }
    if (tipEl) tipEl.classList.add('visible');
    // Position tip after layout settles
    setTimeout(() => {
      if (ncvtSnapped) {
        ncvtTipPos = gridToScreen(ncvtSnapped.gx, ncvtSnapped.gy);
      } else {
        const home = getNcvtTipHomePos();
        if (home) ncvtTipPos = { x: home.x, y: home.y + 13 };
      }
      const el = document.getElementById('ncvt-probe-tip');
      if (el) el.style.transform = `translate(${ncvtTipPos.x - 13}px, ${ncvtTipPos.y - 13}px)`;
      detectNCV();
    }, 120);
  };

  // Expose open/close/detect globally so handlers outside this IIFE can reach them
  window.openNCVT   = openNCVT;
  window.closeNCVT  = closeNCVT;
  window.detectNCV  = detectNCV;

  document.getElementById('btn-ncvt').addEventListener('click', openNCVT);
  document.getElementById('ncvt-close').addEventListener('click', closeNCVT);
  document.getElementById('badge-ncvt').addEventListener('click', e => { e.stopPropagation(); closeNCVT(); });

  // ═══════════════════════════════════════════════════════════════
  //  CLAMP METER
  // ═══════════════════════════════════════════════════════════════
  (function() {
    let clampActive = false;
    let clampJawPos = { x: 0, y: 0 };       // screen coords of jaw center
    let clampDragging = false;
    let clampPanelDragging = false;          // true while dragging the whole panel
    let clampDragOffset = { x: 0, y: 0 };
    let clampSnappedWire = null;             // { wire, midX, midY } when jaw is over a wire
    let clampDisplayedValue = 0;
    let clampTargetValue = 0;
    let clampAnimating = false;
    let clampRestoring = false;              // true while waiting for restore detectWire

    const panelEl = document.getElementById('clamp-meter');
    const jawEl   = document.getElementById('clamp-jaw');
    const displayEl = document.getElementById('clamp-display');
    const unitEl    = document.getElementById('clamp-unit');
    const statusEl  = document.getElementById('clamp-status');
    const tetherLine = document.getElementById('clamp-tether-line');

    // ── Tether update ──
    function updateClampTether() {
      if (!tetherLine || !panelEl || !jawEl || clampRestoring) return;
      // Anchor = bottom-center of panel
      const pr = panelEl.getBoundingClientRect();
      const ax = pr.left + pr.width / 2;
      const ay = pr.bottom;
      const jx = clampJawPos.x;
      const jy = clampJawPos.y;
      tetherLine.setAttribute('x1', ax);
      tetherLine.setAttribute('y1', ay);
      tetherLine.setAttribute('x2', jx);
      tetherLine.setAttribute('y2', jy);
    }

    // ── Jaw position update ──
    function updateJawEl() {
      if (clampRestoring) return;
      jawEl.style.transform = `translate(${clampJawPos.x - 16}px, ${clampJawPos.y - 16}px)`;
    }

    // ── Find nearest wire to jaw position ──
    function detectWire() {
      if (clampPanelDragging) return; // don't snap jaw while panel is being moved
      const rect = getCanvasRectCached();
      const wx = clampJawPos.x - rect.left;
      const wy = clampJawPos.y - rect.top;
      const world = screenToWorld(wx, wy);
      const gx = world.x / GRID;
      const gy = world.y / GRID;

      let bestWire = null, bestDist = Infinity, bestMidGx = 0, bestMidGy = 0;
      // Jaw circle is 32×32px (radius 16px) — only snap when physically over the wire
      const threshold = 16 / (camZoom * GRID);

      for (const w of wires) {
        // Nearest point on segment to jaw
        const dx = w.gx2 - w.gx1, dy = w.gy2 - w.gy1;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq > 0 ? ((gx - w.gx1) * dx + (gy - w.gy1) * dy) / lenSq : 0;
        t = Math.max(0, Math.min(1, t));
        const nx = w.gx1 + t * dx, ny = w.gy1 + t * dy;
        const dist = Math.hypot(nx - gx, ny - gy);
        if (dist < threshold && dist < bestDist) {
          bestDist = dist;
          bestWire = w;
          bestMidGx = nx;
          bestMidGy = ny;
        }
      }

      if (bestWire) {
        clampSnappedWire = { wire: bestWire, midGx: bestMidGx, midGy: bestMidGy };
        jawEl.classList.add('snapped');
        if (!simRunning) {
          clampTargetValue = 0; clampDisplayedValue = 0;
          setClampDisplay('0.00', ' A~');
        } else {
          // Reuse the map drawWires() already built this frame; recomputing it per
          // mousemove re-ran the flood fill and both BFS passes for every pointer event.
          const { wireCurrent, nodeCurrent } = window._lastWireCurrentMap || getWireCurrentMap();
          const k1 = bestWire.gx1 + ',' + bestWire.gy1;
          const k2 = bestWire.gx2 + ',' + bestWire.gy2;
          let cur = wireCurrent[bestWire.id] || Math.max(nodeCurrent[k1] || 0, nodeCurrent[k2] || 0);
          // Inrush peak hold: reset when wire changes, hold max
          if (clampInrushMode) {
            const wireKey = bestWire.id;
            if (window._clampInrushWireKey && window._clampInrushWireKey !== wireKey) clampInrushPeak = null;
            window._clampInrushWireKey = wireKey;
            if (clampInrushPeak === null || cur > clampInrushPeak) clampInrushPeak = cur;
            cur = clampInrushPeak;
          }
          clampTargetValue = cur; clampDisplayedValue = cur;
          setClampDisplay(cur.toFixed(2), ' A~');
        }
      } else {
        clampSnappedWire = null;
        jawEl.classList.remove('snapped');
        clampTargetValue = 0; clampDisplayedValue = 0;
        setClampDisplay('0.00', ' A~');
      }
    }

    function setClampDisplay(val, unit) {
      displayEl.innerHTML = val + '<span id="clamp-unit">' + unit + '</span>';
    }
    // Home position: center of jaw circle sits just below the ↓ JAW label
    function getClampJawHomePos() {
      const js = document.getElementById('clamp-jaw-section');
      if (!js) return null;
      const r = js.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.bottom + 16 };
    }

    // ── Smooth lerp animation ──
    function startClampAnimation() {
      if (clampAnimating) return;
      clampAnimating = true;
      function loop() {
        const diff = clampTargetValue - clampDisplayedValue;
        if (Math.abs(diff) > 0.001) {
          clampDisplayedValue += diff * 0.12;
        } else {
          clampDisplayedValue = clampTargetValue;
        }
        setClampDisplay(clampDisplayedValue.toFixed(2), ' A~');
        if (Math.abs(clampTargetValue - clampDisplayedValue) > 0.001) {
          requestAnimationFrame(loop);
        } else {
          clampAnimating = false;
        }
      }
      requestAnimationFrame(loop);
    }

    // ── Open / Close ──
    function openClamp() {
      if (clampActive) return;
      clampActive = true;
      clampDisplayedValue = 0;
      clampTargetValue = 0;
      clampAnimating = false;
      setClampDisplay('0.00', ' A~');
      document.getElementById('btn-clamp').classList.add('active');

      const canvasWrap = document.getElementById('canvas-wrap');
      const wr = canvasWrap.getBoundingClientRect();

      panelEl.style.left    = (wr.left + 20) + 'px';
      panelEl.style.top     = (wr.bottom - 260) + 'px';
      panelEl.style.right   = 'auto';
      panelEl.style.bottom  = 'auto';
      panelEl.style.opacity = '0';
      panelEl.style.transform = 'scale(0.08)';
      panelEl.style.transformOrigin = 'center center';
      panelEl.style.transition = 'none';
      panelEl.classList.add('visible');

      requestAnimationFrame(() => {
        panelEl.classList.add('slide-to-bag'); // reuse transition class
        panelEl.style.transform = 'scale(1)';
        panelEl.style.opacity = '1';
        setTimeout(() => { panelEl.classList.remove('slide-to-bag'); panelEl.style.transition = ''; }, 420);
      });

      // Position jaw under the ↓ JAW label
      const home0 = getClampJawHomePos();
      if (home0) clampJawPos = home0;
      jawEl.classList.add('visible');
      updateJawEl();
      updateClampTether();
      autoSave();
    }

    function closeClamp() {
      if (!clampActive) return;
      clampActive = false;
      document.getElementById('btn-clamp').classList.remove('active');
      clampSnappedWire = null;
      clampDragging = false;
      jawEl.classList.remove('visible', 'snapped');
      tetherLine.setAttribute('x1', 0); tetherLine.setAttribute('y1', 0);
      tetherLine.setAttribute('x2', 0); tetherLine.setAttribute('y2', 0);

      // Animate back to bag
      const bagEl = document.getElementById('toolbox-bag');
      const bagR = bagEl.getBoundingClientRect();
      const panR = panelEl.getBoundingClientRect();
      const tx = bagR.left + bagR.width / 2 - (panR.left + panR.width / 2);
      const ty = bagR.top + bagR.height / 2 - (panR.top + panR.height / 2);
      panelEl.style.transformOrigin = 'center center';
      panelEl.style.transform = 'none';
      panelEl.style.opacity = '1';
      panelEl.classList.add('slide-to-bag');
      requestAnimationFrame(() => {
        panelEl.style.transform = `translate(${tx}px, ${ty}px) scale(0.08)`;
        panelEl.style.opacity = '0';
      });
      setTimeout(() => {
        panelEl.classList.remove('visible', 'slide-to-bag');
        panelEl.style.transform = '';
        panelEl.style.opacity = '';
        document.getElementById('btn-clamp').classList.remove('active');
        autoSave();
      }, 380);
    }

    // ── Jaw drag ──
    jawEl.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      clampDragging = true;
      clampDragOffset.x = e.clientX - clampJawPos.x;
      clampDragOffset.y = e.clientY - clampJawPos.y;
      clampSnappedWire = null;
      clampDisplayedValue = 0;
      clampTargetValue = 0;
      jawEl.classList.remove('snapped');
      setClampDisplay('0.00', ' A~');
    });

    document.addEventListener('mousemove', e => {
      if (!clampDragging) return;
      clampJawPos = { x: e.clientX - clampDragOffset.x, y: e.clientY - clampDragOffset.y };
      updateJawEl();
      updateClampTether();
      detectWire();
    });

    document.addEventListener('mouseup', e => {
      if (!clampDragging) return;
      clampDragging = false;
      // If dropped off canvas, return jaw to panel
      if (!isOnCanvas(e.clientX, e.clientY) || isOverEl(e.clientX, e.clientY, 'clamp-meter')) {
        const home = getClampJawHomePos();
        if (home) clampJawPos = home;
        clampSnappedWire = null;
        jawEl.classList.remove('snapped');
        clampTargetValue = 0; clampDisplayedValue = 0;
        setClampDisplay('0.00', ' A~');
      }
      updateJawEl();
      updateClampTether();
    });

    // ── Panel drag ──
    const header = document.getElementById('clamp-header');
    let panelDragging = false, pox = 0, poy = 0;
    header.addEventListener('mousedown', e => {
      if (e.target === document.getElementById('clamp-close')) return;
      panelDragging = true;
      clampPanelDragging = true;
      const r = panelEl.getBoundingClientRect();
      pox = e.clientX - r.left; poy = e.clientY - r.top;
    });
    document.addEventListener('mousemove', e => {
      if (!panelDragging) return;
      panelEl.style.left = (e.clientX - pox) + 'px';
      panelEl.style.top  = (e.clientY - poy) + 'px';
      panelEl.style.right = 'auto'; panelEl.style.bottom = 'auto';
      _setBagHover(_isOverBag(e.clientX, e.clientY));
      // Keep jaw glued to panel if not actively dragging
      if (!clampDragging && !clampSnappedWire) {
        const home = getClampJawHomePos();
        if (home) clampJawPos = home;
        updateJawEl();
      }
      updateClampTether();
    });
    document.addEventListener('mouseup', e => {
      if (!panelDragging) return;
      panelDragging = false; clampPanelDragging = false;
      _setBagHover(false);
      if (_isOverBag(e.clientX, e.clientY)) { document.getElementById('clamp-close').click(); }
      else { autoSave(); }
    });

    // ── Auto-refresh when circuit changes ──
    window._clampDetect = function() { if (clampActive) detectWire(); };

    // ── Inrush toggle for clamp meter ──
    document.getElementById('clamp-inrush-btn').addEventListener('click', () => {
      clampInrushMode = !clampInrushMode;
      clampInrushPeak = null;
      window._clampInrushWireKey = null;
      document.getElementById('clamp-inrush-btn').classList.toggle('active', clampInrushMode);
      document.getElementById('clamp-inrush-label').textContent = 'Inrush';
      document.getElementById('clamp-inrush-label').classList.toggle('visible', clampInrushMode);
      if (clampSnappedWire) detectWire();
    });

    // ── Button listeners ──
    document.getElementById('btn-clamp').addEventListener('click', openClamp);
    document.getElementById('clamp-close').addEventListener('click', closeClamp);
    document.getElementById('badge-clamp').addEventListener('click', e => { e.stopPropagation(); closeClamp(); });
    // Expose for use in autoMeterUpdate and restore
    window._clampActive  = () => clampActive;
    window._clampClose   = closeClamp;
    window._clampJawPos  = () => clampJawPos;   // ← let autoSave read jaw coords
    // Called every frame from updateTethers so jaw tracks the grid node during pan/zoom
    window._clampUpdateTether = function() {
      if (!clampActive) return;
      // If jaw is snapped to a wire, recalculate screen position from grid coords
      if (clampSnappedWire && !clampDragging) {
        clampJawPos = gridToScreen(clampSnappedWire.midGx, clampSnappedWire.midGy);
        updateJawEl();
      }
      // If jaw is at home (not snapped, not dragging), keep it glued to panel bottom
      // Skip during restore so saved jaw position isn't overwritten before detectWire runs
      if (!clampSnappedWire && !clampDragging && !clampRestoring) {
        const home = getClampJawHomePos();
        if (home) clampJawPos = home;
        updateJawEl();
      }
      updateClampTether();
    };
    window._restoreClamp = function(savedData) {
      if (!savedData || !savedData.clampActive) return;
      const clampEl = document.getElementById('clamp-meter');
      // Restore panel position
      if (savedData.clampLeft) {
        clampEl.style.left   = savedData.clampLeft;
        clampEl.style.top    = savedData.clampTop || '';
        clampEl.style.right  = 'auto'; clampEl.style.bottom = 'auto';
      }
      clampActive = true;
      clampRestoring = true;
      clampEl.classList.add('visible');
      document.getElementById('btn-clamp').classList.add('active');
      if (savedData.clampInrushMode) {
        clampInrushMode = true;
        document.getElementById('clamp-inrush-btn').classList.add('active');
        document.getElementById('clamp-inrush-label').textContent = 'Inrush';
        document.getElementById('clamp-inrush-label').classList.add('visible');
      }
      // Don't show jaw yet — wait until position is ready
      setTimeout(() => {
        // Restore saved jaw position, or default to just below panel
        if (savedData.clampJawX != null && savedData.clampJawY != null) {
          clampJawPos = { x: savedData.clampJawX, y: savedData.clampJawY };
        } else {
          const home = getClampJawHomePos();
          if (home) clampJawPos = home;
        }
        // Position jaw directly (bypass guard) then make visible
        jawEl.style.transform = `translate(${clampJawPos.x - 16}px, ${clampJawPos.y - 16}px)`;
        jawEl.classList.add('visible');
        // Re-run wire detection after circuit solver has settled
        setTimeout(() => {
          detectWire();
          clampRestoring = false;
          updateClampTether();
        }, 400);
      }, 120);
    };
  })();

  // Add page button
  document.getElementById('clipboard-add-page').addEventListener('click', () => {
    savePages();                       // flush the mounted page to its own index
    const pages = loadPages();
    pages.push('');
    safeSaveToStorage('ac-simulator-clipboard-pages', JSON.stringify(pages));
    currentClipPage = pages.length - 1;
    showClipPage(currentClipPage, 1);
  });

  // Page nav buttons
  document.getElementById('clipboard-page-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    // Save current page content before navigating
    savePages();                       // flush the mounted page to its own index
    const pages = loadPages();
    if (btn.classList.contains('clip-prev') && currentClipPage > 0) {
      currentClipPage--;
      showClipPage(currentClipPage, -1);
    } else if (btn.classList.contains('clip-next')) {
      if (currentClipPage < pages.length - 1) {
        currentClipPage++;
        showClipPage(currentClipPage, 1);
      }
    }
  });

  // Drag to move clipboard panel
  (function() {
    const panel  = document.getElementById('clipboard-panel');
    const handle = document.getElementById('clipboard-drag-handle');
    let dragging = false, ox = 0, oy = 0;

    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      const r = panel.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      panel.style.left   = (e.clientX - ox) + 'px';
      panel.style.top    = (e.clientY - oy) + 'px';
      panel.style.right  = 'auto';
      panel.style.bottom = 'auto';
      _setBagHover(_isOverBag(e.clientX, e.clientY));
    });
    document.addEventListener('mouseup', e => {
      if (!dragging) return;
      dragging = false;
      _setBagHover(false);
      if (_isOverBag(e.clientX, e.clientY)) { document.getElementById('clipboard-close').click(); }
      else { saveClipboardUIState(); }
    });
  })();

  // ── Resize handles ──────────────────────────────────
  (function() {
    const panel = document.getElementById('clipboard-panel');
    const MIN_W = 200, MIN_H = 260;
    let resizing = false, dir = '', startX = 0, startY = 0;
    let startW = 0, startH = 0, startLeft = 0, startTop = 0;

    panel.querySelectorAll('.cb-resize').forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        resizing = true;
        dir = handle.dataset.dir;
        startX = e.clientX;
        startY = e.clientY;
        const r = panel.getBoundingClientRect();
        startW    = r.width;
        startH    = r.height;
        startLeft = r.left;
        startTop  = r.top;
        e.preventDefault();
        e.stopPropagation();
      });
    });

    document.addEventListener('mousemove', (e) => {
      if (!resizing) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (dir === 'e') {
        panel.style.width = Math.max(MIN_W, startW + dx) + 'px';
      } else if (dir === 'w') {
        const newW = Math.max(MIN_W, startW - dx);
        panel.style.width = newW + 'px';
        panel.style.left  = (startLeft + startW - newW) + 'px';
        panel.style.right = 'auto';
      } else if (dir === 's') {
        panel.style.height = Math.max(MIN_H, startH + dy) + 'px';
      } else if (dir === 'n') {
        const newH = Math.max(MIN_H, startH - dy);
        panel.style.height = newH + 'px';
        panel.style.top    = (startTop + startH - newH) + 'px';
        panel.style.bottom = 'auto';
      }
    });

    document.addEventListener('mouseup', () => {
      if (resizing) { resizing = false; saveClipboardUIState(); autoSave(); }
    });
  })();

  // Save clipboard UI state to its own key on every position/size change and on unload
  function saveClipboardUIState() {
    const cbEl = document.getElementById('clipboard-panel');
    safeSaveToStorage('ac-sim-clipboard-ui', JSON.stringify({
      active:   clipboardActive,
      left:     cbEl.style.left,
      top:      cbEl.style.top,
      width:    cbEl.style.width,
      height:   cbEl.style.height
    }));
  }
  window.addEventListener('beforeunload', saveClipboardUIState);

  // Expose restore function for use during page init (no animation)
  window._restoreClipboard = function() {
    try {
      const raw = localStorage.getItem('ac-sim-clipboard-ui');
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s || !s.active) return;
      const cbEl = document.getElementById('clipboard-panel');
      const clipBtn = document.getElementById('btn-clipboard');
      if (!cbEl || !clipBtn) return;
      clipboardActive = true;
      buildPages(loadPages());
      if (s.width  && typeof s.width  === 'string') cbEl.style.width  = s.width;
      if (s.height && typeof s.height === 'string') cbEl.style.height = s.height;
      // Restore position
      if (s.left && typeof s.left === 'string') { cbEl.style.left = s.left; cbEl.style.right  = 'auto'; }
      if (s.top  && typeof s.top  === 'string') { cbEl.style.top  = s.top;  cbEl.style.bottom = 'auto'; }
      cbEl.classList.add('visible');
      clipBtn.classList.add('active');
    } catch(e) {}
  };
})();
// ────────────────────────────────────────────────────────────────
