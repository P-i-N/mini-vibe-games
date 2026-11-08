'use strict';
/* Brick Bazaar - a one-handed brick breaker with a coin shop.
   Controls: drag / move the mouse to steer, tap / click to launch. Everything else is automatic. */
(() => {
  const W = 480, H = 800;
  const HUD_H = 58;
  const PADDLE_Y = H - 115, PADDLE_H = 14;
  const GOALIE_Y = H - 62, NET_Y = H - 26;
  const COLS = 10, BW = 44, BH = 20, GAP = 2;
  const LEFT = (W - (COLS * (BW + GAP) - GAP)) / 2, TOP = 82;
  const SAVE_KEY = 'brickbazaar.save.v1', BEST_KEY = 'brickbazaar.best.v1', MUTE_KEY = 'brickbazaar.mute';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('wrap');
  const ov = document.getElementById('overlay');
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
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- audio ----------
  let actx = null, muted = store.get(MUTE_KEY, false);
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
    if (actx && actx.state === 'suspended') actx.resume();
  }
  let lastSfx = {};
  function beep(freq, dur = 0.06, type = 'square', vol = 0.05, slide = 0, key = null) {
    if (muted || !actx) return;
    if (key) { const t = performance.now(); if (lastSfx[key] && t - lastSfx[key] < 35) return; lastSfx[key] = t; }
    const t0 = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const sfx = {
    paddle: () => beep(330, 0.05, 'square', 0.04, 0, 'pad'),
    brick: (hp) => beep(520 + hp * 60, 0.04, 'square', 0.03, 0, 'brk'),
    pop: () => beep(760, 0.07, 'triangle', 0.05, 300, 'pop'),
    stone: () => beep(160, 0.05, 'square', 0.03, 0, 'stn'),
    coin: () => beep(1250, 0.06, 'sine', 0.05, 500, 'coin'),
    pu: () => { beep(500, 0.08, 'triangle', 0.06, 400); setTimeout(() => beep(900, 0.1, 'triangle', 0.05, 300), 70); },
    shot: () => beep(900, 0.03, 'sawtooth', 0.015, -500, 'shot'),
    boom: () => beep(120, 0.25, 'sawtooth', 0.06, -80, 'boom'),
    zap: () => beep(1400, 0.08, 'sawtooth', 0.025, -1100, 'zap'),
    lose: () => beep(300, 0.4, 'sawtooth', 0.06, -250),
    buy: () => { beep(700, 0.06, 'triangle', 0.06); setTimeout(() => beep(1100, 0.09, 'triangle', 0.06), 60); },
    nope: () => beep(140, 0.12, 'square', 0.05),
    clear: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.14, 'triangle', 0.07), i * 90)),
    net: () => beep(240, 0.12, 'sine', 0.07, 300),
  };

  // ---------- utils ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- shop catalogue ----------
  const GUNS = {
    blaster: { name: 'Pea Blaster', icon: '🔫', rate: 0.45, pack: 40, packCost: 12, color: '#7cf2ff' },
    laser: { name: 'Prism Lance', icon: '🔆', rate: 0.85, pack: 20, packCost: 18, color: '#ff7cf0' },
    rocket: { name: 'Pop Rockets', icon: '🚀', rate: 1.5, pack: 10, packCost: 22, color: '#ffb14a' },
    scatter: { name: 'Fan Cannon', icon: '🎆', rate: 1.15, pack: 20, packCost: 18, color: '#b9ff6b' },
    arc: { name: 'Arc Coil', icon: '⚡', rate: 1.3, pack: 15, packCost: 22, color: '#9ab8ff' },
  };
  const CATS = [
    { id: 'weap', name: '🔫 Guns' }, { id: 'ammo', name: '📦 Ammo' }, { id: 'drone', name: '🛰️ Drones' },
    { id: 'gear', name: '🧲 Gear' }, { id: 'ball', name: '⚪ Ball' }, { id: 'eco', name: '🪙 Economy' },
  ];
  const ITEMS = [
    // Guns: level 1 = buy, further levels = faster fire
    { id: 'gun_blaster', cat: 'weap', gun: 'blaster', max: 5, base: 50, grow: 1.55,
      desc: (l) => l ? `Twin shots from the paddle tips. Fire rate +15% per level.` : 'Twin shots from the paddle tips. Fires automatically. Comes with 40 ammo.' },
    { id: 'gun_laser', cat: 'weap', gun: 'laser', max: 5, base: 120, grow: 1.5,
      desc: (l) => `Piercing beam that cuts through ${3 + Math.max(0, l - 1)} bricks.` + (l ? ' More pierce + rate per level.' : ' Comes with 20 ammo.') },
    { id: 'gun_rocket', cat: 'weap', gun: 'rocket', max: 5, base: 170, grow: 1.5,
      desc: (l) => `Rockets explode on impact, damaging everything nearby.` + (l ? ' Bigger blast + rate per level.' : ' Comes with 10 rockets.') },
    { id: 'gun_scatter', cat: 'weap', gun: 'scatter', max: 5, base: 140, grow: 1.5,
      desc: (l) => `Sprays a fan of ${5 + Math.max(0, l - 1)} pellets.` + (l ? ' More pellets per level.' : ' Comes with 20 shells.') },
    { id: 'gun_arc', cat: 'weap', gun: 'arc', max: 5, base: 230, grow: 1.5,
      desc: (l) => `Chain lightning jumps between ${3 + Math.max(0, l - 1)} bricks. Never misses.` + (l ? '' : ' Comes with 15 cells.') },
    { id: 'recycler', cat: 'weap', icon: '♻️', name: 'Recycler', max: 4, base: 80, grow: 1.7,
      desc: (l) => `${(l + 1) * 12}% chance a shot costs no ammo.`, req: () => ownsAnyGun(), reqText: 'Needs a gun' },
    { id: 'belt', cat: 'weap', icon: '🎒', name: 'Ammo Belt', max: 4, base: 60, grow: 1.7,
      desc: (l) => `Ammo packs and crates give +${(l + 1) * 25}% more.`, req: () => ownsAnyGun(), reqText: 'Needs a gun' },

    { id: 'ammo_blaster', cat: 'ammo', ammo: 'blaster' },
    { id: 'ammo_laser', cat: 'ammo', ammo: 'laser' },
    { id: 'ammo_rocket', cat: 'ammo', ammo: 'rocket' },
    { id: 'ammo_scatter', cat: 'ammo', ammo: 'scatter' },
    { id: 'ammo_arc', cat: 'ammo', ammo: 'arc' },
    { id: 'ammo_all', cat: 'ammo', icon: '🧰', name: 'Supply Drop', allAmmo: true,
      desc: () => 'Half a pack for every gun you own, at a discount.' },

    { id: 'd_orbit', cat: 'drone', icon: '🛰️', name: 'Orbiter', max: 3, base: 100, grow: 1.8,
      desc: (l) => `Circles your paddle and fires free shots. Owned: ${l}/3.` },
    { id: 'd_hunter', cat: 'drone', icon: '🐝', name: 'Hunter Bee', max: 3, base: 160, grow: 1.9,
      desc: (l) => `Flies off and rams bricks on its own. Owned: ${l}/3.` },
    { id: 'd_collect', cat: 'drone', icon: '🤖', name: 'Collector', max: 2, base: 90, grow: 2.2,
      desc: (l) => `Zips around grabbing falling coins and capsules. Owned: ${l}/2.` },
    { id: 'd_goalie', cat: 'drone', icon: '🧤', name: 'Goalie', max: 3, base: 140, grow: 1.8,
      desc: (l) => l ? `Saves a missed ball. Recharge: ${goalieRecharge(l)}s → ${goalieRecharge(l + 1)}s.` : `Patrols below the paddle and saves a missed ball every ${goalieRecharge(1)}s.` },
    { id: 'd_over', cat: 'drone', icon: '⚙️', name: 'Overclock', max: 3, base: 120, grow: 1.8,
      desc: (l) => `All drones work ${(l + 1) * 25}% faster.`, req: () => lv('d_orbit') + lv('d_hunter') + lv('d_collect') + lv('d_goalie') > 0, reqText: 'Needs a drone' },

    { id: 'width', cat: 'gear', icon: '↔️', name: 'Long Paddle', max: 5, base: 40, grow: 1.5,
      desc: () => 'Paddle +12% wider.' },
    { id: 'magnet', cat: 'gear', icon: '🧲', name: 'Coin Magnet', max: 5, base: 45, grow: 1.6,
      desc: (l) => (l ? 'Bigger, stronger pull.' : 'Pulls falling coins toward the paddle.') + (l >= 2 ? ' Now pulls capsules too.' : ' Level 3 also pulls capsules.') },
    { id: 'net', cat: 'gear', icon: '🥅', name: 'Safety Net', max: 3, base: 70, grow: 1.8,
      desc: (l) => `A barrier that bounces back ${l + 1} missed ball${l ? 's' : ''} each level.` },
    { id: 'aim', cat: 'gear', icon: '🎯', name: 'Aim Sight', max: 1, base: 25, grow: 1,
      desc: () => 'Shows the launch path before you tap.' },
    { id: 'puluck', cat: 'gear', icon: '🎁', name: 'Lucky Capsules', max: 4, base: 50, grow: 1.6,
      desc: () => 'More power-up capsules, and they last 15% longer.' },
    { id: 'life', cat: 'gear', icon: '❤️', name: 'Extra Life', consumable: true, base: 60, grow: 1.45,
      desc: () => `+1 life (max 6). You have ${run ? run.lives : 0}.` },

    { id: 'dmg', cat: 'ball', icon: '🔩', name: 'Heavy Core', max: 4, base: 90, grow: 1.9,
      desc: (l) => `Ball deals ${l + 2} damage per hit.` },
    { id: 'crit', cat: 'ball', icon: '✨', name: 'Crit Spark', max: 5, base: 60, grow: 1.5,
      desc: (l) => `${(l + 1) * 8}% chance for a triple-damage hit.` },
    { id: 'pierce', cat: 'ball', icon: '🔥', name: 'Ember Core', max: 3, base: 110, grow: 1.9,
      desc: (l) => `After each paddle bounce the ball smashes through ${l + 1} brick${l ? 's' : ''} without bouncing.` },
    { id: 'twin', cat: 'ball', icon: '⚪', name: 'Twin Serve', max: 2, base: 100, grow: 2.2,
      desc: (l) => `Every serve launches ${l + 2} balls.` },
    { id: 'chill', cat: 'ball', icon: '❄️', name: 'Chill Field', max: 3, base: 60, grow: 1.7,
      desc: () => 'Ball moves 7% slower. Easier to follow.' },

    { id: 'luck', cat: 'eco', icon: '🍀', name: 'Lucky Bricks', max: 5, base: 40, grow: 1.55,
      desc: (l) => `Coin drop chance ${Math.round(coinChance(l) * 100)}% → ${Math.round(coinChance(l + 1) * 100)}%.` },
    { id: 'value', cat: 'eco', icon: '🪙', name: 'Gold Plating', max: 4, base: 70, grow: 1.8,
      desc: (l) => `Each coin is worth ${l + 2}.` },
    { id: 'piggy', cat: 'eco', icon: '🐷', name: 'Piggy Bank', max: 4, base: 80, grow: 1.7,
      desc: (l) => `Earn ${(l + 1) * 5}% interest on savings after each level (max ${(l + 1) * 30}).` },
    { id: 'streak', cat: 'eco', icon: '🔗', name: 'Streak Bonus', max: 3, base: 60, grow: 1.7,
      desc: (l) => `Every ${7 - (l + 1)} bricks in a row without touching the paddle drops a bonus coin.` },
    { id: 'bounty', cat: 'eco', icon: '💰', name: 'Bounty Board', max: 4, base: 55, grow: 1.6,
      desc: (l) => `Level clear bonus +${(l + 1) * 25}%.` },
  ];
  const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
  for (const it of ITEMS) {
    if (it.gun) { it.icon = GUNS[it.gun].icon; it.name = GUNS[it.gun].name; it.gunItem = true; }
    if (it.ammo) {
      const g = GUNS[it.ammo]; it.icon = '📦'; it.name = g.name + ' ammo';
      it.req = () => lv('gun_' + it.ammo) > 0; it.reqText = 'Buy the gun first';
    }
  }

  const coinChance = (l) => 0.16 + 0.05 * l;
  const goalieRecharge = (l) => [0, 12, 9, 6, 6][Math.min(l, 4)];
  const lv = (id) => (run && run.up[id]) || 0;
  const ownsAnyGun = () => Object.keys(GUNS).some((g) => lv('gun_' + g) > 0);
  const ammoMult = () => 1 + 0.25 * lv('belt');

  function itemCost(it) {
    if (it.ammo) return GUNS[it.ammo].packCost;
    if (it.allAmmo) {
      let c = 0; for (const g in GUNS) if (lv('gun_' + g)) c += GUNS[g].packCost * 0.5;
      return Math.max(5, Math.round(c * 0.8));
    }
    const l = it.consumable ? run.lifeBought : lv(it.id);
    return Math.round(it.base * Math.pow(it.grow, l));
  }
  function itemState(it) {
    if (it.req && !it.req()) return 'locked';
    if (it.allAmmo && !ownsAnyGun()) return 'locked';
    if (it.consumable) { if (it.id === 'life' && run.lives >= 6) return 'max'; }
    else if (it.max && lv(it.id) >= it.max) return 'max';
    return run.coins >= itemCost(it) ? 'ok' : 'poor';
  }
  function buy(it) {
    if (itemState(it) !== 'ok') { sfx.nope(); return false; }
    run.coins -= itemCost(it);
    if (it.ammo) run.ammo[it.ammo] += Math.round(GUNS[it.ammo].pack * ammoMult());
    else if (it.allAmmo) { for (const g in GUNS) if (lv('gun_' + g)) run.ammo[g] += Math.round(GUNS[g].pack * 0.5 * ammoMult()); }
    else if (it.id === 'life') { run.lives++; run.lifeBought++; }
    else {
      run.up[it.id] = lv(it.id) + 1;
      if (it.gunItem && run.up[it.id] === 1) run.ammo[it.gun] += GUNS[it.gun].pack;
    }
    sfx.buy(); saveRun(); return true;
  }

  // ---------- run / save ----------
  let run = null;
  function newRun() {
    return { level: 1, coins: 0, lives: 3, up: {}, ammo: { blaster: 0, laser: 0, rocket: 0, scatter: 0, arc: 0 }, lifeBought: 0, score: 0 };
  }
  function saveRun() { if (run) store.set(SAVE_KEY, run); }
  function loadRun() {
    const r = store.get(SAVE_KEY, null);
    if (!r || typeof r.level !== 'number') return null;
    r.ammo = Object.assign({ blaster: 0, laser: 0, rocket: 0, scatter: 0, arc: 0 }, r.ammo || {});
    r.up = r.up || {};
    return r;
  }
  let best = store.get(BEST_KEY, { level: 0, score: 0 });
  function recordBest() {
    const reached = run.level;
    if (reached > best.level || run.score > best.score) {
      best = { level: Math.max(best.level, reached), score: Math.max(best.score, run.score) };
      store.set(BEST_KEY, best);
    }
  }

  // ---------- level generation ----------
  const PATTERNS = [
    (r, c, R) => true, // wall
    (r, c) => (r + c) % 2 === 0, // checker
    (r, c, R) => Math.abs(c - 4.5) <= (r / Math.max(1, R - 1)) * 4.5 + 0.5, // pyramid
    (r, c, R) => Math.abs(c - 4.5) / 5 + Math.abs(r - (R - 1) / 2) / (R / 2 + 0.5) <= 1.0, // diamond
    (r) => r % 2 === 0, // stripes
    (r, c) => c % 3 !== 2, // columns
    (r, c, R) => r === 0 || r === R - 1 || c === 0 || c === 9 || (r === Math.floor(R / 2) && c > 2 && c < 7), // frame
    (r, c) => (c + r) % 4 < 2, // zigzag
    (r, c, R) => { const d = Math.max(Math.abs(c - 4.5), Math.abs(r - (R - 1) / 2) * 1.4); return Math.floor(d) % 2 === 0; }, // rings
    (r, c, R) => (c < 4 || c > 5) ? r < R - 1 : r % 3 === 0, // gate
    null, // random symmetric
    null, // random symmetric
  ];
  const BRICK_COLORS = ['#5ef0ff', '#7cf2a8', '#ffe066', '#ffa94d', '#ff6b8b', '#c08cff', '#7c8cff'];

  function genLevel(n) {
    const rnd = mulberry32(n * 7919 + 13);
    const R = Math.min(5 + Math.floor((n + 1) / 2), 12);
    let pi = n === 1 ? 0 : n === 2 ? 2 : Math.floor(rnd() * PATTERNS.length);
    let pat = PATTERNS[pi];
    if (!pat) {
      const cells = {};
      for (let r = 0; r < R; r++) for (let c = 0; c < 5; c++) cells[r + ',' + c] = rnd() > 0.33;
      pat = (r, c) => cells[r + ',' + (c < 5 ? c : 9 - c)];
    }
    const vault = n % 5 === 0;
    const bricks = [];
    const hpTier = 1 + Math.floor((n - 1) / 3);
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!pat(r, c, R)) continue;
        let hp = 1 + Math.floor(rnd() * Math.min(hpTier, 5));
        if (r < R / 3 && n > 3) hp += 1;
        hp = Math.min(hp, 7);
        let type = 'normal';
        const roll = rnd();
        if (vault && roll < 0.22) type = 'gold';
        else if (n >= 4 && roll < 0.05) type = 'stone';
        else if (n >= 3 && roll < 0.11) type = 'steel';
        else if (n >= 2 && roll < 0.18) type = 'bomb';
        else if (roll > 0.97) type = 'gold';
        if (type === 'steel') hp = 4 + Math.floor(n / 3);
        if (type === 'gold') hp = 2 + Math.floor(n / 6);
        if (type === 'bomb') hp = 1;
        if (type === 'stone') hp = 999;
        bricks.push({ x: LEFT + c * (BW + GAP), y: TOP + r * (BH + GAP), w: BW, h: BH, hp, maxhp: hp, type, alive: true, flash: 0, col: c, row: r });
      }
    }
    // never let stones be the majority or wall off everything
    if (bricks.filter((b) => b.type !== 'stone').length < 8) bricks.forEach((b) => { if (b.type === 'stone') { b.type = 'normal'; b.hp = b.maxhp = 2; } });
    return bricks;
  }

  // ---------- game state ----------
  let mode = 'menu'; // menu | play | pause | shop | over
  let G = null;
  const paddle = { x: W / 2, tx: W / 2, w: 90, y: PADDLE_Y };
  let lastSummary = null;

  function basePaddleW() { return 84 * (1 + 0.12 * lv('width')); }
  function puDur(base) { return base * (1 + 0.15 * lv('puluck')); }

  function startLevel() {
    G = {
      bricks: genLevel(run.level), balls: [], coins: [], pus: [], shots: [], parts: [], texts: [], drones: [], bolts: [],
      fx: { wide: 0, slow: 0, fire: 0, glue: 0 }, net: lv('net'), goalieCd: 0, combo: 0, comboBest: 0,
      levelCoins: 0, time: 0, clearT: -1, gunCd: { blaster: 0.3, laser: 0.5, rocket: 0.8, scatter: 0.6, arc: 0.7 },
      shake: 0, banner: 1.8, started: false,
    };
    paddle.w = basePaddleW(); paddle.x = paddle.tx = W / 2;
    serve();
    // drones
    for (let i = 0; i < lv('d_orbit'); i++) G.drones.push({ type: 'orbit', a: (i / Math.max(1, lv('d_orbit'))) * Math.PI * 2, cd: 0.5 + i * 0.3, x: W / 2, y: PADDLE_Y - 40 });
    for (let i = 0; i < lv('d_hunter'); i++) G.drones.push({ type: 'hunter', x: rand(80, 400), y: 420, vx: 0, vy: 0, cd: 0, target: null });
    for (let i = 0; i < lv('d_collect'); i++) G.drones.push({ type: 'collect', x: W / 2 + (i ? 40 : -40), y: PADDLE_Y - 60, target: null });
    if (lv('d_goalie')) G.drones.push({ type: 'goalie', x: W / 2 });
    mode = 'play';
    hideOverlay();
    pauseBtn.style.display = 'block';
  }

  function makeBall(x, y, vx, vy) {
    return { x, y, vx, vy, r: 7, stuck: false, off: 0, stuckT: 0, pierce: 0, inside: new Set(), trail: [], serve: false };
  }
  function serve() {
    const b = makeBall(paddle.x, PADDLE_Y - 8, 0, 0);
    b.stuck = true; b.off = 0; b.serve = true;
    G.balls.push(b);
  }
  function launchAngle(b) {
    if (b.serve) return clamp(-(paddle.x - W / 2) / (W / 2) * 0.55, -0.55, 0.55) || 0.12;
    return clamp((b.off / (paddle.w / 2)) * 1.0, -1.05, 1.05);
  }
  function launch() {
    let any = false;
    for (const b of G.balls.slice()) {
      if (!b.stuck) continue;
      any = true;
      const a = launchAngle(b), s = ballSpeed();
      b.stuck = false; b.vx = Math.sin(a) * s; b.vy = -Math.cos(a) * s;
      b.pierce = lv('pierce');
      if (b.serve) {
        b.serve = false;
        for (let i = 0; i < lv('twin'); i++) {
          const a2 = a + (i % 2 ? -1 : 1) * (0.32 + 0.15 * Math.floor(i / 2));
          const nb = makeBall(b.x, b.y, Math.sin(a2) * s, -Math.cos(a2) * s); nb.pierce = lv('pierce');
          G.balls.push(nb);
        }
      }
    }
    if (any) { G.started = true; sfx.paddle(); }
  }
  function ballSpeed() {
    let s = 360 + Math.min(run.level, 30) * 7 + Math.min(70, G.time * 1.0);
    s *= 1 - 0.07 * lv('chill');
    if (G.fx.slow > 0) s *= 0.68;
    return s;
  }

  // ---------- drops ----------
  const PU = {
    wide: { c: '#4fd1ff', l: 'W', w: 3 }, multi: { c: '#c08cff', l: 'M', w: 3 }, slow: { c: '#7cf2a8', l: 'S', w: 2 },
    fire: { c: '#ff8a3d', l: 'F', w: 2 }, glue: { c: '#ffe066', l: 'G', w: 1.6 }, ammo: { c: '#d8dee9', l: 'A', w: 3 },
    life: { c: '#ff5c8a', l: '♥', w: 0.45 }, cash: { c: '#ffd700', l: '$', w: 1.8 }, net: { c: '#6ee7ff', l: 'N', w: 1 },
  };
  function rollPU() {
    const opts = Object.entries(PU).filter(([k]) => k !== 'ammo' || ownsAnyGun()).filter(([k]) => k !== 'life' || run.lives < 6);
    let tot = 0; for (const [, v] of opts) tot += v.w;
    let r = Math.random() * tot;
    for (const [k, v] of opts) { r -= v.w; if (r <= 0) return k; }
    return 'wide';
  }
  function dropCoin(x, y, n = 1) {
    for (let i = 0; i < n; i++) G.coins.push({ x: x + rand(-6, 6), y, vx: rand(-40, 40) * (n > 1 ? 2 : 1), vy: rand(-140, -40), spin: Math.random() * 6, val: 1 + lv('value') });
  }
  function collectCoin(c) {
    run.coins += c.val; G.levelCoins += c.val; sfx.coin();
    G.texts.push({ x: c.x, y: c.y - 10, t: 0.7, s: '+' + c.val, c: '#ffd84a' });
  }
  function collectPU(p) {
    sfx.pu();
    const k = p.k;
    G.texts.push({ x: p.x, y: p.y - 14, t: 1, s: { wide: 'WIDE!', multi: 'MULTI!', slow: 'SLOW', fire: 'FIREBALL!', glue: 'GLUE', ammo: 'AMMO!', life: '+1 LIFE', cash: 'CASH!', net: '+NET' }[k], c: PU[k].c });
    if (k === 'wide') G.fx.wide = puDur(15);
    else if (k === 'slow') G.fx.slow = puDur(10);
    else if (k === 'fire') G.fx.fire = puDur(7);
    else if (k === 'glue') G.fx.glue = puDur(14);
    else if (k === 'life') run.lives = Math.min(6, run.lives + 1);
    else if (k === 'net') G.net++;
    else if (k === 'cash') dropCoin(p.x, p.y - 20, 8);
    else if (k === 'ammo') { for (const g in GUNS) if (lv('gun_' + g)) run.ammo[g] += Math.round(GUNS[g].pack * 0.35 * ammoMult()); }
    else if (k === 'multi') {
      if (G.balls.some((b) => b.stuck)) launch();
      const src = G.balls.slice();
      for (const b of src) {
        if (G.balls.length >= 15) break;
        for (const d of [-0.4, 0.4]) {
          const c = Math.cos(d), s = Math.sin(d);
          const nb = makeBall(b.x, b.y, b.vx * c - b.vy * s, b.vx * s + b.vy * c);
          nb.pierce = b.pierce; G.balls.push(nb);
        }
      }
    }
  }

  // ---------- bricks ----------
  function burst(x, y, color, n = 8, sp = 160) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = rand(sp * 0.3, sp);
      G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: rand(0.3, 0.6), c: color, s: rand(2, 4) });
    }
  }
  function brickColor(b) {
    if (b.type === 'steel') return '#9fb0c8';
    if (b.type === 'gold') return '#ffd23f';
    if (b.type === 'bomb') return '#ff4d5e';
    if (b.type === 'stone') return '#4a4f6a';
    return BRICK_COLORS[(b.maxhp - 1 + b.row) % BRICK_COLORS.length];
  }
  function hitBrick(b, dmg, fromBall) {
    if (!b.alive) return false;
    if (b.type === 'stone') { b.flash = 0.12; sfx.stone(); return false; }
    if (fromBall && Math.random() < lv('crit') * 0.08) {
      dmg *= 3; G.texts.push({ x: b.x + b.w / 2, y: b.y, t: 0.6, s: 'CRIT', c: '#fff27a' });
    }
    b.hp -= dmg; b.flash = 0.12;
    if (b.hp <= 0) { destroyBrick(b); return true; }
    sfx.brick(b.hp);
    return false;
  }
  function destroyBrick(b) {
    b.alive = false;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    burst(cx, cy, brickColor(b), 10);
    run.score += 10 * b.maxhp; G.combo++; G.comboBest = Math.max(G.comboBest, G.combo);
    sfx.pop();
    if (b.type === 'gold') dropCoin(cx, cy, 5 + Math.floor(Math.random() * 5));
    else if (Math.random() < coinChance(lv('luck'))) dropCoin(cx, cy, 1);
    const st = lv('streak');
    if (st && G.combo % (7 - st) === 0) { dropCoin(cx, cy, 1); }
    if (Math.random() < 0.075 + 0.02 * lv('puluck')) G.pus.push({ x: cx, y: cy, vy: 110, k: rollPU() });
    if (b.type === 'bomb') explode(cx, cy, 62, 2, '#ff6b3d');
  }
  function explode(x, y, rad, dmg, color) {
    G.shake = Math.min(10, G.shake + 5); sfx.boom();
    burst(x, y, color, 18, 260);
    G.parts.push({ x, y, ring: rad, t: 0.3, T: 0.3, c: color });
    for (const o of G.bricks) {
      if (!o.alive) continue;
      const dx = clamp(x, o.x, o.x + o.w) - x, dy = clamp(y, o.y, o.y + o.h) - y;
      if (dx * dx + dy * dy <= rad * rad) hitBrick(o, dmg, false);
    }
  }
  function destructibleLeft() { let n = 0; for (const b of G.bricks) if (b.alive && b.type !== 'stone') n++; return n; }

  // ---------- input ----------
  function toGame(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }
  canvas.addEventListener('pointerdown', (e) => {
    audio();
    if (mode !== 'play' || e.button === 2) return;
    const p = toGame(e); paddle.tx = p.x;
    launch();
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (mode !== 'play') return;
    paddle.tx = toGame(e).x;
  });
  pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); audio(); if (mode === 'play') showPause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') showPause(); });
  // Right click or Escape pauses (Escape again resumes)
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); if (mode === 'play') showPause(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (mode === 'play') showPause();
    else if (mode === 'pause') { mode = 'play'; hideOverlay(); }
  });

  // ---------- update ----------
  function update(dt) {
    if (mode !== 'play') return;
    G.time += dt;
    if (G.banner > 0) G.banner -= dt;
    for (const k in G.fx) if (G.fx[k] > 0) G.fx[k] = Math.max(0, G.fx[k] - dt);
    G.shake = Math.max(0, G.shake - dt * 30);

    // paddle
    const targetW = basePaddleW() * (G.fx.wide > 0 ? 1.5 : 1);
    paddle.w += (targetW - paddle.w) * Math.min(1, dt * 8);
    paddle.x += (paddle.tx - paddle.x) * Math.min(1, dt * 30);
    paddle.x = clamp(paddle.x, paddle.w / 2, W - paddle.w / 2);

    updateBalls(dt);
    updateGuns(dt);
    updateDrones(dt);
    updateShots(dt);
    updateDrops(dt);
    updateParticles(dt);
    for (const b of G.bricks) if (b.flash > 0) b.flash -= dt;

    if (G.clearT < 0 && destructibleLeft() === 0) { G.clearT = 1.2; sfx.clear(); }
    if (G.clearT >= 0) { G.clearT -= dt; if (G.clearT <= 0) finishLevel(); }
  }

  function updateBalls(dt) {
    const sp = ballSpeed();
    const fire = G.fx.fire > 0;
    for (const b of G.balls) {
      if (b.stuck) {
        b.x = clamp(paddle.x + b.off, b.r, W - b.r); b.y = PADDLE_Y - b.r - 1;
        b.stuckT += dt;
        if (!b.serve && b.stuckT > 2.2) { b.stuckT = 0; launchOne(b); }
        continue;
      }
      // normalise speed, keep it from going too flat
      let v = Math.hypot(b.vx, b.vy) || 1;
      b.vx = (b.vx / v) * sp; b.vy = (b.vy / v) * sp;
      if (Math.abs(b.vy) < sp * 0.28) { b.vy = Math.sign(b.vy || -1) * sp * 0.28; b.vx = Math.sign(b.vx) * Math.sqrt(sp * sp - b.vy * b.vy); }

      const steps = Math.max(1, Math.ceil((sp * dt) / (b.r * 0.7)));
      const sdt = dt / steps;
      for (let s = 0; s < steps && !b.dead; s++) {
        b.x += b.vx * sdt; b.y += b.vy * sdt;
        // walls
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
        if (b.y < HUD_H + b.r) { b.y = HUD_H + b.r; b.vy = Math.abs(b.vy); }
        // paddle
        if (b.vy > 0 && b.y + b.r >= PADDLE_Y && b.y - b.r <= PADDLE_Y + PADDLE_H && Math.abs(b.x - paddle.x) <= paddle.w / 2 + b.r) {
          const off = clamp((b.x - paddle.x) / (paddle.w / 2), -1, 1);
          const a = off * 1.08 + rand(-0.07, 0.07);
          b.vx = Math.sin(a) * sp; b.vy = -Math.cos(a) * sp; b.y = PADDLE_Y - b.r;
          b.pierce = lv('pierce'); G.combo = 0;
          sfx.paddle();
          if (G.fx.glue > 0) { b.stuck = true; b.off = b.x - paddle.x; b.stuckT = 0; break; }
          continue;
        }
        // goalie
        const goalie = G.drones.find((d) => d.type === 'goalie');
        if (goalie && G.goalieCd <= 0 && b.vy > 0 && b.y + b.r >= GOALIE_Y && b.y < GOALIE_Y + 10 && Math.abs(b.x - goalie.x) < 38) {
          b.vy = -Math.abs(b.vy); b.y = GOALIE_Y - b.r; G.goalieCd = goalieRecharge(lv('d_goalie')) / overclock();
          sfx.net(); burst(b.x, GOALIE_Y, '#7cf2a8', 10);
        }
        // net
        if (G.net > 0 && b.vy > 0 && b.y + b.r >= NET_Y) {
          b.vy = -Math.abs(b.vy); b.y = NET_Y - b.r; G.net--; sfx.net(); burst(b.x, NET_Y, '#6ee7ff', 14);
        }
        if (b.y - b.r > H) { b.dead = true; break; }
        // bricks
        const nowInside = new Set();
        for (const k of G.bricks) {
          if (!k.alive) continue;
          if (b.x + b.r < k.x || b.x - b.r > k.x + k.w || b.y + b.r < k.y || b.y - b.r > k.y + k.h) continue;
          const cx = clamp(b.x, k.x, k.x + k.w), cy = clamp(b.y, k.y, k.y + k.h);
          const dx = b.x - cx, dy = b.y - cy;
          if (dx * dx + dy * dy > b.r * b.r) continue;
          if (b.inside.has(k)) { nowInside.add(k); continue; }
          const dmg = (1 + lv('dmg')) * (fire ? 2 : 1);
          const passes = k.type !== 'stone' && (fire || b.pierce > 0);
          if (passes) {
            nowInside.add(k);
            if (!fire) b.pierce--;
            hitBrick(k, fire ? Math.max(dmg, k.hp) : dmg, true);
            continue;
          }
          // bounce
          const kx = k.x + k.w / 2, ky = k.y + k.h / 2;
          const ox = k.w / 2 + b.r - Math.abs(b.x - kx), oy = k.h / 2 + b.r - Math.abs(b.y - ky);
          if (ox < oy) { const sg = Math.sign(b.x - kx) || 1; b.vx = sg * Math.abs(b.vx); b.x += sg * ox; }
          else { const sg = Math.sign(b.y - ky) || 1; b.vy = sg * Math.abs(b.vy); b.y += sg * oy; }
          hitBrick(k, dmg, true);
          break;
        }
        b.inside = nowInside;
      }
      b.trail.push(b.x, b.y); if (b.trail.length > 16) b.trail.splice(0, 2);
    }
    const before = G.balls.length;
    G.balls = G.balls.filter((b) => !b.dead);
    if (before && G.balls.length === 0 && G.clearT < 0) loseLife();
  }
  function launchOne(b) {
    const a = launchAngle(b), s = ballSpeed();
    b.stuck = false; b.vx = Math.sin(a) * s; b.vy = -Math.cos(a) * s; b.pierce = lv('pierce');
  }
  function loseLife() {
    run.lives--; sfx.lose(); G.shake = 10; G.combo = 0;
    G.fx = { wide: 0, slow: 0, fire: 0, glue: 0 };
    if (run.lives <= 0) { gameOver(); return; }
    G.texts.push({ x: W / 2, y: H / 2, t: 1.2, s: 'Ball lost!', c: '#ff6b8b', big: true });
    serve();
  }

  // ---------- guns ----------
  function overclock() { return 1 + 0.25 * lv('d_over'); }
  function brickAbove(x, slack = 0) {
    for (const k of G.bricks) if (k.alive && k.type !== 'stone' && x >= k.x - slack && x <= k.x + k.w + slack) return true;
    return false;
  }
  function useAmmo(g) {
    if (run.ammo[g] <= 0) return false;
    if (Math.random() >= lv('recycler') * 0.12) run.ammo[g]--;
    return true;
  }
  function updateGuns(dt) {
    const active = G.balls.some((b) => !b.stuck) && G.clearT < 0;
    const px = paddle.x, py = PADDLE_Y - 4;
    for (const g in GUNS) {
      const l = lv('gun_' + g); if (!l) continue;
      G.gunCd[g] -= dt;
      if (!active || G.gunCd[g] > 0 || run.ammo[g] <= 0) continue;
      const rate = GUNS[g].rate * Math.pow(0.85, l - 1);
      if (g === 'blaster') {
        const xl = px - paddle.w / 2 + 6, xr = px + paddle.w / 2 - 6;
        if (!(brickAbove(xl) || brickAbove(xr))) continue;
        if (!useAmmo(g)) continue;
        G.shots.push({ x: xl, y: py, vx: 0, vy: -720, dmg: 1, k: g }, { x: xr, y: py, vx: 0, vy: -720, dmg: 1, k: g });
        sfx.shot();
      } else if (g === 'laser') {
        if (!brickAbove(px)) continue; if (!useAmmo(g)) continue;
        G.shots.push({ x: px, y: py, vx: 0, vy: -900, dmg: 2, k: g, pierce: 3 + (l - 1), hit: new Set() });
        sfx.zap();
      } else if (g === 'rocket') {
        if (!brickAbove(px, 30)) continue; if (!useAmmo(g)) continue;
        G.shots.push({ x: px, y: py, vx: 0, vy: -380, dmg: 2, k: g, rad: 52 + 10 * (l - 1) });
        sfx.shot();
      } else if (g === 'scatter') {
        if (destructibleLeft() === 0) continue; if (!useAmmo(g)) continue;
        const n = 5 + (l - 1);
        for (let i = 0; i < n; i++) { const a = -0.55 + (1.1 * i) / (n - 1); G.shots.push({ x: px, y: py, vx: Math.sin(a) * 620, vy: -Math.cos(a) * 620, dmg: 1, k: g, life: 0.75 }); }
        sfx.shot();
      } else if (g === 'arc') {
        if (destructibleLeft() === 0) continue; if (!useAmmo(g)) continue;
        arcZap(px, py, 3 + (l - 1));
      }
      G.gunCd[g] = rate;
    }
  }
  function arcZap(x, y, jumps) {
    const pts = [[x, y]]; const used = new Set(); let cx = x, cy = y;
    for (let j = 0; j < jumps; j++) {
      let bestK = null, bd = Infinity;
      for (const k of G.bricks) {
        if (!k.alive || k.type === 'stone' || used.has(k)) continue;
        const d = Math.hypot(k.x + k.w / 2 - cx, k.y + k.h / 2 - cy);
        if (j > 0 && d > 140) continue;
        if (d < bd) { bd = d; bestK = k; }
      }
      if (!bestK) break;
      used.add(bestK); cx = bestK.x + bestK.w / 2; cy = bestK.y + bestK.h / 2; pts.push([cx, cy]);
      hitBrick(bestK, 2, false);
    }
    if (pts.length > 1) { G.bolts.push({ pts, t: 0.18 }); sfx.zap(); }
  }
  function updateShots(dt) {
    for (const s of G.shots) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life != null) { s.life -= dt; if (s.life <= 0) s.dead = true; }
      if (s.y < HUD_H || s.x < 0 || s.x > W) { s.dead = true; if (s.k === 'rocket') explode(s.x, Math.max(s.y, HUD_H), s.rad * 0.6, s.dmg, '#ffb14a'); continue; }
      for (const k of G.bricks) {
        if (!k.alive || s.x < k.x - 2 || s.x > k.x + k.w + 2 || s.y < k.y || s.y > k.y + k.h + 6) continue;
        if (s.k === 'laser') {
          if (s.hit.has(k)) continue;
          s.hit.add(k);
          if (k.type === 'stone') { s.dead = true; k.flash = 0.12; break; }
          hitBrick(k, s.dmg, false); burst(s.x, s.y, '#ff7cf0', 3, 80);
          if (--s.pierce <= 0) { s.dead = true; break; }
          continue;
        }
        if (s.k === 'rocket') { explode(s.x, s.y, s.rad, s.dmg, '#ffb14a'); s.dead = true; break; }
        hitBrick(k, s.dmg, false); burst(s.x, s.y, GUNS[s.k] ? GUNS[s.k].color : '#ffffff', 3, 80); s.dead = true; break;
      }
    }
    G.shots = G.shots.filter((s) => !s.dead);
    for (const b of G.bolts) b.t -= dt;
    G.bolts = G.bolts.filter((b) => b.t > 0);
  }

  // ---------- drones ----------
  function updateDrones(dt) {
    const oc = overclock();
    if (G.goalieCd > 0) G.goalieCd -= dt;
    const active = G.balls.some((b) => !b.stuck) && G.clearT < 0;
    for (const d of G.drones) {
      if (d.type === 'orbit') {
        d.a += dt * 2.2 * oc;
        d.x = paddle.x + Math.cos(d.a) * (paddle.w / 2 + 22); d.y = PADDLE_Y - 34 + Math.sin(d.a) * 16;
        d.cd -= dt;
        if (active && d.cd <= 0 && brickAbove(d.x)) {
          d.cd = 1.3 / oc;
          G.shots.push({ x: d.x, y: d.y - 6, vx: 0, vy: -640, dmg: 1, k: 'orbit' });
        }
      } else if (d.type === 'hunter') {
        d.cd -= dt;
        if (!d.target || !d.target.alive) {
          const opts = G.bricks.filter((k) => k.alive && k.type !== 'stone');
          d.target = opts.length ? pick(opts) : null;
        }
        let tx = W / 2, ty = 450;
        if (d.target && G.started) { tx = d.target.x + d.target.w / 2; ty = d.target.y + d.target.h + 6; }
        const dx = tx - d.x, dy = ty - d.y, dist = Math.hypot(dx, dy) || 1;
        const acc = 700 * oc;
        d.vx += (dx / dist) * acc * dt; d.vy += (dy / dist) * acc * dt;
        const vm = 230 * oc, v = Math.hypot(d.vx, d.vy);
        if (v > vm) { d.vx *= vm / v; d.vy *= vm / v; }
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.target && G.started && dist < 18 && d.cd <= 0) {
          hitBrick(d.target, 1, false); d.cd = 0.55 / oc; d.vx *= -0.6; d.vy = Math.abs(d.vy) + 120;
          if (!d.target.alive || Math.random() < 0.3) d.target = null;
        }
      } else if (d.type === 'collect') {
        if (!d.target || d.target.dead) {
          let bd = Infinity; d.target = null;
          for (const c of G.coins.concat(G.pus)) {
            if (c.claimed && c.claimed !== d) continue;
            const dd = Math.hypot(c.x - d.x, c.y - d.y); if (dd < bd) { bd = dd; d.target = c; }
          }
          if (d.target) d.target.claimed = d;
        }
        const idx = G.drones.indexOf(d) % 2 ? 46 : -46;
        const tx = d.target ? d.target.x : paddle.x + idx, ty = d.target ? d.target.y : PADDLE_Y - 70;
        const dx = tx - d.x, dy = ty - d.y, dist = Math.hypot(dx, dy) || 1;
        const sp = Math.min(dist / dt, 320 * oc);
        d.x += (dx / dist) * sp * dt; d.y += (dy / dist) * sp * dt;
        if (d.target && dist < 16) {
          d.target.dead = true;
          if (d.target.k) collectPU(d.target); else collectCoin(d.target);
          d.target = null;
        }
      } else if (d.type === 'goalie') {
        let tx = paddle.x, lowest = -1;
        for (const b of G.balls) if (!b.stuck && b.vy > 0 && b.y > lowest) { lowest = b.y; tx = b.x; }
        d.x += clamp(tx - d.x, -420 * oc * dt, 420 * oc * dt);
        d.x = clamp(d.x, 36, W - 36);
      }
    }
  }

  // ---------- coins / capsules ----------
  function updateDrops(dt) {
    const ml = lv('magnet');
    const mRad = ml ? 100 + 45 * ml : 0, mPow = 500 + 220 * ml;
    const pcx = paddle.x, pcy = PADDLE_Y;
    for (const c of G.coins) {
      if (c.dead) continue;
      c.vy += 420 * dt; c.vy = Math.min(c.vy, 330); c.vx *= 1 - dt * 1.5;
      if (ml) {
        const dx = pcx - c.x, dy = pcy - c.y, d = Math.hypot(dx, dy);
        if (d < mRad && d > 1) { c.vx += (dx / d) * mPow * dt * 2; c.vy += (dy / d) * mPow * dt; }
      }
      c.x += c.vx * dt; c.y += c.vy * dt; c.spin += dt * 8;
      if (c.x < 6) { c.x = 6; c.vx = Math.abs(c.vx); } if (c.x > W - 6) { c.x = W - 6; c.vx = -Math.abs(c.vx); }
      if (onPaddle(c.x, c.y, 8)) { c.dead = true; collectCoin(c); }
      else if (c.y > H + 10) c.dead = true;
    }
    for (const p of G.pus) {
      if (p.dead) continue;
      p.vy = Math.min(p.vy + 60 * dt, 200);
      if (ml >= 3) {
        const dx = pcx - p.x, dy = pcy - p.y, d = Math.hypot(dx, dy);
        if (d < mRad * 0.8 && d > 1) { p.x += (dx / d) * 160 * dt; }
      }
      p.y += p.vy * dt;
      if (onPaddle(p.x, p.y, 10)) { p.dead = true; collectPU(p); }
      else if (p.y > H + 14) p.dead = true;
    }
    G.coins = G.coins.filter((c) => !c.dead);
    G.pus = G.pus.filter((p) => !p.dead);
  }
  function onPaddle(x, y, r) {
    return y + r >= PADDLE_Y - 2 && y - r <= PADDLE_Y + PADDLE_H + 6 && Math.abs(x - paddle.x) <= paddle.w / 2 + r;
  }
  function updateParticles(dt) {
    for (const p of G.parts) { p.t -= dt; if (!p.ring) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; } }
    G.parts = G.parts.filter((p) => p.t > 0);
    for (const t of G.texts) { t.t -= dt; t.y -= 30 * dt; }
    G.texts = G.texts.filter((t) => t.t > 0);
  }

  // ---------- level end ----------
  function finishLevel() {
    for (const c of G.coins) collectCoin(c);
    G.coins = [];
    const bonus = Math.round((15 + run.level * 4) * (1 + 0.25 * lv('bounty')));
    run.coins += bonus;
    const pl = lv('piggy');
    const interest = pl ? Math.min(Math.floor(run.coins * 0.05 * pl), 30 * pl) : 0;
    run.coins += interest;
    lastSummary = { level: run.level, picked: G.levelCoins, bonus, interest, combo: G.comboBest };
    run.score += 100 * run.level;
    run.level++;
    recordBest();
    saveRun();
    openShop();
  }
  function gameOver() {
    mode = 'over'; recordBest(); pauseBtn.style.display = 'none';
    const keep = Math.floor(run.coins / 2);
    showOverlay(`<div class="center">
      <h2>Out of balls</h2>
      <div class="stat">Reached level <b>${run.level}</b></div>
      <div class="stat">Score <b>${run.score}</b></div>
      <div class="stat">Best: level <b>${best.level}</b> · score <b>${best.score}</b></div>
      <div style="height:1.2em"></div>
      <button class="big gold" data-act="continue">Try again (keep upgrades, ${keep} 🪙)</button>
      <button class="big alt" data-act="newrun">New run</button>
      <button class="big alt" data-act="menu">Menu</button>
      <div class="hint">Trying again keeps everything you bought but costs half your coins.</div>
    </div>`);
  }

  // ---------- overlays ----------
  function showOverlay(html) { ov.innerHTML = html; ov.classList.add('show'); }
  function hideOverlay() { ov.classList.remove('show'); ov.innerHTML = ''; }

  function showMenu() {
    mode = 'menu'; pauseBtn.style.display = 'none';
    const saved = loadRun();
    showOverlay(`<div class="center">
      <div class="logo">BRICK<br>BAZAAR</div>
      <div class="tag">Smash bricks. Grab coins. Shop for silly hardware.</div>
      ${saved ? `<button class="big gold" data-act="resume">Continue · level ${saved.level} · ${saved.coins} 🪙</button>` : ''}
      <button class="big" data-act="newrun">${saved ? 'New run' : 'Play'}</button>
      <button class="big alt" data-act="mute">Sound: ${muted ? 'off' : 'on'}</button>
      ${best.level ? `<div class="stat" style="margin-top:1em">Best: level <b>${best.level}</b> · score <b>${best.score}</b></div>` : ''}
      <div class="hint">Drag or move the mouse to steer · tap or click to launch<br>Right click or Esc pauses. Guns and drones fire on their own. One hand is enough.</div>
    </div>`);
  }
  function showPause() {
    mode = 'pause';
    showOverlay(`<div class="center">
      <h2>Paused</h2>
      <div class="stat">Level <b>${run.level}</b> · <b>${run.coins}</b> 🪙 · ${'❤️'.repeat(run.lives)}</div>
      <div style="height:1em"></div>
      <button class="big" data-act="unpause">Resume</button>
      <button class="big alt" data-act="mute">Sound: ${muted ? 'off' : 'on'}</button>
      <button class="big alt" data-act="quit">Quit to menu</button>
      <div class="hint">Quitting keeps your run from the last shop visit.</div>
    </div>`);
  }

  let shopCat = 'weap';
  function openShop() {
    mode = 'shop'; pauseBtn.style.display = 'none';
    renderShop(false);
  }
  function renderShop(keepScroll, flashId) {
    const prev = ov.querySelector('.items');
    const st = keepScroll && prev ? prev.scrollTop : 0;
    const cards = ITEMS.filter((it) => it.cat === shopCat).map((it) => {
      const state = itemState(it);
      const l = it.consumable || it.ammo || it.allAmmo ? 0 : lv(it.id);
      const pips = it.max && it.max > 1 ? `<div class="pips">${Array.from({ length: it.max }, (_, i) => `<span class="pip ${i < l ? 'on' : ''}"></span>`).join('')}</div>` : '';
      let desc;
      if (it.ammo) desc = `+${Math.round(GUNS[it.ammo].pack * ammoMult())} shots. You have ${run.ammo[it.ammo]}.`;
      else desc = it.desc(l);
      let btn;
      if (state === 'locked') btn = `<button class="buy no" disabled>🔒 ${it.reqText || 'Locked'}</button>`;
      else if (state === 'max') btn = `<button class="buy max" disabled>${it.id === 'life' ? 'Full' : 'Maxed'}</button>`;
      else {
        const verb = it.gunItem ? (l ? 'Faster' : 'Buy') : it.ammo || it.allAmmo ? 'Buy' : it.consumable ? 'Buy' : l ? 'Upgrade' : 'Buy';
        btn = `<button class="buy ${state === 'ok' ? '' : 'no'}" data-buy="${it.id}">${verb} · ${itemCost(it)} 🪙</button>`;
      }
      return `<div class="card ${state === 'locked' ? 'locked' : ''} ${flashId === it.id ? 'flash' : ''}">
        <div class="top"><span class="ic">${it.icon}</span><span class="nm">${it.name}</span></div>
        ${pips}<div class="ds">${desc}</div>${btn}</div>`;
    }).join('');
    const s = lastSummary;
    const summary = s ? `<div class="summary"><span>Level ${s.level} cleared!</span><span>Picked up <b>${s.picked}</b></span><span>Clear bonus <b>${s.bonus}</b></span>${s.interest ? `<span>Interest <b>${s.interest}</b></span>` : ''}<span>Best streak <b>${s.combo}</b></span></div>` : '';
    showOverlay(`<div class="shop">
      <div class="shop-head"><div><div class="t">The Bazaar</div><div class="sub">${'❤️'.repeat(run.lives)} · next up: level ${run.level}</div></div><div class="coins">${run.coins} 🪙</div></div>
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
    else if (act === 'resume') { run = loadRun(); lastSummary = null; if (run.level === 1 && run.coins === 0) startLevel(); else openShop(); }
    else if (act === 'next') { lastSummary = null; startLevel(); }
    else if (act === 'unpause') { mode = 'play'; hideOverlay(); }
    else if (act === 'quit') { showMenu(); }
    else if (act === 'menu') { showMenu(); }
    else if (act === 'continue') { run.coins = Math.floor(run.coins / 2); run.lives = 3; saveRun(); startLevel(); }
    else if (act === 'mute') { muted = !muted; store.set(MUTE_KEY, muted); t.textContent = 'Sound: ' + (muted ? 'off' : 'on'); }
  });

  // ---------- drawing ----------
  const stars = Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.5 + 0.3, v: Math.random() * 8 + 2 }));
  function drawBg(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#11143a'); g.addColorStop(1, '#070816');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    for (const s of stars) { const y = (s.y + t * s.v) % H; ctx.globalAlpha = 0.25 + s.s * 0.2; ctx.fillRect(s.x, y, s.s, s.s); }
    ctx.globalAlpha = 1;
  }
  function drawBrick(b) {
    const col = brickColor(b);
    ctx.fillStyle = b.flash > 0 ? '#ffffff' : col;
    rr(b.x, b.y, b.w, b.h, 4); ctx.fill();
    // shading
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(b.x + 3, b.y + 2, b.w - 6, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(b.x + 2, b.y + b.h - 5, b.w - 4, 3);
    if (b.type === 'normal' && b.maxhp > 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.hp, b.x + b.w / 2, b.y + b.h / 2 + 1);
    } else if (b.type === 'steel') {
      ctx.fillStyle = '#5d6b80';
      for (const [dx, dy] of [[5, 5], [b.w - 5, 5], [5, b.h - 5], [b.w - 5, b.h - 5]]) { ctx.beginPath(); ctx.arc(b.x + dx, b.y + dy, 1.6, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#26303f'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.hp, b.x + b.w / 2, b.y + b.h / 2 + 1);
    } else if (b.type === 'gold') {
      ctx.fillStyle = '#7a5300'; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('$', b.x + b.w / 2, b.y + b.h / 2 + 1);
    } else if (b.type === 'bomb') {
      ctx.fillStyle = '#2b0b10'; ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(b.x + b.w / 2 + 3, b.y + 3, 3, 3);
    } else if (b.type === 'stone') {
      ctx.strokeStyle = '#2c3045'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(b.x + 8, b.y + 4); ctx.lineTo(b.x + 16, b.y + 12); ctx.lineTo(b.x + 12, b.y + 17);
      ctx.moveTo(b.x + 30, b.y + 3); ctx.lineTo(b.x + 34, b.y + 10); ctx.stroke();
    }
    if (b.type !== 'stone' && b.maxhp > 1 && b.hp < b.maxhp) {
      ctx.globalAlpha = 0.5 * (1 - b.hp / b.maxhp); ctx.fillStyle = '#000'; rr(b.x, b.y, b.w, b.h, 4); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  function drawPaddle() {
    const x = paddle.x - paddle.w / 2, y = PADDLE_Y;
    const glue = G.fx.glue > 0, fire = G.fx.fire > 0;
    ctx.globalAlpha = 0.25; ctx.fillStyle = glue ? '#ffe066' : '#5ef0ff';
    rr(x - 4, y - 4, paddle.w + 8, PADDLE_H + 8, 10); ctx.fill(); ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, y, 0, y + PADDLE_H);
    g.addColorStop(0, glue ? '#fff3a8' : '#bff8ff'); g.addColorStop(1, glue ? '#e0a800' : '#2f8cff');
    ctx.fillStyle = g; rr(x, y, paddle.w, PADDLE_H, 7); ctx.fill();
    // gun mounts
    if (lv('gun_blaster')) { ctx.fillStyle = '#7cf2ff'; ctx.fillRect(x + 3, y - 5, 6, 6); ctx.fillRect(x + paddle.w - 9, y - 5, 6, 6); }
    const center = ['laser', 'rocket', 'scatter', 'arc'].filter((g2) => lv('gun_' + g2));
    center.forEach((g2, i) => { ctx.fillStyle = GUNS[g2].color; ctx.fillRect(paddle.x - center.length * 4 + i * 8 + 1, y - 6, 6, 7); });
    if (fire) { ctx.fillStyle = '#ff8a3d'; ctx.fillRect(x + 10, y + PADDLE_H - 3, paddle.w - 20, 2); }
    // magnet aura
    const ml = lv('magnet');
    if (ml) {
      ctx.strokeStyle = 'rgba(255,216,74,0.12)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(paddle.x, PADDLE_Y, 100 + 45 * ml, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    }
  }
  function drawBall(b) {
    const fire = G.fx.fire > 0;
    for (let i = 0; i < b.trail.length; i += 2) {
      ctx.globalAlpha = (i / b.trail.length) * 0.35; ctx.fillStyle = fire ? '#ff8a3d' : b.pierce > 0 ? '#ffb36b' : '#a8f4ff';
      ctx.beginPath(); ctx.arc(b.trail[i], b.trail[i + 1], b.r * (0.4 + i / b.trail.length * 0.5), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 0.3; ctx.fillStyle = fire ? '#ff6a00' : '#bff8ff';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 5, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = fire ? '#ffd2a0' : '#ffffff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
    if (b.pierce > 0 && !fire) { ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 1, 0, 7); ctx.stroke(); }
  }
  function drawAim() {
    if (!lv('aim')) return;
    for (const b of G.balls) {
      if (!b.stuck) continue;
      const a = launchAngle(b);
      let x = b.x, y = b.y, vx = Math.sin(a), vy = -Math.cos(a);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < 46; i++) {
        x += vx * 9; y += vy * 9;
        if (x < 7) { x = 7; vx = -vx; } if (x > W - 7) { x = W - 7; vx = -vx; }
        if (y < HUD_H + 7) break;
        if (G.bricks.some((k) => k.alive && x > k.x && x < k.x + k.w && y > k.y && y < k.y + k.h)) break;
        if (i % 2 === 0) { ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill(); }
      }
    }
  }
  function drawCoin(c) {
    const sx = Math.abs(Math.cos(c.spin));
    ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.ellipse(c.x, c.y, 7 * sx + 1, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.ellipse(c.x, c.y, 5.5 * sx + 0.5, 5.5, 0, 0, 7); ctx.fill();
    if (c.val > 1 && sx > 0.5) { ctx.fillStyle = '#8a5a00'; ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c.val, c.x, c.y + 0.5); }
  }
  function drawPU(p) {
    const d = PU[p.k];
    ctx.fillStyle = d.c; rr(p.x - 15, p.y - 9, 30, 18, 9); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(p.x - 10, p.y - 6, 20, 3);
    ctx.fillStyle = '#10142c'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(d.l, p.x, p.y + 1);
  }
  function drawDrones(t) {
    for (const d of G.drones) {
      if (d.type === 'orbit') {
        ctx.fillStyle = '#9ab8ff'; ctx.beginPath(); ctx.arc(d.x, d.y, 6, 0, 7); ctx.fill();
        ctx.fillStyle = '#e8f0ff'; ctx.fillRect(d.x - 10, d.y - 1.5, 20, 3);
      } else if (d.type === 'hunter') {
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.ellipse(d.x, d.y, 8, 6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#2b2200'; ctx.fillRect(d.x - 3, d.y - 6, 2, 12); ctx.fillRect(d.x + 2, d.y - 6, 2, 12);
        ctx.globalAlpha = 0.6; ctx.fillStyle = '#e8f6ff';
        const f = Math.sin(t * 50) * 2;
        ctx.beginPath(); ctx.ellipse(d.x - 4, d.y - 8 - f, 5, 3, -0.4, 0, 7); ctx.ellipse(d.x + 4, d.y - 8 - f, 5, 3, 0.4, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      } else if (d.type === 'collect') {
        ctx.fillStyle = '#7cf2a8'; rr(d.x - 8, d.y - 7, 16, 14, 4); ctx.fill();
        ctx.fillStyle = '#0d2a1c'; ctx.fillRect(d.x - 5, d.y - 3, 3, 3); ctx.fillRect(d.x + 2, d.y - 3, 3, 3);
        ctx.strokeStyle = '#7cf2a8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(d.x, d.y - 7); ctx.lineTo(d.x, d.y - 12); ctx.stroke();
      } else if (d.type === 'goalie') {
        const ready = G.goalieCd <= 0;
        ctx.globalAlpha = ready ? 1 : 0.35;
        ctx.fillStyle = '#7cf2a8'; rr(d.x - 32, GOALIE_Y, 64, 6, 3); ctx.fill();
        ctx.globalAlpha = 1;
        if (!ready) {
          const tot = goalieRecharge(lv('d_goalie')) / overclock();
          ctx.fillStyle = '#7cf2a8'; ctx.fillRect(d.x - 32, GOALIE_Y + 8, 64 * (1 - G.goalieCd / tot), 2);
        }
      }
    }
  }
  function drawShots() {
    for (const s of G.shots) {
      if (s.k === 'laser') { ctx.fillStyle = '#ff7cf0'; ctx.fillRect(s.x - 2, s.y - 14, 4, 22); ctx.fillStyle = '#fff'; ctx.fillRect(s.x - 0.75, s.y - 12, 1.5, 18); }
      else if (s.k === 'rocket') {
        ctx.fillStyle = '#ffb14a'; rr(s.x - 3.5, s.y - 10, 7, 16, 3); ctx.fill();
        ctx.fillStyle = '#ff5a2a'; ctx.beginPath(); ctx.moveTo(s.x - 3, s.y + 6); ctx.lineTo(s.x, s.y + 12 + Math.random() * 6); ctx.lineTo(s.x + 3, s.y + 6); ctx.fill();
      } else if (s.k === 'scatter') { ctx.fillStyle = '#b9ff6b'; ctx.beginPath(); ctx.arc(s.x, s.y, 2.5, 0, 7); ctx.fill(); }
      else { ctx.fillStyle = s.k === 'orbit' ? '#9ab8ff' : '#7cf2ff'; ctx.fillRect(s.x - 1.5, s.y - 7, 3, 10); }
    }
    for (const b of G.bolts) {
      ctx.strokeStyle = '#cfe0ff'; ctx.lineWidth = 2; ctx.globalAlpha = b.t / 0.18; ctx.beginPath();
      for (let i = 0; i < b.pts.length - 1; i++) {
        const [x1, y1] = b.pts[i], [x2, y2] = b.pts[i + 1];
        ctx.moveTo(x1, y1);
        for (let j = 1; j < 5; j++) { const f = j / 5; ctx.lineTo(x1 + (x2 - x1) * f + rand(-6, 6), y1 + (y2 - y1) * f + rand(-6, 6)); }
        ctx.lineTo(x2, y2);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  function drawHUD() {
    ctx.fillStyle = 'rgba(5,6,16,0.75)'; ctx.fillRect(0, 0, W, HUD_H);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, HUD_H - 1, W, 1);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = '#9aa3d6'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillText('LEVEL', 12, 16);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px system-ui, sans-serif'; ctx.fillText(run.level, 12, 38);
    ctx.fillStyle = '#ffd84a'; ctx.font = 'bold 20px system-ui, sans-serif'; ctx.fillText('🪙 ' + run.coins, 62, 22);
    ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = '#ff6b8b';
    ctx.fillText('♥'.repeat(Math.max(0, run.lives)), 64, 44);
    // ammo
    let ax = 175;
    ctx.font = 'bold 12px system-ui, sans-serif';
    for (const g in GUNS) {
      if (!lv('gun_' + g)) continue;
      ctx.fillStyle = run.ammo[g] > 0 ? GUNS[g].color : '#5a6080';
      ctx.fillText(GUNS[g].icon + run.ammo[g], ax, 20); ax += 52;
      if (ax > 400) break;
    }
    // power-up timers + net
    let tx = 175;
    const fxs = [['wide', 'W'], ['slow', 'S'], ['fire', 'F'], ['glue', 'G']];
    for (const [k, l] of fxs) {
      if (G.fx[k] <= 0) continue;
      ctx.fillStyle = PU[k].c; ctx.fillText(l, tx, 43);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(tx + 12, 40, 26, 5);
      ctx.fillStyle = PU[k].c; ctx.fillRect(tx + 12, 40, 26 * Math.min(1, G.fx[k] / 15), 5);
      tx += 46;
    }
    if (G.net > 0) { ctx.fillStyle = '#6ee7ff'; ctx.fillText('NET×' + G.net, tx, 43); }
    if (G.combo >= 5) { ctx.textAlign = 'right'; ctx.fillStyle = '#ffe680'; ctx.fillText(G.combo + ' streak', W - 54, 43); }
  }

  let tAcc = 0;
  function draw(t) {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    drawBg(t);
    if (!G) return;
    ctx.save();
    if (G.shake > 0 && mode === 'play') ctx.translate(rand(-G.shake, G.shake) * 0.4, rand(-G.shake, G.shake) * 0.4);
    for (const b of G.bricks) if (b.alive) drawBrick(b);
    // net
    if (G.net > 0) {
      ctx.strokeStyle = '#6ee7ff'; ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 4); ctx.lineWidth = 2;
      ctx.beginPath(); for (let x = 0; x <= W; x += 12) ctx.lineTo(x, NET_Y + Math.sin(x * 0.2 + t * 3) * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    drawAim();
    for (const p of G.pus) drawPU(p);
    for (const c of G.coins) drawCoin(c);
    drawShots();
    drawDrones(t);
    drawPaddle();
    for (const b of G.balls) drawBall(b);
    for (const p of G.parts) {
      if (p.ring) { ctx.strokeStyle = p.c; ctx.globalAlpha = p.t / p.T; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, p.ring * (1 - p.t / p.T * 0.6), 0, 7); ctx.stroke(); }
      else { ctx.globalAlpha = Math.min(1, p.t * 2.5); ctx.fillStyle = p.c; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const tx of G.texts) {
      ctx.globalAlpha = Math.min(1, tx.t * 2); ctx.fillStyle = tx.c; ctx.font = (tx.big ? 'bold 28px' : 'bold 13px') + ' system-ui, sans-serif';
      ctx.fillText(tx.s, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    drawHUD();
    if (mode === 'play' && G.banner > 0) {
      ctx.globalAlpha = Math.min(1, G.banner); ctx.fillStyle = '#ffffff'; ctx.font = 'bold 40px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('LEVEL ' + run.level, W / 2, H * 0.55);
      if (run.level % 5 === 0) { ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 18px system-ui, sans-serif'; ctx.fillText('★ vault level: extra gold bricks ★', W / 2, H * 0.55 + 34); }
      ctx.globalAlpha = 1;
    }
    if (mode === 'play' && G.balls.some((b) => b.stuck && b.serve)) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.55 + 0.35 * Math.sin(t * 5)) + ')'; ctx.font = 'bold 16px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('tap to launch', W / 2, PADDLE_Y + 50);
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
    tAcc += dt;
    update(dt);
    draw(tAcc);
    requestAnimationFrame(frame);
  }

  // debug hook for automated testing (harmless in normal play)
  window.__bb = {
    get mode() { return mode; }, get run() { return run; }, get G() { return G; },
    clear() { if (G) for (const b of G.bricks) if (b.type !== 'stone') b.alive = false; },
    give(n) { if (run) { run.coins += n; } },
    step(dt) { update(dt); },
  };

  showMenu();
  requestAnimationFrame(frame);
})();
