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
    { id: 'rounds', cat: 'weap', icon: '🎯', name: 'Hardened Rounds', max: 4, base: 110, grow: 1.8,
      desc: (l) => `All guns and drone shots deal +${l + 1} damage.`, req: () => ownsAnyGun() || lv('d_orbit') > 0, reqText: 'Needs a gun' },
    { id: 'belt', cat: 'weap', icon: '🎒', name: 'Ammo Belt', max: 4, base: 60, grow: 1.7,
      desc: (l) => `Ammo packs and crates give +${(l + 1) * 25}% more.`, req: () => ownsAnyGun(), reqText: 'Needs a gun' },

    { id: 'ammo_blaster', cat: 'ammo', ammo: 'blaster' },
    { id: 'ammo_laser', cat: 'ammo', ammo: 'laser' },
    { id: 'ammo_rocket', cat: 'ammo', ammo: 'rocket' },
    { id: 'ammo_scatter', cat: 'ammo', ammo: 'scatter' },
    { id: 'ammo_arc', cat: 'ammo', ammo: 'arc' },
    { id: 'factory', cat: 'ammo', icon: '🏭', name: 'Ammo Factory', max: 4, base: 90, grow: 1.7,
      desc: (l) => `Every level starts with free ammo: ${(l + 1) * 15}% of a pack per gun.`, req: () => ownsAnyGun(), reqText: 'Needs a gun' },
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

    { id: 'width', cat: 'gear', icon: '↔️', name: 'Long Paddle', max: 6, base: 40, grow: 1.5,
      desc: () => 'Paddle +12% wider.' },
    { id: 'magnet', cat: 'gear', icon: '🧲', name: 'Coin Magnet', max: 5, base: 45, grow: 1.6,
      desc: (l) => (l ? 'Bigger, stronger pull.' : 'Pulls falling coins toward the paddle.') + (l >= 2 ? ' Now pulls capsules too.' : ' Level 3 also pulls capsules.') },
    { id: 'net', cat: 'gear', icon: '🥅', name: 'Safety Net', max: 4, base: 70, grow: 1.8,
      desc: (l) => `A barrier that bounces back ${l + 1} missed ball${l ? 's' : ''} each level.` },
    { id: 'aim', cat: 'gear', icon: '🎯', name: 'Aim Sight', max: 1, base: 25, grow: 1,
      desc: () => 'Shows the launch path before you tap.' },
    { id: 'shield', cat: 'gear', icon: '🛡️', name: 'Deflector', max: 3, base: 70, grow: 1.7,
      desc: (l) => `Blocks ${l + 1} enemy slime shot${l ? 's' : ''} each level, so your paddle never gets stunned.` },
    { id: 'second', cat: 'gear', icon: '🌬️', name: 'Second Wind', max: 2, base: 150, grow: 2,
      desc: (l) => `Losing your last ball costs no life, ${l + 1} time${l ? 's' : ''} per level.` },
    { id: 'starter', cat: 'gear', icon: '🚦', name: 'Head Start', max: 2, base: 80, grow: 1.9,
      desc: (l) => `Start every level with ${l + 1} random power-up${l ? 's' : ''} active.` },
    { id: 'demo', cat: 'gear', icon: '🧨', name: 'Demolition', max: 3, base: 65, grow: 1.7,
      desc: (l) => `Bomb bricks blast a wider area and deal ${l + 3} damage.` },
    { id: 'puluck', cat: 'gear', icon: '🎁', name: 'Lucky Capsules', max: 4, base: 50, grow: 1.6,
      desc: () => 'More power-up capsules, and they last 15% longer.' },
    { id: 'life', cat: 'gear', icon: '❤️', name: 'Extra Life', consumable: true, base: 60, grow: 1.45,
      desc: () => `+1 life (max 6). You have ${run ? run.lives : 0}.` },

    { id: 'dmg', cat: 'ball', icon: '🔩', name: 'Heavy Core', max: 6, base: 90, grow: 1.9,
      desc: (l) => `Ball deals ${l + 2} damage per hit.` },
    { id: 'crit', cat: 'ball', icon: '✨', name: 'Crit Spark', max: 6, base: 60, grow: 1.5,
      desc: (l) => `${(l + 1) * 8}% chance for a triple-damage hit.` },
    { id: 'pierce', cat: 'ball', icon: '🔥', name: 'Ember Core', max: 4, base: 110, grow: 1.9,
      desc: (l) => `After each paddle bounce the ball smashes through ${l + 1} brick${l ? 's' : ''} without bouncing.` },
    { id: 'twin', cat: 'ball', icon: '⚪', name: 'Twin Serve', max: 3, base: 100, grow: 2.2,
      desc: (l) => `Every serve launches ${l + 2} balls.` },
    { id: 'bigball', cat: 'ball', icon: '🟠', name: 'Big Ball', max: 3, base: 85, grow: 1.8,
      desc: () => 'A bigger ball that is easier to hit and clips more bricks.' },
    { id: 'splash', cat: 'ball', icon: '💥', name: 'Shatter Core', max: 4, base: 95, grow: 1.7,
      desc: (l) => `${(l + 1) * 15}% chance a ball hit also chips every brick around it.` },
    { id: 'chill', cat: 'ball', icon: '❄️', name: 'Chill Field', max: 3, base: 60, grow: 1.7,
      desc: () => 'Ball moves 7% slower. Easier to follow.' },

    { id: 'luck', cat: 'eco', icon: '🍀', name: 'Lucky Bricks', max: 6, base: 40, grow: 1.55,
      desc: (l) => `Coin drop chance ${Math.round(coinChance(l) * 100)}% → ${Math.round(coinChance(l + 1) * 100)}%.` },
    { id: 'value', cat: 'eco', icon: '🪙', name: 'Gold Plating', max: 5, base: 70, grow: 1.8,
      desc: (l) => `Each coin is worth ${l + 2}.` },
    { id: 'piggy', cat: 'eco', icon: '🐷', name: 'Piggy Bank', max: 4, base: 80, grow: 1.7,
      desc: (l) => `Earn ${(l + 1) * 5}% interest on savings after each level (max ${(l + 1) * 30}).` },
    { id: 'streak', cat: 'eco', icon: '🔗', name: 'Streak Bonus', max: 3, base: 60, grow: 1.7,
      desc: (l) => `Streak payouts are ${(l + 1) * 50}% bigger. Every 5 bricks without touching the paddle pays out, more the longer it runs.` },
    { id: 'foebounty', cat: 'eco', icon: '🎯', name: 'Monster Bounty', max: 3, base: 70, grow: 1.7,
      desc: (l) => `Enemies drop +${l + 1} coin${l ? 's' : ''}, bosses drop ${(l + 1) * 25}% more.` },
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

  // ---------- levels ----------
  // Hand-made campaign. Map legend: 1-9 brick hit points, S steel, B bomb, G gold, X stone (unbreakable),
  // H hive (spawns blobs), . empty. foes = enemies that join the level; boss = boss kind (1-3).
  const LEVELS = [
    { name: 'Warm-up', map: ['..........', '..........', '..........', '..........', '...1111...', '..11GG11..', '...1111...'] },
    { name: 'Archway', map: ['..........', '..........', '...1111...', '..122221..', '.11.22.11.', '.11....11.', '.11....11.'] },
    { name: 'Fuse Box', map: ['2222222222', '1111111111', '..........', '11B1111B11', '1111111111'], tip: 'Bomb bricks blast their neighbours' },
    { name: 'Gem', map: ['....11....', '...1221...', '..123321..', '.12333321.', '..123321..', '...1221...', '....11....'] },
    { name: 'Piggy Bank', map: ['.11111111.', '1G2G22G2G1', '1222222221', '1G2G22G2G1', '.11111111.', '..1....1..'], tip: 'Gold bricks burst into coins' },
    { name: 'Open Field', map: ['3333333333', '2.2.2.2.2.', '.1.1.1.1.1', '2.2.2.2.2.', '.1.1.1.1.1'], foes: { drifter: 2 }, tip: 'Blobs drift around and knock your ball off course' },
    { name: 'Fortress', map: ['S11111111S', 'S12222221S', 'S12BGGB21S', 'S12222221S', 'S11111111S'], tip: 'Steel bricks take a beating' },
    { name: 'Stone Garden', map: ['2222222222', 'X.X.XX.X.X', '3333333333', '.2.2..2.2.', '1111111111'], foes: { drifter: 2 }, tip: 'Grey stone never breaks. Aim through the gaps' },
    { name: 'Twin Towers', map: ['33......33', '33..GG..33', '22.2222.22', '22.2..2.22', '11.1..1.11', '11.1111.11'], foes: { shooter: 1, drifter: 1 }, tip: 'Spitters shoot slime that shrinks and slows your paddle' },
    { name: 'Crate King', map: ['..........', '..........', '..........', '..........', '1111111111', '.2.2..2.2.'], boss: 1, tip: 'BOSS! Knock out the Crate King' },
    { name: 'Zigzag', map: ['33........', '2233......', '112233....', '..112233..', '....112233', '......1122', '........11'], foes: { drifter: 2, shooter: 1 } },
    { name: 'Greenhouse', map: ['4444444444', '3.3.33.3.3', '3.3.33.3.3', '2222222222', '1G111111G1'], foes: { mender: 1, drifter: 1 }, tip: 'Menders patch damaged bricks. Take them out first' },
    { name: 'Bomb Alley', map: ['3B3B3B3B3B', '4444444444', 'B3B3B3B3B3', '4444444444', '3333333333'], foes: { shooter: 1 } },
    { name: 'The Nest', map: ['3333333333', '3S......S3', '3S..HH..S3', '3S......S3', '3SSS..SSS3', '2222222222'], tip: 'Hives keep spawning blobs until you break them' },
    { name: 'Treasury', map: ['SGSGSGSGSG', '4444444444', '4G4G44G4G4', '3333333333', '2222222222', '1111111111'], foes: { thief: 1, shooter: 1 }, tip: 'Thieves steal falling coins. Pop them to get double back' },
    { name: 'Checker Storm', map: ['5.5.5.5.5.', '.4.4.4.4.4', '3.3.3.3.3.', '.2.2.2.2.2', '4.4.4.4.4.', '.3.3.3.3.3', '2.2.2.2.2.'], foes: { drifter: 2, shooter: 1, mender: 1 } },
    { name: 'Steel Bars', map: ['5555555555', 'SSS.SS.SSS', '4444444444', 'S.SSSSSS.S', '3333333333', '2222222222'], foes: { shooter: 2, thief: 1 } },
    { name: 'Hive Cluster', map: ['44H4444H44', '3333333333', 'X3X3XX3X3X', '2222222222', '1111111111'], foes: { mender: 1 } },
    { name: 'Golden Pyramid', map: ['....GG....', '...5555...', '..444444..', '.33333333.', '2222222222', '1111111111', 'S1S1S1S1S1'], foes: { shooter: 2, thief: 1, drifter: 1 } },
    { name: 'Twin Cannon', map: ['..........', '..........', '..........', '..........', '3333333333', 'S2S2SS2S2S'], boss: 2, tip: 'BOSS! The Twin Cannon calls in blobs' },
    { name: 'Rings', map: ['5555555555', '5444444445', '543333B345', '543.HH.345', '543333B345', '5444444445', '5555555555'], foes: { mender: 1, shooter: 1 } },
    { name: 'Stairway', map: ['66......66', '555....555', '4444..4444', '333.GG.333', '22......22', '11.SSSS.11'], foes: { drifter: 3, thief: 1, shooter: 1 } },
    { name: 'Bomb Factory', map: ['SBSBSBSBSB', '5555555555', '4B44B44B44', '4444444444', '3B33B33B33', '3333333333'], foes: { shooter: 2, mender: 1 } },
    { name: 'Hive Wall', map: ['6666666666', 'H55555555H', '5555555555', '4444444444', '3.3.3.3.3.'], foes: { thief: 2, mender: 1 } },
    { name: 'Gold Rush', map: ['GGGGGGGGGG', '6666666666', '5S5S55S5S5', '5555555555', '4444G44444', '3333333333'], foes: { thief: 3, shooter: 1 } },
    { name: 'Fortress II', map: ['SSSSSSSSSS', 'S66666666S', 'S6G5HH5G6S', 'S65555556S', 'S66666666S', 'SSS....SSS', '4444444444'], foes: { shooter: 2, drifter: 2, mender: 1 } },
    { name: 'Labyrinth', map: ['5555555555', 'X..XXXX..X', '4444444444', 'XXX....XXX', '3333333333', 'X..XXXX..X', '2222222222'], foes: { drifter: 2, shooter: 2 } },
    { name: 'Everything', map: ['7777777777', '6B666666B6', '5555HH5555', '4S4G44G4S4', '3333333333', '2222222222', '1111111111'], foes: { shooter: 2, mender: 1, thief: 1, drifter: 2 } },
    { name: 'Last Stand', map: ['8888888888', '7777777777', 'SSSS66SSSS', '6666666666', '55B5555B55', '4444444444', '3333333333'], foes: { shooter: 3, mender: 2, thief: 1 } },
    { name: 'The Baron', map: ['..........', '..........', '..........', '..........', '5555555555', 'S5S5S5S5S5', '4444444444'], boss: 3, tip: 'FINAL BOSS! The Bazaar Baron' },
  ];
  const BOSS_NAMES = ['', 'Crate King', 'Twin Cannon', 'Bazaar Baron'];
  const BRICK_COLORS = ['#5ef0ff', '#7cf2a8', '#ffe066', '#ffa94d', '#ff6b8b', '#c08cff', '#7c8cff'];

  function makeBrick(r, c, type, hp) {
    return { x: LEFT + c * (BW + GAP), y: TOP + r * (BH + GAP), w: BW, h: BH, hp, maxhp: hp, type, alive: true, flash: 0, col: c, row: r, spawnT: 6 + Math.random() * 4 };
  }
  // Later levels toughen up so they keep pace with your growing arsenal.
  const hpMult = (n) => 1 + Math.max(0, n - 14) * 0.15 + Math.max(0, n - 22) * 0.15;
  function brickFor(ch, r, c, n) {
    const m = hpMult(n) * (n > LEVELS.length ? 1.5 + (n - LEVELS.length) * 0.05 : 1);
    if (ch >= '1' && ch <= '9') return makeBrick(r, c, 'normal', Math.round(+ch * m));
    if (ch === 'S') return makeBrick(r, c, 'steel', Math.round((4 + Math.floor(n / 6)) * m));
    if (ch === 'B') return makeBrick(r, c, 'bomb', 1);
    if (ch === 'G') return makeBrick(r, c, 'gold', Math.round((2 + Math.floor(n / 8)) * m));
    if (ch === 'X') return makeBrick(r, c, 'stone', 999);
    if (ch === 'H') return makeBrick(r, c, 'hive', Math.round((6 + Math.floor(n / 5)) * m));
    return null;
  }
  // Endless mode after the campaign: seeded symmetric maps, more enemies, a boss every 10 levels.
  function endlessLevel(n) {
    const rnd = mulberry32(n * 7919 + 13);
    const R = 7 + Math.floor(rnd() * 3);
    const top = Math.min(9, 6 + Math.floor((n - 30) / 5));
    const boss = n % 10 === 0 ? 1 + ((n / 10 - 1) % 3) : 0;
    const map = [];
    if (boss) for (let r = 0; r < 4; r++) map.push('..........');
    const rows = boss ? 3 : R;
    for (let r = 0; r < rows; r++) {
      const half = [];
      for (let c = 0; c < 5; c++) {
        const roll = rnd();
        let ch = '.';
        if (roll < 0.78) ch = String(Math.max(1, Math.min(9, top - Math.floor(r / 2) - Math.floor(rnd() * 2))));
        if (roll < 0.08) ch = 'S'; else if (roll < 0.1) ch = 'B'; else if (roll < 0.13) ch = 'G'; else if (roll < 0.145 && !boss) ch = 'H';
        half.push(ch);
      }
      map.push(half.join('') + half.slice().reverse().join(''));
    }
    const kinds = ['drifter', 'shooter', 'mender', 'thief'];
    const foes = {};
    const count = Math.min(7, 3 + Math.floor((n - 30) / 4));
    for (let i = 0; i < count; i++) { const k = kinds[Math.floor(rnd() * kinds.length)]; foes[k] = (foes[k] || 0) + 1; }
    return { name: boss ? BOSS_NAMES[boss] + ' returns' : 'Endless ' + (n - 30), map, foes, boss };
  }
  function levelDef(n) { return n <= LEVELS.length ? LEVELS[n - 1] : endlessLevel(n); }
  function genLevel(n) {
    const def = levelDef(n);
    const bricks = [];
    def.map.forEach((row, r) => { for (let c = 0; c < COLS; c++) { const b = brickFor(row[c] || '.', r, c, n); if (b) bricks.push(b); } });
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
      levelCoins: 0, streakCoins: 0, time: 0, clearT: -1, gunCd: { blaster: 0.3, laser: 0.5, rocket: 0.8, scatter: 0.6, arc: 0.7 },
      shake: 0, banner: 3.2, started: false,
      foes: [], eshots: [], foeQueue: [], foeQueueT: 1.2, boss: null, stun: 0, shield: lv('shield'), secondWind: lv('second'),
      def: levelDef(run.level), crumbleT: 0, crumbling: false, seekT: 0,
    };
    G.par = 25 + run.level * 5 + Math.min(run.level, 10) * 1;
    if (G.def.boss) G.boss = makeBoss(G.def.boss);
    const q = [];
    for (const [k, n] of Object.entries(G.def.foes || {})) for (let i = 0; i < n; i++) q.push(k);
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    G.foeQueue = q;
    // Ammo Factory: free ammo every level
    if (lv('factory')) for (const g in GUNS) if (lv('gun_' + g)) run.ammo[g] += Math.round(GUNS[g].pack * 0.15 * lv('factory'));
    // Head Start: random power-ups at level start
    for (let i = 0; i < lv('starter'); i++) {
      const k = pick(['wide', 'slow', 'fire', 'wide']);
      G.fx[k] = Math.max(G.fx[k], puDur(k === 'fire' ? 7 : 12));
    }
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
    return { x, y, vx, vy, r: 7 + 1.5 * lv('bigball'), stuck: false, off: 0, stuckT: 0, pierce: 0, inside: new Set(), trail: [], serve: false };
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
    let s = 350 + Math.min(run.level, 40) * 5 + Math.min(60, G.time * 0.8);
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
  // Every coin drop is boosted 1.5x on average (fractions round up at random).
  const COIN_MULT = 1.5;
  function dropCoin(x, y, n = 1, exact = false) {
    if (!exact) { const raw = n * COIN_MULT; n = Math.floor(raw) + (Math.random() < raw % 1 ? 1 : 0); }
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
    if (fromBall && lv('splash') && Math.random() < 0.15 * lv('splash')) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      burst(cx, cy, '#e8f0ff', 6, 140);
      for (const o of G.bricks) if (o !== b && o.alive && o.type !== 'stone' && Math.abs(o.col - b.col) <= 1 && Math.abs(o.row - b.row) <= 1) { o.hp -= 1; o.flash = 0.12; if (o.hp <= 0) destroyBrick(o); }
    }
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
    if (G.combo % STREAK_STEP === 0) streakPayout(cx, cy);
    if (Math.random() < 0.075 + 0.02 * lv('puluck')) G.pus.push({ x: cx, y: cy, vy: 110, k: rollPU() });
    if (b.type === 'bomb') explode(cx, cy, 30 + 14 * lv('demo'), 2 + lv('demo'), '#ff6b3d');
  }
  // Streaks pay out every STREAK_STEP bricks; each payout is bigger than the last.
  const STREAK_STEP = 5;
  function streakCoins(combo) {
    const tier = Math.floor(combo / STREAK_STEP); // 5 -> 1, 10 -> 2, 15 -> 3 ...
    return Math.round(Math.min(tier, 15) * COIN_MULT * (1 + 0.5 * lv('streak')));
  }
  function streakPayout(x, y) {
    const n = streakCoins(G.combo);
    if (n <= 0) return;
    dropCoin(x, y, n, true);
    G.streakCoins += n * (1 + lv('value'));
    G.texts.push({ x: clamp(x, 70, W - 70), y: y + 24, t: 1.1, s: `${G.combo} STREAK! +${n} coins`, c: '#ffe680' });
    beep(660 + Math.min(G.combo, 60) * 12, 0.12, 'triangle', 0.06);
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
    for (const f of G.foes) if (Math.hypot(f.x - x, f.y - y) <= rad + f.r) damageFoe(f, dmg);
    if (bossAt(x, y, rad)) damageBoss(dmg);
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
  // Pause straight from the right button press (works even where the browser never fires 'contextmenu'),
  // and also from 'contextmenu' itself (Mac ctrl+click, keyboard menu key). Pausing twice is harmless.
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

  // ---------- update ----------
  function update(dt) {
    if (mode !== 'play') return;
    G.time += dt;
    if (G.banner > 0) G.banner -= dt;
    for (const k in G.fx) if (G.fx[k] > 0) G.fx[k] = Math.max(0, G.fx[k] - dt);
    G.shake = Math.max(0, G.shake - dt * 30);

    // paddle (slime stun shrinks and slows it)
    if (G.stun > 0) G.stun -= dt;
    const targetW = basePaddleW() * (G.fx.wide > 0 ? 1.5 : 1) * (G.stun > 0 ? 0.75 : 1);
    paddle.w += (targetW - paddle.w) * Math.min(1, dt * 8);
    paddle.x += (paddle.tx - paddle.x) * Math.min(1, dt * (G.stun > 0 ? 12 : 30));
    paddle.x = clamp(paddle.x, paddle.w / 2, W - paddle.w / 2);

    updateBalls(dt);
    updateFoes(dt);
    updateGuns(dt);
    updateDrones(dt);
    updateShots(dt);
    updateDrops(dt);
    updateParticles(dt);
    for (const b of G.bricks) if (b.flash > 0) b.flash -= dt;

    updateOvertime(dt);
    if (G.clearT < 0 && levelDone()) {
      G.clearT = 1.4; sfx.clear();
      for (const f of G.foes) damageFoe(f, 999);
      G.eshots = [];
    }
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

      steerBall(b, dt);
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
        // enemies, boss, slime
        const dmgE = (1 + lv('dmg')) * (fire ? 2 : 1);
        for (const f of G.foes) {
          if (f.dead || !ballVsCircle(b, f.x, f.y, f.r)) continue;
          if (f.hitCd <= 0) { damageFoe(f, dmgE); f.hitCd = 0.15; }
        }
        if (G.boss && !G.boss.dead) {
          const B = G.boss;
          if (ballVsRect(b, B.x - B.w / 2, B.y, B.w, B.h) && (G.time - (b.bossT || -1)) > 0.12) { b.bossT = G.time; damageBoss(dmgE); }
        }
        for (const e of G.eshots) if (!e.dead && Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) { e.dead = true; burst(e.x, e.y, '#9cff57', 6, 100); }
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
    G.combo = 0;
    if (G.secondWind > 0) {
      G.secondWind--; sfx.net();
      G.texts.push({ x: W / 2, y: H / 2, t: 1.4, s: 'Second Wind!', c: '#6ee7ff', big: true });
      serve(); return;
    }
    run.lives--; sfx.lose(); G.shake = 10;
    G.fx = { wide: 0, slow: 0, fire: 0, glue: 0 };
    if (run.lives <= 0) { gameOver(); return; }
    G.texts.push({ x: W / 2, y: H / 2, t: 1.2, s: 'Ball lost!', c: '#ff6b8b', big: true });
    serve();
  }

  // ---------- keeping levels from dragging ----------
  // After the level's par time the bricks start crumbling; when only a few bricks are left, balls home in on them.
  function updateOvertime(dt) {
    if (G.clearT >= 0 || !G.started) return;
    if (G.time > G.par) {
      if (!G.crumbling) { G.crumbling = true; G.texts.push({ x: W / 2, y: H * 0.5, t: 2.2, s: 'Overtime! Bricks are crumbling', c: '#ffa94d', big: true }); }
      G.crumbleT -= dt;
      if (G.crumbleT <= 0) {
        G.crumbleT = 2;
        for (const b of G.bricks) if (b.alive && b.type !== 'stone') { b.hp -= Math.max(1, Math.ceil(b.maxhp * 0.12)); b.flash = 0.1; if (b.hp <= 0) destroyBrick(b); }
        if (G.boss && !G.boss.dead) damageBoss(Math.ceil(G.boss.maxhp * 0.05));
        G.shake = Math.max(G.shake, 3);
      }
    }
    G.seekT = (!G.boss && destructibleLeft() <= 3) ? G.seekT + dt : 0;
  }
  function steerBall(b, dt) {
    if (G.seekT < 6 || b.y > PADDLE_Y - 120) return;
    let best = null, bd = Infinity;
    for (const k of G.bricks) if (k.alive && k.type !== 'stone') { const d = Math.hypot(k.x + k.w / 2 - b.x, k.y + k.h / 2 - b.y); if (d < bd) { bd = d; best = k; } }
    if (!best) return;
    const want = Math.atan2(best.y + best.h / 2 - b.y, best.x + best.w / 2 - b.x), cur = Math.atan2(b.vy, b.vx);
    let diff = want - cur; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    const a = cur + clamp(diff, -1.4 * dt, 1.4 * dt), sp = Math.hypot(b.vx, b.vy);
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
  }

  // ---------- guns ----------
  function overclock() { return 1 + 0.25 * lv('d_over'); }
  function brickAbove(x, slack = 0) {
    for (const k of G.bricks) if (k.alive && k.type !== 'stone' && x >= k.x - slack && x <= k.x + k.w + slack) return true;
    for (const f of G.foes) if (Math.abs(f.x - x) <= f.r + slack) return true;
    if (G.boss && !G.boss.dead && Math.abs(G.boss.x - x) <= G.boss.w / 2 + slack) return true;
    return false;
  }
  function anyTarget() { return destructibleLeft() > 0 || G.foes.length > 0 || (G.boss && !G.boss.dead); }
  const gunDmg = (d) => d + lv('rounds');
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
        G.shots.push({ x: xl, y: py, vx: 0, vy: -720, dmg: gunDmg(1), k: g }, { x: xr, y: py, vx: 0, vy: -720, dmg: gunDmg(1), k: g });
        sfx.shot();
      } else if (g === 'laser') {
        if (!brickAbove(px)) continue; if (!useAmmo(g)) continue;
        G.shots.push({ x: px, y: py, vx: 0, vy: -900, dmg: gunDmg(2), k: g, pierce: 3 + (l - 1), hit: new Set() });
        sfx.zap();
      } else if (g === 'rocket') {
        if (!brickAbove(px, 30)) continue; if (!useAmmo(g)) continue;
        G.shots.push({ x: px, y: py, vx: 0, vy: -380, dmg: gunDmg(2), k: g, rad: 52 + 10 * (l - 1) });
        sfx.shot();
      } else if (g === 'scatter') {
        if (!anyTarget()) continue; if (!useAmmo(g)) continue;
        const n = 5 + (l - 1);
        for (let i = 0; i < n; i++) { const a = -0.55 + (1.1 * i) / (n - 1); G.shots.push({ x: px, y: py, vx: Math.sin(a) * 620, vy: -Math.cos(a) * 620, dmg: gunDmg(1), k: g, life: 0.75 }); }
        sfx.shot();
      } else if (g === 'arc') {
        if (!anyTarget()) continue; if (!useAmmo(g)) continue;
        arcZap(px, py, 3 + (l - 1));
      }
      G.gunCd[g] = rate;
    }
  }
  function arcZap(x, y, jumps) {
    const pts = [[x, y]]; const used = new Set(); let cx = x, cy = y;
    for (let j = 0; j < jumps; j++) {
      let bestK = null, bd = Infinity;
      const cands = [];
      for (const k of G.bricks) if (k.alive && k.type !== 'stone') cands.push({ o: k, x: k.x + k.w / 2, y: k.y + k.h / 2, hit: (d) => hitBrick(k, d, false) });
      for (const f of G.foes) cands.push({ o: f, x: f.x, y: f.y, hit: (d) => damageFoe(f, d) });
      if (G.boss && !G.boss.dead) cands.push({ o: G.boss, x: G.boss.x, y: G.boss.y + G.boss.h / 2, hit: (d) => damageBoss(d) });
      for (const c of cands) {
        if (used.has(c.o)) continue;
        const d = Math.hypot(c.x - cx, c.y - cy);
        if (j > 0 && d > 140) continue;
        if (d < bd) { bd = d; bestK = c; }
      }
      if (!bestK) break;
      used.add(bestK.o); cx = bestK.x; cy = bestK.y; pts.push([cx, cy]);
      bestK.hit(gunDmg(2));
    }
    if (pts.length > 1) { G.bolts.push({ pts, t: 0.18 }); sfx.zap(); }
  }
  function updateShots(dt) {
    for (const s of G.shots) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life != null) { s.life -= dt; if (s.life <= 0) s.dead = true; }
      if (s.y < HUD_H || s.x < 0 || s.x > W) { s.dead = true; if (s.k === 'rocket') explode(s.x, Math.max(s.y, HUD_H), s.rad * 0.6, s.dmg, '#ffb14a'); continue; }
      const f = foeAt(s.x, s.y, 3);
      if (f && !(s.hit && s.hit.has(f))) {
        if (s.k === 'rocket') { explode(s.x, s.y, s.rad, s.dmg, '#ffb14a'); s.dead = true; continue; }
        damageFoe(f, s.dmg);
        if (s.k === 'laser') { s.hit.add(f); if (--s.pierce <= 0) { s.dead = true; continue; } }
        else { s.dead = true; continue; }
      }
      if (bossAt(s.x, s.y)) {
        if (s.k === 'rocket') explode(s.x, s.y, s.rad, s.dmg, '#ffb14a'); else damageBoss(s.dmg);
        s.dead = true; continue;
      }
      for (const e of G.eshots) if (!e.dead && Math.hypot(e.x - s.x, e.y - s.y) < e.r + 4) { e.dead = true; s.dead = true; burst(e.x, e.y, '#9cff57', 6, 100); }
      if (s.dead) continue;
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
          G.shots.push({ x: d.x, y: d.y - 6, vx: 0, vy: -640, dmg: gunDmg(1), k: 'orbit' });
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
      if (G.clearT >= 0) {
        // level cleared: every coin still in the air flies straight to the paddle
        const dx = pcx - c.x, dy = pcy - c.y, d = Math.hypot(dx, dy) || 1, sp = 900 * dt;
        if (d <= sp + 10) { c.dead = true; collectCoin(c); continue; }
        c.x += (dx / d) * sp; c.y += (dy / d) * sp; c.spin += dt * 12;
        continue;
      }
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

  // ---------- enemies & bosses ----------
  const FOE = {
    drifter: { r: 13, hp: 3, color: '#c08cff', coins: 2 },
    shooter: { r: 14, hp: 4, color: '#ff9a4d', coins: 3 },
    mender: { r: 12, hp: 4, color: '#5ee08a', coins: 3 },
    thief: { r: 12, hp: 2, color: '#8b93b8', coins: 2 },
  };
  function foeScale() { return 1 + (run.level - 1) / 14; }
  function brickBottom() { let y = TOP; for (const b of G.bricks) if (b.alive && b.y + b.h > y) y = b.y + b.h; return y; }
  function foeZone() {
    const top = Math.max(G.boss ? 140 : TOP, brickBottom() + 24);
    return { top, bot: Math.max(top + 60, Math.min(top + 200, PADDLE_Y - 190)) };
  }
  function spawnFoe(type, x, y) {
    const d = FOE[type], z = foeZone();
    const hp = Math.round(d.hp * foeScale());
    const f = { type, x: x != null ? x : rand(40, W - 40), y: y != null ? y : rand(z.top, z.bot), r: d.r, hp, maxhp: hp,
      vx: rand(-1, 1) * 55, vy: rand(-1, 1) * 30, t: Math.random() * 6, cd: rand(1.5, 3.5), hitCd: 0, flash: 0, loot: 0, dir: Math.random() < 0.5 ? -1 : 1 };
    G.foes.push(f); burst(f.x, f.y, d.color, 10, 120);
    return f;
  }
  function makeBoss(kind) {
    const hp = Math.round([0, 80, 200, 380][kind] * (1 + Math.max(0, run.level - 10) * 0.05));
    return { kind, x: W / 2, y: 94, w: 150, h: 46, hp, maxhp: hp, t: 0, fireT: 2.5, spawnT: 7, flash: 0, dead: false };
  }
  function damageFoe(f, dmg) {
    if (f.dead) return;
    f.hp -= dmg; f.flash = 0.12; sfx.brick(2);
    if (f.hp <= 0) {
      f.dead = true; sfx.pop(); burst(f.x, f.y, FOE[f.type].color, 16, 220);
      run.score += 50;
      dropCoin(f.x, f.y, FOE[f.type].coins + lv('foebounty') + f.loot * 2);
      if (f.loot) G.texts.push({ x: f.x, y: f.y - 16, t: 1, s: 'Loot back x2!', c: '#ffd84a' });
    }
  }
  function damageBoss(dmg) {
    const B = G.boss; if (!B || B.dead) return;
    B.hp -= dmg; B.flash = 0.1; sfx.stone();
    if (B.hp <= 0) {
      B.dead = true; G.shake = 14; sfx.boom(); sfx.clear();
      for (let i = 0; i < 6; i++) setTimeout(() => G && burst(B.x + rand(-60, 60), B.y + rand(-15, 15), '#ffd23f', 20, 260), i * 90);
      dropCoin(B.x, B.y + 20, Math.round((15 + 10 * B.kind) * (1 + 0.25 * lv('foebounty'))));
      run.score += 2000 * B.kind;
      G.texts.push({ x: W / 2, y: H / 2, t: 2, s: BOSS_NAMES[B.kind] + ' defeated!', c: '#ffd23f', big: true });
      for (const b of G.bricks) if (b.alive && b.type !== 'stone') destroyBrick(b);
      for (const f of G.foes) damageFoe(f, 999);
    }
  }
  // circle-vs-ball bounce; returns true on contact
  function ballVsCircle(b, cx, cy, r) {
    const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy), min = r + b.r;
    if (d >= min || d === 0) return false;
    const nx = dx / d, ny = dy / d, dot = b.vx * nx + b.vy * ny;
    if (dot < 0) { b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny; }
    b.x = cx + nx * min; b.y = cy + ny * min;
    return true;
  }
  function ballVsRect(b, x, y, w, h) {
    const cx = clamp(b.x, x, x + w), cy = clamp(b.y, y, y + h), dx = b.x - cx, dy = b.y - cy;
    if (dx * dx + dy * dy > b.r * b.r) return false;
    const kx = x + w / 2, ky = y + h / 2;
    const ox = w / 2 + b.r - Math.abs(b.x - kx), oy = h / 2 + b.r - Math.abs(b.y - ky);
    if (ox < oy) { const sg = Math.sign(b.x - kx) || 1; b.vx = sg * Math.abs(b.vx); b.x += sg * ox; }
    else { const sg = Math.sign(b.y - ky) || 1; b.vy = sg * Math.abs(b.vy); b.y += sg * oy; }
    return true;
  }
  function enemyShot(x, y, angle, speed) {
    G.eshots.push({ x, y, vx: Math.sin(angle) * speed, vy: Math.cos(angle) * speed, r: 6 });
  }
  function aimAtPaddle(x, y) { return Math.atan2(paddle.x - x, PADDLE_Y - y); }

  function updateFoes(dt) {
    // staggered arrivals
    if (G.foeQueue.length && G.started) {
      G.foeQueueT -= dt;
      if (G.foeQueueT <= 0) { spawnFoe(G.foeQueue.shift()); G.foeQueueT = 2.2; }
    }
    // hives
    for (const b of G.bricks) {
      if (!b.alive || b.type !== 'hive' || !G.started) continue;
      b.spawnT -= dt;
      if (b.spawnT <= 0) {
        b.spawnT = 9;
        if (G.foes.filter((f) => f.type === 'drifter').length < 4) spawnFoe('drifter', b.x + b.w / 2, b.y + b.h + 16);
      }
    }
    const z = foeZone();
    for (const f of G.foes) {
      f.t += dt; if (f.flash > 0) f.flash -= dt; if (f.hitCd > 0) f.hitCd -= dt;
      if (f.type === 'drifter') {
        f.vx += Math.sin(f.t * 0.9) * 12 * dt; f.vy += Math.cos(f.t * 0.7) * 10 * dt;
        const sp = Math.hypot(f.vx, f.vy) || 1, want = 55; f.vx *= want / sp; f.vy *= want / sp;
        f.x += f.vx * dt; f.y += f.vy * dt;
      } else if (f.type === 'shooter') {
        f.x += f.dir * 70 * dt;
        if (f.x < 30 || f.x > W - 30) f.dir *= -1;
        f.y += (z.top + 20 - f.y) * Math.min(1, dt * 1.5);
        f.cd -= dt;
        if (f.cd <= 0 && G.clearT < 0) { f.cd = rand(3, 4.2); enemyShot(f.x, f.y + f.r, aimAtPaddle(f.x, f.y) + rand(-0.12, 0.12), 170); beep(240, 0.1, 'sine', 0.04, -80); }
      } else if (f.type === 'mender') {
        f.x += f.dir * 45 * dt; if (f.x < 30 || f.x > W - 30) f.dir *= -1;
        f.y += (z.top + 6 + Math.sin(f.t) * 10 - f.y) * Math.min(1, dt * 2);
        f.cd -= dt;
        if (f.cd <= 0) {
          f.cd = 3.5;
          let best = null, bd = 160;
          for (const b of G.bricks) {
            if (!b.alive || b.type === 'stone' || b.hp >= b.maxhp) continue;
            const d = Math.hypot(b.x + b.w / 2 - f.x, b.y + b.h / 2 - f.y); if (d < bd) { bd = d; best = b; }
          }
          if (best) { best.hp++; best.flash = 0.15; G.bolts.push({ pts: [[f.x, f.y], [best.x + best.w / 2, best.y + best.h / 2]], t: 0.3, c: '#5ee08a' }); }
        }
      } else if (f.type === 'thief') {
        let target = null, bd = Infinity;
        for (const c of G.coins) { const d = Math.hypot(c.x - f.x, c.y - f.y); if (d < bd) { bd = d; target = c; } }
        if (f.loot >= 10 || (f.loot > 0 && !target && (f.idle = (f.idle || 0) + dt) > 4)) f.fleeing = true;
        let tx, ty;
        if (f.fleeing) { tx = f.x; ty = -40; }
        else if (target) { tx = target.x; ty = target.y; f.idle = 0; }
        else { tx = W / 2 + Math.sin(f.t * 0.6) * 160; ty = z.top + 30; }
        const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy) || 1, sp = f.fleeing ? 90 : 130;
        f.x += (dx / d) * Math.min(sp * dt, d); f.y += (dy / d) * Math.min(sp * dt, d);
        if (target && !f.fleeing && Math.hypot(target.x - f.x, target.y - f.y) < f.r + 6) {
          target.dead = true; f.loot += target.val; beep(300, 0.08, 'square', 0.03, -120);
        }
        if (f.fleeing && f.y < HUD_H - 10) {
          f.dead = true; f.escaped = true;
          G.texts.push({ x: clamp(f.x, 80, W - 80), y: HUD_H + 20, t: 1.4, s: `Thief got away with ${f.loot}!`, c: '#ff6b8b' });
        }
      }
      if (f.type !== 'thief') {
        if (f.x < f.r) { f.x = f.r; f.vx = Math.abs(f.vx); } if (f.x > W - f.r) { f.x = W - f.r; f.vx = -Math.abs(f.vx); }
        if (f.y < z.top) { f.y = Math.min(f.y + 60 * dt, z.top); f.vy = Math.abs(f.vy); }
        if (f.y > z.bot) { f.y = z.bot; f.vy = -Math.abs(f.vy); }
      }
    }
    G.foes = G.foes.filter((f) => !f.dead);

    // boss
    const B = G.boss;
    if (B && !B.dead) {
      const enraged = B.hp < B.maxhp * 0.4;
      B.t += dt * (enraged ? 1.5 : 1); if (B.flash > 0) B.flash -= dt;
      B.x = W / 2 + Math.sin(B.t * 0.55) * (W / 2 - B.w / 2 - 8);
      if (G.started && G.clearT < 0) {
        B.fireT -= dt * (enraged ? 1.4 : 1);
        if (B.fireT <= 0) {
          const by = B.y + B.h;
          if (B.kind === 1) { B.fireT = 2.6; for (const a of [-0.35, 0, 0.35]) enemyShot(B.x, by, a, 160); }
          else if (B.kind === 2) { B.fireT = 2.1; for (const ox of [-50, 50]) enemyShot(B.x + ox, by, aimAtPaddle(B.x + ox, by), 185); }
          else { B.fireT = 2.1; const aim = aimAtPaddle(B.x, by); for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) enemyShot(B.x, by, (B.t % 2 < 1 ? aim : 0) + a, 165); }
          beep(180, 0.15, 'sawtooth', 0.04, -60);
        }
        if (B.kind >= 2) {
          B.spawnT -= dt;
          if (B.spawnT <= 0) { B.spawnT = B.kind === 3 ? 8 : 9; if (G.foes.length < 5) spawnFoe(B.kind === 3 && Math.random() < 0.4 ? 'mender' : 'drifter', B.x, B.y + B.h + 20); }
        }
      }
    }

    // enemy slime shots
    for (const s of G.eshots) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.x < -10 || s.x > W + 10 || s.y > H + 10) { s.dead = true; continue; }
      if (s.vy > 0 && s.y + s.r >= PADDLE_Y && s.y - s.r <= PADDLE_Y + PADDLE_H && Math.abs(s.x - paddle.x) <= paddle.w / 2 + s.r) {
        s.dead = true;
        if (G.shield > 0) { G.shield--; burst(s.x, PADDLE_Y, '#6ee7ff', 12, 160); sfx.net(); G.texts.push({ x: s.x, y: PADDLE_Y - 20, t: 0.8, s: 'Blocked!', c: '#6ee7ff' }); }
        else { G.stun = 1.5; burst(s.x, PADDLE_Y, '#9cff57', 14, 160); beep(140, 0.25, 'sawtooth', 0.05, -60); }
      }
    }
    G.eshots = G.eshots.filter((s) => !s.dead);
  }
  function drawFoes(t) {
    for (const f of G.foes) {
      const d = FOE[f.type], wob = Math.sin(f.t * 4) * 1.5;
      ctx.fillStyle = f.flash > 0 ? '#ffffff' : d.color;
      if (f.type === 'drifter') { ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r + wob, f.r - wob, 0, 0, 7); ctx.fill(); }
      else if (f.type === 'shooter') {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
        ctx.fillStyle = '#7a3a10'; ctx.fillRect(f.x - 4, f.y + f.r - 4, 8, 9);
        ctx.fillStyle = d.color; for (const s of [-1, 1]) ctx.fillRect(f.x + s * (f.r + 2) - 3, f.y - 2 + wob, 6, 4);
      } else if (f.type === 'mender') {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.fillRect(f.x - 2, f.y - 7, 4, 14); ctx.fillRect(f.x - 7, f.y - 2, 14, 4);
      } else if (f.type === 'thief') {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
        ctx.fillStyle = '#1b1f33'; ctx.fillRect(f.x - f.r, f.y - 5, f.r * 2, 6);
        if (f.loot) { ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(f.x + f.r - 2, f.y + f.r - 2, 6, 0, 7); ctx.fill();
          ctx.fillStyle = '#5a3b00'; ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.loot, f.x + f.r - 2, f.y + f.r - 1.5); }
      }
      if (f.type !== 'mender') {
        const ey = f.type === 'thief' ? f.y - 2 : f.y - 3;
        ctx.fillStyle = f.type === 'thief' ? '#ffe066' : '#ffffff';
        ctx.beginPath(); ctx.arc(f.x - 4, ey, 2.6, 0, 7); ctx.arc(f.x + 4, ey, 2.6, 0, 7); ctx.fill();
        if (f.type !== 'thief') { ctx.fillStyle = '#1b1f33'; ctx.beginPath(); ctx.arc(f.x - 4, ey + 0.8, 1.2, 0, 7); ctx.arc(f.x + 4, ey + 0.8, 1.2, 0, 7); ctx.fill(); }
      }
      if (f.hp < f.maxhp) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(f.x - 12, f.y - f.r - 8, 24, 3);
        ctx.fillStyle = d.color; ctx.fillRect(f.x - 12, f.y - f.r - 8, 24 * Math.max(0, f.hp / f.maxhp), 3);
      }
    }
    const B = G.boss;
    if (B && !B.dead) {
      const x = B.x - B.w / 2, y = B.y;
      const col = ['', '#c8874a', '#8a9bb8', '#d4a5ff'][B.kind];
      ctx.fillStyle = B.flash > 0 ? '#ffffff' : col; rr(x, y, B.w, B.h, 10); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x + 8, y + 4, B.w - 16, 5);
      if (B.kind === 1) { ctx.strokeStyle = '#7a4a1e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + B.w - 6, y + B.h - 6); ctx.moveTo(x + B.w - 6, y + 6); ctx.lineTo(x + 6, y + B.h - 6); ctx.stroke();
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(x + 40, y); ctx.lineTo(x + 52, y - 16); ctx.lineTo(x + 75, y - 4); ctx.lineTo(x + 98, y - 16); ctx.lineTo(x + 110, y); ctx.fill(); }
      if (B.kind === 2) { ctx.fillStyle = '#3d4760'; for (const ox of [-50, 50]) ctx.fillRect(B.x + ox - 7, y + B.h - 4, 14, 14); }
      if (B.kind === 3) { ctx.fillStyle = '#ffd23f'; ctx.fillRect(x + 20, y - 18, B.w - 40, 18); ctx.fillStyle = '#2b1a40'; ctx.fillRect(x + 10, y - 2, B.w - 20, 4); }
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(B.x - 22, y + 24, 8, 0, 7); ctx.arc(B.x + 22, y + 24, 8, 0, 7); ctx.fill();
      const px = clamp((paddle.x - B.x) / 60, -3, 3);
      ctx.fillStyle = B.hp < B.maxhp * 0.4 ? '#ff2a4d' : '#1b1f33'; ctx.beginPath(); ctx.arc(B.x - 22 + px, y + 27, 4, 0, 7); ctx.arc(B.x + 22 + px, y + 27, 4, 0, 7); ctx.fill();
    }
    for (const s of G.eshots) {
      ctx.fillStyle = 'rgba(156,255,87,0.35)'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#9cff57'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    }
  }
  function foeAt(x, y, pad = 0) {
    for (const f of G.foes) if (!f.dead && Math.hypot(f.x - x, f.y - y) <= f.r + pad) return f;
    return null;
  }
  function bossAt(x, y, pad = 0) {
    const B = G.boss; if (!B || B.dead) return false;
    return x >= B.x - B.w / 2 - pad && x <= B.x + B.w / 2 + pad && y >= B.y - pad && y <= B.y + B.h + pad;
  }
  function levelDone() { return G.boss ? G.boss.dead : destructibleLeft() === 0; }

  // ---------- level end ----------
  function finishLevel() {
    for (const c of G.coins) collectCoin(c);
    G.coins = [];
    const bonus = Math.round((15 + run.level * 4) * COIN_MULT * (1 + 0.25 * lv('bounty')));
    run.coins += bonus;
    const pl = lv('piggy');
    const interest = pl ? Math.min(Math.floor(run.coins * 0.05 * pl), 30 * pl) : 0;
    run.coins += interest;
    lastSummary = { level: run.level, picked: G.levelCoins, bonus, interest, combo: G.comboBest, streak: G.streakCoins };
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
    const summary = s ? `<div class="summary"><span>Level ${s.level} cleared!</span><span>Picked up <b>${s.picked}</b></span><span>Clear bonus <b>${s.bonus}</b></span>${s.interest ? `<span>Interest <b>${s.interest}</b></span>` : ''}<span>Best streak <b>${s.combo}</b>${s.streak ? ` (streak coins <b>${s.streak}</b>)` : ''}</span></div>` : '';
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
    const glue = G.fx.glue > 0, fire = G.fx.fire > 0, stun = G.stun > 0;
    ctx.globalAlpha = 0.25; ctx.fillStyle = stun ? '#9cff57' : glue ? '#ffe066' : '#5ef0ff';
    rr(x - 4, y - 4, paddle.w + 8, PADDLE_H + 8, 10); ctx.fill(); ctx.globalAlpha = 1;
    if (G.shield > 0) { ctx.strokeStyle = 'rgba(110,231,255,0.6)'; ctx.lineWidth = 2; rr(x - 7, y - 7, paddle.w + 14, PADDLE_H + 14, 12); ctx.stroke(); }
    const g = ctx.createLinearGradient(0, y, 0, y + PADDLE_H);
    g.addColorStop(0, stun ? '#d8ffb0' : glue ? '#fff3a8' : '#bff8ff'); g.addColorStop(1, stun ? '#4f9a1e' : glue ? '#e0a800' : '#2f8cff');
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
    if (G.net > 0) { ctx.fillStyle = '#6ee7ff'; ctx.fillText('NET×' + G.net, tx, 43); tx += 50; }
    if (G.shield > 0) { ctx.fillStyle = '#6ee7ff'; ctx.fillText('🛡×' + G.shield, tx, 43); tx += 44; }
    if (G.crumbling) { ctx.fillStyle = '#ffa94d'; ctx.fillText('OVERTIME', tx, 43); }
    if (G.combo >= 5) { ctx.textAlign = 'right'; ctx.fillStyle = '#ffe680'; ctx.fillText(G.combo + ' streak · next +' + streakCoins(Math.ceil((G.combo + 1) / STREAK_STEP) * STREAK_STEP), W - 54, 43); }
  }

  function wrapText(text, x, y, maxW, lh) {
    let line = '';
    for (const w of text.split(' ')) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = test;
    }
    if (line) ctx.fillText(line, x, y);
  }
  function drawBossBar() {
    const B = G.boss; if (!B || B.dead) return;
    const y = HUD_H + 2;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(10, y, W - 20, 10);
    ctx.fillStyle = B.hp < B.maxhp * 0.4 ? '#ff2a4d' : '#ffd23f'; ctx.fillRect(11, y + 1, (W - 22) * Math.max(0, B.hp / B.maxhp), 8);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(BOSS_NAMES[B.kind], W / 2, y + 5.5);
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
    drawFoes(t);
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
    drawBossBar();
    if (mode === 'play' && G.banner > 0) {
      ctx.globalAlpha = Math.min(1, G.banner); ctx.fillStyle = '#ffffff'; ctx.font = 'bold 40px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('LEVEL ' + run.level, W / 2, H * 0.55);
      ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 20px system-ui, sans-serif'; ctx.fillText(G.def.name, W / 2, H * 0.55 + 32);
      if (G.def.tip) { ctx.fillStyle = '#c9d0ff'; ctx.font = '15px system-ui, sans-serif'; wrapText(G.def.tip, W / 2, H * 0.55 + 60, 380, 20); }
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
    clear() { if (G) { for (const b of G.bricks) if (b.type !== 'stone') b.alive = false; if (G.boss) G.boss.dead = true; } },
    give(n) { if (run) { run.coins += n; } },
    step(dt) { update(dt); },
    paddle, launch() { launch(); },
    buyId(id) { return buy(ITEM_BY_ID[id]); },
    next() { lastSummary = null; startLevel(); },
  };

  showMenu();
  requestAnimationFrame(frame);
})();
