// Trestle Trouble: build a bridge, then send the van across.
// Plain canvas game. Physics: XPBD with small substeps (one solve per substep).
(() => {
'use strict';

// ---------- Materials ----------
// price: $ per metre. mass: tonnes per metre. max: longest part (m).
// str: breaking force (kN). comp: compliance per metre. Long parts buckle
// under compression (see compLimit).
const MATS = {
  road:  { name: 'Road',  price: 200, mass: 0.08, max: 3.2, str: 44, comp: 4e-5, w: 0.34, road: true },
  wood:  { name: 'Wood',  price: 100, mass: 0.03, max: 3.2, str: 32, comp: 8e-5, w: 0.2 },
  steel: { name: 'Steel', price: 260, mass: 0.06, max: 4.5, str: 90, comp: 2e-5, w: 0.22 },
  cable: { name: 'Cable', price: 60, mass: 0.01, max: 10, str: 60, comp: 6e-5, w: 0.08, cable: true },
};
const JOINT_COST = 40;
const TOOLS = ['road', 'wood', 'steel', 'cable', 'erase'];
const VEHICLES = {
  car:   { name: 'Little van', wb: 2.0, r: 0.4, h: 1.0, mass: 1.2, speed: 4.2, color: '#ff8a3d' },
  van:   { name: 'Big van', wb: 2.6, r: 0.45, h: 1.35, mass: 2.4, speed: 3.6, color: '#3fb6a8' },
  truck: { name: 'Truck', wb: 3.4, r: 0.5, h: 1.6, mass: 3.4, speed: 3.1, color: '#e2475b' },
};
const G = -9.81;
const SUB = 40;          // substeps per 1/60 s frame
const FRAME = 1 / 60;
const TIRE = 6e-4;      // tyre compliance (m/kN): softens bumps at joints

function compLimit(mat, len) {
  if (mat.cable) return 0;
  const k = len > 2.4 ? 2.4 / len : 1;
  return mat.str * k;
}

// ---------- DOM ----------
const C = document.getElementById('game');
const ctx = C.getContext('2d');
const $ = (id) => document.getElementById(id);
const overlay = $('overlay'), tipBox = $('tip'), toast = $('toast');
let W = 0, H = 0, DPR = 1;
const view = { s: 40, ox: 0, oy: 0 };
const TOP_PAD = 64, BOT_PAD = 92;

// ---------- Save ----------
const SAVE_KEY = 'trestle-trouble-v1';
let save = { unlocked: 1, best: {}, designs: {} };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) save = Object.assign(save, s); } catch (e) {}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

// ---------- State ----------
let mode = 'title';      // title | levels | build | sim
let paused = false;
let L = null, LI = 0;    // level data, index
let terrain = null;
let design = [];         // members: {x1,y1,x2,y2,m}
let undoStack = [];
let tool = 'road';
let drag = null;         // {x, y, ex, ey, ok}
let hover = null;
let sim = null;
let slow = false;
let shake = 0;
let tipClosed = false;

// ---------- Audio ----------
let AC = null;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(f, d, type = 'sine', v = 0.15, slide = 0) {
  const a = AC; if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02);
}
function noise(d, v = 0.25, hp = 800) {
  const a = AC; if (!a) return;
  const n = Math.floor(a.sampleRate * d), b = a.createBuffer(1, n, a.sampleRate), ch = b.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = b; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = v;
  s.connect(f); f.connect(g); g.connect(a.destination); s.start();
}
const sfx = {
  place(m) { tone(m === 'steel' ? 520 : m === 'cable' ? 880 : m === 'road' ? 330 : 420, 0.08, 'triangle', 0.12); },
  erase() { tone(300, 0.12, 'sawtooth', 0.06, 0.5); },
  click() { tone(660, 0.05, 'square', 0.05); },
  crack() { noise(0.35, 0.35, 500); tone(120, 0.3, 'sawtooth', 0.12, 0.4); },
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.14), i * 110)); },
  fail() { tone(300, 0.5, 'sawtooth', 0.1, 0.3); setTimeout(() => noise(0.6, 0.25, 200), 150); },
  splash() { noise(0.7, 0.3, 300); },
  bad() { tone(160, 0.12, 'square', 0.06); },
};

// ---------- Geometry helpers ----------
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let s = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  s = Math.max(0, Math.min(1, s));
  const cx = ax + s * dx, cy = ay + s * dy;
  return { d: Math.hypot(px - cx, py - cy), s, cx, cy };
}
const key = (x, y) => x + ',' + y;
const mlen = (m) => Math.hypot(m.x2 - m.x1, m.y2 - m.y1);

// ---------- Level setup ----------
function buildTerrain(lv) {
  const polys = [], segs = [];
  const gx = lv.gap;
  const aL = lv.anchors.filter((a) => a[0] === 0 && a[1] <= lv.ly).map((a) => a[1]);
  const aR = lv.anchors.filter((a) => a[0] === gx && a[1] <= lv.ry).map((a) => a[1]);
  const fbL = Math.min(lv.ly - 2, ...aL) - 1.2;
  const fbR = Math.min(lv.ry - 2, ...aR) - 1.2;
  const deep = -60;
  polys.push({ kind: 'cliff', pts: [[-80, lv.ly], [0, lv.ly], [0, fbL], [-0.9, fbL - 2.5], [-0.3, fbL - 6], [-1.2, deep], [-80, deep]] });
  polys.push({ kind: 'cliff', pts: [[gx, lv.ry], [gx + 80, lv.ry], [gx + 80, deep], [gx + 1.2, deep], [gx + 0.3, fbR - 6], [gx + 0.9, fbR - 2.5], [gx, fbR]] });
  for (const p of lv.pillars || []) {
    const h = p.w / 2;
    polys.push({ kind: 'pillar', pts: [[p.x - h, p.top], [p.x + h, p.top], [p.x + h + 0.3, p.top - 3], [p.x + h + 0.8, deep], [p.x - h - 0.8, deep], [p.x - h - 0.3, p.top - 3]] });
  }
  for (const p of polys) for (let i = 0; i < p.pts.length; i++) {
    const a = p.pts[i], b = p.pts[(i + 1) % p.pts.length];
    segs.push([a[0], a[1], b[0], b[1]]);
  }
  const lowA = Math.min(...lv.anchors.map((a) => a[1]), ...(lv.pillars || []).map((p) => p.top));
  const highA = Math.max(...lv.anchors.map((a) => a[1]), lv.ly, lv.ry);
  const water = Math.min(-8, lowA - 4);
  const bounds = { x0: -Math.max(7, VEHICLES[lv.veh].wb + 4.4), x1: gx + 7, y0: water - 1.5, y1: Math.max(highA + 3, 7) };
  const anchors = new Set(lv.anchors.map((a) => key(a[0], a[1])));
  return { polys, segs, water, bounds, anchors, finish: gx + 4.5 };
}

