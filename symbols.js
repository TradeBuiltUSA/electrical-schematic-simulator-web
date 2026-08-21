// ── Proper IEEE/ANSI Schematic Symbols ──
function drawSchematicSymbol(c, halfLen, energized) {
  const lw = 2 / camZoom;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = (energized && showEnergizedColors) ? '#cc3300' : '#222';
  ctx.fillStyle = (energized && showEnergizedColors) ? '#cc3300' : '#222';

  // Body fills to terminal (size=1 components span exactly GRID/2 each side)
  const bodyHalf = Math.min(halfLen, GRID / 2);


  switch (c.type) {

    // ── AC Voltage Source: circle with sine wave, same size as bulb ──
    case 'ac_source':
    case 'ac_120':
    case 'ac_240': {
      const r = Math.min(halfLen, GRID / 2);
      const isOverloaded = simRunning && compResults[c.id] && compResults[c.id].overload;

      if (isOverloaded) {
        // Draw fire icon when overloaded
        const flicker = Math.sin(animTime * 12) * 0.08 + 1;
        const s = r * 0.9 * flicker;
        ctx.save();
        // Outer flame (orange-red)
        ctx.fillStyle = '#e63900';
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.bezierCurveTo(s * 0.4, -s * 0.7, s * 0.9, -s * 0.2, s * 0.7, s * 0.3);
        ctx.bezierCurveTo(s * 0.6, s * 0.6, s * 0.35, s * 0.85, 0, s);
        ctx.bezierCurveTo(-s * 0.35, s * 0.85, -s * 0.6, s * 0.6, -s * 0.7, s * 0.3);
        ctx.bezierCurveTo(-s * 0.9, -s * 0.2, -s * 0.4, -s * 0.7, 0, -s);
        ctx.fill();
        // Inner flame (yellow-orange)
        ctx.fillStyle = '#ff9900';
        const si = s * 0.55;
        ctx.beginPath();
        ctx.moveTo(0, -si * 0.5);
        ctx.bezierCurveTo(si * 0.35, -si * 0.3, si * 0.6, si * 0.1, si * 0.45, si * 0.5);
        ctx.bezierCurveTo(si * 0.3, si * 0.8, si * 0.15, si * 0.95, 0, si);
        ctx.bezierCurveTo(-si * 0.15, si * 0.95, -si * 0.3, si * 0.8, -si * 0.45, si * 0.5);
        ctx.bezierCurveTo(-si * 0.6, si * 0.1, -si * 0.35, -si * 0.3, 0, -si * 0.5);
        ctx.fill();
        // Inner core (bright yellow)
        ctx.fillStyle = '#ffdd00';
        const sc = s * 0.25;
        ctx.beginPath();
        ctx.moveTo(0, sc * 0.2);
        ctx.bezierCurveTo(sc * 0.4, sc * 0.5, sc * 0.3, sc * 0.9, 0, sc * 1.1);
        ctx.bezierCurveTo(-sc * 0.3, sc * 0.9, -sc * 0.4, sc * 0.5, 0, sc * 0.2);
        ctx.fill();
        ctx.restore();
      } else {
        const isOn = c.props.on !== false;

        // Circle outline (dim when off)
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = isOn ? (energized && showEnergizedColors ? '#cc3300' : '#222') : '#aaa';
        ctx.stroke();

        // Sine wave inside (dim when off)
        ctx.beginPath();
        const pts = 40;
        const waveW = r * 0.55;
        const waveH = r * 0.35;
        for (let i = 0; i <= pts; i++) {
          const t = i / pts;
          const px = -waveW + t * waveW * 2;
          const py = -Math.sin(t * Math.PI * 2) * waveH;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = isOn ? (energized && showEnergizedColors ? '#cc3300' : '#222') : '#bbb';
        ctx.stroke();
      }

      // Terminal labels — L1/N for 120V, L1/L2 for 240V
      const _lbl1 = (c.type === 'ac_240') ? 'L1' : 'L1';
      const _lbl2 = (c.type === 'ac_240') ? 'L2' : 'N';
      ctx.save();
      const _labelAngle = Math.atan2(c.gy2 - c.gy1, c.gx2 - c.gx1);
      const _flipped = Math.cos(_labelAngle) < 0;
      if (_flipped) ctx.rotate(Math.PI);
      ctx.font = `bold ${9 / camZoom}px Segoe UI, sans-serif`;
      ctx.fillStyle = isOverloaded ? '#cc0000' : ((energized && showEnergizedColors) ? '#cc3300' : '#222');
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      if (_flipped) {
        ctx.fillText(_lbl1, r * 0.8, 0);
        ctx.fillText(_lbl2, -r * 0.8, 0);
      } else {
        ctx.fillText(_lbl1, -r * 0.8, 0);
        ctx.fillText(_lbl2, r * 0.8, 0);
      }
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
      break;
    }

    // ac_480 is rendered entirely in components.js (3-terminal custom block)
    // No symbols.js case needed — it uses the custom renderer

    // ── DC Battery: alternating long/short parallel lines ──
    case 'dc_source': {
      const r = Math.min(halfLen, GRID / 2);
      const isOn = c.props.on !== false;
      const ec = isOn ? ((energized && showEnergizedColors) ? '#cc3300' : '#222') : '#aaa';
      ctx.strokeStyle = ec;

      // Battery cell lines (long = +, short = -)
      const gap = r * 0.22;
      const longH = r * 0.7;
      const shortH = r * 0.4;
      const cells = 3;

      for (let i = 0; i < cells; i++) {
        const x = -gap * (cells - 1) + i * gap * 2;
        // Long line (positive plate)
        ctx.lineWidth = 1.5 / camZoom;
        ctx.beginPath(); ctx.moveTo(x - gap * 0.5, -longH); ctx.lineTo(x - gap * 0.5, longH); ctx.stroke();
        // Short line (negative plate)
        ctx.lineWidth = 3 / camZoom;
        ctx.beginPath(); ctx.moveTo(x + gap * 0.5, -shortH); ctx.lineTo(x + gap * 0.5, shortH); ctx.stroke();
      }

      ctx.lineWidth = lw;

      // + / - terminal labels — always follow terminal positions (no flip compensation)
      ctx.save();
      ctx.font = `bold ${12 / camZoom}px Segoe UI, sans-serif`;
      ctx.fillStyle = ec;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // + is always at gx1 terminal (-halfLen side), − at gx2 terminal (+halfLen side)
      ctx.fillText('+', -r * 0.75, 0);
      ctx.fillText('\u2212', r * 0.75, 0);
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
      break;
    }

    // ── Resistor: color-band rectangle ──
    case 'resistor': {
      const rbHalf = bodyHalf;
      const rw = rbHalf * 2;
      const rh = 8;

      // ── Color band helper ──
      const BAND_COLORS = ['#1a1a1a','#8B4513','#e00000','#FF8C00','#FFD700','#228B22','#1a1aff','#9400D3','#808080','#f0f0f0'];
      function resistorBands(R) {
        if (!R || R <= 0) return ['#1a1a1a','#1a1a1a','#1a1a1a','#c8a000'];
        let exp = Math.floor(Math.log10(R)) - 1;
        let mantissa = Math.round(R / Math.pow(10, exp));
        if (mantissa >= 100) { mantissa = Math.round(mantissa / 10); exp++; }
        if (mantissa < 10)  { mantissa = Math.round(mantissa * 10); exp--; }
        const d1 = Math.floor(mantissa / 10);
        const d2 = mantissa % 10;
        const multMap = { '-2':'#C0C0C0','-1':'#c8a000','0':'#1a1a1a','1':'#8B4513','2':'#e00000',
                          '3':'#FF8C00','4':'#FFD700','5':'#228B22','6':'#1a1aff','7':'#9400D3' };
        const b3 = multMap[String(exp)] || '#1a1a1a';
        return [BAND_COLORS[d1], BAND_COLORS[d2], b3, '#c8a000']; // gold tolerance
      }

      const bands = resistorBands(c.props.resistance);

      // Body fill — classic beige
      ctx.fillStyle = '#e8d49a';
      ctx.fillRect(-rbHalf, -rh, rw, rh * 2);

      // Color bands — 4 stripes inside the body
      const bw = rw * 0.09; // band width
      const positions = [-0.55, -0.28, -0.02, 0.35]; // as fraction of rbHalf (left side offset)
      bands.forEach((color, i) => {
        const bx = positions[i] * rbHalf;
        ctx.fillStyle = color;
        ctx.fillRect(bx - bw / 2, -rh, bw, rh * 2);
      });

      // Outline
      ctx.strokeRect(-rbHalf, -rh, rw, rh * 2);
      break;
    }

    // ── Light Bulb: circle sized to terminal points ──
    case 'bulb': {
      const r = Math.min(halfLen, GRID / 2);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

      // X inside the circle
      const d = r * 0.55;
      ctx.beginPath();
      ctx.moveTo(-d, -d); ctx.lineTo(d, d);
      ctx.moveTo(d, -d); ctx.lineTo(-d, d);
      ctx.stroke();

      // Glow — fades in when powered, smoothly dies out when power cut
      {
        const cr = compResults[c.id];
        const rated = c.props.wattRating || 100;
        const actual = (energized && cr) ? cr.watts : 0;
        const powerRatio = Math.min(actual / rated, 1.5);
        const maxGlow = 0.08 + Math.min(powerRatio, 1.5) * 0.35;
        const targetGlow = energized ? maxGlow : 0;
        if (!bulbState[c.id]) bulbState[c.id] = { glow: 0, size: 1.0 };
        const bs = bulbState[c.id];
        const fullSize = 1.05 + powerRatio * 0.3;
        if (energized) {
          bs.glow += (targetGlow - bs.glow) * Math.min(renderDt * 8, 1);
          bs.size += (fullSize   - bs.size)  * Math.min(renderDt * 8, 1);
        } else {
          // Glow contracts inward and dims slowly — like a filament cooling
          bs.glow *= Math.pow(0.55, renderDt); // ~1s half-life, ~6s to dark
          // Size shrinks toward 1.0 (bulb edge) as glow dies
          const glowFrac = bs.glow / Math.max(maxGlow, 0.001);
          bs.size = 1.0 + glowFrac * (fullSize - 1.0);
        }
        if (bs.glow > 0.002) {
          const pulse = 0.92 + 0.08 * Math.sin(animTime * 3);
          const glowAlpha = bs.glow * pulse;
          ctx.save();
          ctx.globalAlpha = glowAlpha;
          const bulbColors = { yellow: '#FFD700', red: '#ff0000', blue: '#0099ff', orange: '#ff6600' };
          ctx.fillStyle = bulbColors[c.props.bulbColor] || '#cc8800';
          ctx.beginPath();
          ctx.arc(0, 0, r * bs.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      break;
    }

    // ── Fan: circle with spinning blades ──
    case 'fan': {
      const r = Math.min(halfLen, GRID / 2);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

      // Spinning blades — speed scales with power, coasts to stop when de-energized
      // DC: spin direction follows conventional current (polarity-dependent)
      const bladeCount = 3;
      const crFan = compResults[c.id];
      const ratedW = c.props.wattRating || 300;
      const actualW = (energized && crFan) ? crFan.watts : 0;
      const fanPowerRatio = Math.min(actualW / ratedW, 1.5);
      // Determine spin direction: DC reverses based on terminal voltage polarity
      let spinDir = 1; // default: positive (clockwise)
      if (crFan && crFan._sourceType === 'DC') {
        const v1 = nodeVoltages[c.gx1 + ',' + c.gy1] || 0;
        const v2 = nodeVoltages[c.gx2 + ',' + c.gy2] || 0;
        spinDir = v1 >= v2 ? 1 : -1;
      }
      const targetSpeed = energized ? fanPowerRatio * 12 * spinDir : 0;
      if (!fanState[c.id]) fanState[c.id] = { angle: 0, speed: 0 };
      const fs = fanState[c.id];
      if (energized) {
        fs.speed += (targetSpeed - fs.speed) * Math.min(renderDt * 3, 1);
      } else {
        fs.speed *= Math.pow(0.30, renderDt); // half-life ~0.4s coast-down
      }
      fs.angle += fs.speed * renderDt;
      const spinAngle = fs.angle;
      const bladeLen = r * 0.75;

      ctx.save();
      ctx.rotate(spinAngle);
      ctx.lineWidth = 2.5 / camZoom;

      for (let i = 0; i < bladeCount; i++) {
        const a = (i / bladeCount) * Math.PI * 2;
        ctx.save();
        ctx.rotate(a);
        // Draw blade as a curved shape
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(bladeLen * 0.2, -bladeLen * 0.3, bladeLen * 0.6, -bladeLen * 0.35, bladeLen, 0);
        ctx.bezierCurveTo(bladeLen * 0.6, bladeLen * 0.15, bladeLen * 0.2, bladeLen * 0.1, 0, 0);
        ctx.fillStyle = (energized && showEnergizedColors) ? 'rgba(204, 51, 0, 0.3)' : 'rgba(34, 34, 34, 0.15)';
        ctx.fill();
        ctx.strokeStyle = (energized && showEnergizedColors) ? '#cc3300' : '#222';
        ctx.stroke();
        ctx.restore();
      }

      // Center hub
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = (energized && showEnergizedColors) ? '#cc3300' : '#222';
      ctx.fill();

      ctx.restore(); // end spin rotation (0,0 still = fan center from outer transform)

      // Wind swoosh arcs — only appear once blades are up to speed
      const swooshOnset = 5, swooshFull = 9; // speed thresholds (max is ~12)
      const swooshReadiness = Math.max(0, Math.min(1, (fs.speed - swooshOnset) / (swooshFull - swooshOnset)));
      if (swooshReadiness > 0) {
        ctx.save();
        ctx.lineCap = 'round';
        const swooshCount = 6;
        for (let i = 0; i < swooshCount; i++) {
          const seed = Math.sin(i * 73.17) * 0.5 + 0.5;
          const t = (animTime * fs.speed * (0.2 + seed * 0.2) + i * 1.3 + seed * 2.0) % (2.5 + seed * 1.5);
          const period = 2.5 + seed * 1.5;
          const fade = t < period * 0.5 ? t / (period * 0.5) : Math.max(0, 1 - (t - period * 0.5) / (period * 0.5));
          if (fade < 0.02) continue;
          ctx.globalAlpha = fade * (0.2 + fanPowerRatio * 0.6) * swooshReadiness;
          ctx.strokeStyle = '#6ab0e0';
          ctx.lineWidth = (1.5 + fade + fanPowerRatio * 2) / camZoom;
          const arcR = r * (0.3 + seed * 0.4);
          const startA = spinAngle + (i * 1.1) + seed * 3.14 + t * (0.5 + seed * 0.6);
          const sweep = 0.4 + seed * 0.5 + fade * 0.3;
          ctx.beginPath();
          ctx.arc(0, 0, arcR, startA, startA + sweep);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      break;
    }

    // ── Capacitor: two parallel plates with lead wires ──
    case 'capacitor': {
      const plateH   = 13;               // half-height of plate lines (world px)
      const plateGap = 5;                // half-gap between the two plates
      const energyColor = (energized && showEnergizedColors) ? '#cc3300' : '#222';

      // Lead wires
      ctx.strokeStyle = energyColor;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(-halfLen, 0);
      ctx.lineTo(-plateGap, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(plateGap, 0);
      ctx.lineTo(halfLen, 0);
      ctx.stroke();

      // Plate lines (thick)
      ctx.lineWidth = 3 / camZoom;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(-plateGap, -plateH);
      ctx.lineTo(-plateGap,  plateH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(plateGap, -plateH);
      ctx.lineTo(plateGap,  plateH);
      ctx.stroke();
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';

      // Charge indicator: light blue fill between plates when energized
      if (energized && showEnergizedColors) {
        ctx.save();
        ctx.fillStyle = 'rgba(30,120,220,0.15)';
        ctx.fillRect(-plateGap, -plateH, plateGap * 2, plateH * 2);
        ctx.restore();
      }

      break;
    }

    // ── Outlet: NEMA 5-15 face view ──
    case 'outlet': {
      const bW = 11;  // half-width of faceplate (world px)
      const bH = 14;  // half-height of faceplate (world px)
      const ec = (energized && showEnergizedColors) ? '#cc3300' : '#333';
      const loaded = c.props.wattage > 0;

      // Lead wires from terminals to faceplate edge
      ctx.strokeStyle = ec;
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(-halfLen, 0); ctx.lineTo(-bW, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(halfLen, 0);  ctx.lineTo(bW, 0);  ctx.stroke();

      // Rounded faceplate
      const rad = 3;
      ctx.beginPath();
      ctx.moveTo(-bW + rad, -bH);
      ctx.lineTo(bW - rad, -bH);
      ctx.arcTo(bW, -bH, bW, -bH + rad, rad);
      ctx.lineTo(bW, bH - rad);
      ctx.arcTo(bW, bH, bW - rad, bH, rad);
      ctx.lineTo(-bW + rad, bH);
      ctx.arcTo(-bW, bH, -bW, bH - rad, rad);
      ctx.lineTo(-bW, -bH + rad);
      ctx.arcTo(-bW, -bH, -bW + rad, -bH, rad);
      ctx.closePath();
      if (loaded) {
        ctx.fillStyle = (energized && showEnergizedColors) ? 'rgba(204,51,0,0.08)' : 'rgba(0,0,0,0.06)';
        ctx.fill();
      }
      ctx.strokeStyle = ec;
      ctx.lineWidth = 1.5 / camZoom;
      ctx.stroke();

      // Neutral slot (left, taller per NEMA 5-15)
      ctx.strokeStyle = ec;
      ctx.lineWidth = 3.5 / camZoom;
      ctx.beginPath(); ctx.moveTo(-4.5, -7); ctx.lineTo(-4.5, -0.5); ctx.stroke();

      // Hot slot (right, slightly shorter)
      ctx.beginPath(); ctx.moveTo(4.5, -7); ctx.lineTo(4.5, -1.5); ctx.stroke();

      // Ground hole: filled D-shape (oval with bottom cut flat)
      const gr = 3.5, gcy = 7.5;
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.ellipse(0, gcy, gr, 5.5, 0, Math.PI, 0, false); // tall oval, top half only
      ctx.closePath();                                       // flat bottom
      ctx.fill();

      break;
    }

    // ── Switch: SPST — pins at terminal positions so wires connect directly ──
    case 'switch': {
      const pinR = 3.5 / camZoom;
      // Left pin (hinge) at terminal
      ctx.beginPath();
      ctx.arc(-halfLen, 0, pinR, 0, Math.PI * 2);
      ctx.fill();
      // Right pin (contact) at terminal
      ctx.beginPath();
      ctx.arc(halfLen, 0, pinR, 0, Math.PI * 2);
      ctx.fill();

      // Arm from left terminal
      ctx.lineWidth = 2.5 / camZoom;
      ctx.beginPath();
      ctx.moveTo(-halfLen, 0);
      if (c.props.closed) {
        ctx.lineTo(halfLen, 0);
      } else {
        ctx.lineTo(halfLen * 0.6, -halfLen * 0.55);
      }
      ctx.stroke();
      ctx.lineWidth = lw;

      // Open/Closed status label
      if (showStatus) {
        ctx.save();
        ctx.font = `bold ${10 / camZoom}px Segoe UI, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = c.props.closed ? '#1a7a1a' : '#cc3300';
        ctx.fillText(c.props.closed ? 'CLOSED' : 'OPEN', 0, 10 / camZoom);
        ctx.restore();
      }
      break;
    }

    // ── Time Delay Relay: switch with clock arc ──
    case 'time_delay': {
      const pinR = 3.5 / camZoom;
      // Left pin (hinge)
      ctx.beginPath();
      ctx.arc(-halfLen, 0, pinR, 0, Math.PI * 2);
      ctx.fill();
      // Right pin (contact)
      ctx.beginPath();
      ctx.arc(halfLen, 0, pinR, 0, Math.PI * 2);
      ctx.fill();

      // Arm
      ctx.lineWidth = 2.5 / camZoom;
      ctx.beginPath();
      ctx.moveTo(-halfLen, 0);
      if (c.props.closed) {
        ctx.lineTo(halfLen, 0);
      } else {
        ctx.lineTo(halfLen * 0.6, -halfLen * 0.55);
      }
      ctx.stroke();
      ctx.lineWidth = lw;

      // Clock arc indicator below the switch
      const zs = 1 / camZoom;
      const clockR = 6 * zs;
      const clockX = 0;
      const clockY = 10 * zs;
      ctx.beginPath();
      ctx.arc(clockX, clockY, clockR, 0, Math.PI * 2);
      ctx.stroke();
      // Clock hands
      ctx.beginPath();
      ctx.moveTo(clockX, clockY);
      ctx.lineTo(clockX, clockY - clockR * 0.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(clockX, clockY);
      ctx.lineTo(clockX + clockR * 0.5, clockY);
      ctx.stroke();

      // If counting down, draw a progress arc
      if (c.props._counting && c.props._remainingTime > 0) {
        const progress = 1 - (c.props._remainingTime / c.props.delaySeconds);
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2 * zs;
        ctx.beginPath();
        ctx.arc(clockX, clockY, clockR, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = (energized && showEnergizedColors) ? '#cc3300' : '#222';
        ctx.lineWidth = lw;
      }

      // Status label below clock
      if (showStatus) {
        ctx.save();
        ctx.font = `bold ${8 * zs}px Segoe UI, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const tdLabelY = clockY + clockR + 4 * zs;
        if (c.props.closed) {
          ctx.fillStyle = '#1a7a1a';
          ctx.fillText('ACTIVE', 0, tdLabelY);
        } else if (c.props._counting) {
          ctx.fillStyle = '#cc6600';
          const secLeft = c.props._remainingTime > 0 ? ` ${c.props._remainingTime.toFixed(1)}s` : '';
          ctx.fillText('DELAYED' + secLeft, 0, tdLabelY);
        } else {
          ctx.fillStyle = '#cc3300';
          ctx.fillText('OPEN', 0, tdLabelY);
        }
        ctx.restore();
      }
      break;
    }

    // ── Fuse: rectangle with S-curve element ──
    // ── Contactor Coil: rectangle with "M" ──
    case 'contactor_coil': {
      const bw = bodyHalf, bh = 8;
      ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
      ctx.font = `bold ${10 / camZoom}px Segoe UI, sans-serif`;
      ctx.fillStyle = (energized && showEnergizedColors) ? '#cc3300' : '#444';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('M', 0, 0);
      ctx.textBaseline = 'alphabetic';
      break;
    }

    // ── Contactor Contact: NO contact bars (closes when coil energized) ──
    case 'contactor_contact': {
      const barH = 7, barG = 3;
      // Lead wires
      ctx.beginPath(); ctx.moveTo(-halfLen, 0); ctx.lineTo(-barG, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(barG, 0); ctx.lineTo(halfLen, 0); ctx.stroke();
      // Vertical bars
      ctx.lineWidth = 2 / camZoom;
      ctx.beginPath(); ctx.moveTo(-barG, -barH); ctx.lineTo(-barG, barH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(barG, -barH); ctx.lineTo(barG, barH); ctx.stroke();
      // Closed = horizontal bridge between bars
      if (c.props.contactClosed) {
        ctx.lineWidth = 2.5 / camZoom;
        ctx.beginPath(); ctx.moveTo(-barG, 0); ctx.lineTo(barG, 0); ctx.stroke();
      }
      ctx.lineWidth = lw;
      // Dashed control line
      ctx.setLineDash([2 / camZoom, 2 / camZoom]);
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1 / camZoom;
      ctx.beginPath(); ctx.moveTo(0, barH); ctx.lineTo(0, barH + 10 / camZoom); ctx.stroke();
      ctx.setLineDash([]);
      break;
    }

    // ── Relay Coil: rectangle with "R" ──
    case 'relay_coil': {
      const bw = bodyHalf, bh = 8;
      ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
      ctx.font = `bold ${10 / camZoom}px Segoe UI, sans-serif`;
      ctx.fillStyle = (energized && showEnergizedColors) ? '#cc3300' : '#444';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('R', 0, 0);
      ctx.textBaseline = 'alphabetic';
      break;
    }

    // ── Relay Contact: NO/NC contact bars with diagonal slash for NC ──
    case 'relay_contact': {
      const barH = 7, barG = 3;
      const isNC = c.props.contactMode === 'NC';
      // Lead wires
      ctx.beginPath(); ctx.moveTo(-halfLen, 0); ctx.lineTo(-barG, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(barG, 0); ctx.lineTo(halfLen, 0); ctx.stroke();
      // Vertical bars
      ctx.lineWidth = 2 / camZoom;
      ctx.beginPath(); ctx.moveTo(-barG, -barH); ctx.lineTo(-barG, barH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(barG, -barH); ctx.lineTo(barG, barH); ctx.stroke();
      // NC at rest: diagonal slash + bridge (closed); when energized: open (no bridge, no slash)
      // NO at rest: open (no bridge); when energized: bridge (closed)
      if (c.props.contactClosed) {
        // Contact is closed — draw bridge
        ctx.lineWidth = 2.5 / camZoom;
        ctx.beginPath(); ctx.moveTo(-barG, 0); ctx.lineTo(barG, 0); ctx.stroke();
      }
      // NC symbol: diagonal slash when in NC rest state (closed + not energized)
      if (isNC && !c.props._coilEnergized) {
        ctx.lineWidth = 1.5 / camZoom;
        ctx.beginPath();
        ctx.moveTo(-barG - 2, barH - 1);
        ctx.lineTo(barG + 2, -barH + 1);
        ctx.stroke();
      }
      ctx.lineWidth = lw;
      // Dashed control line
      ctx.setLineDash([2 / camZoom, 2 / camZoom]);
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1 / camZoom;
      ctx.beginPath(); ctx.moveTo(0, barH); ctx.lineTo(0, barH + 10 / camZoom); ctx.stroke();
      ctx.setLineDash([]);
      // NO/NC label
      if (showStatus) {
        ctx.save();
        ctx.font = `bold ${8 / camZoom}px Segoe UI, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = isNC ? '#cc6600' : '#888';
        ctx.fillText(isNC ? 'NC' : 'NO', 0, barH + 12 / camZoom);
        ctx.restore();
      }
      break;
    }

    case 'fuse':
    case 'lv_fuse':
    case 'td_fuse': {
      const fw = bodyHalf * 2;
      const fh = 8;
      ctx.strokeRect(-bodyHalf, -fh, fw, fh * 2);

      if (c.props.blown) {
        // Broken element — gap in the middle
        ctx.beginPath();
        ctx.moveTo(-bodyHalf + 4, 0);
        ctx.lineTo(-4, 0);
        ctx.moveTo(4, 0);
        ctx.lineTo(bodyHalf - 4, 0);
        ctx.stroke();

        // Red BLOWN indicator below the fuse body
        ctx.fillStyle = '#cc0000';
        ctx.font = `bold ${10 / camZoom}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('BLOWN', 0, fh + 14 / camZoom);
      } else {
        // Intact fuse element — thin S-curve line
        ctx.beginPath();
        const seg = (bodyHalf * 2 - 8) / 4;
        let sx = -bodyHalf + 4;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx + seg, -fh * 0.5);
        ctx.lineTo(sx + seg * 2, fh * 0.5);
        ctx.lineTo(sx + seg * 3, -fh * 0.5);
        ctx.lineTo(sx + seg * 4, 0);
        ctx.stroke();
      }
      // "TD" label above the fuse body for time delay fuse
      if (c.type === 'td_fuse') {
        ctx.fillStyle = '#555';
        ctx.font = `bold ${9 / camZoom}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('TD', 0, -fh - 3 / camZoom);
      }
      break;
    }

    // ── Breaker: rectangle housing with toggle switch ──
    // ── Earth Ground: 3 horizontal lines decreasing in width (IEEE/ANSI) ──
    case 'earth_ground': {
      const ec = (energized && showEnergizedColors) ? '#cc3300' : '#222';
      ctx.strokeStyle = ec;
      // Lead wire from connection point (0,0) down to first bar
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 8 / camZoom); ctx.stroke();
      // Three horizontal bars, decreasing in width
      ctx.lineWidth = 2.5 / camZoom;
      ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(-14 / camZoom, 8 / camZoom); ctx.lineTo(14 / camZoom, 8 / camZoom); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-9 / camZoom, 14 / camZoom); ctx.lineTo(9 / camZoom, 14 / camZoom); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-4 / camZoom, 20 / camZoom); ctx.lineTo(4 / camZoom, 20 / camZoom); ctx.stroke();
      ctx.lineCap = 'round';
      break;
    }

    // ── Chassis Ground: horizontal bar with diagonal tines below ──
    case 'breaker': {
      const bh = 8;
      const bbHalf = bodyHalf;

      // Outer housing rectangle
      ctx.lineWidth = 2 / camZoom;
      ctx.strokeRect(-bbHalf, -bh, bbHalf * 2, bh * 2);

      if (c.props.tripped) {
        // Tripped — switch arm disconnected (angled up from left terminal)
        ctx.strokeStyle = '#cc0000';
        ctx.lineWidth = 2.5 / camZoom;

        // Left contact to center pivot
        ctx.beginPath();
        ctx.moveTo(-bbHalf, 0);
        ctx.lineTo(0, -bh * 0.75);
        ctx.stroke();

        // Right contact (disconnected dot)
        ctx.beginPath();
        ctx.arc(bbHalf, 0, 2 / camZoom, 0, Math.PI * 2);
        ctx.fillStyle = '#cc0000';
        ctx.fill();

        // Red TRIPPED indicator
        ctx.font = `bold ${8 / camZoom}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('TRIPPED', 0, bh + 10 / camZoom);
      } else {
        // ON — switch arm connected across (straight line)
        ctx.lineWidth = 2.5 / camZoom;
        ctx.beginPath();
        ctx.moveTo(-bbHalf, 0);
        ctx.lineTo(bbHalf, 0);
        ctx.stroke();

        // Center toggle knob
        ctx.beginPath();
        ctx.arc(0, 0, 3.5 / camZoom, 0, Math.PI * 2);
        ctx.fillStyle = (energized && showEnergizedColors) ? '#cc3300' : '#444';
        ctx.fill();
        ctx.strokeStyle = (energized && showEnergizedColors) ? '#cc3300' : '#222';
        ctx.lineWidth = 1.5 / camZoom;
        ctx.stroke();
      }
      break;
    }
  }
}
