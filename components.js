
// ── Shared tethered data box renderer ──
function _drawTetheredBox(comp, anchorX, anchorY, linesArr, compId, boxKey, offsetProp) {
  if (!comp[offsetProp]) comp[offsetProp] = { x: 0, y: 0 };
  let bmaxW = 0;
  const tRowH = 18 / camZoom, tRowGap = 2 / camZoom, tPadX = 10 / camZoom, tPadY = 8 / camZoom, tAccH = 3 / camZoom;
  ctx.font = `600 ${(12/camZoom)}px "Segoe UI", system-ui, sans-serif`;
  for (const l of linesArr) { const w = ctx.measureText(l.text).width; if (w > bmaxW) bmaxW = w; }
  const bW = Math.max(bmaxW + tPadX * 2 + 8/camZoom, 70/camZoom);
  const contentH = linesArr.length * (tRowH + tRowGap) - (linesArr.length > 0 ? tRowGap : 0);
  const bH = tPadY + tAccH + contentH + tPadY;
  const defX = boxKey === 'pri' ? anchorX - bW - 8 : anchorX + 8;
  const defY = anchorY - bH / 2;
  if (!comp[offsetProp]) comp[offsetProp] = { x: 0, y: 0 };
  const bx = defX + comp[offsetProp].x, by = defY + comp[offsetProp].y;
  const bcx = bx + bW / 2, bcy = by + bH / 2;
  ctx.strokeStyle = 'rgba(42,122,204,0.3)'; ctx.lineWidth = 1.5 / camZoom;
  ctx.setLineDash([4 / camZoom, 4 / camZoom]);
  ctx.beginPath(); ctx.moveTo(anchorX, anchorY); ctx.lineTo(bcx, bcy); ctx.stroke(); ctx.setLineDash([]);
  const tr = 8 / camZoom;
  function _trr(x, y, w, h, rad) {
    ctx.beginPath(); ctx.moveTo(x+rad,y); ctx.lineTo(x+w-rad,y); ctx.quadraticCurveTo(x+w,y,x+w,y+rad);
    ctx.lineTo(x+w,y+h-rad); ctx.quadraticCurveTo(x+w,y+h,x+w-rad,y+h); ctx.lineTo(x+rad,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-rad); ctx.lineTo(x,y+rad); ctx.quadraticCurveTo(x,y,x+rad,y); ctx.closePath();
  }
  ctx.save(); ctx.shadowColor='rgba(0,0,0,0.15)'; ctx.shadowBlur=12/camZoom; ctx.shadowOffsetY=3/camZoom;
  _trr(bx,by,bW,bH,tr); ctx.fillStyle='rgba(255,255,255,0.98)'; ctx.fill(); ctx.restore();
  ctx.save(); _trr(bx,by,bW,bH,tr); ctx.clip();
  const tGrad=ctx.createLinearGradient(bx,by,bx,by+bH); tGrad.addColorStop(0,'rgba(255,255,255,0.4)'); tGrad.addColorStop(1,'rgba(240,242,245,0.3)');
  ctx.fillStyle=tGrad; ctx.fillRect(bx,by,bW,bH); ctx.restore();
  _trr(bx,by,bW,bH,tr); ctx.strokeStyle='rgba(0,0,0,0.06)'; ctx.lineWidth=1/camZoom; ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.moveTo(bx+tr,by); ctx.lineTo(bx+bW-tr,by); ctx.quadraticCurveTo(bx+bW,by,bx+bW,by+tr);
  ctx.lineTo(bx+bW,by+tAccH); ctx.lineTo(bx,by+tAccH); ctx.lineTo(bx,by+tr); ctx.quadraticCurveTo(bx,by,bx+tr,by); ctx.closePath();
  const ag=ctx.createLinearGradient(bx,by,bx+bW,by); ag.addColorStop(0,'#3366cc'); ag.addColorStop(1,'#5588dd'); ctx.fillStyle=ag; ctx.fill(); ctx.restore();
  for (let i=0;i<linesArr.length;i++) {
    const rowY=by+tPadY+tAccH+i*(tRowH+tRowGap);
    if (i===0) { ctx.font=`800 ${(10/camZoom)}px "Segoe UI",system-ui,sans-serif`; ctx.fillStyle=linesArr[i].color; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(linesArr[i].text,bx+tPadX,rowY+tRowH/2); }
    else if (i===1) { const isErr=linesArr[i].color==='#cc0000'; const isOk=linesArr[i].color==='#1a7a1a'; const bgC=isErr?'rgba(204,0,0,0.1)':isOk?'rgba(26,122,26,0.1)':'rgba(136,136,136,0.1)';
      ctx.font=`700 ${(9/camZoom)}px "Segoe UI",system-ui,sans-serif`; const stw=ctx.measureText(linesArr[i].text).width; const sbW=stw+10/camZoom,sbH=13/camZoom,sbX=bx+tPadX,sbY=rowY+(tRowH-sbH)/2;
      _trr(sbX,sbY,sbW,sbH,3/camZoom); ctx.fillStyle=bgC; ctx.fill(); ctx.fillStyle=linesArr[i].color; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(linesArr[i].text,sbX+5/camZoom,sbY+sbH/2); }
    else { if(i%2===0){_trr(bx+3/camZoom,rowY,bW-6/camZoom,tRowH,3/camZoom);ctx.fillStyle='rgba(0,0,0,0.02)';ctx.fill();}
      ctx.font=`600 ${(12/camZoom)}px "Segoe UI",system-ui,sans-serif`; ctx.fillStyle=linesArr[i].color; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(linesArr[i].text,bx+tPadX,rowY+tRowH/2); }
  }
  renderedDataBoxes.push({ compId, boxKey, x:bx, y:by, w:bW, h:bH, defX, defY });
}

// ── Component rendering ──
// Ids whose draw threw once — skipped on later frames so a single malformed part
// can't spam the console or leak canvas save() levels every frame.
const _renderFailures = new Set();
function clearRenderFailures() { _renderFailures.clear(); }

function drawComponents() {
  for (const c of components) {
    if (_renderFailures.has(c.id)) continue;
    try {
      drawOneComponent(c, 1.0);
    } catch (err) {
      // One bad component must never blank the whole canvas. Before this guard a
      // single non-finite coordinate reached ctx.createLinearGradient(), which
      // throws, aborting drawComponents() and leaving the user with a dead canvas
      // and no way back. Skip the offender and keep drawing the rest of the circuit.
      _renderFailures.add(c.id);
      console.warn(`Component ${c.id} (${c.type}) could not be drawn and will be skipped:`, err);
      setStatus('⚠ A component could not be drawn and was skipped — see console for details.');
      // The throw may have landed between a save() and its restore(), so re-assert
      // the world transform absolutely rather than trying to unwind the stack.
      restoreWorldTransform();
    }
  }
}