function validNode(x, y) {
  if (terrain.anchors.has(key(x, y))) return true;
  const b = terrain.bounds;
  if (x < b.x0 + 0.5 || x > b.x1 - 0.5 || y < terrain.water + 0.5 || y > b.y1 - 0.5) return false;
  for (const p of terrain.polys) {
    if (pointInPoly(x, y, p.pts)) return false;
    for (let i = 0; i < p.pts.length; i++) {
      const a = p.pts[i], c = p.pts[(i + 1) % p.pts.length];
      if (segDist(x, y, a[0], a[1], c[0], c[1]).d < 0.35) return false;
    }
  }
  for (const t of L.towers || []) if (Math.abs(x - t.x) < 0.7 && y < t.top + 0.5 && y > Math.min(L.ly, L.ry)) return false;
  return true;
}

function nodesOf(members) {
  const map = new Map();
  for (const m of members) { map.set(key(m.x1, m.y1), [m.x1, m.y1]); map.set(key(m.x2, m.y2), [m.x2, m.y2]); }
  return map;
}
function costOf(members) {
  let c = 0;
  for (const m of members) c += mlen(m) * MATS[m.m].price;
  for (const k of nodesOf(members).keys()) if (!terrain.anchors.has(k)) c += JOINT_COST;
  return Math.round(c);
}

function loadLevel(i) {
  LI = i; L = window.TT_LEVELS[i]; terrain = buildTerrain(L);
  design = (save.designs[i] || []).map((m) => Object.assign({}, m));
  undoStack = []; sim = null; drag = null; tipClosed = false;
  mode = 'build'; paused = false;
  fitView(); hideOverlay(); showTip(L.tip, L.name, 'Level ' + (i + 1));
  updateUI();
}

function fitView() {
  if (!terrain) return;
  const b = terrain.bounds;
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const aw = W - 24, ah = H - TOP_PAD - BOT_PAD;
  view.s = Math.min(aw / bw, ah / bh);
  view.ox = (W - bw * view.s) / 2 - b.x0 * view.s;
  view.oy = TOP_PAD + (ah - bh * view.s) / 2 + b.y1 * view.s;
}
const sx = (x) => x * view.s + view.ox;
const sy = (y) => -y * view.s + view.oy;
const wx = (px) => (px - view.ox) / view.s;
const wy = (py) => -(py - view.oy) / view.s;

// ---------- Simulation ----------
function startSim() {
  const nodes = new Map();
  const P = []; // particles: {x,y,px,py,vx,vy,w,m}
  const getNode = (x, y) => {
    const k = key(x, y);
    if (!nodes.has(k)) {
      const fixed = terrain.anchors.has(k);
      nodes.set(k, P.length);
      P.push({ x, y, px: x, py: y, vx: 0, vy: 0, mass: 0, w: 0, fixed });
    }
    return nodes.get(k);
  };
  const cons = [];
  for (const m of design) {
    const mat = MATS[m.m], len = mlen(m);
    const a = getNode(m.x1, m.y1), b = getNode(m.x2, m.y2);
    P[a].mass += mat.mass * len / 2; P[b].mass += mat.mass * len / 2;
    cons.push({ a, b, rest: len, mat, m: m.m, comp: mat.comp * len, f: 0, acc: 0, peak: 0, broken: false, road: !!mat.road, member: true });
  }
  for (const p of P) p.w = p.fixed ? 0 : 1 / Math.max(p.mass, 0.01);
  // vehicle
  const V = VEHICLES[L.veh];
  const x0 = -3.2 - V.wb, y0 = L.ly + V.r + 0.02;
  const vi = P.length;
  const pts = [[0, 0], [V.wb, 0], [-0.25, V.h], [V.wb + 0.25, V.h]];
  const ms = [V.mass * 0.38, V.mass * 0.38, V.mass * 0.12, V.mass * 0.12];
  pts.forEach((q, i) => P.push({ x: x0 + q[0], y: y0 + q[1], px: x0 + q[0], py: y0 + q[1], vx: 0, vy: 0, mass: ms[i], w: 1 / ms[i], fixed: false, car: true }));
  const carCons = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const a = P[vi + i], b = P[vi + j];
    carCons.push({ a: vi + i, b: vi + j, rest: Math.hypot(a.x - b.x, a.y - b.y), comp: 0, f: 0 });
  }
  sim = { P, cons, carCons, V, vi, wheels: [vi, vi + 1], t: 0, roll: 0, state: 'run', endT: 0, broke: 0, maxStress: 0, splash: null, debris: [] };
  mode = 'sim'; drag = null;
  hideTip(); updateUI();
}

function solveDist(c, P, h2, track) {
  const a = P[c.a], b = P[c.b];
  const wsum = a.w + b.w;
  if (wsum === 0) return;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1e-9;
  const C = len - c.rest;
  if (c.mat && c.mat.cable && C < 0) return;
  const alpha = c.comp / h2;
  const lam = C / (wsum + alpha);
  const nx = dx / len, ny = dy / len;
  a.x += a.w * lam * nx; a.y += a.w * lam * ny;
  b.x -= b.w * lam * nx; b.y -= b.w * lam * ny;
  if (track) c.acc += lam;
}

