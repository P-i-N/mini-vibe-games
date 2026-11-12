'use strict';
/* Strata Siege art: iso primitives, terrain tiles, towers, props, clouds, loot, icons and Gnorman the gnome.
   game.js calls window.SSArt.paint(kind, c, o) and .box(kind, o), and the tile painters while it builds a layer.
   Everything is drawn in logical px around (0, 0) = the ground contact point. The light comes from the upper left.
   No Math.random and no time here: every detail comes from the options or from a seed, so nothing flickers. */
(() => {
  const TAU = Math.PI * 2;
  const TW = 80, TH = 40, HW = 40, HH = 20;
  const ZU = 49;                       // screen px for 1 world unit of height
  const INK = '#1b1f33';
  const ZERO = (wx, wy, z = 0) => ({ x: (wx - wy) * HW, y: (wx + wy) * HH - z * ZU });
  const SLAB_Z = -0.53;                // bottom of the ground slab at the map edge
  const DIG_Z = -0.55;                 // floor of a dug tile
  const L_LEFT = 0.80, L_RIGHT = 0.62; // the two front faces of a block
  const PL = 0.22;                     // tower plinth height, world units
  const PLY = Math.round(PL * ZU);     // the same in px

  // ---------- hash / colour ----------
  // integer hash to 0..1
  const hash = (n) => {
    let h = Math.imul(n | 0, 0x9e3779b1) ^ 0x5bd1e995;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  };
  // k-th random number of a tile. The seed may be 0..1 or an integer.
  const rnd = (seed, k) => hash(Math.floor((seed || 0) * 1e6) + k * 7919 + 13);
  // f < 1 darker, f > 1 lighter. hex is '#rrggbb'.
  function shade(hex, f) {
    const v = parseInt(hex.slice(1), 16);
    const ch = (s) => Math.max(0, Math.min(255, Math.round(((v >> s) & 255) * f)));
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  // ---------- iso primitives (context and projection are passed in) ----------
  function poly(c, pts) {
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (let k = 2; k < pts.length; k += 2) c.lineTo(pts[k], pts[k + 1]);
    c.closePath();
  }
  // diamond top of tile (i, j) at height z, grown by g px to hide seams
  function tileTop(c, P, i, j, z, g = 0.6) {
    const t = P(i, j, z), r = P(i + 1, j, z), b = P(i + 1, j + 1, z), l = P(i, j + 1, z);
    poly(c, [t.x, t.y - g, r.x + g, r.y, b.x, b.y + g, l.x - g, l.y]);
  }
  // one front face of tile (i, j) from z0 down to z1 (path only)
  function faceL(c, P, i, j, z0, z1) {
    const a = P(i, j + 1, z0), b = P(i + 1, j + 1, z0), b1 = P(i + 1, j + 1, z1), a1 = P(i, j + 1, z1);
    poly(c, [a.x - 0.5, a.y, b.x + 0.5, b.y, b1.x + 0.5, b1.y, a1.x - 0.5, a1.y]);
  }
  function faceR(c, P, i, j, z0, z1) {
    const b = P(i + 1, j + 1, z0), r = P(i + 1, j, z0), r1 = P(i + 1, j, z1), b1 = P(i + 1, j + 1, z1);
    poly(c, [b.x - 0.5, b.y, r.x + 0.5, r.y, r1.x + 0.5, r1.y, b1.x - 0.5, b1.y]);
  }
  // the two front faces of tile (i, j) from z0 (top) down to z1
  function tileSides(c, P, i, j, z0, z1, col) {
    if (z0 <= z1) return;
    c.fillStyle = shade(col, L_LEFT); faceL(c, P, i, j, z0, z1); c.fill();
    c.fillStyle = shade(col, L_RIGHT); faceR(c, P, i, j, z0, z1); c.fill();
  }
  // box: footprint centred on (wx, wy) with half sizes hx, hy (tile units), from z0 to z0 + h
  function isoBox(c, P, wx, wy, hx, hy, z0, h, col, topCol) {
    const z1 = z0 + h;
    const A = (x, y, z) => P(wx + x, wy + y, z);
    const t = A(-hx, -hy, z1), r = A(hx, -hy, z1), b = A(hx, hy, z1), l = A(-hx, hy, z1);
    const rb = A(hx, -hy, z0), bb = A(hx, hy, z0), lb = A(-hx, hy, z0);
    c.fillStyle = shade(col, L_LEFT); poly(c, [l.x, l.y, b.x, b.y, bb.x, bb.y, lb.x, lb.y]); c.fill();
    c.fillStyle = shade(col, L_RIGHT); poly(c, [b.x, b.y, r.x, r.y, rb.x, rb.y, bb.x, bb.y]); c.fill();
    c.fillStyle = topCol || col; poly(c, [t.x, t.y, r.x, r.y, b.x, b.y, l.x, l.y]); c.fill();
  }
  // cylinder: world radius R at (wx, wy), z0..z0 + h. Gradient side, flat top.
  function isoCyl(c, P, wx, wy, R, z0, h, col, topCol) {
    const b = P(wx, wy, z0), t = P(wx, wy, z0 + h), rx = R * Math.SQRT2 * HW, ry = rx / 2;
    const g = c.createLinearGradient(b.x - rx, 0, b.x + rx, 0);
    g.addColorStop(0, shade(col, 0.9)); g.addColorStop(0.35, shade(col, 1.08)); g.addColorStop(1, shade(col, 0.55));
    c.fillStyle = g; c.beginPath();
    c.moveTo(t.x - rx, t.y); c.lineTo(b.x - rx, b.y); c.ellipse(b.x, b.y, rx, ry, 0, Math.PI, 0, true);
    c.lineTo(t.x + rx, t.y); c.closePath(); c.fill();
    c.fillStyle = topCol || shade(col, 1.15); c.beginPath(); c.ellipse(t.x, t.y, rx, ry, 0, 0, TAU); c.fill();
  }
  function isoCone(c, P, wx, wy, R, z0, h, col) {
    const b = P(wx, wy, z0), t = P(wx, wy, z0 + h), rx = R * Math.SQRT2 * HW, ry = rx / 2;
    const g = c.createLinearGradient(b.x - rx, 0, b.x + rx, 0);
    g.addColorStop(0, shade(col, 0.95)); g.addColorStop(0.4, shade(col, 1.12)); g.addColorStop(1, shade(col, 0.55));
    c.fillStyle = g; c.beginPath(); c.moveTo(t.x, t.y); c.lineTo(b.x - rx, b.y);
    c.ellipse(b.x, b.y, rx, ry, 0, Math.PI, 0, true); c.closePath(); c.fill();
  }

  // ---------- terrain: ground ----------
  // Side layers per tile type: [thickness in world units, colour], top first. The last one runs to the bottom.
  const BANDS = {
    grass: [[0.085, '#55a044'], [0.3, '#8a5a36'], [9, '#6f4629']],
    path: [[0.06, '#c9a76c'], [0.32, '#8a5a36'], [9, '#6f4629']],
    water: [[9, '#2f78bd']],
    rock: [[0.22, '#8d8a86'], [0.3, '#7a7672'], [9, '#69625c']],
    mud: [[0.05, '#5b3d28'], [0.33, '#7a4f30'], [9, '#6f4629']],
    bridge: [[0.07, '#a8743f'], [9, '#4a3220']],
  };
  function strata(c, P, i, j, z, zn, right, bands, seed) {
    if (z <= zn) return;
    const f = right ? L_RIGHT : L_LEFT, face = right ? faceR : faceL;
    let top = z;
    for (const [t, col] of bands) {
      if (top <= zn) break;
      c.fillStyle = shade(col, f); face(c, P, i, j, top, zn); c.fill();
      top -= t;
    }
    if (z - zn > 0.4) { // a tall face (the slab edge): two stones in the deep soil
      for (let k = 0; k < 2; k++) {
        if (rnd(seed, 45 + k + (right ? 5 : 0)) < 0.45) continue;
        const t = 0.15 + rnd(seed, 40 + k + (right ? 5 : 0)) * 0.7, zz = zn + 0.04 + rnd(seed, 50 + k + (right ? 5 : 0)) * 0.3;
        const p = right ? P(i + 1, j + 1 - t, zz) : P(i + t, j + 1, zz);
        c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(p.x, p.y + 0.8, 3, 1.8, 0, 0, TAU); c.fill();
        c.fillStyle = right ? '#8a7560' : '#a8927a'; c.beginPath(); c.ellipse(p.x, p.y, 2.6, 1.5, 0, 0, TAU); c.fill();
      }
    }
  }
  function flower(c, x, y, col) {
    c.fillStyle = col; c.beginPath();
    for (const [dx, dy] of [[-1.7, 0], [1.7, 0], [0, -1.5], [0, 1.2]]) { c.moveTo(x + dx + 1.5, y + dy); c.arc(x + dx, y + dy, 1.5, 0, TAU); }
    c.fill();
    c.fillStyle = col === '#ffe680' ? '#ff9a3d' : '#ffd23f'; c.beginPath(); c.arc(x, y - 0.1, 1.1, 0, TAU); c.fill();
  }
  // g = { i, j, t, z, seed }. zR, zL = top height of the right-front and left-front neighbour (or the slab bottom).
  function groundTile(c, P, g, zR, zL) {
    const { i, j, z, seed } = g;
    const t = BANDS[g.t] ? g.t : 'grass';
    if (zR === undefined || zR === null) zR = SLAB_Z;
    if (zL === undefined || zL === null) zL = SLAB_Z;
    strata(c, P, i, j, z, zL, false, BANDS[t], seed);
    strata(c, P, i, j, z, zR, true, BANDS[t], seed);
    const at = (u, v) => P(i + u, j + v, z);
    const R = (k) => rnd(seed, k);
    const ctr = at(0.5, 0.5);
    c.lineCap = 'round';
    if (t === 'grass') {
      c.fillStyle = (i + j) % 2 ? '#62b354' : '#5cad4e'; tileTop(c, P, i, j, z); c.fill();
      if (R(1) < 0.3) { // a darker clover patch
        const p = at(0.25 + R(2) * 0.5, 0.25 + R(3) * 0.5);
        c.fillStyle = 'rgba(40,120,50,0.22)'; c.beginPath(); c.ellipse(p.x, p.y, 9, 4.5, 0, 0, TAU); c.fill();
      }
      c.strokeStyle = '#3f8f3a'; c.lineWidth = 1.2; c.beginPath();
      for (let k = 0; k < 3; k++) {
        const p = at(0.15 + R(10 + k) * 0.7, 0.15 + R(20 + k) * 0.7);
        c.moveTo(p.x - 2, p.y); c.lineTo(p.x - 1.2, p.y - 4); c.moveTo(p.x + 1, p.y); c.lineTo(p.x + 2, p.y - 5);
      }
      c.stroke();
      c.strokeStyle = '#84cf6c'; c.lineWidth = 1; c.beginPath();
      for (let k = 0; k < 2; k++) { const p = at(0.2 + R(30 + k) * 0.6, 0.2 + R(34 + k) * 0.6); c.moveTo(p.x, p.y); c.lineTo(p.x + 0.6, p.y - 3.5); }
      c.stroke();
      if (R(5) < 0.24) {
        const p = at(0.2 + R(6) * 0.6, 0.2 + R(7) * 0.6);
        flower(c, p.x, p.y, ['#ffffff', '#ffe680', '#ff9ad5'][Math.floor(R(8) * 3)]);
        if (R(9) < 0.4) { const q = at(0.2 + R(16) * 0.6, 0.2 + R(17) * 0.6); flower(c, q.x, q.y, '#ffffff'); }
      }
    } else if (t === 'path') {
      c.fillStyle = '#d9b97f'; tileTop(c, P, i, j, z); c.fill();
      c.fillStyle = '#e6cc98';
      for (let k = 0; k < 2; k++) { const p = at(0.2 + R(k) * 0.6, 0.2 + R(4 + k) * 0.6); c.beginPath(); c.ellipse(p.x, p.y, 6, 2.6, 0, 0, TAU); c.fill(); }
      c.fillStyle = '#c4a065';
      for (let k = 0; k < 4; k++) { const p = at(0.15 + R(10 + k) * 0.7, 0.15 + R(20 + k) * 0.7); c.beginPath(); c.ellipse(p.x, p.y, 2.6, 1.3, 0, 0, TAU); c.fill(); }
      if (R(30) < 0.3) { // a little stone
        const p = at(0.2 + R(31) * 0.6, 0.2 + R(32) * 0.6);
        c.fillStyle = '#8f8676'; c.beginPath(); c.ellipse(p.x, p.y, 3, 1.9, 0, 0, TAU); c.fill();
        c.fillStyle = '#c2b9a8'; c.beginPath(); c.ellipse(p.x - 0.6, p.y - 0.6, 2, 1.1, 0, 0, TAU); c.fill();
      }
    } else if (t === 'water') {
      c.fillStyle = '#3d8fd6'; tileTop(c, P, i, j, z); c.fill();
      c.fillStyle = 'rgba(20,70,160,0.22)'; c.beginPath(); c.ellipse(ctr.x + 3, ctr.y + 2, 22, 9, 0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.4;
      for (let k = 0; k < 2; k++) {
        const p = at(0.25 + R(k) * 0.5, 0.25 + R(3 + k) * 0.5);
        c.beginPath(); c.moveTo(p.x - 7, p.y); c.quadraticCurveTo(p.x - 3, p.y - 2, p.x, p.y); c.quadraticCurveTo(p.x + 3, p.y + 2, p.x + 6, p.y); c.stroke();
      }
      if (R(8) < 0.25) { // a lily pad
        const p = at(0.3 + R(9) * 0.4, 0.3 + R(10) * 0.4);
        c.fillStyle = '#2f8f4a'; c.beginPath(); c.ellipse(p.x, p.y + 0.6, 6, 3, 0, 0, TAU); c.fill();
        c.fillStyle = '#58c060'; c.beginPath(); c.moveTo(p.x, p.y); c.ellipse(p.x, p.y, 5.6, 2.8, 0, 0.5, TAU - 0.2); c.closePath(); c.fill();
        if (R(11) < 0.5) flower(c, p.x - 1, p.y - 1, '#ff9ad5');
      }
    } else if (t === 'rock') {
      c.fillStyle = '#9c9995'; tileTop(c, P, i, j, z); c.fill();
      const q = (u, v) => at(0.5 + (u - 0.5) * 0.66, 0.5 + (v - 0.5) * 0.66);
      const a = q(0, 0), b = q(1, 0), d = q(1, 1), e = q(0, 1), m = at(0.46, 0.42);
      c.fillStyle = 'rgba(255,255,255,0.22)'; poly(c, [a.x, a.y, b.x, b.y, m.x, m.y, e.x, e.y]); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.10)'; poly(c, [b.x, b.y, d.x, d.y, e.x, e.y, m.x, m.y]); c.fill();
      c.strokeStyle = 'rgba(40,36,40,0.35)'; c.lineWidth = 1; c.beginPath();
      c.moveTo(m.x, m.y); c.lineTo(d.x - 4, d.y - 2); c.moveTo(m.x, m.y); c.lineTo(b.x - 6, b.y + 1); c.stroke();
      for (let k = 0; k < 2; k++) { // boulders
        const p = at(k ? 0.66 + R(1) * 0.1 : 0.3 + R(2) * 0.12, k ? 0.6 + R(3) * 0.12 : 0.34 + R(4) * 0.1), w = k ? 9 : 7;
        c.fillStyle = 'rgba(30,28,34,0.3)'; c.beginPath(); c.ellipse(p.x + 1.5, p.y + 1, w, w * 0.45, 0, 0, TAU); c.fill();
        c.fillStyle = '#6f6b68'; c.beginPath(); c.ellipse(p.x, p.y - w * 0.3, w, w * 0.62, 0, 0, TAU); c.fill();
        c.fillStyle = '#a9a6a2'; c.beginPath(); c.ellipse(p.x - 0.8, p.y - w * 0.38, w * 0.86, w * 0.5, 0, 0, TAU); c.fill();
        c.fillStyle = '#cbc8c3'; c.beginPath(); c.ellipse(p.x - w * 0.3, p.y - w * 0.55, w * 0.4, w * 0.18, -0.3, 0, TAU); c.fill();
      }
    } else if (t === 'mud') {
      c.fillStyle = '#6b4a30'; tileTop(c, P, i, j, z); c.fill();
      for (let k = 0; k < 3; k++) {
        const p = at(0.25 + R(k) * 0.5, 0.25 + R(4 + k) * 0.5), w = 8 + R(8 + k) * 6;
        c.fillStyle = '#523522'; c.beginPath(); c.ellipse(p.x, p.y, w, w * 0.45, 0, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(255,235,200,0.28)'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(p.x, p.y, w * 0.7, w * 0.28, 0, Math.PI * 1.05, Math.PI * 1.5); c.stroke();
      }
      const p = at(0.3 + R(12) * 0.4, 0.3 + R(13) * 0.4);
      c.strokeStyle = 'rgba(255,235,200,0.4)'; c.lineWidth = 1; c.beginPath(); c.arc(p.x, p.y, 1.8, 0, TAU); c.stroke();
    } else if (t === 'bridge') {
      c.fillStyle = '#b98a55'; tileTop(c, P, i, j, z); c.fill();
      const rot = !!g.rot, N = 5;
      const q = (u, v) => (rot ? at(v, u) : at(u, v));
      for (let k = 0; k < N; k++) {
        if (k % 2) { const a = q(k / N, 0), b = q((k + 1) / N, 0), d = q((k + 1) / N, 1), e = q(k / N, 1); c.fillStyle = '#c99a63'; poly(c, [a.x, a.y, b.x, b.y, d.x, d.y, e.x, e.y]); c.fill(); }
      }
      c.strokeStyle = '#7a5230'; c.lineWidth = 1.2; c.beginPath();
      for (let k = 1; k < N; k++) { const a = q(k / N, 0), b = q(k / N, 1); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
      c.stroke();
      c.fillStyle = '#5a3a1e';
      for (let k = 0; k < N; k++) for (const v of [0.1, 0.9]) { const p = q((k + 0.5) / N, v); c.beginPath(); c.arc(p.x, p.y, 0.9, 0, TAU); c.fill(); }
    }
    c.strokeStyle = 'rgba(0,0,0,0.06)'; c.lineWidth = 1; tileTop(c, P, i, j, z, 0); c.stroke();
  }

  // ---------- terrain: underground ----------
  const HARD = ['', '#a9754a', '#9c6046', '#82848e', '#4a4d63'];
  // u = { i, j, hard, dug, seed }
  function ugTile(c, P, u, zR, zL) {
    const { i, j, dug, seed } = u;
    const hard = Math.max(1, Math.min(4, u.hard | 0 || 1));
    const z = dug ? DIG_Z : 0, col = HARD[hard];
    if (zR === undefined || zR === null) zR = DIG_Z - 0.4;
    if (zL === undefined || zL === null) zL = DIG_Z - 0.4;
    const R = (k) => rnd(seed, k);
    c.lineCap = 'round';
    for (const right of [false, true]) {
      const zn = right ? zR : zL;
      if (z <= zn) continue;
      c.fillStyle = shade(col, right ? L_RIGHT : L_LEFT); (right ? faceR : faceL)(c, P, i, j, z, zn); c.fill();
      const pt = (t, zz) => (right ? P(i + 1, j + 1 - t, zz) : P(i + t, j + 1, zz));
      const seg = (t0, z0, t1, z1) => { const a = pt(t0, z0), b = pt(t1, z1); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); };
      const d = z - zn, o = right ? 7 : 0;
      c.strokeStyle = 'rgba(0,0,0,0.20)'; c.lineWidth = 1; c.beginPath();
      if (hard === 1) { for (let k = 0; k < 3; k++) { const t = 0.1 + R(60 + k + o) * 0.75, zz = z - d * (0.2 + R(70 + k + o) * 0.6); seg(t, zz, t + 0.06, zz); } }
      if (hard === 2) { seg(0, z - d * 0.36, 1, z - d * 0.36); seg(0, z - d * 0.7, 1, z - d * 0.7); }
      if (hard === 3) {
        seg(0, z - d * 0.5, 1, z - d * 0.5);
        const a = 0.2 + R(61 + o) * 0.25, b = 0.55 + R(62 + o) * 0.25;
        seg(a, z, a, z - d * 0.5); seg(b, z - d * 0.5, b, zn); seg(b - 0.4, z - d * 0.5, b - 0.4, zn);
      }
      if (hard === 4) { const a = 0.2 + R(63 + o) * 0.5; seg(a, z, a + 0.2, z - d * 0.55); seg(a + 0.2, z - d * 0.55, a - 0.1, zn); seg(a + 0.2, z - d * 0.55, 0.95, z - d * 0.8); }
      c.stroke();
      // a lit lip under the top edge
      c.strokeStyle = 'rgba(255,255,255,0.14)'; c.beginPath(); seg(0, z - 0.02, 1, z - 0.02); c.stroke();
    }
    const at = (a, b) => P(i + a, j + b, z);
    if (dug) {
      const p = at(0.5, 0.5);
      const g = c.createRadialGradient(p.x, p.y, 2, p.x, p.y, HW);
      if (hard >= 3) { g.addColorStop(0, '#3a3840'); g.addColorStop(1, '#1c1b22'); } else { g.addColorStop(0, '#3f2c1c'); g.addColorStop(1, '#1f150d'); }
      c.fillStyle = g; tileTop(c, P, i, j, z); c.fill();
      for (let k = 0; k < 3; k++) { // rubble
        const q = at(0.2 + R(k) * 0.6, 0.2 + R(5 + k) * 0.6);
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(q.x, q.y + 0.7, 2.6, 1.4, 0, 0, TAU); c.fill();
        c.fillStyle = shade(col, 0.62); c.beginPath(); c.ellipse(q.x, q.y, 2.2, 1.2, 0, 0, TAU); c.fill();
      }
      return;
    }
    c.fillStyle = col; tileTop(c, P, i, j, z); c.fill();
    const t = at(0, 0), r = at(1, 0), l = at(0, 1), m = at(0.5, 0.5);
    c.fillStyle = 'rgba(255,255,255,0.09)'; poly(c, [t.x, t.y, r.x, r.y, m.x, m.y, l.x, l.y]); c.fill(); // the back half catches light
    if (hard === 1) { // soft dirt: crumbs and a root
      c.fillStyle = 'rgba(70,40,15,0.35)';
      for (let k = 0; k < 5; k++) { const p = at(0.15 + R(k) * 0.7, 0.15 + R(6 + k) * 0.7); c.beginPath(); c.ellipse(p.x, p.y, 2.2, 1.1, 0, 0, TAU); c.fill(); }
      c.fillStyle = 'rgba(255,225,180,0.35)';
      for (let k = 0; k < 2; k++) { const p = at(0.2 + R(12 + k) * 0.6, 0.2 + R(15 + k) * 0.6); c.beginPath(); c.ellipse(p.x, p.y, 1.6, 0.9, 0, 0, TAU); c.fill(); }
      if (R(20) < 0.35) {
        const p = at(0.3 + R(21) * 0.4, 0.3 + R(22) * 0.4);
        c.strokeStyle = 'rgba(235,205,160,0.55)'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(p.x - 6, p.y); c.quadraticCurveTo(p.x - 2, p.y - 3, p.x + 1, p.y); c.quadraticCurveTo(p.x + 4, p.y + 2, p.x + 7, p.y - 1); c.stroke();
      }
    } else if (hard === 2) { // packed clay: smooth, with dry cracks
      c.strokeStyle = 'rgba(80,30,15,0.45)'; c.lineWidth = 1.1; c.beginPath();
      const a = at(0.3 + R(1) * 0.4, 0.3 + R(2) * 0.4);
      for (let k = 0; k < 3; k++) {
        const an = k * 2.1 + R(3) * 2, len = 9 + R(4 + k) * 7;
        const mx = a.x + Math.cos(an) * len * 0.5 + (R(8 + k) - 0.5) * 4, my = a.y + Math.sin(an) * len * 0.25;
        c.moveTo(a.x, a.y); c.lineTo(mx, my); c.lineTo(a.x + Math.cos(an) * len, a.y + Math.sin(an) * len * 0.5);
      }
      c.stroke();
      c.fillStyle = 'rgba(255,200,160,0.16)'; const p = at(0.3 + R(12) * 0.4, 0.25 + R(13) * 0.3); c.beginPath(); c.ellipse(p.x, p.y, 8, 3, 0, 0, TAU); c.fill();
    } else if (hard === 3) { // stone: cobbles
      for (let k = 0; k < 4; k++) {
        const p = at([0.3, 0.68, 0.34, 0.72][k] + (R(k) - 0.5) * 0.12, [0.3, 0.34, 0.7, 0.72][k] + (R(5 + k) - 0.5) * 0.12), w = 7 + R(9 + k) * 4;
        c.fillStyle = 'rgba(40,42,55,0.45)'; c.beginPath(); c.ellipse(p.x + 0.6, p.y + 1, w, w * 0.5, 0, 0, TAU); c.fill();
        c.fillStyle = '#9799a3'; c.beginPath(); c.ellipse(p.x, p.y, w - 0.6, w * 0.5 - 0.6, 0, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.ellipse(p.x - w * 0.25, p.y - w * 0.14, w * 0.4, w * 0.14, 0, 0, TAU); c.fill();
      }
    } else { // hard rock: facets and a glint of ore
      const a = at(0.2, 0.25), b = at(0.75, 0.2), d = at(0.8, 0.75), e = at(0.25, 0.8), q = at(0.4 + R(1) * 0.2, 0.4 + R(2) * 0.2);
      c.fillStyle = 'rgba(255,255,255,0.13)'; poly(c, [a.x, a.y, b.x, b.y, q.x, q.y]); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.25)'; poly(c, [b.x, b.y, d.x, d.y, q.x, q.y]); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.12)'; poly(c, [d.x, d.y, e.x, e.y, q.x, q.y]); c.fill();
      c.strokeStyle = 'rgba(190,200,255,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(q.x, q.y); c.lineTo(e.x, e.y); c.stroke();
      if (R(5) < 0.55) {
        const p = at(0.25 + R(6) * 0.5, 0.25 + R(7) * 0.5);
        c.fillStyle = '#b9a6ff'; poly(c, [p.x, p.y - 2.4, p.x + 1.8, p.y, p.x, p.y + 1.6, p.x - 1.8, p.y]); c.fill();
        c.fillStyle = '#ffffff'; c.fillRect(p.x - 0.6, p.y - 1, 1, 1);
      }
    }
    c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 1; tileTop(c, P, i, j, z, 0); c.stroke();
  }

  // ---------- terrain: sky ----------
  function skyTile(c, P, i, j) {
    c.fillStyle = (i + j) % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)'; tileTop(c, P, i, j, 0); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.16)'; c.lineWidth = 1; tileTop(c, P, i, j, 0, 0); c.stroke();
  }

  // ---------- drawing helpers (sprites) ----------
  // paint() sets c for the sprite that it draws now.
  let c = null;
  let mz = [0, 0];      // a tower writes its firing point here (px, relative to the plinth top)
  const fill = (col) => { c.fillStyle = col; };
  const ink = (col, w) => { c.strokeStyle = col; c.lineWidth = w; };
  const circle = (x, y, r) => { c.beginPath(); c.arc(x, y, Math.abs(r), 0, TAU); c.fill(); };
  const ring = (x, y, r) => { c.beginPath(); c.arc(x, y, Math.abs(r), 0, TAU); c.stroke(); };
  const oval = (x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); c.fill(); };
  const ovalS = (x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); c.stroke(); };
  const line = (x0, y0, x1, y1) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
  const pg = (pts) => { poly(c, pts); c.fill(); };
  function rrect(x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  const rbox = (x, y, w, h, r) => { rrect(x, y, w, h, r); c.fill(); };
  function polyline(p) { c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.stroke(); }
  // iso points as a flat list: zp([x, y, z], ...)
  const zp = (...a) => { const out = []; for (const [x, y, z] of a) { const p = ZERO(x, y, z); out.push(p.x, p.y); } return out; };
  function star4(x, y, r) {
    const q = r * 0.3;
    c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + q, y - q); c.lineTo(x + r, y); c.lineTo(x + q, y + q);
    c.lineTo(x, y + r); c.lineTo(x - q, y + q); c.lineTo(x - r, y); c.lineTo(x - q, y - q); c.closePath(); c.fill();
  }
  function star5(x, y, r) {
    c.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, q = k % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    c.closePath();
  }
  function heartPath(x, y, s) {
    c.beginPath(); c.moveTo(x, y + s * 0.9);
    c.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.6, y - s * 1.4, x, y - s * 0.5);
    c.bezierCurveTo(x + s * 0.6, y - s * 1.4, x + s * 1.6, y - s * 0.2, x, y + s * 0.9);
  }
  // lightning bolt, top at (x, y)
  function bolt(x, y, s) {
    c.beginPath(); c.moveTo(x + 2 * s, y); c.lineTo(x - 3 * s, y + 7 * s); c.lineTo(x, y + 7 * s); c.lineTo(x - 2 * s, y + 13 * s);
    c.lineTo(x + 4 * s, y + 5 * s); c.lineTo(x + 1 * s, y + 5 * s); c.closePath();
  }
  function drop(x, y, s) { c.beginPath(); c.arc(x, y, 1.7 * s, 0, Math.PI); c.lineTo(x, y - 4 * s); c.closePath(); c.fill(); }
  // a round body: a dark rim at the bottom right, the main colour, a shine
  function ball(x, y, r, main, dark) {
    fill(dark); circle(x, y, r);
    fill(main); circle(x - r * 0.07, y - r * 0.09, r * 0.9);
    fill('rgba(255,255,255,0.38)'); oval(x - r * 0.4, y - r * 0.48, r * 0.3, r * 0.15, -0.5);
  }
  // soft light
  function glow(x, y, r, rgb, a) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g; circle(x, y, r);
  }
  // the part of an ellipse that the same ellipse moved by (dx, dy) does not cover: a shadow on a round thing
  function crescent(x, y, rx, ry, dx, dy, col) {
    c.save(); c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.clip();
    c.beginPath(); c.rect(x - rx - 2, y - ry - 2, 2 * rx + 4, 2 * ry + 4); c.ellipse(x + dx, y + dy, rx, ry, 0, 0, TAU);
    fill(col); c.fill('evenodd'); c.restore();
  }
  // upright tapered cylinder: bottom centre (x, yb), radius rb at the bottom and rt at the top. topCol null = no lid.
  function tube(x, yb, rb, rt, h, col, topCol) {
    const m = Math.max(rb, rt);
    const g = c.createLinearGradient(x - m, 0, x + m, 0);
    g.addColorStop(0, shade(col, 0.92)); g.addColorStop(0.3, shade(col, 1.14)); g.addColorStop(1, shade(col, 0.58));
    c.fillStyle = g; c.beginPath(); c.moveTo(x - rt, yb - h); c.lineTo(x - rb, yb);
    c.ellipse(x, yb, rb, rb / 2, 0, Math.PI, 0, true); c.lineTo(x + rt, yb - h); c.closePath(); c.fill();
    if (topCol !== null) { fill(topCol || shade(col, 1.2)); oval(x, yb - h, rt, rt / 2); }
  }
  function leaf(x, y, len, rot, col, dark) {
    c.save(); c.translate(x, y); c.rotate(rot);
    fill(dark); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.5, -len * 0.4, len, 0); c.quadraticCurveTo(len * 0.5, len * 0.45, 0, 0); c.fill();
    fill(col); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.5, -len * 0.4, len, 0); c.quadraticCurveTo(len * 0.5, len * 0.1, 0, 0); c.fill();
    c.restore();
  }
  function eyes(x0, y0, x1, y1, r) {
    fill(INK); circle(x0, y0, r); circle(x1, y1, r);
    fill('#ffffff'); circle(x0 - r * 0.3, y0 - r * 0.35, r * 0.38); circle(x1 - r * 0.3, y1 - r * 0.35, r * 0.38);
  }
  function smile(x, y, w, lw = 1.3) { ink(INK, lw); c.beginPath(); c.arc(x, y - w * 0.5, w, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke(); }
  function frown(x, y, w, lw = 1.3) { ink(INK, lw); c.beginPath(); c.arc(x, y + w * 0.9, w, 1.25 * Math.PI, 1.75 * Math.PI); c.stroke(); }

  // ---------- towers ----------
  // The stone plinth under every tower. Gold studs on the lit face count the level.
  function plinth(lvl) {
    let hx = 0.36, z0 = 0;
    if (lvl >= 2) { isoBox(c, ZERO, 0, 0, 0.385, 0.385, 0, 0.075, '#85858f', '#a9a9b6'); hx = 0.34; z0 = 0.07; }
    isoBox(c, ZERO, 0, 0, hx, hx, z0, PL - z0, '#9a9aa6', '#bdbdca');
    if (lvl === 3) { // a gold band under the top edge
      fill('#e0a83a'); pg(zp([-hx, hx, PL - 0.03], [hx, hx, PL - 0.03], [hx, hx, PL - 0.075], [-hx, hx, PL - 0.075]));
      fill('#a8741a'); pg(zp([hx, hx, PL - 0.03], [hx, -hx, PL - 0.03], [hx, -hx, PL - 0.075], [hx, hx, PL - 0.075]));
    }
    ink('rgba(255,255,255,0.45)', 1); polyline(zp([-hx, hx, PL], [hx, hx, PL], [hx, -hx, PL]));
    ink('rgba(27,31,51,0.25)', 1);
    polyline(zp([0.12, hx, z0 + 0.02], [0.12, hx, z0 + 0.07])); polyline(zp([hx, -0.1, PL - 0.09], [hx, -0.1, PL - 0.02]));
    const zm = lvl >= 2 ? (lvl === 3 ? 0.105 : 0.14) : 0.11;
    for (let k = 0; k < lvl; k++) {
      const p = ZERO((k - (lvl - 1) / 2) * 0.15 - 0.08, hx, zm);
      fill('#8a5a12'); circle(p.x, p.y + 0.6, 2.1); fill('#ffd23f'); circle(p.x, p.y, 1.8); fill('#fff6c0'); circle(p.x - 0.5, p.y - 0.5, 0.7);
    }
    fill('rgba(20,20,40,0.2)'); oval(1, -PL * ZU + 1, 19, 9);
  }

  function pod(x, y, rx, ry, rot, face, lvl) {
    c.save(); c.translate(x, y); c.rotate(rot);
    // the stalk end: a calyx and a curl
    ink('#2c6e33', 1.6); c.beginPath(); c.moveTo(-rx + 1, 0); c.quadraticCurveTo(-rx - 6, -2, -rx - 4, -7); c.stroke();
    fill('#2c6e33'); pg([-rx - 2, 0, -rx + 5, -ry * 0.8, -rx + 6, ry * 0.8]);
    fill('#2f7f38'); oval(0, 0.8, rx, ry);
    fill('#5cc24f'); oval(-0.6, -0.7, rx - 1, ry - 1.4);
    fill('#93e374'); oval(-rx * 0.2, -ry * 0.5, rx * 0.55, ry * 0.26);
    ink('rgba(20,60,25,0.55)', 1.1); ovalS(0, 0.2, rx, ry + 0.3);
    ink('#2f7f38', 1.1); c.beginPath(); c.ellipse(0, -ry * 0.25, rx * 0.8, ry * 0.9, 0, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
    // the muzzle
    fill('#2c6e33'); oval(rx - 1.5, 0, 4.6, ry * 0.86);
    fill('#7bd36b'); oval(rx - 2, -0.3, 4.2, ry * 0.8);
    fill('#12301a'); oval(rx - 1.2, 0, 3, ry * 0.58);
    if (face) {
      fill('#b6ff7a'); circle(rx - 1.6, 0.6, ry * 0.36); fill('#ffffff'); circle(rx - 2.4, -0.2, 0.9);
      const ex = rx * 0.1;
      fill('#ffffff'); circle(ex, -ry * 0.28, 2.9); circle(ex + 6, -ry * 0.22, 2.5);
      fill(INK); circle(ex + 1, -ry * 0.24, 1.5); circle(ex + 6.9, -ry * 0.2, 1.3);
      if (lvl >= 2) { ink(INK, 1.3); line(ex - 3, -ry * 0.28 - 4, ex + 2, -ry * 0.28 - 2.8); line(ex + 4, -ry * 0.22 - 2.9, ex + 8.5, -ry * 0.22 - 3.4); }
    }
    c.restore();
  }
  // Pea Pod: a pot plant whose pod is a cannon
  function pea(l) {
    const H = [0, 20, 30, 38][l], pr = 10 + l, ph = 11 + l, top = 2 - ph - 3;
    const POT = l === 3 ? '#3f79c4' : '#c8683c';
    tube(0, 2, pr - 3.5, pr, ph, POT, null);
    if (l >= 2) { ink(l === 3 ? '#ffd23f' : '#ffe9c9', 2.2); c.beginPath(); c.ellipse(0, 2 - ph * 0.5, pr - 1.6, (pr - 1.6) / 2, 0, 0.12, Math.PI - 0.12); c.stroke(); }
    tube(0, 2 - ph, pr + 1.5, pr + 1.5, 3, l === 3 ? '#ffd23f' : '#d97a48', '#4a2f1c');
    ink(l === 3 ? '#fff3b0' : '#f0a070', 1); c.beginPath(); c.ellipse(0, top, pr + 1.5, (pr + 1.5) / 2, 0, Math.PI * 0.9, Math.PI * 1.7); c.stroke();
    // the stalk
    const sx = -1, sy = top - H;
    for (const [col, w] of [['#256b2e', 6.5], ['#4fae4c', 4], ['#84d86a', 1.2]]) {
      ink(col, w); c.lineCap = 'round'; c.beginPath(); c.moveTo(w < 2 ? -0.8 : 0, top + 1); c.quadraticCurveTo(-8, top - H * 0.5, sx - (w < 2 ? 0.8 : 0), sy); c.stroke();
    }
    leaf(-3, top - 3, 13 + l, Math.PI + 0.5, '#5cc24f', '#2f7f38');
    leaf(-2, top - 5, 12 + l, -0.35, '#5cc24f', '#2f7f38');
    if (l >= 2) leaf(-5, top - H * 0.55, 12, Math.PI + 0.2, '#6fd15c', '#2f7f38');
    if (l === 3) leaf(-4, top - H * 0.7, 11, -0.6, '#6fd15c', '#2f7f38');
    const rx = 13.5 + l * 1.5, ry = 7.5 + l * 0.7, px = 4, py = sy - 3;
    if (l === 3) pod(px - 7, py - 12, rx - 2, ry - 1, -0.52, false, l);
    pod(px, py, rx, ry, -0.3, true, l);
    if (l === 3) { // a flower on the back of the pod
      const fx = px - rx * 0.95 - 2, fy = py + rx * 0.3 - 4;
      fill('#ff7ad9'); for (let k = 0; k < 5; k++) circle(fx + Math.cos(k * 1.257) * 3, fy + Math.sin(k * 1.257) * 3, 2.3);
      fill('#ffd23f'); circle(fx, fy, 1.9);
    }
    mz = [px + Math.cos(-0.3) * (rx + 2), py + Math.sin(-0.3) * (rx + 2)];
  }

  function kiteSail(x, y, kw, kh, rot, cols, face) {
    c.save(); c.translate(x, y); c.rotate(rot);
    const cy = -kh * 0.25;
    fill(cols[0]); pg([0, -kh, 0, cy, -kw, cy]);
    fill(cols[1]); pg([0, -kh, kw, cy, 0, cy]);
    fill(cols[2]); pg([-kw, cy, 0, cy, 0, kh]);
    fill(cols[3]); pg([0, cy, kw, cy, 0, kh]);
    fill('rgba(255,255,255,0.3)'); pg([0, -kh, -kw * 0.35, cy - kh * 0.3, -kw, cy, -kw * 0.5, cy - kh * 0.5]);
    ink('rgba(27,31,51,0.45)', 1); line(0, -kh, 0, kh); line(-kw, cy, kw, cy);
    ink(INK, 1.2); c.lineJoin = 'round'; poly(c, [0, -kh, kw, cy, 0, kh, -kw, cy]); c.stroke();
    if (face) { eyes(-3.4, cy - 3, 3.6, cy - 3, 1.5); smile(0.1, cy + 2.6, 3, 1.1); }
    c.restore();
  }
  function ribbon(x, y, n, col, col2) {
    // a wavy tail with bows, hanging to the right
    const pts = [[x, y]];
    for (let k = 1; k <= n; k++) pts.push([x + k * 6.5, y + k * 5.5 + (k % 2 ? 2 : -1)]);
    ink(col, 1.4); c.beginPath(); c.moveTo(x, y);
    for (let k = 1; k < pts.length; k++) c.quadraticCurveTo(pts[k - 1][0] + (k % 2 ? 0 : 5), pts[k - 1][1] + (k % 2 ? 5 : 0), pts[k][0], pts[k][1]);
    c.stroke();
    for (let k = 1; k < pts.length; k++) {
      const [bx, by] = pts[k];
      fill(k % 2 ? col2 : col); pg([bx, by, bx - 3.6, by - 2.8, bx - 3.2, by + 2.2]); pg([bx, by, bx + 3.6, by - 2.2, bx + 3.2, by + 2.8]);
      fill(INK); circle(bx, by, 0.8);
    }
  }
  // Kite Launcher: a post with a reel and a kite on top
  function kite(l) {
    const H = [0, 27, 35, 42][l], kw = [0, 11, 13, 15][l], kh = [0, 14, 16.5, 19][l];
    isoBox(c, ZERO, 0, 0, 0.11, 0.11, 0, 0.09, '#8a5a36', '#a8743f');
    tube(0, -3, 2.8, 2.3, H - 3, '#b07a44', '#d9a868');
    if (l >= 2) { fill(l === 3 ? '#ffd23f' : '#ff4d5e'); c.fillRect(-2.7, -H * 0.55, 5.3, 2.4); c.fillRect(-2.5, -H * 0.8, 4.9, 2.4); }
    const kx = 5, ky = -H - kh + 9;
    // the string from the reel to the kite
    const ry = -12 - l, rr = 5.5 + l * 0.7;
    ink('#fff6dc', 1); c.beginPath(); c.moveTo(5, ry - rr + 1); c.quadraticCurveTo(13, ry - 14, kx + 2, ky + 2); c.stroke();
    if (l === 3) { // a baby kite on its own string
      ink('#fff6dc', 0.9); c.beginPath(); c.moveTo(2, ry - rr); c.quadraticCurveTo(-8, -H * 0.9, -15, -H - 5); c.stroke();
      kiteSail(-16, -H - 9, 6.5, 8.5, -0.3, ['#5ef0ff', '#2bb5d6', '#2bb5d6', '#1b86a8'], false);
      ribbon(-13.5, -H - 1, 1, '#ff7ad9', '#ffd23f');
    }
    // the reel
    fill('#5a3a1e'); circle(5.6, ry + 0.6, rr + 0.6);
    fill('#8a5a36'); circle(5, ry, rr);
    fill('#f3e6c0'); circle(5, ry, rr - 1.7);
    ink('#cdbb8a', 0.8); ring(5, ry, rr - 3.2);
    fill(INK); circle(5, ry, 1.3);
    ink('#3a3d52', 1.6); line(5, ry, 5 + rr + 2.5, ry + 2.5); fill('#ff4d5e'); circle(5 + rr + 2.8, ry + 2.6, 1.9);
    ribbon(kx + Math.sin(-0.2) * -kh + 1, ky + kh - 1.5, l + 1, l === 3 ? '#ff7ad9' : '#ffd23f', l === 1 ? '#ffd23f' : '#5ef0ff');
    const cols = l === 1 ? ['#ff6b78', '#ff3b52', '#ff3b52', '#c81e3c']
      : l === 2 ? ['#ff6b78', '#ffd23f', '#ffe680', '#c81e3c']
        : ['#ff7ad9', '#5ef0ff', '#ffd23f', '#ff3b52'];
    kiteSail(kx, ky, kw, kh, 0.2, cols, l >= 2);
    if (l === 3) { fill('#ffd23f'); star5(kx + 3.6, ky - kh - 1.5, 3.6); c.fill(); ink('#a8741a', 0.8); c.stroke(); }
    mz = [kx, ky - 3];
  }

  // Brain Freeze: a soft-serve machine with one giant cone
  function ice(l) {
    const bh = 0.2 + 0.05 * l, hb = 0.23;
    isoBox(c, ZERO, 0, 0, hb, hb, 0, bh, '#f08fb8', '#ffd3e6');
    const fl = (x, z) => ZERO(x, hb, z), fr = (y, z) => ZERO(hb, y, z);
    // a white panel with a tap and a drip tray
    fill('#fff4fa'); pg([...Object.values(fl(-0.17, bh - 0.04)), ...Object.values(fl(0.17, bh - 0.04)), ...Object.values(fl(0.17, 0.06)), ...Object.values(fl(-0.17, 0.06))]);
    let p = fl(-0.07, bh * 0.55); fill('#5ef0ff'); circle(p.x, p.y, 2.2); fill('#ffffff'); circle(p.x - 0.6, p.y - 0.6, 0.8);
    p = fl(0.07, bh * 0.55); fill('#ff7ad9'); circle(p.x, p.y, 2.2); fill('#ffffff'); circle(p.x - 0.6, p.y - 0.6, 0.8);
    if (l >= 2) { p = fl(0, bh * 0.2); ink('#c9658f', 1.4); line(p.x - 5, p.y - 2.5, p.x + 5, p.y + 2.5); }
    p = fr(0, bh * 0.6); ink('#8f3f64', 2); line(p.x, p.y, p.x + 5, p.y - 5); fill('#ff2a4d'); circle(p.x + 5.5, p.y - 5.5, 2.2);
    if (l === 3) { p = fr(0, bh * 0.25); fill('#ffffff'); star4(p.x, p.y, 3.4); }
    ink('rgba(255,255,255,0.6)', 1); polyline(zp([-hb, hb, bh], [hb, hb, bh], [hb, -hb, bh]));
    const ty = -bh * ZU;
    fill('#c9658f'); oval(0, ty, 9.5, 4.8); fill('#8f3f64'); oval(0, ty + 0.6, 7, 3.4);
    // the cone
    const cw = 9.5 + l, ch = 14 + 2 * l, cy = ty - ch;
    c.save();
    c.beginPath(); c.moveTo(-3.5, ty + 2); c.lineTo(-cw, cy); c.lineTo(cw, cy); c.lineTo(3.5, ty + 2); c.closePath();
    const g = c.createLinearGradient(-cw, 0, cw, 0); g.addColorStop(0, '#e6ae62'); g.addColorStop(0.3, '#f6cd8a'); g.addColorStop(1, '#b97a36');
    c.fillStyle = g; c.fill(); c.clip();
    ink('rgba(122,70,20,0.5)', 1);
    for (let k = -6; k < 7; k++) { line(k * 5, cy, k * 5 + ch * 0.7, ty + 3); line(k * 5, cy, k * 5 - ch * 0.7, ty + 3); }
    c.restore();
    ink('rgba(122,70,20,0.7)', 1); c.beginPath(); c.moveTo(-cw, cy); c.lineTo(-3.5, ty + 2); c.moveTo(cw, cy); c.lineTo(3.5, ty + 2); c.stroke();
    // the swirl
    const n = l + 2;
    let y = cy - 1, w = cw + 3.5;
    for (let k = 0; k < n; k++) {
      fill('#8cc6e6'); oval(0.8, y + 1.4, w, 5.2);
      fill('#e9fbff'); oval(-0.4, y, w - 0.8, 4.5);
      fill('#ffffff'); oval(-w * 0.32, y - 1.5, w * 0.42, 1.5);
      ink('rgba(60,130,180,0.5)', 1); c.beginPath(); c.ellipse(0.4, y + 1.2, w, 5.2, 0, 0.1, Math.PI * 0.9); c.stroke();
      if (k === 0) { // the face of a cone with a headache
        ink(INK, 1.5); c.lineCap = 'round'; c.lineJoin = 'round'; polyline([-8, y - 2.6, -4.6, y - 0.6, -8, y + 1.2]); polyline([6.4, y - 2.6, 3, y - 0.6, 6.4, y + 1.2]);
        fill(INK); oval(-0.8, y + 2, 1.7, 1.3);
      }
      if (l >= 2 && k > 0) {
        const SPR = ['#ff7ad9', '#ffd23f', '#5ef0ff', '#ff2a4d'];
        for (let s = 0; s < 3; s++) { fill(SPR[(k + s) % 4]); c.save(); c.translate((hash(k * 9 + s) - 0.5) * w * 1.4, y + (hash(k * 5 + s * 3) - 0.3) * 3); c.rotate(hash(k + s * 7) * 3); c.fillRect(-1.5, -0.6, 3, 1.3); c.restore(); }
      }
      y -= 5.6; w = w * 0.78 - 0.4;
    }
    // the curl on top
    fill('#8cc6e6'); c.beginPath(); c.moveTo(-w - 1, y + 4); c.quadraticCurveTo(-1, y - 2, 3.5, y - 5.5); c.quadraticCurveTo(4, y + 1, w + 2, y + 4.5); c.closePath(); c.fill();
    fill('#f4fdff'); c.beginPath(); c.moveTo(-w - 1, y + 3.4); c.quadraticCurveTo(-1, y - 2, 3.2, y - 5); c.quadraticCurveTo(2, y + 1, w, y + 3.4); c.closePath(); c.fill();
    if (l === 3) {
      fill('#6b3a1e'); c.save(); c.translate(7, y + 3); c.rotate(0.5); rbox(-1.8, -13, 3.6, 13, 1); fill('#8a5230'); c.fillRect(-1.2, -12.5, 1.2, 12); c.restore(); // a flake
      ink('#2f7f38', 1.2); c.beginPath(); c.moveTo(1, y - 8); c.quadraticCurveTo(0, y - 14, -5, y - 15); c.stroke();
      ball(1.5, y - 6.5, 4, '#ff2a4d', '#a8102e');
      fill('#ffffff'); star4(-13, y + 4, 3.6); star4(14.5, y + 15, 2.6);
    }
    mz = [0, y - 4];
  }

  // Teapot Mortar: a fat teapot, spout up
  function mortar(l) {
    const r = 12.5 + l * 1.8, ry = r * 0.84;
    let by = 3;
    if (l >= 2) { tube(0, 4, r * 0.62, r * 1.02, 3, '#e8eef6', '#f8fbff'); ink('#5c8fe0', 1); c.beginPath(); c.ellipse(0, 1, r * 0.95, r * 0.47, 0, 0.2, Math.PI - 0.2); c.stroke(); by = 1; }
    if (l === 3) { // a brass tea-light stand
      tube(0, 0, r * 0.7, r * 0.74, 9, '#d9a23a', '#f2c860');
      fill('#3a2410'); c.beginPath(); c.moveTo(-5, 1.5); c.lineTo(-5, -3); c.arc(0, -3, 5, Math.PI, 0); c.lineTo(5, 1.5); c.closePath(); c.fill();
      fill('#ff8a2a'); c.beginPath(); c.moveTo(-2.4, 1.5); c.quadraticCurveTo(-3, -3, 0, -6); c.quadraticCurveTo(3, -3, 2.4, 1.5); c.closePath(); c.fill();
      fill('#ffe680'); oval(0, 0, 1.3, 2.2);
      by = -8.5;
    }
    const cy = by - ry + 1;
    const BODY = l === 1 ? '#9a5630' : '#f4ecdc', DARK = l === 1 ? '#63321a' : '#b9ab94';
    // the handle
    ink(DARK, 5.2); c.beginPath(); c.arc(-r - 0.5, cy - 1, r * 0.46, Math.PI * 0.42, Math.PI * 1.6); c.stroke();
    ink(BODY, 2.6); c.beginPath(); c.arc(-r - 0.8, cy - 1.4, r * 0.46, Math.PI * 0.45, Math.PI * 1.58); c.stroke();
    // the spout: a mortar tube that leans to the right
    const sl = r + 7 + l, sa = 0.52, sx = r * 0.58, sy = cy + 1;
    c.save(); c.translate(sx, sy); c.rotate(sa);
    tube(0, 0, 6, 4.4 + l * 0.5, sl, BODY, null);
    fill(l === 3 ? '#ffd23f' : DARK); oval(0, -sl, 5.3 + l * 0.5, 3.1);
    fill('#1f120c'); oval(0, -sl, 3.7 + l * 0.5, 2);
    c.restore();
    mz = [sx + Math.sin(sa) * sl, sy - Math.cos(sa) * sl];
    // the body
    fill(DARK); oval(0, cy, r + 1.5, ry);
    fill(BODY); oval(-1, cy - 1, r + 0.3, ry - 1.3);
    if (l >= 2) { // the knitted cosy
      c.save(); c.beginPath(); c.ellipse(0, cy + 0.6, r + 1.5, ry - 1, 0, 0, TAU); c.clip();
      const COSY = l === 2 ? ['#ff8fb0', '#fff1d6'] : ['#ff7ad9', '#fff1d6', '#5ec8d8', '#fff1d6'];
      for (let k = 0; k < 9; k++) {
        const yy = cy - ry + k * 4.4;
        ink(COSY[k % COSY.length], 4.6); c.beginPath(); c.moveTo(-r - 4, yy); c.quadraticCurveTo(0, yy + 7, r + 4, yy); c.stroke();
        ink('rgba(120,40,80,0.25)', 0.8);
        for (let s = -5; s <= 5; s++) { const xx = s * 3.6 + (k % 2) * 1.8, d = (1 - (xx * xx) / ((r + 4) * (r + 4))) * 3.5; line(xx, yy + d - 1.2, xx + 1.2, yy + d + 1.2); }
      }
      c.restore();
      crescent(0, cy + 0.6, r + 1.5, ry - 1, -3.2, -3.2, 'rgba(60,20,60,0.24)');
      fill('rgba(255,255,255,0.3)'); oval(-r * 0.42, cy - ry * 0.45, r * 0.3, ry * 0.16, -0.5);
      ink('rgba(60,20,60,0.5)', 1); ovalS(0, cy + 0.6, r + 1.5, ry - 1);
      // the pom-pom
      const pr = l === 3 ? 5.2 : 4.2, py = cy - ry - pr * 0.45;
      fill('#d9d0c0'); circle(0.7, py + 0.8, pr);
      fill('#ffffff'); for (let k = 0; k < 7; k++) circle(Math.cos(k * 0.9) * pr * 0.45 - 0.3, py + Math.sin(k * 0.9) * pr * 0.45 - 0.3, pr * 0.58);
      fill(l === 3 ? '#ff7ad9' : '#ff8fb0'); circle(-pr * 0.25, py - pr * 0.3, pr * 0.3);
    } else {
      fill('rgba(255,255,255,0.4)'); oval(-r * 0.42, cy - ry * 0.45, r * 0.3, ry * 0.16, -0.5);
      ink('#f0d9a8', 1.4); c.beginPath(); c.ellipse(0, cy - 1, r * 0.98, ry * 0.4, 0, 0.25, Math.PI - 0.25); c.stroke();
      // the lid and its knob
      fill(DARK); oval(0, cy - ry + 2.6, r * 0.56, r * 0.2);
      fill('#b56a3e'); oval(-0.5, cy - ry + 1.8, r * 0.5, r * 0.16);
      ball(0, cy - ry - 1.6, 3.2, '#b56a3e', DARK);
    }
    if (l === 3) { // the tag of the tea bag, and a puff of steam
      ink('#fff6dc', 0.9); c.beginPath(); c.moveTo(-4, cy - ry + 3); c.quadraticCurveTo(-10, cy - 2, -8, cy + 5); c.stroke();
      fill('#ffe680'); c.save(); c.translate(-8, cy + 8); c.rotate(0.2); rbox(-3, -3, 6, 6.5, 1); fill('#ff2a4d'); heartPath(0, 0.4, 1.7); c.fill(); c.restore();
      fill('rgba(255,255,255,0.75)'); circle(mz[0] + 3, mz[1] - 5, 3); circle(mz[0] + 6.5, mz[1] - 9.5, 2.2); circle(mz[0] + 5, mz[1] - 13.5, 1.4);
    }
  }

  function toast(x, y, rot, s) {
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
    fill('#9a5c22'); rbox(-6.2, -6.6, 13.4, 13.4, 3.2);
    fill('#b8742e'); rbox(-6.6, -7, 12.6, 12.8, 3);
    fill('#f0c27a'); rbox(-5, -5.4, 9.4, 9.6, 2.2);
    fill('#f9dca0'); rbox(-4.2, -4.6, 5, 3, 1.4);
    c.restore();
  }
  // Tesla Toaster: a chrome toaster with a coil
  function tesla(l) {
    const hx = 0.25, hy = 0.17, z0 = 0.035, h = 0.31 + 0.035 * l, zt = z0 + h;
    isoBox(c, ZERO, 0, 0, hx - 0.02, hy - 0.02, 0, z0 + 0.01, '#2a2d3d');
    isoBox(c, ZERO, 0, 0, hx, hy, z0, h, '#c3cedd', '#e9eff7');
    const fl = (x, z) => ZERO(x, hy, z), fr = (y, z) => ZERO(hx, y, z);
    // chrome: a bright band, a dark band and a streak
    fill('rgba(255,255,255,0.55)'); pg(zp([-hx, hy, z0 + h * 0.9], [hx, hy, z0 + h * 0.9], [hx, hy, z0 + h * 0.62], [-hx, hy, z0 + h * 0.62]));
    fill('rgba(70,90,130,0.28)'); pg(zp([-hx, hy, z0 + h * 0.3], [hx, hy, z0 + h * 0.3], [hx, hy, z0], [-hx, hy, z0]));
    fill('rgba(255,255,255,0.28)'); pg(zp([hx, hy, z0 + h * 0.9], [hx, -hy, z0 + h * 0.9], [hx, -hy, z0 + h * 0.62], [hx, hy, z0 + h * 0.62]));
    fill('rgba(30,40,80,0.2)'); pg(zp([hx, hy, z0 + h * 0.3], [hx, -hy, z0 + h * 0.3], [hx, -hy, z0], [hx, hy, z0]));
    ink('rgba(255,255,255,0.8)', 1); polyline(zp([-hx, hy, zt], [hx, hy, zt], [hx, -hy, zt]));
    ink('rgba(27,31,51,0.5)', 1); polyline(zp([-hx, hy, zt], [-hx, hy, z0], [hx, hy, z0], [hx, -hy, z0], [hx, -hy, zt]));
    // a dial on the long face, the lever on the short one
    let p = fl(-0.1, z0 + h * 0.42); fill('#2a2d3d'); circle(p.x, p.y, 3.3); fill('#ff2a4d'); circle(p.x + 1, p.y - 1.2, 1.1);
    if (l >= 2) { p = fl(0.08, z0 + h * 0.42); fill('#2a2d3d'); circle(p.x, p.y, 2.4); fill('#5ef0ff'); circle(p.x, p.y, 1.2); }
    const a = fr(0, z0 + h * 0.85), b = fr(0, z0 + h * 0.2);
    ink('#2a2d3d', 2); line(a.x, a.y, b.x, b.y);
    p = fr(0, z0 + h * (l === 3 ? 0.78 : 0.3)); fill('#14161f'); rbox(p.x - 1.5, p.y - 2.4, 8, 4.4, 1.8); fill('#5a6078'); c.fillRect(p.x, p.y - 1.8, 5, 1);
    // two slots across the top
    const SLOTS = [0.02, 0.15];
    for (const sx of SLOTS) { fill('#20222e'); pg(zp([sx - 0.035, -hy + 0.04, zt], [sx + 0.035, -hy + 0.04, zt], [sx + 0.035, hy - 0.04, zt], [sx - 0.035, hy - 0.04, zt])); }
    // the coil
    const cb = ZERO(-0.14, 0, zt), cn = l + 1, chh = 9 + cn * 5.2;
    fill('#8792a8'); oval(cb.x, cb.y, 6, 3);
    tube(cb.x, cb.y, 1.8, 1.8, chh, '#8792a8', null);
    for (let k = 0; k < cn; k++) {
      const y = cb.y - 5 - k * 5.2, rx = 7.4 - k * 0.9;
      fill('#8a4a1c'); oval(cb.x + 0.4, y + 1.2, rx, rx * 0.44);
      fill('#e08a44'); oval(cb.x, y, rx, rx * 0.42);
      fill('#ffc890'); oval(cb.x - rx * 0.3, y - rx * 0.14, rx * 0.5, rx * 0.14);
    }
    const bx = cb.x, bY = cb.y - chh - 2, br = 3.8 + l * 0.5;
    if (l >= 2) glow(bx, bY, br + 9 + l * 2, '94,240,255', 0.45);
    if (l === 3) {
      ink('#5ef0ff', 1.5); c.lineJoin = 'round';
      polyline([bx - 3, bY - 2, bx - 9, bY - 6, bx - 7, bY - 9, bx - 13, bY - 12]);
      polyline([bx + 2, bY - 4, bx + 4, bY - 10, bx + 1, bY - 12, bx + 3, bY - 17]);
      polyline([bx - 4, bY + 2, bx - 10, bY + 3, bx - 11, bY + 7]);
      ink('#ffffff', 0.7); polyline([bx - 3, bY - 2, bx - 9, bY - 6, bx - 7, bY - 9]);
    }
    ball(bx, bY, br, '#eef3fa', '#7d89a3');
    // toast
    const slice = (sx, rise) => {
      const zb = zt - 0.01, z1 = zt + rise;
      for (const [dx, col] of [[0.02, '#9a5c22'], [-0.012, '#b8742e']]) {
        fill(col); pg(zp([sx + dx, -0.1, zb], [sx + dx, -0.1, z1 - 0.04], [sx + dx, -0.065, z1], [sx + dx, 0.065, z1], [sx + dx, 0.1, z1 - 0.04], [sx + dx, 0.1, zb]));
      }
      fill('#f0c27a'); pg(zp([sx - 0.012, -0.07, zb], [sx - 0.012, -0.07, z1 - 0.05], [sx - 0.012, 0.07, z1 - 0.05], [sx - 0.012, 0.07, zb]));
    };
    if (l === 1) slice(SLOTS[1], 0.1);
    if (l === 2) { slice(SLOTS[0], 0.15); slice(SLOTS[1], 0.12); }
    if (l === 3) { // the toast is in the air
      const t = ZERO(SLOTS[1], 0, zt);
      ink('rgba(255,255,255,0.75)', 1.2); line(t.x + 1, t.y - 6, t.x + 2, t.y - 12); line(t.x + 6, t.y - 5, t.x + 8, t.y - 10); line(t.x - 4, t.y - 6, t.x - 4, t.y - 11);
      toast(t.x + 9, t.y - 20, 0.5, 0.95); toast(t.x - 1, t.y - 31, -0.35, 0.95);
    }
    mz = [bx, bY];
  }

  // a banana from (x, y), len long, bulging to its left
  function bananaFruit(x, y, len, rot) {
    c.save(); c.translate(x, y); c.rotate(rot);
    const b = len * 0.4;
    const shape = (k) => { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.5, -b * 1.75, len, 0); c.quadraticCurveTo(len * 0.5, -b * k, 0, 0); };
    fill('#d49a1a'); shape(0.45); c.fill();
    fill('#ffd23f'); shape(0.9); c.fill();
    ink('#fff3a0', 1); c.beginPath(); c.moveTo(len * 0.2, -b * 0.55); c.quadraticCurveTo(len * 0.5, -b * 1.0, len * 0.8, -b * 0.55); c.stroke();
    ink('rgba(110,70,10,0.6)', 0.9); shape(0.45); c.stroke();
    fill('#5a3a1e'); circle(0, 0, 1.2); circle(len, 0, 1);
    c.restore();
  }
  // a peel held by its stub at (x, y): the flaps droop
  function peelHang(x, y, s) {
    for (const rot of [0.8, -0.8, 0]) {
      c.save(); c.translate(x, y); c.rotate(rot);
      fill('#d49a1a'); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-3.4 * s, 5 * s, 0, 10.5 * s); c.quadraticCurveTo(3.4 * s, 5 * s, 0, 0); c.fill();
      fill('#ffd23f'); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-3.2 * s, 5 * s, 0, 10 * s); c.quadraticCurveTo(2.2 * s, 5 * s, 0, 0); c.fill();
      fill('#fff3b0'); c.beginPath(); c.moveTo(0, 1.5 * s); c.quadraticCurveTo(-1.4 * s, 5 * s, 0, 8.5 * s); c.quadraticCurveTo(1 * s, 5 * s, 0, 1.5 * s); c.fill();
      c.restore();
    }
    fill('#5a3a1e'); rbox(x - 1.3 * s, y - 3 * s, 2.6 * s, 4 * s, 1);
  }
  function crate(hx, z0, h, col) {
    isoBox(c, ZERO, 0, 0, hx, hx, z0, h, col, '#3a2412');
    // slats, corner posts and a rim
    ink('rgba(60,30,10,0.55)', 1.1);
    for (const f of h > 0.24 ? [0.36, 0.68] : [0.5]) polyline(zp([-hx, hx, z0 + h * f], [hx, hx, z0 + h * f], [hx, -hx, z0 + h * f]));
    for (const [x, y] of [[-hx, hx], [hx, hx], [hx, -hx]]) {
      const a = ZERO(x, y, z0), b = ZERO(x, y, z0 + h), w = 2.6;
      fill(shade(col, x < 0 ? 1.12 : x === y ? 1.0 : 0.72)); c.fillRect(a.x - (x < 0 ? 0 : x === y ? w / 2 : w), b.y, w, a.y - b.y);
    }
    ink('rgba(255,235,190,0.6)', 1); polyline(zp([-hx, hx, z0 + h], [hx, hx, z0 + h], [hx, -hx, z0 + h]));
  }
  // Banana Peeler: a crate of bananas with an arm that flings peels
  function banana(l) {
    const hx = 0.2 + l * 0.012, h1 = 0.26 + (l === 2 ? 0.07 : 0);
    let zt = h1;
    crate(hx, 0, h1, '#c08a4a');
    if (l === 3) { crate(hx - 0.035, h1, 0.2, '#d09a58'); zt = h1 + 0.2; }
    if (l >= 2) { // a blue sticker
      const p = ZERO(0, hx, h1 * 0.5); fill('#2f6fd0'); oval(p.x - 2, p.y - 1, 5.5, 3.6, 0.46); fill('#ffd23f'); oval(p.x - 2, p.y - 1, 2.6, 1.2, 0.2);
    }
    const ty = -zt * ZU;
    // the post and the arm behind the fruit
    const pvx = -9, pvy = ty - 13 - l * 4, hxp = 15 + l * 2, hyp = ty - 20 - l * 7;
    const METAL = l >= 2;
    tube(pvx, ty - 2, 2.4, 2, -(pvy - ty) - 2, METAL ? '#8792a8' : '#8a5a36', null);
    // the bunch
    const n = 3 + l;
    for (let k = 0; k < n; k++) {
      const f = n === 1 ? 0 : k / (n - 1);
      bananaFruit(-10 + f * 16, ty + 3 + Math.sin(f * 3.1) * -2, 15 + (k % 2) * 3, -1.9 + f * 1.5);
    }
    if (l === 3) { // one cool banana lounging on the rim
      bananaFruit(-4, ty + 6, 19, -0.1);
      fill(INK); rbox(1, ty + 0.2, 4, 2.6, 1); rbox(6, ty + 0.4, 4, 2.6, 1); c.fillRect(4, ty + 0.8, 3, 0.9);
    }
    // the arm
    const armC = METAL ? ['#4a5268', '#aeb9cc', '#e4ebf5'] : ['#5a3a1e', '#b07a44', '#d9a868'];
    const stroke3 = (path, w) => { for (const [k, col] of armC.entries()) { ink(col, [w, w - 2, 1][k]); c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); path(k === 2 ? -0.9 : 0); c.stroke(); } };
    const tailx = pvx - 9, taily = pvy + 6;
    if (l < 3) stroke3((d) => { c.moveTo(tailx, taily + d); c.lineTo(hxp, hyp + d); }, 4.6);
    else {
      const ex = pvx + 9, ey = pvy - 15; // an elbow
      stroke3((d) => { c.moveTo(tailx, taily + d); c.lineTo(pvx, pvy + d); c.lineTo(ex, ey + d); c.lineTo(hxp, hyp + d); }, 4.8);
      fill('#4a5268'); circle(ex, ey, 3); fill('#ffd23f'); circle(ex, ey, 1.4);
    }
    // the counterweight
    if (l === 1) { ball(tailx - 1, taily + 2.5, 4.2, '#8d8a86', '#5d5a58'); }
    else { fill('#3a3d52'); rbox(tailx - 5.5, taily - 1, 9, 8, 2); fill('#5a6078'); rbox(tailx - 5, taily - 0.6, 5, 3, 1.2); }
    // the pivot
    if (METAL) {
      fill('#4a5268'); for (let k = 0; k < 8; k++) { c.save(); c.translate(pvx, pvy); c.rotate(k * TAU / 8); c.fillRect(-1.3, -6.3, 2.6, 3); c.restore(); }
      circle(pvx, pvy, 4.6); fill('#aeb9cc'); circle(pvx - 0.4, pvy - 0.4, 3.4); fill('#ffd23f'); circle(pvx, pvy, 1.5);
    } else { fill('#5a3a1e'); circle(pvx, pvy, 3.2); fill('#d9a868'); circle(pvx - 0.3, pvy - 0.3, 1.6); }
    // the hand and the peel
    if (l === 1) { fill('#5a3a1e'); c.beginPath(); c.arc(hxp + 1, hyp - 1, 5.4, 0.15, Math.PI + 0.5); c.closePath(); c.fill(); fill('#b07a44'); c.beginPath(); c.arc(hxp + 0.6, hyp - 1.6, 4.2, 0.15, Math.PI + 0.5); c.closePath(); c.fill(); peelHang(hxp + 1.5, hyp - 3, 0.95); }
    else {
      peelHang(hxp + 1, hyp + 3, l === 3 ? 1.25 : 1.1);
      ink('#4a5268', 2.2); c.lineCap = 'round'; c.beginPath(); c.arc(hxp + 1, hyp + 0.5, 4, Math.PI * 0.85, Math.PI * 2.15); c.stroke();
      ink('#e4ebf5', 0.9); c.beginPath(); c.arc(hxp + 1, hyp + 0.5, 4, Math.PI * 1.1, Math.PI * 1.5); c.stroke();
    }
    mz = [hxp + 1, hyp];
  }
  const TOWERS = { pea, kite, ice, mortar, tesla, banana };

  // ---------- props: buildings ----------
  function grandma(x, y) {
    c.save(); c.translate(x, y);
    fill('#ff8fb0'); oval(-3, 0, 3, 1.6); oval(3.4, 0.4, 3, 1.6); // slippers
    fill('#8a5fb8'); pg([-7.5, -1, 7.5, -1, 5, -14, -5, -14]);
    fill('#b58ad9'); pg([-7, -1.5, 5, -1.5, 3.4, -14, -5, -14]);
    fill('#ffffff'); pg([-4.6, -1.5, 4.6, -1.5, 3.2, -11.5, -3.2, -11.5]); fill('#dfe6f5'); pg([2.2, -1.5, 4.6, -1.5, 3.2, -11.5, 2, -11.5]);
    ink('#ff8fb0', 1); line(-3.2, -11.5, 3.2, -11.5);
    // the arm on the hip, and the arm with the rolling pin
    ink('#8a5fb8', 3); c.lineCap = 'round'; polyline([-5, -12.5, -9, -8.5, -5.5, -6]);
    ink('#b58ad9', 3); polyline([5, -12.5, 9.5, -15.5]);
    c.save(); c.translate(11.5, -19.5); c.rotate(-0.75);
    fill('#8a5a36'); rbox(-11.5, -1.1, 23, 2.2, 1);
    fill('#b98347'); rbox(-7.5, -3.1, 15, 6.2, 2.6); fill('#e8c088'); rbox(-7, -2.9, 13.5, 2.6, 1.3);
    ink('rgba(27,31,51,0.55)', 0.9); rrect(-7.5, -3.1, 15, 6.2, 2.6); c.stroke();
    c.restore();
    fill('#f2b98a'); circle(10, -16.4, 2.2);
    // the head: a bun, glasses and a look
    fill('#b9bfd0'); circle(0.6, -26, 3.6); fill('#e4e8f2'); circle(0, -26.5, 3.2);
    fill('#b9bfd0'); circle(0.5, -19.2, 6.4); fill('#e4e8f2'); circle(-0.2, -19.8, 6);
    fill('#d99a6e'); circle(0.4, -18, 5.2); fill('#f2b98a'); circle(0, -18.4, 4.9);
    fill('rgba(255,110,150,0.55)'); oval(-3.4, -16.4, 1.5, 1); oval(3.4, -16.4, 1.5, 1);
    fill(INK); circle(-2, -18.6, 0.9); circle(2, -18.6, 0.9);
    ink(INK, 0.8); ring(-2, -18.6, 2); ring(2, -18.6, 2);
    ink(INK, 1); line(-4.2, -21.6, -1, -20.6); line(4.2, -21.6, 1, -20.6);
    ink(INK, 0.9); line(-1.4, -15.2, 1.4, -15.2);
    c.restore();
  }
  // the castle: a keep with a turret. The door is in the lit face.
  function castle(o) {
    const S1 = '#b9b2a4', S2 = '#d3cdc0', hx = 0.37, h = 0.66, dw = 0.2, dh = 0.34;
    const fl = (x, z) => ZERO(x, hx, z), fr = (y, z) => ZERO(hx, y, z);
    isoBox(c, ZERO, 0, 0, hx + 0.03, hx + 0.03, 0, 0.07, '#8f897d', '#a9a396');
    isoBox(c, ZERO, 0, 0, hx, hx, 0.06, h - 0.06, S1, S2);
    // stones
    ink('rgba(60,50,40,0.28)', 1);
    for (let k = 0; k < 9; k++) {
      const x = -0.3 + hash(k * 7) * 0.6, z = 0.14 + hash(k * 13 + 2) * 0.46;
      if (k < 5) { if (Math.abs(x) < dw + 0.06 && z < dh + dw + 0.08) continue; polyline(zp([x, hx, z], [x + 0.07, hx, z], [x + 0.07, hx, z - 0.04])); }
      else polyline(zp([hx, x, z], [hx, x + 0.07, z], [hx, x + 0.07, z - 0.04]));
    }
    // a window with a flower box in the shaded face
    const arch = (f, x0, w, z0, zs, n = 8) => { const pts = []; pts.push(...Object.values(f(x0 - w, z0)), ...Object.values(f(x0 - w, zs))); for (let k = 1; k < n; k++) { const a = Math.PI - k * Math.PI / n; pts.push(...Object.values(f(x0 + Math.cos(a) * w, zs + Math.sin(a) * w * 0.82))); } pts.push(...Object.values(f(x0 + w, zs)), ...Object.values(f(x0 + w, z0))); return pts; };
    fill('#3a3038'); pg(arch(fr, 0, 0.075, 0.3, 0.42));
    fill('#ffd98a'); pg(arch(fr, 0.012, 0.045, 0.31, 0.41));
    ink('#3a3038', 1); polyline(zp([hx, 0.012, 0.31], [hx, 0.012, 0.46]));
    let p = fr(0, 0.27); fill('#6f4629'); pg(zp([hx, -0.11, 0.3], [hx, 0.11, 0.3], [hx, 0.11, 0.24], [hx, -0.11, 0.24]));
    fill('#3f9b46'); circle(p.x - 2.5, p.y - 1.6, 2.2); circle(p.x + 1.5, p.y - 3.6, 2.2); circle(p.x + 4, p.y - 5, 1.8);
    fill('#ff7ad9'); circle(p.x - 2.6, p.y - 2.6, 1.2); circle(p.x + 2, p.y - 4.6, 1.2); fill('#ffe680'); circle(p.x + 0, p.y - 3, 1);
    // merlons at the back, the turret, merlons at the front
    const MER = [];
    for (const t of [-0.3, 0, 0.3]) MER.push([t, -0.3], [-0.3, t], [t, 0.3], [0.3, t]);
    MER.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    const merlon = ([x, y]) => isoBox(c, ZERO, x, y, 0.07, 0.07, h, 0.1, S1, S2);
    for (const m of MER) if (m[0] + m[1] < 0) merlon(m);
    fill('rgba(0,0,0,0.12)'); pg(zp([-0.23, -0.23, h], [0.23, -0.23, h], [0.23, 0.23, h], [-0.23, 0.23, h]));
    const tx = -0.05, ty = -0.05, th = 0.3;
    isoCyl(c, ZERO, tx, ty, 0.17, h, th, '#c4bdb0', '#d8d2c6');
    p = ZERO(tx, ty, h + th * 0.5); fill('#3a3038'); rbox(p.x - 0.5, p.y - 1, 3, 7, 1.5);
    isoCone(c, ZERO, tx, ty, 0.235, h + th - 0.02, 0.42, '#d0533f');
    p = ZERO(tx, ty, h + th - 0.02);
    ink('rgba(255,200,170,0.5)', 1); line(p.x - 5, p.y - 2, p.x - 1.5, p.y - 15);
    ink('rgba(90,20,20,0.45)', 1); c.beginPath(); c.ellipse(p.x, p.y, 0.235 * Math.SQRT2 * HW, 0.235 * Math.SQRT2 * HH, 0, 0.1, Math.PI - 0.1); c.stroke();
    const f = ZERO(tx, ty, h + th + 0.4);
    ink(INK, 1.4); line(f.x, f.y + 1, f.x, f.y - 11);
    fill('#ff7ad9'); pg([f.x, f.y - 11, f.x + 11, f.y - 8, f.x, f.y - 5]); fill('#ffb3ea'); pg([f.x, f.y - 11, f.x + 11, f.y - 8, f.x, f.y - 8.4]);
    for (const m of MER) if (m[0] + m[1] >= 0) merlon(m);
    // the welcome mat, the door
    fill('#a8343a'); pg(zp([-0.15, hx + 0.04, 0], [0.15, hx + 0.04, 0], [0.15, hx + 0.13, 0], [-0.15, hx + 0.13, 0]));
    fill('#e86a5a'); pg(zp([-0.11, hx + 0.06, 0], [0.11, hx + 0.06, 0], [0.11, hx + 0.11, 0], [-0.11, hx + 0.11, 0]));
    fill('#8f897d'); pg(arch(fl, 0, dw + 0.04, 0.0, dh + 0.01, 10));
    if (!o.door) {
      fill('#8a5a36'); pg(arch(fl, 0, dw, 0.0, dh, 10));
      fill('rgba(255,220,170,0.22)'); pg(arch(fl, -0.1, dw * 0.5, 0.0, dh - 0.02, 6));
      ink('rgba(50,25,8,0.55)', 1); for (const x of [-0.1, 0, 0.1]) polyline(zp([x, hx, 0.01], [x, hx, dh + dw * 0.75]));
      ink('#3a3d52', 2); polyline(zp([-dw, hx, 0.13], [dw, hx, 0.13])); polyline(zp([-dw, hx, 0.36], [dw, hx, 0.36]));
      p = fl(0.12, 0.24); fill('#8a5a12'); circle(p.x, p.y + 0.5, 2); fill('#ffd23f'); circle(p.x, p.y, 1.6);
    } else {
      fill('#2a1a1e'); pg(arch(fl, 0, dw, 0.0, dh, 10));
      p = fl(0, 0.05); glow(p.x, p.y - 6, 17, '255,200,110', 0.55);
      // the door leaf, swung out
      fill('#6f4629'); pg(zp([-dw, hx, 0], [-dw, hx + 0.2, 0], [-dw, hx + 0.2, dh + 0.06], [-dw, hx, dh + 0.1]));
      fill('#9a6a3c'); pg(zp([-dw, hx + 0.2, 0], [-dw + 0.03, hx + 0.2, 0], [-dw + 0.03, hx + 0.2, dh + 0.06], [-dw, hx + 0.2, dh + 0.06]));
      p = ZERO(0.02, hx + 0.07, 0); grandma(p.x, p.y);
    }
    // the doorbell
    p = fl(0.3, 0.25); fill('#3a3038'); circle(p.x, p.y, 2.4); fill('#ffd23f'); circle(p.x, p.y, 1.5); fill('#ff2a4d'); circle(p.x, p.y, 0.7);
    ink('rgba(255,255,255,0.4)', 1); polyline(zp([-hx, hx, h], [hx, hx, h], [hx, -hx, h]));
  }

  // the mine hut: a shed at the back of the tile, and a hatch with a ladder in front
  function hut() {
    const bx = -0.13, by = -0.13, hx = 0.26, hy = 0.23, h = 0.4, W = '#a8743f';
    const A = (x, y, z) => { const p = ZERO(bx + x, by + y, z); return [p.x, p.y]; };
    isoBox(c, ZERO, bx, by, hx, hy, 0, h, W, '#8a5a36');
    ink('rgba(60,30,10,0.4)', 1);
    for (let k = 1; k < 6; k++) { const x = -hx + k * hx / 3; c.beginPath(); c.moveTo(...A(x, hy, 0)); c.lineTo(...A(x, hy, h)); c.stroke(); }
    for (let k = 1; k < 5; k++) { const y = -hy + k * hy / 2.5; c.beginPath(); c.moveTo(...A(hx, y, 0)); c.lineTo(...A(hx, y, h + 0.2)); c.stroke(); }
    // the doorway with a lamp
    fill('#6f4629'); pg([...A(-0.2, hy, 0), ...A(0.06, hy, 0), ...A(0.06, hy, 0.34), ...A(-0.2, hy, 0.34)]);
    fill('#2a1a12'); pg([...A(-0.17, hy, 0), ...A(0.03, hy, 0), ...A(0.03, hy, 0.3), ...A(-0.17, hy, 0.3)]);
    const [lx, ly] = A(0.16, hy, 0.3);
    glow(lx, ly + 3, 11, '255,220,120', 0.55);
    ink(INK, 1); line(lx, ly - 2, lx, ly + 1); fill('#3a3d52'); rbox(lx - 2.4, ly, 4.8, 6.4, 1); fill('#ffe680'); rbox(lx - 1.4, ly + 1.2, 2.8, 4, 0.8);
    // the gable and the tin roof
    const zr = h + 0.26, e = 0.06;
    fill(shade(W, L_RIGHT)); pg([...A(hx, -hy, h), ...A(hx, 0, zr - 0.03), ...A(hx, hy, h)]);
    fill('#2f6f7d'); pg([...A(hx + e, 0, zr), ...A(hx + e, hy + e, h - 0.03), ...A(hx + e, hy + e, h - 0.07), ...A(hx + e, 0, zr - 0.05), ...A(hx + e, -hy - e, h - 0.07), ...A(hx + e, -hy - e, h - 0.03)]);
    fill('#4f9aa5'); pg([...A(-hx - e, 0, zr), ...A(hx + e, 0, zr), ...A(hx + e, hy + e, h - 0.03), ...A(-hx - e, hy + e, h - 0.03)]);
    fill('#74bcc6'); pg([...A(-hx - e, 0, zr), ...A(hx + e, 0, zr), ...A(hx + e, hy * 0.25, zr - 0.05), ...A(-hx - e, hy * 0.25, zr - 0.05)]);
    ink('rgba(20,60,70,0.4)', 1);
    for (let k = 1; k < 7; k++) { const x = -hx - e + k * (2 * hx + 2 * e) / 7; c.beginPath(); c.moveTo(...A(x, 0, zr)); c.lineTo(...A(x, hy + e, h - 0.03)); c.stroke(); }
    fill('#2f6f7d'); pg([...A(-hx - e, hy + e, h - 0.03), ...A(hx + e, hy + e, h - 0.03), ...A(hx + e, hy + e, h - 0.07), ...A(-hx - e, hy + e, h - 0.07)]);
    // a stove pipe
    const [sx, sy] = A(-0.12, 0.08, zr - 0.1);
    tube(sx, sy, 2.6, 2.6, 11, '#5a6078', '#20222e'); tube(sx, sy - 9, 3.6, 3.6, 2, '#5a6078', null);
    // the hatch: its lid leans back, then a frame, a hole and a ladder
    const cx = 0.29, cy = 0.31, s = 0.15;
    fill('#6f4629'); pg(zp([cx - s, cy - s, 0.05], [cx + s, cy - s, 0.05], [cx + s, cy - s - 0.09, 0.32], [cx - s, cy - s - 0.09, 0.32]));
    fill('#c08a4a'); pg(zp([cx - s + 0.015, cy - s, 0.06], [cx + s - 0.015, cy - s, 0.06], [cx + s - 0.015, cy - s - 0.08, 0.3], [cx - s + 0.015, cy - s - 0.08, 0.3]));
    ink('rgba(60,30,10,0.5)', 1); for (const x of [-0.05, 0.05]) polyline(zp([cx + x, cy - s, 0.06], [cx + x, cy - s - 0.08, 0.3]));
    ink('#3a3d52', 1.6); polyline(zp([cx - s + 0.02, cy - s - 0.03, 0.14], [cx + s - 0.02, cy - s - 0.03, 0.14]));
    let p = ZERO(cx, cy - s - 0.06, 0.24); ink('#20222e', 1.3); ring(p.x, p.y, 2);
    isoBox(c, ZERO, cx, cy, s, s, 0, 0.05, '#7a5230', '#9a6a3c');
    fill('#1a100a'); pg(zp([cx - s + 0.03, cy - s + 0.03, 0.05], [cx + s - 0.03, cy - s + 0.03, 0.05], [cx + s - 0.03, cy + s - 0.03, 0.05], [cx - s + 0.03, cy + s - 0.03, 0.05]));
    const la = ZERO(cx - 0.07, cy - 0.06, 0.05), lb = ZERO(cx + 0.07, cy - 0.06, 0.05);
    for (const [col, w] of [['#6f4629', 2.8], ['#e0b070', 1.5]]) {
      ink(col, w); c.lineCap = 'round'; line(la.x, la.y + 2, la.x, la.y - 10); line(lb.x, lb.y + 2, lb.x, lb.y - 10);
      line(la.x, la.y - 2.5, lb.x, lb.y - 2.5); line(la.x, la.y - 7, lb.x, lb.y - 7);
    }
  }

  // ---------- props: plants ----------
  function tree(o) {
    const s = o.seed;
    if (s === 1) { // a pine
      tube(0, 0, 3, 2.6, 12, '#7a4f2a', null);
      for (const [w, y0, y1] of [[18, -8, -30], [15, -22, -44], [11, -36, -60]]) {
        fill('#1f5e3a'); c.beginPath(); c.moveTo(0, y1); c.lineTo(-w, y0); c.quadraticCurveTo(0, y0 + 7, w, y0); c.closePath(); c.fill();
        fill('#2f8552'); c.beginPath(); c.moveTo(0, y1); c.lineTo(-w, y0); c.quadraticCurveTo(-w * 0.4, y0 + 4, w * 0.25, y0 + 2.5); c.closePath(); c.fill();
        fill('#4fae6a'); pg([0, y1, -w * 0.72, y0 - 2.5, -w * 0.3, y0 - 3.5]);
      }
      return;
    }
    if (s === 3) { // a birch
      tube(0, 0, 2.8, 2, 30, '#eef0f2', null);
      ink('#3a3d52', 1.2); line(-2, -7, 0.5, -7.5); line(0, -14, 2, -13.6); line(-1.6, -21, 0.4, -21.4);
      for (const [x, y, r] of [[-9, -34, 9], [9, -36, 9], [0, -30, 10], [-3, -45, 10], [6, -50, 7], [0, -56, 6]]) ball(x, y, r, '#a5d44e', '#5f9a2f');
      fill('#d3f08a'); oval(-6, -50, 4, 2, -0.5); oval(-11, -37, 3, 1.5, -0.5);
      return;
    }
    tube(0, 0, 3.4, 2.6, 22, '#7a4f2a', null);
    ink('#5a3a1e', 2); line(0, -17, -6, -24); line(0, -19, 5, -25);
    if (s === 2) { // an apple tree
      ball(0, -37, 18.5, '#55b04c', '#2f7a36'); ball(-11, -30, 10, '#55b04c', '#2f7a36'); ball(11, -30, 10, '#55b04c', '#2f7a36');
      fill('#7fd06a'); oval(-6, -46, 6, 3, -0.5);
      for (const [x, y] of [[-12, -31], [-2, -41], [8, -47], [11, -32], [1, -27], [-8, -45]]) { fill('#a8102e'); circle(x + 0.4, y + 0.5, 2.8); fill('#ff2a4d'); circle(x, y, 2.5); fill('#ffffff'); circle(x - 0.8, y - 0.9, 0.8); }
      return;
    }
    // an oak
    const G = ['#3f8f3a', '#4fa648', '#66c25a'], D = ['#27632c', '#2f7a36', '#3f8f3a'];
    ball(-10, -29, 11, G[0], D[0]); ball(10, -29, 11, G[0], D[0]); ball(0, -31, 14, G[0], D[0]);
    ball(-6, -41, 11, G[1], D[1]); ball(7, -42, 10.5, G[1], D[1]);
    ball(0, -52, 9.5, G[2], D[2]);
  }
  function bush() {
    ball(-8, -6.5, 8, '#3f8f3a', '#27632c'); ball(8, -6, 7.5, '#3f8f3a', '#27632c'); ball(0, -10, 9.5, '#4fa648', '#2f7a36');
    for (const [x, y] of [[-8, -7], [3, -12], [8, -5], [-1, -5]]) { fill('#b8226e'); circle(x + 0.3, y + 0.4, 1.8); fill('#ff7ad9'); circle(x, y, 1.5); }
  }

  // ---------- props: things ----------
  // a big boot seen from the side, sole down, toe to the right
  function boot() {
    const upper = () => { c.beginPath(); c.moveTo(-15, -7); c.lineTo(-16.5, -49); c.lineTo(6, -49); c.lineTo(7, -28); c.bezierCurveTo(12, -25, 20, -26, 25, -21); c.bezierCurveTo(31, -16, 31, -10, 29, -7); c.closePath(); };
    // the pull loop
    ink('#7d451f', 2.4); ring(-16, -51, 3.4);
    // sole and heel
    fill('#2a1d18'); rbox(-17.5, -8, 48.5, 8, 3); rbox(-17.5, -10, 14, 10, 2.5);
    fill('#4a362c'); rbox(-17.5, -8, 48.5, 3, 1.5);
    fill('#1a1210'); for (let k = 0; k < 6; k++) c.fillRect(-1 + k * 5.2, -2.4, 2.6, 2.4);
    // the leather
    fill('#a8642f'); upper(); c.fill();
    c.save(); upper(); c.clip();
    fill('#7d451f'); c.fillRect(-1, -52, 12, 30); pg([-20, -14, 32, -14, 32, -5, -20, -5]);
    fill('#c98447'); c.fillRect(-14, -50, 5, 40);
    fill('#7d451f'); circle(24.5, -8, 11.5); fill('#93552a'); circle(23.5, -9.5, 9.6);
    fill('rgba(255,255,255,0.35)'); oval(20, -15.5, 4.4, 2, -0.5);
    c.restore();
    ink('rgba(27,31,51,0.6)', 1.2); upper(); c.stroke();
    ink('#f0d9a8', 1); c.setLineDash([2, 2]); line(-14, -11, 28, -11); c.setLineDash([]);
    // laces
    ink('#f4ecd0', 1.5); c.lineCap = 'round';
    for (let k = 0; k < 4; k++) { const y = -45 + k * 5.2; line(0.5, y, 6.5, y + 2.6); line(0.5, y + 2.6, 6.5, y); }
    c.beginPath(); c.moveTo(6.5, -45); c.quadraticCurveTo(13, -47, 11, -41); c.stroke(); c.beginPath(); c.moveTo(6.5, -44); c.quadraticCurveTo(12, -38, 9, -36); c.stroke();
    // a woolly sock
    fill('#c81e3c'); rbox(-18.5, -56, 26.5, 9, 3.5); fill('#ff4d5e'); rbox(-18.5, -56, 25.5, 7.6, 3.2);
    fill('#ffffff'); c.fillRect(-17.6, -53.4, 23.8, 2.2);
    ink('rgba(27,31,51,0.55)', 1); rrect(-18.5, -56, 26.5, 9, 3.5); c.stroke();
  }
  function stick(x, y, h, r) { tube(x, y, r, r, h, '#e8324a', '#ff8a96'); fill('#c9b891'); oval(x, y - h, r * 0.45, r * 0.22); }
  function dynamite(o) {
    stick(-6.5, -1.5, 19, 4.2); stick(6.5, -1.5, 19, 4.2); stick(0, 0.5, 19, 4.4);
    // the strap
    fill('#b9a271'); c.beginPath(); c.moveTo(-11, -13); c.quadraticCurveTo(0, -6, 11, -13); c.lineTo(11, -8.5); c.quadraticCurveTo(0, -1.5, -11, -8.5); c.closePath(); c.fill();
    fill('#efe0b6'); c.beginPath(); c.moveTo(-11, -13); c.quadraticCurveTo(0, -6, 11, -13); c.lineTo(11, -11.4); c.quadraticCurveTo(0, -4.4, -11, -11.4); c.closePath(); c.fill();
    ink('#3a2a22', 1.7); c.lineCap = 'round'; c.beginPath(); c.moveTo(0, -18.5); c.bezierCurveTo(0, -27, 9, -22, 9, -29); c.stroke();
    if (o.lit) {
      glow(9, -30, 13, '255,210,63', 0.75);
      fill('#ff8a2a'); star4(9, -30, 6.5); fill('#fff6c0'); star4(9, -30, 3.6);
      fill('#ffd23f'); circle(15, -34, 1.1); circle(3.5, -35, 1); circle(13.5, -25, 0.9);
    }
  }
  // the Mother Lode
  function chest(o) {
    const hx = 0.29, hy = 0.2, h = 0.25, W = '#9a5f2c', GOLD = '#ffd23f';
    glow(0, -12, 34, '255,210,63', o.open ? 0.5 : 0.3);
    const band = (x0, x1, z0, z1) => {
      fill(shade(GOLD, 0.92)); pg(zp([x0, hy, z1], [x1, hy, z1], [x1, hy, z0], [x0, hy, z0]));
    };
    if (o.open) { // the lid leans back
      fill('#5e1f2e'); pg(zp([-hx, -hy, h], [hx, -hy, h], [hx, -hy - 0.1, h + 0.36], [-hx, -hy - 0.1, h + 0.36]));
      ink(GOLD, 2); c.lineJoin = 'round'; poly(c, zp([-hx, -hy, h], [hx, -hy, h], [hx, -hy - 0.1, h + 0.36], [-hx, -hy - 0.1, h + 0.36])); c.stroke();
      fill(shade(W, 0.55)); pg(zp([hx, -hy, h], [hx, -hy - 0.1, h + 0.36], [hx, -hy - 0.2, h + 0.33], [hx, -hy - 0.07, h]));
    }
    isoBox(c, ZERO, 0, 0, hx, hy, 0, h, W, o.open ? '#3a2412' : W);
    ink('rgba(50,25,8,0.4)', 1); polyline(zp([-hx, hy, h * 0.5], [hx, hy, h * 0.5], [hx, -hy, h * 0.5]));
    band(-hx, -hx + 0.07, 0, h); band(hx - 0.07, hx, 0, h);
    fill(shade(GOLD, 0.66)); pg(zp([hx, hy, h], [hx, hy - 0.07, h], [hx, hy - 0.07, 0], [hx, hy, 0])); pg(zp([hx, -hy, h], [hx, -hy + 0.07, h], [hx, -hy + 0.07, 0], [hx, -hy, 0]));
    if (!o.open) {
      isoBox(c, ZERO, 0, 0, hx, hy, h, 0.1, '#b06f36', '#c98447');
      isoBox(c, ZERO, 0, 0, hx - 0.05, hy - 0.05, h + 0.1, 0.045, '#b06f36', '#d99a58');
      band(-hx, -hx + 0.07, h, h + 0.1); band(hx - 0.07, hx, h, h + 0.1);
      fill(shade(GOLD, 0.66)); pg(zp([hx, hy, h + 0.1], [hx, hy - 0.07, h + 0.1], [hx, hy - 0.07, h], [hx, hy, h])); pg(zp([hx, -hy, h + 0.1], [hx, -hy + 0.07, h + 0.1], [hx, -hy + 0.07, h], [hx, -hy, h]));
      ink('rgba(27,31,51,0.5)', 1); polyline(zp([-hx, hy, h], [hx, hy, h], [hx, -hy, h]));
      ink('rgba(255,235,190,0.6)', 1); polyline(zp([-hx, hy, h + 0.1], [hx, hy, h + 0.1], [hx, -hy, h + 0.1]));
      const p = ZERO(0, hy, h - 0.02); fill('#8a5a12'); rbox(p.x - 3.4, p.y - 3.2, 6.8, 8, 1.6); fill(GOLD); rbox(p.x - 3, p.y - 3.6, 6, 7.4, 1.5); fill(INK); circle(p.x, p.y - 0.6, 1.1); c.fillRect(p.x - 0.5, p.y - 0.6, 1, 2.6);
      fill('#fff6c0'); star4(-17, -27, 3.2); star4(19, -22, 2.4);
    } else {
      const t = ZERO(0, 0, h);
      glow(t.x, t.y - 4, 22, '255,246,192', 0.8);
      fill('#d99a1e'); oval(t.x, t.y, 18, 8);
      fill(GOLD); oval(t.x - 0.5, t.y - 1.6, 16.5, 7); circle(t.x - 7, t.y - 4, 5); circle(t.x + 2, t.y - 6, 6); circle(t.x + 9, t.y - 3.4, 4.4);
      fill('#fff3a0'); oval(t.x - 8, t.y - 6, 3, 1.4); oval(t.x + 1, t.y - 9, 3.6, 1.6); oval(t.x + 9, t.y - 5, 2.4, 1.1);
      fill('#ff2a4d'); pg([t.x - 12, t.y - 1, t.x - 9, t.y - 4, t.x - 6, t.y - 1, t.x - 9, t.y + 2]);
      fill('#5ef0ff'); pg([t.x + 11, t.y + 1, t.x + 14, t.y - 2.4, t.x + 17, t.y + 1, t.x + 14, t.y + 3.4]);
      fill('#ff7ad9'); circle(t.x + 3, t.y + 1, 2);
      fill('#ffffff'); star4(t.x - 4, t.y - 14, 4.2); star4(t.x + 13, t.y - 11, 3); star4(t.x - 16, t.y - 9, 2.4);
    }
  }
  function shard(x, y, w, h, rot, A, B, D) {
    c.save(); c.translate(x, y); c.rotate(rot);
    fill(B); pg([-w, 0, w, 0, w, -h * 0.68, 0, -h, -w, -h * 0.68]);
    fill(A); pg([-w, 0, -w * 0.15, 0, -w * 0.15, -h * 0.74, 0, -h, -w, -h * 0.68]);
    fill(D); pg([w * 0.45, 0, w, 0, w, -h * 0.68, 0, -h, w * 0.45, -h * 0.72]);
    ink('rgba(27,31,51,0.45)', 1); c.lineJoin = 'round'; poly(c, [-w, 0, w, 0, w, -h * 0.68, 0, -h, -w, -h * 0.68]); c.stroke();
    c.restore();
  }
  // the resonance crystal
  function crystal() {
    glow(0, -15, 30, '255,122,217', 0.5);
    fill('#5d5a66'); oval(0, -1, 14, 5.5); fill('#7d7a88'); oval(-1, -2, 12, 4.4);
    shard(-7, -2, 4, 17, -0.5, '#ffd0f2', '#ff7ad9', '#b83aa0');
    shard(8, -2, 4.4, 19, 0.45, '#ffd0f2', '#ff7ad9', '#b83aa0');
    shard(0, -1, 6.4, 32, 0.04, '#ffe3f8', '#ff8fe0', '#c44aae');
    fill('#ffffff'); star4(-4, -24, 4.4); star4(11, -19, 2.6);
  }
  // a banana peel on the ground
  function peel() {
    c.save(); c.scale(1, 0.56);
    for (let k = 0; k < 4; k++) {
      c.save(); c.rotate(0.5 + k * TAU / 4 + (k % 2) * 0.25);
      fill('#b9861a'); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(7, -6, 15.5, 1); c.quadraticCurveTo(7, 6.5, 0, 0); c.fill();
      fill('#ffd23f'); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(7, -6, 15, 0); c.quadraticCurveTo(7, 4.6, 0, 0); c.fill();
      fill('#fff3b0'); c.beginPath(); c.moveTo(2, 0); c.quadraticCurveTo(7, -3, 12.5, 0); c.quadraticCurveTo(7, 2, 2, 0); c.fill();
      c.restore();
    }
    c.restore();
    fill('#d49a1a'); oval(0, -1.5, 3.4, 3); fill('#ffd23f'); oval(-0.4, -2.2, 2.8, 2.6);
    fill('#5a3a1e'); rbox(-1.4, -7.5, 2.8, 4.4, 1);
  }
  // a brass anchor
  function anchor() {
    const path = () => {
      c.beginPath(); c.arc(0, -21.5, 2.6, 0, TAU);
      c.moveTo(0, -18.8); c.lineTo(0, -2.5); c.moveTo(-6, -15); c.lineTo(6, -15);
      c.moveTo(-9, -10.5); c.quadraticCurveTo(-8, -2, 0, -1.5); c.quadraticCurveTo(8, -2, 9, -10.5);
    };
    c.lineCap = 'round'; c.lineJoin = 'round';
    ink(INK, 5.4); path(); c.stroke();
    fill(INK); pg([-12.5, -8, -8.5, -14.5, -5, -8.5]); pg([12.5, -8, 8.5, -14.5, 5, -8.5]);
    ink('#c98a1e', 3.4); path(); c.stroke();
    fill('#c98a1e'); pg([-11.2, -8.6, -8.6, -13, -6.2, -9]); pg([11.2, -8.6, 8.6, -13, 6.2, -9]);
    ink('#ffd76a', 1.3); c.beginPath(); c.moveTo(-0.7, -18.5); c.lineTo(-0.7, -4); c.moveTo(-6, -15.6); c.lineTo(3, -15.6); c.moveTo(-9.4, -10); c.quadraticCurveTo(-8.4, -4, -3, -2.6); c.stroke();
  }
  function egg() {
    fill('rgba(0,0,0,0.18)'); oval(1, 0, 8, 3);
    fill('#cdb894'); oval(0, -10, 8.6, 10.6);
    fill('#fff6e2'); c.beginPath(); c.ellipse(-0.7, -10.8, 7.6, 9.7, 0, 0, TAU); c.fill();
    fill('#c9a878'); circle(2.6, -6, 1); circle(-3.5, -8, 0.8); circle(3.4, -13.5, 0.8); circle(-1, -4, 0.7);
    fill('rgba(255,255,255,0.8)'); oval(-3.2, -15.4, 2.4, 1.4, -0.6);
    ink('rgba(27,31,51,0.4)', 1); ovalS(0, -10, 8.6, 10.6);
  }
  // a pot of gold
  function pot() {
    fill('#14161f'); oval(-7, -1.2, 2.6, 1.8); oval(7, -1.2, 2.6, 1.8);
    fill('#14161f'); oval(0, -10, 14.5, 10.5);
    fill('#2f3348'); oval(-1.2, -11, 13, 9.2);
    fill('rgba(255,255,255,0.22)'); oval(-6.5, -13, 3.4, 5, 0.4);
    fill('#14161f'); oval(0, -18.4, 13.6, 5); fill('#3d4260'); oval(0, -19, 12.6, 4.2);
    fill('#d99a1e'); oval(0, -19, 10.5, 3.3);
    fill('#ffd23f'); oval(0, -20.4, 10, 3.6); circle(-4, -22.4, 4.2); circle(3.4, -23.4, 4.6); circle(7, -21, 2.6);
    fill('#fff3a0'); oval(-5, -24.2, 2.4, 1.1); oval(2.6, -25.6, 2.8, 1.2);
    ink('#d99a1e', 0.9); c.beginPath(); c.ellipse(4.5, -19.5, 3, 1.4, 0, 0, TAU); c.stroke();
    fill('#ffffff'); star4(-9, -27.5, 3.2); star4(9.5, -28, 2.2);
  }
  function geyser(o) {
    const f = o.f, H = [26, 46, 66][f], W = [5, 6.5, 7.5][f];
    fill('#2f78bd'); oval(0, 0, 15, 6.5); fill('#7cc4f2'); oval(-0.5, -0.6, 12.5, 5); fill('#e6f6ff'); oval(0, -1, 8, 3);
    // the column
    const g = c.createLinearGradient(-W, 0, W, 0); g.addColorStop(0, '#bfe6ff'); g.addColorStop(0.35, '#ffffff'); g.addColorStop(1, '#5aa9e6');
    c.fillStyle = g; c.beginPath(); c.moveTo(-W - 1.5, 0);
    c.bezierCurveTo(-W + 2, -H * 0.3, -W - 2, -H * 0.7, -W - 1, -H);
    c.lineTo(W + 1, -H); c.bezierCurveTo(W + 2, -H * 0.7, W - 2, -H * 0.3, W + 1.5, 0); c.closePath(); c.fill();
    ink('rgba(61,143,214,0.7)', 1); line(-1.5, -4, -2, -H + 4); line(2.6, -8, 2, -H + 8);
    // the crown of spray
    const R = [6, 8, 9.5][f];
    for (const [dx, dy, k] of [[-1, 0.2, 0.9], [1, 0.3, 0.85], [0, -0.5, 1.05], [-0.55, -0.35, 0.8], [0.6, -0.3, 0.8]]) {
      fill('#5aa9e6'); circle(dx * R * 1.2 + 0.7, -H + dy * R + 0.9, R * k);
      fill('#eaf7ff'); circle(dx * R * 1.2, -H + dy * R, R * k - 0.9);
    }
    fill('#ffffff'); oval(-R * 0.6, -H - R * 0.6, R * 0.5, R * 0.25, -0.4);
    // drops
    for (let k = 0; k < 5 + f * 2; k++) {
      const a = hash(k * 17 + f * 31), b = hash(k * 29 + f * 7);
      const x = (a - 0.5) * (30 + f * 8), y = -H * (0.25 + b * 0.75) + Math.abs(x) * 0.5;
      if (Math.abs(x) < W + 4) continue;
      fill('#5aa9e6'); drop(x + 0.4, y + 0.4, 1.1); fill('#d6efff'); drop(x, y, 0.9);
    }
  }
  // flat decal: a dark hole in a path tile
  function pit() {
    fill('#b08a55'); oval(0, 0, 29, 14.5);
    fill('#8a6238'); oval(0, 0.6, 26.5, 13);
    fill('#5b3d28'); oval(0, 0.6, 25, 12);
    const g = c.createRadialGradient(0, 5, 2, 0, 3, 24); g.addColorStop(0, '#0b0806'); g.addColorStop(1, '#2a1a10');
    c.fillStyle = g; oval(0, 3.2, 22.5, 9.4);
    ink('rgba(255,225,170,0.45)', 1.2); c.beginPath(); c.ellipse(0, 0.2, 27.6, 13.6, 0, Math.PI * 1.05, Math.PI * 1.75); c.stroke();
    fill('#8a6238'); oval(-27, 9, 2.6, 1.3); oval(24, 11, 2, 1); oval(30, -4, 1.8, 0.9);
  }
  // flat decal: hairline cracks
  function crack() {
    const L = [[0, 0, -9, -3, -15, -1, -24, -5], [0, 0, 7, -4, 12, -3, 19, -8], [0, 0, 4, 5, 12, 6, 16, 10], [0, 0, -5, 4, -6, 9, -13, 11], [-15, -1, -18, 4], [12, -3, 20, 0, 26, -1], [12, 6, 21, 5]];
    for (const [dy, col, w] of [[1, 'rgba(255,255,255,0.28)', 1], [0, 'rgba(35,20,8,0.7)', 1.3]]) {
      ink(col, w); c.lineCap = 'round'; c.lineJoin = 'round';
      for (const p of L) polyline(p.map((v, k) => (k % 2 ? v + dy : v)));
    }
    fill('rgba(35,20,8,0.7)'); pg([-3, 0, 0, -2, 3, 0, 0, 2]);
  }
  // a mole travelling under the grass
  function ridge() {
    const dome = (dy) => { c.beginPath(); c.moveTo(-17, 1); c.bezierCurveTo(-15, -13 + dy, 15, -13 + dy, 17, 1); c.ellipse(0, 1, 17, 6, 0, 0, Math.PI); c.closePath(); };
    fill('#5a3a1e'); dome(0); c.fill();
    c.save(); dome(0); c.clip();
    fill('#8a5a36'); oval(-2, -1, 16, 9);
    fill('#a9754a'); oval(-6, -4.5, 8, 4);
    c.restore();
    ink('rgba(27,31,51,0.4)', 1); dome(0); c.stroke();
    ink('#3a2412', 1.1); c.lineCap = 'round'; polyline([-3, -8.4, 0, -5.5, -1, -3]); polyline([0, -5.5, 4, -4.5]);
    fill('#5a3a1e'); oval(-19, 4, 2.4, 1.3); oval(16, 6.4, 2.8, 1.4); oval(21, 1, 1.8, 1);
    ink('#3f8f3a', 1.3); line(-12, -5, -14.5, -10); line(-10.5, -6, -10.5, -11); line(10, -6.5, 12.5, -11); line(12.5, -4.5, 16, -8);
  }
  // the doorbell alarm
  function bell() {
    ink('#ffd23f', 1.5); c.lineCap = 'round';
    c.beginPath(); c.arc(0, -10, 13.5, Math.PI * 0.86, Math.PI * 1.1); c.stroke(); c.beginPath(); c.arc(0, -10, 13.5, -Math.PI * 0.1, Math.PI * 0.14); c.stroke();
    const body = () => { c.beginPath(); c.moveTo(-8.6, -4.6); c.bezierCurveTo(-7.5, -11, -7.6, -19, 0, -19); c.bezierCurveTo(7.6, -19, 7.5, -11, 8.6, -4.6); c.closePath(); };
    fill('#ff2a4d'); rbox(-2.6, -22.5, 5.2, 5, 2);
    fill('#8a5a12'); circle(0, -2.2, 2.6);
    fill('#ffd23f'); body(); c.fill();
    c.save(); body(); c.clip(); fill('#d9961e'); c.fillRect(2.5, -20, 8, 17); fill('#fff3b0'); oval(-3.6, -12, 1.5, 4.6, 0.12); c.restore();
    ink('rgba(27,31,51,0.6)', 1); body(); c.stroke();
    fill('#b97a1a'); rbox(-10, -5.8, 20, 3.4, 1.7); fill('#ffe680'); rbox(-10, -6.2, 19, 2.4, 1.2);
  }

  // ---------- Gnorman ----------
  function gnome(o) {
    const m = o.mood;
    // the coat
    const coat = () => { c.beginPath(); c.moveTo(-25, 0); c.bezierCurveTo(-25, -15, -17, -21, -8, -22); c.lineTo(8, -22); c.bezierCurveTo(17, -21, 25, -15, 25, 0); c.closePath(); };
    fill('#2f5fa8'); coat(); c.fill();
    c.save(); coat(); c.clip(); fill('#4a7fd0'); oval(-14, -9, 9, 11); fill('#1f4380'); c.fillRect(12, -24, 16, 26); c.restore();
    ink('rgba(27,31,51,0.55)', 1.2); coat(); c.stroke();
    // ears and head
    ball(-16, -37, 4.4, '#f2b98a', '#c98a5e'); ball(16, -37, 4.4, '#e8a878', '#c98a5e');
    fill('#c98a5e'); oval(0, -36, 16, 14); fill('#f2b98a'); oval(-0.8, -36.8, 15, 13);
    // the beard
    const beard = (d) => { c.beginPath(); c.moveTo(-16.5 + d, -34); c.bezierCurveTo(-21 + d, -17, -10, -4 - d, 0, -2 - d); c.bezierCurveTo(10, -4 - d, 21 - d, -17, 16.5 - d, -34); c.bezierCurveTo(9, -27, -9, -27, -16.5 + d, -34); c.closePath(); };
    fill('#c3cce0'); beard(0); c.fill();
    c.save(); beard(0); c.clip(); fill('#ffffff'); c.translate(-1.6, -1.8); beard(0.6); c.fill(); c.restore();
    ink('#c3cce0', 1.1); c.lineCap = 'round';
    c.beginPath(); c.moveTo(-7, -20); c.quadraticCurveTo(-6, -12, -2, -7); c.moveTo(4, -20); c.quadraticCurveTo(4.5, -13, 2, -8); c.moveTo(-12, -24); c.quadraticCurveTo(-12, -17, -9, -13); c.stroke();
    ink('rgba(27,31,51,0.4)', 1); beard(0); c.stroke();
    // the mouth, under the moustache
    if (m === 1) { fill('#7a2a3a'); c.beginPath(); c.arc(0, -24.6, 4.4, 0.1, Math.PI - 0.1); c.closePath(); c.fill(); }
    else if (m === 2) { ink(INK, 1.4); c.beginPath(); c.arc(0, -19.5, 4.4, Math.PI * 1.22, Math.PI * 1.78); c.stroke(); }
    else { ink(INK, 1.4); line(-2.6, -22.8, 2.6, -22.8); }
    const up = m === 1 ? -0.42 : m === 2 ? -0.05 : -0.24;
    fill('#c3cce0'); oval(-6.4, -26.4, 7.6, 3.6, up); oval(6.4, -26.4, 7.6, 3.6, -up);
    fill('#ffffff'); oval(-6.8, -27.2, 7, 3, up); oval(6, -27.2, 7, 3, -up);
    // the nose and the cheeks
    if (m === 1) { fill('rgba(255,110,150,0.5)'); oval(-10.5, -32, 3.4, 2.2); oval(10.5, -32, 3.4, 2.2); }
    ball(0, -31.6, 5.4, '#f7a58c', '#d67c60');
    // the eyes, behind tiny glasses
    const ey = -39.5;
    fill('rgba(210,240,255,0.55)'); circle(-6.4, ey, 4.4); circle(6.4, ey, 4.4);
    if (m === 1) { ink(INK, 1.5); c.beginPath(); c.arc(-6.4, ey + 1.4, 2.5, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); c.beginPath(); c.arc(6.4, ey + 1.4, 2.5, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); }
    else {
      fill(INK); circle(-6.2, ey + 0.4, 1.7); circle(6.6, ey + 0.4, 1.7);
      if (m === 0) { fill('#f2b98a'); c.fillRect(-9.6, ey - 3.4, 6.6, 3); c.fillRect(3.2, ey - 3.4, 6.6, 3); ink(INK, 1.3); line(-9, ey - 0.5, -3.6, ey - 0.5); line(3.8, ey - 0.5, 9.2, ey - 0.5); }
    }
    ink(INK, 1.2); ring(-6.4, ey, 4.4); ring(6.4, ey, 4.4); line(-2, ey - 0.6, 2, ey - 0.6);
    ink('rgba(255,255,255,0.9)', 1); c.beginPath(); c.arc(-6.4, ey, 3, Math.PI * 1.1, Math.PI * 1.4); c.stroke(); c.beginPath(); c.arc(6.4, ey, 3, Math.PI * 1.1, Math.PI * 1.4); c.stroke();
    // bushy brows
    const br = m === 2 ? 0.5 : m === 1 ? -0.2 : 0.06, bY = m === 1 ? -46.6 : m === 2 ? -44.6 : -45.6;
    fill('#c3cce0'); oval(-6.8, bY + 0.6, 5, 2, br); oval(6.8, bY + 0.6, 5, 2, -br);
    fill('#ffffff'); oval(-7, bY, 4.8, 1.8, br); oval(6.6, bY, 4.8, 1.8, -br);
    // the hat
    const hat = () => { c.beginPath(); c.moveTo(-19.5, -44.5); c.quadraticCurveTo(0, -39, 19.5, -44.5); c.quadraticCurveTo(11, -62, 5.5, -73); c.quadraticCurveTo(3, -77.5, 0, -72.5); c.quadraticCurveTo(-9, -60, -19.5, -44.5); c.closePath(); };
    fill('#d92a3a'); hat(); c.fill();
    c.save(); hat(); c.clip();
    fill('#a3182c'); pg([6, -80, 24, -80, 24, -38, 9, -40]);
    fill('#ff5d62'); pg([-22, -42, -13, -46.5, 1, -73, -2, -76]);
    ink('rgba(120,10,30,0.5)', 1.4); c.beginPath(); c.moveTo(-19.5, -47.5); c.quadraticCurveTo(0, -42, 19.5, -47.5); c.stroke();
    c.restore();
    ink('rgba(27,31,51,0.6)', 1.2); hat(); c.stroke();
  }

  // ---------- clouds ----------
  // palette: lit, base, shadow
  const CLOUD = {
    puff: ['#ffffff', '#ffffff', '#c6d6ee'],
    gold: ['#fffbe0', '#ffe9a8', '#f0b84a'],
    frost: ['#f4fcff', '#cdeeff', '#86bfe8'],
    rain: ['#c0cee2', '#9fb2cc', '#6c80a2'],
    storm: ['#7b819c', '#5b6078', '#353950'],
    sun: ['#fffdf0', '#fff1c2', '#f2c35a'],
    rainbow: ['#ffffff', '#ffffff', '#d2c6ee'],
    snow: ['#ffffff', '#eef3ff', '#aebbe0'],
    super: ['#6f5b96', '#4a3a66', '#271c3f'],
  };
  const PUFFS = [[-22, -15, 13], [-7, -24.5, 17], [12, -22, 15], [25, -13.5, 11], [2, -13, 13]];
  function cloudBody(pal) {
    const shape = (dx, dy, k) => {
      rrect(-34 + dx, -21 + dy, 68, 18, 9);
      for (const [x, y, r] of PUFFS) { c.moveTo(x + dx + r * k, y + dy); c.arc(x + dx, y + dy, r * k, 0, TAU); }
      c.fill();
    };
    fill(pal[2]); shape(0, 3, 1);
    fill(pal[1]); shape(-0.4, 0, 0.97);
    if (pal[0] !== pal[1]) { fill(pal[0]); c.beginPath(); for (const [x, y, r] of PUFFS.slice(0, 4)) { c.moveTo(x - r * 0.2 + r * 0.62, y - r * 0.24); c.arc(x - r * 0.2, y - r * 0.24, r * 0.62, 0, TAU); } c.fill(); }
    fill('rgba(255,255,255,0.75)'); oval(-12, -34, 8, 3.4, -0.3);
  }
  function snowflake(x, y, r, col) {
    ink(col, 1.1); c.lineCap = 'round'; c.beginPath();
    for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; c.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    c.stroke();
  }
  function cloudFace(t) {
    const ex0 = -6, ex1 = 9, ey = -14.5;
    if (t === 'gold' || t === 'rainbow') { // happy
      ink(INK, 1.5); c.lineCap = 'round';
      c.beginPath(); c.arc(ex0, ey + 1.5, 2.4, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); c.beginPath(); c.arc(ex1, ey + 1.5, 2.4, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
      smile(1.5, ey + 5.5, 3.2); fill('rgba(255,110,150,0.45)'); oval(ex0 - 4, ey + 4.5, 2.6, 1.6); oval(ex1 + 4, ey + 4.5, 2.6, 1.6);
    } else if (t === 'snow') { // asleep
      ink(INK, 1.4); c.lineCap = 'round'; c.beginPath(); c.arc(ex0, ey - 0.5, 2.4, Math.PI * 0.15, Math.PI * 0.85); c.stroke(); c.beginPath(); c.arc(ex1, ey - 0.5, 2.4, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
      fill(INK); oval(1.5, ey + 6, 1.4, 1.1);
    } else if (t === 'storm' || t === 'super') {
      if (t === 'super') { glow(ex0, ey, 6, '255,42,77', 0.9); glow(ex1, ey, 6, '255,42,77', 0.9); fill('#ffe680'); circle(ex0, ey, 2.4); circle(ex1, ey, 2.4); fill('#ff2a4d'); circle(ex0 + 0.4, ey + 0.3, 1.3); circle(ex1 + 0.4, ey + 0.3, 1.3); }
      else { fill('#ffffff'); circle(ex0, ey, 2.7); circle(ex1, ey, 2.7); fill(INK); circle(ex0 + 0.6, ey + 0.5, 1.4); circle(ex1 + 0.6, ey + 0.5, 1.4); }
      ink(t === 'super' ? '#0e0a1c' : INK, 2); c.lineCap = 'round'; line(ex0 - 4, ey - 5.4, ex0 + 3, ey - 2.4); line(ex1 + 4, ey - 5.4, ex1 - 3, ey - 2.4);
      if (t === 'super') { fill('#0e0a1c'); pg([-4, ey + 6, 7, ey + 6, 5.5, ey + 9.5, -2.5, ey + 9.5]); fill('#ffffff'); pg([-3, ey + 6, -1.6, ey + 8.2, -0.2, ey + 6]); pg([1, ey + 6, 2.4, ey + 8.2, 3.8, ey + 6]); pg([4.2, ey + 6, 5.2, ey + 8, 6.4, ey + 6]); }
      else frown(1.5, ey + 5.6, 3);
    } else if (t === 'rain') { // glum
      eyes(ex0, ey, ex1, ey, 1.9); frown(1.5, ey + 5.6, 2.8);
      ink(INK, 1.1); line(ex0 - 3.4, ey - 3.2, ex0 + 1.4, ey - 4.4); line(ex1 + 3.4, ey - 3.2, ex1 - 1.4, ey - 4.4);
    } else if (t === 'frost') {
      eyes(ex0, ey, ex1, ey, 1.9); ink(INK, 1.2); c.beginPath(); c.moveTo(-2, ey + 5.4); c.lineTo(-0.2, ey + 4.2); c.lineTo(1.5, ey + 5.4); c.lineTo(3.2, ey + 4.2); c.lineTo(5, ey + 5.4); c.stroke();
      fill('rgba(94,160,255,0.45)'); oval(ex0 - 4, ey + 4.5, 2.6, 1.6); oval(ex1 + 4, ey + 4.5, 2.6, 1.6);
    } else { eyes(ex0, ey, ex1, ey, 1.9); smile(1.5, ey + 5.2, 2.8); }
  }
  // origin = the centre of the underside
  function cloud(o) {
    const t = o.t, pal = CLOUD[t];
    let k = o.big ? 1.5 : 1;
    if (t === 'super') k *= 1.28;
    c.scale(k, k);
    if (t === 'gold') glow(0, -18, 48, '255,220,110', 0.5);
    if (t === 'sun') { // the sun peeks between two halves
      glow(0, -27, 40, '255,220,110', 0.55);
      fill('#ffb52a');
      for (let r = 0; r < 12; r++) { c.save(); c.translate(0, -27); c.rotate(r * TAU / 12); pg([-3, -15, 0, -24, 3, -15]); c.restore(); }
      fill('#f2a01e'); circle(0, -27, 15.5); fill('#ffd23f'); circle(-0.6, -27.8, 14.3); fill('#ffe680'); circle(-3, -31, 8);
      eyes(-5, -29, 5, -29, 1.8); smile(0, -24.6, 3.4);
      fill('rgba(255,110,150,0.5)'); oval(-8.6, -25.4, 2.4, 1.5); oval(8.6, -25.4, 2.4, 1.5);
      for (const [x, s] of [[-19, 0.56], [20, 0.5]]) { c.save(); c.translate(x, 0); c.scale(s, s); cloudBody(pal); c.restore(); }
      return;
    }
    if (t === 'rainbow') {
      const RB = ['#ff2a4d', '#ff9a3d', '#ffd23f', '#4fc65a', '#3d8fd6', '#9a6ae0'];
      c.lineCap = 'butt';
      for (let b = 0; b < 6; b++) { ink(RB[b], 3.1); c.beginPath(); c.arc(0, -20, 37 - b * 2.8, Math.PI, 0); c.stroke(); }
    }
    if (t === 'frost') { // icicles
      for (const [x, h] of [[-22, 7], [-12, 10], [-3, 6], [8, 11], [18, 7]]) { fill('#86bfe8'); pg([x - 3, -1, x + 3, -1, x + 0.6, h]); fill('#e6f8ff'); pg([x - 3, -1, x - 0.4, -1, x + 0.4, h - 1]); }
    }
    if (t === 'rain') { for (const [x, y] of [[-20, 6], [-9, 11], [1, 6], [11, 12], [21, 7], [-14, 17], [6, 18]]) { fill('#2f78bd'); drop(x + 0.4, y + 0.4, 1.15); fill('#6fb8f2'); drop(x, y, 1); } }
    if (t === 'snow') { for (const [x, y, r] of [[-20, 6, 2.6], [-8, 12, 3], [3, 6, 2.4], [14, 13, 3], [23, 6, 2.2], [-15, 18, 2], [6, 19, 2.2]]) { snowflake(x + 0.5, y + 0.6, r, '#8fa6d8'); snowflake(x, y, r, '#ffffff'); } }
    if (t === 'storm') { fill('#b97a1a'); bolt(2.8, -3.4, 1.55); c.fill(); fill('#ffd23f'); bolt(2, -4, 1.5); c.fill(); fill('#fff6c0'); bolt(2.2, -3, 0.9); c.fill(); }
    if (t === 'super') {
      glow(0, 4, 30, '255,210,63', 0.35);
      for (const [x, y, s] of [[-13, -4, 1.2], [14, -4, 1.3], [1, -3, 1.6]]) { fill('#b97a1a'); bolt(x + 0.8, y + 0.6, s + 0.05); c.fill(); fill('#ffd23f'); bolt(x, y, s); c.fill(); }
      fill('#fff6c0'); bolt(1.3, -2, 1); c.fill();
    }
    cloudBody(pal);
    if (t === 'frost') { snowflake(-21, -17, 3.4, '#5aa9e6'); snowflake(21, -22, 3, '#5aa9e6'); snowflake(-2, -31, 2.6, '#5aa9e6'); fill('#ffffff'); star4(26, -9, 2.6); }
    if (t === 'gold') { fill('#ffffff'); star4(-27, -27, 3.6); star4(27, -27, 2.8); star4(15, -38, 2.2); }
    if (t === 'super') { ink('rgba(20,10,40,0.45)', 1.6); c.lineCap = 'round'; c.beginPath(); c.arc(-21, -15, 6, Math.PI * 0.2, Math.PI * 1.3); c.stroke(); c.beginPath(); c.arc(23, -14, 5, Math.PI * 1.7, Math.PI * 2.9); c.stroke(); }
    cloudFace(t);
  }

  // ---------- loot (drawn around the centre, about 20 px) ----------
  function gemArt(A, B, D) {
    const out = [-5.2, -7.5, 5.2, -7.5, 9.5, -2.2, 0, 9, -9.5, -2.2];
    fill(B); pg(out);
    fill(A); pg([-5.2, -7.5, 0, -7.5, -3.4, -2.2, -9.5, -2.2]); pg([-3.4, -2.2, 3.4, -2.2, 0, 9]);
    fill(D); pg([5.2, -7.5, 9.5, -2.2, 3.4, -2.2]); pg([3.4, -2.2, 9.5, -2.2, 0, 9]);
    fill('#ffffff'); pg([-4.6, -6.6, -1.4, -6.6, -3.6, -3.4, -7, -3.2]);
    ink(INK, 1); c.lineJoin = 'round'; poly(c, out); c.stroke();
  }
  function coinFlat(x, y, r) { tube(x, y, r, r, 2.6, '#e0a21e', '#ffd23f'); ink('#fff3a0', 0.9); c.beginPath(); c.ellipse(x, y - 2.6, r - 1.6, (r - 1.6) / 2, 0, Math.PI * 0.9, Math.PI * 1.8); c.stroke(); }
  function heartArt(s) {
    fill('#a8102e'); heartPath(0.5, 1.2, s); c.fill();
    fill('#ff2a4d'); heartPath(0, 0.2, s * 0.93); c.fill();
    fill('#ff8a9c'); oval(-s * 0.52, -s * 0.38, s * 0.3, s * 0.2, -0.6);
    ink(INK, 1); heartPath(0.2, 0.7, s * 1.02); c.stroke();
  }
  function stickArt() {
    c.save(); c.rotate(0.5);
    fill('#a8102e'); rbox(-3.6, -8, 7.6, 17, 2); fill('#e8324a'); rbox(-3.6, -8, 6.2, 17, 2); fill('#ff8a96'); c.fillRect(-2.4, -6.6, 1.5, 14);
    fill('#efe0b6'); c.fillRect(-3.6, -1.6, 7.6, 3.6);
    ink(INK, 1); rrect(-3.6, -8, 7.6, 17, 2); c.stroke();
    ink('#3a2a22', 1.5); c.lineCap = 'round'; c.beginPath(); c.moveTo(0, -8); c.quadraticCurveTo(0, -12, -4, -11.5); c.stroke();
    c.restore();
    fill('#ff8a2a'); star4(-8.4, -8.3, 3.4); fill('#fff6c0'); star4(-8.4, -8.3, 1.8);
  }
  function pack(n) {
    const w = 5.4 + n * 1.5, h = 9 + n * 2.6, yb = 9, yt = yb - h;
    // straps
    ink('#5a3a1e', 2); c.lineCap = 'round'; c.beginPath(); c.arc(-w - 0.4, yt + h * 0.55, h * 0.3, Math.PI * 0.5, Math.PI * 1.5); c.stroke();
    if (n >= 2) { // a bedroll
      fill('#2f6fb0'); rbox(-w - 1, yt - 4.6, 2 * w + 2.6, 5.6, 2.8); fill('#5a9fe0'); rbox(-w - 1, yt - 4.8, 2 * w + 1.4, 4.2, 2.1);
      ink('#1f4a80', 0.9); ring(w - 0.6, yt - 2, 1.6); ink(INK, 0.9); rrect(-w - 1, yt - 4.8, 2 * w + 2.6, 5.8, 2.8); c.stroke();
    }
    fill('#4a6a2c'); rbox(-w, yt, 2 * w + 1.2, h, 3.4);
    fill('#7fa648'); rbox(-w, yt, 2 * w, h - 1, 3.2);
    fill('#9cc45e'); rbox(-w + 1.2, yt + 1.2, 2.6, h - 4, 1.3);
    ink(INK, 1); rrect(-w, yt, 2 * w + 1.2, h, 3.4); c.stroke();
    // the flap and its buckle
    fill('#b8402e'); c.beginPath(); c.moveTo(-w, yt + 3); c.arcTo(-w, yt, 0, yt, 3.2); c.arcTo(w + 1.2, yt, w + 1.2, yt + 3, 3.2); c.lineTo(w + 1.2, yt + h * 0.36); c.quadraticCurveTo(0, yt + h * 0.56, -w, yt + h * 0.36); c.closePath(); c.fill();
    fill('#e86a4a'); c.beginPath(); c.moveTo(-w + 0.8, yt + 3); c.arcTo(-w + 0.8, yt + 0.8, 0, yt + 0.8, 2.6); c.lineTo(w - 1.6, yt + 0.8); c.lineTo(w - 1.6, yt + h * 0.3); c.quadraticCurveTo(0, yt + h * 0.46, -w + 0.8, yt + h * 0.3); c.closePath(); c.fill();
    fill('#ffd23f'); rbox(-1.5, yt + h * 0.36, 3.6, 3.6, 0.8); fill('#8a5a12'); c.fillRect(-0.3, yt + h * 0.36 + 1, 1.2, 1.6);
    if (n >= 3) { // a pan and a little flag
      ink('#3a3d52', 1.4); line(w + 1, yt + h * 0.42, w + 3.4, yt + h * 0.62); fill('#3a3d52'); circle(w + 3.6, yt + h * 0.78, 3.4); fill('#8792a8'); circle(w + 3.2, yt + h * 0.75, 2.2);
      ink(INK, 1); line(-w + 2, yt - 4, -w + 2, yt - 11.5); fill('#ffd23f'); pg([-w + 2, yt - 11.5, -w + 8, yt - 9.6, -w + 2, yt - 7.6]);
    }
  }
  const LOOT = {
    gem() { gemArt('#b8f8ff', '#5ef0ff', '#1fa3d0'); },
    coins() { coinFlat(-3.5, 9, 6); coinFlat(4, 8, 6); coinFlat(-3, 5.6, 6); coinFlat(1.5, 2, 6); coinFlat(1, -1, 6); fill('#fff6c0'); star4(-6, -6.5, 3); },
    fossil() {
      fill('#8f7f5c'); circle(0.6, 0.8, 9.2); fill('#e8dcc0'); circle(0, 0, 8.6); fill('#f7efdc'); oval(-3, -4, 3.6, 2, -0.6);
      ink('#8f7f5c', 1.5); c.lineCap = 'round'; c.beginPath();
      for (let a = 0; a < 15; a += 0.3) { const r = 0.6 + a * 0.5; c.lineTo(Math.cos(a) * r * 0.98 + 0.4, Math.sin(a) * r * 0.98 + 0.4); }
      c.stroke();
      ink('rgba(143,127,92,0.6)', 0.9); for (let k = 0; k < 9; k++) { const a = k * 0.7; line(Math.cos(a) * 5.6, Math.sin(a) * 5.6, Math.cos(a) * 8, Math.sin(a) * 8); }
      ink(INK, 1); ring(0.2, 0.3, 9);
    },
    spring() {
      c.lineCap = 'round';
      for (const [col, w, d] of [[INK, 4, 0], ['#7d89a3', 2.4, 0], ['#e4ebf5', 0.9, -0.7]]) {
        ink(col, w); c.beginPath(); c.moveTo(-6, 8 + d);
        for (let k = 0; k < 4; k++) { const y = 8 - k * 4.4 + d; c.bezierCurveTo(-6, y + 2.6, 6, y + 1.4, 6, y - 1.6); c.bezierCurveTo(6, y - 4.2, -6, y - 2, -6, y - 4.4); }
        c.stroke();
      }
      fill(INK); rbox(-7.6, -10.6, 15.2, 3.6, 1.6); fill('#ff2a4d'); rbox(-6.8, -10.2, 13.6, 2.4, 1.2);
    },
    heart() { heartArt(6.6); },
    mushroom() {
      fill('#c9b891'); rbox(-3.6, -1, 8, 10, 3); fill('#fff6e2'); rbox(-3.6, -1, 6.6, 9.6, 3); ink(INK, 1); rrect(-3.6, -1, 8, 10, 3); c.stroke();
      const cap = () => { c.beginPath(); c.moveTo(-10, 1); c.bezierCurveTo(-10, -12, 10, -12, 10, 1); c.quadraticCurveTo(0, 4, -10, 1); c.closePath(); };
      fill('#ff2a4d'); cap(); c.fill();
      c.save(); cap(); c.clip(); fill('#a8102e'); c.fillRect(4, -12, 8, 16); fill('#ffffff'); circle(-4.6, -3.6, 2.3); circle(2.4, -6, 1.9); circle(6.4, -1.4, 1.6); circle(-0.6, 0.4, 1.3); c.restore();
      ink(INK, 1); cap(); c.stroke();
    },
    relic() { // a golden idol with a long-suffering face
      fill('#8a5a12'); rbox(-6, 6, 13, 3.6, 1); fill('#c98a1e'); rbox(-6, 6, 11.6, 2.6, 1);
      const head = () => { c.beginPath(); c.moveTo(-7, 6); c.lineTo(-7.6, -4); c.quadraticCurveTo(-7, -10, 0, -10); c.quadraticCurveTo(7, -10, 7.6, -4); c.lineTo(7, 6); c.closePath(); };
      fill('#ffd23f'); head(); c.fill();
      c.save(); head(); c.clip(); fill('#d99a1e'); c.fillRect(3.4, -11, 6, 18); fill('#fff3a0'); c.fillRect(-6.4, -9, 2, 13); c.restore();
      ink(INK, 1); head(); c.stroke();
      fill('#5ef0ff'); circle(-3, -3.4, 1.9); circle(3, -3.4, 1.9); fill(INK); circle(-3, -3.2, 0.8); circle(3, -3.2, 0.8);
      ink(INK, 1.1); line(-5, -6.6, -1, -5.8); line(5, -6.6, 1, -5.8); line(-2.4, 2.4, 2.4, 2.4);
      fill('#ff2a4d'); pg([0, -12.6, 2, -10.2, 0, -7.8, -2, -10.2]);
    },
    blueprint() {
      c.save(); c.rotate(-0.22);
      fill('#1f4a80'); rbox(-8.6, -6, 18, 13, 1.5); fill('#3d7fd6'); rbox(-8.6, -6.6, 17, 12.6, 1.5);
      ink('rgba(255,255,255,0.85)', 0.9); c.strokeRect(-5.6, -3.6, 6, 6); line(-5.6, -0.6, 0.4, -0.6); ring(4.4, 1.6, 2.2); line(2, -4, 7, -4);
      ink(INK, 1); rrect(-8.6, -6.6, 18, 13.6, 1.5); c.stroke();
      tube(-9.4, 7.6, 1.9, 1.9, 14.6, '#e4ebf5', null); ink(INK, 0.9); c.strokeRect(-11.3, -7, 3.8, 14.6);
      c.restore();
    },
    crystal() {
      shard(-4.6, 9, 2.8, 11, -0.5, '#ffd0f2', '#ff7ad9', '#b83aa0'); shard(5, 9, 3, 12.5, 0.45, '#ffd0f2', '#ff7ad9', '#b83aa0');
      shard(0, 9.4, 4.2, 19, 0.03, '#ffe3f8', '#ff8fe0', '#c44aae'); fill('#ffffff'); star4(-3, -4.5, 2.8);
    },
    dynamite() { stickArt(); },
    pack1() { pack(1); },
    pack2() { pack(2); },
    pack3() { pack(3); },
  };

  // ---------- UI icons (inside 28 x 28 around the centre) ----------
  const sub = (x, y, s, fn) => { c.save(); c.translate(x, y); c.scale(s, s); fn(); c.restore(); };
  const ICON = {
    heart() { sub(0, 0.5, 1.3, () => heartArt(6.6)); },
    coin() {
      fill('#a8741a'); circle(0.7, 0.9, 11.6); fill('#ffd23f'); circle(0, 0, 11.4); fill('#e0a21e'); circle(0, 0, 8.6); fill('#ffd23f'); circle(-0.5, -0.5, 7.8);
      fill('#fff3a0'); star5(0, 0.2, 5.2); c.fill(); ink(INK, 1); ring(0.2, 0.3, 11.8);
      ink('rgba(255,255,255,0.8)', 1.3); c.beginPath(); c.arc(0, 0, 9.8, Math.PI * 1.05, Math.PI * 1.45); c.stroke();
    },
    gem() { sub(0, 0, 1.28, LOOT.gem); },
    sky() {
      fill('#ffd23f'); circle(6, -5.5, 5.6); fill('#ffe680'); circle(5.2, -6.2, 3.6);
      sub(-0.8, 10.5, 0.35, () => { cloudBody(CLOUD.puff); });
      ink('rgba(27,31,51,0.5)', 1); c.beginPath(); c.moveTo(-11.5, 10.4); c.lineTo(10, 10.4); c.stroke();
    },
    ground() {
      isoBox(c, (x, y, z) => { const p = ZERO(x, y, z); return { x: p.x, y: p.y - 1 }; }, 0, 0, 0.15, 0.15, -0.15, 0.15, '#8a5a36', '#62b354');
      fill('#55a044'); pg([-12, -1, 0, 5, 0, 7.4, -12, 1.4]); fill('#437f36'); pg([0, 5, 12, -1, 12, 1.4, 0, 7.4]);
      ink(INK, 1); c.lineJoin = 'round'; poly(c, [0, -7, 12, -1, 12, 6.4, 0, 12.4, -12, 6.4, -12, -1]); c.stroke();
      ink('#2f7a36', 1.3); c.lineCap = 'round'; line(-3, -2, -2, -6); line(0.5, -1.5, 1.5, -6.5); line(4, -3.5, 5.6, -7);
      flower(c, -5.5, 0.5, '#ffffff');
    },
    dig() {
      c.save(); c.translate(-0.8, 0.6); c.rotate(0.7); c.scale(0.94, 0.94);
      fill(INK); rbox(-2.2, -9, 4.4, 21.5, 2); fill('#b07a44'); rbox(-1.2, -8, 2.4, 19.5, 1.2);
      c.lineCap = 'round'; ink(INK, 5.6); c.beginPath(); c.moveTo(-11, -4.5); c.quadraticCurveTo(0, -13.5, 11, -4.5); c.stroke();
      ink('#aeb9cc', 3.4); c.beginPath(); c.moveTo(-11, -4.5); c.quadraticCurveTo(0, -13.5, 11, -4.5); c.stroke();
      ink('#ffffff', 1); c.beginPath(); c.moveTo(-9.6, -5.6); c.quadraticCurveTo(-4, -10, 0, -10.2); c.stroke();
      c.restore();
    },
    boot() { sub(-2.4, 12.4, 0.43, boot); },
    dynamite() { sub(-2, 12, 0.6, () => dynamite({ lit: true })); },
    anchor() { sub(0, 12.4, 0.95, anchor); },
    wind() {
      c.lineCap = 'round';
      const lines = () => {
        c.beginPath(); c.moveTo(-11, -4); c.lineTo(3, -4); c.arc(3, -7.6, 3.6, Math.PI * 0.5, Math.PI * 1.75, true);
        c.moveTo(-11, 1.5); c.lineTo(8, 1.5); c.arc(8, 5, 3.5, Math.PI * 1.5, Math.PI * 0.4);
        c.moveTo(-7, 7); c.lineTo(0, 7); c.arc(0, 9.4, 2.4, Math.PI * 1.5, Math.PI * 0.5);
      };
      ink(INK, 4.4); lines(); c.stroke(); ink('#e6fbff', 2.4); lines(); c.stroke();
    },
    star() {
      fill('#a8741a'); star5(0.6, 1.4, 12.6); c.fill(); fill('#ffd23f'); star5(0, 0.6, 12); c.fill(); fill('#ffe680'); star5(-0.6, -0.4, 7); c.fill();
      ink(INK, 1); c.lineJoin = 'round'; star5(0.2, 1, 12.6); c.stroke();
    },
    clock() {
      fill(INK); circle(0, 0.5, 12); fill('#aeb9cc'); circle(0, 0, 11); fill('#ffffff'); circle(0, 0, 8.8); fill('#dfe6f5'); c.beginPath(); c.arc(0, 0, 8.8, -0.3, 1.8); c.closePath(); c.fill();
      fill('#ffffff'); circle(-0.6, -0.6, 7.4);
      ink(INK, 1.8); c.lineCap = 'round'; line(0, 0, 0, -5.6); line(0, 0, 4, 2.2); fill('#ff2a4d'); circle(0, 0, 1.5);
      fill(INK); for (let k = 0; k < 4; k++) circle(Math.cos(k * Math.PI / 2) * 7, Math.sin(k * Math.PI / 2) * 7, 0.8);
    },
    bell() { sub(0, 12.2, 0.9, bell); },
    combo() { // a flame
      const fl = (s, dy) => { c.beginPath(); c.moveTo(0, 12 + dy); c.bezierCurveTo(-11 * s, 11, -9 * s, -1, -3 * s, -5 * s); c.bezierCurveTo(-3 * s, -1, 0, -2, 1 * s, -13 * s + dy); c.bezierCurveTo(4 * s, -5, 11 * s, 0, 9 * s, 6); c.bezierCurveTo(8 * s, 10, 4 * s, 12, 0, 12 + dy); c.closePath(); };
      fill('#ff2a4d'); fl(1, 0); c.fill(); ink(INK, 1); c.lineJoin = 'round'; c.stroke();
      fill('#ff9a3d'); fl(0.72, -0.8); c.fill(); fill('#ffe680'); fl(0.4, -1.4); c.fill();
    },
    eye() {
      const lid = () => { c.beginPath(); c.moveTo(-12.4, 0); c.quadraticCurveTo(0, -12, 12.4, 0); c.quadraticCurveTo(0, 12, -12.4, 0); c.closePath(); };
      fill('#ffffff'); lid(); c.fill();
      c.save(); lid(); c.clip(); fill('#dfe6f5'); c.fillRect(-13, 2.5, 26, 6); fill('#22a9d6'); circle(0, 0, 5.6); fill('#5ef0ff'); circle(-0.5, -0.5, 4.6); fill(INK); circle(0, 0, 2.6); fill('#ffffff'); circle(-1.6, -1.8, 1.3); c.restore();
      ink(INK, 1.5); c.lineJoin = 'round'; lid(); c.stroke();
    },
    wave() { // a war pennant
      fill(INK); rbox(-10.4, -12.6, 3.2, 25.2, 1.4); fill('#b07a44'); rbox(-9.6, -11.8, 1.6, 23.6, 0.8); fill('#ffd23f'); circle(-8.8, -11.6, 2);
      const flag = () => { c.beginPath(); c.moveTo(-7.4, -9.6); c.quadraticCurveTo(-1, -12, 4, -8.6); c.quadraticCurveTo(8, -6.4, 12.4, -8); c.lineTo(8, -2.6); c.lineTo(12.2, 3); c.quadraticCurveTo(7, 4.6, 3, 2); c.quadraticCurveTo(-2, -0.6, -7.4, 1.6); c.closePath(); };
      fill('#ff2a4d'); flag(); c.fill();
      c.save(); flag(); c.clip(); fill('#a8102e'); c.fillRect(-8, -1.6, 22, 8); fill('#ff7a8a'); c.fillRect(-8, -11, 5, 14); c.restore();
      ink(INK, 1); c.lineJoin = 'round'; flag(); c.stroke();
      fill('#ffffff'); circle(0.4, -4.6, 2.3); fill(INK); circle(-0.4, -4.8, 0.6); circle(1.3, -4.8, 0.6);
    },
  };

  // ---------- kinds ----------
  const TOWER_KINDS = ['pea', 'kite', 'ice', 'mortar', 'tesla', 'banana'];
  const CLOUD_TYPES = Object.keys(CLOUD);
  const LOOT_KEYS = Object.keys(LOOT);
  const ICON_KEYS = Object.keys(ICON);
  const int = (v, a, b) => Math.max(a, Math.min(b, Math.round(+v || 0)));
  // DRAW[kind] = [normalise options, draw]
  const DRAW = {
    castle: [(o) => ({ door: o.door ? 1 : 0 }), castle],
    hut: [() => ({}), hut],
    tree: [(o) => ({ seed: int(o.seed, 0, 1e9) % 4 }), tree],
    bush: [() => ({}), bush],
    boot: [() => ({}), boot],
    dynamite: [(o) => ({ lit: o.lit ? 1 : 0 }), dynamite],
    chest: [(o) => ({ open: o.open ? 1 : 0 }), chest],
    crystal: [() => ({}), crystal],
    peel: [() => ({}), peel],
    anchor: [() => ({}), anchor],
    egg: [() => ({}), egg],
    pot: [() => ({}), pot],
    geyser: [(o) => ({ f: int(o.f, 0, 2) }), geyser],
    pit: [() => ({}), pit],
    crack: [() => ({}), crack],
    ridge: [() => ({}), ridge],
    bell: [() => ({}), bell],
    gnome: [(o) => ({ mood: int(o.mood, 0, 2) }), gnome],
    cloud: [(o) => ({ t: CLOUD[o.t] ? o.t : 'puff', big: o.big ? 1 : 0 }), cloud],
    loot: [(o) => ({ k: LOOT[o.k] ? o.k : 'gem' }), (o) => { c.translate(0, -11); LOOT[o.k](); }],
    icon: [(o) => ({ k: ICON[o.k] ? o.k : 'heart' }), (o) => ICON[o.k]()],
  };
  for (const k of TOWER_KINDS) DRAW[k] = [(o) => ({ lvl: int(o.lvl || 1, 1, 3) }), (o) => { plinth(o.lvl); c.translate(0, -PLY); TOWERS[k](o.lvl); }];
  const kinds = [...TOWER_KINDS, ...Object.keys(DRAW).filter((k) => !TOWER_KINDS.includes(k))];

  // representative options of every kind, for galleries and tests
  const opts = {};
  for (const k of kinds) opts[k] = [{}];
  for (const k of TOWER_KINDS) opts[k] = [{ lvl: 1 }, { lvl: 2 }, { lvl: 3 }];
  opts.castle = [{ door: 0 }, { door: 1 }];
  opts.tree = [{ seed: 0 }, { seed: 1 }, { seed: 2 }, { seed: 3 }];
  opts.dynamite = [{ lit: false }, { lit: true }];
  opts.chest = [{ open: false }, { open: true }];
  opts.geyser = [{ f: 0 }, { f: 1 }, { f: 2 }];
  opts.gnome = [{ mood: 0 }, { mood: 1 }, { mood: 2 }];
  opts.cloud = [...CLOUD_TYPES.map((t) => ({ t, big: false })), ...CLOUD_TYPES.map((t) => ({ t, big: true }))];
  opts.loot = LOOT_KEYS.map((k) => ({ k }));
  opts.icon = ICON_KEYS.map((k) => ({ k }));

  // ---------- paint / box ----------
  function paint(kind, ctx, o) {
    const d = DRAW[kind];
    if (!d || !ctx) return;
    const prev = c;
    c = ctx; c.save();
    c.lineCap = 'butt'; c.lineJoin = 'miter'; c.globalAlpha = 1; c.setLineDash([]);
    try { d[1](d[0](o || {})); } finally { c.restore(); c = prev; }
  }
  // The box is measured once per (kind, options): paint into a scratch canvas and find the painted pixels.
  const BOXES = new Map();
  const MW = 440, MH = 440, MX = 220, MY = 300;
  let scratch = null;
  function box(kind, o) {
    const d = DRAW[kind];
    if (!d) return { w: 8, h: 8, ax: 4, ay: 4 };
    if (kind === 'icon') return { w: 34, h: 34, ax: 17, ay: 17 };
    const key = kind + ':' + JSON.stringify(d[0](o || {}));
    let b = BOXES.get(key);
    if (!b) {
      b = { w: 180, h: 200, ax: 90, ay: 160 }; // only used where there is no canvas to measure with
      if (typeof document !== 'undefined') {
        if (!scratch) { scratch = document.createElement('canvas'); scratch.width = MW; scratch.height = MH; }
        const m = scratch.getContext('2d', { willReadFrequently: true });
        m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, MW, MH); m.translate(MX, MY);
        paint(kind, m, o);
        m.setTransform(1, 0, 0, 1, 0, 0);
        const px = m.getImageData(0, 0, MW, MH).data;
        let x0 = MW, y0 = MH, x1 = -1, y1 = -1;
        for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (px[(y * MW + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 >= 0) b = { w: x1 - x0 + 1 + 6, h: y1 - y0 + 1 + 6, ax: MX - x0 + 3, ay: MY - y0 + 3 };
        else b = { w: 8, h: 8, ax: 4, ay: 4 };
      }
      BOXES.set(key, b);
    }
    return { w: b.w, h: b.h, ax: b.ax, ay: b.ay };
  }

  // ---------- muzzles ----------
  // Where a tower fires from. Found by running the tower's own drawing code against a context that draws nothing.
  const NULLC = new Proxy(function () {}, { get: () => NULLC, set: () => true, apply: () => NULLC });
  const MUZ = new Map();
  function muzzleAt(kind, lvl) {
    if (!TOWERS[kind]) return { x: 0, y: -PLY, z: PL };
    const l = int(lvl || 1, 1, 3), key = kind + l;
    if (!MUZ.has(key)) {
      const prev = c; c = NULLC;
      try { TOWERS[kind](l); } finally { c = prev; }
      const x = Math.round(mz[0] * 10) / 10, y = Math.round((mz[1] - PLY) * 10) / 10;
      MUZ.set(key, { x, y, z: Math.round(-y / ZU * 1000) / 1000 });
    }
    const m = MUZ.get(key);
    return { x: m.x, y: m.y, z: m.z };
  }
  const muzzle = (kind, lvl) => muzzleAt(kind, lvl).z;

  window.SSArt = {
    TW, TH, HW, HH, ZU, ZERO, INK, DIG_Z, SLAB_Z,
    hash, shade, poly, tileTop, tileSides, isoBox, isoCyl, isoCone,
    groundTile, ugTile, skyTile,
    paint, box, kinds, opts, muzzle, muzzleAt,
    towers: TOWER_KINDS, clouds: CLOUD_TYPES, loot: LOOT_KEYS, icons: ICON_KEYS,
  };
})();
