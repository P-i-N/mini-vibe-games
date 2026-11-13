'use strict';
/* Brick Bazaar boss art: the bodies of the six bosses and the top hat of the Bazaar Baron. game.js draws the glow
   behind a boss and its speech bubble. A boss is drawn in local coordinates: (0, 0) = the middle of its top edge. */
(() => {
  const TAU = Math.PI * 2, PI = Math.PI;
  const INK = '#1b1f33', WHITE = '#ffffff', RED = '#ff2a4d', GOLD = '#ffd23f', ICE = '#bfeeff';
  const QUEEN_W = 130, QUEEN_H = 66, HAT_W = 124;

  // ---------- colour modes ----------
  // Every colour goes through k(): all white during a hit flash, mixed with ice while frozen. Colours are '#rrggbb'.
  const NORMAL = 0, FLASH = 1, FROZEN = 2;
  let mode = NORMAL;
  const iceMix = new Map();
  function mix(a, b, f) {
    const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(((x >> s) & 255) * (1 - f) + ((y >> s) & 255) * f);
    return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  }
  function k(c) {
    if (mode === NORMAL) return c;
    if (mode === FLASH) return WHITE;
    let v = iceMix.get(c);
    if (!v) { v = mix(c, ICE, 0.55); iceMix.set(c, v); }
    return v;
  }

  // ---------- shapes ----------
  const frac = (v) => v - Math.floor(v);
  // 0 = open, 1 = closed. A short blink every 3.3 s.
  const blinkAt = (t) => { const p = frac(t / 3.3) * 3.3; return p < 0.16 ? 1 - Math.abs(p - 0.08) / 0.08 : 0; };
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); }
  function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); }
  function line(ctx, x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
  function fill(ctx, c, a = 1) {
    ctx.fillStyle = k(c);
    if (a === 1) { ctx.fill(); return; }
    ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.fill(); ctx.globalAlpha = 1;
  }
  function stroke(ctx, c, lw, a = 1) {
    ctx.strokeStyle = k(c); ctx.lineWidth = lw;
    if (a === 1) { ctx.stroke(); return; }
    ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.stroke(); ctx.globalAlpha = 1;
  }
  function txt(ctx, s, x, y, size, c) {
    ctx.font = `bold ${Math.max(1, Math.round(size * 10) / 10)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = k(c); ctx.fillText(s, x, y);
  }
  function lin(ctx, x0, y0, x1, y1, stops) {
    if (mode === FLASH) return WHITE;
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [o, c] of stops) g.addColorStop(o, k(c));
    return g;
  }
  function rad(ctx, x0, y0, r0, x1, y1, r1, stops) {
    if (mode === FLASH) return WHITE;
    const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
    for (const [o, c] of stops) g.addColorStop(o, k(c));
    return g;
  }
  function star(ctx, x, y, r, rot = 0, inner = 0.45, n = 5) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot - PI / 2 + (i * PI) / n, q = i % 2 ? r * inner : r;
      ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
    }
    ctx.closePath();
  }
  function twinkle(ctx, x, y, r, c = WHITE) {
    if (r < 0.5) return;
    star(ctx, x, y, r, 0, 0.22, 4); fill(ctx, c);
  }

  // ---------- face parts ----------
  // o.lid = lid colour, o.cover = 0..1 of the eye under the upper lid, o.tilt = lid angle (> 0 angry, < 0 worried),
  // o.side = -1 left eye / 1 right eye, o.pupil, o.white, o.pr = pupil radius as a part of the eye radius.
  function eye(ctx, x, y, rx, ry, look, o) {
    ell(ctx, x, y, rx, ry); fill(ctx, o.white || WHITE);
    const r = Math.min(rx, ry) * (o.pr || 0.55), px = x + look * rx * 0.16, py = y + ry * 0.12;
    circ(ctx, px, py, r); fill(ctx, o.pupil || INK);
    circ(ctx, px - r * 0.35, py - r * 0.4, r * 0.38); fill(ctx, WHITE);
    const cover = o.cover || 0, tilt = o.tilt || 0;
    if (cover > 0.01 || tilt) {
      ctx.save(); ell(ctx, x, y, rx, ry); ctx.clip();
      ctx.translate(x, y); ctx.rotate(-(o.side || 1) * tilt);
      const edge = -ry + 2 * ry * cover;
      ctx.fillStyle = k(o.lid); ctx.fillRect(-rx * 2, -ry * 3, rx * 4, edge + ry * 3);
      line(ctx, -rx * 2, edge, rx * 2, edge); stroke(ctx, INK, 1.8);
      ctx.restore();
    }
    ell(ctx, x, y, rx, ry); stroke(ctx, INK, 2);
  }
  // a > 0: angry (the inner end is lower), a < 0: worried.
  function brow(ctx, x, y, len, a, side, c, lw) {
    const dx = (Math.cos(a) * len) / 2, dy = (Math.sin(a) * len) / 2;
    line(ctx, x + side * dx, y - dy, x - side * dx, y + dy); stroke(ctx, c, lw);
  }
  function spiral(ctx, x, y, r, rot) {
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let i = 1; i <= 26; i++) { const a = rot + i * 0.55, q = (r * i) / 26; ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    stroke(ctx, INK, 1.8);
  }
  function sweat(ctx, x, y, s = 1) {
    ctx.beginPath(); ctx.moveTo(x, y - 6 * s);
    ctx.bezierCurveTo(x + 5 * s, y, x + 4 * s, y + 4 * s, x, y + 4 * s); ctx.bezierCurveTo(x - 4 * s, y + 4 * s, x - 5 * s, y, x, y - 6 * s);
    fill(ctx, '#8fdcff'); stroke(ctx, INK, 1.1);
    circ(ctx, x - 1.3 * s, y + 0.5 * s, 1.1 * s); fill(ctx, WHITE);
  }
  // The anger mark: four arcs around (x, y). It pulses.
  function vein(ctx, x, y, s, t) {
    const p = s * (1 + 0.15 * Math.sin(t * 12));
    ctx.beginPath();
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const cx = x + sx * 4.2 * p, cy = y + sy * 4.2 * p, a = Math.atan2(-sy, -sx), r = 3.4 * p;
      ctx.moveTo(cx + Math.cos(a - 0.9) * r, cy + Math.sin(a - 0.9) * r); ctx.arc(cx, cy, r, a - 0.9, a + 0.9);
    }
    stroke(ctx, RED, 2);
  }

  // ---------- damage and rage ----------
  function steam(ctx, x, y, t, dir = 0, c = '#eef2ff') {
    for (let i = 0; i < 3; i++) {
      const p = frac(t * 1.4 + i / 3);
      circ(ctx, x + dir * p * 12 + Math.sin(p * 7 + i) * 2.5, y - p * 22, 2.5 + p * 5.5); fill(ctx, c, (1 - p) * 0.7);
    }
  }
  // A flame that points up from (x, y), turned by rot.
  function flame(ctx, x, y, s, t, rot = 0, c1 = '#ff5a1f', c2 = GOLD) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    const f = 1 + 0.22 * Math.sin(t * 23 + x * 0.7), sway = Math.sin(t * 11 + x) * 2;
    for (const [c, m] of [[c1, 1], [c2, 0.55]]) {
      const hh = 15 * f * m, ww = 5.5 * m;
      ctx.beginPath(); ctx.moveTo(-ww, 0); ctx.quadraticCurveTo(-ww, -hh * 0.55, sway * m, -hh); ctx.quadraticCurveTo(ww, -hh * 0.55, ww, 0);
      ctx.arc(0, 0, ww, 0, PI); fill(ctx, c);
    }
    ctx.restore();
  }
  function crack(ctx, x, y, len, ang, c = INK) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.3, -len * 0.12); ctx.lineTo(len * 0.55, len * 0.1); ctx.lineTo(len, -len * 0.05);
    ctx.moveTo(len * 0.55, len * 0.1); ctx.lineTo(len * 0.68, len * 0.32);
    stroke(ctx, c, 1.6); ctx.restore();
  }
  // a crossed sticking plaster
  function plaster(ctx, x, y, s, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    for (const a of [0.6, -0.6]) {
      ctx.save(); ctx.rotate(a);
      rr(ctx, -9 * s, -3 * s, 18 * s, 6 * s, 2 * s); fill(ctx, '#f2c9a0'); stroke(ctx, '#b07a50', 1);
      rr(ctx, -3 * s, -2.2 * s, 6 * s, 4.4 * s, 1); fill(ctx, '#e3a878');
      ctx.restore();
    }
    ctx.restore();
  }
  function tape(ctx, x, y, len, rot, c = '#c9c9c9') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(-len / 2, -4); ctx.lineTo(len / 2, -4); ctx.lineTo(len / 2 - 1.5, 0); ctx.lineTo(len / 2, 4); ctx.lineTo(-len / 2, 4); ctx.lineTo(-len / 2 + 1.5, 0); ctx.closePath();
    fill(ctx, c, 0.92); stroke(ctx, INK, 0.8, 0.5);
    ctx.restore();
  }
  // frozen: icicles under the body, from x0 to x1 at y
  function icicles(ctx, x0, x1, y, time) {
    ctx.beginPath();
    for (let x = x0, i = 0; x <= x1 - 8; x += 11, i++) { const l = 6 + ((i * 5) % 7); ctx.moveTo(x, y - 1); ctx.lineTo(x + 4, y + l); ctx.lineTo(x + 8, y - 1); }
    fill(ctx, '#e6f8ff', 0.95); stroke(ctx, '#7fc8ee', 1);
    for (let i = 0; i < 3; i++) twinkle(ctx, x0 + ((x1 - x0) * (i + 0.5)) / 3, y - 12 - i * 6, Math.max(0, Math.sin(time * 3 + i * 2)) * 5);
  }

  // ---------- crowns ----------
  // n tips; C = { g, d, l, gem, gem2 }; spiky = no balls on the tips.
  function crown(ctx, x, y, cw, ch, tilt, C, n = 5, spiky = false) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
    const tips = [];
    for (let i = 0; i < n; i++) { const u = (i / (n - 1)) * 2 - 1; tips.push([(u * cw) / 2, -ch * (0.62 + 0.38 * (1 - Math.abs(u)))]); }
    ctx.beginPath(); ctx.moveTo(-cw / 2, 0);
    tips.forEach(([tx, ty], i) => { if (i) ctx.lineTo((tx + tips[i - 1][0]) / 2, -ch * 0.3); ctx.lineTo(tx, ty); });
    ctx.lineTo(cw / 2, 0); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, -ch, 0, 0, [[0, C.l || C.g], [0.6, C.g], [1, C.d]]); ctx.fill(); stroke(ctx, INK, 2);
    rr(ctx, -cw / 2, -ch * 0.3, cw, ch * 0.3, 2); fill(ctx, C.d); stroke(ctx, INK, 1.4);
    if (!spiky) for (const [tx, ty] of tips) { circ(ctx, tx, ty, 2.6); fill(ctx, C.g); stroke(ctx, INK, 1.1); }
    for (let i = -1; i <= 1; i++) {
      const gx = i * cw * 0.3, gy = -ch * 0.15, r = i ? 2.6 : 3.4;
      ctx.beginPath(); ctx.moveTo(gx, gy - r); ctx.lineTo(gx + r, gy); ctx.lineTo(gx, gy + r); ctx.lineTo(gx - r, gy); ctx.closePath();
      fill(ctx, i ? C.gem2 : C.gem); stroke(ctx, INK, 1);
    }
    line(ctx, -cw * 0.32, -ch * 0.42, -cw * 0.2, -ch * 0.55); stroke(ctx, WHITE, 1.8, 0.6);
    ctx.restore();
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // 1. Crate King: a shipping crate with a crown, a royal moustache and a knot for a nose.
  // alt 1 = sent back: worn wood, tape, eye patch, bent crown. alt 2 = gold bullion with a platinum crown and a monocle.
  const CRATE = [
    { wood: '#d9975a', light: '#f3c48a', board: '#b8743c', dark: '#8a5226', metal: '#a9b4cf', metalD: '#5d6680', must: '#5a3416',
      crown: GOLD, crownL: '#fff1a0', crownD: '#c78a00', gem: '#ff4f7b', gem2: '#5ef0ff', stamp: '#e0393e', label: '#f6f1df', stampText: 'FRAGILE' },
    { wood: '#9a8466', light: '#bba585', board: '#76614a', dark: '#4f3d2c', metal: '#7d879c', metalD: '#3e4556', must: '#3a2a1c',
      crown: '#c8ccd8', crownL: '#f0f2f8', crownD: '#7d8294', gem: '#7cf2a8', gem2: '#ff9a3d', stamp: '#e0393e', label: '#e9e1c6', stampText: 'RETURN', tape: '#d8c27e' },
    { wood: '#ffcc33', light: '#fff3a6', board: '#e8a800', dark: '#9a6a00', metal: '#fff8dc', metalD: '#b8860b', must: '#f4f6ff',
      crown: '#e8ecf8', crownL: '#ffffff', crownD: '#9aa6c9', gem: '#ff2a6d', gem2: '#2fd6ff', stamp: '#7a4a00', label: '#fffbe8', stampText: '24K' },
  ];
  function crateArm(ctx, x0, y0, x1, y1, P) {
    line(ctx, x0, y0, x1, y1); stroke(ctx, INK, 8);
    line(ctx, x0, y0, x1, y1); stroke(ctx, P.board, 5);
    circ(ctx, x1, y1, 5.5); fill(ctx, WHITE); stroke(ctx, INK, 1.8);
  }
  function crateKing(ctx, B, env, o) {
    const P = CRATE[o.alt], { w, h, t, look, hot, hurt } = o, hw = w / 2, st = B.state;
    const aim = st === 'aim', drop = st === 'drop', rest = st === 'rest', rise = st === 'rise', idle = !aim && !drop && !rest && !rise;
    if (aim) {
      // the stomp warning: arrows that run down below the crate
      for (let i = 0; i < 3; i++) {
        const on = (((Math.floor(t * 9) - i) % 3) + 3) % 3 === 0, y = h + 6 + i * 7;
        ctx.beginPath(); ctx.moveTo(-9, y); ctx.lineTo(0, y + 5); ctx.lineTo(9, y); stroke(ctx, RED, 3, on ? 1 : 0.3);
      }
      ctx.translate(Math.sin(t * 60) * 1.2, 0);
    }
    if (drop) {
      ctx.beginPath();
      for (const x of [-60, -36, -12, 12, 36, 60]) { ctx.moveTo(x, -4); ctx.lineTo(x, -14 - (Math.abs(x) % 24 ? 0 : 10)); }
      stroke(ctx, WHITE, 2, 0.55);
    }
    ctx.save();
    if (rest) { ctx.translate(0, h / 2); ctx.rotate(PI); ctx.translate(0, -h / 2); }
    else { const b = Math.sin(t * 2.4) * 0.02; ctx.translate(0, h); ctx.scale(1 - b / 2, 1 + b); ctx.translate(0, -h); }

    // feet
    const kick = drop ? Math.sin(t * 30) * 3 : rest ? Math.sin(t * 9) * 3 : 0;
    for (const s of [-1, 1]) { ell(ctx, s * (34 + kick), h + 3, 9, 4.5); fill(ctx, P.dark); stroke(ctx, INK, 1.8); }

    // arms; in idle the right hand holds a sceptre
    let L, R;
    if (aim || drop) { const j = drop ? Math.sin(t * 30) * 4 : Math.sin(t * 20) * 1.5; L = [-hw - 8, -10 + j]; R = [hw + 8, -10 - j]; }
    else if (rest) { L = [-hw - 14, -2]; R = [hw + 14, -2]; }
    else if (rise) { L = [-hw - 12, 40]; R = [hw + 12, 40]; }
    else { L = [-hw - 14, 30 + Math.sin(t * 3) * 6]; R = [hw + 13, 24]; }
    if (idle) {
      ctx.save(); ctx.translate(hw + 13, 24); ctx.rotate(Math.sin(t * 1.5) * 0.12);
      line(ctx, 0, 14, 0, -24); stroke(ctx, INK, 5); line(ctx, 0, 14, 0, -24); stroke(ctx, P.metal, 3);
      circ(ctx, 0, -27, 5); fill(ctx, P.gem); stroke(ctx, INK, 1.5);
      circ(ctx, -1.5, -28.5, 1.4); fill(ctx, WHITE);
      ctx.restore();
    }
    crateArm(ctx, -hw + 3, 26, L[0], L[1], P); crateArm(ctx, hw - 3, 26, R[0], R[1], P);

    // the crate
    rr(ctx, -hw, 0, w, h, 6); ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, P.light], [0.35, P.wood], [1, P.board]]); ctx.fill();
    ctx.beginPath(); for (const y of [h / 3, (2 * h) / 3]) { ctx.moveTo(-hw + 13, y); ctx.lineTo(hw - 13, y); } stroke(ctx, P.dark, 1.5, 0.6);
    ctx.beginPath(); ctx.moveTo(-44, 9.5); ctx.quadraticCurveTo(-36, 12, -28, 9.5); ctx.moveTo(26, 21); ctx.quadraticCurveTo(36, 24, 46, 20);
    ctx.moveTo(-30, 40); ctx.quadraticCurveTo(-22, 37, -14, 40.5); stroke(ctx, P.dark, 1, 0.45);
    for (const s of [-1, 1]) { rr(ctx, s < 0 ? -hw + 1.5 : hw - 13.5, 1.5, 12, h - 3, 4); fill(ctx, P.board); stroke(ctx, P.dark, 1.2); }
    ctx.fillStyle = k(P.board); for (const y of [1.5, h - 7.5]) ctx.fillRect(-hw + 13.5, y, w - 27, 6);
    ctx.beginPath(); ctx.moveTo(-hw + 13.5, 7.5); ctx.lineTo(hw - 13.5, 7.5); ctx.moveTo(-hw + 13.5, h - 7.5); ctx.lineTo(hw - 13.5, h - 7.5); stroke(ctx, P.dark, 1.2);
    ctx.beginPath(); for (const s of [-1, 1]) for (const y of [16, 30]) { ctx.moveTo(s * (hw - 7.5) + 1.6, y); ctx.arc(s * (hw - 7.5), y, 1.6, 0, TAU); }
    fill(ctx, P.metalD);
    for (const sx of [-1, 1]) for (const sy of [0, 1]) {
      rr(ctx, sx < 0 ? -hw : hw - 11, sy ? h - 11 : 0, 11, 11, 3); fill(ctx, P.metal); stroke(ctx, P.metalD, 1.2);
      circ(ctx, sx * (hw - 5.5), sy ? h - 5.5 : 5.5, 1.4); fill(ctx, P.metalD);
    }
    rr(ctx, -hw, 0, w, h, 6); stroke(ctx, INK, 3);

    // shipping label with a barcode, and 'this side up' arrows
    ctx.save(); ctx.translate(-47, 18); ctx.rotate(-0.07);
    rr(ctx, -12, -8, 24, 16, 1.5); fill(ctx, P.label); stroke(ctx, INK, 1);
    txt(ctx, 'TO:', -6.5, -4, 4.5, INK);
    ctx.beginPath(); ctx.moveTo(-1, -4); ctx.lineTo(9, -4); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); stroke(ctx, '#9aa6c9', 1);
    ctx.fillStyle = k(INK); let bx = -9;
    for (const bw of [1, 0.5, 1.5, 0.5, 1, 2, 0.5, 1, 1.5, 0.5, 1]) { ctx.fillRect(bx, 2.5, bw, 4); bx += bw + 0.7; }
    ctx.restore();
    ctx.beginPath(); for (const x of [-52, -43]) { ctx.moveTo(x, 41); ctx.lineTo(x, 32); ctx.moveTo(x - 3, 35); ctx.lineTo(x, 32); ctx.lineTo(x + 3, 35); }
    stroke(ctx, INK, 1.5, 0.7);
    ctx.save(); ctx.translate(46, 31); ctx.rotate(0.18);
    rr(ctx, -14, -6, 28, 12, 2); stroke(ctx, P.stamp, 1.5, 0.85);
    txt(ctx, P.stampText, 0, 0.5, P.stampText.length > 4 ? 6.5 : 8, P.stamp);
    ctx.restore();
    if (o.alt === 1) { tape(ctx, hw - 16, 9, 34, 0.7, P.tape); tape(ctx, -hw + 18, h - 9, 30, -0.6, P.tape); }
    if (o.alt === 2) for (let i = 0; i < 3; i++) twinkle(ctx, [-30, 30, -60][i], [8, 40, 4][i], Math.max(0, Math.sin(t * 3 + i * 2.1)) * 5);

    // face
    const ey = 18, cover = rest ? 0 : Math.max(o.blink, aim ? 0.35 : hot ? 0.22 : rise ? 0.45 : 0);
    const tilt = hot || aim ? 0.42 : drop ? -0.3 : rise ? -0.15 : 0.08, pupil = hot ? RED : INK;
    for (const s of [-1, 1]) {
      if (rest) { ell(ctx, s * 16, ey, 9.5, 10.5); fill(ctx, WHITE); stroke(ctx, INK, 2); spiral(ctx, s * 16, ey, 8, t * 6 * s); continue; }
      eye(ctx, s * 16, ey, 9.5, 10.5, look, { lid: P.wood, cover, tilt, side: s, pupil, pr: drop ? 0.3 : 0.55 });
      brow(ctx, s * 16, drop ? 2 : 5, 15, tilt * 1.2, s, P.must, 3.2);
    }
    if (o.alt === 1) {
      ell(ctx, -16, ey, 11, 11.5); fill(ctx, INK);
      ctx.beginPath(); ctx.moveTo(-hw + 13, 26); ctx.lineTo(-26, 17); ctx.moveTo(-6, 11); ctx.lineTo(10, 1.5); stroke(ctx, INK, 2);
      ctx.beginPath(); ctx.arc(-16, ey, 7, PI * 1.15, PI * 1.45); stroke(ctx, WHITE, 1.5, 0.35);
    }
    if (o.alt === 2 && !rest) {
      ell(ctx, 16, ey, 12, 12.5); stroke(ctx, P.metalD, 2.2);
      ctx.beginPath(); ctx.moveTo(28, ey + 2); ctx.quadraticCurveTo(34, 30, 30, 40); stroke(ctx, P.metalD, 1);
    }
    // the nose is a knot in the wood; gold bullion has a diamond instead
    if (o.alt === 2) {
      ctx.beginPath(); ctx.moveTo(0, 23); ctx.lineTo(4, 27); ctx.lineTo(0, 31); ctx.lineTo(-4, 27); ctx.closePath(); fill(ctx, '#e8fbff'); stroke(ctx, INK, 1.2);
    } else { ell(ctx, 0, 27, 4.5, 3.2); fill(ctx, P.dark); ell(ctx, 0, 27, 2, 1.3); fill(ctx, P.board); }
    ell(ctx, -28, 33, 5, 3); fill(ctx, hot ? RED : '#ff8a7a', 0.35); ell(ctx, 28, 33, 5, 3); fill(ctx, hot ? RED : '#ff8a7a', 0.35);
    // mouth
    if (rest) {
      ctx.beginPath(); ctx.moveTo(-8, 36); ctx.quadraticCurveTo(0, 41, 8, 36); stroke(ctx, INK, 2);
      ell(ctx, 3, 40, 3.5, 4.5); fill(ctx, '#ff7a9a'); stroke(ctx, INK, 1.2);
    } else if (drop) {
      ell(ctx, 0, 39, 5, 5.5); fill(ctx, INK); ell(ctx, 0, 41.5, 3, 2); fill(ctx, '#ff7a9a');
    } else if (aim) {
      rr(ctx, -9, 35, 18, 7, 2); fill(ctx, WHITE); stroke(ctx, INK, 1.5);
      ctx.beginPath(); ctx.moveTo(-9, 38.5); ctx.lineTo(9, 38.5); for (const x of [-4.5, 0, 4.5]) { ctx.moveTo(x, 35); ctx.lineTo(x, 42); } stroke(ctx, INK, 1);
    } else if (hot) {
      rr(ctx, -11, 34, 22, 9, 3); fill(ctx, INK);
      ctx.beginPath(); ctx.moveTo(-10, 34.5); for (let i = 0; i < 5; i++) { ctx.lineTo(-10 + i * 4 + 2, 38); ctx.lineTo(-10 + (i + 1) * 4, 34.5); } ctx.closePath(); fill(ctx, WHITE);
      ctx.beginPath(); ctx.moveTo(-10, 42.5); for (let i = 0; i < 5; i++) { ctx.lineTo(-10 + i * 4 + 2, 39.5); ctx.lineTo(-10 + (i + 1) * 4, 42.5); } ctx.closePath(); fill(ctx, WHITE);
    } else if (rise) {
      ctx.beginPath(); ctx.moveTo(-8, 38); for (let i = 1; i <= 8; i++) ctx.lineTo(-8 + i * 2, 38 + (i % 2 ? -1.5 : 1.5)); stroke(ctx, INK, 1.8);
    } else {
      ctx.beginPath(); ctx.moveTo(-10, 35.5); ctx.quadraticCurveTo(0, 46, 10, 35.5); ctx.closePath(); fill(ctx, INK);
      ell(ctx, 0, 41, 4, 2.2); fill(ctx, '#ff7a9a');
    }
    // royal moustache
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0, 30); ctx.bezierCurveTo(s * 6, 27, s * 14, 28, s * 18, 31);
      ctx.bezierCurveTo(s * 22, 33, s * 24, 28, s * 21, 26); ctx.bezierCurveTo(s * 20, 32, s * 10, 34, 0, 32.5); ctx.closePath();
      fill(ctx, P.must); stroke(ctx, INK, 1);
    }
    // damage
    if (hurt) {
      crack(ctx, 34, 10, 20, 0.7); crack(ctx, -36, 33, 16, -0.4);
      ctx.beginPath(); ctx.moveTo(hw - 28, 0); ctx.lineTo(hw - 23, 6); ctx.lineTo(hw - 18, 2.5); ctx.lineTo(hw - 15, 0); ctx.closePath(); fill(ctx, P.dark);
      plaster(ctx, -29, 4, 0.7, 0.3);
      line(ctx, -hw - 1, 22, -hw - 9, 18); stroke(ctx, P.metalD, 2); circ(ctx, -hw - 9, 18, 2); fill(ctx, P.metal);
    }
    if (hot && !rest) vein(ctx, 30, 6, 0.8, t);
    const crownY = drop ? -4 + Math.sin(t * 30) : Math.sin(t * 2.4 + 0.6) * 1.2;
    const crownTilt = (o.alt === 1 ? 0.14 : 0) + (hurt ? -0.08 : 0) + (aim ? Math.sin(t * 20) * 0.03 : 0);
    crown(ctx, 0, 1 + crownY, 50, 22, crownTilt, { g: P.crown, l: P.crownL, d: P.crownD, gem: P.gem, gem2: P.gem2 }, 5);
    if (o.frozen) icicles(ctx, -hw + 4, hw - 4, h, o.time);
    ctx.restore();

    if (hot && !rest) for (const s of [-1, 1]) steam(ctx, s * (hw - 8), 0, t, s);
    if (rest) for (let i = 0; i < 3; i++) {
      const a = t * 3 + (i * TAU) / 3;
      star(ctx, Math.cos(a) * 38, h + 14 + Math.sin(a) * 6, 5, a); fill(ctx, GOLD); stroke(ctx, INK, 1.2);
    }
    if (rise) sweat(ctx, hw - 22, 6 + Math.sin(t * 6), 1);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // 2. Twin Cannon: a flying steel machine with two rotors, claw arms, a screen face and two cannons at x -55 and +55.
  // alt 1 = army surplus: olive camouflage, rust, a star stencil. alt 2 = cursed: black iron, ghost fire, runes, chains.
  const CANNON = [
    { hull: '#93a4c2', light: '#d0dbef', dark: '#5a6886', trim: GOLD, barrel: '#3d4760', barrelL: '#7383a6', screen: '#0f1530', eye: '#5ef0ff', rotor: '#d0dbef' },
    { hull: '#7f8d52', light: '#b2c07e', dark: '#4b5530', trim: '#e3cf86', barrel: '#3b4029', barrelL: '#6d7549', screen: '#121708', eye: '#b9ff6b', rotor: '#b2c07e', camo: '#5c6a36', rust: '#a8552a' },
    { hull: '#3c3057', light: '#6f5c99', dark: '#1d162d', trim: '#9cff57', barrel: '#251b36', barrelL: '#4f3f72', screen: '#07040e', eye: '#9cff57', rotor: '#6f5c99', rune: '#c06bff' },
  ];
  const CANNON_TAG = ['$99', '-50%', 'BOO'], CANNON_PLATE = ['TC-2', 'TC-2B', 'TC-X'];
  function twinCannon(ctx, B, env, o) {
    const P = CANNON[o.alt], { w, h, t, look, hot, hurt } = o, hw = w / 2;
    // rotors and the antenna
    for (const s of [-1, 1]) {
      const rx = s * 42, bw = 30 * Math.cos(t * 26 + s);
      line(ctx, rx, 4, rx, -9); stroke(ctx, INK, 4); line(ctx, rx, 4, rx, -9); stroke(ctx, P.dark, 2);
      ell(ctx, rx, -11, 30, 4); fill(ctx, P.rotor, 0.22);
      line(ctx, rx - bw, -11, rx + bw, -11); stroke(ctx, INK, 3.5);
      circ(ctx, rx, -11, 3); fill(ctx, P.trim); stroke(ctx, INK, 1.2);
    }
    line(ctx, 0, 2, 0, -16); stroke(ctx, INK, 2.5);
    const lampOn = hot ? Math.sin(t * 16) > 0 : Math.sin(t * 4) > 0.3, lamp = hot ? RED : P.trim;
    if (lampOn) { circ(ctx, 0, -18, 7); fill(ctx, lamp, 0.3); }
    circ(ctx, 0, -18, 3.5); fill(ctx, lampOn ? lamp : P.dark); stroke(ctx, INK, 1.2);
    if (o.alt === 2) for (const s of [-1, 1]) flame(ctx, s * 22, 3, 0.8, t + s, 0, '#8a3dff', '#d6b0ff');

    // claw arms; the right claw holds a price tag
    for (const s of [-1, 1]) {
      const ex = s * (hw + 13), ey = 30 + Math.sin(t * 2.2 + s) * 3, open = 0.45 + 0.3 * Math.sin(t * 3 + s);
      for (const [c, lw] of [[INK, 6], [P.barrelL, 3.5]]) { ctx.beginPath(); ctx.moveTo(s * (hw - 4), 22); ctx.lineTo(s * (hw + 6), 26); ctx.lineTo(ex, ey); stroke(ctx, c, lw); }
      circ(ctx, s * (hw + 6), 26, 3); fill(ctx, P.dark); stroke(ctx, INK, 1.2);
      for (const [c, lw] of [[INK, 3.5], [P.light, 1.6]]) {
        ctx.beginPath();
        for (const d of [-1, 1]) { ctx.moveTo(ex, ey); ctx.lineTo(ex + Math.cos(PI / 2 + d * open) * 7, ey + Math.sin(PI / 2 + d * open) * 7); }
        stroke(ctx, c, lw);
      }
      if (s < 0) continue;
      const tx = ex + Math.sin(t * 2.6) * 3, ty = ey + 14;
      line(ctx, ex, ey + 5, tx, ty); stroke(ctx, INK, 1);
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + 9, ty + 3); ctx.lineTo(tx + 9, ty + 12); ctx.lineTo(tx - 9, ty + 12); ctx.lineTo(tx - 9, ty + 3); ctx.closePath();
      fill(ctx, '#fff3c4'); stroke(ctx, INK, 1);
      circ(ctx, tx, ty + 3, 1); fill(ctx, INK);
      txt(ctx, CANNON_TAG[o.alt], tx, ty + 8, 5.5, '#d83a3a');
    }

    // cannons: they kick back in turns and turn a little toward the paddle
    for (const s of [-1, 1]) {
      const kick = Math.pow(Math.max(0, Math.sin(t * 2.6 + (s > 0 ? 1.7 : 0))), 12) * 5;
      ctx.save(); ctx.translate(s * 55, h - 8); ctx.rotate(-look * 0.06);
      rr(ctx, -9, 4 - kick, 18, 20, 4); ctx.fillStyle = lin(ctx, -9, 0, 9, 0, [[0, P.barrelL], [0.45, P.barrel], [1, P.dark]]); ctx.fill(); stroke(ctx, INK, 2);
      if (hot) { rr(ctx, -9, 11 - kick, 18, 13, 4); fill(ctx, '#ff5a1f', 0.45 + 0.25 * Math.sin(t * 9)); }
      ctx.fillStyle = k(P.barrelL); ctx.fillRect(-9, 9 - kick, 18, 2.5); ctx.fillRect(-9, 15 - kick, 18, 2.5);
      rr(ctx, -11.5, 20 - kick, 23, 7, 2.5); fill(ctx, P.barrel); stroke(ctx, INK, 2);
      ell(ctx, 0, 27 - kick, 6.5, 2.2); fill(ctx, INK);
      rr(ctx, -15, -6, 30, 12, 5); fill(ctx, P.dark); stroke(ctx, INK, 2);
      circ(ctx, 0, 0, 2.2); fill(ctx, P.light);
      ctx.restore();
    }
    if (o.alt === 2) {
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const x = -40 + i * 10, y = h + 2 + 8 * (1 - (x / 40) * (x / 40)) + Math.sin(t * 2) * 1;
        ctx.moveTo(x + (i % 2 ? 2.5 : 4), y); ctx.ellipse(x, y, i % 2 ? 2.5 : 4, i % 2 ? 4 : 2.5, 0, 0, TAU);
      }
      stroke(ctx, P.light, 1.5);
    }

    // hull
    rr(ctx, -hw, 0, w, h, 14); ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, P.light], [0.3, P.hull], [1, P.dark]]); ctx.fill();
    ctx.save(); rr(ctx, -hw, 0, w, h, 14); ctx.clip();
    if (o.alt === 1) {
      for (const [x, y, rx, ry, c] of [[-60, 10, 12, 6, P.camo], [-20, 30, 14, 5, P.camo], [52, 12, 10, 7, P.camo], [26, 6, 9, 4, P.light], [-42, 24, 7, 4, P.rust], [66, 28, 5, 3, P.rust]]) {
        ell(ctx, x, y, rx, ry, 0.3); fill(ctx, c, 0.6);
      }
    }
    ctx.fillStyle = k(o.alt === 2 ? P.dark : P.trim); ctx.fillRect(-hw, h - 9, w, 9);
    ctx.beginPath();
    for (let x = -hw - 12; x < hw + 12; x += 12) { ctx.moveTo(x, h); ctx.lineTo(x + 6, h); ctx.lineTo(x + 12, h - 9); ctx.lineTo(x + 6, h - 9); ctx.closePath(); }
    fill(ctx, o.alt === 2 ? P.trim : INK, o.alt === 2 ? 0.45 : 0.85);
    rr(ctx, -hw + 14, 3, w - 28, 4, 2); fill(ctx, WHITE, 0.35);
    ctx.restore();
    line(ctx, -hw + 1, h - 9, hw - 1, h - 9); stroke(ctx, INK, 1.5);
    ctx.beginPath(); for (const x of [-42, 42]) { ctx.moveTo(x, 6); ctx.lineTo(x, h - 11); } stroke(ctx, P.dark, 1.5);
    ctx.beginPath(); for (const x of [-70, -56, 56, 70]) for (const y of [8, h - 14]) { ctx.moveTo(x + 1.7, y); ctx.arc(x, y, 1.7, 0, TAU); }
    fill(ctx, P.light); stroke(ctx, INK, 0.8);
    rr(ctx, -72, 13, 24, 10, 2); fill(ctx, P.trim); stroke(ctx, INK, 1);
    txt(ctx, CANNON_PLATE[o.alt], -60, 18.5, 5.5, INK);
    if (o.alt === 0) for (let i = 0; i < 3; i++) { rr(ctx, 49, 13 + i * 5, 15, 2.5, 1.2); fill(ctx, INK, 0.75); }
    if (o.alt === 1) { star(ctx, 57, 19, 7, 0, 0.42); fill(ctx, P.trim, 0.85); }
    if (o.alt === 2) {
      const a = 0.55 + 0.45 * Math.sin(t * 3);
      ctx.beginPath();
      ctx.moveTo(48, 13); ctx.lineTo(52, 23); ctx.lineTo(56, 13); ctx.moveTo(60, 13); ctx.lineTo(60, 23); ctx.moveTo(57, 16); ctx.lineTo(64, 20);
      ctx.moveTo(-36, 34); ctx.lineTo(-32, 30); ctx.lineTo(-28, 34); ctx.moveTo(28, 30); ctx.lineTo(32, 34); ctx.lineTo(36, 30);
      stroke(ctx, P.rune, 1.6, a);
    }
    rr(ctx, -hw, 0, w, h, 14); stroke(ctx, INK, 3);

    // screen face
    const ec = hot ? RED : P.eye;
    rr(ctx, -34, 5, 68, 27, 8); fill(ctx, P.screen); stroke(ctx, hot && Math.sin(t * 10) > 0 ? RED : INK, 2.5);
    ctx.save(); rr(ctx, -34, 5, 68, 27, 8); ctx.clip();
    ctx.beginPath(); for (let y = 7; y < 32; y += 3) { ctx.moveTo(-34, y); ctx.lineTo(34, y); } stroke(ctx, ec, 0.6, 0.15);
    if (hurt) { ctx.globalAlpha = 0.25; ctx.fillStyle = k(ec); ctx.fillRect(-34, 5 + frac(t * 0.9) * 27, 68, 2); ctx.globalAlpha = 1; }
    ctx.restore();
    const eh = Math.max(1.6, 11 * (1 - o.blink)), slant = hot ? Math.min(5, eh) : 0;
    for (const s of [-1, 1]) {
      // a damaged screen: the right eye drops out for a moment
      if (hurt && s > 0 && Math.sin(t * 13) > 0.85) continue;
      const ex = s * 13 + look * 1.4, ey = 15;
      rr(ctx, ex - 10, ey - eh / 2 - 3, 20, eh + 6, 4); fill(ctx, ec, 0.2);
      ctx.beginPath(); ctx.moveTo(ex + s * 7, ey - eh / 2); ctx.lineTo(ex - s * 7, ey - eh / 2 + slant); ctx.lineTo(ex - s * 7, ey + eh / 2); ctx.lineTo(ex + s * 7, ey + eh / 2); ctx.closePath();
      fill(ctx, ec);
      if (eh > 5) { rr(ctx, ex + look * 1.1 - 2, ey - 1, 4, 4, 1); fill(ctx, P.screen); }
    }
    if (hot) {
      ctx.beginPath(); ctx.moveTo(-15, 24); for (let i = 0; i < 6; i++) { ctx.lineTo(-15 + i * 5 + 2.5, 29); ctx.lineTo(-15 + (i + 1) * 5, 24); } stroke(ctx, RED, 2);
    } else {
      ctx.fillStyle = k(P.eye);
      for (let i = 0; i < 9; i++) { const bh = 1.5 + 3.5 * Math.abs(Math.sin(t * 7 + i * 0.9)); ctx.fillRect(-17.3 + i * 4, 26.5 - bh / 2, 2.6, bh); }
    }

    // damage and rage
    if (hurt) {
      for (const [x, y] of [[-52, 31], [64, 30]]) { ell(ctx, x, y, 6, 4); fill(ctx, P.dark, 0.6); ctx.beginPath(); ctx.ellipse(x, y, 6, 4, 0, 0.2, 1.6); stroke(ctx, WHITE, 1, 0.5); }
      crack(ctx, 40, 8, 14, 0.5);
      tape(ctx, -22, 37, 20, 0.5); tape(ctx, -22, 37, 20, -0.5);
      const bx = 22 + Math.sin(t * 3) * 3;
      ctx.beginPath(); ctx.moveTo(22, h); for (let i = 1; i <= 5; i++) ctx.lineTo(22 + (bx - 22) * (i / 5) + (i % 2 ? 2 : -2), h + i * 2); stroke(ctx, P.light, 1.2);
      star(ctx, bx, h + 12, 3.2, 0, 0.86, 3); fill(ctx, P.light); stroke(ctx, INK, 1);
      if (frac(t * 3) < 0.35) {
        ctx.beginPath(); for (const a of [-2.3, -1.6, -0.9]) { ctx.moveTo(-36 + Math.cos(a) * 2, 30 + Math.sin(a) * 2); ctx.lineTo(-36 + Math.cos(a) * 8, 30 + Math.sin(a) * 8); }
        stroke(ctx, GOLD, 1.6);
      }
    }
    if (hot) for (const s of [-1, 1]) { steam(ctx, s * 24, 0, t, s); flame(ctx, s * 70, 3, 0.8, t + s * 0.5); }
    if (o.frozen) icicles(ctx, -hw + 10, hw - 10, h, o.time);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // 3. Bazaar Baron: a plump merchant with a top hat, monocle, handlebar moustache and a gold tooth. He carries a money
  // bag and tosses a coin. alt 1 = bankrupt: patched brown suit, grey drooping moustache, cracked monocle, an IOU.
  // alt 2 = neon tycoon: black suit with neon trim, sunglasses, gold chain.
  const BARON = [
    { skin: '#d9b0ff', skinL: '#f1dcff', skinD: '#a877d9', suit: '#4a2a6b', suitL: '#6b3f99', shirt: '#f6f1ff', tie: '#ff4f7b', gold: GOLD, must: '#2b1a40',
      hat: '#2b1a40', hatL: '#4b3366', hatD: '#160c24', band: GOLD, cheek: '#ff7ab8' },
    { skin: '#c4b3cf', skinL: '#e4d9eb', skinD: '#8e7a9c', suit: '#6b4a2e', suitL: '#8c6844', shirt: '#e6dfcf', tie: '#5a7a8c', gold: '#c9b37a', must: '#8a8494',
      hat: '#4a4450', hatL: '#6a6372', hatD: '#2a262e', band: '#8a6a4a', cheek: '#d98aa8', patch: '#a88a5a' },
    { skin: '#ffc2ea', skinL: '#ffe6f6', skinD: '#d27fb6', suit: '#16162b', suitL: '#2b2b4f', shirt: '#5ef0ff', tie: '#ff2ad4', gold: GOLD, must: '#16162b',
      hat: '#101020', hatL: '#2b2b4f', hatD: '#05050d', band: '#5ef0ff', cheek: '#ff6ad0' },
  ];
  const HAT_TAG = ['$999', 'SALE', 'VIP'];
  // The top hat around (0, 0) = the middle of its brim. bw = the brim width.
  function hatShape(ctx, bw, alt, t) {
    const P = BARON[alt], s = bw / HAT_W, cw = 82 * s, ch = 34 * s;
    // the price tag is still on it
    const tx = cw * 0.5 + 10 * s, ty = 3 * s + Math.sin(t * 3) * 1.5 * s;
    line(ctx, cw * 0.44, -5 * s, tx, ty); stroke(ctx, INK, Math.max(0.6, s));
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + 10 * s, ty + 3 * s); ctx.lineTo(tx + 10 * s, ty + 11 * s); ctx.lineTo(tx - 10 * s, ty + 11 * s); ctx.lineTo(tx - 10 * s, ty + 3 * s); ctx.closePath();
    fill(ctx, '#fff3c4'); stroke(ctx, INK, Math.max(0.6, s));
    txt(ctx, HAT_TAG[alt], tx, ty + 7.3 * s, 6 * s, '#d83a3a');

    ell(ctx, 0, 0, bw / 2, 6 * s); ctx.fillStyle = lin(ctx, 0, -6 * s, 0, 6 * s, [[0, P.hatL], [1, P.hatD]]); ctx.fill(); stroke(ctx, INK, 2);
    ctx.beginPath(); ctx.moveTo(-cw * 0.46, 0); ctx.lineTo(-cw * 0.5, -ch);
    if (alt === 1) { ctx.lineTo(-cw * 0.12, -ch); ctx.lineTo(0, -ch + 7 * s); ctx.lineTo(cw * 0.14, -ch); }
    ctx.lineTo(cw * 0.5, -ch); ctx.lineTo(cw * 0.46, 0); ctx.closePath();
    ctx.fillStyle = lin(ctx, -cw / 2, 0, cw / 2, 0, [[0, P.hatL], [0.35, P.hat], [1, P.hatD]]); ctx.fill(); stroke(ctx, INK, 2);
    if (alt !== 1) { ell(ctx, 0, -ch, cw * 0.5, 3.5 * s); fill(ctx, P.hatL); stroke(ctx, INK, 1.5); }
    ctx.beginPath(); ctx.moveTo(-cw * 0.465, -2 * s); ctx.lineTo(-cw * 0.475, -10 * s); ctx.lineTo(cw * 0.475, -10 * s); ctx.lineTo(cw * 0.465, -2 * s); ctx.closePath();
    fill(ctx, P.band); stroke(ctx, INK, 1.2);
    if (alt === 2) { ctx.beginPath(); ctx.moveTo(-cw * 0.47, -6 * s); ctx.lineTo(cw * 0.47, -6 * s); stroke(ctx, WHITE, 1.2 * s, 0.7); }
    rr(ctx, -6 * s, -10.5 * s, 12 * s, 9 * s, 1.5 * s); fill(ctx, alt === 2 ? P.hat : '#7a5300'); stroke(ctx, INK, 1);
    txt(ctx, '$', 0, -5.8 * s, 8 * s, P.band);
    line(ctx, -cw * 0.36, -ch + 5 * s, -cw * 0.32, -13 * s); stroke(ctx, WHITE, 3 * s, 0.28);
    if (alt === 1) {
      rr(ctx, cw * 0.08, -ch + 10 * s, 14 * s, 11 * s, 1); fill(ctx, P.patch); stroke(ctx, INK, 1);
      ctx.beginPath();
      for (let i = 0; i < 4; i++) { const x = cw * 0.08 + 2 * s + i * 3.4 * s; ctx.moveTo(x, -ch + 8.5 * s); ctx.lineTo(x + 1.5 * s, -ch + 11.5 * s); }
      stroke(ctx, INK, 0.8);
    }
  }
  function sleeve(ctx, x0, y0, x1, y1, c) {
    line(ctx, x0, y0, x1, y1); stroke(ctx, INK, 8);
    line(ctx, x0, y0, x1, y1); stroke(ctx, c, 5);
    circ(ctx, x1, y1, 5.2); fill(ctx, WHITE); stroke(ctx, INK, 1.6);
  }
  function baron(ctx, B, env, o) {
    const P = BARON[o.alt], { w, h, t, hot, hurt } = o, hw = w / 2, bare = !!B.hat;
    const hatDir = bare ? Math.sign(B.hat.x - B.x) || 1 : 0, look = bare ? hatDir * 3 : o.look;

    // arms: the left hand holds a money bag (or covers the bare head), the right hand tosses a coin (or points at the hat)
    if (!bare) {
      ctx.save(); ctx.translate(-hw - 11, 38); ctx.rotate(Math.sin(t * 2) * 0.15);
      ctx.beginPath(); ctx.moveTo(-4, 0); ctx.quadraticCurveTo(-13, 6, -11, 15); ctx.quadraticCurveTo(0, 21, 11, 15); ctx.quadraticCurveTo(13, 6, 4, 0); ctx.closePath();
      fill(ctx, '#c8a26a'); stroke(ctx, INK, 1.8);
      line(ctx, -5, 1.5, 5, 1.5); stroke(ctx, '#7a4a1e', 2.5);
      if (o.alt === 1) { rr(ctx, 2, 6, 7, 6, 1); fill(ctx, P.patch); stroke(ctx, INK, 0.8); txt(ctx, '?', -3, 11, 9, '#7a5300'); }
      else txt(ctx, '$', 0, 11, 10, '#7a5300');
      ctx.restore();
      sleeve(ctx, -hw + 8, 30, -hw - 11, 36, P.suit);
      const cy = 16 - Math.abs(Math.sin(t * 3.2)) * 30, crx = Math.max(0.8, Math.abs(Math.cos(t * 11)) * 6);
      sleeve(ctx, hw - 8, 28, hw + 12, 25, P.suit);
      ell(ctx, hw + 12, cy, crx, 6); fill(ctx, hot ? '#ff5c5c' : '#ffd84a'); stroke(ctx, INK, 1.4);
      if (crx > 3) txt(ctx, '$', hw + 12, cy + 0.5, 7, hot ? '#5a0010' : '#7a5300');
    } else {
      sleeve(ctx, hw - 8, 28, hw + 14, 16 + Math.sin(t * 8) * 2, P.suit);
    }

    // body: face on top, suit below
    rr(ctx, -hw, 0, w, h, 22); ctx.fillStyle = rad(ctx, -22, 6, 4, -6, 16, 86, [[0, P.skinL], [0.45, P.skin], [1, P.skinD]]); ctx.fill();
    ctx.save(); rr(ctx, -hw, 0, w, h, 22); ctx.clip();
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * hw, 22); ctx.quadraticCurveTo(s * 44, 28, s * 30, 33); ctx.lineTo(s * hw, 33); ctx.closePath(); fill(ctx, P.suit); }
    ctx.fillStyle = k(P.suit); ctx.fillRect(-hw, 33, w, h - 33);
    ctx.beginPath(); ctx.moveTo(-15, 33); ctx.lineTo(15, 33); ctx.lineTo(0, h); ctx.closePath(); fill(ctx, P.shirt);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 15, 33); ctx.lineTo(s * 27, 33); ctx.lineTo(s * 3, h); ctx.closePath(); fill(ctx, P.suitL); stroke(ctx, INK, 1); }
    ctx.beginPath(); for (const x of [-34, 34]) { ctx.moveTo(x + 2, 42); ctx.arc(x, 42, 2, 0, TAU); } fill(ctx, P.gold); stroke(ctx, INK, 0.8);
    ctx.beginPath(); ctx.moveTo(-50, 37); ctx.quadraticCurveTo(-40, 46, -30, 40); stroke(ctx, P.gold, 1.5);
    if (o.alt === 1) {
      rr(ctx, -58, 36, 12, 10, 1); fill(ctx, P.patch); stroke(ctx, INK, 0.8);
      ctx.save(); ctx.translate(44, 37); ctx.rotate(0.2); rr(ctx, -7, -6, 14, 10, 1); fill(ctx, '#f6f1df'); stroke(ctx, INK, 0.8); txt(ctx, 'IOU', 0, -1, 5, '#d83a3a'); ctx.restore();
    } else { ctx.beginPath(); ctx.moveTo(38, 36); ctx.lineTo(48, 36); ctx.lineTo(43, 31); ctx.closePath(); fill(ctx, P.tie); stroke(ctx, INK, 0.8); }
    if (o.alt === 2) { ctx.beginPath(); ctx.moveTo(-hw, 33); ctx.lineTo(-27, 33); ctx.lineTo(-3, h); ctx.moveTo(hw, 33); ctx.lineTo(27, 33); ctx.lineTo(3, h); stroke(ctx, P.shirt, 1.5); }
    ctx.restore();
    rr(ctx, -hw, 0, w, h, 22); stroke(ctx, INK, 3);

    // face
    const cheekA = bare ? 0.95 : 0.55, cs = bare ? 1.35 : 1;
    for (const s of [-1, 1]) { ell(ctx, s * 30, 23, 6 * cs, 3.5 * cs); fill(ctx, hot ? RED : P.cheek, hot ? 0.4 : cheekA); }
    const cover = Math.max(o.blink, hot ? 0.22 : bare ? 0.3 : 0), tilt = hot ? 0.45 : bare ? -0.35 : hurt ? -0.1 : 0.05;
    for (const s of [-1, 1]) {
      eye(ctx, s * 16, 13, 7, 7.5, look, { lid: P.skin, cover, tilt, side: s, pupil: hot ? RED : INK });
      brow(ctx, s * 16, 4.5, 13, tilt * 1.2, s, P.must, 3.2);
    }
    if (hurt) { ell(ctx, -16, 13, 9.5, 10); stroke(ctx, '#8a5ad0', 2, 0.7); }
    if (o.alt === 2) {
      for (const s of [-1, 1]) { rr(ctx, s * 16 - 10, 7, 20, 12, 5); fill(ctx, INK, hot ? 0.6 : 0.88); stroke(ctx, P.shirt, 1.5); }
      line(ctx, -6, 10, 6, 10); stroke(ctx, P.shirt, 1.5);
      ctx.beginPath(); for (const s of [-1, 1]) { ctx.moveTo(s * 16 - 6, 15); ctx.lineTo(s * 16 - 1, 9); } stroke(ctx, WHITE, 1.5, 0.6);
    } else {
      circ(ctx, 16, 13, 9.5); fill(ctx, WHITE, 0.2); stroke(ctx, P.gold, 2);
      ctx.beginPath(); ctx.moveTo(25, 16); ctx.quadraticCurveTo(34, 26, 38, 36); stroke(ctx, P.gold, 1);
      if (o.alt === 1 || hurt) { ctx.beginPath(); ctx.moveTo(10, 7); ctx.lineTo(15, 13); ctx.lineTo(13, 17); ctx.moveTo(15, 13); ctx.lineTo(22, 15); stroke(ctx, WHITE, 1.2); }
    }
    ell(ctx, 0, 20, 6, 4.8); fill(ctx, P.skinD); stroke(ctx, INK, 1.2);
    circ(ctx, -2, 18.5, 1.6); fill(ctx, WHITE, 0.6);
    // mouth, under the moustache
    if (bare) {
      ctx.beginPath(); ctx.moveTo(-7, 31); for (let i = 1; i <= 7; i++) ctx.lineTo(-7 + i * 2, 31 + (i % 2 ? -1.3 : 1.3)); stroke(ctx, INK, 1.8);
    } else if (hot) {
      rr(ctx, -10, 28, 20, 7, 2); fill(ctx, WHITE); stroke(ctx, INK, 1.5);
      ctx.fillStyle = k(P.gold); ctx.fillRect(0.5, 28.6, 4.5, 6);
      ctx.beginPath(); ctx.moveTo(-10, 31.5); ctx.lineTo(10, 31.5); for (const x of [-5, 0, 5]) { ctx.moveTo(x, 28); ctx.lineTo(x, 35); } stroke(ctx, INK, 1);
    } else {
      ctx.beginPath(); ctx.moveTo(-6, 29); ctx.quadraticCurveTo(0, 36, 6, 29); ctx.closePath(); fill(ctx, INK);
      if (o.alt !== 1 && !hurt) { ctx.fillStyle = k(P.gold); ctx.fillRect(1, 29.2, 2.6, 2.4); }
      else { ctx.fillStyle = k(WHITE); ctx.fillRect(-4, 29.2, 2.4, 2); ctx.fillRect(1.8, 29.2, 2.4, 2); }
    }
    // handlebar moustache
    const wig = Math.sin(t * 4) * 0.12;
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * 2, 25); ctx.rotate(s * (o.alt === 1 ? 0.35 : wig)); ctx.scale(s, o.alt === 1 ? -1 : 1);
      ctx.beginPath(); ctx.moveTo(-1, -2); ctx.bezierCurveTo(8, -6, 17, -3, 22, 0); ctx.bezierCurveTo(26, 2, 30, -2, 27, -6);
      ctx.bezierCurveTo(29, 1, 22, 6, 14, 5); ctx.bezierCurveTo(8, 5, 2, 4, -1, 2); ctx.closePath();
      fill(ctx, P.must); stroke(ctx, o.alt === 2 ? P.shirt : INK, 1);
      if (hot) { ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(4 + i * 4, 4); ctx.lineTo(5.5 + i * 4, 8); } stroke(ctx, P.must, 1.5); }
      ctx.restore();
    }
    // bow tie, or a gold chain for the tycoon
    if (o.alt === 2) {
      ctx.beginPath(); ctx.moveTo(-26, 33); ctx.quadraticCurveTo(0, 52, 26, 33); stroke(ctx, P.gold, 2);
      circ(ctx, 0, 42, 5); fill(ctx, P.gold); stroke(ctx, INK, 1.2); txt(ctx, '$', 0, 42.5, 7, '#7a5300');
    } else {
      ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(-10, 35); ctx.lineTo(-10, 45); ctx.closePath(); ctx.moveTo(0, 40); ctx.lineTo(10, 35); ctx.lineTo(10, 45); ctx.closePath();
      fill(ctx, P.tie); stroke(ctx, INK, 1.4);
      circ(ctx, 0, 40, 2.6); fill(ctx, P.tie); stroke(ctx, INK, 1.2);
    }
    if (hurt && !bare) plaster(ctx, -34, 5, 0.65, -0.3);
    if (hot) { vein(ctx, 34, 6, 0.75, t); for (const s of [-1, 1]) steam(ctx, s * (hw - 4), 10, t, s); }

    // the hat, or the bald head that he is ashamed of
    if (bare) {
      ell(ctx, -12, 4, 10, 3, -0.2); fill(ctx, WHITE, 0.5);
      ctx.beginPath(); for (const x of [-6, 0, 6]) { ctx.moveTo(x, 1); ctx.quadraticCurveTo(x + 5, -4, x + 1, -8); ctx.quadraticCurveTo(x - 2, -10, x + 1, -11); }
      stroke(ctx, INK, 1.3);
      sleeve(ctx, -hw + 8, 26, -28, -1, P.suit);
      sweat(ctx, 36, 4 + Math.sin(t * 5) * 1.5, 1); sweat(ctx, -44, 10 + Math.sin(t * 5 + 1) * 1.5, 0.8);
    } else {
      const lift = hot ? Math.abs(Math.sin(t * 14)) * 3 : Math.max(0, Math.sin(t * 2)) * 1.5;
      ctx.save(); ctx.translate(2, -1 - lift); ctx.rotate(-0.06 + Math.sin(t * 2) * 0.03); hatShape(ctx, 84, o.alt, t); ctx.restore();
    }
    if (o.frozen) icicles(ctx, -hw + 14, hw - 14, h, o.time);
  }
  function hat(ctx, x, y, tilt, env, alt = 0) {
    env = env || {};
    const a = Math.max(0, Math.min(2, alt | 0)), bw = env.hatW || HAT_W, time = env.time || 0;
    mode = NORMAL;
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt || 0); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    hatShape(ctx, bw, a, time);
    twinkle(ctx, -bw * 0.2, -bw * 0.2, Math.max(0, Math.sin(time * 4)) * 6);
    twinkle(ctx, bw * 0.12, -bw * 0.08, Math.max(0, Math.sin(time * 4 + 2)) * 4);
    ctx.restore();
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // 4. Slime Queen: a jelly with a crown, lashes, lipstick and a candy sceptre; things that she swallowed float inside.
  // alt 1 = berry queen: pink with seeds and a fork stuck in her. alt 2 = void queen: dark violet with stars inside,
  // glowing eyes, a third eye and a crown of crystal spikes. Drawn at nominal size; draw() scales her.
  const QUEEN = [
    { body: '#7ee05a', light: '#c8ff9e', dark: '#3f9a2a', ink: '#1e5a12', crown: GOLD, crownL: '#fff1a0', crownD: '#c78a00', gem: '#ff4f7b', gem2: '#5ef0ff',
      lip: '#ff5c8a', cheek: '#ff9ac8', white: WHITE, pupil: INK },
    { body: '#ff6f9e', light: '#ffc2d6', dark: '#c23a6a', ink: '#6e1236', crown: '#fff2a8', crownL: '#ffffff', crownD: '#d4a830', gem: '#ff2a4d', gem2: '#7cf2a8',
      lip: '#a3124a', cheek: '#ffd0e0', white: WHITE, pupil: INK, seed: '#fff3a6' },
    { body: '#4a2a7a', light: '#9b6be0', dark: '#1d0f36', ink: '#0c0618', crown: '#8a7ae0', crownL: '#e2dcff', crownD: '#3a2a8a', gem: '#5ef0ff', gem2: '#ff6ad0',
      lip: '#5ef0ff', cheek: '#c06bff', white: '#0c0618', pupil: '#5ef0ff' },
  ];
  function queenPath(ctx, wob, t, dripK) {
    const L = -63 - wob, R = 63 + wob, top = 7 + wob * 0.5, base = 58;
    ctx.beginPath(); ctx.moveTo(L, base);
    ctx.bezierCurveTo(L - 6, 26, -34, top, 0, top); ctx.bezierCurveTo(34, top, R + 6, 26, R, base);
    ctx.quadraticCurveTo(R - 2, 66, R - 14, 66);
    for (const [x, len] of [[40, 6], [12, 10], [-22, 7], [-46, 9]]) {
      const l = len * dripK * (0.6 + 0.4 * Math.sin(t * 2 + x));
      ctx.lineTo(x + 5, 66); ctx.quadraticCurveTo(x + 5, 66 + l, x, 66 + l); ctx.quadraticCurveTo(x - 5, 66 + l, x - 5, 66);
    }
    ctx.lineTo(L + 14, 66); ctx.quadraticCurveTo(L + 2, 66, L, base); ctx.closePath();
    return top;
  }
  function queen(ctx, B, env, o) {
    const P = QUEEN[o.alt], { t, look, hot, hurt } = o, wob = Math.sin(t * 6) * 4, wv = Math.sin(t * 3);
    // arms: the left one waves, the right one holds a candy sceptre
    const hy = 26 + wv * 5;
    line(ctx, 73, 46, 73, 4); stroke(ctx, INK, 4.5); line(ctx, 73, 46, 73, 4); stroke(ctx, '#f4f6ff', 2.5);
    circ(ctx, 73, 0, 7); fill(ctx, P.crown); stroke(ctx, INK, 1.8);
    spiral(ctx, 73, 0, 6, t * 2);
    for (const [c, lw] of [[P.ink, 12], [P.body, 8]]) {
      ctx.beginPath(); ctx.moveTo(-56, 40); ctx.quadraticCurveTo(-72, 38, -76, hy); ctx.moveTo(56, 40); ctx.quadraticCurveTo(68, 40, 70, 30); stroke(ctx, c, lw);
    }
    circ(ctx, -76, hy, 5.5); fill(ctx, P.body); stroke(ctx, P.ink, 2);
    circ(ctx, 70, 29, 5.5); fill(ctx, P.body); stroke(ctx, P.ink, 2);

    // body
    const top = queenPath(ctx, wob, t, hurt ? 1.6 : 1);
    ctx.fillStyle = rad(ctx, -22, 20, 4, -10, 30, 82, [[0, P.light], [0.45, P.body], [1, P.dark]]); ctx.fill();
    ctx.save(); queenPath(ctx, wob, t, hurt ? 1.6 : 1); ctx.clip();
    ell(ctx, 0, 64, 62, 10); fill(ctx, P.dark, 0.35);
    // swallowed things, seeds or stars
    ctx.globalAlpha = 0.55;
    if (o.alt === 0) {
      ell(ctx, -40, 50 + Math.sin(t) * 1.5, 6, 3.5, 0.4); fill(ctx, GOLD); stroke(ctx, '#7a5300', 1);
      ctx.beginPath(); const fy = 53 + Math.sin(t + 1) * 1.5; ctx.moveTo(30, fy); ctx.lineTo(46, fy);
      for (let i = 0; i < 3; i++) { ctx.moveTo(34 + i * 4, fy - 3); ctx.lineTo(34 + i * 4, fy + 3); }
      ctx.moveTo(46, fy); ctx.lineTo(50, fy - 3); ctx.moveTo(46, fy); ctx.lineTo(50, fy + 3); stroke(ctx, WHITE, 1.2);
      circ(ctx, 29, fy, 2.2); fill(ctx, WHITE);
      ctx.beginPath(); ctx.arc(-8, 59 + Math.sin(t * 0.8) * 1.2, 3, 0, TAU); ctx.moveTo(-5, 59); ctx.lineTo(6, 59); ctx.lineTo(6, 62); stroke(ctx, GOLD, 1.4);
    } else if (o.alt === 1) {
      ctx.fillStyle = k(P.seed);
      for (let i = 0; i < 18; i++) { const x = -54 + ((i * 37) % 108), y = 16 + ((i * 23) % 44); ctx.beginPath(); ctx.ellipse(x, y, 1.3, 2.2, 0.3, 0, TAU); ctx.fill(); }
    } else {
      ctx.globalAlpha = 1;
      for (let i = 0; i < 9; i++) twinkle(ctx, -50 + ((i * 41) % 100), 18 + ((i * 29) % 42), (0.5 + 0.5 * Math.sin(t * 2 + i * 1.7)) * 3.5, i % 2 ? '#5ef0ff' : '#e8d6ff');
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 5; i++) {
      const x = -40 + i * 20 + Math.sin(t + i) * 4, y = 60 - frac(t * 0.25 + i * 0.27) * 48;
      circ(ctx, x, y, 1.6 + (i % 3)); stroke(ctx, P.light, 1.2, 0.6);
    }
    if (hot) { queenPath(ctx, wob, t, 1.6); fill(ctx, RED, 0.12 + 0.08 * Math.sin(t * 8)); }
    ctx.restore();
    queenPath(ctx, wob, t, hurt ? 1.6 : 1); stroke(ctx, P.ink, 3);
    ell(ctx, -26, 18, 16, 6, -0.4); fill(ctx, WHITE, 0.5);
    circ(ctx, -10, 13, 2.5); fill(ctx, WHITE, 0.7);
    if (o.alt === 1) {
      // a fork, stuck in her side
      line(ctx, -58, 26, -84, 12); stroke(ctx, INK, 5); line(ctx, -58, 26, -84, 12); stroke(ctx, '#d0d6e8', 3);
      ctx.beginPath(); for (const d of [-3, 0, 3]) { ctx.moveTo(-58 + d * 0.5, 26 + d); ctx.lineTo(-50 + d * 0.5, 30 + d); } stroke(ctx, '#d0d6e8', 1.4);
    }

    // face
    const cover = Math.max(o.blink, hot ? 0.25 : 0), tilt = hot ? 0.42 : hurt ? -0.25 : 0;
    for (const s of [-1, 1]) {
      eye(ctx, s * 20, 30, 10.5, 12, look, { lid: P.body, cover, tilt, side: s, pupil: hot ? RED : P.pupil, white: P.white, pr: o.alt === 2 ? 0.4 : 0.55 });
      ctx.beginPath();
      for (let i = 0; i < 3; i++) { const a = -PI / 2 + s * (0.5 + i * 0.35); ctx.moveTo(s * 20 + Math.cos(a) * 10, 30 + Math.sin(a) * 11.5); ctx.lineTo(s * 20 + Math.cos(a) * 15, 30 + Math.sin(a) * 16); }
      stroke(ctx, o.alt === 2 ? P.gem : P.ink, 1.8);
      if (hot || hurt) brow(ctx, s * 20, 14, 12, tilt * 1.2, s, P.ink, 3);
    }
    if (o.alt === 2) eye(ctx, 0, 17, 5, 6, look * 0.5, { lid: P.body, cover: Math.max(blinkAt(t + 1.4), hot ? 0.25 : 0), side: 1, pupil: hot ? RED : P.pupil, white: P.white, pr: 0.45 });
    for (const s of [-1, 1]) { ell(ctx, s * 35, 41, 6, 3.5); fill(ctx, P.cheek, 0.7); }
    if (o.alt !== 2) { circ(ctx, 27, 45, 1.2); fill(ctx, INK); }
    if (hot) {
      ctx.beginPath(); ctx.moveTo(-12, 43); ctx.quadraticCurveTo(0, 60, 12, 43); ctx.quadraticCurveTo(0, 47, -12, 43); fill(ctx, INK);
      ell(ctx, 0, 52, 4, 2.2); fill(ctx, '#ff7a9a');
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 8.5, 44); ctx.lineTo(s * 5, 50); ctx.lineTo(s * 3, 45); ctx.closePath(); fill(ctx, WHITE); }
    } else if (hurt) {
      ctx.beginPath(); ctx.moveTo(-8, 47); for (let i = 1; i <= 8; i++) ctx.lineTo(-8 + i * 2, 47 + (i % 2 ? -1.3 : 1.3)); stroke(ctx, P.ink, 2);
    } else if (Math.sin(t * 1.3) > 0.85) {
      ell(ctx, 0, 47, 3.5, 4); fill(ctx, P.lip); stroke(ctx, P.ink, 1.2);
    } else {
      ctx.beginPath(); ctx.moveTo(-8, 44); ctx.quadraticCurveTo(0, 52, 8, 44); ctx.quadraticCurveTo(0, 47.5, -8, 44); fill(ctx, P.lip); stroke(ctx, P.ink, 1.2);
    }

    // damage, rage, crown
    if (hurt) { plaster(ctx, 30, 15, 0.7, 0.4); sweat(ctx, -44, 20 + Math.sin(t * 4) * 1.5, 0.9); }
    if (hot) {
      vein(ctx, -34, 16, 0.75, t);
      for (let i = 0; i < 4; i++) {
        const p = frac(t * 1.6 + i * 0.27), x = -36 + i * 24, y = top + (x / 63) * (x / 63) * 28 - 1 - p * 5;
        circ(ctx, x, y, 1 + p * 4); stroke(ctx, P.light, 1.5, 1 - p);
      }
      for (const s of [-1, 1]) steam(ctx, s * 30, top + 6, t, s);
    }
    const C = { g: P.crown, l: P.crownL, d: P.crownD, gem: P.gem, gem2: P.gem2 };
    crown(ctx, wob * 0.2, top + 3, o.alt === 2 ? 48 : 44, o.alt === 2 ? 25 : 21, Math.sin(t * 3) * 0.05 + (hurt ? 0.25 : 0), C, o.alt === 2 ? 7 : 5, o.alt === 2);
    if (o.alt === 1) {
      const hy2 = top - 15;
      ctx.beginPath(); ctx.moveTo(wob * 0.2, hy2 + 4); ctx.bezierCurveTo(wob * 0.2 - 6, hy2 - 2, wob * 0.2 - 2, hy2 - 6, wob * 0.2, hy2 - 2);
      ctx.bezierCurveTo(wob * 0.2 + 2, hy2 - 6, wob * 0.2 + 6, hy2 - 2, wob * 0.2, hy2 + 4); fill(ctx, RED); stroke(ctx, INK, 1);
    }
    if (o.frozen) icicles(ctx, -56, 56, 64, o.time);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // 5. The Auditor: a flying saucer. A small accountant sits in the glass dome with glasses, a pencil and a calculator;
  // a receipt hangs out of the hull. alt 1 = senior auditor: green hull, white hair, moustache, green eye shade.
  // alt 2 = night shift: black hull, neon lights, tired eyes, a mug of coffee.
  const AUDIT = [
    { hull: '#a3afd1', light: '#e3e8fa', dark: '#5d6b8f', rim: GOLD, dome: '#bfe9ff', skin: '#9be08a', skinD: '#5fa851', hair: '#3a4a2a', tie: '#ff5c5c',
      lamp: GOLD, lampOff: '#7a6a3a', suit: '#3d4766', stampText: 'TAX' },
    { hull: '#5f8a70', light: '#a5d3b4', dark: '#33503f', rim: '#d9b45a', dome: '#d6ffe9', skin: '#b8c9f0', skinD: '#7c8fbf', hair: '#f4f6ff', tie: '#7a3aa8',
      lamp: '#ffb14a', lampOff: '#6a4a2a', suit: '#2a3a30', visor: '#3ad17a', stampText: 'PAID' },
    { hull: '#2c2f4a', light: '#565c88', dark: '#14162a', rim: '#ff2ad4', dome: '#9a7cff', skin: '#c9a7ff', skinD: '#8f6ccc', hair: '#1b1f33', tie: '#5ef0ff',
      lamp: '#ff2ad4', lampOff: '#4a2a5a', suit: '#1b1f33', stampText: 'LATE' },
  ];
  // The tractor beam: half width 24 at the saucer (y = h), 70 at the paddle. game.js takes coins inside these numbers.
  function tractor(ctx, h, bottom, time) {
    ctx.fillStyle = mode === FLASH ? WHITE : (() => {
      const g = ctx.createLinearGradient(0, h, 0, bottom);
      g.addColorStop(0, 'rgba(126,224,255,0.42)'); g.addColorStop(1, 'rgba(126,224,255,0.1)');
      return g;
    })();
    ctx.globalAlpha = 0.8 + 0.2 * Math.sin(time * 20);
    ctx.beginPath(); ctx.moveTo(-24, h); ctx.lineTo(24, h); ctx.lineTo(70, bottom); ctx.lineTo(-70, bottom); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(-24, h); ctx.lineTo(-70, bottom); ctx.moveTo(24, h); ctx.lineTo(70, bottom); stroke(ctx, '#bff4ff', 2, 0.6);
    for (let i = 0; i < 4; i++) {
      const p = frac(time * 0.8 + i / 4), y = bottom - p * (bottom - h), hw = 70 - p * 46;
      ell(ctx, 0, y, hw, 4); stroke(ctx, '#e6fbff', 1.5, 0.15 + 0.5 * (1 - p));
    }
    for (let i = 0; i < 3; i++) {
      const p = frac(time * 0.5 + i / 3), y = bottom - p * (bottom - h), x = Math.sin(time * 2 + i * 2) * (60 - p * 40) * 0.6;
      ctx.globalAlpha = Math.min(1, (1 - p) * 2); txt(ctx, '$', x, y, 12, GOLD); ctx.globalAlpha = 1;
    }
  }
  function auditor(ctx, B, env, o) {
    const P = AUDIT[o.alt], { w, h, t, look, hot, hurt } = o, hw = w / 2, beam = B.state === 'tractor';
    if (beam) tractor(ctx, h, (env.paddleY != null ? env.paddleY : B.y + 400) - B.y, env.time || t);

    // antenna with a percent sign
    line(ctx, 0, -12, 0, -22); stroke(ctx, INK, 2.5);
    circ(ctx, 0, -25, 4.2); fill(ctx, hot && Math.sin(t * 16) > 0 ? RED : P.lamp); stroke(ctx, INK, 1.2);
    txt(ctx, '%', 0, -24.6, 5.6, INK);

    // the accountant in the dome
    ctx.beginPath(); ctx.ellipse(0, 17, 40, 30, 0, PI, TAU); ctx.closePath(); fill(ctx, P.dome, 0.3);
    ctx.save(); ctx.translate(0, -1); ctx.scale(1.25, 1.25);
    const tap = Math.abs(Math.sin(t * 10)) * 1.5;
    rr(ctx, -15, 10, 30, 12, 5); fill(ctx, P.suit); stroke(ctx, INK, 1.2);
    ctx.beginPath(); ctx.moveTo(-4, 10); ctx.lineTo(4, 10); ctx.lineTo(0, 16); ctx.closePath(); fill(ctx, WHITE);
    ctx.beginPath(); ctx.moveTo(-2, 11); ctx.lineTo(2, 11); ctx.lineTo(1.5, 18); ctx.lineTo(0, 19.5); ctx.lineTo(-1.5, 18); ctx.closePath(); fill(ctx, P.tie);
    for (const s of [-1, 1]) { circ(ctx, s * 10, 3, 2.6); fill(ctx, P.skin); stroke(ctx, INK, 1); }
    circ(ctx, 0, 3, 10); fill(ctx, P.skin); stroke(ctx, INK, 1.4);
    if (o.alt === 0) {
      ctx.beginPath(); ctx.arc(0, 3, 10.3, PI * 1.02, PI * 1.98); ctx.quadraticCurveTo(2, -4, -3, -2); ctx.closePath(); fill(ctx, P.hair);
      line(ctx, -3, -6.5, -3, -2.5); stroke(ctx, P.skinD, 1);
    } else if (o.alt === 1) {
      for (const s of [-1, 1]) { circ(ctx, s * 9, -2, 3.5); fill(ctx, P.hair); stroke(ctx, INK, 0.8); }
      ctx.beginPath(); ctx.moveTo(-13, -1); ctx.lineTo(13, -1); ctx.lineTo(9, -6); ctx.lineTo(-9, -6); ctx.closePath(); fill(ctx, P.visor, 0.85); stroke(ctx, INK, 1);
    } else {
      ctx.beginPath(); ctx.moveTo(-9, -1);
      for (let i = 0; i <= 6; i++) ctx.lineTo(-9 + i * 3, i % 2 ? -11 + Math.sin(t * 3 + i) * 0.6 : -5);
      ctx.closePath(); fill(ctx, P.hair);
    }
    // glasses; the auditor glares when enraged
    for (const s of [-1, 1]) {
      const ex = s * 4.6, ey = 3;
      eye(ctx, ex, ey, 2.8, 3, look * 0.6, { lid: P.skin, cover: Math.max(o.blink, o.alt === 2 ? 0.45 : 0, hot ? 0.2 : 0), tilt: hot ? 0.5 : 0, side: s, pupil: hot ? RED : INK, pr: 0.6 });
      circ(ctx, ex, ey, 4.4); fill(ctx, hot ? RED : WHITE, hot ? 0.3 : 0.12); stroke(ctx, INK, 1.3);
      line(ctx, ex - 2.5, ey - 1.5, ex - 0.5, ey - 3.3); stroke(ctx, WHITE, 1, 0.6);
      if (o.alt === 2) { ctx.beginPath(); ctx.arc(ex, ey + 4.6, 2.6, 0.2, PI - 0.2); stroke(ctx, '#5a3a8a', 1); }
      if (hot) brow(ctx, ex, -2.5, 5, 0.6, s, INK, 1.6);
    }
    line(ctx, -0.4, 3, 0.4, 3); stroke(ctx, INK, 1.2);
    if (hot) { rr(ctx, -3.5, 7.5, 7, 3, 1); fill(ctx, WHITE); stroke(ctx, INK, 0.8); }
    else { ctx.beginPath(); ctx.moveTo(-2.5, 9); ctx.quadraticCurveTo(0, 7.8, 2.5, 9); stroke(ctx, INK, 1.1); }
    if (o.alt === 1) { ctx.beginPath(); ctx.ellipse(-2, 7, 2.5, 1.2, 0.2, 0, TAU); ctx.ellipse(2, 7, 2.5, 1.2, -0.2, 0, TAU); fill(ctx, P.hair); }
    // pencil behind the ear
    ctx.save(); ctx.translate(-11, -2); ctx.rotate(-0.5);
    ctx.fillStyle = k(GOLD); ctx.fillRect(-2, -1.3, 11, 2.6); ctx.fillStyle = k('#ff8ab0'); ctx.fillRect(-4, -1.3, 2, 2.6);
    ctx.beginPath(); ctx.moveTo(9, -1.3); ctx.lineTo(12, 0); ctx.lineTo(9, 1.3); ctx.closePath(); fill(ctx, '#f3c48a');
    ctx.restore();
    // calculator; the night shift also has coffee
    rr(ctx, 13, 3, 12, 10, 1.5); fill(ctx, '#2a2f45'); stroke(ctx, INK, 1);
    rr(ctx, 14.5, 4.5, 9, 3.2, 0.8); fill(ctx, hot ? '#3a0a10' : '#b9ff6b');
    if (hot && Math.sin(t * 8) > 0) txt(ctx, 'ERR', 19, 6.2, 3.2, RED);
    circ(ctx, 15, 12 + tap, 2.6); fill(ctx, P.skin); stroke(ctx, INK, 0.8);
    if (o.alt === 2) {
      rr(ctx, -26, 4, 8, 9, 1.5); fill(ctx, WHITE); stroke(ctx, INK, 1);
      ctx.beginPath(); ctx.arc(-17.5, 8.5, 2.5, -PI / 2, PI / 2); stroke(ctx, INK, 1.2);
      ctx.beginPath(); for (const x of [-24, -20]) { const p = frac(t * 0.7 + x * 0.1); ctx.moveTo(x, 3); ctx.quadraticCurveTo(x + 2 * Math.sin(t * 4 + x), 0, x, -3 - p * 2); } stroke(ctx, WHITE, 1, 0.5);
    }
    ctx.restore();
    // the glass
    ctx.beginPath(); ctx.ellipse(0, 17, 40, 30, 0, PI, TAU); ctx.closePath(); fill(ctx, P.dome, 0.18); stroke(ctx, INK, 2.5);
    ctx.beginPath(); ctx.ellipse(0, 17, 34, 25, 0, PI * 1.12, PI * 1.42); stroke(ctx, WHITE, 3, 0.6);
    if (hurt) { crack(ctx, 12, -4, 14, 0.9, WHITE); crack(ctx, -24, 4, 10, -0.6, WHITE); }

    // a receipt hangs out under the hull
    const rl = 16 + 5 * Math.sin(t * 1.3);
    ctx.beginPath(); ctx.moveTo(32, 40);
    for (let i = 0; i <= 6; i++) ctx.lineTo(39 + Math.sin(t * 3 + i * 0.9) * (2 * i) / 6, 40 + (rl * i) / 6);
    for (let i = 6; i >= 0; i--) ctx.lineTo(32 + Math.sin(t * 3 + i * 0.9) * (2 * i) / 6, 40 + (rl * i) / 6);
    ctx.closePath(); fill(ctx, '#f4f6ff'); stroke(ctx, INK, 1);
    ctx.beginPath(); for (let i = 1; i <= 3; i++) { const y = 42 + (rl * i) / 4, x = 33.5 + Math.sin(t * 3 + i * 1.5) * 0.8; ctx.moveTo(x, y); ctx.lineTo(x + 4, y); } stroke(ctx, '#9aa6c9', 0.9);

    // saucer
    for (const s of [-1, 1]) {
      rr(ctx, s > 0 ? hw - 4 : -hw - 6, 23, 10, 9, 2.5); fill(ctx, P.dark); stroke(ctx, INK, 1.5);
      if (hot) flame(ctx, s * (hw + 6), 27.5, 0.6, t + s, s * PI / 2);
    }
    ell(ctx, 0, 38, 60, 10); fill(ctx, P.dark); stroke(ctx, INK, 2.5);
    ell(ctx, 0, 47, 15, 3.5); fill(ctx, beam ? '#e6fbff' : P.rim, beam ? 1 : 0.7 + 0.3 * Math.sin(t * 5)); stroke(ctx, INK, 1.5);
    ell(ctx, 0, 27, hw, 16); ctx.fillStyle = lin(ctx, 0, 11, 0, 43, [[0, P.light], [0.45, P.hull], [1, P.dark]]); ctx.fill(); stroke(ctx, INK, 3);
    ctx.beginPath(); ctx.ellipse(0, 29, 80, 9, 0, 0, PI); stroke(ctx, P.rim, 2.5);
    ctx.beginPath(); for (const x of [-62, -32, 32, 62]) { ctx.moveTo(x, 16 + Math.abs(x) * 0.06); ctx.lineTo(x * 1.06, 22 + Math.abs(x) * 0.04); } stroke(ctx, P.dark, 1.3);
    ctx.save(); ctx.translate(-56, 24); ctx.rotate(-0.3);
    circ(ctx, 0, 0, 7.5); stroke(ctx, RED, 1.4, 0.9); circ(ctx, 0, 0, 5.8); stroke(ctx, RED, 0.8, 0.9);
    txt(ctx, P.stampText, 0, 0.3, P.stampText.length > 3 ? 4.2 : 5, RED);
    ctx.restore();
    // running lights; one is broken in phase 2; all flash red when enraged
    const chase = Math.floor(t * 6);
    for (let i = 0; i < 7; i++) {
      const a = PI * (0.1 + (i * 0.8) / 6), x = Math.cos(a) * 80, y = 29 + Math.sin(a) * 9;
      const dead = hurt && i === 2, on = !dead && (hot ? Math.sin(t * 12) > 0 : (i + chase) % 3 === 0);
      if (on) { circ(ctx, x, y, 6.5); fill(ctx, hot ? RED : P.lamp, 0.3); }
      circ(ctx, x, y, 3.6); fill(ctx, dead ? INK : on ? (hot ? RED : P.lamp) : P.lampOff); stroke(ctx, INK, 1.2);
      if (on) { circ(ctx, x - 1, y - 1, 1.2); fill(ctx, WHITE); }
      if (dead && frac(t * 2.5) < 0.3) { ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x - 3, y - 9); ctx.moveTo(x + 2, y - 4); ctx.lineTo(x + 5, y - 8); stroke(ctx, GOLD, 1.4); }
    }
    if (hurt) {
      ell(ctx, -30, 19, 6, 2.6, 0.1); fill(ctx, P.dark, 0.6);
      plaster(ctx, 44, 19, 0.6, -0.2);
      steam(ctx, -hw + 6, 22, t, -1, '#7a8099');
    }
    if (hot) { vein(ctx, 26, -4, 0.7, t); for (const s of [-1, 1]) steam(ctx, s * 16, -10, t, s); }
    if (o.frozen) icicles(ctx, -56, 56, 46, o.time);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // 6. Gullet, the Coin Purse: a fat purse with a brass kiss-lock clasp for a mouth, small arms and stubby legs. He
  // fills his box: game.js makes B.w larger for each coin in him. Optional fields (a cameo has none of them):
  // B.open = 0..1 how far the clasp is open, B.full = 0..1 how full he is, B.gulpT and B.hicT = seconds left of a
  // gulp (from PURSE_GULP_S) and of a hiccup (from PURSE_HIC_S). Phase 3: the clasp is broken and hangs open.
  // alt 1 = second hand: faded, patched, a safety pin, a dull clasp. alt 2 = evening bag: violet velvet, gold, jewels.
  const PURSE = [
    { hide: '#9a6232', light: '#c98d55', dark: '#5e3519', brass: '#e2b23e', brassL: '#fff0a6', brassD: '#946410', stitch: '#f2d9a6',
      mouth: '#2a0f16', cheek: '#ff8a7a', lid: '#9a6232' },
    { hide: '#8f7a62', light: '#b8a386', dark: '#54463a', brass: '#b9a46e', brassL: '#e6dcb4', brassD: '#6e6040', stitch: '#e9e1c6',
      mouth: '#23160f', cheek: '#d98a7a', lid: '#8f7a62', patch: '#6a8a9a', patch2: '#a8553a' },
    { hide: '#5b2384', light: '#9b5ccc', dark: '#2a0c40', brass: GOLD, brassL: '#fff6c0', brassD: '#a87400', stitch: '#e8d6ff',
      mouth: '#12061c', cheek: '#ff6ad0', lid: '#3a8fd0', gem: '#ff2a6d', gem2: '#2fd6ff', gem3: '#7cf2a8', pearl: '#f4f0ff' },
  ];
  const PURSE_GULP_S = 0.6, PURSE_HIC_S = 0.3;
  const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));
  // The leather, from the frame at y0 down to the feet.
  function purseBody(ctx, hw, fw, y0, h) {
    ctx.beginPath(); ctx.moveTo(-fw, y0);
    ctx.bezierCurveTo(-hw - 3, y0 + 6, -hw - 1, h - 16, -hw * 0.72, h - 9);
    ctx.quadraticCurveTo(0, h - 3, hw * 0.72, h - 9);
    ctx.bezierCurveTo(hw + 1, h - 16, hw + 3, y0 + 6, fw, y0);
    ctx.closePath();
  }
  function gem(ctx, x, y, r, c) {
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
    fill(ctx, c); stroke(ctx, INK, 1);
    circ(ctx, x - r * 0.3, y - r * 0.3, r * 0.25); fill(ctx, WHITE, 0.8);
  }
  function knob(ctx, x, y, P, c) {
    circ(ctx, x, y, 4.2); fill(ctx, c || P.brass); stroke(ctx, INK, 1.3);
    circ(ctx, x - 1.3, y - 1.3, 1.3); fill(ctx, P.brassL, 0.9);
  }
  // The kiss-lock frame. The lower jaw is fixed; the upper jaw opens with `open`. Broken: the right hinge is gone, the
  // upper jaw hangs from the left hinge and its knob is lost.
  function purseClasp(ctx, P, fw, y0, open, broken, t, alt) {
    const cy = y0 - 4 - open * 34, ex = broken ? fw * 0.82 : fw, ey = broken ? y0 + 9 + Math.sin(t * 5) * 2 : y0;
    const jaw = () => { ctx.beginPath(); ctx.moveTo(-fw, y0); ctx.quadraticCurveTo(0, cy, ex, ey); };
    const lip = () => { ctx.beginPath(); ctx.moveTo(-fw, y0); ctx.quadraticCurveTo(0, y0 + 4, fw, y0); };
    const mouth = () => { jaw(); ctx.lineTo(fw, y0); ctx.quadraticCurveTo(0, y0 + 4, -fw, y0); ctx.closePath(); };
    if (open > 0.04 || broken) {
      mouth(); fill(ctx, P.mouth);
      ctx.save(); mouth(); ctx.clip();
      for (let i = 0; i < 3; i++) { ell(ctx, (i - 1) * fw * 0.42, y0 - 3 - open * 7 + (i % 2) * 4, 6, 3); fill(ctx, GOLD, 0.85); stroke(ctx, '#7a5300', 1); }
      if (open > 0.5) { ell(ctx, 0, y0 + 1, fw * 0.32, 6 * open); fill(ctx, '#ff7a9a'); stroke(ctx, INK, 1.2); }
      if (broken) {
        ctx.beginPath();
        for (let x = -fw * 0.75; x < fw * 0.75; x += 9) { ctx.moveTo(x, y0 + 2); ctx.lineTo(x + 4.5, y0 - 5); ctx.lineTo(x + 9, y0 + 2); }
        fill(ctx, WHITE); stroke(ctx, INK, 0.8);
      }
      ctx.restore();
    }
    for (const [c, lw] of [[INK, 7], [P.brass, 4]]) { lip(); stroke(ctx, c, lw); }
    ctx.beginPath(); ctx.moveTo(-fw * 0.7, y0 + 0.6); ctx.quadraticCurveTo(-fw * 0.2, y0 + 2.6, fw * 0.2, y0 + 2); stroke(ctx, P.brassL, 1.2, 0.7);
    for (const [c, lw] of [[INK, 7], [P.brass, 4]]) { jaw(); stroke(ctx, c, lw); }
    if (alt === 1) { ctx.beginPath(); for (const x of [-0.6, -0.15, 0.45]) { const px = x * fw; ctx.moveTo(px + 1.6, y0 + 1.5); ctx.arc(px, y0 + 1.5, 1.6, 0, TAU); } fill(ctx, P.brassD, 0.8); }
    // hinges and knobs
    circ(ctx, -fw, y0, 4); fill(ctx, P.brassD); stroke(ctx, INK, 1.4);
    if (broken) {
      ctx.beginPath(); ctx.moveTo(fw, y0); for (let i = 1; i <= 5; i++) ctx.lineTo(fw + (i % 2 ? 3 : -1), y0 - i * 2.4); stroke(ctx, P.brassD, 1.4);
      circ(ctx, ex, ey, 2.6); fill(ctx, P.brassD); stroke(ctx, INK, 1.2);
    } else { circ(ctx, fw, y0, 4); fill(ctx, P.brassD); stroke(ctx, INK, 1.4); }
    const mx = (-fw + ex) / 4, my = (y0 + 2 * cy + ey) / 4;
    line(ctx, 3.5, y0 + 1, 3.5, y0 - 4); stroke(ctx, P.brassD, 2);
    knob(ctx, 3.5, y0 - 5, P, alt === 2 ? P.gem : null);
    if (!broken) { line(ctx, mx - 3.5, my, mx - 3.5, my - 4); stroke(ctx, P.brassD, 2); knob(ctx, mx - 3.5, my - 5, P, alt === 2 ? P.gem2 : null); }
    if (alt === 2) for (const u of [0.22, 0.78]) {
      const q = 1 - u, gx = u * u * ex - q * q * fw, gy = q * q * y0 + 2 * q * u * cy + u * u * ey;
      gem(ctx, gx, gy, 3, P.gem3);
    }
  }
  function gullet(ctx, B, env, o) {
    const P = PURSE[o.alt], { w, h, t, look, hot, hurt } = o, hw = w / 2, st = B.state;
    const aim = st === 'aim', drop = st === 'drop', rest = st === 'rest', rise = st === 'rise', inhale = st === 'inhale';
    const open = hot ? 1 : clamp01(B.open), full = clamp01(B.full);
    const gulp = clamp01((B.gulpT || 0) / PURSE_GULP_S), hic = clamp01((B.hicT || 0) / PURSE_HIC_S);
    const y0 = 14, fw = hw * 0.78, ex = Math.min(hw * 0.32, 28), ey = 31;
    if (aim) {
      // the belly flop warning: arrows that run down below him
      for (let i = 0; i < 3; i++) {
        const on = (((Math.floor(t * 9) - i) % 3) + 3) % 3 === 0, y = h + 6 + i * 7;
        ctx.beginPath(); ctx.moveTo(-9, y); ctx.lineTo(0, y + 5); ctx.lineTo(9, y); stroke(ctx, RED, 3, on ? 1 : 0.3);
      }
      ctx.translate(Math.sin(t * 60) * 1.2, 0);
    }
    if (drop) {
      ctx.beginPath(); for (const u of [-0.6, -0.2, 0.2, 0.6]) { ctx.moveTo(u * hw, -4); ctx.lineTo(u * hw, -14 - (Math.abs(u) < 0.5 ? 10 : 0)); }
      stroke(ctx, WHITE, 2, 0.55);
    }
    ctx.save();
    // squash and stretch about the feet
    let sx = 1, sy = 1;
    if (rest) { sx = 1.1; sy = 0.78; }
    else if (gulp > 0) { sx = 1 + 0.06 * gulp; sy = 1 - 0.08 * gulp; }
    else if (inhale) { const p = 0.03 * Math.sin(t * 10); sx = 1.04 + p; sy = 1.02 - p; }
    else { const b = Math.sin(t * 8) * 0.015; sx = 1 - b; sy = 1 + b; }
    ctx.translate(0, h - hic * 6); ctx.scale(sx, sy); ctx.translate(0, -h);

    // legs; he waddles
    const step = aim || rest ? 0 : Math.sin(t * 8) * 3;
    for (const s of [-1, 1]) {
      const lx = s * hw * 0.34, lift = drop ? 4 + Math.sin(t * 30 + s) * 2 : Math.max(0, s * step), fx = rest ? lx + s * 8 : lx;
      rr(ctx, lx - 5, h - 13 - lift, 10, 9, 3); fill(ctx, P.dark); stroke(ctx, INK, 1.6);
      ell(ctx, fx + s * 2, h - 3.5 - lift, 9, 4.5); fill(ctx, P.dark); stroke(ctx, INK, 1.8);
    }
    // arms
    for (const s of [-1, 1]) {
      let hx = s * (hw + 9), hy = 38 + Math.sin(t * 3 + s) * 3;
      if (aim || drop) { hx = s * (hw + 6); hy = 4 + (drop ? Math.sin(t * 30 + s) * 3 : Math.sin(t * 20) * 1.5); }
      else if (rest) { hx = s * (hw + 14); hy = h - 8; }
      else if (inhale) { hx = s * (hw + 13); hy = 22 + Math.sin(t * 10) * 1.5; }
      else if (hot) hy = 30 + Math.sin(t * 20 + s) * 3;
      line(ctx, s * (hw - 6), 32, hx, hy); stroke(ctx, INK, 7);
      line(ctx, s * (hw - 6), 32, hx, hy); stroke(ctx, P.hide, 4);
      circ(ctx, hx, hy, hot ? 4.6 : 5.2); fill(ctx, WHITE); stroke(ctx, INK, 1.6);
    }

    // the purse
    purseBody(ctx, hw, fw, y0, h);
    ctx.fillStyle = o.alt === 2 ? rad(ctx, -hw * 0.3, y0 + 8, 4, 0, y0 + 16, hw + 10, [[0, P.light], [0.5, P.hide], [1, P.dark]])
      : lin(ctx, 0, y0, 0, h - 4, [[0, P.light], [0.4, P.hide], [1, P.dark]]);
    ctx.fill();
    ctx.save(); purseBody(ctx, hw, fw, y0, h); ctx.clip();
    if (o.alt === 2) {
      // quilted velvet
      ctx.beginPath();
      for (let x = -hw - 40; x < hw + 40; x += 16) { ctx.moveTo(x, y0); ctx.lineTo(x + 40, h); ctx.moveTo(x + 40, y0); ctx.lineTo(x, h); }
      stroke(ctx, P.dark, 1, 0.5);
      ell(ctx, -hw * 0.35, y0 + 12, hw * 0.35, 6, -0.2); fill(ctx, WHITE, 0.16);
    } else {
      ctx.beginPath(); ctx.moveTo(-hw * 0.55, 44); ctx.quadraticCurveTo(-hw * 0.45, 41, -hw * 0.35, 44); ctx.moveTo(hw * 0.3, 22); ctx.quadraticCurveTo(hw * 0.42, 20, hw * 0.52, 23);
      stroke(ctx, P.dark, 1, 0.45);
    }
    // coins that press against the leather
    const bumps = Math.round(full * 6);
    for (let i = 0; i < bumps; i++) {
      const bx = (-0.5 + (i + 0.5) / 6) * w * 0.62, by = h - 15 - (i % 2) * 5;
      circ(ctx, bx, by, 5); stroke(ctx, P.dark, 1.3, 0.55);
      ctx.beginPath(); ctx.arc(bx, by, 3.6, PI * 1.1, PI * 1.6); stroke(ctx, P.light, 1, 0.7);
    }
    // stitches under the frame and along the bottom seam
    ctx.beginPath();
    for (let x = -fw + 6; x < fw - 6; x += 6) { ctx.moveTo(x, y0 + 6); ctx.lineTo(x + 3, y0 + 6); }
    for (let i = 0; i < 16; i++) {
      const a = PI * (0.12 + (i * 0.76) / 15), cx = Math.cos(a) * (hw - 7), cy = (y0 + h - 9) / 2 + Math.sin(a) * ((h - 9 - y0) / 2 - 4);
      ctx.moveTo(cx, cy); ctx.lineTo(cx - Math.sin(a) * 3, cy + Math.cos(a) * 1.2);
    }
    stroke(ctx, P.stitch, 1.3, 0.8);
    if (o.alt === 1) {
      for (const [x, y, pw, ph, r, c] of [[-hw * 0.62, 36, 14, 11, -0.2, P.patch], [hw * 0.38, 18, 12, 9, 0.15, P.patch2]]) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(r);
        rr(ctx, -pw / 2, -ph / 2, pw, ph, 1.5); fill(ctx, c); stroke(ctx, INK, 0.9);
        ctx.beginPath(); for (let i = 0; i < 4; i++) { const px = -pw / 2 + 2 + i * ((pw - 4) / 3); ctx.moveTo(px, -ph / 2 - 1.5); ctx.lineTo(px, -ph / 2 + 1.5); ctx.moveTo(px, ph / 2 - 1.5); ctx.lineTo(px, ph / 2 + 1.5); }
        stroke(ctx, P.stitch, 1);
        ctx.restore();
      }
    }
    if (hot) { purseBody(ctx, hw, fw, y0, h); fill(ctx, RED, 0.12 + 0.08 * Math.sin(t * 8)); }
    ctx.restore();
    purseBody(ctx, hw, fw, y0, h); stroke(ctx, INK, 3);

    // face
    const cover = rest ? 0 : Math.max(o.blink, gulp > 0 ? 0.65 : inhale ? 0.4 : aim ? 0.35 : hot ? 0.22 : rise ? 0.45 : 0);
    const tilt = hot || aim ? 0.42 : drop ? -0.3 : rise ? -0.15 : inhale ? 0.2 : 0.05;
    for (const s of [-1, 1]) {
      if (rest) { ell(ctx, s * ex, ey, 8, 9); fill(ctx, WHITE); stroke(ctx, INK, 2); spiral(ctx, s * ex, ey, 7, t * 6 * s); continue; }
      eye(ctx, s * ex, ey, 8, 9, look, { lid: P.lid, cover, tilt, side: s, pupil: hot ? RED : INK, pr: hic > 0 || drop ? 0.3 : 0.55 });
      brow(ctx, s * ex, ey - 13, 13, tilt * 1.2, s, P.dark, 3);
      if (o.alt === 2) { ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = -PI / 2 + s * (0.5 + i * 0.35); ctx.moveTo(s * ex + Math.cos(a) * 8, ey + Math.sin(a) * 9); ctx.lineTo(s * ex + Math.cos(a) * 12, ey + Math.sin(a) * 13); } stroke(ctx, INK, 1.5); }
    }
    for (const s of [-1, 1]) { ell(ctx, s * (ex + 14), ey + 8, inhale ? 7 : 5, inhale ? 4.5 : 3); fill(ctx, hot ? RED : P.cheek, hot ? 0.35 : 0.45); }
    if (o.alt === 2) gem(ctx, 0, ey + 12, 5, P.gem);
    else { rr(ctx, -8, ey + 8, 16, 9, 2); fill(ctx, P.brass); stroke(ctx, INK, 1.2); txt(ctx, '$', 0, ey + 12.8, 7, P.brassD); }

    // damage: a stitched tear, a patch, a loose button
    if (hurt) {
      crack(ctx, -hw * 0.5, 40, 16, 0.35, P.dark);
      ctx.beginPath(); for (let i = 0; i < 3; i++) { const cx = -hw * 0.5 + 3 + i * 4.5, cy = 40 + i * 1.6; ctx.moveTo(cx - 2, cy - 3); ctx.lineTo(cx + 2, cy + 3); ctx.moveTo(cx + 2, cy - 3); ctx.lineTo(cx - 2, cy + 3); }
      stroke(ctx, P.stitch, 1.2);
      plaster(ctx, ex + 8, ey - 15, 0.5, 0.3);
      const bx = hw * 0.5 + Math.sin(t * 3) * 4, by = h - 2;
      line(ctx, hw * 0.5, h - 12, bx, by - 3); stroke(ctx, INK, 0.8);
      circ(ctx, bx, by, 3.5); fill(ctx, P.brass); stroke(ctx, INK, 1);
      ctx.beginPath(); ctx.moveTo(bx - 0.8, by); ctx.arc(bx - 1.2, by, 0.6, 0, TAU); ctx.moveTo(bx + 1.8, by); ctx.arc(bx + 1.2, by, 0.6, 0, TAU); fill(ctx, INK);
    }
    if (o.alt === 1) {
      ctx.save(); ctx.translate(hw * 0.62, 30); ctx.rotate(0.6);
      line(ctx, -8, 0, 7, 0); stroke(ctx, '#c9d0e0', 1.6);
      ctx.beginPath(); ctx.arc(7, -1.5, 1.8, -PI / 2, PI / 2); stroke(ctx, '#c9d0e0', 1.4);
      rr(ctx, -11, -2.2, 4, 4.4, 1); fill(ctx, '#c9d0e0'); stroke(ctx, INK, 0.8);
      ctx.restore();
    }
    if (o.alt === 2) {
      // a string of pearls from the left hinge
      for (let i = 0; i < 5; i++) { const u = (i + 0.5) / 5; circ(ctx, -fw - u * (hw - fw + 8), y0 + u * 22 + Math.sin(u * PI) * 3, 2.4); fill(ctx, P.pearl); stroke(ctx, INK, 0.8); }
      for (let i = 0; i < 2; i++) twinkle(ctx, i ? hw * 0.5 : -hw * 0.45, i ? 44 : 20, Math.max(0, Math.sin(t * 3 + i * 2.1)) * 4.5);
    }
    purseClasp(ctx, P, fw, y0, open, hot, t, o.alt);
    if (hic > 0) for (let i = 0; i < 3; i++) { circ(ctx, 6 + i * 5, y0 - 10 - (1 - hic) * 14 - i * 6, 2 + i); stroke(ctx, WHITE, 1.4, hic); }
    if (o.frozen) icicles(ctx, -hw * 0.7, hw * 0.7, h - 9, o.time);
    ctx.restore();

    // around him: the pull of an inhale, rage, dizzy stars, sweat
    if (inhale) for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const p = frac(t * 2.4 + i / 3 + (s > 0 ? 0.5 : 0)), x = s * (fw + 8 + (1 - p) * 44), y = y0 - 6 + (i - 1) * 8 * (1 - p);
      line(ctx, x, y, x - s * 11, y - (i - 1) * 1.5); stroke(ctx, WHITE, 2, 0.2 + 0.6 * p);
    }
    if (hot && !rest) { vein(ctx, hw * 0.55, 24, 0.75, t); for (const s of [-1, 1]) steam(ctx, s * fw, y0 - 4, t, s); }
    if (rest) for (let i = 0; i < 3; i++) {
      const a = t * 3 + (i * TAU) / 3;
      star(ctx, Math.cos(a) * hw * 0.45, h * 0.22 - 14 + Math.sin(a) * 4, 5, a); fill(ctx, GOLD); stroke(ctx, INK, 1.2);
    }
    if (rise) sweat(ctx, hw - 18, 18 + Math.sin(t * 6), 1);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const ART = [null, crateKing, twinCannon, baron, queen, auditor, gullet];
  function draw(ctx, B, env) {
    const fn = ART[B.kind];
    if (!fn) return;
    env = env || {};
    const phase = B.phase || 1, t = B.t || 0, frozen = !!env.frozen;
    const o = { w: B.w, h: B.h, t, time: env.time || 0, alt: Math.max(0, Math.min(2, B.alt | 0)), hurt: phase >= 2, hot: phase >= 3,
      look: env.look || 0, blink: frozen ? 0 : blinkAt(t), frozen };
    const xs = env.xs && env.xs.length ? env.xs : [B.x];
    mode = B.flash > 0 ? FLASH : frozen ? FROZEN : NORMAL;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (B.kind === 4) {
      // after the split: two smaller queens; the second one is mirrored, so they face each other
      const s = B.twin ? env.queenSplit || 0.7 : 1;
      xs.forEach((qx, i) => {
        ctx.save(); ctx.translate(qx, B.y); ctx.scale(i ? -s : s, s);
        fn(ctx, B, env, Object.assign({}, o, { w: QUEEN_W, h: QUEEN_H, look: i ? -o.look : o.look, t: t + i * 0.37, blink: frozen ? 0 : blinkAt(t + i * 1.1) }));
        ctx.restore();
      });
    } else {
      ctx.translate(xs[0], B.y);
      fn(ctx, B, env, o);
    }
    ctx.restore();
    mode = NORMAL;
  }

  window.BBBossArt = { draw, hat };
})();