function collideWheel(wi, S, h, h2) {
  const P = S.P, p = P[wi], r = S.V.r;
  let contact = false;
  // road members
  for (const c of S.cons) {
    if (!c.road || c.half === 'gone') continue;
    const a = P[c.a], b = P[c.b];
    const q = segDist(p.x, p.y, a.x, a.y, b.x, b.y);
    if (q.d >= r || q.d < 1e-6) continue;
    const pen = r - q.d, nx = (p.x - q.cx) / q.d, ny = (p.y - q.cy) / q.d;
    const s = q.s, wa = a.w * (1 - s) * (1 - s), wb = b.w * s * s;
    const Wt = p.w + wa + wb;
    const lam = pen / (Wt + TIRE / h2);
    p.x += p.w * lam * nx; p.y += p.w * lam * ny;
    a.x -= a.w * (1 - s) * lam * nx; a.y -= a.w * (1 - s) * lam * ny;
    b.x -= b.w * s * lam * nx; b.y -= b.w * s * lam * ny;
    // drive + friction along the surface
    const tx = ny, ty = -nx;
    const sdx = (a.x - a.px) * (1 - s) + (b.x - b.px) * s, sdy = (a.y - a.py) * (1 - s) + (b.y - b.py) * s;
    const rel = ((p.x - p.px) - sdx) * tx + ((p.y - p.py) - sdy) * ty;
    let corr = S.V.speed * h * (S.state === 'run' || S.state === 'won' ? 1 : 0) - rel;
    const lim = 1.1 * lam * Wt;
    corr = Math.max(-lim, Math.min(lim, corr));
    const lt = corr / Wt;
    p.x += p.w * lt * tx; p.y += p.w * lt * ty;
    a.x -= a.w * (1 - s) * lt * tx; a.y -= a.w * (1 - s) * lt * ty;
    b.x -= b.w * s * lt * tx; b.y -= b.w * s * lt * ty;
    contact = true;
  }
  for (const sg of terrain.segs) {
    const q = segDist(p.x, p.y, sg[0], sg[1], sg[2], sg[3]);
    if (q.d >= r || q.d < 1e-6) continue;
    const pen = r - q.d, nx = (p.x - q.cx) / q.d, ny = (p.y - q.cy) / q.d;
    p.x += nx * pen; p.y += ny * pen;
    const tx = ny, ty = -nx;
    const rel = (p.x - p.px) * tx + (p.y - p.py) * ty;
    let corr = S.V.speed * h - rel;
    const lim = 1.1 * pen;
    corr = Math.max(-lim, Math.min(lim, corr));
    p.x += tx * corr; p.y += ty * corr;
    contact = true;
  }
  return contact;
}

function breakMember(S, c) {
  c.broken = true;
  S.broke++;
  const P = S.P, a = P[c.a], b = P[c.b];
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const hm = Math.max(c.mat.mass * c.rest / 4, 0.01);
  for (const end of [c.a, c.b]) {
    const i = P.length;
    const e = P[end];
    const jx = (Math.random() - 0.5) * 0.1, jy = (Math.random() - 0.5) * 0.1;
    P.push({ x: mx + (e.x - mx) * 0.08 + jx, y: my + (e.y - my) * 0.08 + jy, px: mx, py: my, vx: e.vx, vy: e.vy, mass: hm, w: 1 / hm, fixed: false });
    S.cons.push({ a: end, b: i, rest: Math.hypot(e.x - mx, e.y - my) * 0.92, mat: c.mat, m: c.m, comp: c.comp, f: 0, acc: 0, peak: 0, broken: false, road: c.road, member: true, half: true });
  }
  for (let k = 0; k < 10; k++) S.debris.push({ x: mx, y: my, vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4, t: 1, c: c.m });
  shake = Math.min(1, shake + 0.4);
  sfx.crack();
}

function stepSim(S, dt) {
  const h = dt / SUB, h2 = h * h, P = S.P;
  S.t += dt;
  // Strong damping while the bridge settles, then a little.
  const damp = Math.exp(-(S.t < 0.8 ? 12 : 2) * h);
  for (let k = 0; k < SUB; k++) {
    for (const p of P) {
      p.px = p.x; p.py = p.y;
      if (p.w === 0) continue;
      p.vy += G * h;
      p.x += p.vx * h; p.y += p.vy * h;
    }
    for (const c of S.cons) if (!c.broken) solveDist(c, P, h2, true);
    for (const c of S.carCons) solveDist(c, P, h2, false);
    collideWheel(S.wheels[0], S, h, h2);
    collideWheel(S.wheels[1], S, h, h2);
    for (const p of P) {
      if (p.w === 0) continue;
      p.vx = (p.x - p.px) / h; p.vy = (p.y - p.py) / h;
      if (!p.car) { p.vx *= damp; p.vy *= damp; }
    }
  }
  // Member force = mean constraint force over the frame (+ = tension, kN), lightly smoothed.
  for (const c of S.cons) {
    if (c.broken) continue;
    const f = c.acc / (h2 * SUB); c.acc = 0;
    c.f += (f - c.f) * 0.2;
    if (c.half) continue;
    const lim = c.f >= 0 ? c.mat.str : compLimit(c.mat, c.rest);
    const ratio = Math.abs(c.f) / lim;
    if (ratio > c.peak) c.peak = ratio;
    if (ratio > 1 && S.t > 0.1) breakMember(S, c);
  }
  // wheel spin for drawing
  const rw = P[S.wheels[0]];
  S.roll += (rw.vx * Math.cos(0) ) * dt / S.V.r;
  for (const d of S.debris) { d.vy += G * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.t -= dt * 0.8; }
  S.debris = S.debris.filter((d) => d.t > 0);
  // outcome
  const fw = P[S.wheels[1]], bw = P[S.wheels[0]];
  const cy = Math.min(fw.y, bw.y);
  if (S.state === 'run') {
    if (bw.x > terrain.finish) { S.state = 'won'; S.result = 'won'; S.endT = S.t; sfx.win(); }
    else if (cy < terrain.water) { S.state = 'lost'; S.result = 'lost'; S.endT = S.t; S.splash = { x: (fw.x + bw.x) / 2, t: 0 }; sfx.splash(); setTimeout(sfx.fail, 250); }
    else if (S.t > 45) { S.state = 'lost'; S.result = 'lost'; S.endT = S.t; sfx.fail(); }
    else if (fw.x < -12 || cy < -60) { S.state = 'lost'; S.result = 'lost'; S.endT = S.t; sfx.fail(); }
  } else if (S.state !== 'shown' && S.t - S.endT > (S.state === 'won' ? 1.0 : 1.6)) {
    const st = S.state; S.state = 'shown';
    showResult(st === 'won');
  }
  if (S.splash) S.splash.t += dt;
  let mx = 0;
  for (const c of S.cons) if (!c.broken && !c.half) mx = Math.max(mx, c.peak);
  S.maxStress = mx;
}

