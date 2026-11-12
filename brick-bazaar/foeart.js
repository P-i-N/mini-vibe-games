'use strict';
/* Brick Bazaar foe art: draws the monsters and the enemy shots. game.js calls window.BBFoeArt.draw and .shot.
   All foe art is drawn for a foe of radius U around (0, 0), then scaled to f.r. All shot art is drawn for radius 8.
   No Math.random here: every animation comes from f.t, f.skin and the special fields, so nothing flickers. */
(() => {
  const TAU = Math.PI * 2;
  const U = 20;
  const INK = '#1b1f33';
  const SIDES = [-1, 1];

  // ---------- per-draw state ----------
  // draw() sets these for the foe that it draws now.
  let c = null;
  let fl = false;       // flash: every colour is white
  let T = 0;            // animation time
  let live = 1;         // 0 when frozen: no wobble, no blinking
  let lx = 0, ly = 1;   // unit vector from the foe to the paddle
  let hurt = false;     // hp under 35 %
  let shut = false;     // the eyes are shut (a blink)
  let alpha = 1;        // the alpha of the whole foe (a phased spook)
  let crownY = -24;     // where the champion crown sits

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const wave = (sp, ph = 0) => Math.sin(T * sp + ph) * live;
  const blinkAt = (ph) => live > 0 && (T + ph) % 3.4 < 0.13;
  // integer hash to 0..1
  const hash = (n) => {
    let h = Math.imul(n | 0, 0x9e3779b1) ^ 0x5bd1e995;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  };
  const backOut = (k) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;

  // ---------- drawing helpers ----------
  const fill = (col) => { c.fillStyle = fl ? '#ffffff' : col; };
  const ink = (col, w) => { c.strokeStyle = fl ? '#ffffff' : col; c.lineWidth = w; };
  const circle = (x, y, r) => { c.beginPath(); c.arc(x, y, Math.abs(r), 0, TAU); c.fill(); };
  const ring = (x, y, r) => { c.beginPath(); c.arc(x, y, Math.abs(r), 0, TAU); c.stroke(); };
  const oval = (x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); c.fill(); };
  const line = (x0, y0, x1, y1) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
  function rrect(x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  const box = (x, y, w, h, r) => { rrect(x, y, w, h, r); c.fill(); };
  function tri(x0, y0, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x2, y2); c.closePath(); c.fill(); }
  function diamond(x, y, w, h) { c.beginPath(); c.moveTo(x, y - h); c.lineTo(x + w, y); c.lineTo(x, y + h); c.lineTo(x - w, y); c.closePath(); c.fill(); }
  function star4(x, y, r) {
    const q = r * 0.3;
    c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + q, y - q); c.lineTo(x + r, y); c.lineTo(x + q, y + q);
    c.lineTo(x, y + r); c.lineTo(x - q, y + q); c.lineTo(x - r, y); c.lineTo(x - q, y - q); c.closePath(); c.fill();
  }
  function heart(x, y, s) {
    c.beginPath(); c.moveTo(x, y + s * 0.9);
    c.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.6, y - s * 1.4, x, y - s * 0.5);
    c.bezierCurveTo(x + s * 0.6, y - s * 1.4, x + s * 1.6, y - s * 0.2, x, y + s * 0.9); c.fill();
  }
  // lightning bolt, top at (x, y)
  function bolt(x, y, s) {
    c.beginPath(); c.moveTo(x + 2 * s, y); c.lineTo(x - 3 * s, y + 7 * s); c.lineTo(x, y + 7 * s); c.lineTo(x - 2 * s, y + 13 * s);
    c.lineTo(x + 4 * s, y + 5 * s); c.lineTo(x + 1 * s, y + 5 * s); c.closePath(); c.fill();
  }
  // p = flat list x0, y0, x1, y1, ...
  function polyline(p) { c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.stroke(); }
  // p = flat list x, y, r, ...: one path of circles (clouds, wool)
  function puffs(p, dx, dy, k) {
    c.beginPath();
    for (let i = 0; i < p.length; i += 3) { const x = p[i] * k + dx, y = p[i + 1] * k + dy, r = p[i + 2] * k; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
    c.fill();
  }
  // a round body: a dark rim at the bottom right, the main colour, a shine
  function ball(x, y, r, main, dark) {
    fill(dark); circle(x, y, r);
    fill(main); circle(x - r * 0.06, y - r * 0.08, r * 0.91);
    fill('rgba(255,255,255,0.35)'); oval(x - r * 0.4, y - r * 0.48, r * 0.3, r * 0.15, -0.5);
  }

  // ---------- faces ----------
  // One eye that looks at the paddle. lid = the skin colour for a blink, iris = optional, pr = pupil size.
  function eye(x, y, r, lid, iris = null, pr = 0) {
    if (shut) {
      fill(lid); circle(x, y, r);
      ink(INK, r * 0.32); c.beginPath(); c.arc(x, y - r * 0.25, r * 0.75, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
      return;
    }
    fill('#ffffff'); circle(x, y, r);
    const px = x + lx * r * 0.36, py = y + ly * r * 0.36;
    if (iris) { fill(iris); circle(px, py, r * 0.62); }
    fill(INK); circle(px, py, r * (pr || (iris ? 0.32 : 0.5)));
    fill('#ffffff'); circle(px - r * 0.2, py - r * 0.22, r * 0.17);
  }
  // tilt > 0: angry (inner ends down), tilt < 0: worried
  function brows(x, y, gap, w, tilt, lw = 1.8) {
    ink(INK, lw); c.beginPath();
    c.moveTo(x - gap - w, y - tilt); c.lineTo(x - gap + w, y + tilt);
    c.moveTo(x + gap + w, y - tilt); c.lineTo(x + gap - w, y + tilt); c.stroke();
  }
  function smile(x, y, w, lw = 1.6) { ink(INK, lw); c.beginPath(); c.arc(x, y - w * 0.5, w, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke(); }
  function frown(x, y, w, lw = 1.6) { ink(INK, lw); c.beginPath(); c.arc(x, y + w * 0.9, w, 1.25 * Math.PI, 1.75 * Math.PI); c.stroke(); }
  function wobbly(x, y, w, lw = 1.4) {
    ink(INK, lw); c.beginPath(); c.moveTo(x - w, y);
    c.quadraticCurveTo(x - w * 0.5, y - w * 0.5, x, y); c.quadraticCurveTo(x + w * 0.5, y + w * 0.5, x + w, y); c.stroke();
  }
  function gape(x, y, rx, ry, tongue = true) {
    fill('#3a0d22'); oval(x, y, rx, ry);
    if (tongue) { fill('#ff6b8a'); oval(x, y + ry * 0.45, rx * 0.6, ry * 0.4); }
  }
  function grin(x, y, w, h) {
    fill('#3a0d22'); c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x, y + h * 2, x + w, y); c.closePath(); c.fill();
    fill('#ffffff'); c.fillRect(x - w * 0.6, y, w * 1.2, h * 0.42);
  }
  function blush(x, y, gap, r) { fill('rgba(255,110,170,0.5)'); oval(x - gap, y, r, r * 0.6); oval(x + gap, y, r, r * 0.6); }
  function sweat(x, y, s) {
    fill('#7cf2ff'); c.beginPath(); c.arc(x, y, 1.6 * s, 0, Math.PI); c.lineTo(x, y - 3.4 * s); c.closePath(); c.fill();
  }
  // a smile, or a wobbly mouth and a drop of sweat when hurt
  function mood(x, y, w) {
    if (hurt) { wobbly(x, y + 1, w * 0.8); sweat(x + w * 3.6, y - w * 3, 1.1); } else smile(x, y, w);
  }

  // ---------- champion ----------
  function champBack() {
    c.globalAlpha = alpha * 0.18; fill('#ffd23f'); circle(0, 0, 26);
    c.globalAlpha = alpha * 0.6; ink('#ffd23f', 2.2); ring(0, 0, 25 + 1.5 * wave(3));
    c.globalAlpha = alpha;
  }
  function champFront() {
    c.globalAlpha = alpha;
    c.save(); c.translate(0, crownY + wave(3) * 0.6); c.rotate(-0.14);
    fill('#ffd23f'); c.beginPath(); c.moveTo(-9, 3); c.lineTo(-10.5, -6); c.lineTo(-5, -1.5); c.lineTo(0, -9.5);
    c.lineTo(5, -1.5); c.lineTo(10.5, -6); c.lineTo(9, 3); c.closePath(); c.fill();
    ink('#b8860b', 1.1); c.stroke();
    fill('#ff4d6d'); circle(0, 0.2, 1.9);
    fill('#5ef0ff'); circle(-5.5, 1, 1.3); circle(5.5, 1, 1.3);
    fill('#fff6c0'); circle(-10.5, -6, 1.3); circle(0, -9.5, 1.5); circle(10.5, -6, 1.3);
    c.restore();
    fill('#ffe066');
    for (let i = 0; i < 3; i++) { const a = T * 1.8 + i * TAU / 3; star4(Math.cos(a) * 27, 3 + Math.sin(a) * 12, 2.6 + Math.sin(T * 6 + i) * 0.8); }
    c.globalAlpha = 1;
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // drifter: a wobbly creature that drifts and knocks the ball off course

  function jelly() {
    const w = wave(4) * 1.6;
    ink('#8a5ae0', 3); c.beginPath();
    for (let i = -1; i <= 1; i++) { c.moveTo(i * 8, 10); c.quadraticCurveTo(i * 9 + wave(5, i) * 4, 19, i * 7 + wave(5, i + 1.5) * 4, 27); }
    c.stroke();
    fill('#7a4fd0'); oval(0, 1, 20 + w, 18 - w);
    fill('#c08cff'); oval(-1, -0.8, 18.6 + w, 16.6 - w);
    fill('rgba(255,255,255,0.45)'); oval(-8, -9, 6, 3, -0.5); circle(10, -5, 1.8); circle(7, 7, 1.2); circle(-12, 5, 1);
    eye(-6.5, -1, 5, '#c08cff'); eye(6.5, -1, 5, '#c08cff');
    blush(0, 5, 12, 3);
    if (hurt) { wobbly(0, 7, 3); sweat(15, -9, 1.2); return; }
    ink(INK, 1.4); c.beginPath(); c.arc(-1.8, 5.5, 1.8, 0, Math.PI); c.arc(1.8, 5.5, 1.8, 0, Math.PI); c.stroke();
  }

  function fuzzball() {
    const w = wave(3);
    ink('#ff8ad8', 2.2); c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU + wave(2, i) * 0.12, r1 = 21 + (i % 2) * 3 + w;
      c.moveTo(Math.cos(a) * 13, Math.sin(a) * 13); c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    }
    c.stroke();
    fill('#ffe0f4'); c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU + wave(2, i) * 0.12, r1 = 21 + (i % 2) * 3 + w, x = Math.cos(a) * r1, y = Math.sin(a) * r1;
      c.moveTo(x + 1.7, y); c.arc(x, y, 1.7, 0, TAU);
    }
    c.fill();
    ball(0, 0, 17, '#ff8ad8', '#c94f9e');
    eye(-5, -1, 4.4, '#ff8ad8'); eye(5, -1, 4.4, '#ff8ad8');
    blush(0, 5, 9.5, 2.6);
    if (hurt) { wobbly(0, 8, 2.5); sweat(12, -8, 1); } else { fill(INK); oval(0, 7, 1.8, 2.2); }
  }

  function moth() {
    const k = live ? 0.55 + 0.45 * Math.abs(Math.sin(T * 9)) : 1;
    for (const s of SIDES) {
      const wx = s * (6 + 10 * k);
      fill('#d98a2b'); oval(wx, -5, 11 * k, 10, s * 0.35);
      fill('#f7b955'); oval(wx, -5.5, 8.5 * k, 7.6, s * 0.35);
      fill('#6b3f8f'); circle(s * (6 + 11 * k), -6, 3.4 * k);
      fill('#ffe7a8'); circle(s * (6 + 11 * k), -6.4, 1.5 * k);
      fill('#d98a2b'); oval(s * (5 + 7 * k), 9, 7 * k, 6, -s * 0.5);
    }
    ink('#7a5320', 1.4); c.beginPath(); c.moveTo(-3, -13); c.quadraticCurveTo(-6, -22, -12, -24); c.moveTo(3, -13); c.quadraticCurveTo(6, -22, 12, -24); c.stroke();
    fill('#ffe7a8'); oval(-12, -24, 3, 1.8, -0.4); oval(12, -24, 3, 1.8, 0.4);
    fill('#c99a3a'); oval(0, 2, 11, 17); fill('#ffd166'); oval(-0.6, 1, 9.8, 15.6);
    ink('#c99a3a', 1.6); c.beginPath(); c.arc(0, 2, 9, 0.2 * Math.PI, 0.8 * Math.PI); c.moveTo(6.5, 11); c.arc(0, 6, 8, 0.25 * Math.PI, 0.75 * Math.PI); c.stroke();
    fill('#fff1c9'); circle(-5, -7, 3.6); circle(0, -8.5, 4); circle(5, -7, 3.6);
    eye(-4.2, -1.5, 4, '#ffd166'); eye(4.2, -1.5, 4, '#ffd166');
    mood(0, 5, 2.4);
    crownY = -27;
  }

  function squid() {
    ink('#2fbf95', 3.2); c.beginPath();
    for (let i = 0; i < 5; i++) { const x = -10 + i * 5; c.moveTo(x, 6); c.quadraticCurveTo(x + wave(5, i) * 4, 16, x * 1.2 + wave(5, i + 2) * 5, 25); }
    c.stroke();
    fill('#2fbf95'); c.beginPath(); c.moveTo(-17, 8); c.quadraticCurveTo(-19, -14, 0, -19); c.quadraticCurveTo(19, -14, 17, 8); c.quadraticCurveTo(0, 14, -17, 8); c.fill();
    fill('#5ef0c0'); c.beginPath(); c.moveTo(-15.5, 6.5); c.quadraticCurveTo(-17, -12.5, -1, -17.5); c.quadraticCurveTo(16, -12.5, 15.5, 6.5); c.quadraticCurveTo(0, 11.5, -15.5, 6.5); c.fill();
    fill('rgba(255,255,255,0.35)'); circle(-9, -8, 2); circle(10, -4, 1.5); circle(-3, -13, 1.2);
    c.save(); c.translate(5, -17); c.rotate(0.3 + wave(2) * 0.05);
    fill('#f4f6ff'); c.beginPath(); c.ellipse(0, 0, 7, 5, 0, Math.PI, 0); c.fill();
    fill('#2f8cff'); c.fillRect(-7, -1.5, 14, 2.2);
    fill('#f4f6ff'); oval(0, 1.2, 8.5, 1.8);
    c.restore();
    eye(-6, -2, 4.6, '#5ef0c0'); eye(6, -2, 4.6, '#5ef0c0');
    mood(0, 5.5, 2.6);
    crownY = -27;
  }

  function peeper() {
    const fw = wave(14);
    for (const s of SIDES) {
      fill('#a8325a'); c.beginPath(); c.moveTo(s * 12, -5); c.lineTo(s * 30, -14 + fw * 6); c.lineTo(s * 26, -4 + fw * 3);
      c.lineTo(s * 29, 2 + fw * 2); c.lineTo(s * 22, 2); c.lineTo(s * 24, 8); c.lineTo(s * 11, 6); c.closePath(); c.fill();
    }
    fill('#d9b3c4'); circle(0, 0, 18); fill('#fff7fa'); circle(-1, -1.5, 16.5);
    ink('#ff6b8a', 1); c.beginPath();
    c.moveTo(-16, 4); c.lineTo(-11, 3); c.lineTo(-8, 6); c.moveTo(15, -6); c.lineTo(11, -4); c.lineTo(9, -7); c.moveTo(4, 15); c.lineTo(3, 11); c.lineTo(6, 9);
    if (hurt) { c.moveTo(-13, -9); c.lineTo(-9, -7); c.lineTo(-9, -3); c.moveTo(12, 9); c.lineTo(9, 7); c.lineTo(10, 4); c.moveTo(-5, 15); c.lineTo(-5, 11); }
    c.stroke();
    if (shut) {
      fill('#ff9ab0'); circle(0, 0, 18);
      ink('#a8325a', 2); c.beginPath(); c.arc(0, -4, 15, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
      return;
    }
    const ix = lx * 6, iy = ly * 6;
    fill('#ff6b8a'); circle(ix, iy, 8.5);
    ink('#c73a64', 1.4); ring(ix, iy, 7.6);
    fill(INK); circle(ix, iy, hurt ? 2.8 : 4.2);
    fill('#ffffff'); circle(ix - 2.6, iy - 3, 1.9);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // splitter: two creatures in one big body; it splits into two drifters

  function twins() {
    const w = wave(3) * 1.5;
    fill('#5a33b3'); oval(-8, 1, 13 + w, 17 - w); oval(8, 1, 13 - w, 17 + w);
    fill('#8f5cff'); oval(-8.6, -0.3, 11.8 + w, 15.6 - w); oval(7.4, -0.3, 11.8 - w, 15.6 + w);
    ink('#5a33b3', 2.2); c.beginPath();
    c.moveTo(-9, -15 + w); c.quadraticCurveTo(-14, -24, -6, -23);
    c.moveTo(6, -15 - w); c.lineTo(5, -23); c.moveTo(10, -15 - w); c.lineTo(12, -23); c.stroke();
    ink('#d9c4ff', 1.3); c.beginPath(); c.moveTo(0, -13); c.quadraticCurveTo(1.5, 0, 0, 15);
    for (let y = -9; y <= 11; y += 5) { c.moveTo(-2, y - 1); c.lineTo(2, y + 1); }
    c.stroke();
    fill('rgba(255,255,255,0.35)'); oval(-13, -9, 3.5, 1.8, -0.5); oval(4, -10, 3.5, 1.8, -0.5);
    eye(-12, -3, 3.8, '#8f5cff'); eye(-5, -3, 3.8, '#8f5cff');
    mood(-8.5, 6, 2.6);
    const was = shut; shut = blinkAt(1.9);
    eye(5, -3, 3.8, '#8f5cff'); eye(12, -3, 3.8, '#8f5cff');
    shut = was;
    brows(8.5, -8.5, 3.5, 2.5, 1.2);
    frown(8.5, 7, 2.5);
    crownY = -27;
  }

  function peapod() {
    c.save(); c.rotate(-0.12 + wave(2) * 0.08);
    ink('#3f9b3a', 2.2); c.beginPath(); c.moveTo(23, 0); c.quadraticCurveTo(30, -4, 28, -10); c.quadraticCurveTo(26, -14, 23, -11); c.stroke();
    fill('#3f9b3a'); c.beginPath(); c.moveTo(-25, 0); c.quadraticCurveTo(0, -27, 25, 0); c.quadraticCurveTo(0, 27, -25, 0); c.fill();
    fill('#dfffb8'); c.beginPath(); c.moveTo(-21, 0); c.quadraticCurveTo(0, -17, 21, 0); c.quadraticCurveTo(0, 17, -21, 0); c.fill();
    for (const s of SIDES) {
      const x = s * 9, y = 1 + wave(4, s) * 0.8;
      ball(x, y, 8.5, '#7ee05a', '#4fb82a');
      const was = shut; if (s > 0) shut = blinkAt(1.1);
      eye(x - 3, y - 1, 2.7, '#7ee05a'); eye(x + 3, y - 1, 2.7, '#7ee05a');
      shut = was;
      if (s < 0) mood(x, y + 3.5, 1.8); else gape(x, y + 4, 1.6, 1.8);
    }
    c.restore();
    crownY = -18;
  }

  function cherries() {
    ink('#5a8f2a', 2); c.beginPath(); c.moveTo(-9, -5); c.quadraticCurveTo(-6, -18, 3, -22); c.moveTo(9, -5); c.quadraticCurveTo(8, -16, 3, -22); c.stroke();
    c.save(); c.translate(3, -22); c.rotate(-0.6 + wave(2.5) * 0.15); fill('#7ee05a'); oval(7, 0, 7, 3); ink('#4fb82a', 0.8); line(1, 0, 13, 0); c.restore();
    for (const s of SIDES) {
      const x = s * 9.5, y = 5 + s * wave(4);
      fill('#a31d3a'); circle(x, y, 12); fill('#ff4d6d'); circle(x - 0.8, y - 1, 10.8);
      fill('rgba(255,255,255,0.5)'); oval(x - 4, y - 5, 3, 1.8, -0.5);
      const was = shut; if (s > 0) shut = blinkAt(2.3);
      eye(x - 3.3, y - 1, 3.2, '#ff4d6d'); eye(x + 3.3, y - 1, 3.2, '#ff4d6d');
      shut = was;
      if (s < 0) mood(x, y + 5, 2.2); else { gape(x, y + 5, 2, 1.6, false); fill('#ff8ab0'); oval(x, y + 6.8, 1.6, 2); }
    }
    crownY = -29;
  }

  // two small creatures in one trench coat
  function coatPals() {
    const bob = wave(5);
    fill('#3b2a1a'); oval(-7, 20 + wave(10) * 0.8, 5, 2.5); oval(7, 20 - wave(10) * 0.8, 5, 2.5);
    fill('#8a6a45'); c.beginPath(); c.moveTo(-13, -8); c.lineTo(13, -8); c.lineTo(18, 19); c.lineTo(-18, 19); c.closePath(); c.fill();
    fill('#c8a27a'); c.beginPath(); c.moveTo(-12, -7); c.lineTo(12, -7); c.lineTo(16.5, 18); c.lineTo(-16.5, 18); c.closePath(); c.fill();
    fill('#1a1424'); c.beginPath(); c.moveTo(-2.5, -4); c.lineTo(2.5, -4); c.lineTo(6, 18); c.lineTo(-6, 18); c.closePath(); c.fill();
    if (!blinkAt(0.9)) { fill('#ffe066'); oval(-1.8 + lx, 4 + ly * 0.6, 1.2, 1.6); oval(1.8 + lx, 4 + ly * 0.6, 1.2, 1.6); }
    fill('#6b4f2f'); c.fillRect(-15, 8, 30, 3);
    ink('#ffd23f', 1); c.strokeRect(-2, 7.5, 4, 4);
    fill('#a5835c'); tri(-12, -7, -3, -7, -7, 2); tri(12, -7, 3, -7, 7, 2);
    fill('#3b2a1a'); circle(-6.5, 13, 1.1); circle(-7, 16, 1.1); circle(6.5, 13, 1.1); circle(7, 16, 1.1);
    const hy = -14 + bob;
    fill('#7a4fd0'); oval(0, hy, 10, 8); fill('#c08cff'); oval(-0.5, hy - 0.5, 9, 7);
    eye(-3.6, hy - 1.5, 2.9, '#c08cff'); eye(3.6, hy - 1.5, 2.9, '#c08cff');
    fill('#3b2a1a'); oval(-2.4, hy + 3, 2.8, 1.2, 0.2); oval(2.4, hy + 3, 2.8, 1.2, -0.2);
    fill('#3b2a1a'); oval(0, hy - 6.5, 12, 2.4); box(-6.5, hy - 13.5, 13, 7.5, 2.5);
    fill('#ff5c5c'); c.fillRect(-6.5, hy - 9, 13, 1.6);
    if (hurt) sweat(13, hy, 1.1);
    crownY = hy - 18;
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // shooter: spits slime at the paddle. windup 0..1 in the last 0.6 s before a shot.

  const windup = (f) => { const cd = f.cd ?? 9; return cd < 0.6 ? clamp(1 - cd / 0.6, 0, 1) : 0; };
  function slimeIn(x, y, r) { fill('#9cff57'); oval(x, y, r, r * 0.75); fill('#e0ffc4'); circle(x - r * 0.3, y - r * 0.25, r * 0.25); }

  function toad(f) {
    const wd = windup(f), sq = wave(3) * 0.8;
    fill('#c46a24'); oval(-12, 16, 6, 3); oval(12, 16, 6, 3);
    fill('#c46a24'); oval(0, 3, 21 + wd * 1.5, 16 - sq);
    fill('#ff9a4d'); oval(-0.8, 2, 19.5 + wd * 1.5, 14.5 - sq);
    fill('#ffd9a8'); oval(0, 9, 12, 6);
    fill('#e07a2e'); circle(-15, 0, 2.2); circle(15, 3, 1.8); circle(-10, 8, 1.4); circle(13, -4, 1.4);
    for (const s of SIDES) { fill('#c46a24'); circle(s * 9, -11, 7.5); fill('#ff9a4d'); circle(s * 9 - 0.5, -11.5, 6.8); }
    eye(-9, -11, 5, '#ff9a4d', '#ffd23f'); eye(9, -11, 5, '#ff9a4d', '#ffd23f');
    if (wd > 0) { fill('#ffe2c4'); oval(0, 10 + wd * 3, 6 + 7 * wd, 3 + 6 * wd); fill('#ffb070'); circle(-15, 3, 2 + 4 * wd); circle(15, 3, 2 + 4 * wd); }
    if (wd > 0.15) { gape(0, 2, 4 + 6 * wd, 1.5 + 4 * wd, false); slimeIn(0, 2.5 + wd, 1 + 3 * wd); brows(0, -18, 9, 3, 1.5); }
    else { ink(INK, 1.6); c.beginPath(); c.moveTo(-11, 1); c.quadraticCurveTo(0, hurt ? 0 : 6, 11, 1); c.stroke(); if (hurt) sweat(18, -12, 1.2); }
    crownY = -20;
  }

  const SPINES = [-10, -16, -12, -6, -10, 2, 10, -14, 12, -4, 9, 3, -4, -22, 4, -21];
  function cactusArms() { c.beginPath(); c.moveTo(-11, 0); c.lineTo(-18, 0); c.lineTo(-18, -9 - wave(3) * 2); c.moveTo(11, 3); c.lineTo(17, 3); c.lineTo(17, -3 + wave(3, 1) * 2); c.stroke(); }
  function cactus(f) {
    const wd = windup(f), sw = 1 + 0.08 * wd;
    ink('#2a8f5a', 6); cactusArms(); ink('#3fbf7f', 3.4); cactusArms();
    fill('#a8532c'); c.beginPath(); c.moveTo(-12, 9); c.lineTo(12, 9); c.lineTo(9, 21); c.lineTo(-9, 21); c.closePath(); c.fill();
    fill('#d9733f'); box(-13.5, 7, 27, 5, 1.5);
    fill('#ffd23f'); circle(-5, 16, 1.1); circle(0, 17, 1.1); circle(5, 16, 1.1);
    c.save(); c.translate(0, 8); c.scale(sw, sw);
    fill('#2a8f5a'); oval(0, -10, 13, 16); fill('#3fbf7f'); oval(-0.8, -11, 11.5, 14.5);
    ink('#2a8f5a', 1.1); c.beginPath(); c.ellipse(0, -10, 6, 15, 0, 0, TAU); c.moveTo(0, -25); c.lineTo(0, 5); c.stroke();
    ink('#f4f6ff', 0.9); c.beginPath();
    for (let i = 0; i < SPINES.length; i += 2) { const x = SPINES[i], y = SPINES[i + 1] + 8; c.moveTo(x, y); c.lineTo(x * 1.2, y - 1.6); }
    c.stroke();
    c.restore();
    fill('#ff7ad9');
    for (let i = 0; i < 5; i++) { const a = i * TAU / 5 + T * wd * 8; circle(2 + Math.cos(a) * 3.4, -19 + Math.sin(a) * 3.4, 2.7); }
    fill('#ffe066'); circle(2, -19, 2);
    eye(-5, -5, 3.8, '#3fbf7f'); eye(5, -5, 3.8, '#3fbf7f');
    fill('rgba(255,110,170,0.6)'); circle(-9, 1, 1.8 + 2.5 * wd); circle(9, 1, 1.8 + 2.5 * wd);
    if (wd > 0.15) { gape(0, 3, 2 + 3 * wd, 1.5 + 3 * wd, false); slimeIn(0, 3.5, 1 + 2 * wd); brows(0, -11, 5, 2.5, 1.5); }
    else mood(0, 3, 3);
    crownY = -27;
  }

  function puffer(f) {
    const wd = windup(f), R = 15 + 5 * wd, d = f.dir < 0 ? -1 : 1;
    c.save(); c.scale(d, 1); if (d < 0) lx = -lx;
    fill('#2f8fd0'); c.beginPath(); c.moveTo(-R + 2, 0); c.lineTo(-R - 9, -7 + wave(8) * 3); c.lineTo(-R - 6, 0); c.lineTo(-R - 9, 7 + wave(8) * 3); c.closePath(); c.fill();
    tri(-4, -R + 1, 4, -R - 6 - wave(6) * 1.5, 6, -R + 2);
    ink('#e6f6ff', 1.6); c.beginPath();
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, l = R + 2 + 6 * wd; c.moveTo(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9); c.lineTo(Math.cos(a) * l, Math.sin(a) * l); }
    c.stroke();
    ball(0, 0, R, '#5ec8ff', '#2f8fd0');
    fill('#d6f2ff'); oval(0, R * 0.42, R * 0.7, R * 0.42);
    fill('#2f8fd0'); circle(-R * 0.5, -R * 0.2, 1.5); circle(-R * 0.3, -R * 0.55, 1.2); circle(-R * 0.65, R * 0.15, 1.1);
    fill('#2f8fd0'); oval(-3, 4, 5, 3, 0.4 + wave(10) * 0.4);
    eye(1, -4, 4, '#5ec8ff'); eye(9, -4.5, 4.4, '#5ec8ff');
    if (hurt && !wd) sweat(-6, -12, 1);
    fill('#ff8ab0'); oval(R - 1.5, 4, 2.5 + wd * 1.5, 2 + 2 * wd);
    fill('#3a0d22'); oval(R - 1.5, 4, 1 + wd, 0.8 + 1.2 * wd);
    if (wd > 0.5) slimeIn(R - 1.5, 4, wd * 1.4);
    c.restore();
    crownY = -R - 5;
  }

  function tubaGob(f) {
    const wd = windup(f);
    for (const s of SIDES) {
      fill('#6a4fc9'); tri(s * 12, -10, s * 27, -16 + wave(3, s) * 2, s * 14, -1);
      fill('#ff9ab0'); tri(s * 14, -8, s * 23, -13 + wave(3, s) * 2, s * 15, -3);
    }
    ball(0, 0, 18, '#a07bff', '#6a4fc9');
    fill('#ff4d6d'); c.beginPath(); c.moveTo(-6, -15); c.lineTo(6, -15); c.lineTo(4.5, -22); c.lineTo(-4.5, -22); c.closePath(); c.fill();
    ink('#ffd23f', 1); c.beginPath(); c.moveTo(0, -22); c.quadraticCurveTo(5 + wave(4) * 2, -22, 6 + wave(4) * 3, -16); c.stroke();
    eye(-6, -6, 4.4, '#a07bff'); eye(6, -6, 4.4, '#a07bff');
    if (wd > 0.5) brows(0, -12, 6, 3, 1.4);
    fill('#c9b0ff'); circle(-7, 3, 2.5 + 5 * wd); circle(7, 3, 2.5 + 5 * wd);
    blush(0, 3, 7, 2 + 2 * wd);
    ink('#b8860b', 4.5); line(0, 5, 0, 16); ink('#ffd23f', 2.6); line(0, 5, 0, 16);
    fill('#ffe066'); circle(-1.8, 9, 1.2); circle(-1.8, 12, 1.2);
    fill('#ffd23f'); c.beginPath(); c.moveTo(-2.5, 15); c.lineTo(2.5, 15); c.lineTo(7 + 2 * wd, 24); c.lineTo(-7 - 2 * wd, 24); c.closePath(); c.fill();
    fill('#b8860b'); oval(0, 24, 7 + 2 * wd, 2);
    if (wd > 0.3) slimeIn(0, 24, 1 + 3 * wd);
    fill('#a07bff'); circle(-4, 13, 2.6); circle(4, 11, 2.6);
    if (hurt) sweat(15, -10, 1.1);
    crownY = -27;
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // mender: repairs damaged bricks every 3.5 s. It swings its tool in the last 0.5 s.

  function toolSwing(f) {
    const cd = f.cd ?? 9;
    return cd < 0.5 ? Math.sin(clamp((0.5 - cd) / 0.5, 0, 1) * Math.PI * 3) * 0.9 : wave(2) * 0.15;
  }
  const working = (f) => (f.cd ?? 9) < 0.5;

  function nurse(f) {
    const sw = toolSwing(f);
    fill('#2fae62'); oval(0, 1, 19, 18); fill('#5ee08a'); oval(-0.8, 0, 17.5, 16.5);
    fill('rgba(255,255,255,0.35)'); oval(-8, -9, 5, 2.4, -0.5);
    fill('#f4f6ff'); c.beginPath(); c.moveTo(-10, -13); c.lineTo(10, -13); c.lineTo(8, -23); c.lineTo(-8, -23); c.closePath(); c.fill();
    fill('#ff4d6d'); c.fillRect(-1.2, -22, 2.4, 7); c.fillRect(-3.5, -19.7, 7, 2.4);
    ink('#3b4a7a', 1.5); c.beginPath(); c.moveTo(-8, 5); c.quadraticCurveTo(0, 15, 8, 5); c.moveTo(3, 10); c.lineTo(5, 14); c.stroke();
    fill('#c9d0ff'); circle(5, 15, 2.3);
    eye(-6, -4, 4.2, '#5ee08a'); eye(6, -4, 4.2, '#5ee08a');
    blush(0, 1, 10, 2.4);
    mood(0, 3.5, 2.6);
    c.save(); c.translate(15, 2); c.rotate(-0.4 + sw);
    fill('#ffcf9e'); box(-3, -16, 6, 16, 2.5);
    fill('#f4e3cc'); c.fillRect(-2.2, -10, 4.4, 5);
    fill('#d9a066'); circle(-1, -13.5, 0.6); circle(1, -13.5, 0.6); circle(-1, -2.5, 0.6); circle(1, -2.5, 0.6);
    c.restore();
    fill('#5ee08a'); circle(15, 3, 3.2);
    fill('#ff4d6d'); heart(-18, 5, working(f) ? 4.5 + Math.sin(T * 20) : 3.6);
    if (working(f)) { fill('#ffe066'); star4(22, -14, 3.5); star4(-22, -6, 2.5); }
    crownY = -28;
  }

  function builder(f) {
    const sw = toolSwing(f);
    ball(0, 1, 19, '#ffb84d', '#c9762a');
    fill('#2f6fd0'); c.beginPath(); c.moveTo(-15.5, 8); c.lineTo(15.5, 8); c.quadraticCurveTo(13, 18, 0, 19.5); c.quadraticCurveTo(-13, 18, -15.5, 8); c.closePath(); c.fill();
    c.fillRect(-9, 1, 2.5, 8); c.fillRect(6.5, 1, 2.5, 8);
    fill('#ffd23f'); circle(-7.7, 8, 1.2); circle(7.7, 8, 1.2);
    fill('#ffd23f'); c.beginPath(); c.ellipse(0, -11, 14, 10, 0, Math.PI, 0); c.fill(); box(-17, -12.5, 34, 3.5, 1.5);
    fill('#e0b020'); c.fillRect(-1.5, -21, 3, 9);
    eye(-6, -5, 3.8, '#ffb84d'); eye(6, -5, 3.8, '#ffb84d');
    fill('#5a3b12'); oval(-6, -9.5, 3.5, 1.3, hurt ? 0.3 : -0.15); oval(6, -9.5, 3.5, 1.3, hurt ? -0.3 : 0.15);
    oval(-4, 1.5, 5, 2.4, -0.2); oval(4, 1.5, 5, 2.4, 0.2);
    if (hurt) { frown(0, 6, 2); sweat(16, -8, 1.1); }
    c.save(); c.translate(16, 4); c.rotate(-0.6 + sw * 1.4);
    fill('#a8532c'); c.fillRect(-1.3, -16, 2.6, 16);
    fill('#8a9bb8'); box(-6, -21, 12, 6, 1.5);
    fill('#c9d0ff'); c.fillRect(-5, -21, 10, 1.5);
    c.restore();
    fill('#ffb84d'); circle(16, 4, 3.2);
    if (working(f)) { fill('#ffe066'); star4(24, -16, 3.5); star4(20, -22, 2); }
    crownY = -27;
  }

  const ZIGZAG = [-5, 3, -3, 1.5, -1, 3, 1, 1.5, 3, 3, 5, 1.5];
  function robot(f) {
    const sw = toolSwing(f), hov = wave(3) * 1.2;
    c.save(); c.translate(0, hov);
    fill('#ffd23f'); tri(-4, 15, 4, 15, 0, 23 + wave(30) * 2.5);
    fill('#ff7a3d'); tri(-2, 15, 2, 15, 0, 19 + wave(30) * 1.5);
    fill('#5d6b80'); box(-6, 12, 12, 5, 2);
    fill('#5d6b80'); box(-21, -6, 4, 8, 1.2); box(17, -6, 4, 8, 1.2);
    ink('#5d6b80', 1.6); line(0, -16, 0, -22);
    fill(working(f) && Math.floor(T * 10) % 2 ? '#ff4d6d' : '#ffd23f'); circle(0, -23, 2.4);
    fill('#5d6b80'); box(-18, -16, 36, 30, 8);
    fill('#9fb4d8'); box(-17, -16, 34, 28, 7);
    fill('#14203a'); box(-13, -11, 26, 17, 4);
    fill('#5d6b80'); circle(-15, -13, 1.1); circle(15, -13, 1.1); circle(-15, 9, 1.1); circle(15, 9, 1.1);
    const ex = lx * 2.5, ey = ly * 1.6;
    if (shut) { ink('#7cff9e', 1.4); line(-8 + ex, -3 + ey, -3 + ex, -3 + ey); line(3 + ex, -3 + ey, 8 + ex, -3 + ey); }
    else { fill('#7cff9e'); box(-8 + ex, -7 + ey, 5, 6, 2); box(3 + ex, -7 + ey, 5, 6, 2); }
    ink(hurt ? '#ff5c5c' : '#7cff9e', 1.3);
    if (hurt) polyline(ZIGZAG);
    else { c.beginPath(); c.arc(0, 0, 4, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke(); }
    c.save(); c.translate(21, 4); c.rotate(-0.3 + sw * 1.2);
    fill('#c9d0ff'); c.fillRect(-1.4, -14, 2.8, 14); circle(0, -15, 3.6);
    fill('#14203a'); c.fillRect(-1.2, -19.5, 2.4, 4.5);
    c.restore();
    fill('#5d6b80'); circle(21, 4, 2.6);
    if (working(f)) { fill('#ffe066'); star4(27, -14, 3); star4(-24, -12, 2.2); }
    c.restore();
    crownY = -29 + hov;
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // thief: steals falling coins into a sack. fleeing = it flies up and away with the loot.

  function sack(x, y, loot) {
    const n = Math.min(loot | 0, 20), r = loot > 0 ? 6 + n * 0.45 : 3.6;
    ink('#5a3b12', 1.4); line(0, -4, x, y - r);
    fill('#7a5320'); oval(x, y + 0.5, r * 1.05, r);
    fill('#b07a3a'); oval(x - r * 0.12, y, r * 0.9, r * 0.85);
    fill('#7a5320'); c.beginPath(); c.moveTo(x - r * 0.35, y - r * 0.8); c.lineTo(x + r * 0.35, y - r * 0.8); c.lineTo(x + r * 0.55, y - r * 1.3); c.lineTo(x - r * 0.55, y - r * 1.3); c.closePath(); c.fill();
    if (n > 4) { fill('#ffd84a'); circle(x - r * 0.22, y - r * 1.35, r * 0.27); circle(x + r * 0.2, y - r * 1.42, r * 0.24); }
    ink('#ffd23f', 1.1); line(x - r * 0.42, y - r * 0.85, x + r * 0.42, y - r * 0.85);
    fill('#3a2600'); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold ' + (loot > 0 ? r * 1.15 + 2 : 5).toFixed(1) + 'px system-ui, sans-serif';
    c.fillText(loot > 0 ? String(loot) : '$', x - r * 0.1, y + r * 0.08);
  }
  function thief(f, fn) {
    const flee = !!f.fleeing, d = f.dir < 0 ? -1 : 1;
    if (flee) {
      lx = 0; ly = -1;
      ink('rgba(255,255,255,0.35)', 1.5); c.beginPath();
      for (let i = 0; i < 4; i++) { const x = -9 + i * 6, y = 17 + ((T * 60 + i * 7) % 10); c.moveTo(x, y); c.lineTo(x, y + 7); }
      c.stroke();
    }
    c.save(); if (flee) c.translate(wave(16) * 1.2, 0);
    fn(f, d, flee);
    c.restore();
    sack(-d * 15, -8 + (flee ? wave(16) * 1.5 : wave(3) * 0.8), f.loot | 0);
  }

  function coon(f, d, flee) {
    c.save(); c.translate(d * 14, 8); c.rotate(d * (0.9 + wave(4) * 0.2));
    fill('#5d6380'); oval(0, -9, 4.5, 10);
    fill('#2a2e44'); oval(0, -13, 4.3, 1.4); oval(0, -8, 4.5, 1.4); oval(0, -3, 4, 1.4);
    c.restore();
    fill('#2a2e44'); oval(-6, 18 + (flee ? wave(20) * 2 : 0), 3.5, 2); oval(6, 18 - (flee ? wave(20) * 2 : 0), 3.5, 2);
    for (const s of SIDES) { fill('#5d6380'); circle(s * 12, -13, 5.5); fill('#ff9ab0'); circle(s * 12, -13, 2.8); }
    ball(0, 0, 18, '#8b93b8', '#5d6380');
    fill('#e6e8f5'); oval(0, 6, 9, 6);
    fill(INK); c.beginPath(); c.moveTo(-17, -6); c.quadraticCurveTo(0, -12, 17, -6); c.lineTo(15, 1); c.quadraticCurveTo(0, -3, -15, 1); c.closePath(); c.fill();
    eye(-6.5, -4, 3.6, INK); eye(6.5, -4, 3.6, INK);
    fill(INK); oval(0, 3, 2.4, 1.6);
    if (flee) { grin(0, 6, 4, 2.6); sweat(-14, -14, 1); }
    else { ink(INK, 1.4); c.beginPath(); c.moveTo(-3, 7); c.quadraticCurveTo(1, 9.5, 4.5, 6); c.stroke(); brows(0, -11, 6.5, 3, hurt ? -1.2 : 1); }
    crownY = -24;
  }

  function magpie(f, d, flee) {
    const fw = flee ? wave(22) : wave(3) * 0.3;
    fill('#24305e'); c.beginPath(); c.moveTo(-d * 8, 10); c.lineTo(-d * 22, 22); c.lineTo(-d * 17, 25); c.lineTo(-d * 4, 14); c.closePath(); c.fill();
    fill('#6f86ff'); tri(-d * 20, 21, -d * 22, 22, -d * 17, 25);
    for (const s of SIDES) {
      c.save(); c.translate(s * 14, -2); c.rotate(s * (0.4 + fw * 0.7));
      fill('#3a4a99'); oval(s * 5, 0, 9, 5);
      fill('#6f86ff'); oval(s * 5, -1, 6, 2.5);
      fill('#f4f6ff'); oval(s * 9, 1.5, 3, 1.5);
      c.restore();
    }
    ink('#ffb84d', 1.6); c.beginPath(); c.moveTo(-4, 15); c.lineTo(-5, 21); c.moveTo(4, 15); c.lineTo(5, 21); c.stroke();
    ball(0, 0, 17.5, '#2b3566', '#1e2850');
    fill('rgba(111,134,255,0.6)'); oval(-6, -9, 6, 3, -0.5);
    fill('#f4f6ff'); oval(0, 9, 10, 7.5);
    ink('#1e2850', 2); c.beginPath(); c.moveTo(0, -17); c.quadraticCurveTo(3, -23, 7, -21); c.stroke();
    eye(-6, -6, 3.9, '#2b3566', '#ff4d6d'); eye(6, -6, 3.9, '#2b3566', '#ff4d6d');
    fill('#ffb84d');
    if (flee) { tri(-3.5, -1, 3.5, -1, 0, 3); tri(-3, 3.5, 3, 3.5, 0, 6.5); }
    else tri(-3.5, -1, 3.5, -1, 0, 5);
    fill('#fff6e0'); for (let i = 0; i < 5; i++) circle(-8 + i * 4, 6 + (2 - Math.abs(i - 2)) * 1.4, 1.5);
    if (hurt) sweat(14, -12, 1.1);
    crownY = -24;
  }

  function hoodie(f, d, flee) {
    fill('#f4f6ff'); oval(-6, 18 + (flee ? wave(20) * 2 : 0), 4, 2.2); oval(6, 18 - (flee ? wave(20) * 2 : 0), 4, 2.2);
    fill('#1f6b55'); c.beginPath(); c.moveTo(-18, 13); c.quadraticCurveTo(-21, -14, 0, -25); c.quadraticCurveTo(21, -14, 18, 13); c.quadraticCurveTo(0, 20, -18, 13); c.closePath(); c.fill();
    fill('#4fd1a6'); c.beginPath(); c.moveTo(-16.5, 11.5); c.quadraticCurveTo(-19.5, -13, -1, -23); c.quadraticCurveTo(18.5, -13, 16, 11.5); c.quadraticCurveTo(0, 17.5, -16.5, 11.5); c.closePath(); c.fill();
    fill('#0b0e1c'); oval(0, -3, 11, 10);
    if (shut) { ink('#ffe066', 1.5); line(-6, -5, -2, -5); line(2, -5, 6, -5); }
    else {
      fill('rgba(255,224,102,0.25)'); circle(-4 + lx * 2, -5 + ly * 1.5, 4.2); circle(4 + lx * 2, -5 + ly * 1.5, 4.2);
      fill('#ffe066'); oval(-4 + lx * 2, -5 + ly * 1.5, 2.4, flee ? 1.4 : 3); oval(4 + lx * 2, -5 + ly * 1.5, 2.4, flee ? 1.4 : 3);
    }
    fill('#f4f6ff'); c.beginPath(); c.moveTo(-6, 1.5); c.quadraticCurveTo(0, flee ? 10 : 8, 6, 1.5); c.quadraticCurveTo(0, 4, -6, 1.5); c.closePath(); c.fill();
    ink('#0b0e1c', 0.7); c.beginPath(); c.moveTo(-2, 2.5); c.lineTo(-2, 5); c.moveTo(0, 3); c.lineTo(0, 5.8); c.moveTo(2, 2.5); c.lineTo(2, 5); c.stroke();
    ink('#f4f6ff', 1.1); line(-4, 8, -4.5, 13); line(4, 8, 4.5, 14);
    ink('#1f6b55', 1.2); c.beginPath(); c.arc(0, 18, 7, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke();
    if (!flee) { fill('#4fd1a6'); circle(-3 + wave(10) * 1.5, 12, 3); circle(3 - wave(10) * 1.5, 12, 3); }
    else sweat(-15, -14, 1.1);
    crownY = -29;
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // bomber: hovers, gives a 0.7 s warning (cd < 0), then dives along (vx, vy). The art has its nose at +y.

  function bomber(f, fn) {
    const dive = !!f.dive, warn = !dive && (f.cd ?? 9) < 0, on = warn && Math.floor(T * 12) % 2 === 0;
    if (warn) {
      const k = (T * 3) % 1;
      c.globalAlpha = 1 - k; ink('#ff2a4d', 3); ring(0, 0, 20 + k * 14); c.globalAlpha = 1;
    }
    c.save();
    if (dive) {
      c.rotate(Math.atan2(f.vy || 1, f.vx || 0) - Math.PI / 2); lx = 0; ly = 1;
      ink('rgba(255,255,255,0.45)', 1.6); c.beginPath();
      for (let i = 0; i < 4; i++) { const x = -9 + i * 6, y = -20 - ((T * 70 + i * 9) % 12); c.moveTo(x, y); c.lineTo(x, y - 9); }
      c.stroke();
    } else c.translate(warn ? wave(50) * 1.5 : 0, wave(3) * 2);
    crownY = -31;
    const was = fl; if (on) fl = true;
    fn(f, warn, dive);
    fl = was;
    c.restore();
    if (warn) {
      fill(on ? '#ffffff' : '#ff2a4d'); circle(0, -31, 6.5);
      fill(on ? '#ff2a4d' : '#ffffff'); c.font = 'bold 11px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', 0, -30.5);
      crownY = -42;
    }
  }

  function batBomb(f, warn, dive) {
    const fw = wave(dive ? 4 : 16);
    c.save(); if (dive) c.scale(0.55, 1);
    fill('#8a1f2e');
    for (const s of SIDES) {
      c.beginPath(); c.moveTo(s * 10, -6); c.quadraticCurveTo(s * 22, -18 + fw * 6, s * 30, -12 + fw * 6); c.quadraticCurveTo(s * 27, -6, s * 29, -2 + fw * 3);
      c.quadraticCurveTo(s * 24, -2, s * 24, 3 + fw * 2); c.quadraticCurveTo(s * 18, 0, s * 12, 6); c.closePath(); c.fill();
    }
    c.restore();
    ball(0, 2, 17, '#ff5c5c', '#a3202e');
    fill('#7a0f1e'); c.fillRect(-15, 9, 30, 3);
    fill('#5d6b80'); box(-4, -17, 8, 4, 1.5);
    ink('#c8a27a', 1.6); c.beginPath(); c.moveTo(0, -17); c.quadraticCurveTo(4, -22, 2, -26); c.stroke();
    const big = warn || dive ? 1.8 : 1;
    fill('#ffd23f'); star4(2, -27, (3 + wave(30)) * big);
    fill('#fff6c0'); circle(2, -27, 1.3 * big);
    eye(-6, -1, 4, '#ff5c5c'); eye(6, -1, 4, '#ff5c5c');
    brows(0, -6, 6, 3, hurt ? -1.4 : 1.6);
    fill('#f4f6ff'); box(-5, 5, 10, 3.6, 1.2);
    ink(INK, 0.8); c.beginPath(); c.moveTo(-1.7, 5); c.lineTo(-1.7, 8.6); c.moveTo(1.7, 5); c.lineTo(1.7, 8.6); c.stroke();
  }

  function wasp(f, warn, dive) {
    fill('rgba(220,240,255,0.6)');
    for (const s of SIDES) oval(s * 12, -12, 9, 4.5, s * (-0.5 + wave(30) * 0.35));
    fill(INK); tri(-3, 15, 3, 15, 0, 26);
    fill('#c99a00'); oval(0, 2, 15, 18); fill('#ffd23f'); oval(-0.6, 1.2, 13.8, 16.8);
    c.save(); c.beginPath(); c.ellipse(0, 2, 15, 18, 0, 0, TAU); c.clip();
    fill(INK); c.fillRect(-16, 6, 32, 3.5); c.fillRect(-16, 12.5, 32, 3);
    c.restore();
    ink(INK, 1.3); c.beginPath();
    c.moveTo(-8, 10); c.lineTo(-13, 15 + wave(8) * 1.5); c.moveTo(8, 10); c.lineTo(13, 15 - wave(8) * 1.5);
    c.moveTo(-3, -15); c.quadraticCurveTo(-5, -21, -9, -23); c.moveTo(3, -15); c.quadraticCurveTo(5, -21, 9, -23); c.stroke();
    fill(INK); circle(-9, -23, 1.6); circle(9, -23, 1.6);
    eye(-6, -6, 4.6, '#ffd23f', '#ff5c5c'); eye(6, -6, 4.6, '#ffd23f', '#ff5c5c');
    brows(0, -11.5, 6, 3.2, hurt ? -1.4 : 1.8);
    ink(INK, 1.4); c.beginPath(); c.arc(0, -1, 4, 0.25 * Math.PI, 0.75 * Math.PI); c.stroke();
    fill('#ffffff'); tri(-2.4, 2, -1, 2.3, -1.8, 4.6); tri(2.4, 2, 1, 2.3, 1.8, 4.6);
  }

  function jetChick(f, warn, dive) {
    const fz = dive ? 1.6 : 1;
    fill('#ff7a3d'); tri(-6, -14, 6, -14, 0, -14 - (9 + wave(35) * 3) * fz);
    fill('#ffe066'); tri(-3.5, -14, 3.5, -14, 0, -14 - (5 + wave(35) * 2) * fz);
    fill('#8a9bb8'); box(-8, -18, 16, 6, 2);
    fill('#ff4d6d'); c.beginPath(); c.moveTo(6, 5); c.quadraticCurveTo(16, -2 + wave(12) * 3, 25, -7 + wave(12) * 4); c.lineTo(24, -1); c.quadraticCurveTo(15, 5, 6, 10); c.closePath(); c.fill();
    ball(0, 0, 16, '#ff8a3d', '#d9681e');
    fill('#ffd9a8'); oval(0, 7, 8, 5.5);
    fill('#ff4d6d'); box(-11, 3.5, 22, 4, 2);
    ink('#5a3b12', 2.4); line(-15.5, -4, 15.5, -4);
    fill('#5a3b12'); circle(-5.5, -4, 5.2); circle(5.5, -4, 5.2);
    eye(-5.5, -4, 4, '#ff8a3d', '#7cf2ff'); eye(5.5, -4, 4, '#ff8a3d', '#7cf2ff');
    fill('#ffd23f');
    if (warn || dive) { tri(-3, 1, 3, 1, 0, 5); tri(-2.5, 6, 2.5, 6, 0, 10); } else tri(-3, 1, 3, 1, 0, 7);
    fill('#d9681e'); oval(-5, 16, 2.5, 1.5); oval(5, 16, 2.5, 1.5);
    if (hurt) sweat(14, -10, 1.1);
  }

  function flame(w, h, wv) {
    c.beginPath(); c.moveTo(-w, 0); c.quadraticCurveTo(-w, -h * 0.6, -w * 0.3 + wv, -h); c.quadraticCurveTo(0, -h * 0.55, w * 0.4 - wv, -h * 0.9);
    c.quadraticCurveTo(w, -h * 0.5, w, 0); c.closePath(); c.fill();
  }
  function meteor(f, warn, dive) {
    const fz = dive ? 1.5 : 1;
    fill('#7a3dff'); flame(15, 30 * fz, wave(20) * 3);
    fill('#c86bff'); flame(10.5, 23 * fz, wave(23, 1) * 2.5);
    fill('#ffd1ff'); flame(5.5, 15 * fz, wave(27, 2) * 2);
    ball(0, 3, 16, '#7a6380', '#4a3a4f');
    fill('#4a3a4f'); circle(-8, 9, 3); circle(9, 6, 2.3); circle(3, 14, 1.6); circle(-11, -2, 1.5);
    fill('#9a83a0'); circle(-8.6, 8.3, 1.6); circle(8.6, 5.4, 1.1);
    eye(-5, 0, 4.8, '#7a6380'); eye(6, -1, 3.6, '#7a6380');
    if (hurt) { wobbly(1, 9, 4); sweat(15, -6, 1.1); } else gape(1, 9, 5, 3);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // spook: a ghost. fade 1 = solid, 0 = phased out (no hits): see-through and hollow.

  function spook(f, shape, dark, main, face) {
    const fade = clamp(f.fade ?? 1, 0, 1);
    c.save(); c.translate(0, wave(2.2) * 2);
    c.globalAlpha = alpha;
    shape();
    if (fade < 0.5) { fill(main); c.globalAlpha = alpha * 0.3; c.fill(); c.globalAlpha = alpha; ink(main, 2); c.stroke(); }
    else {
      fill(dark); c.fill();
      c.save(); c.translate(-0.8, -1.2); c.scale(0.93, 0.93); shape(); fill(main); c.fill(); c.restore();
    }
    face(f, fade);
    c.restore();
  }

  function sheetShape() {
    c.beginPath(); c.moveTo(-17, 14); c.lineTo(-17, -2); c.arc(0, -2, 17, Math.PI, 0); c.lineTo(17, 14);
    for (let i = 0; i < 4; i++) { const x0 = 17 - i * 8.5; c.quadraticCurveTo(x0 - 4.25, 21 + wave(6, i) * 2.5, x0 - 8.5, 14); }
    c.closePath();
  }
  function lanternFace() {
    fill('#e8ecff'); oval(15, 3, 5, 3.5, -0.4); oval(-15, 4, 4.5, 3, 0.5);
    fill('rgba(124,242,255,0.25)'); circle(19, 13, 8);
    ink('#8a9bb8', 1.2); line(19, 3, 19, 8);
    fill('#5d6b80'); box(15.5, 8, 7, 9.5, 2);
    fill(Math.floor(T * 7) % 4 ? '#7cf2ff' : '#c9fbff'); box(16.7, 9.5, 4.6, 6.5, 1.5);
    if (shut) { ink(INK, 1.6); line(-8, -5, -3, -5); line(3, -5, 8, -5); }
    else {
      fill(INK); oval(-5.5 + lx * 1.5, -5 + ly, 3, 4.2); oval(5.5 + lx * 1.5, -5 + ly, 3, 4.2);
      fill('#ffffff'); circle(-6.3 + lx * 1.5, -6.6 + ly, 1.1); circle(4.7 + lx * 1.5, -6.6 + ly, 1.1);
    }
    blush(0, 1, 9, 2.4);
    fill(INK); oval(0, 4.5, 2, hurt ? 1.2 : 2.6);
    if (hurt) sweat(13, -11, 1.1);
    crownY = -24;
  }

  function wispShape() {
    const a = wave(9) * 2, b = wave(11, 1) * 2;
    c.beginPath(); c.moveTo(0, 18); c.bezierCurveTo(-22, 16, -19, -4, -11, -11); c.quadraticCurveTo(-8, -17, -6 + a, -26);
    c.quadraticCurveTo(-1, -16, 2, -21 + b); c.quadraticCurveTo(5, -27, 8 + a, -31); c.quadraticCurveTo(10, -18, 12, -11);
    c.bezierCurveTo(19, -4, 22, 16, 0, 18); c.closePath();
  }
  function skullFace() {
    fill('#e8fbff'); circle(0, 2, 9.5); box(-5, 7, 10, 6, 2);
    fill(INK); oval(-3.6, 1, 2.8, 3.2); oval(3.6, 1, 2.8, 3.2); tri(-1, 6, 1, 6, 0, 4);
    if (!shut) { fill('#7cf2ff'); circle(-3.6 + lx * 1.1, 1.5 + ly, 1.3); circle(3.6 + lx * 1.1, 1.5 + ly, 1.3); }
    ink(INK, 0.8); c.beginPath(); c.moveTo(-2.5, 9); c.lineTo(-2.5, 12); c.moveTo(0, 9); c.lineTo(0, 12.5); c.moveTo(2.5, 9); c.lineTo(2.5, 12); c.moveTo(-4, 10.5); c.lineTo(4, 10.5); c.stroke();
    if (hurt) sweat(12, -4, 1.1);
    crownY = -31;
  }

  function gentShape() {
    const w = wave(3) * 3;
    c.beginPath(); c.moveTo(-15, 2); c.arc(0, 2, 15, Math.PI, 0); c.bezierCurveTo(16, 14, 8, 16, 12 + w, 25); c.bezierCurveTo(2, 22, -14, 18, -15, 2); c.closePath();
  }
  function gentFace() {
    c.save(); c.translate(1, -12); c.rotate(-0.15);
    fill('#3b2a5a'); oval(0, 0, 11, 2.2); box(-7, -13, 14, 13, 2);
    fill('#ff4d6d'); c.fillRect(-7, -4, 14, 2.2);
    c.restore();
    eye(-5, -3, 3.6, '#c9b8ff'); eye(5, -3, 3.6, '#c9b8ff');
    ink('#ffd23f', 1.2); ring(5, -3, 4.8); c.beginPath(); c.moveTo(9.5, -1); c.quadraticCurveTo(12, 4, 9, 9); c.stroke();
    fill('#6b5a9e'); oval(-4, 3, 4.5, 1.8, 0.25); oval(4, 3, 4.5, 1.8, -0.25); circle(-8.3, 1.6, 1.2); circle(8.3, 1.6, 1.2);
    if (hurt) { wobbly(0, 6.5, 2); sweat(-13, -6, 1.1); }
    fill('#ff4d6d'); tri(0, 10, -4.5, 7.5, -4.5, 12.5); tri(0, 10, 4.5, 7.5, 4.5, 12.5); circle(0, 10, 1.3);
    crownY = -32;
  }

  function pumpkinTailShape() {
    const w = wave(3) * 3;
    c.beginPath(); c.moveTo(-12, 0); c.lineTo(12, 0); c.quadraticCurveTo(14, 14, 4 + w, 25); c.quadraticCurveTo(0, 16, -3, 22 - w * 0.5); c.quadraticCurveTo(-8, 14, -12, 0); c.closePath();
  }
  function pumpkinFace(f, fade) {
    if (fade < 0.5) { ink('#ff9a3d', 2); c.beginPath(); c.ellipse(0, -4, 17, 14, 0, 0, TAU); c.stroke(); }
    else {
      fill('#c4561e'); oval(0, -4, 17.5, 14.5);
      fill('#ff9a3d'); oval(-8.5, -4, 8, 12.5); oval(8.5, -4, 8, 12.5); oval(0, -4.5, 8, 13.5);
    }
    fill('#5a8f2a'); box(-1.5, -22, 3, 5, 1);
    ink('#5a8f2a', 1.1); c.beginPath(); c.moveTo(1, -19); c.quadraticCurveTo(6, -23, 8, -18); c.stroke();
    const glow = Math.floor(T * 8) % 3 ? '#ffe066' : '#fff3b0', ex = lx * 1.5, ey = ly;
    fill(glow);
    if (shut) { c.fillRect(-9 + ex, -7 + ey, 6, 1.6); c.fillRect(3 + ex, -7 + ey, 6, 1.6); }
    else { tri(-9 + ex, -4 + ey, -3 + ex, -4 + ey, -6 + ex, -10 + ey); tri(3 + ex, -4 + ey, 9 + ex, -4 + ey, 6 + ex, -10 + ey); }
    c.beginPath(); c.moveTo(-10, 1); c.lineTo(-6, 3); c.lineTo(-4, 1); c.lineTo(-1, 3); c.lineTo(1, 1); c.lineTo(4, 3); c.lineTo(6, 1); c.lineTo(10, 1);
    c.quadraticCurveTo(0, hurt ? 6 : 12, -10, 1); c.closePath(); c.fill();
    crownY = -25;
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // bulwark: an armoured beetle. shell = hits left on the shell (3..1); 0 (and panic) = a small naked bug that runs.

  const CRACK_A = [-3, -15, 1, -10, -2, -6, 2, -1, 0, 3];
  const CRACK_B = [-17, -6, -12, -4, -13, 1, -8, 2];
  const CRACK_C = [15, -11, 11, -7, 14, -3, 10, 1, 12, 5];
  function cracks(sh) {
    if (sh >= 3) return;
    ink(INK, 1.7); polyline(CRACK_A);
    if (sh > 1) return;
    polyline(CRACK_B); polyline(CRACK_C);
    fill(INK); tri(13, -14, 19, -9, 12, -9);
  }

  function nakedBug(f, col, dark) {
    const run = wave(22), d = f.dir < 0 ? -1 : 1;
    shut = false;
    fill('rgba(255,255,255,0.3)'); circle(-d * 14, 13, 3 + Math.abs(wave(11)) * 2); circle(-d * 19, 11, 2);
    c.save(); c.translate(0, -Math.abs(run) * 1.5);
    ink(dark, 2); c.beginPath();
    for (let i = 0; i < 3; i++) for (const s of SIDES) { const p = (i + (s > 0 ? 1 : 0)) % 2 ? run : -run; c.moveTo(s * 7, -3 + i * 5); c.lineTo(s * 13, 1 + i * 5 + p * 3); }
    c.stroke();
    ink(dark, 1.3); c.beginPath(); c.moveTo(-3, -10); c.quadraticCurveTo(-6, -18, -9 + run * 2, -19); c.moveTo(3, -10); c.quadraticCurveTo(6, -18, 9 - run * 2, -19); c.stroke();
    fill(dark); circle(-9 + run * 2, -19, 1.5); circle(9 - run * 2, -19, 1.5);
    fill(dark); oval(0, 1, 10, 12); fill(col); oval(-0.6, 0.2, 9, 11);
    ink(dark, 1); c.beginPath(); c.arc(0, 1, 7, 0.25 * Math.PI, 0.75 * Math.PI); c.moveTo(4.2, 9.5); c.arc(0, 5, 6, 0.3 * Math.PI, 0.7 * Math.PI); c.stroke();
    eye(-4, -3, 4.4, col, null, 0.24); eye(4, -3, 4.4, col, null, 0.24);
    gape(0, 5, 2.4, 3, false);
    sweat(-12, -9, 1.1); sweat(12, -12, 1.3);
    c.restore();
    crownY = -20;
  }

  function bulwark(f, k) {
    const sh = f.shell ?? 3;
    if (sh <= 0 || f.panic) { nakedBug(f, k.naked, k.main); return; }
    const step = wave(6);
    ink(k.head, 2.4); c.beginPath();
    for (let i = 0; i < 3; i++) for (const s of SIDES) { const y = -4 + i * 7; c.moveTo(s * 14, y); c.lineTo(s * 21, y + 3 + (i % 2 ? step : -step) * 2); c.lineTo(s * 23, y + 8); }
    c.stroke();
    fill(k.dark); oval(0, -3, 20, 16.5); fill(k.main); oval(-0.8, -4, 18.6, 15);
    k.deco();
    if (k.split) { ink(k.dark, 1.4); line(0, -18.5, 0, 12); }
    fill('rgba(255,255,255,0.35)'); oval(-9, -11, 6, 2.6, -0.5);
    cracks(sh);
    fill(k.head); circle(0, 13, 8.5);
    k.headDeco();
    eye(-3.8, 13, 3.3, k.head, k.iris); eye(3.8, 13, 3.3, k.head, k.iris);
    if (sh === 1 || hurt) { brows(0, 8.5, 3.8, 2, -1, 1.3); sweat(15, -12, 1.2); }
    crownY = -24;
  }

  const SPOTS = [-9, -8, 3.4, 9, -9, 3, -11, 3, 2.6, 10, 3, 2.8, -4, -14, 1.8, 5, -2, 2];
  const RIVETS = [-13, -6, 1, 8];
  const FACET_COLS = ['#d9c4ff', '#8f5cff', '#c9a8ff', '#7a4fd0', '#e9dcff'];
  const FACETS = [-14, -8, -4, -16, -6, -2, 4, -16, 14, -9, 6, -3, -6, -2, 6, -3, 0, 8, -17, 0, -6, -2, -9, 8, 17, 0, 6, -3, 9, 8];
  const STAG = {
    main: '#4f8cff', dark: '#2a4fa8', head: '#1e2f66', naked: '#bfe0ff', iris: null, split: true,
    deco() {
      fill('#c9d0ff'); for (const y of RIVETS) { circle(-3, y, 1.1); circle(3, y, 1.1); }
      fill('#ff4d6d'); oval(0, -21, 2.6, 4.5, wave(4) * 0.3);
    },
    headDeco() {
      const sn = Math.abs(wave(5)) * 2;
      fill('#1e2f66'); for (const s of SIDES) { c.beginPath(); c.moveTo(s * 4, 18); c.quadraticCurveTo(s * (12 + sn), 22, s * (6 + sn), 29); c.quadraticCurveTo(s * 7, 23, s * 1.5, 20); c.closePath(); c.fill(); }
    },
  };
  const LADY = {
    main: '#ff4d5e', dark: '#a3202e', head: '#2a2e44', naked: '#ffc9d2', iris: null, split: true,
    deco() { fill(INK); puffs(SPOTS, 0, 0, 1); },
    headDeco() {
      ink('#2a2e44', 1.2); c.beginPath(); c.moveTo(-3, 6); c.quadraticCurveTo(-7, 0, -10, 1); c.moveTo(3, 6); c.quadraticCurveTo(7, 0, 10, 1); c.stroke();
      fill('#8a9bb8'); c.beginPath(); c.arc(0, 13, 9.5, Math.PI, 0); c.closePath(); c.fill();
      fill('#c9d0ff'); c.fillRect(-0.8, 3.6, 1.6, 9);
    },
  };
  const DILLO = {
    main: '#d9a066', dark: '#8a5a2b', head: '#b0784a', naked: '#ffd8bd', iris: null, split: false,
    deco() {
      ink('#8a5a2b', 1.4); c.beginPath();
      for (let i = 0; i < 4; i++) { const y = -12 + i * 6; c.moveTo(-17 + i, y + 6); c.quadraticCurveTo(0, y - 3, 17 - i, y + 6); }
      c.stroke();
      fill('#f0c28e'); for (let i = 0; i < 5; i++) circle(-8 + i * 4, -15, 0.9);
    },
    headDeco() {
      fill('#b0784a'); tri(-7, 8, -12, 1, -3, 6); tri(7, 8, 12, 1, 3, 6);
      fill('#ff9ab0'); tri(-7, 7, -10, 3, -5, 6); tri(7, 7, 10, 3, 5, 6);
      fill('#e8b07a'); oval(0, 19, 4, 3); fill(INK); circle(0, 20.5, 1.3);
    },
  };
  const GEM = {
    main: '#b07cff', dark: '#5a33b3', head: '#3b2a5a', naked: '#e9dcff', iris: '#5ef0ff', split: false,
    deco() {
      for (let i = 0; i < FACETS.length; i += 6) { fill(FACET_COLS[(i / 6) % FACET_COLS.length]); tri(FACETS[i], FACETS[i + 1], FACETS[i + 2], FACETS[i + 3], FACETS[i + 4], FACETS[i + 5]); }
      fill('#ffffff'); star4(-6, -9, 2 + Math.abs(Math.sin(T * 3)) * 2);
    },
    headDeco() { fill('#5ef0ff'); diamond(0, 5.5, 2.5, 3.5); },
  };

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // jester: a trickster that teleports when a ball comes near. blink > 0 (0.3 s) = it pops in.

  function jester(f, fn) {
    const b = f.blink > 0 ? clamp(f.blink / 0.3, 0, 1) : 0;
    if (b <= 0) { fn(f); return; }
    const k = 1 - b;
    c.globalAlpha = alpha * b; fill('#f4f6ff');
    for (let i = 0; i < 7; i++) { const a = i * TAU / 7 + k; circle(Math.cos(a) * (12 + 16 * k), Math.sin(a) * (12 + 16 * k), 5 * b + 1.5); }
    c.globalAlpha = alpha; fill('#ffe066');
    for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + 0.4 - k; star4(Math.cos(a) * (20 + 10 * k), Math.sin(a) * (20 + 10 * k), 3.5 * b + 0.5); }
    const sc = Math.max(0.05, backOut(k));
    c.save(); c.scale(sc, sc); c.rotate(b * 0.9); fn(f); c.restore();
  }

  function jinx() {
    const sw = wave(3);
    for (const s of SIDES) {
      const tx = s * (24 + sw * s * 2), ty = -17 + sw * s * 3;
      fill(s < 0 ? '#ff5ec4' : '#5ef0ff'); c.beginPath(); c.moveTo(s * 2, -12); c.quadraticCurveTo(s * 14, -30, tx, ty); c.quadraticCurveTo(s * 14, -17, s * 13, -9); c.closePath(); c.fill();
      fill('#ffd23f'); circle(tx, ty + 2.4, 2.6);
    }
    fill('#f4f6ff'); for (let i = 0; i < 7; i++) circle(-12 + i * 4, 15 + (i % 2) * 1.5, 3.6);
    ball(0, 1, 16, '#ffe3ef', '#d9a3bf');
    fill('#ffd23f'); box(-13, -13, 26, 4, 2);
    fill('#ff5ec4'); diamond(-6, 5, 1.8, 3); fill('#5ef0ff'); diamond(6, 5, 1.8, 3);
    eye(-5.5, -3, 3.6, '#ffe3ef', '#7a3dff'); eye(5.5, -3, 3.6, '#ffe3ef', '#7a3dff');
    ink(INK, 1.5); c.beginPath(); c.moveTo(-9, -8); c.lineTo(-3, -9.5); c.moveTo(3, -10); c.quadraticCurveTo(6, -12, 9, -9.5); c.stroke();
    if (hurt) { wobbly(0, 8, 4); sweat(13, -6, 1.1); } else grin(0, 6.5, 6.5, 3.2);
    crownY = -18;
  }

  function ace() {
    c.save(); c.rotate(wave(2) * 0.12);
    ink(INK, 1.6); c.beginPath(); c.moveTo(-5, 18); c.lineTo(-6, 24); c.moveTo(5, 18); c.lineTo(6, 24);
    c.moveTo(-14, 2); c.quadraticCurveTo(-20, 0, -21, -6 + wave(5) * 2); c.moveTo(14, 2); c.quadraticCurveTo(20, 4, 22, 9 - wave(5) * 2); c.stroke();
    fill('#ff4d6d'); oval(-7, 24.5, 3, 1.6); oval(7, 24.5, 3, 1.6);
    fill('#f4f6ff'); circle(-21, -6 + wave(5) * 2, 2.2); circle(22, 9 - wave(5) * 2, 2.2);
    fill('#a8b2d9'); box(-13, -18, 28, 38, 4);
    fill('#f4f6ff'); box(-14, -19, 28, 38, 4);
    ink('#ff4d6d', 1.1); rrect(-12, -17, 24, 34, 3); c.stroke();
    fill('#ff4d6d'); c.font = 'bold 7px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('A', -8.5, -12.5); diamond(-8.5, -6.8, 1.7, 2.4);
    c.save(); c.translate(8.5, 12.5); c.rotate(Math.PI); c.fillText('A', 0, 0); diamond(0, 5.7, 1.7, 2.4); c.restore();
    diamond(0, -11, 3, 4.2);
    eye(-4.5, -1, 3.3, '#f4f6ff'); eye(4.5, -1, 3.3, '#f4f6ff');
    blush(0, 4, 8, 2);
    if (hurt) { wobbly(0, 7, 3); sweat(9, -8, 1); } else grin(0, 5.5, 5, 2.5);
    c.restore();
    crownY = -24;
  }

  function imp() {
    const ex = 18, ey = -4 + wave(3) * 3;
    ink('#5a2fb3', 2); c.beginPath(); c.moveTo(8, 12); c.bezierCurveTo(22, 18, 24 + wave(3) * 2, 4, ex, ey + 2); c.stroke();
    fill('#5a2fb3'); tri(ex, ey - 4, ex + 3.5, ey + 2.5, ex - 3.5, ey + 2.5);
    for (const s of SIDES) {
      c.beginPath(); c.moveTo(s * 13, -6); c.lineTo(s * 24, -14 + wave(12) * 3); c.lineTo(s * 21, -8); c.lineTo(s * 25, -5 + wave(12) * 2); c.lineTo(s * 14, 0); c.closePath(); c.fill();
    }
    fill('#ffe066'); for (const s of SIDES) { c.beginPath(); c.moveTo(s * 6, -14); c.quadraticCurveTo(s * 12, -19, s * 11, -26); c.quadraticCurveTo(s * 8, -19, s * 2, -16); c.closePath(); c.fill(); }
    ball(0, 0, 17, '#9b5cff', '#5a2fb3');
    fill('#c9a8ff'); oval(0, 9, 8, 5);
    eye(-5.5, -3, 4, '#9b5cff', '#ffd23f'); eye(5.5, -3, 4, '#9b5cff', '#ffd23f');
    brows(0, -8.5, 5.5, 3, hurt ? -1.3 : 1.4);
    if (hurt) { wobbly(0, 5, 4); sweat(14, -10, 1.1); }
    else { grin(0, 3.5, 6, 3); fill('#ffffff'); tri(-3.5, 3.5, -1.5, 3.5, -2.5, 6.5); tri(3.5, 3.5, 1.5, 3.5, 2.5, 6.5); }
    ink('#ffd23f', 1.5); c.beginPath(); c.moveTo(-18, 18); c.lineTo(-18, -12); c.moveTo(-21, -12); c.lineTo(-15, -12);
    c.moveTo(-21, -12); c.lineTo(-21, -17); c.moveTo(-18, -12); c.lineTo(-18, -19); c.moveTo(-15, -12); c.lineTo(-15, -17); c.stroke();
    fill('#9b5cff'); circle(-18, 4, 2.8);
    crownY = -27;
  }

  function boing() {
    const s = 8 + wave(7) * 3, hy = 3 - s - 8;
    fill('#c99a00'); c.beginPath(); c.moveTo(-14, 3); c.lineTo(-23, -4); c.lineTo(-21, -6.5); c.lineTo(-12, 1); c.closePath(); c.fill();
    ink('#c9d0ff', 1.6); c.beginPath(); c.moveTo(0, 3);
    for (let i = 1; i <= 6; i++) c.lineTo(i % 2 ? 4 : -4, 3 - s * i / 6);
    c.lineTo(0, hy + 8); c.stroke();
    fill('#c99a00'); box(-14, 3, 28, 17, 3);
    fill('#ffd23f'); box(-13, 3, 26, 15.5, 3);
    fill('#ff4d6d'); c.fillRect(-13, 8, 26, 3);
    fill('#7a3dff'); diamond(-6, 14, 2, 2.6); diamond(6, 14, 2, 2.6);
    const a = T * 6 * live;
    ink('#8a9bb8', 1.5); line(14, 11, 18, 11); line(18, 11, 18 + Math.cos(a) * 4, 11 + Math.sin(a) * 4);
    fill('#ff4d6d'); circle(18 + Math.cos(a) * 4, 11 + Math.sin(a) * 4, 1.6);
    ball(0, hy, 9.5, '#f4f6ff', '#c9d0ff');
    fill('#5ef0ff'); c.beginPath(); c.arc(0, hy - 2.5, 8, Math.PI, 0); c.closePath(); c.fill();
    ink('#ff4d6d', 1.5); const pw = Math.cos(T * 20 * live) * 6; line(-pw, hy - 12, pw, hy - 12); line(0, hy - 10.5, 0, hy - 12);
    eye(-3.5, hy + 0.5, 2.9, '#f4f6ff'); eye(3.5, hy + 0.5, 2.9, '#f4f6ff');
    fill('#ff4d6d'); circle(0, hy + 4, 2.1);
    if (hurt) wobbly(0, hy + 7, 2.5); else smile(0, hy + 6.5, 3, 1.3);
    crownY = hy - 17;
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // zapper: a storm creature. charge 0..1 rises in the 1.2 s before it drops lightning on the paddle.

  function sparks(n, rad) {
    if (n <= 0) return;
    const k = Math.floor(T * 14);
    ink('#ffe066', 1.5); c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = hash(k * 7 + i * 13) * TAU, r0 = rad + hash(k * 3 + i) * 6, x = Math.cos(a) * r0, y = Math.sin(a) * r0;
      c.moveTo(x, y); c.lineTo(x + 3, y + 2.5); c.lineTo(x - 0.5, y + 4.5); c.lineTo(x + 2.5, y + 8);
    }
    c.stroke();
  }
  function zapper(f, fn) {
    const ch = clamp(f.charge || 0, 0, 1);
    fn(f, ch);
    sparks(Math.round(ch * 6), 17);
    if (ch > 0.75 && Math.floor(T * 16) % 2) { fill('#ffe066'); bolt(0, 19, 1); fill('#ffffff'); bolt(0.5, 21, 0.5); }
  }
  function darken(ch, draw) {
    if (ch <= 0 || fl) return;
    c.globalAlpha = alpha * ch * 0.6; fill(INK); draw(); c.globalAlpha = alpha;
  }

  const CLOUD = [-11, 3, 10, 0, -4, 13, 11, 2, 10, -5, 8, 9, 6, 8, 9];
  const cloudAll = () => puffs(CLOUD, 0, 0, 1);
  function grumbulus(f, ch) {
    ink('#7cf2ff', 1.4); c.beginPath();
    for (let i = 0; i < 4; i++) { const x = -9 + i * 6, y = 14 + ((T * 30 + i * 7) % 12); c.moveTo(x, y); c.lineTo(x - 1, y + 3); }
    c.stroke();
    fill('#5d6b99'); cloudAll(); fill('#9fb3d9'); puffs(CLOUD, -0.8, -1.2, 0.92);
    fill('rgba(255,255,255,0.35)'); oval(-5, -11, 5, 2.2, -0.3);
    darken(ch, cloudAll);
    eye(-5, 0, 3.8, '#9fb3d9'); eye(5, 0, 3.8, '#9fb3d9');
    brows(0, -5, 5, 2.8, hurt ? -1.2 : 1 + ch * 1.5);
    if (ch > 0.5) grin(0, 5.5, 4.5, 2.2); else if (hurt) { wobbly(0, 7, 2.5); sweat(13, -8, 1.1); } else frown(0, 7.5, 2.6);
    crownY = -22;
  }

  const glassAll = () => circle(0, -2, 16);
  function plasma(f, ch) {
    fill('#8a6a2b'); box(-9, 12, 18, 8, 2);
    fill('#c9a04a'); box(-11, 10, 22, 4, 2);
    fill('#5a4520'); circle(-6, 16, 1); circle(6, 16, 1);
    fill('#2a1440'); glassAll();
    darken(ch, glassAll);
    const n = 5 + Math.round(ch * 5), k = Math.floor(T * 12);
    ink(ch > 0.5 ? '#ffd1f0' : '#ff7ad9', 1.1 + ch); c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = i * TAU / n + T * (0.8 + ch * 3) * live;
      c.moveTo(0, -2);
      for (let j = 1; j <= 3; j++) { const aj = a + (hash(i * 13 + k + j) - 0.5) * 0.7; c.lineTo(Math.cos(aj) * 5 * j, -2 + Math.sin(aj) * 5 * j); }
    }
    c.stroke();
    fill('#ffd1f0'); circle(0, -2, 3 + ch * 2);
    eye(-6, -5, 3.6, '#2a1440', '#ff7ad9'); eye(6, -5, 3.6, '#2a1440', '#ff7ad9');
    brows(0, -10, 6, 2.6, hurt ? -1.2 : 0.5 + ch * 1.5);
    if (hurt) sweat(14, -10, 1.1);
    ink('rgba(255,255,255,0.55)', 1.5); ring(0, -2, 16);
    fill('rgba(255,255,255,0.35)'); oval(-7, -11, 5, 2.4, -0.6);
    crownY = -24;
  }

  const WOOL = [-12, 0, 8, -6, -8, 8, 4, -9, 8, 12, -2, 8, 10, 8, 8, 0, 10, 8, -10, 9, 7, 0, 0, 10];
  const woolAll = () => puffs(WOOL, 0, 0, 1);
  function sheep(f, ch) {
    ink('#3b3a5e', 2.6); line(-7, 13, -7, 21); line(7, 13, 7, 21);
    c.save(); c.translate(19, 2); c.rotate(0.4 + wave(4) * 0.2); fill('#ffe066'); bolt(-1, -6, 0.8); c.restore();
    fill('#9a9cc4'); woolAll(); fill('#d7d9f0'); puffs(WOOL, -0.6, -1, 0.92);
    darken(ch, woolAll);
    ink('#ffe066', 2.4); c.beginPath(); c.arc(-9, -1, 3.6, -0.6 * Math.PI, 0.9 * Math.PI); c.moveTo(12.2, 1.6); c.arc(9, -1, 3.6, 0.1 * Math.PI, 1.6 * Math.PI, true); c.stroke();
    fill('#3b3a5e'); oval(0, 3, 8, 9);
    fill('#d7d9f0'); circle(-2.5, -5, 3.2); circle(2.5, -5, 3.2);
    eye(-3.5, 1, 2.9, '#3b3a5e', '#ffe066'); eye(3.5, 1, 2.9, '#3b3a5e', '#ffe066');
    if (ch > 0.3) brows(0, -2.6, 3.5, 2, 1 + ch, 1.4);
    if (hurt) { sweat(12, -9, 1.1); wobbly(0, 8, 2, 1.2); } else smile(0, 7.5, 2, 1.2);
    crownY = -24;
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // the cast: type -> skins. color = the main colour (particles, health bar).

  const ART = {
    drifter: [
      { name: 'Jelly Jim', color: '#c08cff', draw: jelly },
      { name: 'Fuzzball', color: '#ff8ad8', draw: fuzzball },
      { name: 'Mothy', color: '#ffd166', draw: moth },
      { name: 'Squidlet', color: '#5ef0c0', draw: squid },
      { name: 'Peeper', color: '#ff6b8a', draw: peeper },
    ],
    splitter: [
      { name: 'Twin Goo', color: '#8f5cff', draw: twins },
      { name: 'Peapod', color: '#7ee05a', draw: peapod },
      { name: 'Cherry Duo', color: '#ff4d6d', draw: cherries },
      { name: 'Coat Pals', color: '#c8a27a', draw: coatPals },
    ],
    shooter: [
      { name: 'Toadster', color: '#ff9a4d', draw: toad },
      { name: 'Spiky Sal', color: '#3fbf7f', draw: cactus },
      { name: 'Puffer Pete', color: '#5ec8ff', draw: puffer },
      { name: 'Tuba Gob', color: '#a07bff', draw: tubaGob },
    ],
    mender: [
      { name: 'Nurse Mint', color: '#5ee08a', draw: nurse },
      { name: 'Bolt Bob', color: '#ffb84d', draw: builder },
      { name: 'Wrenchbot', color: '#9fb4d8', draw: robot },
    ],
    thief: [
      { name: 'Bandit', color: '#8b93b8', draw: (f) => thief(f, coon) },
      { name: 'Magpie Max', color: '#6f86ff', draw: (f) => thief(f, magpie) },
      { name: 'Hoodie', color: '#4fd1a6', draw: (f) => thief(f, hoodie) },
    ],
    bomber: [
      { name: 'Bat Bomb', color: '#ff5c5c', draw: (f) => bomber(f, batBomb) },
      { name: 'Stingo', color: '#ffd23f', draw: (f) => bomber(f, wasp) },
      { name: 'Jet Chick', color: '#ff8a3d', draw: (f) => bomber(f, jetChick) },
      { name: 'Meteor Mo', color: '#c86bff', draw: (f) => bomber(f, meteor) },
    ],
    spook: [
      { name: 'Lantern Lou', color: '#e8ecff', draw: (f) => spook(f, sheetShape, '#a8b2d9', '#e8ecff', lanternFace) },
      { name: 'Skull Wisp', color: '#7cf2ff', draw: (f) => spook(f, wispShape, '#2fa8c9', '#7cf2ff', skullFace) },
      { name: 'Sir Boo', color: '#c9b8ff', draw: (f) => spook(f, gentShape, '#8a76c9', '#c9b8ff', gentFace) },
      { name: 'Pumpkin Haunt', color: '#ff9a3d', draw: (f) => spook(f, pumpkinTailShape, '#a8b2d9', '#e8ecff', pumpkinFace) },
    ],
    bulwark: [
      { name: 'Sir Clank', color: '#4f8cff', draw: (f) => bulwark(f, STAG) },
      { name: 'Dotty Tank', color: '#ff4d5e', draw: (f) => bulwark(f, LADY) },
      { name: 'Dillo Dan', color: '#d9a066', draw: (f) => bulwark(f, DILLO) },
      { name: 'Gem Grub', color: '#b07cff', draw: (f) => bulwark(f, GEM) },
    ],
    jester: [
      { name: 'Jinx', color: '#ff5ec4', draw: (f) => jester(f, jinx) },
      { name: 'Ace', color: '#ff4d6d', draw: (f) => jester(f, ace) },
      { name: 'Imp', color: '#9b5cff', draw: (f) => jester(f, imp) },
      { name: 'Boing Box', color: '#ffd23f', draw: (f) => jester(f, boing) },
    ],
    zapper: [
      { name: 'Grumbulus', color: '#9fb3d9', draw: (f) => zapper(f, grumbulus) },
      { name: 'Plasma Pod', color: '#ff7ad9', draw: (f) => zapper(f, plasma) },
      { name: 'Static Sheep', color: '#ffe066', draw: (f) => zapper(f, sheep) },
    ],
  };
  const skinOf = (f) => { const set = ART[f.type]; return set && set[((f.skin | 0) % set.length + set.length) % set.length]; };

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // enemy shots, drawn for radius 8

  function slime(s) {
    c.rotate(Math.atan2(s.vy || 1, s.vx || 0));
    const q = Math.sin(T * 25) * 0.08;
    c.scale(1 + q, 1 - q);
    fill('rgba(156,255,87,0.25)'); circle(0, 0, 12);
    fill('#4fb82a'); c.beginPath(); c.moveTo(-22, 0); c.quadraticCurveTo(-8, -8.5, 0, -8); c.arc(0, 0, 8, -Math.PI / 2, Math.PI / 2); c.quadraticCurveTo(-8, 8.5, -22, 0); c.closePath(); c.fill();
    fill('#9cff57'); c.beginPath(); c.moveTo(-18, 0); c.quadraticCurveTo(-7, -6.8, 0, -6.8); c.arc(0, -0.5, 6.6, -Math.PI / 2, Math.PI / 2); c.quadraticCurveTo(-7, 5.5, -18, 0); c.closePath(); c.fill();
    fill('#e0ffc4'); oval(1.5, -3, 3, 1.6, 0.3); circle(-6, -2, 1);
    fill('#9cff57'); circle(-26, 3, 1.6); circle(-30, -2, 1.1);
  }
  function curse(s) {
    const v = Math.hypot(s.vx || 0, s.vy || 0) || 1, bx = -(s.vx || 0) / v, by = -(s.vy || 1) / v;
    fill('rgba(170,60,255,0.35)'); circle(bx * 10, by * 10, 6); circle(bx * 17, by * 17, 4); circle(bx * 22, by * 22, 2.5);
    c.rotate(Math.sin(T * 8) * 0.35);
    fill('#7a0f1e'); circle(0, 0, 9.5);
    fill('#ff5c5c'); circle(0, 0, 8);
    ink('#ffb3b3', 1); c.beginPath(); c.arc(0, 0, 6.6, 1.1 * Math.PI, 1.6 * Math.PI); c.stroke();
    fill('#3a0008'); circle(0, -1, 4.6); box(-2.7, 1.5, 5.4, 3.4, 1);
    fill('#ff5c5c'); circle(-1.7, -1.3, 1.3); circle(1.7, -1.3, 1.3); tri(-0.6, 1.2, 0.6, 1.2, 0, 0.2);
    ink('#ff5c5c', 0.6); c.beginPath(); c.moveTo(-1, 2.6); c.lineTo(-1, 4.9); c.moveTo(1, 2.6); c.lineTo(1, 4.9); c.stroke();
    if (Math.floor(T * 6) % 3 === 0) { fill('#ffffff'); star4(6, -6, 3); }
  }
  function paper(s) {
    c.rotate(Math.sin(T * 6) * 0.5);
    fill('#9aa6c9'); c.fillRect(-6.5, -8.5, 15, 19);
    fill('#f4f6ff'); c.beginPath(); c.moveTo(-7.5, -9.5); c.lineTo(4, -9.5); c.lineTo(7.5, -6); c.lineTo(7.5, 9.5); c.lineTo(-7.5, 9.5); c.closePath(); c.fill();
    fill('#c9d0ff'); tri(4, -9.5, 4, -6, 7.5, -6);
    fill('#ff4d6d'); c.font = 'bold 5px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('TAX', -1.5, -6);
    fill('#9aa6c9'); for (let i = 0; i < 4; i++) c.fillRect(-5, -2 + i * 2.6, i % 2 ? 7 : 10, 1.1);
    ink('#ff4d6d', 0.9); ring(3.5, 6, 2.6);
    ink('#2f6fd0', 0.7); c.beginPath(); c.moveTo(-5, 7.5); c.quadraticCurveTo(-4, 5, -3, 7.5); c.quadraticCurveTo(-2, 9, -1, 6.5); c.stroke();
  }
  function sock(s) {
    ink('rgba(156,255,87,0.6)', 1.1); c.beginPath();
    for (const x of [-5, 3]) { const y = -12 - ((T * 12) % 4); c.moveTo(x, y); c.quadraticCurveTo(x - 2, y - 2, x, y - 4); c.quadraticCurveTo(x + 2, y - 6, x, y - 8); }
    c.stroke();
    c.rotate(T * 5);
    fill('#f4f6ff'); c.beginPath(); c.moveTo(-4, -11); c.lineTo(4, -11); c.lineTo(4, 0); c.lineTo(9, 0); c.arc(9, 4, 4, -Math.PI / 2, Math.PI / 2); c.lineTo(0, 8); c.quadraticCurveTo(-4, 8, -4, 4); c.closePath(); c.fill();
    fill('#ff5c5c'); c.fillRect(-4, -11, 8, 2.2);
    fill('#5ec8ff'); c.fillRect(-4, -7.5, 8, 1.6);
    fill('#ff5c5c'); c.beginPath(); c.arc(9, 4, 4, -Math.PI / 2, Math.PI / 2); c.closePath(); c.fill(); oval(-1.5, 5.2, 2.5, 2.5);
    fill('#ffc9a8'); circle(11, 5, 1.4);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  window.BBFoeArt = {
    skins: Object.fromEntries(Object.keys(ART).map((k) => [k, ART[k].length])),
    names: Object.fromEntries(Object.keys(ART).map((k) => [k, ART[k].map((s) => s.name)])),
    color(f) { const sk = skinOf(f); return sk ? sk.color : '#c08cff'; },
    // env = { time, px, py, frozen }
    draw(ctx, f, env) {
      const sk = skinOf(f);
      if (!sk) return;
      c = ctx; fl = f.flash > 0; T = f.t || 0; live = env.frozen ? 0 : 1;
      const dx = env.px - f.x, dy = env.py - f.y, d = Math.hypot(dx, dy) || 1;
      lx = dx / d; ly = dy / d;
      hurt = f.maxhp > 0 && f.hp < f.maxhp * 0.35;
      shut = blinkAt((f.skin | 0) * 1.3);
      alpha = f.type === 'spook' ? 0.25 + 0.75 * clamp(f.fade ?? 1, 0, 1) : 1;
      crownY = -24;
      const s = f.r / U;
      ctx.save(); ctx.translate(f.x, f.y); ctx.scale(s, s); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (f.champ) champBack();
      sk.draw(f);
      if (f.champ) champFront();
      ctx.restore();
    },
    shot(ctx, s, env) {
      c = ctx; fl = false; T = s.t || 0; live = 1;
      const k = s.r / 8;
      ctx.save(); ctx.translate(s.x, s.y); ctx.scale(k, k); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (s.k === 'curse') curse(s); else if (s.k === 'paper') paper(s); else if (s.k === 'sock') sock(s); else slime(s);
      ctx.restore();
    },
  };
})();
