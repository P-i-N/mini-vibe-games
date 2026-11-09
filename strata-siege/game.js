'use strict';
/* Strata Siege - a one-handed tower defense played on three layers.
   Sky: move a weather cloud. Ground: build towers. Underground: send hamsters digging for loot.
   Controls: tap / click only. Escape or right click pauses. */
(() => {
  const W = 480, H = 800;
  const HUD_H = 48, CELL = 40, COLS = 12, GROWS = 7, UROWS = 7;
  const GROUND_Y = 190, UG_Y = GROUND_Y + GROWS * CELL, BAR_Y = UG_Y + UROWS * CELL; // 470, 750
  const CLOUD_Y = 88, FLY_Y = 146;
  const SAVE_KEY = 'stratasiege.save.v1', BEST_KEY = 'stratasiege.best.v1', MUTE_KEY = 'stratasiege.mute';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('wrap');
  const ov = document.getElementById('overlay');
  const pop = document.getElementById('pop');
  const pauseBtn = document.getElementById('pauseBtn');

  // ---------- storage helpers ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  // ---------- sizing ----------
  let scale = 1, dpr = 1;
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    scale = Math.min(vw / W, vh / H);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cw = Math.floor(W * scale), ch = Math.floor(H * scale);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    wrap.style.width = cw + 'px'; wrap.style.height = ch + 'px';
    wrap.style.fontSize = Math.max(11, 16 * scale) + 'px';
    closePop();
  }
  window.addEventListener('resize', resize);

  // ---------- audio ----------
  let actx = null, muted = store.get(MUTE_KEY, false);
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
    if (actx && actx.state === 'suspended') actx.resume();
  }
  const lastSfx = {};
  function beep(freq, dur = 0.06, type = 'square', vol = 0.05, slide = 0, key = null) {
    if (muted || !actx) return;
    if (key) { const t = performance.now(); if (lastSfx[key] && t - lastSfx[key] < 45) return; lastSfx[key] = t; }
    const t0 = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const sfx = {
    shoot: () => beep(720, 0.03, 'square', 0.012, -200, 'sh'),
    kill: () => beep(420, 0.06, 'triangle', 0.035, 260, 'kill'),
    dig: () => beep(130, 0.04, 'square', 0.02, 0, 'dig'),
    loot: () => { beep(660, 0.08, 'triangle', 0.06, 300); setTimeout(() => beep(990, 0.12, 'triangle', 0.06, 300), 80); },
    bad: () => beep(170, 0.3, 'sawtooth', 0.06, -100),
    zap: () => beep(1400, 0.09, 'sawtooth', 0.03, -1100, 'zap'),
    boom: () => beep(120, 0.2, 'sawtooth', 0.045, -80, 'boom'),
    build: () => beep(300, 0.08, 'triangle', 0.06, 250),
    buy: () => { beep(700, 0.06, 'triangle', 0.06); setTimeout(() => beep(1100, 0.09, 'triangle', 0.06), 60); },
    nope: () => beep(140, 0.12, 'square', 0.05),
    leak: () => beep(260, 0.3, 'sawtooth', 0.07, -200),
    wave: () => { beep(220, 0.18, 'sawtooth', 0.04, 110); setTimeout(() => beep(330, 0.25, 'sawtooth', 0.04, 0), 160); },
    clear: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.14, 'triangle', 0.07), i * 90)),
    tick: () => beep(900, 0.03, 'sine', 0.03),
  };

  // ---------- utils ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // Emoji are rendered once into small offscreen canvases, then blitted (fast on phones).
  const sprCache = {};
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  function spr(e) {
    let c = sprCache[e];
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = 96;
      const g = c.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '72px ' + EMOJI_FONT; g.fillText(e, 48, 53);
      sprCache[e] = c;
    }
    return c;
  }
  function emo(e, x, y, s, flip) {
    const c = spr(e);
    if (flip) { ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); ctx.drawImage(c, -s / 2, -s / 2, s, s); ctx.restore(); }
    else ctx.drawImage(c, x - s / 2, y - s / 2, s, s);
  }

  // ---------- catalogue ----------
  const TOWERS = {
    pea: { name: 'Pea Pod', icon: '🌱', cost: 30, dmg: 8, rate: 0.55, range: 88, ground: true, air: false, color: '#9dff6b', desc: 'Spits peas at walkers' },
    kite: { name: 'Kite Launcher', icon: '🪁', cost: 40, dmg: 16, rate: 0.8, range: 130, ground: false, air: true, color: '#ff8ad8', desc: 'Only hits flyers, hard' },
    ice: { name: 'Brain Freeze', icon: '🍦', cost: 50, dmg: 3, rate: 1.0, range: 80, ground: true, air: true, slow: 0.45, splash: 34, color: '#bdf3ff', desc: 'Slows everything nearby' },
    mortar: { name: 'Teapot Mortar', icon: '🫖', cost: 70, dmg: 24, rate: 1.9, range: 135, ground: true, air: false, splash: 42, color: '#d9a066', desc: 'Lobs boiling tea, splash' },
    tesla: { name: 'Tesla Toaster', icon: '🍞', cost: 90, dmg: 13, rate: 1.1, range: 100, ground: true, air: true, chain: 3, color: '#cfe0ff', desc: 'Lightning that jumps' },
  };
  const TOWER_ORDER = ['pea', 'kite', 'ice', 'mortar', 'tesla'];
  const FOES = {
    rat: { icon: '🐀', hp: 16, spd: 58, coin: 3, size: 26, cost: 1, gap: 0.55 },
    snail: { icon: '🐌', hp: 38, spd: 27, coin: 4, size: 27, cost: 1.6, gap: 0.95 },
    beetle: { icon: '🪲', hp: 46, spd: 34, coin: 6, armor: 3, size: 25, cost: 2.4, gap: 0.9 },
    hedgehog: { icon: '🦔', hp: 75, spd: 40, coin: 8, armor: 2, size: 28, cost: 3.4, gap: 1 },
    balloon: { icon: '🎈', hp: 28, spd: 30, coin: 5, fly: true, size: 30, cost: 2, gap: 1.1 },
    duck: { icon: '🦆', hp: 22, spd: 60, coin: 5, fly: true, size: 28, cost: 2, gap: 0.6 },
    worm: { icon: '🐛', hp: 30, spd: 38, coin: 4, size: 24, gap: 0.5 },
    ogre: { icon: '👹', hp: 520, spd: 20, coin: 50, hearts: 5, size: 46, boss: true, gap: 2 },
    dragon: { icon: '🐲', hp: 400, spd: 22, coin: 50, hearts: 5, size: 46, fly: true, boss: true, gap: 2 },
  };
  const LOOT = {
    gem: { icon: '💎', w: 40 }, coins: { icon: '💰', w: 22 }, fossil: { icon: '🦴', w: 8, minRow: 2 },
    spring: { icon: '💧', w: 9 }, heart: { icon: '❤️', w: 5 }, mushroom: { icon: '🍄', w: 6 },
    relic: { icon: '🏺', w: 8, minRow: 3 }, blueprint: { icon: '📜', w: 5, minRow: 3 },
  };
  const HAZ = { gas: { icon: '🤢' }, cave: { icon: '🪨' }, nest: { icon: '🐛' } };
  const WEATHER = {
    off: { icon: '💤', label: 'rest', cloud: '#ffffff' },
    rain: { icon: '🌧️', label: 'rain', cloud: '#aab6cc', tint: '80,150,255', drain: 5 },
    storm: { icon: '⛈️', label: 'storm', cloud: '#5b6079', tint: '190,140,255', drain: 0 },
    sun: { icon: '☀️', label: 'sun', cloud: '#fff3c4', tint: '255,220,90', drain: 5 },
    wind: { icon: '🌬️', label: 'wind', cloud: '#d8f1ff', tint: '220,240,255', drain: 8 },
  };
  // Paths are lists of [column, row] corners on the 12x7 ground grid. Column -1 is off-screen.
  const LAYOUTS = [
    { name: 'Meadow Switchback', pts: [[-1, 1], [9, 1], [9, 3], [2, 3], [2, 5], [11, 5]] },
    { name: 'Turnip Hills', pts: [[-1, 5], [2, 5], [2, 1], [6, 1], [6, 5], [9, 5], [9, 2], [11, 2]] },
    { name: 'Crooked Creek', pts: [[-1, 1], [4, 1], [4, 5], [8, 5], [8, 1], [11, 1]] },
    { name: 'Goat Pass', pts: [[-1, 6], [4, 6], [4, 1], [8, 1], [8, 5], [11, 5]] },
    { name: 'Long Lane', pts: [[-1, 3], [2, 3], [2, 0], [6, 0], [6, 6], [10, 6], [10, 3], [11, 3]] },
  ];
  const TIPS = {
    1: 'Tap grass to build towers. Tap the dirt below to dig for loot.',
    2: 'Balloons fly over the path. Kite Launchers and storms stop them.',
    3: 'Tap the sky to move your cloud. Pick its weather at the bottom.',
    4: 'Rain softens the soil: hamsters dig twice as fast under it.',
    5: 'BOSS! Something big is coming in the last wave.',
  };

  const CATS = [{ id: 'tow', name: '🗼 Towers' }, { id: 'mine', name: '⛏️ Mining' }, { id: 'sky', name: '☁️ Sky' }, { id: 'keep', name: '🏰 Castle' }];
  const ITEMS = [
    { id: 't_ice', cat: 'tow', icon: '🍦', name: 'Brain Freeze', max: 1, base: 10, grow: 1, desc: () => 'New tower: splashes ice cream that slows walkers and flyers.' },
    { id: 't_mortar', cat: 'tow', icon: '🫖', name: 'Teapot Mortar', max: 1, base: 16, grow: 1, desc: () => 'New tower: long-range splash damage. Ground only.' },
    { id: 't_tesla', cat: 'tow', icon: '🍞', name: 'Tesla Toaster', max: 1, base: 24, grow: 1, desc: () => 'New tower: chain lightning that hits ground and air.' },
    { id: 'spicy', cat: 'tow', icon: '🌶️', name: 'Spicy Ammo', max: 5, base: 8, grow: 1.6, desc: (l) => `All towers deal +${(l + 1) * 15}% damage.` },
    { id: 'stilts', cat: 'tow', icon: '🦒', name: 'Tower Stilts', max: 4, base: 8, grow: 1.6, desc: (l) => `All towers see ${(l + 1) * 8}% further.` },
    { id: 'espresso', cat: 'tow', icon: '☕', name: 'Espresso Drip', max: 4, base: 9, grow: 1.6, desc: (l) => `All towers fire ${(l + 1) * 10}% faster. Jittery.` },
    { id: 'bulk', cat: 'tow', icon: '🧱', name: 'Bulk Bricks', max: 3, base: 10, grow: 1.7, desc: (l) => `Building and upgrading towers costs ${(l + 1) * 8}% less.` },
    { id: 'refund', cat: 'tow', icon: '🧾', name: 'Kept the Receipt', max: 1, base: 7, grow: 1, desc: () => 'Selling a tower refunds 100% instead of 70%.' },

    { id: 'mole', cat: 'mine', icon: '🐹', name: 'Hire a Hamster', max: 3, base: 12, grow: 1.8, desc: (l) => `One more digger. You have ${l + 1}.` },
    { id: 'pick', cat: 'mine', icon: '⛏️', name: 'Diamond Picks', max: 4, base: 7, grow: 1.6, desc: (l) => `Digging is ${(l + 1) * 25}% faster.` },
    { id: 'union', cat: 'mine', icon: '🤝', name: 'Union Discount', max: 3, base: 8, grow: 1.7, desc: (l) => `Digging costs ${(l + 1) * 15}% less.` },
    { id: 'detector', cat: 'mine', icon: '📡', name: 'Metal Detector', max: 1, base: 9, grow: 1, desc: () => 'Glints turn gold for treasure and red for danger.' },
    { id: 'helmet', cat: 'mine', icon: '⛑️', name: 'Gas Mask', max: 1, base: 10, grow: 1, desc: () => 'Stink pockets no longer knock out your hamsters.' },
    { id: 'supports', cat: 'mine', icon: '🪵', name: 'Wooden Props', max: 1, base: 10, grow: 1, desc: () => 'No more cave-ins.' },
    { id: 'socks', cat: 'mine', icon: '🧦', name: 'Lucky Socks', max: 3, base: 9, grow: 1.7, desc: (l) => `${(l + 1) * 5}% more tiles hide treasure.` },
    { id: 'bait', cat: 'mine', icon: '🧀', name: 'Worm Repellent', max: 2, base: 9, grow: 1.8, desc: (l) => `Worm nests release ${l ? 'far fewer' : 'fewer'} worms.` },

    { id: 'wind', cat: 'sky', icon: '🌬️', name: 'Bottled Wind', max: 1, base: 14, grow: 1, desc: () => 'New weather: blows flyers backwards and slows walkers everywhere.' },
    { id: 'spyglass', cat: 'sky', icon: '🔭', name: 'Spy Cloud', max: 1, base: 12, grow: 1, desc: () => 'Your cloud spies straight through the soil: everything buried under it is revealed.' },
    { id: 'fluffy', cat: 'sky', icon: '☁️', name: 'Fluffier Cloud', max: 3, base: 7, grow: 1.6, desc: (l) => `Cloud is ${(l + 1) * 20}% wider.` },
    { id: 'puddle', cat: 'sky', icon: '🪣', name: 'Bigger Bucket', max: 3, base: 7, grow: 1.6, desc: (l) => `Cloud holds ${(l + 1) * 30}% more water.` },
    { id: 'thunder', cat: 'sky', icon: '⚡', name: 'Thunder Juice', max: 4, base: 9, grow: 1.6, desc: (l) => `Lightning deals +${(l + 1) * 30}% damage.` },
    { id: 'sticky', cat: 'sky', icon: '🍯', name: 'Sticky Rain', max: 3, base: 8, grow: 1.6, desc: (l) => `Rain slows enemies by ${30 + (l + 1) * 10}%.` },
    { id: 'tan', cat: 'sky', icon: '🕶️', name: 'Magnifying Glass', max: 2, base: 9, grow: 1.7, desc: (l) => `Sunbeam speeds towers up by ${60 + (l + 1) * 25}%.` },

    { id: 'walls', cat: 'keep', icon: '🏰', name: 'Thicker Walls', max: 3, base: 7, grow: 1.6, desc: (l) => `Castle starts with ${10 + (l + 1) * 3} hearts.` },
    { id: 'piggy', cat: 'keep', icon: '🐷', name: 'Piggy Bank', max: 5, base: 6, grow: 1.5, desc: (l) => `Start each level with ${90 + (l + 1) * 25} coins.` },
    { id: 'bounty', cat: 'keep', icon: '🎯', name: 'Pest Bounty', max: 4, base: 9, grow: 1.6, desc: (l) => `Enemies drop ${(l + 1) * 15}% more coins.` },
    { id: 'polisher', cat: 'keep', icon: '✨', name: 'Gem Polisher', max: 2, base: 11, grow: 1.8, desc: (l) => `Leftover coins turn into gems at ${[12, 10][l] || 10} per gem (now ${[15, 12, 10][l]}).` },
    { id: 'hurry', cat: 'keep', icon: '⏩', name: 'Impatience Pays', max: 2, base: 6, grow: 1.7, desc: (l) => `Calling a wave early pays ${(l + 1) * 50}% more.` },
    { id: 'moat', cat: 'keep', icon: '🦆', name: 'Rubber Duck Moat', max: 2, base: 12, grow: 1.7, desc: (l) => `Walkers near the castle are ${(l + 1) * 20}% slower. Squeak.` },
  ];
  const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

  // ---------- run / save ----------
  let run = null;
  const lv = (id) => (run && run.up[id]) || 0;
  function newRun() { return { level: 1, gems: 0, up: {}, score: 0 }; }
  function saveRun() { if (run) store.set(SAVE_KEY, run); }
  function loadRun() {
    const r = store.get(SAVE_KEY, null);
    if (!r || typeof r.level !== 'number') return null;
    r.up = r.up || {}; r.gems = r.gems || 0; r.score = r.score || 0;
    return r;
  }
  let best = store.get(BEST_KEY, { level: 0 });
  function recordBest() { if (run.level > best.level) { best = { level: run.level }; store.set(BEST_KEY, best); } }

  function itemCost(it) { return Math.round(it.base * Math.pow(it.grow, lv(it.id))); }
  function itemState(it) {
    if (lv(it.id) >= it.max) return 'max';
    return run.gems >= itemCost(it) ? 'ok' : 'poor';
  }
  function buy(it) {
    if (itemState(it) !== 'ok') { sfx.nope(); return false; }
    run.gems -= itemCost(it); run.up[it.id] = lv(it.id) + 1;
    sfx.buy(); saveRun(); return true;
  }
  const towerUnlocked = (k) => k === 'pea' || k === 'kite' || lv('t_' + k) > 0;

  // ---------- derived numbers ----------
  const hpMul = (n) => 1 + 0.18 * (n - 1) + 0.012 * (n - 1) * (n - 1);
  const coinMul = () => (1 + 0.1 * (run.level - 1)) * (1 + 0.15 * lv('bounty'));
  const cloudHalf = () => 46 * (1 + 0.2 * lv('fluffy'));
  const inCol = (x) => Math.abs(x - G.cloud.x) <= cloudHalf();
  const towerCostMul = () => 1 - 0.08 * lv('bulk');
  const buildCost = (k) => Math.round(TOWERS[k].cost * towerCostMul());
  const upgradeCost = (t) => Math.round(TOWERS[t.k].cost * 0.9 * t.lvl * towerCostMul());
  const sellValue = (t) => Math.round(t.spent * (lv('refund') ? 1 : 0.7));
  const towerDmg = (t) => TOWERS[t.k].dmg * Math.pow(1.6, t.lvl - 1) * (1 + 0.15 * lv('spicy')) * (1 + G.relicDmg);
  const towerRange = (t) => TOWERS[t.k].range * (1 + 0.12 * (t.lvl - 1)) * (1 + 0.08 * lv('stilts'));
  const digCost = (r) => (G.freeDigs > 0 ? 0 : Math.round((8 + 4 * r) * (1 - 0.15 * lv('union'))));
  const digTime = (tile) => tile.hard * 2.6 / (1 + 0.25 * lv('pick'));
  const gemRate = () => [15, 12, 10][lv('polisher')];

  // ---------- geometry ----------
  const gCenter = (c, r) => ({ x: c * CELL + CELL / 2, y: GROUND_Y + r * CELL + CELL / 2 });
  const uCenter = (c, r) => ({ x: c * CELL + CELL / 2, y: UG_Y + r * CELL + CELL / 2 });
  function buildPath(ptsCR) {
    const pts = ptsCR.map(([c, r]) => gCenter(c, r));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const cells = new Set();
    for (let i = 1; i < ptsCR.length; i++) {
      let [c0, r0] = ptsCR[i - 1]; const [c1, r1] = ptsCR[i];
      const dc = Math.sign(c1 - c0), dr = Math.sign(r1 - r0);
      for (;;) { if (c0 >= 0 && c0 < COLS) cells.add(r0 * COLS + c0); if (c0 === c1 && r0 === r1) break; c0 += dc; r0 += dr; }
    }
    return { pts, cum, len: cum[cum.length - 1], cells };
  }
  function posAt(d) {
    const P = G.path; d = clamp(d, 0, P.len);
    let i = 1; while (i < P.cum.length - 1 && P.cum[i] < d) i++;
    const a = P.pts[i - 1], b = P.pts[i], seg = P.cum[i] - P.cum[i - 1];
    const t = seg ? (d - P.cum[i - 1]) / seg : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: b.x - a.x };
  }

  // ---------- level generation ----------
  function genWaves(n) {
    const nw = Math.min(3 + Math.floor(n / 2), 8);
    const waves = [];
    for (let w = 0; w < nw; w++) {
      const pool = ['rat', 'snail'];
      if (n >= 3) pool.push('beetle');
      if (n >= 7) pool.push('hedgehog');
      const air = [];
      if (n >= 2 && (w >= nw - 1 || n >= 3)) air.push('balloon');
      if (n >= 5) air.push('duck');
      let budget = 5 + n * 2.6 + w * 3.5 + w * n * 0.5;
      const main = pick(pool);
      const airShare = air.length ? Math.min(0.32, 0.14 + n * 0.015) : 0;
      const list = [];
      while (budget > 0) {
        const r = Math.random();
        const t = r < airShare ? pick(air) : r < 0.7 ? main : pick(pool);
        list.push(t); budget -= FOES[t].cost;
      }
      if (n === 2 && w === nw - 1 && !list.includes('balloon')) list.push('balloon', 'balloon');
      if (n % 5 === 0 && w === nw - 1) list.push(Math.floor(n / 5) % 2 ? 'ogre' : 'dragon');
      waves.push(list);
    }
    return waves;
  }
  function weighted(table, row) {
    const opts = Object.entries(table).filter(([, v]) => !(v.minRow > row));
    let total = 0; for (const [, v] of opts) total += v.w;
    let r = Math.random() * total;
    for (const [k, v] of opts) { r -= v.w; if (r <= 0) return k; }
    return opts[0][0];
  }
  function genUnderground(shaftCol) {
    const ug = [];
    for (let r = 0; r < UROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        const depth = r + Math.random() * 1.6;
        const hard = depth < 2.2 ? 1 : depth < 4.4 ? 2 : depth < 6.4 ? 3 : 4;
        let content = null;
        const roll = Math.random(), hazP = 0.06 + 0.025 * r, treP = 0.24 + 0.025 * r + 0.05 * lv('socks');
        if (roll < hazP) { const h = Math.random(); content = h < 0.36 ? 'gas' : h < 0.7 ? 'cave' : 'nest'; }
        else if (roll < hazP + treP) content = weighted(LOOT, r);
        row.push({ c, r, hard, content, dug: false, known: false, queued: false, prog: 0, seed: Math.random() });
      }
      ug.push(row);
    }
    const s = ug[0][shaftCol]; s.dug = true; s.content = null;
    for (const [dc, dr] of DIRS) { const t = ug[dr] && ug[dr][shaftCol + dc]; if (t) { t.known = true; if (HAZ[t.content]) t.content = null; } }
    return ug;
  }

  // ---------- game state ----------
  let mode = 'menu'; // menu | play | pause | shop | over
  let G = null;
  let lastSummary = null;
  let speed = 1;

  function startLevel() {
    const n = run.level;
    const L = LAYOUTS[(n - 1) % LAYOUTS.length];
    const mirror = Math.floor((n - 1) / LAYOUTS.length) % 2 === 1;
    const ptsCR = L.pts.map(([c, r]) => [mirror ? COLS - 1 - c : c, r]);
    const path = buildPath(ptsCR);
    const [cc, cr] = ptsCR[ptsCR.length - 1];
    const grid = new Array(COLS * GROWS).fill(0); // 0 grass, 1 path, 3 castle, 4 mine hut, tower object otherwise
    for (const k of path.cells) grid[k] = 1;
    grid[cr * COLS + cc] = 3;
    let shaftCol = 5;
    for (const c of [5, 6, 4, 7, 3, 8, 2, 9]) if (grid[(GROWS - 1) * COLS + c] === 0) { shaftCol = c; break; }
    grid[(GROWS - 1) * COLS + shaftCol] = 4;
    const maxHearts = 10 + 3 * lv('walls');
    const maxCharge = 100 * (1 + 0.3 * lv('puddle'));
    G = {
      n, name: L.name, path, grid, castle: Object.assign({ c: cc, r: cr }, gCenter(cc, cr)), shaftCol, hut: gCenter(shaftCol, GROWS - 1),
      ug: null, towers: [], enemies: [], shots: [], parts: [], texts: [], bolts: [], miners: [], orders: [],
      coins: 90 + 25 * lv('piggy'), hearts: maxHearts, loot: 0, kills: 0, leaks: 0, digs: 0,
      waves: genWaves(n), waveIdx: 0, spawnQ: [], spawnT: 0, countdown: 20,
      cloud: { x: W / 2, tx: W / 2, charge: maxCharge, max: maxCharge }, weather: 'off', stormT: 0, freeWeather: 0,
      relicDmg: 0, freeDigs: 0, mush: false,
      time: 0, banner: 4.5, clearT: -1, shake: 0, sel: null, minerT: 0, digSfx: 0,
    };
    G.ug = genUnderground(shaftCol);
    // where worms from below join the path: the path point closest to the mine hut
    let bestD = 0, bestDist = 1e9;
    for (let d = 0; d <= path.len; d += 4) { const p = posAt(d); const q = Math.hypot(p.x - G.hut.x, p.y - G.hut.y); if (q < bestDist) { bestDist = q; bestD = d; } }
    G.joinD = bestD;
    for (let i = 0; i < 1 + lv('mole'); i++) {
      const p = uCenter(shaftCol, 0);
      G.miners.push({ c: shaftCol, r: 0, x: p.x + (i - lv('mole') / 2) * 7, y: p.y, state: 'idle', route: [], order: null, t: 0, daze: 0 });
    }
    mode = 'play'; hideOverlay(); closePop(); pauseBtn.style.display = 'block';
  }

  // ---------- effects ----------
  function burst(x, y, color, n = 8, sp = 120) {
    for (let i = 0; i < n; i++) { const a = rand(0, 6.28), v = rand(sp * 0.3, sp); G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: rand(0.25, 0.55), c: color, s: rand(2, 4) }); }
  }
  function ring(x, y, r, color) { G.parts.push({ x, y, ring: r, t: 0.3, T: 0.3, c: color }); }
  function say(x, y, s, c = '#ffffff', big = false) { G.texts.push({ x: clamp(x, 50, W - 50), y, s, c, t: big ? 2.2 : 1.3, big }); }

  // ---------- enemies ----------
  function spawnFoe(k, extra) {
    const F = FOES[k], hp = F.hp * hpMul(G.n);
    const start = G.path.pts[0];
    const e = Object.assign({
      k, F, hp, maxhp: hp, spd: F.spd * rand(0.94, 1.06), armor: (F.armor || 0) * (1 + 0.12 * (G.n - 1)), fly: !!F.fly,
      d: 0, x: start.x, y: F.fly ? FLY_Y + rand(-16, 16) : start.y, dx: 1, slowT: 0, slowA: 0, hearts: F.hearts || 1, flash: 0, wob: rand(0, 6), under: false, dead: false,
    }, extra || {});
    if (e.fly) e.dx = Math.sign(G.castle.x - e.x) || 1;
    G.enemies.push(e);
    if (F.boss) { say(W / 2, GROUND_Y - 30, 'BOSS!', '#ff6b6b', true); sfx.bad(); }
    return e;
  }
  function remaining(e) {
    if (e.fly) return Math.abs(G.castle.x - e.x) + Math.abs(G.castle.y - e.y);
    if (e.route) return 2000 - e.ri;
    return G.path.len - e.d;
  }
  function hurt(e, dmg) {
    if (e.dead) return;
    dmg = Math.max(dmg * 0.25, dmg - e.armor);
    e.hp -= dmg; e.flash = 0.1;
    if (e.hp <= 0) {
      e.dead = true; G.kills++;
      const c = Math.max(1, Math.round(e.F.coin * coinMul()));
      G.coins += c; sfx.kill();
      burst(e.x, e.y, '#ffd84a', e.F.boss ? 30 : 6, e.F.boss ? 220 : 110);
      if (e.F.boss) { G.shake = 10; say(e.x, e.y - 30, '+' + c + ' 🪙', '#ffd84a', true); sfx.boom(); }
    }
  }
  function leak(e) {
    e.dead = true; G.hearts -= e.hearts; G.leaks++; G.shake = 8; sfx.leak();
    say(G.castle.x, G.castle.y - 30, '-' + e.hearts + ' ❤️', '#ff6b6b');
    burst(G.castle.x, G.castle.y, '#ff6b6b', 12, 150);
  }
  function updateEnemies(dt) {
    const rainSlow = 0.3 + 0.1 * lv('sticky'), moat = 0.2 * lv('moat');
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowA = 0; }
      let slow = e.slowA;
      if (!e.under && G.weather === 'rain' && inCol(e.x)) slow = Math.max(slow, rainSlow);
      if (!e.fly && !e.under && moat && Math.hypot(e.x - G.castle.x, e.y - G.castle.y) < 80) slow = Math.max(slow, moat);
      let v = e.spd * Math.max(0.2, 1 - slow);
      if (e.F.boss) v = e.spd * Math.max(0.6, 1 - slow * 0.5);
      if (e.fly) {
        if (Math.abs(G.castle.x - e.x) > 3) {
          if (G.weather === 'wind') { e.x -= e.dx * e.spd * (e.F.boss ? 0.15 : 0.5) * dt; e.x = clamp(e.x, -24, W + 24); }
          else e.x += e.dx * v * dt;
        } else { e.y += Math.max(40, v) * dt; if (e.y >= G.castle.y - 4) leak(e); }
      } else if (e.route) { // worm crawling up through the tunnels, then over the grass to the path
        const tgt = e.route[e.ri], ddx = tgt.x - e.x, ddy = tgt.y - e.y, dist = Math.hypot(ddx, ddy), step = v * (e.under ? 0.8 : 1) * dt;
        if (ddx) e.dx = ddx;
        if (dist <= step) {
          e.x = tgt.x; e.y = tgt.y; e.ri++;
          if (tgt.surface) e.under = false;
          if (e.ri >= e.route.length) { e.route = null; e.d = G.joinD; }
        } else { e.x += ddx / dist * step; e.y += ddy / dist * step; }
      } else {
        if (G.weather === 'wind') v *= 0.8;
        e.d += v * dt;
        const p = posAt(e.d); e.x = p.x; e.y = p.y; if (p.dx) e.dx = p.dx;
        if (e.d >= G.path.len) leak(e);
      }
    }
    G.enemies = G.enemies.filter((e) => !e.dead);
  }

  // ---------- towers ----------
  function findTarget(x, y, range, ground, air) {
    let bestE = null, bestLeft = 1e9;
    for (const e of G.enemies) {
      if (e.dead || e.under || (e.fly ? !air : !ground)) continue;
      if (Math.hypot(e.x - x, e.y - y) > range) continue;
      const l = remaining(e); if (l < bestLeft) { bestLeft = l; bestE = e; }
    }
    return bestE;
  }
  function splash(x, y, rad, dmg, slow, layerFly) {
    for (const e of G.enemies) {
      if (e.dead || e.under) continue;
      if (layerFly !== null && e.fly !== layerFly) continue;
      if (Math.hypot(e.x - x, e.y - y) > rad + 8) continue;
      if (slow) { e.slowA = Math.max(e.slowA, slow); e.slowT = 1.8; }
      hurt(e, dmg);
    }
  }
  function updateTowers(dt) {
    const sunMul = 1.6 + 0.25 * lv('tan'), rateMul = 1 + 0.1 * lv('espresso');
    for (const t of G.towers) {
      const D = TOWERS[t.k];
      t.sunny = G.weather === 'sun' && inCol(t.x);
      t.cd -= dt * rateMul * (t.sunny ? sunMul : 1);
      if (t.kick > 0) t.kick -= dt;
      if (t.cd > 0) continue;
      const e = findTarget(t.x, t.y, towerRange(t), D.ground, D.air);
      if (!e) { t.cd = 0.08; continue; }
      t.cd = D.rate * (1 - 0.08 * (t.lvl - 1)); t.kick = 0.12;
      const dmg = towerDmg(t);
      sfx.shoot();
      if (t.k === 'pea' || t.k === 'kite') G.shots.push({ x: t.x, y: t.y - 6, tgt: e, dmg, v: t.k === 'kite' ? 300 : 380, c: D.color, s: t.k === 'kite' ? 4 : 3 });
      else if (t.k === 'ice') { splash(e.x, e.y, D.splash + 4 * (t.lvl - 1), dmg, D.slow + 0.05 * (t.lvl - 1), null); ring(e.x, e.y, D.splash, '#bdf3ff'); G.bolts.push({ pts: [[t.x, t.y - 8], [e.x, e.y]], t: 0.12, c: '#bdf3ff', straight: true }); }
      else if (t.k === 'mortar') G.shots.push({ x: t.x, y: t.y - 8, x0: t.x, y0: t.y - 8, x1: e.x, y1: e.y, t: 0, T: 0.65, dmg, rad: D.splash + 5 * (t.lvl - 1), lob: true });
      else if (t.k === 'tesla') {
        const hit = [e], pts = [[t.x, t.y - 8], [e.x, e.y]];
        let cur = e;
        for (let j = 1; j < D.chain + t.lvl - 1; j++) {
          let nx = null, nd = 75;
          for (const o of G.enemies) { if (o.dead || o.under || hit.includes(o)) continue; const q = Math.hypot(o.x - cur.x, o.y - cur.y); if (q < nd) { nd = q; nx = o; } }
          if (!nx) break; hit.push(nx); pts.push([nx.x, nx.y]); cur = nx;
        }
        hit.forEach((o, j) => hurt(o, dmg * Math.pow(0.8, j)));
        G.bolts.push({ pts, t: 0.16, c: '#cfe0ff' }); sfx.zap();
      }
    }
  }
  function updateShots(dt) {
    for (const s of G.shots) {
      if (s.lob) {
        s.t += dt; const f = Math.min(1, s.t / s.T);
        s.x = s.x0 + (s.x1 - s.x0) * f; s.y = s.y0 + (s.y1 - s.y0) * f - Math.sin(f * Math.PI) * 46;
        if (f >= 1) { s.done = true; splash(s.x1, s.y1, s.rad, s.dmg, 0, false); ring(s.x1, s.y1, s.rad, '#ffb14a'); burst(s.x1, s.y1, '#d9a066', 6, 90); sfx.boom(); }
        continue;
      }
      const e = s.tgt;
      if (e.dead) { s.done = true; continue; }
      const dx = e.x - s.x, dy = e.y - s.y, dist = Math.hypot(dx, dy), step = s.v * dt;
      if (dist <= step + 8) { s.done = true; hurt(e, s.dmg); }
      else { s.x += dx / dist * step; s.y += dy / dist * step; }
    }
    G.shots = G.shots.filter((s) => !s.done);
  }
  function tryBuild(k, c, r) {
    const cost = buildCost(k);
    if (G.grid[r * COLS + c] !== 0 || !towerUnlocked(k) || G.coins < cost) { sfx.nope(); return false; }
    G.coins -= cost;
    const p = gCenter(c, r);
    const t = { k, c, r, x: p.x, y: p.y, lvl: 1, cd: 0.2, spent: cost, kick: 0 };
    G.towers.push(t); G.grid[r * COLS + c] = t;
    sfx.build(); burst(p.x, p.y, '#ffffff', 8, 90);
    return true;
  }
  function tryUpgrade(t) {
    const cost = upgradeCost(t);
    if (t.lvl >= 3 || G.coins < cost) { sfx.nope(); return false; }
    G.coins -= cost; t.spent += cost; t.lvl++; sfx.build(); ring(t.x, t.y, 26, '#ffe680');
    return true;
  }
  function sellTower(t) {
    G.coins += sellValue(t); G.grid[t.r * COLS + t.c] = 0; G.towers.splice(G.towers.indexOf(t), 1); sfx.tick();
  }

  // ---------- cloud ----------
  function setWeather(w) {
    if (w !== 'off' && G.cloud.charge < 8 && G.freeWeather <= 0) { sfx.nope(); say(G.cloud.x, CLOUD_Y + 40, 'Cloud is dry. Let it rest.', '#cfe9ff'); return; }
    G.weather = G.weather === w ? 'off' : w; G.stormT = 0.3; sfx.tick();
  }
  function updateCloud(dt) {
    const C = G.cloud;
    const dx = C.tx - C.x, step = 190 * dt;
    C.x = Math.abs(dx) <= step ? C.tx : C.x + Math.sign(dx) * step;
    if (G.freeWeather > 0) G.freeWeather -= dt;
    const free = G.freeWeather > 0;
    if (G.weather === 'off') C.charge = Math.min(C.max, C.charge + 7 * dt);
    else {
      if (!free) C.charge -= WEATHER[G.weather].drain * dt;
      if (G.weather === 'storm') {
        G.stormT -= dt;
        if (G.stormT <= 0) {
          let tgt = null;
          for (const e of G.enemies) if (!e.dead && !e.under && inCol(e.x) && (!tgt || e.hp > tgt.hp)) tgt = e;
          if (tgt && (free || C.charge >= 10)) {
            if (!free) C.charge -= 10;
            G.stormT = 0.85;
            hurt(tgt, (26 + 5 * G.n) * (1 + 0.3 * lv('thunder')));
            G.bolts.push({ pts: [[C.x + rand(-12, 12), CLOUD_Y + 14], [tgt.x, tgt.y]], t: 0.2, c: '#fff6a8', w: 3 });
            burst(tgt.x, tgt.y, '#fff6a8', 6, 120); sfx.zap();
          } else { G.stormT = 0.15; if (!free) C.charge -= 1.5 * 0.15; }
        }
      }
      if (C.charge <= 0) { C.charge = 0; G.weather = 'off'; say(C.x, CLOUD_Y + 40, 'Cloud ran dry', '#cfe9ff'); }
    }
  }

  // ---------- underground ----------
  const tileAt = (c, r) => (r >= 0 && r < UROWS && c >= 0 && c < COLS ? G.ug[r][c] : null);
  function bfs(fc, fr, goal) { // walk through dug tiles; returns list of tiles after the start, ending on the goal tile
    const start = fr * COLS + fc, prev = new Map([[start, -1]]), q = [start];
    while (q.length) {
      const k = q.shift(), c = k % COLS, r = (k / COLS) | 0;
      if (goal(c, r)) { const out = []; let j = k; while (j !== start) { out.unshift(G.ug[(j / COLS) | 0][j % COLS]); j = prev.get(j); } return out; }
      for (const [dc, dr] of DIRS) {
        const t = tileAt(c + dc, r + dr); if (!t || !t.dug) continue;
        const nk = t.r * COLS + t.c; if (prev.has(nk)) continue;
        prev.set(nk, k); q.push(nk);
      }
    }
    return null;
  }
  function canOrder(t) {
    if (!t || t.dug || t.queued) return false;
    return DIRS.some(([dc, dr]) => { const n = tileAt(t.c + dc, t.r + dr); return n && (n.dug || n.queued); });
  }
  function orderDig(t) {
    const cost = digCost(t.r);
    if (!canOrder(t) || G.coins < cost || G.orders.length >= 6) { sfx.nope(); return false; }
    G.coins -= cost; if (cost === 0 && G.freeDigs > 0) G.freeDigs--;
    t.queued = true; G.orders.push({ tile: t, cost, miner: null }); sfx.tick();
    return true;
  }
  function revealAround(t) { for (const [dc, dr] of DIRS) { const n = tileAt(t.c + dc, t.r + dr); if (n) n.known = true; } }
  function finishDig(m, t) {
    const p = uCenter(t.c, t.r), content = t.content;
    t.queued = false; t.prog = 0; t.dug = true; t.content = null; G.digs++;
    burst(p.x, p.y, '#8a5a36', 8, 90);
    if (content === 'cave' && !lv('supports')) {
      t.dug = false; t.hard = Math.min(4, t.hard + 1); m.daze = 6; m.state = 'daze'; G.shake = 6; sfx.bad();
      say(p.x, p.y - 16, 'Cave-in! 🪨', '#ffb38a'); burst(p.x, p.y, '#6b5a4e', 16, 140);
      return;
    }
    revealAround(t);
    if (!content) return;
    if (content === 'cave') { say(p.x, p.y - 16, 'Props held 🪵', '#c9d0ff'); return; }
    if (content === 'gas') {
      burst(p.x, p.y, '#9be36b', 16, 80);
      if (lv('helmet')) say(p.x, p.y - 16, 'Stink pocket. Mask on ⛑️', '#c9d0ff');
      else { m.daze = 10; m.state = 'daze'; sfx.bad(); say(p.x, p.y - 16, 'Stink pocket! 🤢', '#b9ff6b'); }
      return;
    }
    if (content === 'nest') {
      const count = Math.max(1, 3 + Math.floor(t.r / 2) - lv('bait') * 2);
      const tiles = bfs(t.c, t.r, (c, r) => c === G.shaftCol && r === 0) || [];
      const route = tiles.map((q) => uCenter(q.c, q.r));
      route.push({ x: G.hut.x, y: G.hut.y, surface: true });
      const j = posAt(G.joinD); route.push({ x: j.x, y: j.y });
      for (let i = 0; i < count; i++) spawnFoe('worm', { x: p.x + rand(-8, 8), y: p.y + rand(-8, 8), under: true, route, ri: 0, spd: FOES.worm.spd * rand(0.8, 1.15) });
      sfx.bad(); G.shake = 5; say(p.x, p.y - 16, 'Worm nest! 🐛', '#ff9a9a');
      return;
    }
    sfx.loot(); ring(p.x, p.y, 24, '#ffe680');
    const icon = LOOT[content].icon;
    if (content === 'gem') { const g = 1 + Math.floor((t.r + 1) / 2); G.loot += g; say(p.x, p.y - 16, `+${g} 💎`, '#8fe6ff'); }
    else if (content === 'coins') { const c = Math.round((16 + t.r * 8) * (1 + 0.1 * (G.n - 1))); G.coins += c; say(p.x, p.y - 16, `+${c} 🪙`, '#ffd84a'); }
    else if (content === 'fossil') { const g = 4 + t.r; G.loot += g; say(p.x, p.y - 16, `Fossil! +${g} 💎`, '#8fe6ff'); }
    else if (content === 'spring') { G.cloud.charge = G.cloud.max; G.freeWeather = Math.max(G.freeWeather, 12); say(p.x, p.y - 16, 'Spring! Free weather 12s 💧', '#8fd0ff'); }
    else if (content === 'heart') { G.hearts++; say(p.x, p.y - 16, '+1 ❤️', '#ff8aa0'); }
    else if (content === 'mushroom') { G.mush = true; say(p.x, p.y - 16, 'Zoomy mushroom! Faster digging 🍄', '#ffb3d1'); }
    else if (content === 'relic') {
      const k = pick(['dmg', 'dig', 'jar']);
      if (k === 'dmg') { G.relicDmg += 0.3; say(p.x, p.y - 16, 'Ancient battery: towers +30% 🏺', '#ffe680'); }
      else if (k === 'dig') { G.freeDigs += 3; say(p.x, p.y - 16, 'Golden shovel: 3 free digs 🏺', '#ffe680'); }
      else { G.cloud.charge = G.cloud.max; G.freeWeather = 25; say(p.x, p.y - 16, 'Storm jar: free weather 25s 🏺', '#ffe680'); }
    } else if (content === 'blueprint') {
      const locked = TOWER_ORDER.filter((k) => !towerUnlocked(k));
      if (locked.length) { const k = pick(locked); run.up['t_' + k] = 1; saveRun(); say(p.x, p.y - 16, `Blueprint: ${TOWERS[k].name}! 📜`, '#ffe680', true); }
      else { G.loot += 8; say(p.x, p.y - 16, 'Old blueprint. +8 💎', '#8fe6ff'); }
    }
    void icon;
  }
  function updateMiners(dt) {
    G.minerT -= dt;
    const think = G.minerT <= 0; if (think) G.minerT = 0.25;
    const boost = G.mush ? 1.5 : 1;
    for (const m of G.miners) {
      if (m.state === 'daze') { m.daze -= dt; if (m.daze <= 0) m.state = 'idle'; if (m.order) { m.order.miner = null; m.order = null; } continue; }
      if (m.state === 'idle' && think) {
        for (const o of G.orders) {
          if (o.miner) continue;
          const route = bfs(m.c, m.r, (c, r) => Math.abs(c - o.tile.c) + Math.abs(r - o.tile.r) === 1);
          if (route) { o.miner = m; m.order = o; m.route = route; m.state = 'walk'; break; }
        }
      }
      if (m.state === 'walk') {
        if (!m.route.length) { m.state = 'dig'; continue; }
        const t = m.route[0], p = uCenter(t.c, t.r), dx = p.x - m.x, dy = p.y - m.y, dist = Math.hypot(dx, dy), step = 70 * boost * dt;
        if (dist <= step) { m.x = p.x; m.y = p.y; m.c = t.c; m.r = t.r; m.route.shift(); }
        else { m.x += dx / dist * step; m.y += dy / dist * step; }
      } else if (m.state === 'dig') {
        const t = m.order.tile, p = uCenter(t.c, t.r);
        const rate = boost * (G.weather === 'rain' && inCol(p.x) ? 2 : 1);
        t.prog += dt * rate / digTime(t);
        G.digSfx -= dt; if (G.digSfx <= 0) { G.digSfx = 0.3; sfx.dig(); G.parts.push({ x: (m.x + p.x) / 2, y: (m.y + p.y) / 2, vx: rand(-40, 40), vy: rand(-60, -10), t: 0.3, c: '#a9774a', s: 3 }); }
        if (t.prog >= 1) {
          G.orders.splice(G.orders.indexOf(m.order), 1); m.order = null; m.state = 'idle';
          finishDig(m, t);
        }
      }
    }
  }

  // ---------- waves ----------
  function launchWave() {
    const list = G.waves[G.waveIdx++];
    let t = 0.3;
    for (const k of list) { G.spawnQ.push({ k, at: t }); t += FOES[k].gap * rand(0.8, 1.1); }
    G.spawnT = 0; G.countdown = 11; sfx.wave();
    say(W / 2, GROUND_Y - 24, `Wave ${G.waveIdx} of ${G.waves.length}`, '#ffffff', true);
  }
  const canCallWave = () => G.spawnQ.length === 0 && G.waveIdx < G.waves.length && G.clearT < 0;
  const earlyBonus = () => Math.ceil(Math.max(0, G.countdown) * (1 + 0.5 * lv('hurry')));
  function callWave() {
    if (!canCallWave()) { sfx.nope(); return; }
    const b = earlyBonus(); if (b > 0) { G.coins += b; say(W - 110, BAR_Y - 14, `+${b} 🪙 early`, '#ffd84a'); }
    launchWave();
  }
  function updateWaves(dt) {
    if (G.spawnQ.length) {
      G.spawnT += dt;
      while (G.spawnQ.length && G.spawnQ[0].at <= G.spawnT) spawnFoe(G.spawnQ.shift().k);
    } else if (G.waveIdx < G.waves.length) { G.countdown -= dt; if (G.countdown <= 0) launchWave(); }
  }

  // ---------- update ----------
  function update(dt) {
    if (mode !== 'play') return;
    G.time += dt;
    if (G.banner > 0) G.banner -= dt;
    G.shake = Math.max(0, G.shake - dt * 30);
    updateWaves(dt);
    updateCloud(dt);
    updateEnemies(dt);
    updateTowers(dt);
    updateShots(dt);
    updateMiners(dt);
    for (const p of G.parts) { p.t -= dt; if (!p.ring) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt; } }
    G.parts = G.parts.filter((p) => p.t > 0);
    for (const t of G.texts) { t.t -= dt; t.y -= (t.big ? 10 : 22) * dt; }
    G.texts = G.texts.filter((t) => t.t > 0);
    for (const b of G.bolts) b.t -= dt;
    G.bolts = G.bolts.filter((b) => b.t > 0);
    if (G.hearts <= 0) { gameOver(); return; }
    if (G.clearT < 0 && G.waveIdx >= G.waves.length && !G.spawnQ.length && !G.enemies.length) { G.clearT = 1.6; sfx.clear(); closePop(); say(W / 2, GROUND_Y + 120, 'Level clear!', '#ffe680', true); }
    if (G.clearT >= 0) { G.clearT -= dt; if (G.clearT <= 0) finishLevel(); }
  }

  // ---------- level end ----------
  function finishLevel() {
    const conv = Math.floor(G.coins / gemRate()), clear = 3 + G.n, flawless = G.leaks === 0 ? 2 : 0;
    lastSummary = { level: G.n, conv, clear, flawless, loot: G.loot, coins: G.coins, kills: G.kills };
    run.gems += conv + clear + flawless + G.loot;
    run.score += G.kills;
    run.level++;
    recordBest(); saveRun();
    openShop();
  }
  function gameOver() {
    mode = 'over'; closePop(); pauseBtn.style.display = 'none'; sfx.bad();
    showOverlay(`<div class="center">
      <h2>The castle fell</h2>
      <div class="stat">Level <b>${run.level}</b> · wave <b>${G.waveIdx}</b> of <b>${G.waves.length}</b></div>
      <div class="stat">Best: level <b>${best.level || 1}</b></div>
      <div style="height:1.2em"></div>
      <button class="big gold" data-act="retry">Try this level again</button>
      <button class="big alt" data-act="shop">Visit the shop first (${run.gems} 💎)</button>
      <button class="big alt" data-act="menu">Menu</button>
      <div class="hint">You keep every upgrade and all banked gems. Loot dug up this level is lost.</div>
    </div>`);
  }

  // ---------- overlays ----------
  function showOverlay(html) { ov.innerHTML = html; ov.classList.add('show'); }
  function hideOverlay() { ov.classList.remove('show'); ov.innerHTML = ''; }
  function showMenu() {
    mode = 'menu'; closePop(); pauseBtn.style.display = 'none';
    const saved = loadRun();
    showOverlay(`<div class="center">
      <div class="logo">STRATA<br>SIEGE</div>
      <div class="tag">Defend the meadow. Dig for loot. Boss the weather around.</div>
      ${saved ? `<button class="big gold" data-act="resume">Continue · level ${saved.level} · ${saved.gems} 💎</button>` : ''}
      <button class="big" data-act="newrun">${saved ? 'New run' : 'Play'}</button>
      <button class="big alt" data-act="mute">Sound: ${muted ? 'off' : 'on'}</button>
      ${best.level ? `<div class="stat" style="margin-top:1em">Best: level <b>${best.level}</b></div>` : ''}
      <div class="hint">☁️ Sky: tap to move your cloud, pick its weather<br>🌱 Ground: tap grass to build, tap a tower to upgrade<br>⛏️ Underground: tap dirt next to a tunnel to dig<br>Everything is one tap. Right click or Esc pauses.</div>
    </div>`);
  }
  function showPause() {
    mode = 'pause'; closePop();
    showOverlay(`<div class="center">
      <h2>Paused</h2>
      <div class="stat">Level <b>${run.level}</b> · <b>${G.hearts}</b> ❤️ · <b>${Math.floor(G.coins)}</b> 🪙 · <b>${run.gems}</b> 💎</div>
      <div style="height:1em"></div>
      <button class="big" data-act="unpause">Resume</button>
      <button class="big alt" data-act="mute">Sound: ${muted ? 'off' : 'on'}</button>
      <button class="big alt" data-act="quit">Quit to menu</button>
      <div class="hint">☔ Rain slows enemies and doubles digging under the cloud.<br>⛈️ Storm zaps the toughest enemy under the cloud.<br>☀️ Sun speeds up towers under the cloud.<br>💤 Rest refills the cloud.<br>Quitting restarts this level later.</div>
    </div>`);
  }
  let shopCat = 'tow';
  function openShop() { mode = 'shop'; closePop(); pauseBtn.style.display = 'none'; renderShop(false); }
  function renderShop(keepScroll, flashId) {
    const prev = ov.querySelector('.items');
    const st = keepScroll && prev ? prev.scrollTop : 0;
    const cards = ITEMS.filter((it) => it.cat === shopCat).map((it) => {
      const state = itemState(it), l = lv(it.id);
      const pips = it.max > 1 ? `<div class="pips">${Array.from({ length: it.max }, (_, i) => `<span class="pip ${i < l ? 'on' : ''}"></span>`).join('')}</div>` : '';
      const btn = state === 'max' ? `<button class="buy max" disabled>${it.max > 1 ? 'Maxed' : 'Owned'}</button>`
        : `<button class="buy ${state === 'ok' ? '' : 'no'}" data-buy="${it.id}">${l ? 'Upgrade' : 'Buy'} · ${itemCost(it)} 💎</button>`;
      return `<div class="card ${flashId === it.id ? 'flash' : ''}">
        <div class="top"><span class="ic">${it.icon}</span><span class="nm">${it.name}</span></div>
        ${pips}<div class="ds">${it.desc(Math.min(l, it.max - 1))}</div>${btn}</div>`;
    }).join('');
    const s = lastSummary;
    const summary = s ? `<div class="summary"><span>Level ${s.level} cleared!</span><span>Clear bonus <b>${s.clear}</b></span>${s.flawless ? `<span>No leaks <b>+${s.flawless}</b></span>` : ''}<span>Dug up <b>${s.loot}</b></span><span>${Math.floor(s.coins)} coins left → <b>${s.conv}</b></span></div>` : '';
    showOverlay(`<div class="shop">
      <div class="shop-head"><div><div class="t">Gnome Depot</div><div class="sub">next up: level ${run.level}</div></div><div class="coins">${run.gems} 💎</div></div>
      ${summary}
      <div class="tabs">${CATS.map((c) => `<button class="tab ${c.id === shopCat ? 'on' : ''}" data-cat="${c.id}">${c.name}</button>`).join('')}</div>
      <div class="items">${cards}</div>
      <div class="shopfoot"><button class="big" data-act="next">Start level ${run.level} ▶</button></div>
    </div>`);
    const items = ov.querySelector('.items'); if (items) items.scrollTop = st;
  }
  ov.addEventListener('click', (e) => {
    audio();
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.cat) { shopCat = t.dataset.cat; renderShop(false); return; }
    if (t.dataset.buy) { const it = ITEM_BY_ID[t.dataset.buy]; const ok = buy(it); renderShop(true, ok ? it.id : null); return; }
    const act = t.dataset.act;
    if (act === 'newrun') { run = newRun(); lastSummary = null; store.del(SAVE_KEY); saveRun(); startLevel(); }
    else if (act === 'resume') { run = loadRun(); lastSummary = null; if (run.level === 1 && run.gems === 0) startLevel(); else openShop(); }
    else if (act === 'next' || act === 'retry') { lastSummary = null; startLevel(); }
    else if (act === 'shop') { lastSummary = null; openShop(); }
    else if (act === 'unpause') { mode = 'play'; hideOverlay(); }
    else if (act === 'quit' || act === 'menu') showMenu();
    else if (act === 'mute') { muted = !muted; store.set(MUTE_KEY, muted); t.textContent = 'Sound: ' + (muted ? 'off' : 'on'); }
  });

  // ---------- in-game popups ----------
  let popInfo = null;
  function closePop() { pop.classList.remove('show'); pop.innerHTML = ''; popInfo = null; if (G) G.sel = null; }
  function openPop(info, html, ax, ay) {
    popInfo = info; G.sel = info;
    pop.innerHTML = html; pop.classList.add('show');
    const pw = pop.offsetWidth, ph = pop.offsetHeight, cw = W * scale, ch = H * scale;
    const left = clamp(ax * scale - pw / 2, 4, Math.max(4, cw - pw - 4));
    let top = ay * scale - ph - 26 * scale;
    if (top < HUD_H * scale) top = ay * scale + 26 * scale;
    top = clamp(top, 4, Math.max(4, ch - ph - 4));
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    refreshPop();
  }
  function refreshPop() { if (!popInfo) return; for (const b of pop.querySelectorAll('[data-cost]')) b.classList.toggle('no', G.coins < +b.dataset.cost); }
  function buildPop(c, r) {
    const p = gCenter(c, r);
    const btns = TOWER_ORDER.filter(towerUnlocked).map((k) => {
      const D = TOWERS[k];
      return `<button class="pb" data-build="${k}" data-cost="${buildCost(k)}"><span class="pi">${D.icon}</span><span class="pn">${D.name}<small>${D.desc}</small></span><b>${buildCost(k)}🪙</b></button>`;
    }).join('');
    const locked = TOWER_ORDER.length - TOWER_ORDER.filter(towerUnlocked).length;
    openPop({ kind: 'g', c, r }, `<div class="ptitle">Build a tower</div>${btns}${locked ? `<div class="pinfo" style="margin:0.5em 0 0">${locked} more in the shop, or dig up a 📜 blueprint.</div>` : ''}`, p.x, p.y);
  }
  function towerPop(t) {
    const D = TOWERS[t.k];
    const up = t.lvl >= 3 ? '<button class="pb no" disabled><span class="pn">Max level</span></button>'
      : `<button class="pb" data-act="up" data-cost="${upgradeCost(t)}"><span class="pn">Upgrade</span><b>${upgradeCost(t)}🪙</b></button>`;
    openPop({ kind: 't', c: t.c, r: t.r, tower: t }, `<div class="ptitle">${D.icon} ${D.name} · level ${t.lvl}</div>
      <div class="pinfo">Damage ${Math.round(towerDmg(t) * 10) / 10} · range ${Math.round(towerRange(t))} · ${D.ground && D.air ? 'ground + air' : D.air ? 'air only' : 'ground only'}</div>
      <div class="prow">${up}<button class="pb alt" data-act="sell"><span class="pn">Sell</span><b>+${sellValue(t)}🪙</b></button></div>`, t.x, t.y);
  }
  const HARD_NAMES = ['', 'Soft dirt', 'Packed clay', 'Stone', 'Hard rock'];
  function digPop(t) {
    const p = uCenter(t.c, t.r), cost = digCost(t.r);
    let hint = 'Nothing glints here.';
    if (t.content && (t.known || spied(t))) {
      if (spied(t)) hint = (LOOT[t.content] ? 'Spy cloud sees treasure: ' + LOOT[t.content].icon : 'Spy cloud sees danger: ' + HAZ[t.content].icon);
      else if (lv('detector')) hint = LOOT[t.content] ? '📡 Treasure here!' : '📡 Danger here!';
      else hint = '✨ Something is buried here. Treasure or trouble.';
    } else if (!t.known && !spied(t)) hint = 'Too far from a tunnel to tell what is inside.';
    let btn;
    if (t.queued) btn = '<button class="pb no" disabled><span class="pn">Already queued</span></button>';
    else if (!canOrder(t)) btn = '<button class="pb no" disabled><span class="pn">Dig next to a tunnel first</span></button>';
    else if (G.orders.length >= 6) btn = '<button class="pb no" disabled><span class="pn">Dig queue is full</span></button>';
    else btn = `<button class="pb" data-act="dig" data-cost="${cost}"><span class="pi">⛏️</span><span class="pn">Dig</span><b>${cost ? cost + '🪙' : 'free'}</b></button>`;
    openPop({ kind: 'u', c: t.c, r: t.r, tile: t }, `<div class="ptitle">${HARD_NAMES[t.hard]} · depth ${t.r + 1}</div>
      <div class="pinfo">Takes about ${Math.round(digTime(t) / (G.mush ? 1.5 : 1))}s. ${hint}</div>${btn}`, p.x, p.y);
  }
  function infoPop(c, r, title, text) { const p = gCenter(c, r); openPop({ kind: 'i', c, r }, `<div class="ptitle">${title}</div><div class="pinfo" style="margin:0">${text}</div>`, p.x, p.y); }
  pop.addEventListener('click', (e) => {
    audio();
    const b = e.target.closest('button'); if (!b || !popInfo || mode !== 'play') return;
    const info = popInfo;
    if (b.dataset.build) { if (tryBuild(b.dataset.build, info.c, info.r)) closePop(); }
    else if (b.dataset.act === 'up') { if (tryUpgrade(info.tower)) towerPop(info.tower); }
    else if (b.dataset.act === 'sell') { sellTower(info.tower); closePop(); }
    else if (b.dataset.act === 'dig') { if (orderDig(info.tile)) closePop(); }
  });
  const spied = (t) => lv('spyglass') > 0 && inCol(t.c * CELL + CELL / 2);

  // ---------- input ----------
  function toGame(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }
  function barButtons() {
    const out = [], ws = ['off', 'rain', 'storm', 'sun']; if (lv('wind')) ws.push('wind');
    let x = 6;
    for (const w of ws) { out.push({ kind: 'w', w, x, y: BAR_Y + 6, wd: 40, h: 38 }); x += 44; }
    out.push({ kind: 'speed', x, y: BAR_Y + 6, wd: 40, h: 38 }); x += 46;
    out.push({ kind: 'wave', x, y: BAR_Y + 6, wd: W - 6 - x, h: 38 });
    return out;
  }
  let skyDrag = false;
  canvas.addEventListener('pointerdown', (e) => {
    audio();
    if (mode !== 'play' || e.button === 2) return;
    e.preventDefault();
    const p = toGame(e), prevSel = popInfo;
    closePop();
    if (p.y >= BAR_Y) {
      for (const b of barButtons()) {
        if (p.x < b.x || p.x > b.x + b.wd) continue;
        if (b.kind === 'w') setWeather(b.w);
        else if (b.kind === 'speed') { speed = speed === 1 ? 2 : 1; sfx.tick(); }
        else callWave();
      }
    } else if (p.y >= UG_Y) {
      const t = tileAt(Math.floor(p.x / CELL), Math.floor((p.y - UG_Y) / CELL));
      if (!t || t.dug) return;
      if (prevSel && prevSel.kind === 'u' && prevSel.tile === t) return;
      digPop(t);
    } else if (p.y >= GROUND_Y) {
      const c = clamp(Math.floor(p.x / CELL), 0, COLS - 1), r = Math.floor((p.y - GROUND_Y) / CELL);
      if (prevSel && prevSel.c === c && prevSel.r === r && prevSel.kind !== 'u') return;
      const cell = G.grid[r * COLS + c];
      if (cell === 0) buildPop(c, r);
      else if (cell === 3) infoPop(c, r, '🏰 Your castle', 'Every enemy that gets here costs a heart.');
      else if (cell === 4) infoPop(c, r, '🛖 Mine hut', 'Your hamsters dig below. Tap dirt next to a tunnel to send them. Worms you disturb crawl out here.');
      else if (typeof cell === 'object') towerPop(cell);
    } else if (p.y >= HUD_H) { G.cloud.tx = clamp(p.x, 30, W - 30); skyDrag = true; }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (mode !== 'play' || !skyDrag || !e.buttons) return;
    G.cloud.tx = clamp(toGame(e).x, 30, W - 30);
  });
  window.addEventListener('pointerup', () => { skyDrag = false; });
  window.addEventListener('pointercancel', () => { skyDrag = false; });
  pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); audio(); if (mode === 'play') showPause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') showPause(); });
  // Right click or Escape pauses (Escape again resumes). Pause straight from the button press as well as
  // from 'contextmenu', because some browsers never deliver the latter.
  function rightPause(e) {
    if (e.type === 'contextmenu' || e.button === 2) {
      e.preventDefault();
      if (mode === 'play') showPause();
    }
  }
  window.addEventListener('pointerdown', rightPause, true);
  window.addEventListener('mousedown', rightPause, true);
  window.addEventListener('contextmenu', rightPause, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (mode === 'play') showPause();
    else if (mode === 'pause') { mode = 'play'; hideOverlay(); }
  });

  // ---------- drawing ----------
  const deco = Array.from({ length: 5 }, (_, i) => ({ x: i * 110 + rand(0, 60), y: rand(HUD_H + 14, GROUND_Y - 60), s: rand(0.6, 1.1), v: rand(3, 8) }));
  function puff(x, y, w, color, alpha = 1) {
    ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath();
    ctx.arc(x - w * 0.5, y + 4, w * 0.3, 0, 7); ctx.arc(x - w * 0.15, y - 6, w * 0.38, 0, 7); ctx.arc(x + w * 0.25, y - 2, w * 0.34, 0, 7); ctx.arc(x + w * 0.55, y + 5, w * 0.26, 0, 7);
    ctx.rect(x - w * 0.5, y + 2, w * 1.05, w * 0.24); ctx.fill(); ctx.globalAlpha = 1;
  }
  function drawSky(t) {
    const g = ctx.createLinearGradient(0, HUD_H, 0, GROUND_Y);
    const stormy = G && G.weather === 'storm';
    g.addColorStop(0, stormy ? '#4b6a9c' : '#5aa9f2'); g.addColorStop(1, stormy ? '#9fb4cf' : '#c9e8ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND_Y);
    for (const d of deco) { const x = ((d.x + t * d.v) % (W + 160)) - 80; puff(x, d.y, 44 * d.s, '#ffffff', 0.45); }
  }
  const GRASS = ['#62b354', '#5bab4d'];
  const HARD_COL = ['', '#8a5a36', '#74503a', '#6a625c', '#4c4a52'];
  function drawGround() {
    for (let r = 0; r < GROWS; r++) for (let c = 0; c < COLS; c++) {
      const x = c * CELL, y = GROUND_Y + r * CELL, cell = G.grid[r * COLS + c];
      if (cell === 1 || cell === 3) { ctx.fillStyle = '#d9b97f'; ctx.fillRect(x, y, CELL, CELL); ctx.fillStyle = '#cdab70'; ctx.fillRect(x + 6 + ((c * 7 + r * 3) % 20), y + 8 + ((c * 5 + r * 11) % 22), 5, 3); }
      else { ctx.fillStyle = GRASS[(r + c) % 2]; ctx.fillRect(x, y, CELL, CELL); }
    }
    ctx.fillStyle = '#3f8f3a'; ctx.fillRect(0, GROUND_Y - 3, W, 4);
    // sel highlight + range
    const s = G.sel;
    if (s && s.kind !== 'u') {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.strokeRect(s.c * CELL + 1, GROUND_Y + s.r * CELL + 1, CELL - 2, CELL - 2);
      if (s.tower) { ctx.beginPath(); ctx.arc(s.tower.x, s.tower.y, towerRange(s.tower), 0, 7); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    emo('🛖', G.hut.x, G.hut.y - 2, 34);
    emo('🏰', G.castle.x, G.castle.y - 6, 44);
  }
  function drawUnderground(t) {
    const spy = lv('spyglass') > 0, det = lv('detector') > 0;
    for (let r = 0; r < UROWS; r++) for (let c = 0; c < COLS; c++) {
      const tile = G.ug[r][c], x = c * CELL, y = UG_Y + r * CELL;
      if (tile.dug) { ctx.fillStyle = '#241a12'; ctx.fillRect(x, y, CELL, CELL); ctx.fillStyle = '#2e2218'; ctx.fillRect(x + 4, y + 4, CELL - 8, CELL - 8); continue; }
      ctx.fillStyle = HARD_COL[tile.hard]; ctx.fillRect(x, y, CELL, CELL);
      ctx.fillStyle = 'rgba(0,0,0,0.13)'; ctx.fillRect(x + 5 + tile.seed * 22, y + 6 + ((tile.seed * 97) % 1) * 22, 6, 4); ctx.fillRect(x + 26 - tile.seed * 18, y + 26, 5, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x, y + CELL - 1, CELL, 1); ctx.fillRect(x + CELL - 1, y, 1, CELL);
      const sp = spy && inCol(x + CELL / 2);
      if (tile.content && sp) { ctx.globalAlpha = 0.9; emo((LOOT[tile.content] || HAZ[tile.content]).icon, x + 20, y + 20, 22); ctx.globalAlpha = 1; }
      else if (tile.content && tile.known) {
        const tw = 0.55 + 0.45 * Math.sin(t * 4 + tile.seed * 20);
        ctx.fillStyle = det ? (LOOT[tile.content] ? '#ffe066' : '#ff5a5a') : '#ffffff'; ctx.globalAlpha = tw;
        const cx = x + 20, cy = y + 20, a = 7, b = 2;
        ctx.beginPath(); ctx.moveTo(cx, cy - a); ctx.lineTo(cx + b, cy - b); ctx.lineTo(cx + a, cy); ctx.lineTo(cx + b, cy + b); ctx.lineTo(cx, cy + a); ctx.lineTo(cx - b, cy + b); ctx.lineTo(cx - a, cy); ctx.lineTo(cx - b, cy - b); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (tile.queued) {
        ctx.fillStyle = 'rgba(255,230,128,0.18)'; ctx.fillRect(x, y, CELL, CELL);
        if (tile.prog > 0) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x + 5, y + 31, 30, 5); ctx.fillStyle = '#ffe680'; ctx.fillRect(x + 5, y + 31, 30 * Math.min(1, tile.prog), 5); }
        else emo('⛏️', x + 30, y + 10, 14);
      }
    }
    // tappable outline on diggable tiles
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    for (let r = 0; r < UROWS; r++) for (let c = 0; c < COLS; c++) { const tile = G.ug[r][c]; if (canOrder(tile)) ctx.strokeRect(c * CELL + 2.5, UG_Y + r * CELL + 2.5, CELL - 5, CELL - 5); }
    ctx.setLineDash([]);
    ctx.fillStyle = '#4a2f1a'; ctx.fillRect(0, UG_Y - 2, W, 4);
    const s = G.sel;
    if (s && s.kind === 'u') { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.strokeRect(s.c * CELL + 1, UG_Y + s.r * CELL + 1, CELL - 2, CELL - 2); }
    for (const m of G.miners) {
      const bob = m.state === 'dig' ? Math.sin(t * 22) * 2 : 0;
      emo('🐹', m.x + bob, m.y, 24);
      if (m.state === 'daze') emo('💫', m.x + 8, m.y - 12, 14);
    }
  }
  function drawWeatherColumn(t) {
    const C = G.cloud, hw = cloudHalf(), w = G.weather, top = CLOUD_Y + 12;
    if (w !== 'off') {
      ctx.fillStyle = `rgba(${WEATHER[w].tint},0.13)`; ctx.fillRect(C.x - hw, top, hw * 2, BAR_Y - top);
      if (w === 'rain') {
        ctx.strokeStyle = 'rgba(120,180,255,0.75)'; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let i = 0; i < 16; i++) { const x = C.x - hw + ((i * 37.3) % (hw * 2)), y = top + ((t * 420 + i * 61) % (UG_Y - top)); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 9); }
        ctx.stroke();
      } else if (w === 'sun') {
        ctx.fillStyle = 'rgba(255,230,120,0.16)'; ctx.beginPath(); ctx.moveTo(C.x - 10, top); ctx.lineTo(C.x + 10, top); ctx.lineTo(C.x + hw, UG_Y); ctx.lineTo(C.x - hw, UG_Y); ctx.fill();
      } else if (w === 'wind') {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let i = 0; i < 6; i++) { const y = HUD_H + 16 + i * 22, x = W - ((t * 260 + i * 97) % (W + 80)); ctx.moveTo(x, y); ctx.lineTo(x + 34, y); }
        ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([3, 6]); ctx.beginPath();
    ctx.moveTo(C.x - hw, top); ctx.lineTo(C.x - hw, BAR_Y); ctx.moveTo(C.x + hw, top); ctx.lineTo(C.x + hw, BAR_Y); ctx.stroke(); ctx.setLineDash([]);
  }
  function drawCloud() {
    const C = G.cloud, hw = cloudHalf(), w = G.weather;
    puff(C.x - hw * 0.05, CLOUD_Y + 4, hw * 1.7, 'rgba(0,0,0,0.12)');
    puff(C.x - hw * 0.05, CLOUD_Y, hw * 1.7, WEATHER[w].cloud);
    if (w !== 'off') emo(WEATHER[w].icon, C.x, CLOUD_Y - 2, 20); else if (lv('spyglass')) emo('🔭', C.x, CLOUD_Y - 2, 18);
    const bw = 56, f = C.charge / C.max;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; rr(C.x - bw / 2, CLOUD_Y - 34, bw, 7, 3); ctx.fill();
    ctx.fillStyle = G.freeWeather > 0 ? '#ffe680' : f < 0.2 ? '#ff8a6b' : '#6ec8ff'; rr(C.x - bw / 2 + 1, CLOUD_Y - 33, Math.max(2, (bw - 2) * f), 5, 2); ctx.fill();
  }
  function drawTowers() {
    for (const t of G.towers) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(t.x, t.y + 13, 15, 6, 0, 0, 7); ctx.fill();
      if (t.sunny) { ctx.fillStyle = 'rgba(255,230,120,0.35)'; ctx.beginPath(); ctx.arc(t.x, t.y, 19, 0, 7); ctx.fill(); }
      emo(TOWERS[t.k].icon, t.x, t.y - 2 - (t.kick > 0 ? 3 : 0), 30);
      ctx.fillStyle = '#ffe680'; for (let i = 0; i < t.lvl; i++) { ctx.beginPath(); ctx.arc(t.x - (t.lvl - 1) * 4 + i * 8, t.y + 16, 2.5, 0, 7); ctx.fill(); }
    }
  }
  function drawEnemies(t, flyers) {
    for (const e of G.enemies) {
      if (e.fly !== flyers) continue;
      const s = e.F.size * (e.under ? 0.8 : 1), bobY = e.fly ? Math.sin(t * 3 + e.wob) * 3 : Math.abs(Math.sin(t * 9 + e.wob)) * -2;
      if (!e.under) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(e.x, e.fly ? e.y + s * 0.7 : e.y + s * 0.4, s * 0.4, s * 0.14, 0, 0, 7); ctx.fill(); }
      if (e.slowA > 0) { ctx.fillStyle = 'rgba(150,220,255,0.45)'; ctx.beginPath(); ctx.arc(e.x, e.y, s * 0.55, 0, 7); ctx.fill(); }
      if (e.flash > 0) ctx.globalAlpha = 0.55;
      emo(e.F.icon, e.x, e.y + bobY, s, e.dx > 0);
      ctx.globalAlpha = 1;
      if (e.hp < e.maxhp) {
        const bw = e.F.boss ? 44 : 22;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(e.x - bw / 2, e.y - s * 0.62 - 4, bw, 4);
        ctx.fillStyle = e.F.boss ? '#ff5a7a' : '#7cf28a'; ctx.fillRect(e.x - bw / 2, e.y - s * 0.62 - 4, bw * Math.max(0, e.hp / e.maxhp), 4);
      }
    }
  }
  function drawShots() {
    for (const s of G.shots) {
      if (s.lob) { ctx.fillStyle = '#6b4a2a'; ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, 7); ctx.fill(); ctx.fillStyle = '#ffd9a0'; ctx.beginPath(); ctx.arc(s.x - 1, s.y - 1, 2, 0, 7); ctx.fill(); }
      else { ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, 7); ctx.fill(); }
    }
    for (const b of G.bolts) {
      ctx.strokeStyle = b.c; ctx.lineWidth = b.w || 2; ctx.globalAlpha = Math.min(1, b.t / 0.12); ctx.beginPath();
      for (let i = 0; i < b.pts.length - 1; i++) {
        const [x1, y1] = b.pts[i], [x2, y2] = b.pts[i + 1];
        ctx.moveTo(x1, y1);
        if (!b.straight) for (let j = 1; j < 5; j++) { const f = j / 5; ctx.lineTo(x1 + (x2 - x1) * f + rand(-6, 6), y1 + (y2 - y1) * f + rand(-6, 6)); }
        ctx.lineTo(x2, y2);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  function drawHUD() {
    ctx.fillStyle = 'rgba(8,10,24,0.92)'; ctx.fillRect(0, 0, W, HUD_H);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = 'bold 18px system-ui, sans-serif';
    emo('❤️', 20, 24, 20); ctx.fillStyle = G.hearts <= 3 ? '#ff6b6b' : '#ffffff'; ctx.fillText(Math.max(0, G.hearts), 34, 25);
    emo('🪙', 86, 24, 20); ctx.fillStyle = '#ffd84a'; ctx.fillText(Math.floor(G.coins), 100, 25);
    emo('💎', 170, 24, 20); ctx.fillStyle = '#8fe6ff'; ctx.fillText(run.gems + (G.loot ? ' +' + G.loot : ''), 184, 25);
    ctx.textAlign = 'right'; ctx.fillStyle = '#9aa3d6'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.fillText('LEVEL ' + G.n, W - 60, 16);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.fillText(`Wave ${Math.min(G.waveIdx, G.waves.length)}/${G.waves.length}`, W - 60, 33);
    // spy report: what the next wave brings
    if (G.waveIdx < G.waves.length && !G.spawnQ.length) {
      const counts = {}; for (const k of G.waves[G.waveIdx]) counts[k] = (counts[k] || 0) + 1;
      ctx.textAlign = 'left'; ctx.font = 'bold 12px system-ui, sans-serif';
      let x = 8; const y = HUD_H + 13;
      const keys = Object.keys(counts), wd = 44 + keys.length * 40;
      ctx.fillStyle = 'rgba(8,10,24,0.45)'; rr(4, HUD_H + 3, wd, 20, 8); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillText('Next:', x + 2, y); x += 44;
      for (const k of keys) { emo(FOES[k].icon, x, y, 16); ctx.fillText('×' + counts[k], x + 9, y); x += 40; }
    }
    const bits = []; if (G.relicDmg) bits.push('🏺 +' + Math.round(G.relicDmg * 100) + '%'); if (G.freeDigs) bits.push('⛏️ ' + G.freeDigs + ' free'); if (G.mush) bits.push('🍄'); if (G.freeWeather > 0) bits.push('💧 ' + Math.ceil(G.freeWeather) + 's');
    if (bits.length) { ctx.textAlign = 'right'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillStyle = 'rgba(8,10,24,0.45)'; const s = bits.join('  '), tw = ctx.measureText(s).width + 14; rr(W - 4 - tw, HUD_H + 3, tw, 20, 8); ctx.fill(); ctx.fillStyle = '#ffe680'; ctx.fillText(s, W - 11, HUD_H + 13); }
  }
  function drawBar() {
    ctx.fillStyle = '#0c0e20'; ctx.fillRect(0, BAR_Y, W, H - BAR_Y);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    for (const b of barButtons()) {
      if (b.kind === 'w') {
        const on = G.weather === b.w;
        ctx.fillStyle = on ? '#ffe680' : '#1c2040'; rr(b.x, b.y, b.wd, b.h, 9); ctx.fill();
        emo(WEATHER[b.w].icon, b.x + b.wd / 2, b.y + 14, 20);
        ctx.fillStyle = on ? '#251a00' : '#9aa3d6'; ctx.font = 'bold 9px system-ui, sans-serif'; ctx.fillText(WEATHER[b.w].label, b.x + b.wd / 2, b.y + 31);
      } else if (b.kind === 'speed') {
        ctx.fillStyle = speed > 1 ? '#5ef0ff' : '#1c2040'; rr(b.x, b.y, b.wd, b.h, 9); ctx.fill();
        ctx.fillStyle = speed > 1 ? '#041021' : '#dfe4ff'; ctx.font = 'bold 15px system-ui, sans-serif'; ctx.fillText(speed + '×', b.x + b.wd / 2, b.y + 15);
        ctx.font = 'bold 9px system-ui, sans-serif'; ctx.fillStyle = speed > 1 ? '#041021' : '#9aa3d6'; ctx.fillText('speed', b.x + b.wd / 2, b.y + 31);
      } else {
        const ok = canCallWave();
        const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h); g.addColorStop(0, ok ? '#5ef0ff' : '#22264a'); g.addColorStop(1, ok ? '#2f8cff' : '#22264a');
        ctx.fillStyle = g; rr(b.x, b.y, b.wd, b.h, 10); ctx.fill();
        ctx.fillStyle = ok ? '#041021' : '#7f88bb'; ctx.font = 'bold 14px system-ui, sans-serif';
        let s, s2 = '';
        if (ok) { s = `▶ Wave ${G.waveIdx + 1} now`; s2 = `auto in ${Math.ceil(G.countdown)}s · +${earlyBonus()} coins`; }
        else if (G.spawnQ.length) { s = `Wave ${G.waveIdx} incoming`; s2 = G.spawnQ.length + ' more to come'; }
        else { s = 'Final wave'; s2 = G.enemies.length + ' left'; }
        ctx.fillText(s, b.x + b.wd / 2, b.y + 13);
        ctx.font = 'bold 10px system-ui, sans-serif'; ctx.fillText(s2, b.x + b.wd / 2, b.y + 29);
      }
    }
  }
  function wrapText(text, x, y, maxW, lh) {
    let line = '';
    for (const w of text.split(' ')) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = test;
    }
    if (line) ctx.fillText(line, x, y);
  }
  let tAcc = 0, lastCoins = -1;
  function draw(t) {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    if (!G) { ctx.fillStyle = '#0b0d1a'; ctx.fillRect(0, 0, W, H); return; }
    ctx.save();
    if (G.shake > 0 && mode === 'play') ctx.translate(rand(-G.shake, G.shake) * 0.4, rand(-G.shake, G.shake) * 0.4);
    drawSky(t);
    drawGround();
    drawUnderground(t);
    drawWeatherColumn(t);
    drawEnemies(t, false);
    drawTowers();
    drawEnemies(t, true);
    drawCloud();
    drawShots();
    for (const p of G.parts) {
      if (p.ring) { ctx.strokeStyle = p.c; ctx.globalAlpha = p.t / p.T; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, p.ring * (1 - p.t / p.T * 0.6), 0, 7); ctx.stroke(); }
      else { ctx.globalAlpha = Math.min(1, p.t * 2.5); ctx.fillStyle = p.c; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const tx of G.texts) {
      ctx.globalAlpha = Math.min(1, tx.t * 2); ctx.font = (tx.big ? 'bold 22px' : 'bold 13px') + ' system-ui, sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.strokeText(tx.s, tx.x, tx.y);
      ctx.fillStyle = tx.c; ctx.fillText(tx.s, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    drawHUD();
    drawBar();
    if (mode === 'play' && G.banner > 0) {
      const a = Math.min(1, G.banner);
      ctx.globalAlpha = a * 0.78; ctx.fillStyle = '#080a18'; rr(30, 262, W - 60, 136, 16); ctx.fill();
      ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 34px system-ui, sans-serif'; ctx.fillText('LEVEL ' + G.n, W / 2, 292);
      ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 18px system-ui, sans-serif'; ctx.fillText(G.name, W / 2, 322);
      const tip = TIPS[G.n] || (G.n % 5 === 0 ? TIPS[5] : '');
      if (tip) { ctx.fillStyle = '#c9d0ff'; ctx.font = '14px system-ui, sans-serif'; wrapText(tip, W / 2, 350, W - 100, 19); }
      ctx.globalAlpha = 1;
    }
    if (popInfo && G.coins !== lastCoins) refreshPop();
    lastCoins = G.coins;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
    tAcc += dt;
    for (let i = 0; i < speed; i++) update(dt);
    draw(tAcc);
    requestAnimationFrame(frame);
  }

  // debug hook for automated testing (harmless in normal play)
  window.__ss = {
    get mode() { return mode; }, get run() { return run; }, get G() { return G; },
    step(dt) { update(dt); }, build: tryBuild, dig(c, r) { return orderDig(tileAt(c, r)); },
    weather: setWeather, wave: callWave, buyId(id) { return buy(ITEM_BY_ID[id]); },
    next() { lastSummary = null; startLevel(); }, W, H, CELL, GROUND_Y, UG_Y, BAR_Y,
  };

  resize();
  showMenu();
  requestAnimationFrame(frame);
})();