// ---------- Rendering ----------
function rand(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function drawBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2b3a67'); g.addColorStop(0.45, '#c86b6b'); g.addColorStop(0.75, '#f3b46b'); g.addColorStop(1, '#f7d08a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // sun
  const sunX = W * 0.72, sunY = H * 0.5;
  const sg = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, H * 0.35);
  sg.addColorStop(0, '#fff3c4'); sg.addColorStop(0.15, '#ffd98a'); sg.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff0bd'; ctx.beginPath(); ctx.arc(sunX, sunY, Math.min(W, H) * 0.06, 0, Math.PI * 2); ctx.fill();
  // far mesas
  const R = rand(LI * 977 + 13);
  const layers = [['#a65a6a', 0.62, 0.5], ['#8a4a5e', 0.7, 0.8]];
  for (const [col, base, amp] of layers) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
    let x = 0, y = H * base;
    ctx.lineTo(0, y);
    while (x < W) {
      const w = (60 + R() * 160) * (W / 1400);
      const top = H * base - R() * H * 0.12 * amp;
      ctx.lineTo(x + w * 0.15, top); ctx.lineTo(x + w * 0.85, top); ctx.lineTo(x + w, H * base + R() * 20);
      x += w;
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }
  // birds
  ctx.strokeStyle = 'rgba(60,30,50,0.5)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const bx = ((t * 18 + i * 260 + LI * 90) % (W + 200)) - 100, by = H * 0.2 + Math.sin(t * 0.7 + i) * 12 + i * 22;
    const f = Math.sin(t * 6 + i) * 4;
    ctx.beginPath(); ctx.moveTo(bx - 7, by - f); ctx.quadraticCurveTo(bx - 3, by - 3, bx, by); ctx.quadraticCurveTo(bx + 3, by - 3, bx + 7, by - f); ctx.stroke();
  }
}

function drawWater(t) {
  const y = sy(terrain.water);
  const g = ctx.createLinearGradient(0, y, 0, H);
  g.addColorStop(0, '#3e8fa6'); g.addColorStop(1, '#1d4f6b');
  ctx.fillStyle = g; ctx.fillRect(0, y, W, H - y);
  ctx.strokeStyle = 'rgba(255,240,200,0.35)'; ctx.lineWidth = 2;
  for (let r = 0; r < 3; r++) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 12) {
      const yy = y + 6 + r * 14 + Math.sin(x * 0.03 + t * 1.6 + r * 2) * 2.5;
      x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
}

function polyPath(pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(sx(p[0]), sy(p[1])) : ctx.moveTo(sx(p[0]), sy(p[1]))));
  ctx.closePath();
}

function drawTerrain() {
  for (const p of terrain.polys) {
    ctx.save();
    polyPath(p.pts); ctx.fillStyle = p.kind === 'pillar' ? '#9c5a3c' : '#a8603f'; ctx.fill();
    ctx.clip();
    // strata bands
    const cols = ['#b86d47', '#93503a', '#c98457', '#7e4434'];
    let i = 0;
    for (let y = 6; y > -60; y -= 1.3) {
      ctx.fillStyle = cols[i++ % cols.length];
      ctx.globalAlpha = 0.55;
      const off = Math.sin(y * 1.7) * 0.3;
      ctx.beginPath();
      ctx.moveTo(sx(-90), sy(y + off)); ctx.lineTo(sx(120), sy(y - off)); ctx.lineTo(sx(120), sy(y - off - 0.55)); ctx.lineTo(sx(-90), sy(y + off - 0.55));
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // shading on the inner side
    const top = p.pts[0][1];
    const sh = ctx.createLinearGradient(0, sy(top), 0, sy(top - 12));
    sh.addColorStop(0, 'rgba(255,220,160,0.15)'); sh.addColorStop(1, 'rgba(40,10,20,0.45)');
    ctx.fillStyle = sh; ctx.fillRect(0, sy(top), W, H);
    ctx.restore();
    // top crust
    const a = p.pts[0], b = p.pts[1];
    ctx.strokeStyle = p.kind === 'pillar' ? '#d79a62' : '#7fa04a'; ctx.lineWidth = Math.max(3, view.s * 0.18); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx(Math.max(a[0], -30)), sy(a[1])); ctx.lineTo(sx(Math.min(b[0], 80)), sy(b[1])); ctx.stroke();
  }
  // road on the cliffs
  ctx.fillStyle = '#3a3438';
  const rl = sy(L.ly), rr = sy(L.ry);
  ctx.fillRect(0, rl - view.s * 0.1, sx(0), view.s * 0.18);
  ctx.fillRect(sx(L.gap), rr - view.s * 0.1, W - sx(L.gap), view.s * 0.18);
  // finish flag
  const fx = sx(terrain.finish), fy = sy(L.ry);
  ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - view.s * 2.4); ctx.stroke();
  const wave = Math.sin(performance.now() / 300) * 3;
  ctx.fillStyle = '#ffe16b';
  ctx.beginPath(); ctx.moveTo(fx, fy - view.s * 2.4); ctx.quadraticCurveTo(fx + view.s * 0.6, fy - view.s * 2.3 + wave, fx + view.s * 1.2, fy - view.s * 2.1);
  ctx.lineTo(fx, fy - view.s * 1.7); ctx.fill();
}

function drawTowers() {
  for (const t of L.towers || []) {
    const base = Math.min(L.ly, L.ry) - 0.2;
    const x0 = sx(t.x - 0.55), x1 = sx(t.x + 0.55), y0 = sy(t.top), y1 = sy(base);
    ctx.fillStyle = '#8c7b70'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = '#76665d';
    for (let y = t.top; y > base; y -= 0.6) {
      const off = (Math.round(y / 0.6) % 2) * 0.3;
      for (let x = t.x - 0.55 + off; x < t.x + 0.55; x += 0.6) ctx.fillRect(sx(x), sy(y), view.s * 0.04, view.s * 0.6);
      ctx.fillRect(x0, sy(y), x1 - x0, Math.max(1, view.s * 0.04));
    }
    ctx.fillStyle = '#6a5a52'; ctx.fillRect(x0 - view.s * 0.15, y0 - view.s * 0.3, x1 - x0 + view.s * 0.3, view.s * 0.35);
  }
}

function stressColor(r) {
  r = Math.max(0, Math.min(1, r));
  const hue = 120 - r * 120;
  return `hsl(${hue}, 85%, ${r > 0.9 ? 45 : 50}%)`;
}