function drawOneComponent(c, alpha) {
  const isSelected = selectedItem && selectedItem.kind === 'component' && selectedItem.id === c.id;
  const x1 = c.gx1 * GRID, y1 = c.gy1 * GRID;
  const x2 = c.gx2 * GRID, y2 = c.gy2 * GRID;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const halfLen = Math.hypot(x2 - x1, y2 - y1) / 2;

  const energized = simRunning && compResults[c.id] && compResults[c.id].current > 0;
  const secEnergized = simRunning && compResults[c.id] && compResults[c.id].secCurrent > 0;

  // ── 480V 3-Phase Source: 3-terminal rendering (L1, L2, L3) ──
  if (c.type === 'ac_480' && c.gx3 !== undefined) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const cr = compResults[c.id] || {};
    const srcOn = c.props.on !== false;
    const srcE = simRunning && srcOn && (cr.current || 0) > 0;
    const col = srcOn ? ((srcE && showEnergizedColors) ? '#cc3300' : '#222') : '#aaa';

    // Terminal pixel positions
    const t1x = c.gx1 * GRID, t1y = c.gy1 * GRID; // L1
    const t2x = c.gx2 * GRID, t2y = c.gy2 * GRID; // L2
    const t3x = c.gx3 * GRID, t3y = c.gy3 * GRID; // L3

    // Center from midpoint of L1/L3 so all 3 terminals are equidistant
    const cx = (t1x + t3x) / 2;
    const cy = (t1y + t3y) / 2;
    const radius = GRID / 2;

    // Selection highlight
    if (isSelected) {
      ctx.strokeStyle = '#cc8800';
      ctx.lineWidth = 1.5 / camZoom;
      ctx.setLineDash([4 / camZoom, 3 / camZoom]);
      ctx.strokeRect(cx - radius - 5/camZoom, cy - radius - 5/camZoom, (radius+5/camZoom)*2, (radius+5/camZoom)*2);
      ctx.setLineDash([]);
    }

    // Circle outline
    ctx.strokeStyle = col;
    ctx.lineWidth = 2 / camZoom;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // 3 offset sine waves inside
    const waveW = radius * 0.45;
    const waveH = radius * 0.18;
    const pts = 30;
    const phases = [0, 2 * Math.PI / 3, 4 * Math.PI / 3];
    for (let p = 0; p < 3; p++) {
      ctx.beginPath();
      for (let i = 0; i <= pts; i++) {
        const t = i / pts;
        const px = cx - waveW + t * waveW * 2;
        const py = cy - Math.sin(t * Math.PI * 2 + phases[p]) * waveH;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = col;
      ctx.globalAlpha = alpha * (p === 0 ? 1 : 0.45);
      ctx.lineWidth = (p === 0 ? 1.5 : 1) / camZoom;
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;

    // Terminal dots — directly on the circle body (no extenders)
    ctx.fillStyle = col;
    for (const [tx, ty] of [[t1x, t1y], [t2x, t2y], [t3x, t3y]]) {
      ctx.beginPath(); ctx.arc(tx, ty, 3 / camZoom, 0, Math.PI * 2); ctx.fill();
    }

    // Terminal labels inside the circle
    ctx.font = `bold ${9 / camZoom}px sans-serif`;
    ctx.fillStyle = col;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [tx, ty, lbl] of [[t1x, t1y, 'L1'], [t2x, t2y, 'L2'], [t3x, t3y, 'L3']]) {
      const ang = Math.atan2(ty - cy, tx - cx);
      ctx.fillText(lbl, cx + Math.cos(ang) * radius * 0.8, cy + Math.sin(ang) * radius * 0.8);
    }

    // Title label (match standard source style)
    if (showTitles && camZoom > 0.35) {
      ctx.font = `bold ${11 / camZoom}px Segoe UI, sans-serif`;
      ctx.fillStyle = '#333';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(c.props.label || '480V \u0394 3\u03c6 (Delta)', cx, cy - radius - 6);
    }

    // Spec text (match standard source style)
    if (showInfo && camZoom > 0.25) {
      const specFS = 10 / camZoom;
      ctx.font = `bold ${specFS}px Segoe UI, sans-serif`;
      ctx.fillStyle = '#555';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(`${c.props.voltage}V \u0394 3\u03c6`, cx, cy + radius + 6 + specFS);
    }

    // Data box — use same inline rendering as other sources
    if (showData && alpha >= 1) {
      const dv = displayValues[c.id] || { v: 0, a: 0, w: 0 };
      const lines = [];
      const statusLine = cr.shortCircuit ? { text: 'SHORT CIRCUIT!', color: '#cc0000' }
        : c.props.on === false ? { text: 'OFF', color: '#888' }
        : (dv.a || 0) > 0.001 ? { text: 'Flowing', color: '#1a7a1a' }
        : { text: 'Energized', color: '#1a7a1a' };
      lines.push({ text: `${dv.v.toFixed(1)} V`, color: '#333' });
      lines.push({ text: '\u0394 3\u03c6', color: '#555' });
      lines.push({ text: `${dv.a.toFixed(2)} Amps`, color: '#333' });
      lines.push({ text: `${dv.w.toFixed(1)} Watts`, color: '#555' });
      lines.push({ text: `${c.props.frequency || 60} Hz`, color: '#888' });

      // Match standard source data box styling exactly
      const valFS = 12 / camZoom;
      const rowH = 18 / camZoom, rowGap = 2 / camZoom;
      const boxPadX = 12 / camZoom, boxPadY = 8 / camZoom;
      const accentH = 3 / camZoom;
      const headerH = statusLine ? (20 / camZoom) : 0;
      const contentH = lines.length * (rowH + rowGap) - (lines.length > 0 ? rowGap : 0);
      const boxH = boxPadY + accentH + headerH + contentH + boxPadY;
      let maxW = 0;
      ctx.font = `600 ${valFS}px "Segoe UI", system-ui, sans-serif`;
      for (const l of lines) { const w = ctx.measureText(l.text).width; if (w > maxW) maxW = w; }
      if (statusLine) {
        ctx.font = `700 ${(10/camZoom)}px "Segoe UI", system-ui, sans-serif`;
        const sw = ctx.measureText(statusLine.text).width + 16/camZoom;
        if (sw > maxW) maxW = sw;
      }
      const boxW = Math.max(maxW + boxPadX * 2 + 8/camZoom, 70/camZoom);
      const gap = 6 / camZoom;
      const defX = cx - boxW / 2;
      const defY = cy + radius + gap + 16/camZoom;
      if (!c.dataBoxOffset) c.dataBoxOffset = { x: 0, y: 0 };
      const bx = defX + c.dataBoxOffset.x, by = defY + c.dataBoxOffset.y;
      const boxCenterX = bx + boxW / 2, boxCenterY = by + boxH / 2;

      // Tether line
      ctx.strokeStyle = 'rgba(42,122,204,0.3)';
      ctx.lineWidth = 1.5 / camZoom;
      ctx.setLineDash([4/camZoom, 4/camZoom]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(boxCenterX, boxCenterY); ctx.stroke();
      ctx.setLineDash([]);

      // Box background
      const tr = 8 / camZoom;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 12/camZoom; ctx.shadowOffsetY = 3/camZoom;
      ctx.beginPath();
      ctx.moveTo(bx+tr,by); ctx.lineTo(bx+boxW-tr,by); ctx.quadraticCurveTo(bx+boxW,by,bx+boxW,by+tr);
      ctx.lineTo(bx+boxW,by+boxH-tr); ctx.quadraticCurveTo(bx+boxW,by+boxH,bx+boxW-tr,by+boxH);
      ctx.lineTo(bx+tr,by+boxH); ctx.quadraticCurveTo(bx,by+boxH,bx,by+boxH-tr);
      ctx.lineTo(bx,by+tr); ctx.quadraticCurveTo(bx,by,bx+tr,by); ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.98)'; ctx.fill();
      ctx.restore();

      // Accent bar
      ctx.fillStyle = '#2a7acc';
      ctx.fillRect(bx, by, boxW, accentH);

      // Status pill
      let curY = by + accentH + boxPadY;
      if (statusLine) {
        ctx.font = `700 ${(10/camZoom)}px "Segoe UI", system-ui, sans-serif`;
        const stW = ctx.measureText(statusLine.text).width + 12/camZoom;
        const stH = 16/camZoom;
        const stX = bx + boxPadX;
        const stY = curY;
        const pillR = 4/camZoom;
        ctx.beginPath();
        ctx.moveTo(stX+pillR,stY); ctx.lineTo(stX+stW-pillR,stY); ctx.quadraticCurveTo(stX+stW,stY,stX+stW,stY+pillR);
        ctx.lineTo(stX+stW,stY+stH-pillR); ctx.quadraticCurveTo(stX+stW,stY+stH,stX+stW-pillR,stY+stH);
        ctx.lineTo(stX+pillR,stY+stH); ctx.quadraticCurveTo(stX,stY+stH,stX,stY+stH-pillR);
        ctx.lineTo(stX,stY+pillR); ctx.quadraticCurveTo(stX,stY,stX+pillR,stY); ctx.closePath();
        ctx.fillStyle = statusLine.color === '#1a7a1a' ? 'rgba(26,122,26,0.12)' : statusLine.color === '#cc0000' ? 'rgba(204,0,0,0.12)' : 'rgba(0,0,0,0.06)';
        ctx.fill();
        ctx.fillStyle = statusLine.color;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(statusLine.text, stX + stW/2, stY + stH/2);
        curY += stH + 4/camZoom;
      }

      // Data lines
      ctx.font = `600 ${valFS}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      for (const l of lines) {
        ctx.fillStyle = l.color;
        ctx.fillText(l.text, bx + boxPadX, curY);
        curY += rowH + rowGap;
      }

      renderedDataBoxes.push({ compId: c.id, boxKey: 'data', x: bx, y: by, w: boxW, h: boxH });
    }

    ctx.restore();
    return;
  }

  // ── 480V Wye Source: 4-terminal rendering (L1, L2, L3, N) ──
  if (c.type === 'ac_480_wye' && c.gx4 !== undefined) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const cr = compResults[c.id] || {};
    const srcOn = c.props.on !== false;
    const srcE = simRunning && srcOn && (cr.current || 0) > 0;
    const col = srcOn ? ((srcE && showEnergizedColors) ? '#cc3300' : '#222') : '#aaa';

    const t1x = c.gx1 * GRID, t1y = c.gy1 * GRID;
    const t2x = c.gx2 * GRID, t2y = c.gy2 * GRID;
    const t3x = c.gx3 * GRID, t3y = c.gy3 * GRID;
    const t4x = c.gx4 * GRID, t4y = c.gy4 * GRID;
    const cx = (t1x + t2x + t3x + t4x) / 4;
    const cy = (t1y + t2y + t3y + t4y) / 4;
    const radius = GRID / 2;

    if (isSelected) {
      ctx.strokeStyle = '#cc8800'; ctx.lineWidth = 1.5 / camZoom;
      ctx.setLineDash([4/camZoom, 3/camZoom]);
      ctx.strokeRect(cx-radius-5/camZoom, cy-radius-5/camZoom, (radius+5/camZoom)*2, (radius+5/camZoom)*2);
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = col; ctx.lineWidth = 2 / camZoom;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();

    // 3 offset sine waves
    const waveW = radius * 0.38, waveH = radius * 0.14;
    const pts = 30, phases = [0, 2*Math.PI/3, 4*Math.PI/3];
    for (let p = 0; p < 3; p++) {
      ctx.beginPath();
      for (let i = 0; i <= pts; i++) {
        const t = i / pts;
        const px = cx - waveW + t * waveW * 2;
        const py = cy - Math.sin(t * Math.PI * 2 + phases[p]) * waveH;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = col;
      ctx.globalAlpha = alpha * (p === 0 ? 1 : 0.45);
      ctx.lineWidth = (p === 0 ? 1.5 : 1) / camZoom;
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;

    ctx.font = `bold ${7 / camZoom}px sans-serif`;
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Y', cx, cy + radius * 0.5);

    ctx.fillStyle = col;
    for (const [tx, ty] of [[t1x,t1y],[t2x,t2y],[t3x,t3y],[t4x,t4y]]) {
      ctx.beginPath(); ctx.arc(tx, ty, 3 / camZoom, 0, Math.PI * 2); ctx.fill();
    }

    ctx.font = `bold ${9 / camZoom}px sans-serif`; ctx.fillStyle = col;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [tx, ty, lbl] of [[t1x,t1y,'L1'],[t2x,t2y,'L2'],[t3x,t3y,'L3'],[t4x,t4y,'N']]) {
      const ang = Math.atan2(ty - cy, tx - cx);
      ctx.fillText(lbl, cx + Math.cos(ang) * radius * 0.8, cy + Math.sin(ang) * radius * 0.8);
    }

    if (showTitles && camZoom > 0.35) {
      ctx.font = `bold ${11 / camZoom}px Segoe UI, sans-serif`; ctx.fillStyle = '#333';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(c.props.label || '480V Wye Power Source', cx, cy - radius - 6);
    }
    if (showInfo && camZoom > 0.25) {
      const specFS = 10 / camZoom;
      ctx.font = `bold ${specFS}px Segoe UI, sans-serif`; ctx.fillStyle = '#555';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('480Y/277V 3\u03c6', cx, cy + radius + 6 + specFS);
    }

    // Data box
    if (showData && alpha >= 1) {
      const dv = displayValues[c.id] || { v: 0, a: 0, w: 0 };
      const lines = [];
      const statusLine = cr.shortCircuit ? { text: 'SHORT CIRCUIT!', color: '#cc0000' }
        : c.props.on === false ? { text: 'OFF', color: '#888' }
        : (dv.a || 0) > 0.001 ? { text: 'Flowing', color: '#1a7a1a' }
        : { text: 'Energized', color: '#1a7a1a' };
      lines.push({ text: '480Y/277V', color: '#333' });
      lines.push({ text: '3\u03c6 Wye', color: '#555' });
      lines.push({ text: `${dv.a.toFixed(2)} Amps`, color: '#333' });
      lines.push({ text: `${dv.w.toFixed(1)} Watts`, color: '#555' });
      lines.push({ text: `${c.props.frequency || 60} Hz`, color: '#888' });
      const valFS = 12/camZoom, rowH = 18/camZoom, rowGap = 2/camZoom, boxPadX = 12/camZoom, boxPadY = 8/camZoom, accentH = 3/camZoom;
      const headerH = statusLine ? 20/camZoom : 0;
      const contentH = lines.length * (rowH + rowGap) - (lines.length > 0 ? rowGap : 0);
      const boxH = boxPadY + accentH + headerH + contentH + boxPadY;
      let maxW = 0;
      ctx.font = `600 ${valFS}px "Segoe UI", system-ui, sans-serif`;
      for (const l of lines) { const w = ctx.measureText(l.text).width; if (w > maxW) maxW = w; }
      if (statusLine) { ctx.font = `700 ${10/camZoom}px "Segoe UI", system-ui, sans-serif`; const sw = ctx.measureText(statusLine.text).width + 16/camZoom; if (sw > maxW) maxW = sw; }
      const boxW = Math.max(maxW + boxPadX*2 + 8/camZoom, 70/camZoom);
      const gap = 6/camZoom, defX = cx - boxW/2, defY = cy + radius + gap + 16/camZoom;
      if (!c.dataBoxOffset) c.dataBoxOffset = { x: 0, y: 0 };
      const bx = defX + c.dataBoxOffset.x, by = defY + c.dataBoxOffset.y;
      const boxCenterX = bx + boxW/2, boxCenterY = by + boxH/2;
      ctx.strokeStyle = 'rgba(42,122,204,0.3)'; ctx.lineWidth = 1.5/camZoom;
      ctx.setLineDash([4/camZoom,4/camZoom]); ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(boxCenterX,boxCenterY); ctx.stroke(); ctx.setLineDash([]);
      const tr = 8/camZoom;
      ctx.save(); ctx.shadowColor='rgba(0,0,0,0.15)'; ctx.shadowBlur=12/camZoom; ctx.shadowOffsetY=3/camZoom;
      ctx.beginPath(); ctx.moveTo(bx+tr,by); ctx.lineTo(bx+boxW-tr,by); ctx.quadraticCurveTo(bx+boxW,by,bx+boxW,by+tr);
      ctx.lineTo(bx+boxW,by+boxH-tr); ctx.quadraticCurveTo(bx+boxW,by+boxH,bx+boxW-tr,by+boxH);
      ctx.lineTo(bx+tr,by+boxH); ctx.quadraticCurveTo(bx,by+boxH,bx,by+boxH-tr);
      ctx.lineTo(bx,by+tr); ctx.quadraticCurveTo(bx,by,bx+tr,by); ctx.closePath();
      ctx.fillStyle='rgba(255,255,255,0.98)'; ctx.fill(); ctx.restore();
      ctx.fillStyle='#2a7acc'; ctx.fillRect(bx,by,boxW,accentH);
      let curY = by + accentH + boxPadY;
      if (statusLine) {
        ctx.font = `700 ${10/camZoom}px "Segoe UI", system-ui, sans-serif`;
        const stW = ctx.measureText(statusLine.text).width + 12/camZoom, stH = 16/camZoom, stX = bx + boxPadX, pillR = 4/camZoom;
        ctx.beginPath(); ctx.moveTo(stX+pillR,curY); ctx.lineTo(stX+stW-pillR,curY); ctx.quadraticCurveTo(stX+stW,curY,stX+stW,curY+pillR);
        ctx.lineTo(stX+stW,curY+stH-pillR); ctx.quadraticCurveTo(stX+stW,curY+stH,stX+stW-pillR,curY+stH);
        ctx.lineTo(stX+pillR,curY+stH); ctx.quadraticCurveTo(stX,curY+stH,stX,curY+stH-pillR);
        ctx.lineTo(stX,curY+pillR); ctx.quadraticCurveTo(stX,curY,stX+pillR,curY); ctx.closePath();
        ctx.fillStyle = statusLine.color === '#1a7a1a' ? 'rgba(26,122,26,0.12)' : statusLine.color === '#cc0000' ? 'rgba(204,0,0,0.12)' : 'rgba(0,0,0,0.06)';
        ctx.fill(); ctx.fillStyle = statusLine.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(statusLine.text, stX + stW/2, curY + stH/2); curY += stH + 4/camZoom;
      }
      ctx.font = `600 ${valFS}px "Segoe UI", system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      for (const l of lines) { ctx.fillStyle = l.color; ctx.fillText(l.text, bx + boxPadX, curY); curY += rowH + rowGap; }
      renderedDataBoxes.push({ compId: c.id, boxKey: 'data', x: bx, y: by, w: boxW, h: boxH });
    }
    ctx.restore();
    return;
  }

  // ── Compressor: 3-terminal rendering (C, R, S) ──
  if (c.type === 'compressor' && c.gx3 !== undefined) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const cr = compResults[c.id] || {};
    const compE = simRunning && (cr.current || 0) > 0;
    const col = (compE && showEnergizedColors) ? '#cc3300' : '#222';

    // Compute center from 3 terminals
    const cx = (c.gx1 + c.gx2 + c.gx3) / 3 * GRID;
    const cy = (c.gy1 + c.gy2 + c.gy3) / 3 * GRID;
    const radius = GRID * 0.7;

    // Selection highlight
    if (isSelected) {
      ctx.strokeStyle = '#cc8800';
      ctx.lineWidth = 1.5 / camZoom;
      ctx.setLineDash([4 / camZoom, 3 / camZoom]);
      ctx.strokeRect(cx - radius - 5/camZoom, cy - radius - 5/camZoom, (radius+5/camZoom)*2, (radius+5/camZoom)*2);
      ctx.setLineDash([]);
    }

    // Motor circle
    ctx.strokeStyle = col;
    ctx.lineWidth = 2 / camZoom;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // "M" label inside circle
    ctx.fillStyle = col;
    ctx.font = `bold ${14 / camZoom}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('M', cx, cy - 4/camZoom);

    // Run/Start winding indicators
    ctx.font = `${8 / camZoom}px sans-serif`;
    ctx.fillText('CSR', cx, cy + 8/camZoom);

    // Terminal lines from circle edge to terminal positions
    const t1x = c.gx1 * GRID, t1y = c.gy1 * GRID; // C
    const t2x = c.gx2 * GRID, t2y = c.gy2 * GRID; // R
    const t3x = c.gx3 * GRID, t3y = c.gy3 * GRID; // S

    ctx.strokeStyle = col;
    ctx.lineWidth = 1.8 / camZoom;
    // Draw lead lines from circle edge toward terminals
    for (const [tx, ty] of [[t1x, t1y], [t2x, t2y], [t3x, t3y]]) {
      const ang = Math.atan2(ty - cy, tx - cx);
      const ex = cx + Math.cos(ang) * radius;
      const ey = cy + Math.sin(ang) * radius;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(tx, ty); ctx.stroke();
    }

    // Terminal dots
    const dotCol = (compE && showEnergizedColors) ? '#cc3300' : '#222';
    ctx.fillStyle = dotCol;
    for (const [tx, ty] of [[t1x, t1y], [t2x, t2y], [t3x, t3y]]) {
      ctx.beginPath(); ctx.arc(tx, ty, 3 / camZoom, 0, Math.PI * 2); ctx.fill();
    }

    // Terminal labels
    ctx.font = `bold ${9 / camZoom}px sans-serif`;
    ctx.fillStyle = col;
    const labelOffset = 8 / camZoom;
    // C label (toward center from terminal)
    const cAng = Math.atan2(t1y - cy, t1x - cx);
    ctx.fillText('C', t1x + Math.cos(cAng) * labelOffset, t1y + Math.sin(cAng) * labelOffset);
    // R label
    const rAng = Math.atan2(t2y - cy, t2x - cx);
    ctx.fillText('R', t2x + Math.cos(rAng) * labelOffset, t2y + Math.sin(rAng) * labelOffset);
    // S label
    const sAng = Math.atan2(t3y - cy, t3x - cx);
    ctx.fillText('S', t3x + Math.cos(sAng) * labelOffset, t3y + Math.sin(sAng) * labelOffset);

    // Data boxes — one per terminal (C, R, S) — skip during ghost preview
    if (showData && alpha >= 1) {
      const dv = displayValues[c.id] || { v: 0, a: 0, w: 0 };
      const loadSrc = (simRunning && cr._sourceType) ? cr._sourceType : '';
      const status = (simRunning && cr._surgeFactor && cr._surgeFactor > 1.05) ? { text: 'STARTING', color: '#e67e00' }
        : (simRunning && cr.current > 0.001) ? { text: 'Running', color: '#1a7a1a' }
        : { text: 'Off', color: '#888' };

      // C terminal box — Common (total current, voltage, watts)
      const cLines = [
        { text: 'C — Common', color: '#3366cc' },
        status,
        { text: `${dv.v.toFixed(1)} V${loadSrc}`, color: '#333' },
        { text: `${dv.a.toFixed(2)} Amps`, color: '#333' },
        { text: `${dv.w.toFixed(1)} Watts`, color: '#555' },
      ];
      if (c.props.hp) cLines.push({ text: c.props.hp, color: '#2a7acc' });
      _drawTetheredBox(c, t1x, t1y, cLines, c.id, 'c', 'cDataBoxOffset');

      // R terminal box — Run winding
      const rLines = [
        { text: 'R — Run', color: '#3366cc' },
        { text: `${(cr.runCurrent || 0).toFixed(2)} Amps`, color: '#333' },
        { text: `${(cr.runWatts || 0).toFixed(1)} Watts`, color: '#555' },
      ];
      _drawTetheredBox(c, t2x, t2y, rLines, c.id, 'r', 'rDataBoxOffset');

      // S terminal box — Start winding
      const sLines = [
        { text: 'S — Start', color: '#3366cc' },
      ];
      if (cr._startCutout) {
        sLines.push({ text: 'Cutout', color: '#cc6600' });
        sLines.push({ text: '0.00 Amps', color: '#888' });
        if (cr._startBackEMFVoltage > 0) {
          sLines.push({ text: `${cr._startBackEMFVoltage.toFixed(1)} V EMF`, color: '#2a7acc' });
        }
      } else {
        sLines.push({ text: `${(cr.startCurrent || 0).toFixed(2)} Amps`, color: '#333' });
        sLines.push({ text: `${(cr.startWatts || 0).toFixed(1)} Watts`, color: '#555' });
      }
      _drawTetheredBox(c, t3x, t3y, sLines, c.id, 's', 'sDataBoxOffset');
    }
    ctx.restore();
    return; // Skip normal rendering path
  }

  // ── Transformer: special 2D rendering ──
  if (c.type === 'transformer') {
    ctx.save();
    ctx.globalAlpha = alpha;

    // Compute center and dimensions from all 4 terminals
    const allX = [c.gx1, c.gx2, c.gx3, c.gx4].map(g => g * GRID);
    const allY = [c.gy1, c.gy2, c.gy3, c.gy4].map(g => g * GRID);
    const centerX = (Math.min(...allX) + Math.max(...allX)) / 2;
    const centerY = (Math.min(...allY) + Math.max(...allY)) / 2;

    // Determine orientation from terminal layout
    // Horizontal: pri terminals share X (gx1==gx2), sec terminals share X (gx3==gx4), pri X != sec X
    // Vertical: pri terminals share Y (gy1==gy2), sec terminals share Y (gy3==gy4), pri Y != sec Y
    const isHoriz = (c.gx1 === c.gx2 && c.gx3 === c.gx4 && c.gx1 !== c.gx3);
    // W = distance between primary and secondary sides, H = distance between top/bottom terminals
    const W = isHoriz
      ? Math.abs(c.gx3 - c.gx1) * GRID
      : Math.abs(c.gy3 - c.gy1) * GRID;
    const H = isHoriz
      ? Math.abs(c.gy2 - c.gy1) * GRID
      : Math.abs(c.gx2 - c.gx1) * GRID;

    // Transform to draw in canonical horizontal form
    ctx.translate(centerX, centerY);
    if (!isHoriz) ctx.rotate(Math.PI / 2);

    const halfW = W / 2, halfH = H / 2;

    // Selection box
    if (isSelected) {
      ctx.strokeStyle = '#cc8800';
      ctx.lineWidth = 1.5 / camZoom;
      ctx.setLineDash([4 / camZoom, 3 / camZoom]);
      ctx.strokeRect(-halfW - 5, -halfH - 5, W + 10, H + 10);
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = (energized && showEnergizedColors) ? '#cc3300' : '#222';
    ctx.lineWidth = 2 / camZoom;

    // Primary coil (left side) — 3 semicircle bumps
    const priCX = -halfW + W * 0.3;
    const bumpR = H / 8;
    const numBumps = 3;
    const bumpSpacing = H / (numBumps + 1);
    // Lead wires
    ctx.beginPath(); ctx.moveTo(-halfW, -halfH); ctx.lineTo(priCX, -halfH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-halfW, halfH); ctx.lineTo(priCX, halfH); ctx.stroke();
    // Coil bumps
    for (let i = 0; i < numBumps; i++) {
      const cy = -halfH + bumpSpacing * (i + 1);
      ctx.beginPath();
      ctx.arc(priCX, cy, bumpR, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    }
    // Vertical line
    ctx.beginPath(); ctx.moveTo(priCX, -halfH); ctx.lineTo(priCX, halfH); ctx.stroke();

    // Core lines
    ctx.lineWidth = 2.5 / camZoom;
    ctx.beginPath(); ctx.moveTo(-3 / camZoom, -halfH - 2); ctx.lineTo(-3 / camZoom, halfH + 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3 / camZoom, -halfH - 2); ctx.lineTo(3 / camZoom, halfH + 2); ctx.stroke();

    // Secondary coil (right side)
    ctx.strokeStyle = (secEnergized && showEnergizedColors) ? '#cc3300' : '#222';
    ctx.lineWidth = 2 / camZoom;
    const secCX = halfW - W * 0.3;
    ctx.beginPath(); ctx.moveTo(halfW, -halfH); ctx.lineTo(secCX, -halfH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(halfW, halfH); ctx.lineTo(secCX, halfH); ctx.stroke();
    for (let i = 0; i < numBumps; i++) {
      const cy = -halfH + bumpSpacing * (i + 1);
      ctx.beginPath();
      ctx.arc(secCX, cy, bumpR, Math.PI / 2, -Math.PI / 2);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(secCX, -halfH); ctx.lineTo(secCX, halfH); ctx.stroke();

    // PRI / SEC labels with voltage, centered in the empty space on each side
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const priMidX = (-halfW + priCX) / 2;
    const secMidX = (secCX + halfW) / 2;
    // Primary
    ctx.fillStyle = (energized && showEnergizedColors) ? '#cc3300' : '#888';
    ctx.font = `bold ${13 / camZoom}px Segoe UI, sans-serif`;
    ctx.fillText('PRI', priMidX, -5 / camZoom);
    ctx.font = `${11 / camZoom}px Segoe UI, sans-serif`;
    ctx.fillText(`${c.props.primaryVoltage}V`, priMidX, 7 / camZoom);
    // Secondary
    ctx.fillStyle = (secEnergized && showEnergizedColors) ? '#cc3300' : '#888';
    ctx.font = `bold ${13 / camZoom}px Segoe UI, sans-serif`;
    ctx.fillText('SEC', secMidX, -5 / camZoom);
    ctx.font = `${11 / camZoom}px Segoe UI, sans-serif`;
    ctx.fillText(`${c.props.secondaryVoltage}V`, secMidX, 7 / camZoom);
    ctx.textBaseline = 'alphabetic';

    ctx.restore();

    // Terminal dots (all 4) with labels — in world space
    ctx.save();
    ctx.globalAlpha = alpha;
    const priE = energized;
    const secE = secEnergized;
    for (const [gx, gy, e] of [[c.gx1, c.gy1, priE], [c.gx2, c.gy2, priE], [c.gx3, c.gy3, secE], [c.gx4, c.gy4, secE]]) {
      ctx.fillStyle = e ? '#cc3300' : '#222';
      ctx.beginPath();
      ctx.arc(gx * GRID, gy * GRID, 3 / camZoom, 0, Math.PI * 2);
      ctx.fill();
    }

    // Terminal labels: inner = between terminal dot and its partner on the same side
    // L1 label offsets toward N (its pair), N toward L1, R toward C, C toward R
    ctx.font = `bold ${9 / camZoom}px Segoe UI, sans-serif`;
    ctx.textBaseline = 'middle';
    const lo = 10 / camZoom;
    function innerLabel(gx, gy, pairGx, pairGy, text, color) {
      const tx = gx * GRID, ty = gy * GRID;
      // Direction from this terminal toward its pair terminal
      const dx = pairGx * GRID - tx, dy = pairGy * GRID - ty;
      const len = Math.hypot(dx, dy) || 1;
      // Offset inward (toward pair) and slightly toward center
      const ox = (dx / len) * lo;
      const oy = (dy / len) * lo;
      ctx.fillStyle = color;
      // Align text based on horizontal offset direction
      if (Math.abs(ox) > 2) {
        ctx.textAlign = ox > 0 ? 'left' : 'right';
      } else {
        ctx.textAlign = 'center';
      }
      ctx.fillText(text, tx + ox, ty + oy);
    }
    const priColor = (energized && showEnergizedColors) ? '#cc3300' : '#444';
    const secColor = (secEnergized && showEnergizedColors) ? '#cc3300' : '#444';
    // N → toward L1, L1 → toward N, R → toward C, C → toward R
    innerLabel(c.gx1, c.gy1, c.gx2, c.gy2, 'L1', priColor);
    innerLabel(c.gx2, c.gy2, c.gx1, c.gy1, 'N', priColor);
    innerLabel(c.gx3, c.gy3, c.gx4, c.gy4, 'R', secColor);
    innerLabel(c.gx4, c.gy4, c.gx3, c.gy3, 'C', secColor);
    ctx.textBaseline = 'alphabetic';

    // Label — above the component
    const tMinY = Math.min(c.gy1, c.gy2, c.gy3, c.gy4) * GRID;
    if (showTitles) {
      const label = c.props.label;
      ctx.font = `bold ${11 / camZoom}px Segoe UI, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#222';
      ctx.fillText(label, centerX, tMinY - 14 / camZoom);
    }
    ctx.restore();

    // Data box for transformer — skipped for placement ghosts (alpha < 1)
    if (showData && alpha >= 1) {
      const cr = compResults[c.id] || {};
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${12 / camZoom}px Segoe UI, sans-serif`;
      const dv = displayValues[c.id] || { v: 0, a: 0, w: 0, sv: 0, sa: 0, sw: 0 };
      // Primary side: outer edge of primary terminals
      const priX = Math.min(c.gx1, c.gx2) * GRID;
      const priCenterY = (c.gy1 + c.gy2) / 2 * GRID;
      // Secondary side: outer edge of secondary terminals
      const secX = Math.max(c.gx3, c.gx4) * GRID;
      const secCenterY = (c.gy3 + c.gy4) / 2 * GRID;

      function drawTetheredBox(anchorX, anchorY, linesArr, compId, boxKey, offsetProp) {
        _drawTetheredBox(c, anchorX, anchorY, linesArr, compId, boxKey, offsetProp);
      }

      // Primary data box (left of primary terminals)
      const priEnergized = (dv.v || 0) > 0.5;
      drawTetheredBox(priX, priCenterY, [
        { text: 'PRI', color: '#3366cc' },
        { text: priEnergized ? 'Receiving' : 'No Power', color: priEnergized ? '#1a7a1a' : '#888' },
        { text: `${(dv.v).toFixed(1)} V`, color: '#333' },
        { text: `${(dv.a).toFixed(2)} A`, color: '#333' },
        { text: `${(dv.w).toFixed(1)} W`, color: '#555' },
      ], c.id, 'pri', 'priDataBoxOffset');

      // Secondary data box (right of secondary terminals)
      const secEnergized = (dv.sv || 0) > 0.5;
      const dcBlocked = cr._dcBlocked;
      const secLines = [
        { text: 'SEC', color: '#3366cc' },
      ];
      if (dcBlocked) {
        secLines.push({ text: 'DC BLOCKED', color: '#cc0000' });
        secLines.push({ text: '0.0 V', color: '#888' });
        secLines.push({ text: 'No AC = No Induction', color: '#cc6600' });
      } else {
        secLines.push({ text: secEnergized ? 'Energized' : 'No Power', color: secEnergized ? '#1a7a1a' : '#888' });
        secLines.push({ text: `${(dv.sv).toFixed(1)} V`, color: '#333' });
        secLines.push({ text: `${(dv.sa).toFixed(2)} A`, color: '#333' });
        secLines.push({ text: `${(dv.sw).toFixed(1)} W`, color: '#555' });
      }
      drawTetheredBox(secX, secCenterY, secLines, c.id, 'sec', 'secDataBoxOffset');
      ctx.restore();
    }

    return; // Skip normal rendering path
  }

  // ── Ground symbols: single-terminal, virtual bus at gx2/gy2 ──
  if (c.type === 'earth_ground') {
    const tx = c.gx1 * GRID, ty = c.gy1 * GRID;
    ctx.save();
    ctx.globalAlpha = alpha;

    // Selection box around visible symbol area
    if (isSelected) {
      ctx.strokeStyle = '#cc8800';
      ctx.lineWidth = 1.5 / camZoom;
      ctx.setLineDash([4 / camZoom, 3 / camZoom]);
      ctx.strokeRect(tx - 18 / camZoom, ty - 6 / camZoom, 36 / camZoom, 30 / camZoom);
      ctx.setLineDash([]);
    }

    ctx.translate(tx, ty);
    drawSchematicSymbol(c, 0, energized);

    // Terminal dot at connection point
    const dotCol = (energized && showEnergizedColors) ? '#cc3300' : '#222';
    ctx.fillStyle = dotCol;
    ctx.beginPath();
    ctx.arc(0, 0, 3 / camZoom, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Label — right of symbol
    if (showTitles && camZoom >= 0.35) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${11 / camZoom}px Segoe UI, sans-serif`;
      ctx.fillStyle = '#333';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.props.label, tx + 18 / camZoom, ty + 14 / camZoom);
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }

    // Ground fault warning
    if (showFaults && simRunning && compResults[c.id] && compResults[c.id]._groundFault) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${10 / camZoom}px Segoe UI, sans-serif`;
      ctx.fillStyle = '#cc0000';
      ctx.textAlign = 'center';
      ctx.fillText('GROUND FAULT', tx, ty + 35 / camZoom);
      const _fc = compResults[c.id]._faultCurrent || 0, _fv = compResults[c.id]._faultVoltage || 0;
      ctx.fillText(_fc > 0.01 ? _fc.toFixed(2) + ' A fault current' : _fv.toFixed(1) + ' V to Ground', tx, ty + 48 / camZoom);
      ctx.restore();
    }

    return; // Skip normal rendering path
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(mx, my);
  ctx.rotate(angle);

  // Selection box
  if (isSelected) {
    ctx.strokeStyle = '#cc8800';
    ctx.lineWidth = 1.5 / camZoom;
    ctx.setLineDash([4 / camZoom, 3 / camZoom]);
    ctx.strokeRect(-halfLen - 2, -18, halfLen * 2 + 4, 36);
    ctx.setLineDash([]);
  }

  drawSchematicSymbol(c, halfLen, energized);

  // Terminal dots at wire connection points (= body edge for size=1 components)
  {
    const col = (energized && showEnergizedColors) ? '#cc3300' : '#222';
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(-halfLen, 0, 3 / camZoom, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( halfLen, 0, 3 / camZoom, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha;

  // Label — hide when zoomed out too far to prevent overlap
  const bodyH = (isACSource(c.type) || c.type === 'dc_source' || c.type === 'bulb' || c.type === 'fan') ? GRID / 2
              : (c.type === 'switch' || c.type === 'time_delay' || c.type === 'contactor_contact' || c.type === 'relay_contact') ? halfLen * 0.6
              : 12;
  const labelOff = bodyH + 4;

  const isVertical = Math.abs(c.gx1 - c.gx2) === 0;

  if (camZoom >= 0.35) {
    const labelFS = 11 / camZoom;
    const specFS = 10 / camZoom;

    if (showTitles) {
      ctx.fillStyle = '#333';
      ctx.font = `bold ${labelFS}px Segoe UI, sans-serif`;
      let label = c.props.label;
      if (c.type === 'breaker' && c.props.tripped) label += ' (Tripped)';
      if (isVertical) {
        ctx.textAlign = 'left';
        ctx.fillText(label, mx + labelOff + 4, my + 4);
      } else {
        ctx.textAlign = 'center';
        ctx.fillText(label, mx, my - labelOff - 2);
      }
    }

    if (showInfo) {
      let specText = '';
      if (c.type === 'ac_480') specText = `${c.props.voltage}V \u0394 3\u03c6`;
      else if (c.type === 'ac_source' || c.type === 'ac_120' || c.type === 'ac_240') specText = `${c.props.voltage}V 1\u03c6`;
      else if (c.type === 'dc_source') specText = `${c.props.voltage}V DC`;
      else if (c.type === 'resistor') specText = `${c.props.resistance}\u03A9`;
      else if (c.type === 'bulb') specText = `${c.props.wattRating}W`;
      else if (c.type === 'fan') specText = `${(simRunning && compResults[c.id] && compResults[c.id].watts != null) ? compResults[c.id].watts.toFixed(1) : c.props.wattRating}W`;
      else if (c.type === 'capacitor') specText = simRunning
        ? `Xc ${(c.props.resistance || 0).toFixed(1)}\u03A9`
        : `${c.props.capacitance}\u00B5F`;
      else if (c.type === 'outlet') specText = simRunning
        ? ((compResults[c.id] && compResults[c.id].voltageDrop > 0.5) ? `${(compResults[c.id].voltageDrop).toFixed(0)}V` : 'No Pwr')
        : (c.props.wattage > 0 ? `${c.props.wattage}W` : 'Empty');
      else if (c.type === 'fuse' || c.type === 'lv_fuse' || c.type === 'td_fuse') specText = `${c.props.ratedAmps}A`;
      else if (c.type === 'breaker' && !c.props.tripped) specText = `${c.props.ratedAmps}A`;
      else if (c.type === 'time_delay' && !c.props.closed && !c.props._counting) specText = `${c.props.delaySeconds}s`;
      else if (c.type === 'contactor_coil') specText = `${c.props.coilVoltage}V  Grp:${c.props.contactorGroup}`;
      else if (c.type === 'contactor_contact') specText = c.props.contactClosed ? `(Closed) Grp:${c.props.contactorGroup}` : `(Open) Grp:${c.props.contactorGroup}`;
      else if (c.type === 'relay_coil') specText = `${c.props.coilVoltage}V  Grp:${c.props.relayGroup}`;
      else if (c.type === 'relay_contact') specText = `${c.props.contactMode} ${c.props.contactClosed ? '(Closed)' : '(Open)'} Grp:${c.props.relayGroup}`;

      if (specText) {
        ctx.font = `bold ${specFS}px Segoe UI, sans-serif`;
        ctx.fillStyle = '#555';
        if (isVertical) {
          ctx.textAlign = 'left';
          ctx.fillText(specText, mx + labelOff + 4, my + 4 + labelFS + 2);
        } else {
          ctx.textAlign = 'center';
          ctx.fillText(specText, mx, my + labelOff + specFS + 2);
        }
      }
    }

    // ── Fault indicator text ──
    const fm = c.props && c.props.faultMode;
    if (showFaults && fm && fm !== 'none') {
      const faultLabel = fm === 'short' ? '(Short Circuit)' : '(Open Circuit)';
      ctx.save();
      ctx.font = `bold ${10 / camZoom}px Segoe UI, sans-serif`;
      ctx.fillStyle = fm === 'short' ? '#e67e00' : '#cc0000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(faultLabel, mx, my + labelOff + specFS + 16 / camZoom);
      ctx.restore();
    }
  }

  // alpha < 1 means this is a placement ghost (id -1/-2) — no data box for it, and
  // nothing pushed to renderedDataBoxes, which is the drag/hit-test list.
  if (showData && alpha >= 1) {
    const cr = compResults[c.id] || {};
    ctx.font = `bold ${12 / camZoom}px Segoe UI, sans-serif`;
    const gap = 12;
    const lines = [];

    const dv = displayValues[c.id] || { v: 0, a: 0, w: 0, r: 0 };

    if (isACSource(c.type) || c.type === 'dc_source') {
      const srcLabel = c.type === 'dc_source' ? 'DC' : (c.type === 'ac_480' ? '\u0394 3\u03c6' : '1\u03c6');
      if (cr.shortCircuit) {
        lines.push({ text: `SHORT CIRCUIT!`, color: '#cc0000', st: true });
        lines.push({ text: `${dv.v.toFixed(1)} V`, color: '#cc0000' });
        lines.push({ text: srcLabel, color: '#cc0000' });
        lines.push({ text: `\u221E A (unlimited)`, color: '#cc0000' });
      } else {
        if (c.props.on === false) {
          lines.push({ text: 'OFF', color: '#888', st: true });
        } else if ((dv.a || 0) > 0.001) {
          lines.push({ text: 'Flowing', color: '#1a7a1a', st: true });
        } else {
          lines.push({ text: 'Energized', color: '#1a7a1a', st: true });
        }
        lines.push({ text: `${dv.v.toFixed(1)} V`, color: '#333' });
        lines.push({ text: srcLabel, color: '#555' });
        lines.push({ text: `${dv.a.toFixed(2)} Amps`, color: '#333' });
        lines.push({ text: `${dv.w.toFixed(1)} Watts`, color: '#555' });
      }
      if (isACSource(c.type)) lines.push({ text: `${c.props.frequency || 60} Hz`, color: '#888' });
    } else if (c.type === 'switch' || c.type === 'time_delay' || c.type === 'contactor_contact' || c.type === 'relay_contact') {
      // No data display for switches / time delays / contactor contacts / relay contacts
    } else if ((c.type === 'fuse' || c.type === 'lv_fuse' || c.type === 'td_fuse')) {
      if (c.props.blown) lines.push({ text: 'BLOWN', color: '#cc0000', st: true });
      lines.push({ text: `${dv.a.toFixed(2)} Amps`, color: '#333' });
      if (simRunning && cr._sourceType) lines.push({ text: cr._sourceType, color: '#2a7acc' });
    } else if (c.type === 'breaker') {
      if (c.props.tripped) lines.push({ text: 'TRIPPED', color: '#cc0000', st: true });
      lines.push({ text: `${dv.a.toFixed(2)} Amps`, color: '#333' });
    } else if (c.type === 'capacitor') {
      if (!simRunning) {
        // ── Sim OFF: what a capacitance meter reads ──
        if (c.props.faultMode === 'open') {
          lines.push({ text: 'OPEN', color: '#cc0000', st: true });
          lines.push({ text: 'Reads: OL', color: '#888' });
        } else if (c.props.faultMode === 'short') {
          lines.push({ text: 'SHORT', color: '#cc0000', st: true });
          lines.push({ text: 'Reads: 0 \u00B5F', color: '#888' });
        } else {
          lines.push({ text: `${c.props.capacitance} \u00B5F`, color: '#2a7acc' });
          lines.push({ text: `Xc ${(c.props.resistance || 0).toFixed(1)} \u03A9`, color: '#888' });
        }
      } else {
        // ── Sim ON: live circuit readings ──
        const capSrc = cr._sourceType || '';
        if (capSrc === 'DC') {
          lines.push({ text: 'DC Blocked', color: '#cc6600', st: true });
          lines.push({ text: 'Open Circuit', color: '#888' });
        } else if (energized) {
          lines.push({ text: 'Charging', color: '#1a7a1a', st: true });
        }
        lines.push({ text: `${dv.v.toFixed(1)} V${capSrc ? ' '+capSrc : ''}`, color: '#333' });
        lines.push({ text: `${dv.a.toFixed(2)} Amps`, color: '#333' });
        lines.push({ text: `${dv.w.toFixed(1)} Watts`, color: '#555' });
        lines.push({ text: `Xc ${(c.props.resistance || 0).toFixed(1)} \u03A9`, color: '#2a7acc' });
      }
    } else if (c.type === 'outlet') {
      const outFault = c.props.faultMode;
      if (!simRunning) {
        if (outFault === 'open') {
          lines.push({ text: 'OPEN', color: '#cc0000', st: true });
        } else if (outFault === 'short') {
          lines.push({ text: 'SHORT', color: '#e67e00', st: true });
        } else if (c.props.wattage > 0) {
          lines.push({ text: `${c.props.wattage}W load`, color: '#555' });
        } else {
          lines.push({ text: 'EMPTY', color: '#888', st: true });
        }
      } else {
        if (outFault === 'open') {
          lines.push({ text: 'OPEN', color: '#cc0000', st: true });
        } else if (outFault === 'short') {
          lines.push({ text: 'SHORT', color: '#e67e00', st: true });
        } else {
          const outV = dv.v || 0;
          if (outV > 0.5) {
            const outSrc = cr._sourceType ? ' ' + cr._sourceType : '';
            lines.push({ text: 'Live', color: '#1a7a1a', st: true });
            lines.push({ text: `${outV.toFixed(1)} V${outSrc}`, color: '#333' });
            if (c.props.wattage > 0) {
              lines.push({ text: `${dv.a.toFixed(2)} Amps`, color: '#333' });
              lines.push({ text: `${dv.w.toFixed(1)} Watts`, color: '#555' });
            }
          } else {
            lines.push({ text: 'No Power', color: '#888', st: true });
          }
        }
      }
    } else {
      // Per-component source type from solver (AC, DC, or AC/DC per net)
      const loadSrc = (simRunning && cr._sourceType) ? cr._sourceType : '';
      if (simRunning && cr.current > 0.001 && (c.type === 'fan' || c.type === 'contactor_coil' || c.type === 'relay_coil')) {
        if (cr._surgeFactor && cr._surgeFactor > 1.05) {
          lines.push({ text: 'STARTING', color: '#e67e00', st: true });
        } else {
          lines.push({ text: 'Running', color: '#1a7a1a', st: true });
        }
      }
      lines.push({ text: `${dv.v.toFixed(1)} V${loadSrc}`, color: '#333' });
      lines.push({ text: `${dv.a.toFixed(2)} Amps`, color: '#333' });
      lines.push({ text: `${dv.w.toFixed(1)} Watts`, color: '#555' });
      if (c.type === 'fan' && c.props.hp) lines.push({ text: c.props.hp, color: '#2a7acc' });
    }

    if (lines.length === 0) { /* skip box */ }
    else {
    // ── Premium data box ──
    const rowH = 18 / camZoom;
    const valFS = 12 / camZoom;
    const boxPadX = 12 / camZoom;
    const boxPadY = 8 / camZoom;
    const rowGap = 2 / camZoom;
    // Status lines are tagged at the push site (st: true) rather than matched by
    // text — the old string list silently missed 'Running', 'STARTING', 'Charging'
    // and 'DC Blocked', and never matched 'TRIPPED' because it was not lines[0].
    const statusLine = (lines.length > 0 && lines[0].st) ? lines.shift() : null;
    const headerH = statusLine ? (20 / camZoom) : 0;
    const accentH = 3 / camZoom;
    const contentH = lines.length * (rowH + rowGap) - (lines.length > 0 ? rowGap : 0);
    const boxH = boxPadY + accentH + headerH + contentH + boxPadY;

    // Measure widths
    let maxW = 0;
    ctx.font = `600 ${valFS}px "Segoe UI", system-ui, sans-serif`;
    for (const l of lines) { const w = ctx.measureText(l.text).width; if (w > maxW) maxW = w; }
    if (statusLine) {
      ctx.font = `700 ${(10/camZoom)}px "Segoe UI", system-ui, sans-serif`;
      const sw = ctx.measureText(statusLine.text).width + 16/camZoom;
      if (sw > maxW) maxW = sw;
    }
    const boxW = Math.max(maxW + boxPadX * 2 + 8/camZoom, 70/camZoom);

    // Default position
    let defX, defY;
    if (isVertical) {
      defX = mx + labelOff + gap;
      defY = my - boxH / 2;
    } else {
      defX = mx - boxW / 2;
      defY = my + labelOff + gap;
    }

    if (!c.dataBoxOffset) c.dataBoxOffset = { x: 0, y: 0 };
    const bx = defX + c.dataBoxOffset.x;
    const by = defY + c.dataBoxOffset.y;

    // Tether line
    const boxCenterX = bx + boxW / 2, boxCenterY = by + boxH / 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(42,122,204,0.2)';
    ctx.lineWidth = 1 / camZoom;
    ctx.setLineDash([3 / camZoom, 3 / camZoom]);
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(boxCenterX, boxCenterY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Rounded rect helper
    const r = 8 / camZoom;
    function drawRR(x, y, w, h, rad) {
      ctx.beginPath();
      ctx.moveTo(x + rad, y); ctx.lineTo(x + w - rad, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
      ctx.lineTo(x + w, y + h - rad);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
      ctx.lineTo(x + rad, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
      ctx.lineTo(x, y + rad);
      ctx.quadraticCurveTo(x, y, x + rad, y);
      ctx.closePath();
    }

    // Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 12 / camZoom;
    ctx.shadowOffsetY = 3 / camZoom;
    drawRR(bx, by, boxW, boxH, r);
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.fill();
    ctx.restore();

    // Subtle gradient overlay
    ctx.save();
    drawRR(bx, by, boxW, boxH, r);
    ctx.clip();
    const grad = ctx.createLinearGradient(bx, by, bx, by + boxH);
    grad.addColorStop(0, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(240,242,245,0.3)');
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.restore();

    // Border
    drawRR(bx, by, boxW, boxH, r);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1 / camZoom;
    ctx.stroke();

    // Top accent bar
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bx + r, by); ctx.lineTo(bx + boxW - r, by);
    ctx.quadraticCurveTo(bx + boxW, by, bx + boxW, by + r);
    ctx.lineTo(bx + boxW, by + accentH);
    ctx.lineTo(bx, by + accentH);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();
    const accentGrad = ctx.createLinearGradient(bx, by, bx + boxW, by);
    accentGrad.addColorStop(0, '#2a7acc');
    accentGrad.addColorStop(1, '#4fa3e0');
    ctx.fillStyle = accentGrad;
    ctx.fill();
    ctx.restore();

    let curY = by + boxPadY + accentH;

    // Status badge
    if (statusLine) {
      const isError = statusLine.color === '#cc0000';
      const isOk = statusLine.color === '#1a7a1a';
      const badgeColor = isError ? 'rgba(204,0,0,0.1)' : isOk ? 'rgba(26,122,26,0.1)' : 'rgba(136,136,136,0.1)';
      const textColor = statusLine.color;
      ctx.font = `700 ${(9/camZoom)}px "Segoe UI", system-ui, sans-serif`;
      const tw = ctx.measureText(statusLine.text).width;
      const badgeW = tw + 12/camZoom;
      const badgeH = 14/camZoom;
      const badgeX = bx + boxW/2 - badgeW/2;
      const badgeY = curY;
      const br = 3/camZoom;
      drawRR(badgeX, badgeY, badgeW, badgeH, br);
      ctx.fillStyle = badgeColor;
      ctx.fill();
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(statusLine.text, bx + boxW/2, badgeY + badgeH/2);
      curY += headerH;
    }

    // Data rows
    for (let i = 0; i < lines.length; i++) {
      const rowY = curY + i * (rowH + rowGap);
      // Alternating row bg
      if (i % 2 === 0) {
        drawRR(bx + 3/camZoom, rowY, boxW - 6/camZoom, rowH, 3/camZoom);
        ctx.fillStyle = 'rgba(0,0,0,0.02)';
        ctx.fill();
      }
      // Value
      ctx.font = `600 ${valFS}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillStyle = lines[i].color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(lines[i].text, bx + boxPadX, rowY + rowH/2);
    }

    // Register for hit testing
    renderedDataBoxes.push({ compId: c.id, boxKey: 'main', x: bx, y: by, w: boxW, h: boxH, defX, defY });
    } // end if lines.length > 0
  }
  ctx.restore();
}

