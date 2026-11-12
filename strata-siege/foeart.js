'use strict';
/* Strata Siege foe art: the garden pests, the three bosses and the friendly hamsters. game.js caches
   window.SSFoeArt.paint(kind, c, o) into small canvases sized by .box(kind, o).
   Every creature stands on (0, 0) = its ground contact point and faces screen right-down. o.back = the view from
   behind (walking away to the upper left), o.blink = eyes shut, o.alt = a second pose, o.pack = hamster backpack.
   Flyers are drawn as seen in the air with (0, 0) at their lowest point. No Math.random and no time in here. */
(() => {
  const TAU = Math.PI * 2;
  const INK = '#1b1f33';
  const WHITE = '#ffffff';

  // ---------- per-paint state ----------
  // paint() sets these for the creature that it draws now.
  let c = null;
  let B = false;        // back view
  let shut = false;     // the eyes are shut
  let alt = '';         // the second pose, '' = the normal one
  let pack = 0;         // hamster backpack size 0..3

  // ---------- tables ----------
  const KINDS = ['rat', 'snail', 'beetle', 'hedgehog', 'frog', 'worm', 'chick', 'sapper', 'balloon', 'duck',
    'hen', 'tyrant', 'goose', 'hamster'];
  const ALTS = {
    rat: [], snail: [], beetle: ['flip'], hedgehog: ['ball'], frog: ['hop'], worm: [], chick: [], sapper: ['dig'],
    balloon: [], duck: [], hen: [], tyrant: ['dig'], goose: [], hamster: ['dig', 'daze'],
  };
  const COLORS = {
    rat: '#a9a4c8', snail: '#ff6b5e', beetle: '#3f7df0', hedgehog: '#8a6246', frog: '#27c4a8', worm: '#ff9db8',
    chick: '#ffe066', sapper: '#6d5f85', balloon: '#ff5a5f', duck: '#2f9e6b', hen: '#d9743a', tyrant: '#5b4a7a',
    goose: '#f4f6ff', hamster: '#f0a04b',
  };
  const NAMES = {
    rat: 'Bandit Rat', snail: 'Racing Snail', beetle: 'Plaster Beetle', hedgehog: 'Scrumping Hedgehog',
    frog: 'Cheeky Frog', worm: 'Bookworm', chick: 'Eggshell Chick', sapper: 'Sapper Mole', balloon: 'Balloon Rat',
    duck: 'Ace Duck', hen: 'Mama Hen', tyrant: 'Tunnel Tyrant', goose: 'Thunder Goose', hamster: 'Hamster',
  };
  // Boxes are measured from the real drawing by the gallery tool (3 px margin; ':b' = the back view).
  /* BOX-BEGIN */
  const BOX = {
    'rat': [41, 35, 21, 30], 'rat:b': [40, 36, 20, 31], 'snail': [41, 34, 19, 30], 'snail:b': [40, 34, 21, 30],
    'beetle': [43, 33, 20, 28], 'beetle:b': [44, 36, 23, 31], 'beetle:flip': [44, 34, 17, 30], 'beetle:flip:b': [43, 30, 27, 26],
    'hedgehog': [43, 39, 21, 34], 'hedgehog:b': [39, 38, 19, 33], 'hedgehog:ball': [34, 37, 17, 34], 'hedgehog:ball:b': [34, 37, 17, 34],
    'frog': [38, 32, 20, 28], 'frog:b': [37, 32, 17, 28], 'frog:hop': [46, 40, 25, 34], 'frog:hop:b': [45, 40, 20, 34],
    'worm': [42, 32, 21, 29], 'worm:b': [42, 32, 21, 29], 'chick': [31, 35, 15, 30], 'chick:b': [34, 34, 17, 30],
    'sapper': [38, 34, 17, 28], 'sapper:b': [41, 33, 20, 28], 'sapper:dig': [40, 33, 20, 27], 'sapper:dig:b': [40, 33, 20, 27],
    'balloon': [36, 61, 18, 58], 'balloon:b': [36, 61, 18, 58], 'duck': [46, 38, 23, 37], 'duck:b': [40, 40, 21, 38],
    'hen': [77, 79, 43, 73], 'hen:b': [71, 79, 34, 73], 'tyrant': [78, 78, 39, 70], 'tyrant:b': [85, 80, 41, 72],
    'tyrant:dig': [79, 64, 39, 54], 'tyrant:dig:b': [78, 64, 39, 54], 'goose': [87, 66, 47, 65], 'goose:b': [80, 67, 44, 65],
    'hamster:0': [36, 35, 17, 30], 'hamster:0:b': [35, 35, 18, 30], 'hamster:1': [39, 35, 20, 30], 'hamster:1:b': [35, 35, 18, 30],
    'hamster:2': [42, 35, 23, 30], 'hamster:2:b': [35, 35, 18, 30], 'hamster:3': [44, 39, 25, 34], 'hamster:3:b': [41, 37, 18, 32],
    'hamster:dig:0': [48, 37, 17, 32], 'hamster:dig:0:b': [45, 39, 28, 34], 'hamster:dig:1': [51, 37, 20, 32], 'hamster:dig:1:b': [45, 39, 28, 34],
    'hamster:dig:2': [54, 37, 23, 32], 'hamster:dig:2:b': [45, 39, 28, 34], 'hamster:dig:3': [56, 39, 25, 34], 'hamster:dig:3:b': [51, 39, 28, 34],
    'hamster:daze:0': [35, 41, 17, 36], 'hamster:daze:0:b': [36, 41, 19, 36], 'hamster:daze:1': [39, 41, 21, 36], 'hamster:daze:1:b': [36, 41, 19, 36],
    'hamster:daze:2': [42, 41, 24, 36], 'hamster:daze:2:b': [36, 41, 19, 36], 'hamster:daze:3': [44, 41, 26, 36], 'hamster:daze:3:b': [42, 41, 19, 36],
  };
  /* BOX-END */

  // ---------- drawing helpers ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fill = (col) => { c.fillStyle = col; };
  const ink = (col, w) => { c.strokeStyle = col; c.lineWidth = w; };
  const circle = (x, y, r) => { c.beginPath(); c.arc(x, y, Math.abs(r), 0, TAU); c.fill(); };
  const ring = (x, y, r) => { c.beginPath(); c.arc(x, y, Math.abs(r), 0, TAU); c.stroke(); };
  const oval = (x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); c.fill(); };
  const line = (x0, y0, x1, y1) => { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
  const curve = (x0, y0, cx, cy, x1, y1) => { c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cx, cy, x1, y1); c.stroke(); };
  function rrect(x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  const rbox = (x, y, w, h, r) => { rrect(x, y, w, h, r); c.fill(); };
  function tri(x0, y0, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x2, y2); c.closePath(); c.fill(); }
  // p = flat list x0, y0, x1, y1, ...
  function shape(p) { c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); c.fill(); }
  function star4(x, y, r) {
    const q = r * 0.32;
    shape([x, y - r, x + q, y - q, x + r, y, x + q, y + q, x, y + r, x - q, y + q, x - r, y, x - q, y - q]);
  }
  // lightning bolt, top at (x, y)
  function bolt(x, y, s) {
    shape([x + 2 * s, y, x - 3 * s, y + 7 * s, x, y + 7 * s, x - 2 * s, y + 13 * s, x + 4 * s, y + 5 * s, x + 1 * s, y + 5 * s]);
  }
  // a soft body part: a dark rim at the bottom right, the main colour on top (light from the upper left)
  function blob(x, y, rx, ry, main, dark, rot = 0) {
    const rim = Math.max(1.1, Math.min(rx, ry) * 0.09);
    fill(dark); oval(x, y, rx, ry, rot);
    fill(main); oval(x - rim * 0.45, y - rim * 0.6, rx - rim, ry - rim, rot);
  }
  const shine = (x, y, rx, ry) => { fill('rgba(255,255,255,0.4)'); oval(x, y, rx, ry, -0.5); };
  function ball(x, y, r, main, dark) { blob(x, y, r, r, main, dark); shine(x - r * 0.4, y - r * 0.5, r * 0.3, r * 0.16); }
  // draws f() scaled by s around (x, y) and turned by rot
  function at(x, y, s, f, rot = 0) { c.save(); c.translate(x, y); if (rot) c.rotate(rot); c.scale(s, s); f(); c.restore(); }
  // a spiky outline: n spikes around (x, y), radii r0 (valleys) and r1 (tips), flattened by ky
  function spikes(x, y, n, r0, r1, ky, a0 = 0) {
    c.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = a0 + i / (n * 2) * TAU, r = i % 2 ? r1 : r0;
      c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * ky);
    }
    c.closePath(); c.fill();
  }
  // a wing from the root (x0, y0) to the tip (x1, y1), w wide, scalloped feathers on the side that `side` picks
  function wing(x0, y0, x1, y1, w, main, dark, side) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = -dy / l * side, ny = dx / l * side;
    const px = (t, k) => x0 + dx * t + nx * w * k, py = (t, k) => y0 + dy * t + ny * w * k;
    const T = [1, 0.8, 0.6, 0.4, 0.2, 0.03];
    c.beginPath(); c.moveTo(px(0, -0.4), py(0, -0.4));
    c.quadraticCurveTo(px(0.6, -0.8), py(0.6, -0.8), px(1, 0.2), py(1, 0.2));
    for (let i = 1; i < T.length; i++) {
      const m = (T[i - 1] + T[i]) / 2 + 0.12;
      c.quadraticCurveTo(px(m, 1.02), py(m, 1.02), px(T[i], 0.45), py(T[i], 0.45));
    }
    c.closePath(); fill(main); c.fill(); ink(dark, Math.max(1, w * 0.13)); c.stroke();
  }

  // ---------- faces ----------
  // One eye that looks toward screen right-down. lid = the skin colour for a blink, k = pupil size.
  function eye(x, y, r, lid, k = 0.52) {
    if (shut) {
      fill(lid); circle(x, y, r);
      ink(INK, Math.max(1, r * 0.36)); c.beginPath(); c.arc(x, y - r * 0.25, r * 0.75, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
      return;
    }
    fill(WHITE); circle(x, y, r);
    const px = x + r * 0.3, py = y + r * 0.2;
    fill(INK); circle(px, py, r * k);
    fill(WHITE); circle(px - r * 0.2, py - r * 0.26, r * 0.2);
  }
  // a narrow eye under a heavy lid (the moles)
  function squint(x, y, w) {
    ink(INK, 1.1);
    if (shut) { curve(x - w, y - 0.2, x, y + w * 0.7, x + w, y); return; }
    fill(WHITE); oval(x, y, w, w * 0.62);
    fill(INK); circle(x + w * 0.25, y + 0.1, w * 0.52);
    line(x - w - 0.2, y - w * 0.7, x + w + 0.3, y - w * 0.4);
  }
  // a dizzy spiral eye
  function spiral(x, y, r) {
    ink(INK, 0.9); c.beginPath();
    for (let i = 0; i <= 26; i++) { const a = i * 0.5, q = r * i / 26; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    c.stroke();
  }
  function smile(x, y, w, lw = 1.1) { ink(INK, lw); c.beginPath(); c.arc(x, y - w * 0.5, w, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke(); }
  function wobbly(x, y, w, lw = 1.1) {
    ink(INK, lw); c.beginPath(); c.moveTo(x - w, y);
    c.quadraticCurveTo(x - w * 0.5, y - w * 0.6, x, y); c.quadraticCurveTo(x + w * 0.5, y + w * 0.6, x + w, y); c.stroke();
  }
  const blush = (x, y, r) => { fill('rgba(255,90,150,0.45)'); oval(x, y, r, r * 0.6); };
  function sweat(x, y, s) { fill('#7cf2ff'); c.beginPath(); c.arc(x, y, 1.6 * s, 0, Math.PI); c.lineTo(x, y - 3.4 * s); c.closePath(); c.fill(); }
  const feet = (col, x0, x1, y = -0.9, r = 3) => { fill(col); oval(x0, y, r, r * 0.55); oval(x1, y + 0.3, r, r * 0.55); };

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // rat: a lilac rat in a tiny bandit mask (the knot shows from behind)

  const RAT = '#a9a4c8', RAT_D = '#726c96', PINK = '#ff9db0';
  // the head alone, centre (0, 0), radius 8.5: the balloon reuses it
  function ratHead() {
    const band = () => {
      c.save(); c.beginPath(); c.arc(0, 0, 8.5, 0, TAU); c.clip();
      c.rotate(B ? -0.1 : 0.1); fill('#2a2740'); c.fillRect(-10, -5.2, 20, 6.2); c.restore();
    };
    if (B) {
      fill(RAT_D); circle(-6, -7.5, 4.3); circle(4.5, -9, 4.3);
      fill(RAT); circle(-6.4, -7.9, 3.1); circle(4.1, -9.4, 3.1);
      ball(0, 0, 8.5, RAT, RAT_D); band();
      fill('#2a2740'); circle(1, -1.8, 1.9); tri(1, -1.8, 5.5, 2.6, 2.4, 3.4); tri(1, -1.8, -1.6, 3.8, -3.6, 1.6);
      return;
    }
    fill(RAT_D); circle(-5.5, -8, 4.4); circle(5, -9, 4.2);
    fill(PINK); circle(-5.2, -7.8, 2.7); circle(5.3, -8.8, 2.5);
    fill('#2a2740'); tri(-7.5, -3.5, -12.5, -5, -10.5, -0.5);
    ball(0, 0, 8.5, RAT, RAT_D); band();
    fill('#dcd8ee'); oval(5.2, 3.6, 4.2, 3);
    eye(-1.6, -2, 3, '#5d5884'); eye(5, -1.3, 2.7, '#5d5884');
    ink(INK, 0.6); line(5.5, 4.2, 1, 6.2); line(6, 4.6, 3, 7.6);
    fill(WHITE); c.fillRect(5.2, 5.2, 2, 2.3);
    fill('#ff6b8a'); circle(8.4, 2.8, 1.8);
  }
  function rat() {
    ink(PINK, 2);
    if (B) {
      feet(PINK, -6, 6);
      at(-6, -14, 1, ratHead);
      blob(2.5, -8.8, 10.5, 8.6, RAT, RAT_D); shine(-2, -13.5, 3.2, 1.6);
      c.beginPath(); c.moveTo(9, -4.5); c.quadraticCurveTo(17, -1.5, 15.5, -9); c.quadraticCurveTo(15, -13, 12.5, -11.5); c.stroke();
      return;
    }
    c.beginPath(); c.moveTo(-10, -5); c.quadraticCurveTo(-17, -2.5, -16, -10); c.quadraticCurveTo(-15.5, -14.5, -12.5, -13); c.stroke();
    feet(PINK, -7, 4);
    blob(-3, -8.8, 10.5, 8.6, RAT, RAT_D);
    at(6, -13, 1, ratHead);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // snail: a butter-yellow snail whose red shell has a white racing stripe

  function snail() {
    const M = '#ffd166', D = '#d9962b', S = '#ff6b5e', SD = '#b8343a';
    const k = B ? -1 : 1;
    const shell = (x) => {
      ball(x, -13.5, 10.2, S, SD);
      c.save(); c.beginPath(); c.arc(x, -13.5, 9.6, 0, TAU); c.clip();
      ink(WHITE, 3); curve(x - 12 * k, -15.5, x - 1 * k, -27.5, x + 9 * k, -13);
      ink(WHITE, 1); curve(x - 12 * k, -11, x - 1 * k, -22.5, x + 6 * k, -9);
      c.restore();
      ink(SD, 1.2); c.beginPath(); c.arc(x - 1.5 * k, -10, 3.4, 0.6, 5.2); c.stroke();
    };
    // the foot with a pointed tail
    fill(D); tri(-9 * k, -5.5, -15.5 * k, -1.4, -8 * k, -0.2);
    blob(1.5 * k, -3.6, 13.5, 3.9, M, D);
    if (B) {
      ink(D, 1.7); line(-12, -13, -15, -21.5); line(-9, -14, -7, -22.5);
      blob(-11, -9.5, 4.6, 6.4, M, D);
      ball(-15, -22.5, 3, M, D); ball(-7, -23.5, 3, M, D);
      shell(3);
      return;
    }
    shell(-3.5);
    ink(D, 1.7); line(9.5, -13, 7.5, -21.5); line(13, -13, 15, -20.5);
    blob(11.5, -9, 4.8, 6.6, M, D);
    eye(7.5, -23, 3.3, M); eye(15.5, -21.5, 3, M);
    blush(9.5, -8, 1.7);
    smile(13, -7.6, 2);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // beetle: a glossy blue rhino beetle with a sticking plaster on its shell. alt flip = on its back

  function beetle() {
    const M = '#3f7df0', D = '#2348a8', H = '#3d3758', HD = '#211e36', Y = '#ffd23f';
    const k = B ? -1 : 1;
    const plaster = (x, y) => { c.save(); c.translate(x, y); c.rotate(-0.5 * k); fill('#ffe2b8'); rbox(-3.4, -1.3, 6.8, 2.6, 1.2); fill('#e0a878'); c.fillRect(-1, -1.3, 2, 2.6); c.restore(); };
    const horn = (x, y) => {
      c.save(); c.translate(x, y); c.scale(k, 1);
      ink(HD, 2.6); curve(0, 0, 5, -3.5, 4.2, -9.5);
      ink(HD, 1.8); line(4.2, -9.5, 1.6, -12); line(4.2, -9.5, 7.2, -11.5);
      c.restore();
    };
    if (alt === 'flip') {
      // belly up: the shell is a rim on the ground, six legs wave in the air
      fill(D); oval(0, -5.6, 13, 6); fill(M); oval(-0.6, -5.2, 12.6, 5);
      ink(HD, 1.5);
      const L = [-8, -15, -11, -19, -3.5, -17, -2, -22, 1.5, -17, 4.5, -21.5];
      for (let i = 0; i < L.length; i += 4) { c.beginPath(); c.moveTo(L[i] * k - 1 * k, -9); c.lineTo(L[i] * k, L[i + 1]); c.lineTo(L[i + 2] * k, L[i + 3]); c.stroke(); }
      for (let i = 0; i < L.length; i += 4) { c.beginPath(); c.moveTo((L[i] + 4) * k, -6.5); c.lineTo((L[i] + 5.5) * k, L[i + 1] + 3.5); c.lineTo((L[i + 2] + 7.5) * k, L[i + 3] + 5); c.stroke(); }
      blob(-1 * k, -8.2, 10.5, 5.4, '#e9cf9c', '#b8935e');
      ink('#b8935e', 0.9); for (let i = -1; i <= 1; i++) curve((i * 4.5 - 2) * k, -12.6, (i * 4.5 - 0.5) * k, -8.5, (i * 4.5 - 2) * k, -4.2);
      ball(11 * k, -6.4, 5.4, H, HD);
      c.save(); c.translate(13.5 * k, -3.6); c.scale(k, 1); ink(HD, 2.4); curve(0, 0, 5.5, 0.5, 6.5, -3.5); ink(HD, 1.6); line(6.5, -3.5, 5, -6); line(6.5, -3.5, 9, -4.6); c.restore();
      if (!B) {
        eye(9.5, -8.2, 2.7, H, 0.34); eye(14, -6.6, 2.3, H, 0.34);
        fill(INK); oval(12, -3, 1.3, 1);
        sweat(4.5, -24, 0.9);
      }
      return;
    }
    ink(HD, 1.6);
    if (B) {
      horn(-11, -15);
      ball(-9, -11.5, 5.6, H, HD);
      line(-11, -5, -15.5, -1); line(-4, -3, -6, 0.6); line(8, -3, 11, 0.4); line(12, -7, 16.5, -4);
      blob(2, -10, 11.6, 9, M, D); shine(-3, -15.5, 3.4, 1.6);
      ink(D, 1.1); curve(-7, -16.5, 3, -12, 6, -1.6);
      fill(Y); circle(-3, -8, 1.7); circle(8.5, -11.5, 1.7); circle(-1.5, -3.6, 1.3);
      plaster(6, -15.5);
      return;
    }
    line(-11, -6, -15.5, -2); line(-9, -4, -11, 0.4); line(-1, -3, -1.5, 0.8); line(6, -3.5, 8.5, 0.4);
    blob(-2.5, -10, 11.6, 9, M, D); shine(-7.5, -15.5, 3.4, 1.6);
    ink(D, 1.1); curve(-13.5, -11.5, -4, -20.5, 8, -11.5);
    fill(Y); circle(-6.5, -8, 1.7); circle(1.5, -6, 1.7); circle(-9.5, -3.6, 1.3);
    plaster(-2, -14.5);
    horn(11, -12);
    ball(9.5, -8, 6, H, HD);
    eye(8, -9.6, 2.8, H); eye(13, -8.2, 2.4, H);
    smile(11.6, -4.6, 1.6, 0.9);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // hedgehog: carries a stolen apple on its spikes. alt ball = curled up

  function hedgehog() {
    const M = '#8a6246', D = '#5c3f2c', T = '#c9a27a', F = '#f6dcb4', FD = '#c9a074';
    const apple = (x, y) => {
      ink('#5a3a22', 1); line(x, y - 3.4, x + 1, y - 5.6);
      fill('#6fcf4a'); oval(x + 2.6, y - 5, 2, 1, -0.4);
      ball(x, y, 4, '#ff4d5e', '#b3243a');
    };
    const coat = (x, y, rx, n) => {
      fill(D); spikes(x, y, n, rx - 2.6, rx + 1.2, 0.86, 0.2);
      fill(M); oval(x - 0.5, y - 0.6, rx - 3, (rx - 3) * 0.84);
      ink(T, 1);
      const P = [-5, -3, 0, -5, 4.5, -2, -3, 2, 2.5, 3, -6.5, 1.5, 6, 2.5];
      for (let i = 0; i < P.length; i += 2) line(x + P[i], y + P[i + 1], x + P[i] - (B ? -1.6 : 1.6), y + P[i + 1] - 1.9);
    };
    if (alt === 'ball') {
      coat(0, -12.5, 12.6, 13);
      apple(-4, -24);
      if (!B) {
        fill(F); oval(4.5, -9, 4.6, 3);
        if (shut) { ink(INK, 0.9); line(1.6, -9.2, 3.8, -9); line(5.6, -8.8, 7.8, -8.6); }
        else { fill(INK); circle(2.8, -9.2, 1.2); circle(6.6, -8.8, 1.2); fill(WHITE); circle(2.5, -9.6, 0.4); circle(6.3, -9.2, 0.4); }
      }
      return;
    }
    if (B) {
      feet(F, -7, 6);
      fill(FD); circle(-11.5, -16, 2.6); fill(F); circle(-11.8, -16.3, 1.7);
      blob(-10, -10, 5.5, 5, F, FD);
      coat(2, -11, 13, 13);
      apple(3, -23.5);
      return;
    }
    feet(F, -7, 5);
    coat(-3.5, -11.5, 13, 13);
    apple(-7, -24);
    blob(7.5, -8.5, 7.6, 6.4, F, FD);
    fill(F); tri(11, -11.5, 17, -6.8, 11, -3.6);
    fill(FD); circle(1.8, -14.6, 2.6); fill('#ffb3a1'); circle(1.6, -14.6, 1.5);
    eye(6, -11, 2.8, F); eye(11.6, -9.8, 2.4, F);
    blush(5, -6.4, 1.8);
    fill(INK); circle(16.2, -7, 1.9); fill(WHITE); circle(15.7, -7.6, 0.55);
    smile(11, -5, 1.6, 0.9);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // frog: a turquoise frog that cannot keep its tongue in. alt hop = stretched in mid-hop

  function frog() {
    const M = '#27c4a8', D = '#12806f', L = '#ffe680', SP = '#149c86';
    const k = B ? -1 : 1;
    if (alt === 'hop') {
      c.save(); c.scale(k, 1);
      // trailing legs with flat feet
      ink(D, 3.4); c.beginPath(); c.moveTo(-6, -11); c.lineTo(-14, -6.5); c.lineTo(-17, -1.5); c.moveTo(-3, -9); c.lineTo(-9.5, -3.5); c.lineTo(-11, 0); c.stroke();
      ink(M, 1.8); c.beginPath(); c.moveTo(-6, -11); c.lineTo(-14, -6.5); c.lineTo(-17, -1.5); c.moveTo(-3, -9); c.lineTo(-9.5, -3.5); c.lineTo(-11, 0); c.stroke();
      fill(D); oval(-18.5, -0.8, 3.4, 1.5, -0.3); oval(-12.5, 0.6, 3.4, 1.5, -0.3);
      blob(2, -15, 13, 7.4, M, D, -0.42);
      c.restore();
      if (B) {
        fill(SP); circle(-2, -17, 1.8); circle(3.5, -13, 1.5); circle(-6.5, -14, 1.2);
        ball(-12.5, -24, 4, M, D); ball(-6, -26, 4.2, M, D);
        ink(D, 2.4); line(-9, -17, -15, -15.5);
        return;
      }
      fill(L); c.save(); c.beginPath(); c.ellipse(1.6, -15.6, 11.8, 6.2, -0.42, 0, TAU); c.clip(); oval(7, -11, 9.5, 5, -0.42); c.restore();
      ink(D, 2.6); line(9, -13, 15.5, -9.5); line(4, -10, 9.5, -6);
      ball(5.5, -25.5, 4.6, M, D); ball(13, -23, 4.2, M, D);
      eye(6, -25.6, 3.4, M); eye(13.5, -23, 3.1, M);
      fill('#3a0d22'); oval(12.5, -16.5, 3.4, 2.2, 0.5); fill('#ff6b8a'); oval(13.4, -15.6, 2, 1.2, 0.5);
      return;
    }
    if (B) {
      fill(D); oval(-9, -1, 4.4, 1.8); oval(11.5, -1.4, 4.6, 1.8);
      ball(-9, -18.5, 4.8, M, D); ball(0.5, -20, 5, M, D);
      blob(0, -10, 12.2, 9.4, M, D);
      blob(9.5, -5, 5.6, 4.4, M, D); blob(-8, -4.4, 5, 4, M, D);
      fill(SP); circle(-2, -13.5, 2.1); circle(4.5, -10, 1.7); circle(-5.5, -8.5, 1.4); circle(1, -6, 1.2);
      shine(-5, -16, 3, 1.4);
      return;
    }
    fill(D); oval(-12, -1, 4.6, 1.8); oval(4, -0.8, 3.6, 1.6); oval(11.5, -1.6, 3.4, 1.5);
    ball(-0.5, -19.5, 5.2, M, D); ball(9, -18.5, 4.8, M, D);
    blob(0, -10, 12.2, 9.4, M, D);
    fill(L); c.save(); c.beginPath(); c.ellipse(-0.5, -10.6, 11, 8.2, 0, 0, TAU); c.clip(); oval(6.5, -5, 8, 5.4); c.restore();
    blob(-9.5, -4.6, 5.6, 4.4, M, D);
    fill(SP); circle(-7, -13, 1.7); circle(-10, -9.5, 1.2);
    eye(0, -19.6, 3.8, M); eye(9.5, -18.5, 3.4, M);
    ink(INK, 1.1); curve(-3.5, -11.5, 6, -7.5, 12, -11.5);
    fill('#ff6b8a'); oval(9.6, -8.4, 1.9, 2.7, -0.3); ink('#d9416a', 0.6); line(9.5, -9.6, 9.9, -7.4);
    blush(-2.5, -9, 1.8);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // worm: a pink bookworm in round glasses

  function worm() {
    const M = '#ff9db8', D = '#d65f88', BAND = '#ffd0dc';
    const k = B ? -1 : 1;
    const S = [-14.5, -3, 3, -10.5, -4, 3.8, -6, -4.6, 4.3, -1, -5, 4.6, 3.8, -6.4, 4.8, 6.6, -11, 5];
    const body = () => {
      for (let i = 0; i < S.length; i += 3) blob(S[i] * k, S[i + 1], S[i + 2], S[i + 2], i === 9 ? BAND : M, i === 9 ? '#e89ab0' : D);
    };
    if (B) {
      ball(-9.5, -18.5, 7, M, D);
      ink(INK, 1); curve(-16, -19.5, -9.5, -16.5, -3, -20.5);
      fill('#bfeaff'); oval(-16.2, -19.4, 1, 2); oval(-2.8, -20.4, 1, 2);
      c.save(); c.scale(1, 1);
      for (let i = S.length - 3; i >= 0; i -= 3) blob(S[i] * k, S[i + 1], S[i + 2], S[i + 2], i === 9 ? BAND : M, i === 9 ? '#e89ab0' : D);
      c.restore();
      return;
    }
    body();
    ball(9.5, -18.5, 7, M, D);
    eye(7.6, -19.4, 2.7, M); eye(13.6, -18.2, 2.4, M);
    ink(INK, 1); ring(7.6, -19.4, 3.5); ring(13.8, -18.2, 3.1); line(2.6, -20.6, 4.2, -20.2);
    smile(11, -14.6, 1.8, 0.9);
    blush(5.6, -14.6, 1.6);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // chick: still wears half its eggshell as a hat

  function chick() {
    const M = '#ffe066', D = '#dba126', O = '#ff9a2e', W = '#f2c53a';
    const hat = (x, y, rot) => {
      c.save(); c.translate(x, y); c.rotate(rot);
      const p = () => { c.beginPath(); c.arc(0, 0, 7.4, Math.PI, 0); c.lineTo(5, 2.6); c.lineTo(2.6, 0.2); c.lineTo(0, 2.8); c.lineTo(-2.6, 0.2); c.lineTo(-5, 2.6); c.closePath(); c.fill(); };
      fill('#c9c2b0'); p(); c.translate(-0.5, -0.6); c.scale(0.9, 0.9); fill('#fffaf0'); p();
      fill('rgba(255,255,255,0.9)'); oval(-3, -4, 1.8, 1, -0.5);
      c.restore();
    };
    ink(O, 1.5);
    if (B) {
      line(-4, -2.5, -4.5, 0); line(4, -2.5, 4.5, 0.2);
      blob(-9.5, -9, 3.6, 5, W, D, 0.3); blob(10, -8.5, 3.6, 5, W, D, -0.3);
      ball(0, -11.5, 10.6, M, D);
      fill(D); tri(3, -8, 11.5, -3, 3.5, -3); fill(W); tri(2, -9, 9.5, -4.6, 2, -4.4); tri(5, -9.5, 11, -7.6, 5, -5.5);
      hat(-2, -19.5, 0.16);
      return;
    }
    line(-3, -2.5, -4, 0); line(4, -2.5, 5, 0.2); line(-4, 0, -1.6, 0.4); line(5, 0.2, 7.4, 0.2);
    ball(0, -11.5, 10.6, M, D);
    blob(-6.5, -9, 4.4, 5.4, W, D, 0.5);
    eye(2.4, -13.6, 3.1, M); eye(9, -12.4, 2.6, M);
    fill('#e0741a'); tri(4.6, -10.6, 12.4, -6.6, 5.4, -5.4); fill(O); tri(4.6, -10.6, 12.4, -6.9, 5.2, -7.4);
    blush(0.4, -8.6, 1.8);
    hat(-0.5, -19.5, -0.14);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // moles: the sapper squints under a helmet lamp, the Tunnel Tyrant wears a crown that is too small

  const MOLE = '#6d5f85', MOLE_D = '#43375c', PAW = '#f7b8c8', PAW_D = '#c9839a';
  // the head alone, centre (0, 0), radius 8.5
  function moleHead(M, D, cross) {
    ball(0, 0, 8.5, M, D);
    if (B) return;
    blob(6.4, 3, 4.6, 3.6, PAW, PAW_D);
    squint(-1.8, -0.7, 2.5); squint(4.6, 0, 2.2);
    if (cross) { ink(INK, 1.3); line(-4.8, -5.2, 0.6, -3.2); line(7.4, -3.4, 3.2, -2.6); }
    fill(WHITE); c.fillRect(4.6, 5.6, 1.8, 2);
    fill('#ff5d83'); circle(10, 2.8, 2.1); fill('rgba(255,255,255,0.7)'); circle(9.4, 2.1, 0.6);
  }
  // a paw with three claws that point along (dx, dy)
  function claw(x, y, dx, dy, s = 1) {
    c.save(); c.translate(x, y); c.rotate(Math.atan2(dy, dx)); c.scale(s, s);
    fill('#fff3dc'); tri(1, -2.6, 6, -2.2, 1.6, -0.8); tri(1.6, -1, 6.8, 0, 1.6, 1); tri(1, 2.6, 6, 2.2, 1.6, 0.8);
    blob(0, 0, 2.8, 3, PAW, PAW_D);
    c.restore();
  }
  function helmet() {
    const Y = '#ffd23f', YD = '#c98f10';
    const dome = (rx, ry) => { c.beginPath(); c.ellipse(0, 0, rx, ry, 0, Math.PI, 0); c.closePath(); c.fill(); };
    c.save(); c.translate(-0.6, -4); c.rotate(B ? -0.1 : 0.1);
    fill(YD); dome(9.2, 7.2); fill(Y); c.save(); c.translate(-0.5, -0.4); dome(8.2, 6.2); c.restore();
    ink(YD, 2); line(-9.4, 0, 9.6, 0);
    fill('rgba(255,255,255,0.55)'); oval(-4, -4, 2.4, 1.1, -0.5);
    if (B) { fill('#ff5a5f'); rbox(-2.4, -3.6, 4.8, 2.2, 1); }
    else {
      fill('rgba(255,244,160,0.4)'); circle(6, -3.6, 4.6);
      fill('#4a4f6e'); circle(6, -3.6, 2.9); fill('#fff7c0'); circle(6.2, -3.5, 1.9); fill(WHITE); circle(5.6, -4.1, 0.7);
    }
    c.restore();
  }
  function crown() {
    c.save(); c.translate(B ? 1.4 : -1.4, -8.2); c.rotate(B ? 0.26 : -0.26); c.scale(0.72, 0.72);
    fill('#b8860b'); shape([-3, 1, -3.6, -3.2, -1.5, -1.2, 0, -4.4, 1.5, -1.2, 3.6, -3.2, 3, 1]);
    fill('#ffd23f'); shape([-2.4, 0.6, -2.9, -2.2, -1.3, -0.5, 0, -3.4, 1.3, -0.5, 2.9, -2.2, 2.4, 0.6]);
    fill('#ff2a4d'); circle(0, -0.5, 0.75); fill('#fff6c0'); circle(0, -4.2, 0.6); circle(-3.5, -3.1, 0.5); circle(3.5, -3.1, 0.5);
    c.restore();
  }
  // a heap of dug soil, rx wide
  function mound(rx, ry) {
    const M = '#8a5a36', D = '#5a3620', L = '#a8744a';
    fill(D); c.beginPath(); c.ellipse(0, -1, rx, ry * 0.5, 0, 0, Math.PI); c.ellipse(0, -1, rx, ry, 0, Math.PI, TAU); c.fill();
    fill(M); c.beginPath(); c.ellipse(-rx * 0.03, -1.6, rx * 0.93, ry * 0.38, 0, 0, Math.PI); c.ellipse(-rx * 0.03, -1.6, rx * 0.93, ry * 0.9, 0, Math.PI, TAU); c.fill();
    fill(L); circle(-rx * 0.55, -ry * 0.42, rx * 0.07); circle(rx * 0.5, -ry * 0.2, rx * 0.06); circle(-rx * 0.2, ry * 0.05, rx * 0.05);
    fill(D); circle(rx * 0.25, -ry * 0.05, rx * 0.06); circle(-rx * 0.7, -ry * 0.05, rx * 0.05); circle(rx * 0.72, ry * 0.0, rx * 0.045);
  }
  function sapper() {
    const head = () => { moleHead(MOLE, MOLE_D, false); helmet(); };
    if (alt === 'dig') {
      mound(16.5, 8);
      if (B) { claw(-11.5, -6.5, -0.3, 1); claw(11, -6, 0.3, 1); at(-0.5, -12, 1, head); return; }
      at(0.5, -12, 1, head);
      claw(-10.5, -5, 0.2, 1); claw(11.5, -4.5, 0.6, 1);
      return;
    }
    if (B) {
      feet(PAW, -6, 6);
      claw(-10, -6, -0.8, 1, 0.9);
      at(-5.5, -13.5, 1, head);
      blob(2.5, -8.8, 10.8, 8.8, MOLE, MOLE_D); shine(-2, -13.5, 3.2, 1.5);
      ink(PAW, 1.8); line(10.5, -4.5, 14.5, -2.5);
      claw(12.5, -7.5, 0.8, 1, 0.9);
      return;
    }
    feet(PAW, -7, 3.5);
    blob(-3, -8.8, 10.8, 8.8, MOLE, MOLE_D);
    claw(-9, -4, 0.4, 1, 0.9);
    at(5.5, -12.5, 1, head);
    claw(2, -2.8, 0.8, 0.7, 0.9);
  }
  function tyrant() {
    const M = '#5b4a7a', D = '#372a52', RED = '#d6304a', RED_D = '#96203a';
    const head = () => { moleHead(M, D, true); crown(); };
    // the ermine collar: white puffs with black tips along a curve
    const ermine = (x0, y0, cx, cy, x1, y1, n, r) => {
      const P = [];
      for (let i = 0; i < n; i++) { const t = i / (n - 1), u = 1 - t; P.push(u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1); }
      fill('#c9cbe0'); for (let i = 0; i < P.length; i += 2) circle(P[i] + 0.6, P[i + 1] + 0.8, r);
      fill('#fffdf5'); for (let i = 0; i < P.length; i += 2) circle(P[i], P[i + 1], r - 0.5);
      fill(INK); for (let i = 2; i < P.length - 2; i += 4) oval(P[i], P[i + 1] + 0.5, 0.9, 1.5);
    };
    if (alt === 'dig') {
      mound(36, 16);
      if (B) {
        claw(-25, -13, -0.3, 1, 2); claw(25, -12, 0.3, 1, 2);
        at(-1, -27, 2.05, head);
        ermine(-18, -15, -1, -5, 17, -14, 7, 4.2);
        return;
      }
      at(1, -27, 2.05, head);
      ermine(-17, -14, 1, -4, 18, -13, 7, 4.2);
      claw(-24, -10, 0.2, 1, 2); claw(27, -9, 0.6, 1, 2);
      return;
    }
    if (B) {
      feet(PAW, -14, 16, -1.6, 6.5);
      claw(-27, -20, -0.8, 1, 1.9);
      at(-11, -45, 2.05, head);
      claw(30, -22, 0.8, 1, 1.9);
      // the cape covers the whole back
      fill(RED_D); shape([-16, -40, 16, -40, 32, -6, 24, -1, 5, 1.5, -16, -1, -24, -6]);
      fill(RED); shape([-15, -39, 14.5, -39, 29.5, -7, 22, -3, 5, -0.5, -15, -3, -22.5, -7.5]);
      ink(RED_D, 1.4); line(-6, -30, -10, -6); line(8, -30, 13, -5);
      fill('#ffd23f'); shape([-3, -15, -4.4, -22.5, -0.6, -19, 2.5, -24.5, 5.6, -19, 9.4, -22.5, 8, -15]);
      ermine(-23, -5.5, 4, 3.5, 30.5, -5, 9, 4.2);
      ermine(-17, -38, 1, -31, 17, -38, 6, 4.6);
      return;
    }
    // the cape hangs behind
    fill(RED_D); shape([-14, -42, -34, -6, -27, 0.5, -6, 0.5, 6, -30]);
    fill(RED); shape([-14, -40, -31.5, -7, -26, -1.5, -8, -1.5, 3, -30]);
    ermine(-32, -5, -28, 2, -16, 0, 4, 3.8);
    feet(PAW, -11, 10, -1.6, 6.5);
    blob(-3, -22, 24.5, 21.5, M, D);
    fill('#8776a8'); c.save(); c.beginPath(); c.ellipse(-4, -23, 22, 19.4, 0, 0, TAU); c.clip(); oval(7, -14, 15, 14); c.restore();
    claw(-17, -12, 0.3, 1, 1.9);
    at(11, -43, 2.05, head);
    ermine(-12, -37, 4, -22, 26, -26, 7, 4.4);
    claw(15, -11, 0.8, 0.7, 2.1);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // balloon: a bandit rat in a basket under a patched balloon. Flyer: (0, 0) = the bottom of the basket

  function balloon() {
    const R = '#ff5a5f', RD = '#b8303f', CR = '#fff1c9', W = '#c98a4a', WD = '#8a5a2c';
    const k = B ? -1 : 1;
    const env = () => { c.beginPath(); c.arc(0, -40, 14.5, 0.75 * Math.PI, 0.25 * Math.PI); c.lineTo(4, -22.5); c.lineTo(-4, -22.5); c.closePath(); };
    ink(WD, 1); line(-4, -22.5, -6.5, -11); line(4, -22.5, 6.5, -11);
    fill(RD); env(); c.fill();
    c.save(); env(); c.clip();
    fill(R); oval(-0.8, -41, 14, 19.5);
    fill(CR); oval(-0.8, -40, 9.6, 20); fill(R); oval(-0.8, -40, 4.6, 20);
    fill('rgba(27,31,51,0.14)'); c.beginPath(); c.arc(-6, -45, 17, 0, TAU); c.rect(20, -60, -40, 44); c.fill('evenodd');
    // the patches
    c.save(); c.translate(-6.5 * k, -37); c.rotate(0.25 * k); fill('#5aa0e8'); c.fillRect(-3.4, -3.4, 6.8, 6.8); ink(INK, 0.7); c.setLineDash([1.2, 1.2]); c.strokeRect(-2.4, -2.4, 4.8, 4.8); c.restore();
    c.save(); c.translate(7 * k, -46); c.rotate(-0.3 * k); fill('#9be870'); c.fillRect(-2.4, -2.2, 4.8, 4.4); ink(INK, 0.7); line(-1.4, -1.2, 1.4, 1.2); line(-1.4, 1.2, 1.4, -1.2); c.restore();
    c.restore();
    shine(-6.5, -49, 3.4, 1.6);
    fill(RD); rbox(-4.6, -23.6, 9.2, 2.6, 1);
    // the pilot, then the front of the basket
    at(0.6 * k, -14.2, 0.66, ratHead);
    fill(WD); rbox(-8, -11.5, 16, 11.5, 3); fill(W); rbox(-8, -11.5, 15, 10.5, 2.6);
    ink(WD, 0.8); line(-7, -6.5, 6.4, -6.5); line(-6.4, -3.2, 6, -3.2); line(-3.5, -9, -3.5, -1.4); line(0.6, -9, 0.6, -1.2); line(4.4, -9, 4.4, -1.6);
    fill(WD); rbox(-8.8, -12.6, 17.6, 3, 1.5); fill('#e0a868'); rbox(-8.4, -12.6, 16.4, 1.8, 0.9);
    // a sandbag on the side
    ink(WD, 0.8); line(8.2 * k, -10, 9.6 * k, -7); fill('#b8935e'); oval(9.8 * k, -5.2, 2.2, 2.7); fill('#e9cf9c'); oval(9.5 * k, -5.6, 1.5, 1.9);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // duck: a mallard flying ace with goggles pushed up on its forehead. Flyer

  function duck() {
    const M = '#b07a52', D = '#74492e', G = '#2f9e6b', GD = '#1c6b47', O = '#ffb02e';
    c.translate(0, -1);
    if (B) {
      wing(-2, -15, 12, -29, 8.5, '#8f6242', D, -1);
      ball(-8.5, -16.5, 6.4, G, GD);
      c.save(); c.beginPath(); c.arc(-8.5, -16.5, 6.6, 0, TAU); c.clip(); fill('#7a4a26'); oval(-7.5, -21.5, 9, 6.4, -0.1); fill('#a0673a'); oval(-8, -22.4, 8, 5.4, -0.1); c.restore();
      ink('#3d2412', 1.2); curve(-14.6, -17.6, -8.5, -14.8, -2.4, -18.6);
      fill(WHITE); oval(-5.4, -12.4, 4.6, 3.6, 0.5);
      blob(1.5, -9.5, 10.4, 7, M, D, 0.3);
      fill(D); tri(7, -8, 16, -3, 8, -3.4); fill('#fff8e6'); tri(6, -9.5, 14.5, -5.6, 6.4, -5.4);
      fill(O); oval(4, -2.6, 2.2, 1.2); oval(8.6, -2.2, 2.2, 1.2);
      wing(0, -8, -15, -1.5, 8.5, M, D, 1);
      return;
    }
    wing(1, -15, 14, -28.5, 8.5, '#8f6242', D, -1);
    fill(D); tri(-8, -17, -16.5, -19.5, -11, -10.5);
    fill(O); oval(-9, -3.4, 2.4, 1.3); oval(-5, -2.4, 2.4, 1.3);
    blob(-2, -10, 10.4, 7, M, D, 0.3);
    fill('#f1dcb8'); oval(3.4, -7.4, 5.4, 3.6, 0.3);
    wing(-3, -9, -17, -2.5, 8.5, M, D, 1);
    fill(WHITE); oval(5.4, -12, 4.8, 3.8, -0.5);
    ball(8.5, -15.5, 6.6, G, GD);
    blob(14.6, -12.4, 4.8, 2.5, '#ffc83d', '#d98a10', 0.4);
    eye(7.4, -15.6, 2.7, G); eye(12.4, -14.6, 2.3, G);
    // goggles
    c.save(); c.beginPath(); c.arc(8.5, -15.5, 6.8, 0, TAU); c.clip(); fill('#7a4a26'); oval(7.4, -21.6, 9, 4.6, 0.12); fill('#a0673a'); oval(7, -22.4, 8, 4, 0.12); c.restore();
    fill('#3d2412'); circle(6, -20.4, 2.4); circle(10.8, -19.6, 2.1);
    fill('#39c6ee'); circle(6, -20.4, 1.5); circle(10.8, -19.6, 1.3);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // hen: Mama Hen, huge and cross, still in her curlers and pearls

  function hen() {
    const M = '#d9743a', D = '#93431f', L = '#f6c78a', W = '#bd5c2a', O = '#ffa51f', OD = '#c9700a', RED = '#ff3b4f';
    const k = B ? -1 : 1;
    const curler = (x, y, rot) => {
      c.save(); c.translate(x, y); c.rotate(rot);
      fill('#c94aa8'); rbox(-5.6, -3.4, 11.2, 6.8, 3.2); fill('#ff8ade'); rbox(-5.6, -3.6, 10.4, 5.8, 2.8);
      ink('#c94aa8', 0.9); line(-2.6, -3, -2.6, 1.8); line(0.4, -3, 0.4, 1.8); line(3.2, -3, 3.2, 1.8);
      fill('rgba(255,255,255,0.6)'); rbox(-4, -2.8, 6, 1.2, 0.6);
      c.restore();
    };
    const leg = (x) => { ink(OD, 3.6); line(x, -7, x, -1.5); ink(O, 2.4); line(x, -7, x, -1.5); line(x, -1.5, x - 4 * k, 0.4); line(x, -1.5, x + 4.6 * k, -0.4); line(x, -1.5, x + 1.5 * k, 1.4); };
    const comb = () => { fill('#b3202f'); circle(17.5 * k, -65.4, 4.4); circle(23 * k, -62.4, 4.2); circle(26.6 * k, -57.4, 3.6); fill(RED); circle(17 * k, -65.9, 3.5); circle(22.5 * k, -62.9, 3.3); circle(26.2 * k, -57.9, 2.8); };
    leg(-10 * k); leg(9 * k);
    if (B) {
      comb();
      ball(-13, -50, 14.6, M, D);
      curler(-19, -59.5, 0.5); curler(-7.5, -62.5, 0.1); curler(-20.5, -50, 0.5); curler(-8.5, -53, 0.1);
      ink('#7a3a6e', 0.7); curve(-27, -55, -13, -70, 0, -57);
      blob(-19, -25, 8, 14, W, D, 0.25);
      blob(3, -25, 26.5, 23.5, M, D);
      blob(26, -24, 7, 13, W, D, -0.25);
      // the tail fan and the fluffy knickers
      for (let i = 0; i < 5; i++) {
        const a = -2.5 + i * 0.5;
        c.save(); c.translate(8, -20); c.rotate(a); blob(13, 0, 12, 5.4, i % 2 ? '#a84f24' : W, D); c.restore();
      }
      fill('#e8d9c0'); circle(1, -12, 6.6); circle(9.6, -9.6, 7); circle(17.4, -12.6, 6);
      fill('#fff8ea'); circle(0.4, -12.8, 5.6); circle(9, -10.4, 6); circle(16.8, -13.4, 5); circle(8, -15, 6);
      return;
    }
    // tail feathers
    c.save(); c.translate(-20, -34);
    for (let i = 0; i < 3; i++) { c.save(); c.rotate(-2.55 + i * 0.5); blob(12, 0, 11.5, 5.4, i % 2 ? '#a84f24' : W, D); c.restore(); }
    c.restore();
    blob(-3, -25, 26.5, 23.5, M, D);
    fill(L); c.save(); c.beginPath(); c.ellipse(-4, -26, 24.4, 21.4, 0, 0, TAU); c.clip(); oval(10, -19, 14, 16); c.restore();
    shine(-17, -39, 6, 2.6);
    comb();
    ball(13, -50, 14.6, M, D);
    curler(1.5, -60.5, -0.75); curler(10, -65.4, -0.2); curler(-2.4, -51, -1.3);
    // pearls
    fill('#c9cbe0'); for (let i = 0; i < 8; i++) circle(-1 + i * 3.9 + 0.4, -37.6 + Math.sin(i / 7 * Math.PI) * 6.4 + 0.5, 1.9);
    fill('#fffdf5'); for (let i = 0; i < 8; i++) circle(-1 + i * 3.9, -37.6 + Math.sin(i / 7 * Math.PI) * 6.4, 1.6);
    // the wing on her hip
    blob(-13, -22, 9.6, 14, W, D, 0.5);
    ink(D, 1.2); curve(-19, -16, -15, -12, -10, -14); curve(-16.5, -22, -12, -18.5, -7.5, -21);
    // the face
    eye(9, -51.5, 4.8, M); eye(20.6, -49.6, 4.2, M);
    ink(INK, 2.4); line(3.6, -58.6, 13, -55.2); line(26, -56, 18.4, -54.6);
    fill(RED); oval(13.6, -36.4, 2.6, 3.8); oval(18, -35.6, 2.3, 3.4);
    fill(OD); shape([10.6, -46, 25.6, -40.6, 12.6, -38]); fill(O); shape([10.6, -46, 25.6, -41, 12, -41.6]);
    blush(3.4, -44.6, 2.8); blush(25.4, -45.4, 2.2);
    // the cross mark
    ink('#ff2a4d', 1.5);
    c.save(); c.translate(-9, -63);
    curve(-3.4, -1.2, -1.2, -1.2, -1.2, -3.4); curve(3.4, -1.2, 1.2, -1.2, 1.2, -3.4); curve(-3.4, 1.2, -1.2, 1.2, -1.2, 3.4); curve(3.4, 1.2, 1.2, 1.2, 1.2, 3.4);
    c.restore();
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // goose: the Thunder Goose wears a storm cloud as a ruff. Flyer

  function goose() {
    const M = '#f4f6ff', D = '#aab3d4', O = '#ff9a2e', OD = '#c9620a', CL = '#6a7096', CLD = '#3f4468';
    const k = B ? -1 : 1;
    const neck = (x0, y0, cx, cy, x1, y1) => { ink(D, 11.5); curve(x0, y0, cx, cy, x1, y1); ink(M, 9); curve(x0 - 0.6, y0 - 0.6, cx - 0.6, cy - 0.6, x1 - 0.6, y1 - 0.6); };
    const ruff = (x, y) => {
      const P = [-9, 1, 6.4, -2.5, 5, 7.4, 6, 3.5, 7, 9, -4, 6, 2, -5.5, 6.4, -8, -6.5, 5.4];
      fill(CLD); for (let i = 0; i < P.length; i += 3) circle(x + P[i] * k + 0.8, y + P[i + 1] + 1, P[i + 2]);
      fill(CL); for (let i = 0; i < P.length; i += 3) circle(x + P[i] * k, y + P[i + 1], P[i + 2] - 0.9);
      fill('rgba(255,255,255,0.22)'); circle(x - 9.5 * k, y - 1, 2.6); circle(x - 1 * k, y - 8, 2.4);
      fill('#b8860b'); bolt(x + 1.6 * k, y + 5.4, 0.92); fill('#ffe14a'); bolt(x + 1 * k, y + 4.6, 0.86);
    };
    c.translate(0, -2); c.scale(0.9, 0.9);
    if (B) {
      wing(0, -27, 31, -44, 16, '#dfe4f5', D, -1);
      neck(-8, -27, -11, -44, -22, -55);
      ball(-22.5, -57, 9.4, M, D);
      fill(OD); tri(-29, -58, -35.5, -54.5, -29.5, -52.5);
      blob(4, -19, 22.5, 14.5, M, D, 0.25);
      fill(D); shape([15, -19, 35, -13, 31, -8, 36, -5, 29, -2.5, 14, -6]);
      fill(M); shape([14, -20, 32.5, -14, 28.5, -9.6, 33, -6.4, 28, -4.4, 13, -8]);
      fill(O); oval(8, -3.4, 4.6, 2.2, 0.3); oval(17, -2.4, 4.6, 2.2, 0.3);
      ruff(-7, -30);
      wing(-2, -18, -42, -9, 17, M, D, 1);
      return;
    }
    wing(4, -27, 37, -40, 16, '#dfe4f5', D, -1);
    fill(D); shape([-18, -27, -36, -34, -31, -26, -38, -24, -29, -19, -18, -14]);
    fill(M); shape([-17, -27, -33.5, -32.5, -29, -26, -35, -24.5, -27.5, -20.6, -17, -16]);
    fill(O); oval(-17, -5.4, 4.6, 2.2, -0.3); oval(-9, -3.4, 4.6, 2.2, -0.3);
    blob(-5, -19, 22.5, 14.5, M, D, 0.25);
    wing(-6, -18, -45, -9, 17, M, D, 1);
    neck(9, -26, 13, -44, 21, -54);
    ruff(8, -29);
    ball(22, -57, 9.6, M, D);
    fill(OD); shape([27, -57.6, 41, -50.4, 27, -48.6]); fill(O); shape([27, -57.6, 41, -50.8, 27.4, -53]);
    fill(WHITE); tri(29.4, -52.6, 31.2, -50.4, 32.4, -52.4); tri(33.4, -52.2, 35, -50.4, 36, -52);
    eye(19.6, -58.6, 3.8, M); eye(27, -57, 3.2, M);
    ink(INK, 2.2); line(15, -64, 22, -61.6); line(30.6, -61, 25.6, -60.6);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // hamster: the friendly digger with stuffed cheeks. pack 0..3 = backpack, alt dig = pickaxe up, alt daze = dizzy

  function backpack(n) {
    const P = '#3d8fd6', PD = '#255c96', w = [0, 10, 12, 15][n], h = [0, 11, 13, 17.5][n];
    if (n >= 3) {
      ink('#6b7088', 1.2); line(w / 2, -h * 0.55, w / 2 + 3.4, -h * 0.3);
      fill('#4a4f6e'); circle(w / 2 + 4.6, -h * 0.3 + 3.4, 3.7); fill('#9aa3b8'); circle(w / 2 + 4.2, -h * 0.3 + 3, 2.8);
    }
    fill(PD); rbox(-w / 2, -h, w, h, 3.2); fill(P); rbox(-w / 2, -h, w - 1, h - 1, 2.8);
    fill(PD); rbox(-w / 2 + 1.4, -h * 0.42, w - 3.6, h * 0.34, 1.4);
    ink(PD, 1); line(-w / 2 + 0.6, -h * 0.62, w / 2 - 1.4, -h * 0.62);
    fill('#ffd23f'); c.fillRect(-1.2, -h * 0.68, 2, 2.2);
    if (n >= 2) {
      fill('#3f9b3a'); rbox(-w / 2 - 1, -h - 3.6, w + 2, 5, 2.5); fill('#7ee05a'); rbox(-w / 2 - 1, -h - 3.8, w + 1, 4, 2);
      ink('#3f9b3a', 0.9); line(-w / 4, -h - 3.6, -w / 4, -h + 0.6); line(w / 4, -h - 3.6, w / 4, -h + 0.6);
    }
    if (n >= 3) { fill('#ff5a5f'); rbox(-w / 2 + 2, -h - 7.4, w - 5, 4.4, 2); fill('#fff1c9'); c.fillRect(-w / 2 + 4.6, -h - 7.4, 1.6, 4.2); c.fillRect(-w / 2 + 8.2, -h - 7.4, 1.6, 4.2); }
  }
  function hamster() {
    const M = '#f0a04b', D = '#b9692a', CR = '#fff0d6', CRD = '#e3c69c';
    const daze = alt === 'daze', dig = alt === 'dig';
    // a pickaxe: the hand is at (x, y), the handle leans by rot
    const pick = (x, y, rot) => {
      c.save(); c.translate(x, y); c.rotate(rot);
      ink('#5c3a20', 2.6); line(0, 2, 0, -21); ink('#b07a45', 1.4); line(0, 2, 0, -21);
      ink('#4a4f6e', 3.8); curve(-8, -17, 0, -25, 8, -17); ink('#b9c2de', 2.2); curve(-8, -17, 0, -25, 8, -17);
      c.restore();
    };
    const stars = (x, y) => {
      ink('rgba(255,255,255,0.6)', 0.9); c.beginPath(); c.ellipse(x, y, 10.5, 3.2, 0.1, 0, TAU); c.stroke();
      fill('#b8860b'); star4(x - 9.6, y - 0.4, 3.4); star4(x + 1, y + 3.4, 3.8); star4(x + 9.6, y - 1.2, 3);
      fill('#ffe14a'); star4(x - 10, y - 0.9, 2.7); star4(x + 0.6, y + 2.9, 3.1); star4(x + 9.2, y - 1.7, 2.4);
    };
    if (daze) c.rotate(B ? 0.07 : -0.07);
    if (B) {
      feet(PINK, -6, 7);
      if (dig) pick(-10, -8.5, -0.32);
      fill(D); circle(-9.5, -21.5, 3.6); circle(1.5, -23, 3.6); fill(M); circle(-9.9, -21.9, 2.5); circle(1.1, -23.4, 2.5);
      ball(-4.5, -14, 9.6, M, D);
      fill(CR); c.save(); c.beginPath(); c.arc(-4.9, -14.5, 8.6, 0, TAU); c.clip(); oval(-13.5, -9.5, 4.6, 4); c.restore();
      blob(2.5, -8.6, 10.6, 8.6, M, D);
      if (dig) { fill(CRD); circle(-10.4, -8.4, 2.4); fill(CR); circle(-10.6, -8.7, 1.8); }
      if (pack) { ink('#255c96', 1.3); line(-3.5, -14, -5.5, -5); line(9.5, -14.5, 11.5, -6); at(3.5, -3.6, 1, () => backpack(pack)); }
      else { fill('#ffd9a0'); c.save(); c.beginPath(); c.ellipse(2, -9.2, 9.4, 7.4, 0, 0, TAU); c.clip(); oval(1, -13.5, 3, 6, -0.2); c.restore(); shine(-3, -13.5, 3, 1.4); }
      fill(CRD); circle(10.5, -3.2, 2.4); fill(CR); circle(10.2, -3.5, 1.8);
      if (daze) stars(-4.5, -27.5);
      return;
    }
    if (pack) at(-11.5 - pack * 0.4, -6, 1, () => backpack(pack));
    feet(PINK, -6.5, 4.5);
    blob(-2.5, -8.6, 10.6, 8.6, M, D);
    fill(CR); c.save(); c.beginPath(); c.ellipse(-3, -9.2, 9.4, 7.4, 0, 0, TAU); c.clip(); oval(3, -5, 6.6, 5.4); c.restore();
    if (pack) { ink('#255c96', 1.4); curve(-8.5, -15, -5, -9, -3.5, -2.6); }
    
    fill(D); circle(-2.5, -22, 3.7); circle(9, -23, 3.5); fill('#ffb3a1'); circle(-2.3, -21.8, 2.1); circle(9.2, -22.8, 2);
    ball(4.5, -13.6, 9.7, M, D);
    // the white blaze and the stuffed cheeks
    c.save(); c.beginPath(); c.arc(4.1, -14.1, 8.7, 0, TAU); c.clip(); fill(CR); oval(6.6, -21, 2.3, 5, -0.25); c.restore();
    fill(CRD); oval(1, -9.4, 5, 4); oval(10.6, -8.8, 5, 4.2); fill(CR); oval(0.6, -9.8, 4.4, 3.4); oval(10.2, -9.2, 4.4, 3.6);
    if (daze) { spiral(2.6, -15.2, 2.9); spiral(9.8, -14.2, 2.6); wobbly(6.6, -8.6, 2.2); }
    else {
      eye(2.6, -15.2, 3, M); eye(9.8, -14.2, 2.7, M);
      ink(INK, 0.8); c.beginPath(); c.arc(5.9, -10.1, 1, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke(); c.beginPath(); c.arc(7.9, -9.9, 1, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
    }
    fill('#ff6b8a'); oval(6.9, -11.5, 1.5, 1.1);
    blush(-0.6, -9, 1.6); blush(12.2, -8.2, 1.4);
    fill(CRD); circle(-0.6, -4.2, 2.3); fill(CR); circle(-0.9, -4.5, 1.7);
    if (dig) pick(12, -6.6, 0.36);
    fill(CRD); circle(dig ? 12.4 : 7.6, dig ? -6.4 : -3.6, 2.3); fill(CR); circle(dig ? 12.1 : 7.3, dig ? -6.7 : -3.9, 1.7);
    if (daze) stars(4.5, -27.5);
  }

  // ---------- public ----------
  const ART = { rat, snail, beetle, hedgehog, frog, worm, chick, sapper, balloon, duck, hen, tyrant, goose, hamster };
  const altOf = (kind, o) => (o && ALTS[kind].includes(o.alt) ? o.alt : '');
  const packOf = (o) => clamp(Math.round(+(o && o.pack) || 0), 0, 3);
  const boxKey = (kind, o) => kind + (altOf(kind, o) ? ':' + altOf(kind, o) : '') + (kind === 'hamster' ? ':' + packOf(o) : '') + (o && o.back ? ':b' : '');

  function paint(kind, ctx, o) {
    const f = ART[kind];
    if (!f || !ctx) return;
    c = ctx; B = !!(o && o.back); shut = !!(o && o.blink); alt = altOf(kind, o); pack = packOf(o);
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    try { f(); } finally { c.restore(); c = null; }
  }
  function box(kind, o) {
    const b = ART[kind] ? BOX[boxKey(kind, o)] : null;
    return b ? { w: b[0], h: b[1], ax: b[2], ay: b[3] } : { w: 48, h: 48, ax: 24, ay: 42 };
  }
  // representative options for galleries and tests
  const OPTS = {};
  for (const kind of KINDS) {
    const list = [];
    for (const a of [''].concat(ALTS[kind])) {
      for (const p of kind === 'hamster' ? (a ? [0, 2] : [0, 1, 2, 3]) : [null]) {
        for (const v of [{}, { blink: true }, { back: true }]) {
          if (v.blink && (p === 1 || p === 3)) continue;
          const o = Object.assign({}, v); if (a) o.alt = a; if (p !== null) o.pack = p;
          list.push(o);
        }
      }
    }
    OPTS[kind] = list;
  }

  window.SSFoeArt = { paint, box, kinds: KINDS, color: (kind) => COLORS[kind] || '#ffffff', names: NAMES, opts: OPTS, alts: ALTS, boxKey };
})();