function drawMember(ax, ay, bx, by, m, stress, alpha) {
  const mat = MATS[m];
  const lw = Math.max(m === 'cable' ? 2 : 4, mat.w * view.s);
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.lineCap = 'round';
  const X1 = sx(ax), Y1 = sy(ay), X2 = sx(bx), Y2 = sy(by);
  if (m === 'road') {
    ctx.strokeStyle = '#2b2a30'; ctx.lineWidth = lw + 3;
    ctx.beginPath(); ctx.moveTo(X1, Y1); ctx.lineTo(X2, Y2); ctx.stroke();
    ctx.strokeStyle = stress != null ? stressColor(stress) : '#55525c'; ctx.lineWidth = lw;
    ctx.stroke();
    if (stress == null) {
      ctx.strokeStyle = '#f2d264'; ctx.lineWidth = Math.max(1, lw * 0.12); ctx.setLineDash([view.s * 0.25, view.s * 0.25]);
      ctx.stroke(); ctx.setLineDash([]);
    }
  } else if (m === 'wood') {
    ctx.strokeStyle = '#6b3f1e'; ctx.lineWidth = lw + 3;
    ctx.beginPath(); ctx.moveTo(X1, Y1); ctx.lineTo(X2, Y2); ctx.stroke();
    ctx.strokeStyle = stress != null ? stressColor(stress) : '#d9a05b'; ctx.lineWidth = lw; ctx.stroke();
    if (stress == null) { ctx.strokeStyle = 'rgba(120,70,30,0.5)'; ctx.lineWidth = Math.max(1, lw * 0.2); ctx.stroke(); }
  } else if (m === 'steel') {
    ctx.strokeStyle = '#26354a'; ctx.lineWidth = lw + 3;
    ctx.beginPath(); ctx.moveTo(X1, Y1); ctx.lineTo(X2, Y2); ctx.stroke();
    ctx.strokeStyle = stress != null ? stressColor(stress) : '#7ea6cf'; ctx.lineWidth = lw; ctx.stroke();
    if (stress == null) { ctx.strokeStyle = 'rgba(230,245,255,0.55)'; ctx.lineWidth = Math.max(1, lw * 0.22); ctx.stroke(); }
  } else {
    ctx.strokeStyle = stress != null ? stressColor(stress) : '#2c2630'; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(X1, Y1); ctx.lineTo(X2, Y2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawJoint(x, y, anchor) {
  const X = sx(x), Y = sy(y), r = Math.max(4, view.s * 0.14);
  if (anchor) {
    ctx.fillStyle = '#3a1a14'; ctx.beginPath(); ctx.arc(X, Y, r * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff5a3c'; ctx.beginPath(); ctx.arc(X, Y, r * 1.15, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a1a14'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X - r * 0.6, Y); ctx.lineTo(X + r * 0.6, Y); ctx.stroke();
  } else {
    ctx.fillStyle = '#2a2228'; ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e9e2d6'; ctx.beginPath(); ctx.arc(X, Y, r * 0.5, 0, Math.PI * 2); ctx.fill();
  }
}

function drawGrid() {
  const b = terrain.bounds;
  const r = Math.max(1.2, view.s * 0.035);
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  for (let x = Math.ceil(b.x0); x <= b.x1; x++) for (let y = Math.ceil(b.y0); y <= b.y1; y++) {
    if (!validNode(x, y)) continue;
    ctx.fillRect(sx(x) - r, sy(y) - r, r * 2, r * 2);
  }
}

function drawVehicle(S) {
  const P = S.P, V = S.V;
  const rw = P[S.vi], fw = P[S.vi + 1], br = P[S.vi + 2], bf = P[S.vi + 3];
  const ang = Math.atan2(fw.y - rw.y, fw.x - rw.x);
  drawVan(rw.x, rw.y, ang, V, S.roll, br, bf);
}

function drawVan(x, y, ang, V, roll) {
  const s = view.s;
  ctx.save();
  ctx.translate(sx(x), sy(y)); ctx.rotate(-ang); ctx.scale(s, -s);
  const wb = V.wb, r = V.r, h = V.h;
  // body
  ctx.fillStyle = V.color;
  ctx.strokeStyle = '#2a1a1a'; ctx.lineWidth = 0.06;
  ctx.beginPath();
  if (L.veh === 'truck') {
    // trailer box + cab
    roundRect(-0.6, r * 0.5, wb * 0.72, h, 0.12);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f4efe6'; roundRect(-0.45, r * 0.5 + 0.2, wb * 0.72 - 0.3, h - 0.4, 0.08); ctx.fill();
    ctx.fillStyle = '#2a1a1a'; ctx.font = 'bold 0.36px system-ui'; ctx.save(); ctx.scale(1, -1); ctx.fillText('PARCELS', -0.3, -(r * 0.5 + h / 2) + 0.12); ctx.restore();
    ctx.fillStyle = V.color; ctx.beginPath();
    ctx.moveTo(wb * 0.72 - 0.5, r * 0.5); ctx.lineTo(wb + 0.65, r * 0.5); ctx.lineTo(wb + 0.65, h * 0.55); ctx.lineTo(wb + 0.25, h * 0.95); ctx.lineTo(wb * 0.72 - 0.5, h * 0.95); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#bfe6ff'; ctx.beginPath(); ctx.moveTo(wb * 0.72 - 0.3, h * 0.6); ctx.lineTo(wb + 0.15, h * 0.6); ctx.lineTo(wb + 0.4, h * 0.6); ctx.lineTo(wb + 0.15, h * 0.88); ctx.lineTo(wb * 0.72 - 0.3, h * 0.88); ctx.fill();
  } else {
    ctx.moveTo(-0.55, r * 0.45);
    ctx.lineTo(wb + 0.6, r * 0.45);
    ctx.lineTo(wb + 0.6, h * 0.5);
    ctx.quadraticCurveTo(wb + 0.5, h * 0.62, wb + 0.2, h * 0.68);
    ctx.lineTo(wb - 0.1, h);
    ctx.lineTo(-0.4, h);
    ctx.quadraticCurveTo(-0.55, h, -0.55, h - 0.15);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#bfe6ff';
    ctx.beginPath(); ctx.moveTo(wb - 0.3, h * 0.92); ctx.lineTo(wb + 0.12, h * 0.68); ctx.lineTo(wb - 0.3, h * 0.68); ctx.closePath(); ctx.fill();
    ctx.fillRect(wb * 0.35, h * 0.68, wb * 0.4, h * 0.24);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-0.4, r * 0.45 + 0.12, wb + 0.8, 0.08);
    // little parcel on the roof
    ctx.fillStyle = '#d9a05b'; ctx.fillRect(0.0, h, 0.6, 0.35); ctx.strokeRect(0.0, h, 0.6, 0.35);
    ctx.fillStyle = '#6b3f1e'; ctx.fillRect(0.27, h, 0.06, 0.35);
  }
  // headlight
  ctx.fillStyle = '#fff3a0'; ctx.fillRect(wb + 0.5, r * 0.6, 0.12, 0.15);
  // wheels
  for (const wx0 of [0, wb]) {
    ctx.fillStyle = '#1c1a1e'; ctx.beginPath(); ctx.arc(wx0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c9c3bb'; ctx.beginPath(); ctx.arc(wx0, 0, r * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5c565e'; ctx.lineWidth = 0.06;
    for (let k = 0; k < 3; k++) {
      const a = -roll + k * Math.PI * 2 / 3;
      ctx.beginPath(); ctx.moveTo(wx0, 0); ctx.lineTo(wx0 + Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45); ctx.stroke();
    }
  }
  ctx.restore();
}
function roundRect(x, y, w, h, r) {
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
}

function draw(t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (!terrain) { drawTitleBg(t); return; }
  ctx.save();
  if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake * 10, (Math.random() - 0.5) * shake * 10); }
  drawBackground(t);
  drawTowers();
  drawWater(t);
  drawTerrain();
  if (mode === 'build') {
    drawGrid();
    const order = ['cable', 'wood', 'steel', 'road'];
    for (const o of order) for (const m of design) if (m.m === o) drawMember(m.x1, m.y1, m.x2, m.y2, m.m);
    if (tool === 'erase' && hover && hover.member) {
      const m = hover.member;
      ctx.strokeStyle = 'rgba(255,60,60,0.8)'; ctx.lineWidth = Math.max(6, view.s * 0.4); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx(m.x1), sy(m.y1)); ctx.lineTo(sx(m.x2), sy(m.y2)); ctx.stroke();
    }
    const nodes = nodesOf(design);
    for (const [k, p] of nodes) if (!terrain.anchors.has(k)) drawJoint(p[0], p[1], false);
    for (const a of L.anchors) drawJoint(a[0], a[1], true);
    if (drag) {
      const ok = drag.ok;
      drawMember(drag.x, drag.y, drag.ex, drag.ey, tool, null, 0.75);
      const len = Math.hypot(drag.ex - drag.x, drag.ey - drag.y);
      // reach circle
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx(drag.x), sy(drag.y), MATS[tool].max * view.s, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = ok ? '#7dff9a' : '#ff6a6a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx(drag.ex), sy(drag.ey), Math.max(8, view.s * 0.3), 0, Math.PI * 2); ctx.stroke();
      if (len > 0) {
        const txt = len.toFixed(1) + ' m  $' + Math.round(len * MATS[tool].price);
        ctx.font = 'bold 14px system-ui'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000a'; ctx.lineWidth = 3;
        const tx = sx(drag.ex) + 16, ty = sy(drag.ey) - 16;
        ctx.strokeText(txt, tx, ty); ctx.fillText(txt, tx, ty);
      }
    } else if (hover && hover.node && tool !== 'erase') {
      ctx.strokeStyle = '#fff8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx(hover.node[0]), sy(hover.node[1]), Math.max(10, view.s * 0.35), 0, Math.PI * 2); ctx.stroke();
    }
    // van waiting
    const V = VEHICLES[L.veh];
    drawVan(-3.2 - V.wb, L.ly + V.r, 0, V, 0);
  } else if (mode === 'sim' && sim) {
    const S = sim, P = S.P;
    const order = ['cable', 'wood', 'steel'];
    for (const o of order) for (const c of S.cons) if (!c.broken && c.m === o) drawMember(P[c.a].x, P[c.a].y, P[c.b].x, P[c.b].y, c.m, c.half ? null : Math.abs(c.f) / (c.f >= 0 ? c.mat.str : compLimit(c.mat, c.rest)));
    drawVehicle(S);
    for (const c of S.cons) if (!c.broken && c.m === 'road') drawMember(P[c.a].x, P[c.a].y, P[c.b].x, P[c.b].y, c.m, c.half ? null : Math.abs(c.f) / (c.f >= 0 ? c.mat.str : compLimit(c.mat, c.rest)));
    for (let i = 0; i < S.vi; i++) if (P[i].mass > 0) drawJoint(P[i].x, P[i].y, P[i].fixed);
    for (const d of S.debris) {
      ctx.globalAlpha = Math.max(0, d.t);
      ctx.fillStyle = d.c === 'steel' ? '#9bb8d8' : d.c === 'cable' ? '#333' : d.c === 'road' ? '#555' : '#d9a05b';
      ctx.fillRect(sx(d.x) - 3, sy(d.y) - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
    if (S.splash) {
      const k = S.splash.t;
      ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, 1 - k)})`; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.ellipse(sx(S.splash.x), sy(terrain.water), (k * 2 + i * 0.5) * view.s, (k * 0.4 + i * 0.1) * view.s, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawTitleBg(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2b3a67'); g.addColorStop(0.6, '#c86b6b'); g.addColorStop(1, '#f3b46b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// ---------- Input ----------
function snapNear(px, py) {
  const x = wx(px), y = wy(py);
  const rx = Math.round(x), ry = Math.round(y);
  return [rx, ry, Math.hypot(x - rx, y - ry)];
}
function nodeAt(px, py) {
  const x = wx(px), y = wy(py);
  const rad = Math.max(0.55, 22 / view.s);
  let best = null, bd = rad;
  const consider = (nx, ny) => { const d = Math.hypot(nx - x, ny - y); if (d < bd) { bd = d; best = [nx, ny]; } };
  for (const a of L.anchors) consider(a[0], a[1]);
  for (const p of nodesOf(design).values()) consider(p[0], p[1]);
  return best;
}
function memberAt(px, py) {
  const x = wx(px), y = wy(py);
  let best = null, bd = Math.max(0.35, 14 / view.s);
  for (const m of design) {
    const d = segDist(x, y, m.x1, m.y1, m.x2, m.y2).d;
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}
function dragTarget(px, py) {
  const mat = MATS[tool];
  let x = wx(px), y = wy(py);
  const dx = x - drag.x, dy = y - drag.y, d = Math.hypot(dx, dy);
  if (d > mat.max) { x = drag.x + dx / d * mat.max; y = drag.y + dy / d * mat.max; }
  // try snapping to an existing joint first
  const n = nodeAt(sx(x), sy(y));
  const cand = [];
  if (n) cand.push([n[0], n[1], -1]);
  for (let gx = Math.floor(x) - 1; gx <= Math.ceil(x) + 1; gx++) for (let gy = Math.floor(y) - 1; gy <= Math.ceil(y) + 1; gy++) cand.push([gx, gy, Math.hypot(gx - x, gy - y)]);
  cand.sort((a, b) => a[2] - b[2]);
  for (const c of cand) {
    const l = Math.hypot(c[0] - drag.x, c[1] - drag.y);
    if (l < 0.5 || l > mat.max + 1e-6) continue;
    if (!validNode(c[0], c[1])) continue;
    return [c[0], c[1], true];
  }
  return [Math.round(x), Math.round(y), false];
}
function hasMember(x1, y1, x2, y2) {
  return design.some((m) => (m.x1 === x1 && m.y1 === y1 && m.x2 === x2 && m.y2 === y2) || (m.x1 === x2 && m.y1 === y2 && m.x2 === x1 && m.y2 === y1));
}
function pushUndo() { undoStack.push(design.map((m) => Object.assign({}, m))); if (undoStack.length > 100) undoStack.shift(); }
function changed() { save.designs[LI] = design.map((m) => Object.assign({}, m)); persist(); updateUI(); }

let erasing = false;
function eraseAt(px, py) {
  const m = memberAt(px, py);
  if (!m) return;
  if (!erasing) { pushUndo(); erasing = true; }
  design = design.filter((q) => q !== m);
  sfx.erase(); changed();
}

function pointerPos(e) { const r = C.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

C.addEventListener('pointerdown', (e) => {
  if (e.button === 2) return;
  audio();
  if (paused || mode !== 'build') return;
  e.preventDefault();
  try { C.setPointerCapture(e.pointerId); } catch (er) {}
  const [px, py] = pointerPos(e);
  if (tool === 'erase') { erasing = false; eraseAt(px, py); drag = { erase: true }; return; }
  const n = nodeAt(px, py);
  if (!n) { hover = null; return; }
  drag = { x: n[0], y: n[1], ex: n[0], ey: n[1], ok: false, id: e.pointerId };
});
C.addEventListener('pointermove', (e) => {
  if (mode !== 'build' || paused) return;
  const [px, py] = pointerPos(e);
  if (drag && drag.erase) { eraseAt(px, py); return; }
  if (drag) {
    const [ex, ey, ok] = dragTarget(px, py);
    if (ex !== drag.ex || ey !== drag.ey) { drag.ex = ex; drag.ey = ey; }
    drag.ok = ok && !hasMember(drag.x, drag.y, ex, ey);
    return;
  }
  if (e.pointerType === 'mouse') {
    hover = tool === 'erase' ? { member: memberAt(px, py) } : { node: nodeAt(px, py) };
  }
});
function endDrag(e) {
  if (!drag) return;
  if (drag.erase) { drag = null; erasing = false; return; }
  const d = drag; drag = null;
  if (d.ok && (d.ex !== d.x || d.ey !== d.y)) {
    pushUndo();
    design.push({ x1: d.x, y1: d.y, x2: d.ex, y2: d.ey, m: tool });
    sfx.place(tool); changed();
  } else if (d.ex !== d.x || d.ey !== d.y) sfx.bad();
}
C.addEventListener('pointerup', endDrag);
C.addEventListener('pointercancel', () => { drag = null; erasing = false; });

// Pause: Escape or right click anywhere. The context menu never shows.
function rightPause(e) {
  if (e.button !== 2) return;
  e.preventDefault(); e.stopPropagation();
  if (drag) { drag = null; return; }
  togglePause();
}
window.addEventListener('pointerdown', rightPause, true);
window.addEventListener('mousedown', (e) => { if (e.button === 2) e.preventDefault(); }, true);
window.addEventListener('contextmenu', (e) => e.preventDefault(), true);
function togglePause() {
  if (mode !== 'build' && mode !== 'sim') return;
  if (paused) resume(); else pause();
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); togglePause(); }
});

// ---------- UI ----------
const bar = $('bar'), hud = $('hud');
function updateUI() {
  const inGame = mode === 'build' || mode === 'sim';
  bar.style.display = inGame ? 'flex' : 'none';
  hud.style.display = inGame ? 'flex' : 'none';
  $('pauseBtn').style.display = inGame ? 'block' : 'none';
  if (!inGame) return;
  $('lvName').textContent = (LI + 1) + '. ' + L.name;
  $('veh').textContent = VEHICLES[L.veh].name + ' ' + VEHICLES[L.veh].mass + ' t';
  const cost = costOf(design);
  const cEl = $('cost');
  cEl.textContent = '$' + cost.toLocaleString('en-US') + ' / $' + L.budget.toLocaleString('en-US');
  cEl.classList.toggle('over', cost > L.budget);
  const pct = Math.min(1, cost / L.budget);
  $('costFill').style.width = (pct * 100) + '%';
  $('costFill').classList.toggle('over', cost > L.budget);
  const b = save.best[LI];
  $('best').textContent = b ? 'Best $' + b.cost.toLocaleString('en-US') + ' ' + '★'.repeat(b.stars) : '';
  const build = mode === 'build';
  document.querySelectorAll('#bar .tool').forEach((el) => { el.style.display = build ? '' : 'none'; el.classList.toggle('on', el.dataset.tool === tool); });
  $('undoBtn').style.display = build ? '' : 'none';
  $('clearBtn').style.display = build ? '' : 'none';
  $('undoBtn').disabled = undoStack.length === 0;
  $('goBtn').style.display = build ? '' : 'none';
  $('stopBtn').style.display = build ? 'none' : '';
  $('slowBtn').style.display = build ? 'none' : '';
  $('slowBtn').classList.toggle('on', slow);
  const mat = MATS[tool];
  $('toolInfo').textContent = build ? (tool === 'erase' ? 'Tap or swipe parts to remove them' : `${mat.name}: $${mat.price}/m, up to ${mat.max} m${mat.cable ? ', pulls only' : ''}${mat.road ? ', van drives on it' : ''}`) : 'Stress: green is fine, red is about to snap';
}

document.querySelectorAll('#bar .tool').forEach((el) => el.addEventListener('click', () => { audio(); tool = el.dataset.tool; hover = null; sfx.click(); updateUI(); }));
$('undoBtn').addEventListener('click', () => { if (!undoStack.length) return; design = undoStack.pop(); sfx.erase(); changed(); });
$('clearBtn').addEventListener('click', () => { if (!design.length) return; pushUndo(); design = []; sfx.erase(); changed(); });
$('goBtn').addEventListener('click', () => { audio(); sfx.click(); startSim(); });
$('stopBtn').addEventListener('click', () => { sfx.click(); stopSim(); });
$('slowBtn').addEventListener('click', () => { slow = !slow; sfx.click(); updateUI(); });
$('pauseBtn').addEventListener('click', () => { audio(); togglePause(); });

function stopSim() { sim = null; mode = 'build'; hideOverlay(); shake = 0; updateUI(); }

function showTip(text, title, sub) {
  tipBox.innerHTML = `<button class="x" aria-label="Close">✕</button><div class="tsub">${sub || ''}</div><div class="ttitle">${title || ''}</div><div class="ttext">${text}</div>`;
  tipBox.classList.add('show');
  tipBox.querySelector('.x').addEventListener('click', hideTip);
}
function hideTip() { tipBox.classList.remove('show'); }

function showOverlay(html) { overlay.innerHTML = html; overlay.classList.add('show'); }
function hideOverlay() { overlay.classList.remove('show'); overlay.innerHTML = ''; }

function pause() {
  paused = true;
  showOverlay(`<div class="panel"><h2>Paused</h2>
    <button class="big" data-a="resume">Resume</button>
    ${mode === 'sim' ? '<button class="big alt" data-a="stop">Back to building</button>' : ''}
    <button class="big alt" data-a="levels">Levels</button>
    <div class="hint">Escape or right click pauses.</div></div>`);
  bindOverlay();
}
function resume() { paused = false; hideOverlay(); lastT = performance.now(); }

function bindOverlay() {
  overlay.querySelectorAll('[data-a]').forEach((el) => el.addEventListener('click', () => {
    audio(); sfx.click();
    const a = el.dataset.a;
    if (a === 'resume') resume();
    else if (a === 'stop') { paused = false; stopSim(); }
    else if (a === 'levels') { paused = false; showLevels(); }
    else if (a === 'play') showLevels();
    else if (a === 'next') loadLevel(Math.min(LI + 1, window.TT_LEVELS.length - 1));
    else if (a === 'retry') { stopSim(); }
    else if (a === 'replay') { hideOverlay(); startSim(); }
    else if (a.startsWith('lv')) loadLevel(+a.slice(2));
    else if (a === 'title') showTitle();
  }));
  const x = overlay.querySelector('.x');
  if (x) x.addEventListener('click', () => { hideOverlay(); });
}

function starsFor(cost, budget) {
  if (cost > budget) return 0;
  if (cost <= budget * 0.72) return 3;
  if (cost <= budget * 0.86) return 2;
  return 1;
}

function showResult(won) {
  const cost = costOf(design);
  if (won) {
    const st = starsFor(cost, L.budget);
    let note;
    if (st === 0) note = `Over budget by $${(cost - L.budget).toLocaleString('en-US')}. Trim it to pass.`;
    else {
      const prev = save.best[LI];
      if (!prev || cost < prev.cost) save.best[LI] = { cost, stars: Math.max(st, prev ? prev.stars : 0) };
      else if (st > prev.stars) prev.stars = st;
      save.unlocked = Math.max(save.unlocked, Math.min(window.TT_LEVELS.length, LI + 2));
      persist();
      note = st === 3 ? 'Lean and mean!' : st === 2 ? `3 stars at $${Math.floor(L.budget * 0.72).toLocaleString('en-US')}.` : `2 stars at $${Math.floor(L.budget * 0.86).toLocaleString('en-US')}.`;
    }
    const last = LI === window.TT_LEVELS.length - 1;
    showOverlay(`<div class="panel result"><button class="x" aria-label="Close">✕</button>
      <h2>${st ? 'Delivered!' : 'Made it…'}</h2>
      <div class="stars">${[0, 1, 2].map((i) => `<span class="${i < st ? 'on' : ''}">★</span>`).join('')}</div>
      <div class="stat">Cost <b>$${cost.toLocaleString('en-US')}</b> of $${L.budget.toLocaleString('en-US')}</div>
      <div class="note">${note}</div>
      ${st && !last ? '<button class="big gold" data-a="next">Next level</button>' : ''}
      ${st && last ? '<div class="note">That was the last gap. Go back for more stars!</div>' : ''}
      <button class="big alt" data-a="retry">Keep building</button>
      <button class="big alt" data-a="levels">Levels</button></div>`);
  } else {
    const S = sim;
    showOverlay(`<div class="panel result"><button class="x" aria-label="Close">✕</button>
      <h2>Splash!</h2>
      <div class="note">${S && S.broke ? `${S.broke} part${S.broke > 1 ? 's' : ''} snapped. Red parts were overloaded.` : 'The van did not make it across.'}</div>
      <button class="big" data-a="retry">Fix the bridge</button>
      <button class="big alt" data-a="replay">Watch again</button></div>`);
  }
  bindOverlay();
}

function showTitle() {
  mode = 'title'; terrain = null; L = null; sim = null; paused = false; hideTip(); updateUI();
  showOverlay(`<div class="panel title">
    <div class="logo">Trestle<br>Trouble</div>
    <div class="tag">Build a bridge. Send the parcel van across. Try not to drop it in the river.</div>
    <button class="big gold" data-a="play">Play</button>
    <div class="hint">Drag from a bolt to build. Tap GO to test.<br>Escape or right click pauses.</div></div>`);
  bindOverlay();
}

function showLevels() {
  mode = 'levels'; sim = null; paused = false; hideTip(); updateUI();
  const items = window.TT_LEVELS.map((lv, i) => {
    const b = save.best[i], locked = i + 1 > save.unlocked;
    return `<button class="lv ${locked ? 'locked' : ''} ${b ? 'done' : ''}" ${locked ? 'disabled' : `data-a="lv${i}"`}>
      <span class="n">${i + 1}</span><span class="t">${lv.name}</span>
      <span class="s">${locked ? '🔒' : [0, 1, 2].map((k) => `<i class="${b && k < b.stars ? 'on' : ''}">★</i>`).join('')}</span></button>`;
  }).join('');
  showOverlay(`<div class="panel levels"><h2>Pick a gap</h2><div class="grid">${items}</div>
    <button class="big alt" data-a="title">Back</button></div>`);
  bindOverlay();
}

// ---------- Loop ----------
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  C.width = Math.round(W * DPR); C.height = Math.round(H * DPR);
  C.style.width = W + 'px'; C.style.height = H + 'px';
  fitView();
}
window.addEventListener('resize', resize);

let lastT = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  if (mode === 'sim' && sim && !paused) {
    acc += dt * (slow ? 0.25 : 1);
    let n = 0;
    while (acc >= FRAME && n < 4) { stepSim(sim, FRAME); acc -= FRAME; n++; }
    if (n === 4) acc = 0;
  }
  if (shake > 0) shake = Math.max(0, shake - dt * 2);
  draw(now / 1000);
  requestAnimationFrame(frame);
}

resize();
showTitle();
requestAnimationFrame(frame);

// Debug / test hook
window.__tt = {
  get mode() { return mode; }, get sim() { return sim; }, get design() { return design; },
  load: loadLevel,
  set(members) { design = members.map((m) => Object.assign({}, m)); changed(); },
  cost: () => costOf(design),
  go: startSim, stop: stopSim,
  run(sec) { const out = []; for (let t = 0; t < sec && sim; t += FRAME) { stepSim(sim, FRAME); if (sim.state === 'shown') break; } return sim && { state: sim.result || sim.state, t: sim.t, broke: sim.broke, max: sim.maxStress }; },
  valid: (x, y) => validNode(x, y),
  toScreen: (x, y) => [sx(x), sy(y)],
  get paused() { return paused; },
  MATS, VEHICLES,
};
})();
