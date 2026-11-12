'use strict';
/* Strata Siege - a one-handed tower defense on three isometric layers. Only one layer is on screen at a time.
   Sky: herd and merge clouds; their shadows are the weather below. Ground: towers, the Boot, Grandma at the door.
   Mine: hamsters with backpacks dig for loot; numbers on dug tiles count the dangers around them.
   Controls: tap and drag only. Escape or a right click pauses.
   All game logic is in world units: one tile is 1 x 1, heights are in tile heights. Screen pixels appear only in drawing. */
(() => {
  // ---------- layout ----------
  const W = 480, H = 800, HUD_H = 56, BAR_H = 76, VIEW_Y0 = HUD_H, VIEW_Y1 = H - BAR_H;
  // The map is N x N diamonds of TW x TH. ZU is the height of one cube on screen. SLAB is the side of the map slab.
  const N = 9, TW = 80, TH = 40, HW = 40, HH = 20, ZU = 49, SLAB = 26;
  const MAP_W = N * TW, ORIGIN_X = MAP_W / 2, ORIGIN_Y = 90;
  const CACHE_W = MAP_W, CACHE_H = ORIGIN_Y + N * TH + SLAB + 40;
  // The world is drawn smaller than it is painted, so that nearly all of the map fits on a phone. World drawing and
  // picking use "view units": the view is VW x VH of them, with (0, 0) in the corner under the HUD.
  const ZOOM = 0.75, VW = W / ZOOM, VH = (VIEW_Y1 - VIEW_Y0) / ZOOM;
  const MAP_Y = Math.round((VH - CACHE_H) / 2) + 16;
  const PAN_MAX = (MAP_W - VW) / 2 + 24;
  const FLY_Z = 2.3, CLOUD_Z = 0.4;
  const SAVE_KEY = 'stratasiege.save.v1', BEST_KEY = 'stratasiege.best.v1', MUTE_KEY = 'stratasiege.mute',
    MUSIC_KEY = 'stratasiege.musicoff', META_KEY = 'stratasiege.meta.v1';
  const LAYERS = ['sky', 'ground', 'dig'];
  const LAYER_NAME = { sky: 'SKY', ground: 'GROUND', dig: 'DIG' };

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

  // ---------- modules ----------
  // Art, creatures, audio, the keeper's lines and the maps live in their own files.
  const ART = window.SSArt, FOE_ART = window.SSFoeArt, LV = window.SS_LEVELS, KEEPER = window.SS_KEEPER || { name: 'Gnorman', lines: {} };
  const DIG_Z = ART.DIG_Z;
  const LORE = window.SS_LORE || {}, VO = window.SS_VOICES || {};
  // A missing effect must never stop the game.
  const A = window.SSAudio || {};
  const quiet = () => 0;
  for (const k of ['init', 'music', 'fever', 'streak', 'rush', 'tune', 'layer', 'setSfx', 'setMusic']) if (!A[k]) A[k] = quiet;
  if (!A.beat) A.beat = quiet;
  const sfx = new Proxy(A.sfx || {}, { get: (o, k) => (typeof o[k] === 'function' ? o[k] : quiet) });
  let muted = store.get(MUTE_KEY, false), musicOff = store.get(MUSIC_KEY, false);
  A.setSfx(!muted); A.setMusic(!musicOff);
  function audio() { A.init(); }
  function buzz(p) { try { if (!muted && navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } }

  // ---------- sizing ----------
  let scale = 1, dpr = 1, S = 1, SZ = 1; // S = device pixels for one logical pixel, SZ = for one view unit
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    scale = Math.min(vw / W, vh / H);
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cw = Math.floor(W * scale), ch = Math.floor(H * scale);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    wrap.style.width = cw + 'px'; wrap.style.height = ch + 'px';
    wrap.style.fontSize = Math.max(11, 16 * scale) + 'px';
    S = canvas.width / W; SZ = S * ZOOM;
    sprites.clear();
    for (const k of LAYERS) cacheDirty[k] = true;
    closePop();
  }
  window.addEventListener('resize', resize);

  // ---------- utils ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const inMap = (i, j) => i >= 0 && j >= 0 && i < N && j < N;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const easeOutBack = (t, s = 1.4) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
  const easeInCubic = (t) => t * t * t;
  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ---------- sprites ----------
  // Every piece of art is painted once into a small canvas at device scale and then copied. `white` is the hit flash.
  const sprites = new Map();
  function spr(X, kind, o, white) {
    const key = kind + '|' + (o ? JSON.stringify(o) : '') + (white ? '|w' : '');
    let s = sprites.get(key);
    if (!s) {
      let b = null;
      try { b = X.box(kind, o); } catch (e) { b = null; }
      if (!b || !isFinite(b.w) || !isFinite(b.h)) b = { w: 40, h: 40, ax: 20, ay: 34 };
      const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.ceil(b.w * SZ)); cv.height = Math.max(1, Math.ceil(b.h * SZ));
      const c = cv.getContext('2d'); c.setTransform(SZ, 0, 0, SZ, 0, 0); c.translate(b.ax, b.ay);
      try { X.paint(kind, c, o); } catch (e) { c.fillStyle = '#ff00ff'; c.beginPath(); c.arc(0, -10, 10, 0, 7); c.fill(); }
      if (white) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-atop'; c.fillStyle = '#ffffff'; c.fillRect(0, 0, cv.width, cv.height); }
      s = { cv, w: b.w, h: b.h, ax: b.ax, ay: b.ay }; sprites.set(key, s);
    }
    return s;
  }
  const art = (kind, o, white) => spr(ART, kind, o, white);
  const foeSpr = (kind, o, white) => spr(FOE_ART, kind, o, white);
  // Copies a sprite so that its anchor lands on (x, y). sx, sy squash and stretch around the anchor.
  function blit(s, x, y, sx = 1, sy = 1, flip = false) {
    x = Math.round(x * SZ) / SZ; y = Math.round(y * SZ) / SZ;
    if (flip) { ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); ctx.drawImage(s.cv, -s.ax * sx, -s.ay * sy, s.w * sx, s.h * sy); ctx.restore(); }
    else ctx.drawImage(s.cv, x - s.ax * sx, y - s.ay * sy, s.w * sx, s.h * sy);
  }
  const icon = (k, x, y, size = 22) => { const s = art('icon', { k }); ctx.drawImage(s.cv, x - size / 2, y - size / 2, size, size); };

  // ---------- catalogue: towers ----------
  // cost in coins; dmg per shot; rate = seconds between shots; range in tiles; `from` = the first level that has it.
  // `cap` is the rule that level 3 adds.
  const TOWERS = {
    pea: { name: 'Pea Pod', icon: '🌱', cost: 30, dmg: 8, rate: 0.55, range: 2.1, ground: true, air: false, from: 1, color: '#9dff6b',
      desc: 'Spits peas at walkers', cap: 'Big Pea: every fifth shot is a huge pea that knocks its target back.' },
    kite: { name: 'Kite Launcher', icon: '🪁', cost: 40, dmg: 16, rate: 0.8, range: 3.0, ground: false, air: true, from: 2, color: '#ff8ad8',
      desc: 'Only hits flyers, hard', cap: 'Tangle: the string also hits a second flyer.' },
    ice: { name: 'Brain Freeze', icon: '🍦', cost: 50, dmg: 3, rate: 1.0, range: 1.9, ground: true, air: true, slow: 0.45, splash: 0.8, from: 4, color: '#bdf3ff',
      desc: 'Slows everything nearby', cap: 'Deep Freeze: the third scoop freezes an enemy solid.' },
    banana: { name: 'Banana Peeler', icon: '🍌', cost: 60, dmg: 10, rate: 3.2, range: 2.0, ground: true, air: false, from: 6, color: '#ffe680',
      desc: 'Peels on the path: walkers slip back', cap: 'Slapstick: a slip knocks over the two behind as well.' },
    mortar: { name: 'Teapot Mortar', icon: '🫖', cost: 70, dmg: 24, rate: 1.9, range: 3.2, ground: true, air: false, splash: 0.95, from: 8, color: '#d9a066',
      desc: 'Lobs boiling tea, splash', cap: 'Hot Puddle: the tea keeps scalding where it lands.' },
    tesla: { name: 'Tesla Toaster', icon: '🍞', cost: 90, dmg: 13, rate: 1.1, range: 2.4, ground: true, air: true, chain: 3, from: 11, color: '#cfe0ff',
      desc: 'Lightning that jumps', cap: 'Overdone: two more jumps, and each one stuns.' },
  };
  const TOWER_ORDER = ['pea', 'kite', 'ice', 'banana', 'mortar', 'tesla'];

  // ---------- catalogue: enemies ----------
  // hp at level 1; spd in tiles per second; coin = reward; cost = its share of a wave budget; gap = seconds after its spawn.
  const FOES = {
    rat: { hp: 16, spd: 1.45, coin: 3, cost: 1, gap: 0.55, r: 0.2 },
    snail: { hp: 38, spd: 0.68, coin: 4, cost: 1.6, gap: 0.95, r: 0.22 },
    beetle: { hp: 46, spd: 0.85, coin: 6, armor: 3, cost: 2.4, gap: 0.9, r: 0.22 },
    hedgehog: { hp: 75, spd: 1.0, coin: 8, armor: 2, cost: 3.4, gap: 1, r: 0.22 },
    frog: { hp: 30, spd: 1.3, coin: 5, cost: 1.8, gap: 0.7, r: 0.2 },
    sapper: { hp: 44, spd: 0.9, coin: 9, cost: 3, gap: 1.2, r: 0.22 },
    balloon: { hp: 28, spd: 0.75, coin: 5, fly: true, cost: 2, gap: 1.1, r: 0.25 },
    duck: { hp: 22, spd: 1.5, coin: 5, fly: true, cost: 2, gap: 0.6, r: 0.22 },
    worm: { hp: 30, spd: 0.95, coin: 4, gap: 0.5, r: 0.18 },
    chick: { hp: 10, spd: 1.6, coin: 1, gap: 0.3, r: 0.15 },
    hen: { hp: 520, spd: 0.5, coin: 60, hearts: 5, boss: true, gap: 2, r: 0.4 },
    tyrant: { hp: 760, spd: 0.46, coin: 80, hearts: 5, boss: true, armor: 2, gap: 2, r: 0.4 },
    goose: { hp: 640, spd: 0.4, coin: 100, hearts: 5, boss: true, fly: true, gap: 2, r: 0.4 },
    king: { hp: 210, spd: 0.62, coin: 14, hearts: 2, gap: 2, r: 0.34, art: 'rat' },
  };
  const BOSS_AT = { 10: 'hen', 20: 'tyrant', 30: 'goose' };
  const MINI_AT = { 5: 1, 15: 2, 25: 3 };   // King Rat visits: level -> how many
  // A wave can come with a twist. gap and spd multiply; armor adds; coin multiplies the reward.
  const TWISTS = {
    conga: { name: 'CONGA!', sub: 'they come in one long line', gap: 0.3 },
    sports: { name: 'SPORTS DAY', sub: 'faster, and worth double', spd: 1.4, coin: 2 },
    fancy: { name: 'FANCY DRESS', sub: 'party hats are armour. The Boot flips beetles', armor: 2 },
  };
  // Towers on neighbouring tiles that like each other. The key is the two kinds in alphabetical order.
  const PALS = {
    'ice+pea': ['Frozen Peas', 'peas also slow'],
    'mortar+tesla': ['Electric Kettle', 'the tea zaps two more'],
    'kite+tesla': ['Franklin', 'a kite hit sends a bolt down on a walker'],
    'ice+mortar': ['Iced Tea', 'the tea also slows'],
    'banana+pea': ['Fruit Salad', 'one more peel on the path'],
  };
  const BOSS_NAMES = { hen: 'Mama Hen', tyrant: 'The Tunnel Tyrant', goose: 'The Thunder Goose' };

  // ---------- catalogue: the mine ----------
  // w = weight; far = the smallest distance from the shaft (tiles); carry = a hamster must bring it home.
  const LOOT = {
    gem: { w: 40, carry: true, name: 'Gem' }, coins: { w: 22, carry: true, name: 'Coin pouch' },
    fossil: { w: 8, far: 3, carry: true, name: 'Fossil' }, spring: { w: 8, name: 'Spring' },
    heart: { w: 5, carry: true, name: 'Heart stone' }, mushroom: { w: 6, name: 'Zoomy mushroom' },
    relic: { w: 7, far: 3, name: 'Old urn' }, blueprint: { w: 4, far: 4, carry: true, name: 'Blueprint' },
    dynamite: { w: 6, far: 2, name: 'Dynamite' },
  };
  const HAZARDS = { gas: 'Stink pocket', cave: 'Cave-in', nest: 'Worm nest' };
  const HARD_NAMES = ['', 'Soft dirt', 'Packed clay', 'Stone', 'Hard rock'];
  const NUM_COL = ['', '#7cc8ff', '#7cf28a', '#ffd84a', '#ff8a5c', '#ff5a7a', '#ff5a7a', '#ff5a7a', '#ff5a7a'];
  const PACK_CAP = 3;          // items in a backpack before the hamster walks home
  const FUSE_S = 3;            // seconds from a placed stick to the blast
  const GEM_ROLL_S = 6;        // a loose gem waits this long for a tap
  const PIT_S = 9, PIT_COST = 15;
  const SAPPER_TAPS = 3, TYRANT_TAPS = 5;

  // ---------- catalogue: the sky ----------
  // r = the radius of the shadow in tiles (a big cloud: x1.5); life in seconds, or bolts for a storm.
  const CLOUDS = {
    puff: { name: 'Puff', r: 0.9, raw: true }, gold: { name: 'Golden puff', r: 0.9, raw: true }, frost: { name: 'Frosty puff', r: 0.9, raw: true },
    rain: { name: 'Rain', r: 1.15, life: 45, tint: '80,150,255', text: 'slows enemies, doubles digging' },
    storm: { name: 'Storm', r: 1.15, bolts: 16, tint: '170,120,255', text: 'zaps the toughest enemy in its shadow' },
    sun: { name: 'Sunbeam', r: 1.15, life: 40, tint: '255,220,90', text: 'towers in its light fire faster' },
    rainbow: { name: 'Rainbow', r: 1.15, life: 40, tint: '255,150,220', text: 'walkers stop to dance, and it pays coins' },
    snow: { name: 'Snow', r: 1.15, life: 35, tint: '200,240,255', text: 'slows enemies to a crawl' },
    super: { name: 'Supercell', r: 1.5, bolts: 34, tint: '150,90,255', text: 'a storm with twice the temper' },
  };
  // a + b -> result. The order does not matter. Two equal finished clouds make one big cloud.
  const RECIPES = [
    ['puff', 'puff', 'rain'], ['rain', 'puff', 'storm'], ['rain', 'rain', 'storm'], ['storm', 'storm', 'super'], ['storm', 'puff', 'storm'],
    ['gold', 'puff', 'sun'], ['gold', 'gold', 'sun'], ['gold', 'rain', 'rainbow'], ['frost', 'puff', 'snow'], ['frost', 'rain', 'snow'], ['frost', 'frost', 'snow'],
  ];
  const PUFF_S = 8, PUFF_MAX = 9;   // a new puff every PUFF_S seconds, up to PUFF_MAX clouds
  const DRIFT = 1 / 7;              // tiles per second that an unwatched, unanchored cloud drifts

  // ---------- reveal schedule ----------
  // The first level of each feature. A new run meets the game one piece at a time.
  const FROM = { boot: 1, bell: 1, wanted: 2, pals: 4, twist: 6, dig: 3, sky: 5, crystal: 6, heat: 6, gold: 7, combo: 7, dynamite: 8, sapper: 9, pit: 11, frost: 12, lode: 5 };
  const CAMPAIGN = 30;

  // ---------- the Boot, Grandma, streaks, the combo ----------
  const BOOT_DELAY = 0.6, BOOT_R = 0.75, BOOT_CHARGES = 3, BOOT_S = 6;
  const FIRST_WAVE_S = 60, NEXT_WAVE_S = 30;   // seconds to prepare before the first wave, and between waves
  const RING_S = 3;          // an enemy at the door waits this long before it gets in
  const SWAT_S = 4;          // Grandma's breather between swats
  const STREAK_GAP = 1.6;    // kills closer than this make a splat streak
  const COMBO_WINDOW = 10, COMBO_S = 12;   // act on all three layers within the window: double coins for COMBO_S
  const EYES_TOWER = 1.15, EYES_DIG = 1.3; // the layer on screen works harder

  // ---------- shop ----------
  // base and grow give the price in gems; `at` is the level from which the shop stocks it.
  // Every upgrade gains a rule at its top level (CAPS). An upgrade with one level is a rule already.
  const CATS = [{ id: 'tow', name: '🗼 Towers' }, { id: 'boot', name: '🥾 Castle' }, { id: 'mine', name: '⛏️ Mine' }, { id: 'sky', name: '☁️ Sky' }];
  const ITEMS = [
    { id: 'spicy', cat: 'tow', icon: '🌶️', name: 'Spicy Ammo', max: 5, base: 6, grow: 1.55, at: 2, desc: (l) => `All towers deal +${(l + 1) * 12}% damage.` },
    { id: 'espresso', cat: 'tow', icon: '☕', name: 'Espresso Drip', max: 5, base: 7, grow: 1.55, at: 3, desc: (l) => `All towers fire ${(l + 1) * 8}% faster.` },
    { id: 'stilts', cat: 'tow', icon: '🦒', name: 'Tower Stilts', max: 4, base: 7, grow: 1.6, at: 4, desc: (l) => `All towers see ${(l + 1) * 7}% further.` },
    { id: 'bulk', cat: 'tow', icon: '🧱', name: 'Bulk Bricks', max: 3, base: 9, grow: 1.7, at: 5, desc: (l) => `Building and upgrading costs ${(l + 1) * 7}% less.` },
    { id: 'plans', cat: 'tow', icon: '📐', name: 'Early Plans', max: 3, base: 10, grow: 1.8, at: 3, desc: (l) => `The next ${l + 1} tower type${l ? 's arrive' : ' arrives'} before its time.` },

    { id: 'boots', cat: 'boot', icon: '🥾', name: 'Bigger Boots', max: 5, base: 5, grow: 1.5, at: 2, desc: (l) => `The Boot hits ${(l + 1) * 20}% harder and a little wider.` },
    { id: 'laces', cat: 'boot', icon: '🎀', name: 'Quick Laces', max: 4, base: 6, grow: 1.6, at: 3, desc: (l) => `A stomp comes back ${((l + 1) * 0.7).toFixed(1)} s sooner.` },
    { id: 'pin', cat: 'boot', icon: '🥖', name: 'Rolling Pin', max: 4, base: 6, grow: 1.6, at: 3, desc: (l) => `Grandma needs ${((l + 1) * 0.6).toFixed(1)} s less between swats.` },
    { id: 'walls', cat: 'boot', icon: '🏰', name: 'Thicker Walls', max: 4, base: 6, grow: 1.6, at: 2, desc: (l) => `The castle starts with ${10 + (l + 1) * 2} hearts.` },
    { id: 'piggy', cat: 'boot', icon: '🐷', name: 'Piggy Bank', max: 5, base: 5, grow: 1.5, at: 2, desc: (l) => `Start each level with ${(l + 1) * 20} more coins.` },
    { id: 'bounty', cat: 'boot', icon: '🎯', name: 'Pest Bounty', max: 4, base: 8, grow: 1.6, at: 4, desc: (l) => `Enemies drop ${(l + 1) * 12}% more coins.` },

    { id: 'hire', cat: 'mine', icon: '🐹', name: 'Hire a Hamster', max: 3, base: 9, grow: 1.8, at: 4, desc: (l) => `One more digger. You have ${l + 1}.` },
    { id: 'pick', cat: 'mine', icon: '⛏️', name: 'Sharper Picks', max: 5, base: 6, grow: 1.55, at: 4, desc: (l) => `Digging is ${(l + 1) * 20}% faster.` },
    { id: 'union', cat: 'mine', icon: '🤝', name: 'Union Discount', max: 4, base: 7, grow: 1.6, at: 5, desc: (l) => `Digging costs ${(l + 1) * 12}% less.` },
    { id: 'socks', cat: 'mine', icon: '🧦', name: 'Lucky Socks', max: 4, base: 8, grow: 1.6, at: 5, desc: (l) => `${(l + 1) * 4}% more tiles hide treasure.` },
    { id: 'helmet', cat: 'mine', icon: '⛑️', name: 'Gas Mask', max: 1, base: 9, grow: 1, at: 6, desc: () => 'Stink pockets no longer knock out your hamsters.' },
    { id: 'props', cat: 'mine', icon: '🪵', name: 'Wooden Props', max: 1, base: 10, grow: 1, at: 7, desc: () => 'No more cave-ins.' },
    { id: 'fuse', cat: 'mine', icon: '🧨', name: 'Spare Sticks', max: 3, base: 8, grow: 1.7, at: 9, desc: (l) => `Start each level with ${2 + l + 1} sticks of dynamite.` },

    { id: 'anchors', cat: 'sky', icon: '⚓', name: 'More Anchors', max: 3, base: 6, grow: 1.6, at: 6, desc: (l) => `Anchor ${2 + l + 1} clouds at once.` },
    { id: 'nursery', cat: 'sky', icon: '🐑', name: 'Cloud Nursery', max: 4, base: 7, grow: 1.6, at: 6, desc: (l) => `Puffs arrive ${(l + 1) * 12}% sooner.` },
    { id: 'thunder', cat: 'sky', icon: '⚡', name: 'Thunder Juice', max: 5, base: 7, grow: 1.55, at: 7, desc: (l) => `Lightning deals +${(l + 1) * 25}% damage.` },
    { id: 'sticky', cat: 'sky', icon: '🍯', name: 'Sticky Rain', max: 4, base: 7, grow: 1.6, at: 7, desc: (l) => `Rain slows enemies by ${35 + (l + 1) * 7}%.` },
    { id: 'fluffy', cat: 'sky', icon: '☁️', name: 'Fluffier Clouds', max: 3, base: 8, grow: 1.7, at: 8, desc: (l) => `Every shadow is ${(l + 1) * 10}% wider.` },
    { id: 'spy', cat: 'sky', icon: '🔭', name: 'Spy Cloud', max: 1, base: 12, grow: 1, at: 8, desc: () => 'Clouds see through the soil: the tiles under a shadow show what they hide.' },
  ];
  const CAPS = {
    spicy: ['Ghost Pepper', 'A kill bursts and burns the enemies next to it.'],
    espresso: ['Jitters', 'One shot in eight fires twice.'],
    stilts: ['Lookout', 'A tower on a hill sees half as far again.'],
    bulk: ['Return Policy', 'Selling a tower refunds all of it.'],
    plans: ['Master Builder', 'New towers are built at level 2.'],
    boots: ['Steel Toecaps', 'A stomp also stuns for a second and a half.'],
    laces: ['Double Knot', 'The Boot holds a fourth stomp.'],
    pin: ['Grandma\'s Revenge', 'A swat hits everyone on the doorstep.'],
    walls: ['Welcome Mat', 'The doorbell waits two seconds longer.'],
    piggy: ['Pork Belly', 'Each wave pays 5% interest on your coins, up to 25.'],
    bounty: ['Tax Collector', 'A boss or a sapper drops a gem.'],
    hire: ['Night Shift', 'Hamsters dig at full speed while you look elsewhere.'],
    pick: ['Diamond Tips', 'Hard rock digs like stone.'],
    union: ['Loyalty Card', 'Every fifth dig is free.'],
    socks: ['Four-Leaf Sock', 'A loose gem is worth double and waits twice as long.'],
    fuse: ['Rubber Chicken Fuse', 'A blast leaves all the loot whole.'],
    anchors: ['Clothes Pegs', 'An anchored cloud lasts half as long again.'],
    nursery: ['Golden Fleece', 'Every fourth puff is golden.'],
    thunder: ['Fork Lightning', 'Each bolt jumps to a second enemy.'],
    sticky: ['Treacle', 'The slow lingers for two seconds after the rain.'],
    fluffy: ['Cumulonimbus', 'A merged cloud is born big.'],
  };
  const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
  for (const it of ITEMS) if (CAPS[it.id]) it.cap = CAPS[it.id];
  // Items of the first version that are gone or have a new price: a saved run gets all its gems back once.
  const OLD_PRICES = { t_ice: [10, 1], t_mortar: [16, 1], t_tesla: [24, 1], spicy: [8, 1.6], stilts: [8, 1.6], espresso: [9, 1.6], bulk: [10, 1.7], refund: [7, 1],
    mole: [12, 1.8], pick: [7, 1.6], union: [8, 1.7], detector: [9, 1], helmet: [10, 1], supports: [10, 1], socks: [9, 1.7], bait: [9, 1.8], wind: [14, 1],
    spyglass: [12, 1], fluffy: [7, 1.6], puddle: [7, 1.6], thunder: [9, 1.6], sticky: [8, 1.6], tan: [9, 1.7], walls: [7, 1.6], piggy: [6, 1.5], bounty: [9, 1.6],
    polisher: [11, 1.8], hurry: [6, 1.7], moat: [12, 1.7] };

  // ---------- relics ----------
  // A relic changes a rule for the rest of the run. One of three after each boss, and one for the Mother Lode.
  const RELICS = [
    { id: 'crown', icon: '👑', name: 'Tiny Crown', desc: 'At most five towers, and each one deals double damage.' },
    { id: 'horseshoe', icon: '🧲', name: 'Lucky Horseshoe', desc: 'Every seventh kill pays seven times its coins.' },
    { id: 'acid', icon: '🧪', name: 'Acid Rain', desc: 'Rain burns enemies but no longer slows them.' },
    { id: 'shovel', icon: '🥄', name: 'Golden Shovel', desc: 'The first three digs of a level are free and instant.' },
    { id: 'cuckoo', icon: '🕰️', name: 'Cuckoo Clock', desc: 'Calling a wave early pays three times as much.' },
    { id: 'rod', icon: '📡', name: 'Lightning Rod', desc: 'Every bolt strikes twice.' },
    { id: 'pouch', icon: '👝', name: 'Bottomless Pouch', desc: 'Loot counts the moment it is dug. No carrying.' },
    { id: 'bigboot', icon: '👢', name: 'Clown Shoe', desc: 'The Boot is half as wide again, but holds one stomp fewer.' },
    { id: 'vane', icon: '🐓', name: 'Weather Vane', desc: 'Clouds never drift.' },
    { id: 'roots', icon: '🌩️', name: 'Copper Roots', desc: 'A storm with nobody to hit digs twice as often, and it costs no bolts.' },
    { id: 'seismic', icon: '🦶', name: 'Seismic Boot', desc: 'A stomp cheers every hamster on, and now and then shakes a gem loose.' },
    { id: 'twostep', icon: '🪞', name: 'Two-Step', desc: 'The Strata Combo needs only two layers, but lasts half as long.' },
    { id: 'lamp', icon: '🔦', name: 'Miner\'s Lamp', desc: 'Dirt next to a tunnel glints when it hides treasure.' },
  ];
  const RELIC_BY_ID = Object.fromEntries(RELICS.map((r) => [r.id, r]));

  // ---------- dares ----------
  // Gnorman offers one dare per shop visit. It is free; done pays gems. `from` is the first level that can have it.
  const DARES = [
    { id: 'barefoot', from: 2, text: 'Barefoot: clear the level without one stomp of the Boot.', ok: () => G.stompN === 0 },
    { id: 'diet', from: 3, text: 'Tower Diet: build at most four towers.', ok: () => G.builtN <= 4 },
    { id: 'early', from: 2, text: 'Early Bird: send every wave before its timer runs out.', ok: () => G.early >= G.waves.length },
    { id: 'dayoff', from: 4, text: 'Grandma\'s Day Off: no swats, and lose at most two hearts.', ok: () => G.swatN === 0 && G.leaks <= 2 },
    { id: 'sweep', from: 4, text: 'Clean Sweep: dig ten tiles and never uncover a danger.', ok: () => G.digs >= 10 && G.hazN === 0 },
    { id: 'pilot', from: 6, text: 'Sky Pilot: finish eight enemies with lightning.', ok: () => G.boltKills >= 8 },
    { id: 'tango', from: 8, text: 'Triple Tango: start three Strata Combos.', ok: () => G.combos >= 3 },
  ];
  const DARE_BY_ID = Object.fromEntries(DARES.map((d) => [d.id, d]));
  const dareGems = (n) => 4 + Math.floor(n / 4);

  // ---------- run / save ----------
  let run = null;
  const lv = (id) => (run && run.up[id]) || 0;
  const capped = (id) => lv(id) >= ITEM_BY_ID[id].max;
  const has = (id) => !!run && run.relics.includes(id);
  function newRun() { return { v: 2, level: 1, gems: 0, up: {}, relics: [], bp: 0, heat: 0, stars: 0, score: 0 }; }
  function saveRun() { if (run) store.set(SAVE_KEY, run); }
  function loadRun() {
    const r = store.get(SAVE_KEY, null);
    if (!r || typeof r.level !== 'number') return null;
    r.up = r.up || {}; r.gems = r.gems || 0; r.score = r.score || 0;
    // older saves do not have these fields
    r.relics = r.relics || []; r.bp = r.bp || 0; r.heat = r.heat || 0; r.stars = r.stars || 0;
    if (r.v !== 2) { // a run of the first version: its upgrades are sold back at the price that was paid
      for (const [id, n] of Object.entries(r.up)) { const p = OLD_PRICES[id]; if (p) for (let l = 0; l < n; l++) r.gems += Math.round(p[0] * Math.pow(p[1], l)); }
      r.up = {}; r.v = 2; r.refunded = true;
    }
    return r;
  }
  let best = store.get(BEST_KEY, { level: 0 });
  function recordBest() { if (run.level > best.level) { best = { level: run.level }; store.set(BEST_KEY, best); } }
  // meta outlives a run: the recipes that the player has found, and totals
  const meta = Object.assign({ recipes: {}, runs: 0, kills: 0, seen: {}, foes: {}, built: {}, letters: [], chapter: 0, eggs: {} }, store.get(META_KEY, {}));
  const saveMeta = () => store.set(META_KEY, meta);

  const unlocked = (it) => (run ? run.level : 1) >= it.at;
  function itemCost(it) {
    const h = run.haggle, f = h && h.id === it.id && h.at === run.level ? h.f : 1; // a haggled price holds for one visit
    return Math.max(1, Math.round(it.base * Math.pow(it.grow, lv(it.id)) * f));
  }
  function itemState(it) {
    if (lv(it.id) >= it.max) return 'max';
    return run.gems >= itemCost(it) ? 'ok' : 'poor';
  }
  function buy(it) {
    if (itemState(it) !== 'ok') { sfx.nope(); quip(lv(it.id) >= it.max ? 'maxed' : 'nope'); return false; }
    run.gems -= itemCost(it); run.up[it.id] = lv(it.id) + 1;
    sfx.buy(); saveRun();
    if (it.cap && lv(it.id) >= it.max) { shopMsg = `★ ${it.cap[0]}! ${it.cap[1]}`; quip('buyCap'); } else { shopMsg = ''; quip('buy'); }
    return true;
  }
  // towers arrive by level; Early Plans and blueprints bring the next ones forward
  function towerUnlocked(k) {
    const level = run ? run.level : 1;
    if (level >= TOWERS[k].from) return true;
    const early = TOWER_ORDER.filter((t) => TOWERS[t].from > level).slice(0, lv('plans') + (run ? run.bp : 0));
    return early.includes(k);
  }

  // ---------- the keeper ----------
  const QUIPS = { potWin: ['Something grew. I take no credit. I take a small fee.', 'A good pot. I repotted it myself. Do not ask when.'], potSlug: ['A slug. He lives there. He pays rent, which is more than you did.', 'Empty, apart from the slug. He says hello.'],
    open: ['Welcome to Gnome Depot. I have not moved. You cannot prove otherwise.'], buy: ['Sold. No refunds. I do not bend at the waist.'],
    nope: ['You cannot afford that. I checked. Without moving.'], maxed: ['That is as good as it gets. Like me.'], over: ['The castle fell. I saw nothing. I was facing the hedge.'] };
  function keeperLine(key, n) {
    const list = (KEEPER.lines && KEEPER.lines[key]) || QUIPS[key];
    if (!list || !list.length) return '';
    return pick(list).replace('{n}', n == null ? '' : n);
  }
  let shopQuip = '', shopMsg = '';
  function quip(key, n) { const s = keeperLine(key, n); if (s) shopQuip = s; }
  let gnomeUrl = [];
  function gnomeImg(mood = 0) { // the gnome as an image for the HTML screens
    if (!gnomeUrl[mood]) { try { gnomeUrl[mood] = art('gnome', { mood }).cv.toDataURL(); } catch (e) { gnomeUrl[mood] = ''; } }
    return gnomeUrl[mood] ? `<img class="gnome" src="${gnomeUrl[mood]}" alt="">` : '<span class="snail">🧙</span>';
  }
  const keeperBubble = (text, mood) => (text ? `<div class="keeper">${gnomeImg(mood)}<div class="bubble">${text}</div></div>` : '');

  // ---------- derived numbers ----------
  const hpMul = (n) => (1 + 0.12 * (n - 1) + 0.014 * (n - 1) * (n - 1)) * Math.pow(1.06, Math.max(0, n - CAMPAIGN)) * Math.pow(1.08, run.level >= FROM.heat ? run.heat : 0);
  const coinMul = () => (1 + 0.03 * (run.level - 1)) * (1 + 0.12 * lv('bounty'));
  const costMul = () => 1 - 0.07 * lv('bulk');
  const buildCost = (k) => Math.round(TOWERS[k].cost * costMul());
  const upgradeCost = (t) => Math.round(TOWERS[t.k].cost * 0.9 * t.lvl * costMul());
  const sellValue = (t) => Math.round(t.spent * (capped('bulk') ? 1 : 0.7));
  const towerDmg = (t) => TOWERS[t.k].dmg * Math.pow(1.6, t.lvl - 1) * (1 + 0.12 * lv('spicy')) * (1 + G.urnDmg) * (t.crystal ? 1.25 : 1) * (has('crown') ? 2 : 1);
  const towerRange = (t) => TOWERS[t.k].range * (1 + 0.12 * (t.lvl - 1)) * (1 + 0.07 * lv('stilts')) * (t.hill ? (capped('stilts') ? 1.5 : 1.15) : 1);
  const bootDmg = () => (26 + 5 * G.n) * (1 + 0.2 * lv('boots'));
  const bootR = () => BOOT_R * (1 + 0.05 * lv('boots')) * (has('bigboot') ? 1.5 : 1);
  const bootMax = () => BOOT_CHARGES + (capped('laces') ? 1 : 0) - (has('bigboot') ? 1 : 0);
  const bootS = () => BOOT_S - 0.7 * lv('laces');
  const swatS = () => SWAT_S - 0.6 * lv('pin');
  const ringS = () => RING_S + (capped('walls') ? 2 : 0);
  const digCost = (t) => (G.freeDigs > 0 || (capped('union') && G.digOrders % 5 === 4) ? 0 : Math.round((8 + 3 * t.far) * (1 - 0.12 * lv('union'))));
  const digTime = (t) => (capped('pick') && t.hard === 4 ? 3 : t.hard) * 2.4 / (1 + 0.2 * lv('pick'));
  const boltDmg = () => (22 + 4 * G.n) * (1 + 0.25 * lv('thunder'));
  const rainSlow = () => 0.35 + 0.07 * lv('sticky');
  const cloudR = (c) => CLOUDS[c.t].r * (c.big ? 1.5 : 1) * (1 + 0.1 * lv('fluffy'));
  const anchorMax = () => 2 + lv('anchors');
  const puffS = () => PUFF_S / (1 + 0.12 * lv('nursery'));
  const GEM_RATE = 25, GEM_CAP = 8; // leftover coins for one gem, and the most gems that they can become

  // ---------- geometry ----------
  // world -> view units. cam.x is the pan; view.dy is the slide of a layer during a switch.
  const cam = { x: 0, vx: 0 };
  const view = { dy: 0 };
  const mapLeft = () => VW / 2 - MAP_W / 2 - cam.x;
  function toScreen(wx, wy, z = 0) {
    return { x: mapLeft() + ORIGIN_X + (wx - wy) * HW, y: MAP_Y + ORIGIN_Y + (wx + wy) * HH - z * ZU + view.dy };
  }
  function toWorld(sx, sy, z = 0) {
    const a = (sx - mapLeft() - ORIGIN_X) / HW, b = (sy - MAP_Y - ORIGIN_Y + z * ZU) / HH;
    return { wx: (b + a) / 2, wy: (b - a) / 2 };
  }
  // projection inside a layer cache
  const PC = (wx, wy, z = 0) => ({ x: ORIGIN_X + (wx - wy) * HW, y: ORIGIN_Y + (wx + wy) * HH - z * ZU });

  // ---------- game state ----------
  let mode = 'menu'; // menu | play | pause | shop | tally | relic | over | victory
  let G = null;
  let speed = 1;
  let summary = null;          // the result of the last level, for the results screen and the shop
  const cacheDirty = { sky: true, ground: true, dig: true };
  const groundAt = (i, j) => (inMap(i, j) ? G.map[j * N + i] : null);
  const tileAt = (i, j) => (inMap(i, j) ? G.ug[j * N + i] : null);

  // ---------- level setup ----------
  function levelMap(n) {
    const base = LV.maps[(n - 1) % LV.maps.length], flip = Math.floor((n - 1) / LV.maps.length) % 2 === 1;
    const f = ([i, j]) => (flip ? [j, i] : [i, j]);
    const m = { path: base.path.map(f), hut: f(base.hut) };
    for (const k of ['water', 'rock', 'hill', 'tree']) m[k] = (base[k] || []).map(f);
    return m;
  }
  function genWaves(n) {
    const nw = Math.min(3 + Math.floor(n / 2), 8);
    const waves = [];
    for (let w = 0; w < nw; w++) {
      const pool = ['rat', 'snail'];
      if (n >= 4) pool.push('beetle');
      if (n >= 6) pool.push('frog');
      if (n >= 13) pool.push('hedgehog');
      const air = [];
      if (n >= 2 && (w >= nw - 1 || (n >= 3 && w >= 1))) air.push('balloon');
      if (n >= 7) air.push('duck');
      let budget = 5 + n * 2.5 + w * 3.5 + w * n * 0.45;
      const main = pick(pool);
      const airShare = air.length ? Math.min(0.3, 0.08 + n * 0.014) : 0;
      const list = [];
      while (budget > 0) {
        const r = Math.random();
        const t = r < airShare ? pick(air) : r < 0.7 ? main : pick(pool);
        list.push(t); budget -= FOES[t].cost;
      }
      if (n === 2 && w === nw - 1 && !list.includes('balloon')) list.push('balloon', 'balloon');
      if (n >= FROM.sapper && w > 0 && (w % 2 === 1 || n >= 16)) for (let k = 0; k < 1 + Math.floor((n - FROM.sapper) / 8); k++) list.splice(1 + ((Math.random() * list.length) | 0), 0, 'sapper');
      const boss = BOSS_AT[n] || (n > CAMPAIGN && n % 5 === 0 ? ['hen', 'tyrant', 'goose'][(n / 5) % 3] : null);
      if (boss && w === nw - 1) list.push(boss);
      if (MINI_AT[n] && w === nw - 1) for (let k = 0; k < MINI_AT[n]; k++) list.push('king');
      if (n >= FROM.twist && w > 0 && w < nw - 1 && Math.random() < 0.3) list.twist = pick(Object.keys(TWISTS));
      waves.push(list);
    }
    return waves;
  }
  function weighted(far) {
    const opts = Object.entries(LOOT).filter(([k, v]) => !(v.far > far) && !(k === 'dynamite' && G.n < FROM.dynamite));
    let total = 0; for (const [, v] of opts) total += v.w;
    let r = Math.random() * total;
    for (const [k, v] of opts) { r -= v.w; if (r <= 0) return k; }
    return opts[0][0];
  }
  function genMine() {
    const hi = G.hut.i, hj = G.hut.j, ug = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const far = Math.max(Math.abs(i - hi), Math.abs(j - hj)), depth = far + Math.random() * 1.4;
      const hard = depth < 2.4 ? 1 : depth < 4.2 ? 2 : depth < 6 ? 3 : 4;
      let content = null;
      const roll = Math.random(), hazP = far < 2 ? 0 : 0.07 + 0.02 * far, treP = 0.2 + 0.02 * far + 0.04 * lv('socks');
      if (roll < hazP) { const h = Math.random(); content = h < 0.36 ? 'gas' : h < 0.7 ? 'cave' : 'nest'; }
      else if (roll < hazP + treP) content = weighted(far);
      ug.push({ i, j, far, hard, content, dug: false, known: false, queued: false, prog: 0, seed: ART.hash(i * 13 + j * 101 + G.n * 7), drop: null });
    }
    G.ug = ug;
    const s = tileAt(hi, hj); s.dug = true; s.content = null;
    // the Mother Lode: a chest in the corner that is farthest from the shaft, in hard rock
    if (G.n >= FROM.lode) {
      let bestT = null;
      for (const t of ug) if (!bestT || t.far + t.seed > bestT.far + bestT.seed) bestT = t;
      bestT.content = 'lode'; bestT.hard = 4; G.lode = bestT;
    }
    // resonance crystals: under grass tiles, a few steps from the shaft
    if (G.n >= FROM.crystal) {
      const spots = shuffle(ug.filter((t) => t.far >= 2 && t.far <= 5 && !t.content && groundAt(t.i, t.j).t === 'grass' && !groundAt(t.i, t.j).obj));
      for (const t of spots.slice(0, 2 + (G.n > 15 ? 1 : 0))) t.content = 'crystal';
    }
    revealAround(s);
  }
  const isHazard = (t) => !!t && !t.dug && !!HAZARDS[t.content];
  // the number on a dug tile: the dangers in the eight tiles around it
  function dangerCount(t) {
    let n = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && isHazard(tileAt(t.i + di, t.j + dj))) n++;
    return n;
  }

  function startLevel() {
    const n = run.level, m = levelMap(n);
    const map = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) map.push({ i, j, t: 'grass', z: 0, seed: ART.hash(i * 31 + j * 7 + n * 3), obj: null, hill: false });
    G = { n, name: LV.names[(n - 1) % LV.names.length], map };
    for (const [i, j] of m.water) { const g = groundAt(i, j); g.t = 'water'; g.z = -0.18; }
    for (const [i, j] of m.rock) { const g = groundAt(i, j); g.t = 'rock'; g.z = 0.32; }
    for (const [i, j] of m.hill) { const g = groundAt(i, j); g.z = 0.16; g.hill = true; }
    for (const [i, j] of m.tree) groundAt(i, j).obj = 'tree';
    // the path: corners -> cells and a route of tile centres
    const route = m.path.map(([i, j]) => ({ x: i + 0.5, y: j + 0.5 }));
    for (let k = 1; k < m.path.length; k++) {
      let [i0, j0] = m.path[k - 1]; const [i1, j1] = m.path[k];
      const di = Math.sign(i1 - i0), dj = Math.sign(j1 - j0);
      for (;;) { const g = groundAt(i0, j0); if (g) { g.t = 'path'; g.z = 0; g.hill = false; g.obj = null; } if (i0 === i1 && j0 === j1) break; i0 += di; j0 += dj; }
    }
    const cum = [0];
    for (let k = 1; k < route.length; k++) cum.push(cum[k - 1] + dist(route[k].x, route[k].y, route[k - 1].x, route[k - 1].y));
    const [ci, cj] = m.path[m.path.length - 1], [hi, hj] = m.hut;
    groundAt(ci, cj).obj = 'castle'; groundAt(hi, hj).obj = 'hut'; groundAt(hi, hj).z = 0; groundAt(hi, hj).hill = false;
    const maxHearts = 10 + 2 * lv('walls');
    Object.assign(G, {
      route, cum, len: cum[cum.length - 1], castle: { i: ci, j: cj, x: ci + 0.5, y: cj + 0.5 }, hut: { i: hi, j: hj, x: hi + 0.5, y: hj + 0.5 },
      start: route[0], ug: null, lode: null,
      towers: [], enemies: [], shots: [], parts: [], texts: [], bolts: [], peels: [], puddles: [], eggs: [], pits: [], stomps: [],
      hamsters: [], orders: [], gems: [], sticks: [], clouds: [],
      coins: 90 + 15 * (n - 1) + 20 * lv('piggy'), hearts: maxHearts, maxHearts, loot: 0, kills: 0, leaks: 0, digs: 0, digOrders: 0, lodeFound: false,
      waves: genWaves(n), waveIdx: 0, spawnQ: [], spawnT: 0, countdown: FIRST_WAVE_S + (n === 1 ? 15 : 0), early: 0,
      boot: { n: 0, t: 0 }, swatT: 0, doorT: 0, bellT: 0,
      streak: { n: 0, t: 0 }, act: { sky: -99, ground: -99, dig: -99 }, combo: 0, combos: 0, killCount: 0,
      urnDmg: 0, freeDigs: has('shovel') ? 3 : 0, mush: false, dyn: n >= FROM.dynamite ? 2 + lv('fuse') : 0, armed: false,
      wind: pick(DIRS), puffT: 3, puffN: 0, anchors: 0,
      layer: 'ground', trans: null, visited: { sky: 0, ground: 0, dig: 0 }, used: { sky: false, dig: false },
      time: 0, banner: LORE.chapters && LORE.chapters[n - 1] ? 10 : 5, clearT: -1, shake: 0, flash: 0, sel: null, heckled: {}, heckle: null, idleT: 0, thinkT: 0, digSfx: 0, toast: null,
      bubbles: [], barkT: 3, voiceT: {}, letter: null, letterFound: false, idleSay: 20,
      geysers: [], kettle: 0, stompN: 0, swatN: 0, builtN: 0, hazN: 0, boltKills: 0, lucky: 0, links: 0, lastL: '', comboMul: 2, chalk: false, banner2: null, barNote: null, bossDown: null, sapperSeen: false, fxLayer: null, drag: null, spyT: 0,
    });
    G.boot.n = bootMax();
    { const a = route[route.length - 2], b = route[route.length - 1]; G.castle.flip = a.y === b.y && a.x > b.x ? true : false; G.castle.back = a.x < b.x || a.y < b.y; }
    genMine();
    // worms from below join the path at the point that is closest to the mine hut
    let bestD = 0, bestDist = 1e9;
    for (let d = 0; d <= G.len; d += 0.1) { const p = routeAt(d); const q = dist(p.x, p.y, G.hut.x, G.hut.y); if (q < bestDist) { bestDist = q; bestD = d; } }
    G.joinD = bestD;
    for (let k = 0; k < 1 + lv('hire'); k++) G.hamsters.push({ i: hi, j: hj, x: G.hut.x + (k - lv('hire') / 2) * 0.16, y: G.hut.y + 0.1, state: 'idle', route: [], order: null, pack: [], daze: 0, cheer: 0, fx: 1, fy: 0, seed: k });
    cam.x = 0; cam.vx = 0; view.dy = 0;
    for (const k of LAYERS) cacheDirty[k] = true;
    G.banner0 = G.banner; if (n > meta.chapter) { meta.chapter = n; saveMeta(); }
    mode = 'play'; hideOverlay(); closePop(); pauseBtn.style.display = 'block';
    A.fever(false); A.rush(99); A.streak(0); A.tune(n); A.layer('ground'); A.music(BOSS_AT[n] ? 2 : 1);
  }
  function routeAt(d) {
    d = clamp(d, 0, G.len);
    let k = 1; while (k < G.cum.length - 1 && G.cum[k] < d) k++;
    const a = G.route[k - 1], b = G.route[k], seg = G.cum[k] - G.cum[k - 1], f = seg ? (d - G.cum[k - 1]) / seg : 0;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, fx: Math.sign(b.x - a.x), fy: Math.sign(b.y - a.y) };
  }
  // the route distance that is closest to a world point
  function nearestD(x, y) {
    let bd = 0, bq = 1e9;
    for (let d = 0; d <= G.len; d += 0.25) { const p = routeAt(d), q = dist(p.x, p.y, x, y); if (q < bq) { bq = q; bd = d; } }
    return bd;
  }

  // ---------- effects ----------
  function burst(x, y, z, color, n = 8, sp = 2.2) {
    for (let k = 0; k < n && G.parts.length < 220; k++) { const a = rand(0, 6.28), v = rand(sp * 0.3, sp); G.parts.push({ x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rand(1, 3.2), t: rand(0.3, 0.6), c: color, s: rand(2, 4), layer: G.fxLayer || 'ground' }); }
  }
  function ring(x, y, z, r, color) { G.parts.push({ x, y, z, ring: r, t: 0.35, T: 0.35, c: color, layer: G.fxLayer || 'ground' }); }
  // floating text at a world point of a layer; `big` is for moments
  function say(x, y, z, s, c = '#ffffff', big = false) { if (G.texts.length > 14) G.texts.shift(); G.texts.push({ x, y, z, s, c, t: big ? 2.2 : 1.4, T: big ? 2.2 : 1.4, big, layer: G.fxLayer || 'ground' }); }
  // speech bubbles: a short line over a head, a few at a time, never in the way
  function bubble(x, y, z, s, o) {
    if (!s || !G) return;
    if (G.bubbles.length > 3) G.bubbles.shift();
    G.bubbles.push(Object.assign({ x, y, z, s: String(s), t: 2.4, T: 2.4, layer: G.fxLayer || 'ground' }, o));
  }
  function bark(e, ev, chance = 1) {
    const list = VO.barks && VO.barks[e.k] && VO.barks[e.k][ev];
    if (!list || !list.length || G.time < G.barkT || Math.random() > chance) return;
    G.barkT = G.time + 2.2;
    bubble(e.x, e.y, e.z + 0.75, pick(list), { e, layer: e.state === 'under' || e.state === 'tunnel' ? 'dig' : 'ground' });
  }
  // the home side talks too: who is 'grandma', 'hamsters', 'boot' or 'towers'
  function voice(who, ev, x, y, z, chance = 1, layer = 'ground') {
    const set = VO[who], list = Array.isArray(set) ? set : set && set[ev];
    if (!list || !list.length || Math.random() > chance || G.time < (G.voiceT[who] || 0)) return;
    G.voiceT[who] = G.time + 3.5;
    onLayer(layer, () => bubble(x, y, z, pick(list), { home: true }));
  }
  const grandma = (ev, chance) => voice('grandma', ev, G.castle.x, G.castle.y, 1.9, chance);
  function bossSay(e, ev) {
    const b = VO.boss && VO.boss[e.k], list = b && b[ev];
    if (!list || !list.length) return;
    bubble(e.x, e.y, e.z + 1.5, pick(list), { e, t: 4, T: 4, boss: true });
  }
  function shake(v) { G.shake = Math.min(14, Math.max(G.shake, v)); }
  // runs fn with effects sent to another layer than the ground
  function onLayer(layer, fn) { const prev = G.fxLayer; G.fxLayer = layer; try { fn(); } finally { G.fxLayer = prev; } }
  // the gnome's bubble during play: once per id and level
  function heckle(id, n) {
    if (G.heckled[id] || (G.heckle && G.heckle.t > 0)) return;
    const s = keeperLine(id, n); if (!s) return;
    G.heckled[id] = true; G.heckle = { text: s, t: 4.5 };
  }
  function toast(text) { G.toast = { text, t: 3.2 }; }
  // an action on a layer; three layers within the window start the combo
  function mark(layer) {
    G.idleT = 0; G.act[layer] = G.time;
    if (layer !== 'ground') G.used[layer] = true;
    if (G.n < FROM.combo) return;
    if (G.combo > 0) { // the relay: during a combo every hop to another layer is a link
      if (layer === G.lastL) return;
      G.lastL = layer; G.links++;
      if (G.comboLeft > 0) { const add = Math.min(2, G.comboLeft, comboS() - G.combo); G.combo += add; G.comboLeft -= add; } // a combo can be stretched to twice its length, no more
      const mul = Math.min(4, 2 + Math.floor(G.links / 2));
      if (mul > G.comboMul) { G.comboMul = mul; G.banner2 = { text: `COMBO ×${mul}`, sub: 'keep hopping between layers', t: 1.4 }; sfx.combo(mul); }
      if (G.links % 6 === 0) quake();
      return;
    }
    if (G.time < (G.comboCd || 0)) { G.act[layer] = -99; return; } // the layers need a breather between combos
    const need = has('twostep') ? 2 : 3;
    if (LAYERS.filter((l) => G.time - G.act[l] <= COMBO_WINDOW).length >= need) {
      G.combo = comboS(); G.comboLeft = comboS(); G.combos++; G.links = 0; G.lastL = layer; G.comboMul = 2; A.fever(true); sfx.combo(Math.min(3, G.combos));
      G.banner2 = { text: 'STRATA COMBO!', sub: 'double coins. Hop layers for more', t: 2 }; heckle('hCombo');
      for (const l of LAYERS) G.act[l] = -99;
    }
  }
  const comboS = () => COMBO_S * (has('twostep') ? 0.5 : 1);
  // six links in one combo: everything shakes at once
  function quake() {
    G.banner2 = { text: 'STRATA QUAKE!', sub: '', t: 2.2 }; sfx.boom(); shake(14); G.flash = 0.4; buzz(90);
    G.boot.n = bootMax(); G.boot.t = 0;
    for (const e of G.enemies) if (!e.dead && !e.fly && !hidden(e)) { e.stun = Math.max(e.stun, e.F.boss ? 0.5 : 1.6); hurt(e, bootDmg(), { splash: true }); }
    for (const h of G.hamsters) if (h.state === 'dig' && h.order) finishDig(h.order, h);
    for (const c of G.clouds) if (CLOUDS[c.t].bolts) strike(c);
  }

  // ---------- enemies ----------
  function spawnFoe(k, extra) {
    // each wave of a level is a little tougher than the one before
    const F = FOES[k], hp = F.hp * hpMul(G.n) * (1 + 0.12 * Math.max(0, G.waveIdx - 1)) * (F.boss && G.n > CAMPAIGN ? 1 + (G.n - CAMPAIGN) * 0.06 : 1);
    const e = Object.assign({
      k, F, hp, maxhp: hp, spd: F.spd * rand(0.94, 1.06), armor: (F.armor || 0) * (1 + 0.04 * (G.n - 1)), fly: !!F.fly,
      d: 0, x: G.start.x, y: G.start.y, z: F.fly ? FLY_Z + rand(-0.15, 0.15) : 0, fx: 1, fy: 0, state: 'walk',
      slowT: 0, slowA: 0, stun: 0, flash: 0, hearts: F.hearts || 1, wob: rand(0, 6), dead: false, chill: 0, vuln: 0, flip: 0, curl: 0, wet: 0, taps: 0, t: 0,
    }, extra || {});
    if (e.fly) e.len = G.len; // flyers follow the path, high above it
    if (k === 'sapper') e.diveD = G.len * rand(0.22, 0.4);
    if (k === 'hen') e.layT = 4;
    if (k === 'goose') e.layT = 5;
    if (k === 'tyrant') e.dives = 0;
    if (k === 'king') { e.gen = e.gen || 0; if (!e.gen) { G.banner2 = { text: 'KING RAT!', sub: 'he splits when he falls', t: 2.4 }; sfx.bossWarn(); } }
    G.enemies.push(e);
    if (!F.boss && !(extra && extra.gen)) bark(e, 'spawn', 0.14);
    if (F.boss) { bossSay(e, 'intro'); grandma('bossArrives', 1);
      G.banner2 = { text: BOSS_NAMES[k].toUpperCase() + '!', sub: (VO.boss && VO.boss[k] && VO.boss[k].title) || 'BOSS', t: 3 }; sfx.bossWarn(); heckle('hBoss'); A.music(2); }
    if (k === 'sapper') G.sapperSeen = true;
    return e;
  }
  const hidden = (e) => e.state === 'under' || e.state === 'tunnel' || e.state === 'fall';
  function remaining(e) {
    if (e.fly) return e.len - e.d;
    if (e.route) return 500 - e.ri;
    return G.len - e.d;
  }
  // o.splash: area damage (a hedgehog curls up); o.bolt: lightning; o.quiet: no flash
  function hurt(e, dmg, o) {
    if (e.dead) return;
    if (e.k === 'hedgehog' && o && o.splash && e.stun <= 0) { if (!(e.curl > 0)) bark(e, 'special', 0.5); e.curl = 2.5; }
    if (e.curl > 0) dmg *= 0.3;
    if (e.vuln > 0) dmg *= 1.5;
    if (o && o.bolt && e.k === 'goose') dmg *= 3;
    const armor = e.flip > 0 ? 0 : e.armor;
    dmg = Math.max(dmg * 0.25, dmg - armor);
    e.hp -= dmg; if (!(o && o.quiet)) e.flash = 0.1;
    if (e.F.boss) sfx.bossHit(); else sfx.foeHit();
    if (e.hp <= 0) { kill(e, o); return; }
    if (e.F.boss && !e.halfSaid && e.hp < e.maxhp * 0.5) { e.halfSaid = true; bossSay(e, 'half'); }
    else if (!e.F.boss && dmg > e.maxhp * 0.25) bark(e, 'hurt', 0.12);
  }
  function kill(e, o) {
    e.dead = true; G.kills++; G.killCount++; meta.kills++; if (G.byBolt) G.boltKills++;
    meta.foes[e.k] = (meta.foes[e.k] || 0) + 1;
    if (e.F.boss) bossSay(e, 'defeat'); else if (e.k === 'balloon' || (e.k === 'king' && e.gen < 2)) bark(e, 'special', 0.6); else if (o && o.boot) bark(e, 'stomped', 0.4);
    let c = Math.max(1, Math.round(e.F.coin * coinMul() * (e.coinK || 1)));
    if (has('horseshoe') && G.killCount % 7 === 0) { c *= 7; say(e.x, e.y, e.z + 0.6, 'LUCKY 7!', '#ffe680'); }
    if (G.combo > 0) c *= G.comboMul;
    G.coins += c;
    const s = G.streak; s.n = s.t > 0 ? s.n + 1 : 1; s.t = STREAK_GAP; A.streak(s.n);
    sfx.foePop(s.n); sfx.coin(s.n);
    if (s.n >= 5 && s.n % 5 === 0) { const bonus = Math.round(s.n * 0.6 * coinMul()); G.coins += bonus; say(e.x, e.y, e.z + 0.8, `SPLAT ×${s.n}  +${bonus}`, '#ffe680', true); }
    const col = FOE_ART.color ? FOE_ART.color(e.k) : '#ffd84a';
    burst(e.x, e.y, e.z + 0.2, col, e.F.boss ? 30 : 7, e.F.boss ? 4 : 2.2); burst(e.x, e.y, e.z + 0.2, '#ffd84a', 3, 1.6);
    if (e.F.boss) { shake(12); G.flash = 0.5; sfx.bossDie(); say(e.x, e.y, e.z + 1, `+${c}`, '#ffd84a', true); G.bossDown = e.k; }
    if ((e.F.boss || e.k === 'sapper') && capped('bounty')) { G.loot++; say(e.x, e.y, e.z + 0.5, '+1 gem', '#8fe6ff'); }
    if (e.wanted) {
      if (o && o.boot) { G.loot++; say(e.x, e.y, e.z + 0.9, 'WANTED! +1 gem', '#8fe6ff', true); sfx.gem(); }
      else say(e.x, e.y, e.z + 0.9, 'Wanted... by a tower. No gem', '#9aa3d6');
    }
    if (e.k === 'king' && e.gen < 2) { // the king falls apart into two smaller kings
      for (const off of [-0.18, 0.18]) {
        const q = spawnFoe('king', { gen: e.gen + 1, d: clamp(e.d + off, 0, G.len - 0.5), stun: 0.5 });
        const p = routeAt(q.d); q.x = p.x; q.y = p.y; q.hp = q.maxhp = e.maxhp * 0.45; q.spd *= 1 + 0.35 * q.gen; q.hearts = 1;
      }
      say(e.x, e.y, 0.9, e.gen ? 'Still more rats!' : 'The king is two kings!', '#ffe680', true);
    }
    if (e.k === 'balloon') { const r = spawnFoe('rat', { d: e.d }); const p = routeAt(r.d); r.x = p.x; r.y = p.y; r.stun = 0.6; r.z = 0; r.drop = e.z; }
    if (capped('spicy') && !(o && o.pepper) && !e.fly) {
      ring(e.x, e.y, 0.1, 0.8, '#ff7a3d');
      for (const q of G.enemies) if (!q.dead && !q.fly && !hidden(q) && q !== e && dist(q.x, q.y, e.x, e.y) < 0.85) hurt(q, e.maxhp * 0.2, { pepper: true });
    }
  }
  function leak(e) {
    bark(e, 'leak', 0.8); if (G.hearts - e.hearts <= 2 && G.hearts - e.hearts > 0) grandma('lastHeart', 1);
    e.dead = true; G.hearts -= e.hearts; G.leaks += e.hearts; shake(9); G.flash = 0.35; sfx.leak(); buzz(60);
    say(G.castle.x, G.castle.y, 1.6, `-${e.hearts}`, '#ff6b6b', true);
    burst(G.castle.x, G.castle.y, 0.6, '#ff6b6b', 12, 3); heckle('hLeak'); kettleCheck();
  }
  // the weather on an enemy: the clouds whose shadow it stands in
  function weatherAt(x, y, out) {
    out.rain = out.snow = out.sun = out.pour = out.blaze = false; out.rainbow = null;
    for (const c of G.clouds) {
      if (CLOUDS[c.t].raw || dist(c.x, c.y, x, y) > cloudR(c)) continue;
      if (c.t === 'rain') { out.rain = true; if (c.gush > 0) out.pour = true; } else if (c.t === 'snow') out.snow = true; else if (c.t === 'sun') { out.sun = true; if (c.gush > 0) out.blaze = true; } else if (c.t === 'rainbow') out.rainbow = c;
    }
    return out;
  }
  const WX = {};
  function updateEnemies(dt) {
    const acid = has('acid');
    for (const e of G.enemies) {
      if (e.dead) continue;
      e.t += dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowA = 0; }
      if (e.vuln > 0) e.vuln -= dt;
      if (e.flip > 0) e.flip -= dt;
      if (e.curl > 0) e.curl -= dt;
      if (e.wet > 0) e.wet -= dt;
      if (e.drop > 0) e.drop = Math.max(0, e.drop - dt * 5);
      if (e.state === 'under') { updateBurrower(e, dt); continue; }
      if (e.state === 'fall') { e.fallT -= dt; if (e.fallT <= 0) { e.state = 'walk'; e.stun = 0.5; burst(e.x, e.y, 0, '#8a5a36', 6); } continue; }
      if (e.state === 'ring') { e.ring -= dt; if (e.ring <= 0) leak(e); continue; }
      const wx = e.state === 'tunnel' ? null : weatherAt(e.x, e.y, WX);
      let slow = e.slowA;
      if (wx) {
        if (wx.rain) { if (acid) hurt(e, (6 + G.n) * dt, { quiet: true }); else { slow = Math.max(slow, wx.pour ? 0.78 : rainSlow()); if (capped('sticky')) e.wet = 2; } }
        if (e.wet > 0 && !acid) slow = Math.max(slow, rainSlow());
        if (wx.snow) slow = Math.max(slow, 0.6);
        if (wx.rainbow && !e.fly && !e.F.boss && e.danced !== wx.rainbow.id) { e.danced = wx.rainbow.id; e.stun = 2; e.dance = 2; }
        if (e.dead) continue;
      }
      if (e.dance > 0) e.dance -= dt;
      if (e.stun > 0) { e.stun -= dt; continue; }
      let v = e.spd * Math.max(0.2, 1 - slow);
      if (e.F.boss) v = e.spd * Math.max(0.6, 1 - slow * 0.5);
      if (e.curl > 0) v *= 1.6;
      if (e.fly) {
        if (e.lost > 0) { e.lost -= dt; v = -v * 0.6; }
        else if (!e.F.boss && (e.lostCd = (e.lostCd || 0) - dt) <= 0) {
          for (const c of G.clouds) if (dist(c.x, c.y, e.x, e.y) < (c.big ? 0.8 : 0.55)) { e.lost = 1.7; e.lostCd = 7; say(e.x, e.y, e.z + 0.6, 'Lost in a cloud', '#ffffff'); if (!CLOUDS[c.t].raw) G.used.sky = true; break; }
        }
        e.d = Math.max(0, e.d + v * dt); v = 0;
        e.d += v * dt;
        const f = Math.min(1, e.d / e.len), p = routeAt(e.d);
        e.x = p.x; e.y = p.y; e.fx = p.fx; e.fy = p.fy;
        if (e.k === 'goose') { e.layT -= dt; if (e.layT <= 0) { e.layT = 6; layEgg(G.len * rand(0.25, 0.8)); sfx.honk(); } }
        if (f >= 1) leak(e);
      } else if (e.route) { // a worm on its way up through the tunnels, then over the grass to the path
        const tgt = e.route[e.ri], ddx = tgt.x - e.x, ddy = tgt.y - e.y, q = Math.hypot(ddx, ddy), step = v * (e.state === 'tunnel' ? 0.8 : 1) * dt;
        if (Math.abs(ddx) > Math.abs(ddy)) { e.fx = Math.sign(ddx); e.fy = 0; } else if (ddy) { e.fy = Math.sign(ddy); e.fx = 0; }
        if (q <= step) {
          e.x = tgt.x; e.y = tgt.y; e.ri++;
          if (e.state === 'tunnel') { const t = tileAt(Math.floor(e.x), Math.floor(e.y)); if (t && t.drop) { t.drop = null; onLayer('dig', () => say(e.x, e.y, DIG_Z + 0.4, 'Munch!', '#ff9a9a')); heckle('hPackLost'); } }
          if (tgt.surface) e.state = 'walk';
          if (e.ri >= e.route.length) { e.route = null; e.d = G.joinD; }
        } else { e.x += ddx / q * step; e.y += ddy / q * step; }
      } else {
        if (e.bowl > 0) { // a curled hedgehog that met the Boot rolls back down the path and bowls the others over
          e.bowl -= dt; e.d = Math.max(0, e.d - 4.5 * dt);
          const bp = routeAt(e.d); e.x = bp.x; e.y = bp.y;
          for (const q of G.enemies) if (q !== e && !q.dead && !q.fly && q.state === 'walk' && !q.route && q.bowled !== e && Math.abs(q.d - e.d) < 0.35) { q.bowled = e; q.stun = Math.max(q.stun, 0.8); q.spin = 0.6; e.strikes++; hurt(q, bootDmg() * 0.8, { boot: true }); }
          if (e.bowl <= 0) { if (e.strikes >= 2) say(e.x, e.y, 0.9, `STRIKE ×${e.strikes}`, '#ffe680', true); e.bowl = 0; }
          continue;
        }
        const g = groundAt(Math.floor(e.x), Math.floor(e.y));
        if (g && g.t === 'mud') v *= 0.7;
        if (e.k === 'frog') { const ph = (e.t * 1.05 + e.wob) % 1; e.air = ph < 0.4; v = e.air ? v * 2.5 : 0; }
        e.d += v * dt;
        const p = routeAt(e.d); e.x = p.x; e.y = p.y; e.fx = p.fx; e.fy = p.fy;
        if (e.k === 'sapper' && e.d >= e.diveD) { dive(e); continue; }
        if (e.k === 'tyrant' && e.dives < 2 && e.hp < e.maxhp * (e.dives ? 0.33 : 0.66)) { e.dives++; dive(e); continue; }
        if (e.k === 'hen') { e.layT -= dt; if (e.layT <= 0) { e.layT = 5; layEgg(e.d - 0.3); sfx.quack(); } }
        if (!e.air) {
          for (const pl of G.peels) if (!pl.gone && pl.land <= 0 && Math.abs(pl.d - e.d) < 0.16) { slip(e, pl); break; }
          for (const pit of G.pits) if (pit.t > 0 && Math.floor(e.x) === pit.i && Math.floor(e.y) === pit.j && e.pit !== pit) {
            e.pit = pit; e.state = 'fall'; e.fallT = 2; hurt(e, e.maxhp * (e.F.boss ? 0.08 : 0.5)); pit.count++;
            say(e.x, e.y, 0.5, 'Aaaah!', '#ffd9b0'); sfx.slip(); break;
          }
        }
        if (e.dead) continue;
        if (e.d >= G.len) { e.state = 'ring'; e.ring = ringS(); G.bellT = 0.5; sfx.bell(); buzz(30); }
      }
    }
    G.enemies = G.enemies.filter((e) => !e.dead);
  }
  function slip(e, pl) {
    pl.gone = true; sfx.slip();
    const targets = [e];
    if (pl.domino) for (const q of G.enemies) if (q !== e && !q.dead && !q.fly && q.state === 'walk' && !q.route && e.d - q.d > 0 && e.d - q.d < 1 && targets.length < 3) targets.push(q);
    for (const q of targets) { q.d = Math.max(0, q.d - (q.F.boss ? 0.4 : 1)); q.stun = q.F.boss ? 0.4 : 0.9; q.spin = 0.9; hurt(q, pl.dmg); }
    say(e.x, e.y, 0.6, targets.length > 1 ? 'Whoops! ×' + targets.length : 'Whoops!', '#ffe680');
  }
  function layEgg(d) {
    d = clamp(d, 0.5, G.len - 1); const p = routeAt(d);
    G.eggs.push({ x: p.x, y: p.y, d, t: 4.5 });
  }
  function updateEggs(dt) {
    for (const g of G.eggs) {
      g.t -= dt;
      if (g.t <= 0 && !g.gone) { g.gone = true; for (let k = 0; k < 2; k++) { const c = spawnFoe('chick', { d: g.d + k * 0.15 }); c.x = g.x; c.y = g.y; } burst(g.x, g.y, 0.2, '#fff4d6', 8); }
    }
    G.eggs = G.eggs.filter((g) => !g.gone);
  }
  function crackEgg(g) {
    g.gone = true; const c = Math.round(5 * coinMul()); G.coins += c;
    say(g.x, g.y, 0.5, `Omelette! +${c}`, '#ffe680'); burst(g.x, g.y, 0.2, '#ffe680', 10); sfx.pop(); mark('ground');
  }

  // ---------- burrowers: sapper moles and the Tunnel Tyrant ----------
  // A burrower is under the grass. Towers cannot hit it. On the ground it is a moving lump; in the mine it can be tapped.
  function dive(e) {
    e.state = 'under'; e.taps = 0; e.underT = 0;
    if (e.k === 'sapper') { e.tx = G.castle.x; e.ty = G.castle.y; sfx.sapper(); heckle('hSapper'); }
    else { e.surfaceD = Math.min(G.len - 1.5, e.d + 5); sfx.sapper(); }
    burst(e.x, e.y, 0, '#8a5a36', 12, 2.5); say(e.x, e.y, 0.6, e.k === 'sapper' ? 'Digging in!' : 'The Tyrant dives!', '#ffb38a');
  }
  function updateBurrower(e, dt) {
    if (e.stun > 0) { e.stun -= dt; return; }
    e.underT += dt;
    if (e.k === 'sapper') {
      const ddx = e.tx - e.x, ddy = e.ty - e.y, q = Math.hypot(ddx, ddy), step = dt / 3;
      if (Math.abs(ddx) > Math.abs(ddy)) { e.fx = Math.sign(ddx); e.fy = 0; } else { e.fy = Math.sign(ddy); e.fx = 0; }
      if (q < 0.3) { // under the castle: the foundations give
        e.dead = true; G.hearts -= 2; G.leaks += 2; shake(10); G.flash = 0.35; sfx.leak();
        say(G.castle.x, G.castle.y, 1.6, 'Sapped! -2', '#ff6b6b', true); kettleCheck(); return;
      }
      e.x += ddx / q * step; e.y += ddy / q * step;
      const t = tileAt(Math.floor(e.x), Math.floor(e.y));
      if (t && !t.dug) { t.dug = true; t.queued = false; if (t.content !== 'lode') t.content = null; else t.dug = false; revealAround(t); cacheDirty.dig = true; }
    } else {
      e.d += dt * 1.1; const p = routeAt(e.d); e.x = p.x; e.y = p.y; e.fx = p.fx; e.fy = p.fy;
      if (e.d >= e.surfaceD) surface(e, false);
    }
  }
  function surface(e, forced) {
    e.state = 'walk'; burst(e.x, e.y, 0, '#8a5a36', 14, 2.6); shake(5);
    if (forced) { e.stun = 4; e.vuln = 4; say(e.x, e.y, 0.9, 'Bonked out!', '#ffe680', true); }
  }
  // a tap in the mine, or the Boot on the lump
  function bonk(e, hard) {
    e.taps += hard ? 99 : 1; e.stun = 0.5; e.flash = 0.12; sfx.bonk(); mark(hard ? 'ground' : 'dig');
    onLayer(hard ? 'ground' : 'dig', () => { burst(e.x, e.y, hard ? 0.1 : DIG_Z + 0.3, '#ffe680', 6); });
    if (e.k === 'sapper' && e.taps >= SAPPER_TAPS) { onLayer(hard ? 'ground' : 'dig', () => kill(e)); }
    else if (e.k === 'tyrant' && e.taps >= TYRANT_TAPS) surface(e, true);
  }

  // ---------- towers ----------
  function findTarget(x, y, range, ground, air) {
    let bestE = null, bestLeft = 1e9;
    for (const e of G.enemies) {
      if (e.dead || hidden(e) || (e.fly ? !air : !ground)) continue;
      if (dist(e.x, e.y, x, y) > range) continue;
      const l = remaining(e); if (l < bestLeft) { bestLeft = l; bestE = e; }
    }
    return bestE;
  }
  // area damage on one level: flyers (true), walkers (false) or both (null)
  function splash(x, y, rad, dmg, slow, fly, o) {
    for (const e of G.enemies) {
      if (e.dead || hidden(e)) continue;
      if (fly !== null && e.fly !== fly) continue;
      if (dist(e.x, e.y, x, y) > rad + e.F.r) continue;
      if (slow) {
        if (!(e.slowT > 0)) bark(e, 'slow', 0.15);
        e.slowA = Math.max(e.slowA, slow); e.slowT = 1.8; e.curl = 0;
        if (o && o.freeze && !e.F.boss) { e.chill++; if (e.chill >= 3) { e.chill = 0; e.stun = 1.5; e.vuln = 1.5; e.frozen = 1.5; } }
      }
      hurt(e, dmg, o);
    }
  }
  function updateTowers(dt) {
    const rateMul = (1 + 0.08 * lv('espresso')) * (G.layer === 'ground' && G.n >= FROM.combo ? EYES_TOWER : 1);
    for (const t of G.towers) {
      const D = TOWERS[t.k];
      t.sunny = weatherAt(t.x, t.y, WX).sun;
      t.cd -= dt * rateMul * (WX.blaze ? 2.6 : t.sunny ? 1.6 : 1);
      if (t.kick > 0) t.kick -= dt;
      if (t.cd > 0) continue;
      const range = towerRange(t), dmg = towerDmg(t);
      if (t.k === 'banana') { // a peel on the path, where walkers enter the range
        const mine = G.peels.filter((p) => p.owner === t && !p.gone).length;
        if (mine >= 1 + t.lvl + (pal(t, 'banana+pea') ? 1 : 0) || !G.enemies.some((e) => !e.fly && !hidden(e))) { t.cd = 0.3; continue; }
        const spots = [];
        for (let d = 0.5; d < G.len - 0.6; d += 0.5) { const p = routeAt(d); if (dist(p.x, p.y, t.x, t.y) <= range && !G.peels.some((q) => !q.gone && Math.abs(q.d - d) < 0.45)) spots.push(d); }
        if (!spots.length) { t.cd = 0.5; continue; }
        const d = spots[Math.min(spots.length - 1, (Math.random() * 3) | 0)], p = routeAt(d);
        G.peels.push({ x: p.x, y: p.y, d, owner: t, dmg, domino: t.lvl >= 3, land: 0.5, fromX: t.x, fromY: t.y });
        t.cd = D.rate * (1 - 0.1 * (t.lvl - 1)); t.kick = 0.15; sfx.peel(); continue;
      }
      const e = findTarget(t.x, t.y, range, D.ground, D.air);
      if (!e) { t.cd = 0.08; continue; }
      t.cd = capped('espresso') && Math.random() < 0.125 ? 0.09 : D.rate * (1 - 0.08 * (t.lvl - 1)); t.kick = 0.12;
      const mz = t.z + ART_MUZZLE(t.k, t.lvl);
      if (t.k === 'pea') {
        t.shots = (t.shots || 0) + 1;
        const bigPea = t.lvl >= 3 && t.shots % 5 === 0;
        G.shots.push({ x: t.x, y: t.y, z: mz, tgt: e, dmg: bigPea ? dmg * 3 : dmg, v: 7, c: pal(t, 'ice+pea') ? '#bdf3ff' : D.color, s: bigPea ? 7 : 3.2, knock: bigPea ? 0.45 : 0, chill: pal(t, 'ice+pea') });
        sfx.pea();
      } else if (t.k === 'kite') {
        G.shots.push({ x: t.x, y: t.y, z: mz, tgt: e, dmg, v: 6.5, c: D.color, s: 4, tangle: t.lvl >= 3, franklin: pal(t, 'kite+tesla') }); sfx.kite();
      } else if (t.k === 'ice') {
        splash(e.x, e.y, D.splash + 0.1 * (t.lvl - 1), dmg, D.slow + 0.05 * (t.lvl - 1), null, { splash: false, freeze: t.lvl >= 3 });
        ring(e.x, e.y, e.z + 0.1, D.splash, '#bdf3ff'); G.bolts.push({ pts: [[t.x, t.y, mz], [e.x, e.y, e.z + 0.2]], t: 0.12, c: '#bdf3ff', straight: true }); sfx.ice();
      } else if (t.k === 'mortar') {
        G.shots.push({ x: t.x, y: t.y, z: mz, x0: t.x, y0: t.y, z0: mz, x1: e.x, y1: e.y, t: 0, T: 0.7, dmg, rad: D.splash + 0.12 * (t.lvl - 1), lob: true, puddle: t.lvl >= 3, zap: pal(t, 'mortar+tesla'), iced: pal(t, 'ice+mortar') }); sfx.mortar();
      } else if (t.k === 'tesla') {
        const hit = [e], pts = [[t.x, t.y, mz], [e.x, e.y, e.z + 0.2]];
        let cur = e;
        for (let j = 1; j < D.chain + (t.lvl >= 3 ? 2 : 0); j++) {
          let nx = null, nd = 1.7;
          for (const o of G.enemies) { if (o.dead || hidden(o) || hit.includes(o)) continue; const q = dist(o.x, o.y, cur.x, cur.y); if (q < nd) { nd = q; nx = o; } }
          if (!nx) break; hit.push(nx); pts.push([nx.x, nx.y, nx.z + 0.2]); cur = nx;
        }
        hit.forEach((o, j) => { if (t.lvl >= 3 && !o.F.boss) o.stun = Math.max(o.stun, 0.25); hurt(o, dmg * Math.pow(0.8, j)); });
        G.bolts.push({ pts, t: 0.16, c: '#cfe0ff' }); sfx.zap();
      }
    }
  }
  const ART_MUZZLE = (k, lvl) => (ART.muzzle ? ART.muzzle(k, lvl) : 0.8 + 0.12 * lvl);
  function updateShots(dt) {
    for (const s of G.shots) {
      if (s.lob) {
        s.t += dt; const f = Math.min(1, s.t / s.T);
        s.x = s.x0 + (s.x1 - s.x0) * f; s.y = s.y0 + (s.y1 - s.y0) * f; s.z = s.z0 * (1 - f) + Math.sin(f * Math.PI) * 1.3;
        if (f >= 1) {
          s.done = true; splash(s.x1, s.y1, s.rad, s.dmg, s.iced ? 0.35 : 0, false, { splash: true });
          if (s.zap) { // Electric Kettle: the landing zaps the two nearest walkers outside the splash
            const near2 = G.enemies.filter((q) => !q.dead && !hidden(q) && dist(q.x, q.y, s.x1, s.y1) < 2.4).sort((a, b) => dist(a.x, a.y, s.x1, s.y1) - dist(b.x, b.y, s.x1, s.y1)).slice(0, 2);
            if (near2.length) { G.bolts.push({ pts: [[s.x1, s.y1, 0.2], ...near2.map((q) => [q.x, q.y, q.z + 0.2])], t: 0.16, c: '#cfe0ff' }); for (const q of near2) hurt(q, s.dmg * 0.5); }
          } ring(s.x1, s.y1, 0.05, s.rad, '#ffb14a'); burst(s.x1, s.y1, 0.1, '#d9a066', 6, 1.8); sfx.splash();
          if (s.puddle) G.puddles.push({ x: s.x1, y: s.y1, r: s.rad * 0.8, t: 2.5, dps: s.dmg * 0.35 });
        }
        continue;
      }
      const e = s.tgt;
      if (e.dead || hidden(e)) { s.done = true; continue; }
      const dx = e.x - s.x, dy = e.y - s.y, dz = e.z + 0.25 - s.z, q = Math.hypot(dx, dy, dz), step = s.v * dt;
      if (q <= step + 0.15) {
        s.done = true; hurt(e, s.dmg);
        if (s.chill && !e.dead) { e.slowA = Math.max(e.slowA, 0.25); e.slowT = Math.max(e.slowT, 1.2); }
        if (s.franklin) { // a kite hit sends a bolt down on the nearest walker
          let w = null, wd = 1.8;
          for (const q of G.enemies) { if (q.dead || q.fly || hidden(q)) continue; const d2 = dist(q.x, q.y, e.x, e.y); if (d2 < wd) { wd = d2; w = q; } }
          if (w) { G.bolts.push({ pts: [[e.x, e.y, e.z], [w.x, w.y, 0.2]], t: 0.18, c: '#fff6a8' }); hurt(w, s.dmg, { bolt: true }); }
        }
        if (s.knock && !e.dead && !e.F.boss && !e.fly && !e.route) { e.d = Math.max(0, e.d - s.knock); e.stun = Math.max(e.stun, 0.25); ring(e.x, e.y, 0.1, 0.4, '#9dff6b'); }
        if (s.tangle) { const o = G.enemies.find((q2) => q2 !== e && !q2.dead && q2.fly && dist(q2.x, q2.y, e.x, e.y) < 1.6); if (o) { hurt(o, s.dmg * 0.7); G.bolts.push({ pts: [[e.x, e.y, e.z], [o.x, o.y, o.z]], t: 0.2, c: '#ff8ad8', straight: true }); } }
      } else { s.x += dx / q * step; s.y += dy / q * step; s.z += dz / q * step; }
    }
    G.shots = G.shots.filter((s) => !s.done);
    for (const p of G.puddles) {
      p.t -= dt;
      for (const e of G.enemies) {
        if (e.dead || e.fly || hidden(e) || dist(e.x, e.y, p.x, p.y) >= p.r) continue;
        if (p.stink) { if (!e.F.boss && !e.route && e.state === 'walk') e.d = Math.max(0, e.d - e.spd * 1.7 * dt); } // nobody walks into that
        else hurt(e, p.dps * dt, { quiet: true });
      }
    }
    G.puddles = G.puddles.filter((p) => p.t > 0);
    for (const p of G.peels) if (p.land > 0) p.land -= dt;
    G.peels = G.peels.filter((p) => !p.gone);
  }
  function refreshPals(announce) {
    for (const t of G.towers) {
      const had = t.pals || {}; t.pals = {};
      if (G.n < FROM.pals) continue;
      for (const o of G.towers) {
        if (o === t || Math.abs(o.i - t.i) + Math.abs(o.j - t.j) !== 1) continue;
        const key = [t.k, o.k].sort().join('+');
        if (!PALS[key]) continue;
        t.pals[key] = o;
        if (announce === t && !had[key]) { say((t.x + o.x) / 2, (t.y + o.y) / 2, 1.5, `♥ ${PALS[key][0]}!`, '#ff9ad8', true); sfx.rainbow(); }
      }
    }
  }
  const pal = (t, key) => !!(t.pals && t.pals[key]);
  function canBuildOn(g) { return g && g.t === 'grass' && !g.obj; }
  function tryBuild(k, i, j) {
    const cost = buildCost(k), g = groundAt(i, j);
    if (!canBuildOn(g) || !towerUnlocked(k) || G.coins < cost) { sfx.nope(); return false; }
    if (has('crown') && G.towers.length >= 5) { sfx.nope(); say(i + 0.5, j + 0.5, 0.8, 'The crown allows five', '#ffe680'); return false; }
    G.coins -= cost;
    const u = tileAt(i, j);
    const t = { k, i, j, x: i + 0.5, y: j + 0.5, z: g.z, lvl: capped('plans') ? 2 : 1, cd: 0.2, spent: cost, kick: 0, born: 0.35, hill: g.hill, crystal: u.content === 'crystal' && !u.dug };
    G.towers.push(t); g.obj = t; refreshPals(t); G.builtN++;
    sfx.build(); burst(t.x, t.y, g.z + 0.2, '#ffffff', 8, 1.8); mark('ground');
    meta.built[k] = (meta.built[k] || 0) + 1; towerSay(t, 0.7);
    if (t.crystal) say(t.x, t.y, 1.4, 'Crystal power! +25%', '#b9a8ff');
    return true;
  }
  function towerSay(t, chance) { const l = VO.towers && VO.towers[t.k]; if (l && l.length && Math.random() < chance) bubble(t.x, t.y, t.z + 1.5, pick(l), { home: true }); }
  function tryUpgrade(t) {
    const cost = upgradeCost(t);
    if (t.lvl >= 3 || G.coins < cost) { sfx.nope(); return false; }
    G.coins -= cost; t.spent += cost; t.lvl++; t.born = 0.35; sfx.upgrade(); ring(t.x, t.y, t.z + 0.3, 0.6, '#ffe680'); mark('ground');
    if (t.lvl === 3) say(t.x, t.y, 1.6, TOWERS[t.k].cap.split(':')[0] + '!', '#ffe680', true); else towerSay(t, 0.5);
    return true;
  }
  function sellTower(t) {
    G.coins += sellValue(t); groundAt(t.i, t.j).obj = null; G.towers.splice(G.towers.indexOf(t), 1); sfx.sell(); refreshPals();
    for (const p of G.peels) if (p.owner === t) p.gone = true;
  }

  // ---------- the Boot ----------
  function stompAt(x, y) {
    if (G.boot.n <= 0) { sfx.nope(); say(x, y, 0.5, 'The Boot is resting', '#c9d0ff'); return false; }
    G.boot.n--; if (G.boot.t <= 0) G.boot.t = bootS();
    G.stomps.push({ x, y, t: BOOT_DELAY }); sfx.stomp(); mark('ground'); G.stompN++;
    if (has('seismic')) { for (const h of G.hamsters) if (h.state === 'dig') h.cheer = 2.5; if (G.n >= FROM.dig && Math.random() < 0.2) { const spots = G.ug.filter((t) => t.dug); const t = pick(spots); G.gems.push({ x: t.i + 0.5, y: t.j + 0.5, t: GEM_ROLL_S * 1.5, wob: rand(0, 6) }); sfx.gemRoll(); } }
    return true;
  }
  function updateBoot(dt) {
    const B = G.boot;
    if (B.n < bootMax()) { B.t -= dt; if (B.t <= 0) { B.n++; B.t = B.n < bootMax() ? bootS() : 0; } }
    for (const s of G.stomps) {
      s.t -= dt;
      if (s.t <= 0 && !s.done) {
        s.done = true; s.show = 0.35;
        const r = bootR(), dmg = bootDmg(); let n = 0;
        for (const e of G.enemies) {
          if (e.dead || e.fly || e.state === 'tunnel' || e.state === 'fall' || dist(e.x, e.y, s.x, s.y) > r + e.F.r) continue;
          if (e.state === 'under') { bonk(e, true); n++; continue; }
          if (e.k === 'frog' && e.air) { say(e.x, e.y, 0.8, 'Missed!', '#9dffb0'); continue; } // a frog in the air is not under the Boot
          if (e.k === 'hedgehog' && e.curl > 0 && !e.bowl) { e.bowl = 1.1; e.strikes = 0; e.curl = 2; n++; say(e.x, e.y, 0.8, 'Bowled!', '#ffe680'); continue; }
          if (e.k === 'beetle') e.flip = 4;
          if (capped('boots') && !e.F.boss) e.stun = Math.max(e.stun, 1.5);
          hurt(e, dmg, { splash: true, boot: true }); n++;
        }
        for (const g of G.eggs) if (!g.gone && dist(g.x, g.y, s.x, s.y) < r) crackEgg(g);
        shake(5); sfx.stompHit(); buzz(20); ring(s.x, s.y, 0.05, r, '#ffffff'); burst(s.x, s.y, 0.05, '#c9a76c', 10, 2.4);
        if (n >= 3) { say(s.x, s.y, 0.9, `STOMP ×${n}`, '#ffe680', true); heckle('hStomp'); }
        else voice('boot', null, s.x, s.y, 1.1, n ? 0.25 : 0.4);
      }
      if (s.done) s.show -= dt;
    }
    G.stomps = G.stomps.filter((s) => !s.done || s.show > 0);
  }

  // ---------- Grandma ----------
  function swat() {
    const ringers = G.enemies.filter((e) => e.state === 'ring' && !e.dead);
    if (!ringers.length) return false;
    if (G.swatT > 0) { sfx.nope(); say(G.castle.x, G.castle.y, 1.7, 'Grandma is catching her breath', '#c9d0ff'); return true; }
    G.swatN++; G.swatT = swatS(); G.doorT = 0.7; sfx.swat(); buzz(25); mark('ground'); heckle('hSwat');
    ringers.sort((a, b) => a.ring - b.ring);
    for (const e of capped('pin') ? ringers : ringers.slice(0, 1)) {
      hurt(e, e.maxhp * (e.F.boss ? 0.15 : 0.8), { boot: true });
      if (!e.dead) { e.state = 'walk'; e.d = Math.max(0, G.len - 2.5); e.stun = 0.7; e.spin = 0.7; }
    }
    say(G.castle.x, G.castle.y, 1.7, 'BONK!', '#ffe680', true); shake(4); grandma('swat', 0.6);
    return true;
  }

  // The kettle: once per level, when the castle is nearly lost, Grandma has one more thing to throw.
  function kettleCheck() {
    if (G.kettle || G.hearts > 3 || G.hearts <= 0) return;
    G.kettle = 1; G.banner2 = { text: 'THE KETTLE IS ON!', sub: 'tap the castle', t: 2.6 }; sfx.warn();
  }
  function throwKettle() {
    grandma('kettle', 1); G.kettle = 2; G.doorT = 1; sfx.swat(); sfx.splash(); shake(10); G.flash = 0.3; buzz(60); mark('ground');
    const C = G.castle; let n = 0;
    for (const e of G.enemies) {
      if (e.dead || e.fly || hidden(e) || dist(e.x, e.y, C.x, C.y) > 3.2) continue;
      if (e.state === 'ring') e.state = 'walk';
      if (!e.route) e.d = Math.max(0, Math.min(e.d, G.len - 0.1) - (e.F.boss ? 0.8 : 2.2));
      e.stun = Math.max(e.stun, e.F.boss ? 0.6 : 1.4); e.spin = 0.8; n++;
      hurt(e, e.maxhp * (e.F.boss ? 0.1 : 0.6), { splash: true, boot: true });
    }
    const p = routeAt(G.len - 1.2);
    G.puddles.push({ x: p.x, y: p.y, r: 1.3, t: 5, dps: 6 + 2 * G.n });
    ring(C.x, C.y, 0.05, 3.2, '#ffb14a'); burst(C.x, C.y, 0.5, '#ffffff', 26, 4);
    say(C.x, C.y, 1.9, n ? `KETTLE! ×${n}` : 'KETTLE!', '#ffe680', true);
  }

  // ---------- waves ----------
  function launchWave() {
    const list = G.waves[G.waveIdx++];
    const tw = list.twist ? TWISTS[list.twist] : null;
    let t = 0.3;
    // one enemy of the wave is WANTED: squash it with the Boot or the rolling pin for a gem
    const plain = list.map((k, q) => (FOES[k].boss || k === 'king' || FOES[k].fly ? -1 : q)).filter((q) => q >= 0);
    const wanted = G.n >= FROM.wanted && plain.length ? pick(plain) : -1;
    list.forEach((k, q) => { G.spawnQ.push({ k, at: t, tw: list.twist, wanted: q === wanted }); t += FOES[k].gap * rand(0.8, 1.1) * (tw && tw.gap ? tw.gap : 1); });
    if (tw) { G.banner2 = { text: tw.name, sub: tw.sub, t: 2.6 }; sfx.warn(); }
    G.spawnT = 0; G.countdown = NEXT_WAVE_S; sfx.wave();
    if (!(G.banner2 && G.banner2.t > 0)) G.banner2 = { text: `Wave ${G.waveIdx} of ${G.waves.length}`, sub: '', t: 1.6 };
    if (capped('piggy')) { const c = Math.min(25, Math.floor(G.coins * 0.05)); if (c > 0) { G.coins += c; say(G.castle.x, G.castle.y, 1.5, `Interest +${c}`, '#ffd84a'); } }
  }
  const canCallWave = () => G.spawnQ.length === 0 && G.waveIdx < G.waves.length && G.clearT < 0;
  const earlyBonus = () => Math.ceil(Math.max(0, G.countdown) * 0.4 * (has('cuckoo') ? 3 : 1));
  function callWave() {
    if (!canCallWave()) { sfx.nope(); return; }
    const b = earlyBonus(); if (b > 0) { G.coins += b; G.early++; G.barNote = { text: `+${b} early`, t: 1.4 }; }
    launchWave();
  }
  function updateWaves(dt) {
    if (G.spawnQ.length) {
      G.spawnT += dt;
      while (G.spawnQ.length && G.spawnQ[0].at <= G.spawnT) {
        const q = G.spawnQ.shift(), tw = q.tw ? TWISTS[q.tw] : null, e = spawnFoe(q.k);
        if (q.wanted) e.wanted = true;
        if (tw && !e.F.boss) { e.tw = q.tw; if (tw.spd) e.spd *= tw.spd; if (tw.armor) e.armor += tw.armor; if (tw.coin) e.coinK = tw.coin; }
      }
    } else if (G.waveIdx < G.waves.length) { G.countdown -= dt; if (G.countdown <= 0) launchWave(); }
  }

  // ---------- clouds ----------
  // A cloud floats over the map at (x, y). Its shadow is a circle on the ground: that is where its weather works.
  let cloudId = 1;
  function addCloud(t, x, y, big) {
    const D = CLOUDS[t];
    const c = { id: cloudId++, t, x, y, big: !!big, anchored: false, life: (D.life || 0) * (big ? 1.3 : 1), life0: 0, bolts: Math.round((D.bolts || 0) * (big ? 1.5 : 1)), bolts0: 0,
      boltT: 1, born: 0.4, wob: rand(0, 6), zap: 0 };
    c.life0 = c.life; c.bolts0 = c.bolts;
    G.clouds.push(c);
    return c;
  }
  function spawnPuff() {
    G.puffN++;
    let t = 'puff';
    if (G.n >= FROM.gold && ((capped('nursery') && G.puffN % 4 === 0) || Math.random() < 0.2)) t = 'gold';
    else if (G.n >= FROM.frost && Math.random() < 0.16) t = 'frost';
    // a puff comes in on the wind, from the side that the wind blows from
    const [wx, wy] = G.wind, a = rand(1.2, N - 1.2);
    addCloud(t, wx > 0 ? 0.8 : wx < 0 ? N - 0.8 : a, wy > 0 ? 0.8 : wy < 0 ? N - 0.8 : a);
    if (G.layer === 'sky') sfx.puff();
  }
  function mergeResult(a, b) {
    const r = RECIPES.find((q) => (q[0] === a.t && q[1] === b.t) || (q[0] === b.t && q[1] === a.t));
    if (r) return { t: r[2], big: capped('fluffy') || (a.big && b.big) };
    if (a.t === b.t && !CLOUDS[a.t].raw && !a.big && !b.big) return { t: a.t, big: true };
    return null;
  }
  const MERGE_TIER = { rain: 1, sun: 1, snow: 1, storm: 2, rainbow: 3, super: 3 };
  // cloud a was dropped on cloud b
  function mergeClouds(a, b) {
    const r = mergeResult(a, b);
    if (!r) return false;
    for (const c of [a, b]) if (c.anchored) G.anchors--;
    G.clouds = G.clouds.filter((c) => c !== a && c !== b);
    const c = addCloud(r.t, b.x, b.y, r.big);
    if (G.anchors < anchorMax()) { c.anchored = true; G.anchors++; }
    onLayer('sky', () => {
      burst(c.x, c.y, CLOUD_Z + 0.3, '#ffffff', 14, 2.4); ring(c.x, c.y, CLOUD_Z, 0.9, '#ffffff');
      say(c.x, c.y, CLOUD_Z + 1.1, (r.big ? 'Big ' : '') + CLOUDS[r.t].name + '!', '#ffffff', true);
    });
    sfx.merge(MERGE_TIER[r.t] || 1); mark('sky'); heckle(r.t === 'rainbow' ? 'hRainbow' : r.t === 'storm' || r.t === 'super' ? 'hStorm' : 'hMerge');
    if (r.t === 'rainbow') sfx.rainbow();
    const key = [a.t, b.t].sort().join('+');
    if (!meta.recipes[key]) { meta.recipes[key] = r.t; saveMeta(); toast(`New recipe: ${CLOUDS[a.t].name} + ${CLOUDS[b.t].name} = ${CLOUDS[r.t].name}`); }
    return true;
  }
  function toggleAnchor(c) {
    if (CLOUDS[c.t].raw) { toast(`${CLOUDS[c.t].name}: drag it onto another cloud to mix weather`); return; }
    if (c.anchored) { c.anchored = false; G.anchors--; sfx.pop(); }
    else if (G.anchors >= anchorMax()) { sfx.nope(); onLayer('sky', () => say(c.x, c.y, CLOUD_Z + 0.9, `Only ${anchorMax()} anchors`, '#c9d0ff')); return; }
    else { c.anchored = true; G.anchors++; sfx.anchor(); onLayer('sky', () => say(c.x, c.y, CLOUD_Z + 0.9, 'Anchored', '#ffe680')); }
    mark('sky');
  }
  // A bolt from a storm. Without an aim it picks the toughest enemy in the shadow; with one, the enemy nearest to it.
  function strike(c, px, py) {
    const r = cloudR(c);
    let tgt = null, bestS = 1e9;
    for (const e of G.enemies) {
      if (e.dead || hidden(e) || dist(e.x, e.y, c.x, c.y) > r + e.F.r) continue;
      const sc = px == null ? -e.hp : dist(e.x, e.y, px, py);
      if (sc < bestS) { bestS = sc; tgt = e; }
    }
    if (!tgt) { if (px == null) earth(c); return false; }
    c.bolts--; c.zap = 0.25;
    const dmg = boltDmg() * (c.t === 'super' ? 1.5 : 1), hits = [tgt];
    if (capped('thunder')) { // fork lightning
      let o = null, od = 1.9;
      for (const e of G.enemies) { if (e === tgt || e.dead || hidden(e)) continue; const q = dist(e.x, e.y, tgt.x, tgt.y); if (q < od) { od = q; o = e; } }
      if (o) hits.push(o);
    }
    G.bolts.push({ pts: [[c.x, c.y, FLY_Z + 1.1], ...hits.map((e) => [e.x, e.y, e.z + 0.2])], t: 0.2, c: '#fff6a8' });
    for (let k = 0; k < (has('rod') ? 2 : 1); k++) for (const e of hits) { G.byBolt = true; hurt(e, dmg * (e === tgt ? 1 : 0.6) * (c.wrung && e.F.boss ? 0.5 : 1), { bolt: true }); G.byBolt = false; }
    sfx.thunder(); if (G.layer === 'ground') shake(2);
    return true;
  }
  // Earthing: a storm with nobody to hit sends now and then a bolt into the soil and opens a tile next to a tunnel.
  function earth(c) {
    if (G.n < FROM.dig) return;
    c.idle = (c.idle || 0) + 1;
    if (c.idle % (has('roots') ? 1 : 3) || c.bolts < 2) return;
    const r = cloudR(c);
    const spots = G.ug.filter((t) => !t.dug && !t.chalk && t.content !== 'lode' && dist(t.i + 0.5, t.j + 0.5, c.x, c.y) <= r && DIRS.some(([di, dj]) => { const q = tileAt(t.i + di, t.j + dj); return q && q.dug; }));
    if (!spots.length) return;
    const t = pick(spots);
    if (!has('roots')) c.bolts -= 2;
    c.zap = 0.25; sfx.thunder();
    G.bolts.push({ pts: [[c.x, c.y, FLY_Z + 1.1], [t.i + 0.5, t.j + 0.5, 0]], t: 0.2, c: '#fff6a8' });
    ring(t.i + 0.5, t.j + 0.5, 0.05, 0.5, '#fff6a8');
    onLayer('dig', () => { say(t.i + 0.5, t.j + 0.5, 0.5, 'Earthed!', '#fff6a8', true); burst(t.i + 0.5, t.j + 0.5, 0.2, '#fff6a8', 12, 2.6); });
    if (t.queued) { G.coins += t.paid || 0; }
    G.used.dig = true; finishDig(t, null);
  }
  // a tap under a storm: one bolt, there, now
  function callBolt(wx, wy) {
    const c = G.clouds.find((q) => CLOUDS[q.t].bolts && q.bolts > 0 && dist(q.x, q.y, wx, wy) <= cloudR(q));
    if (!c) return false;
    if (c.callCd > 0) return true;
    if (strike(c, wx, wy)) { c.callCd = 0.3; c.boltT = c.t === 'super' ? 0.7 : 1.3; mark('sky'); onLayer('sky', () => ring(wx, wy, 0.02, 0.5, '#fff6a8')); }
    else onLayer('sky', () => say(wx, wy, 0.3, 'Nobody there', '#c9d0ff'));
    return true;
  }
  // Wringing: scrub a weather cloud to and fro and it gives everything at once.
  function wring(c) {
    const r = cloudR(c), inShade = G.enemies.filter((e) => !e.dead && !hidden(e) && dist(e.x, e.y, c.x, c.y) <= r + e.F.r);
    let word = '';
    if (c.t === 'rain') { c.gush = 3.5; c.life = Math.min(c.life, 3.5); word = 'DOWNPOUR!'; sfx.rain(); }
    else if (c.t === 'sun') { c.gush = 5; c.life = Math.min(c.life, 5); word = 'HEATWAVE!'; sfx.rainbow(); }
    else if (c.t === 'snow') { for (const e of inShade) if (!e.F.boss) { e.stun = Math.max(e.stun, 2.6); e.frozen = 2.6; e.vuln = 2.6; } c.life = Math.min(c.life, 0.4); word = `FLASH FREEZE${inShade.length ? ' ×' + inShade.length : ''}!`; sfx.ice(); }
    else if (c.t === 'rainbow') { let pay = 0; for (const e of inShade) if (!e.fly && !e.F.boss) { e.stun = Math.max(e.stun, 1.5); e.dance = 1.5; pay += Math.round(4 * coinMul()); } G.coins += pay; c.life = Math.min(c.life, 0.4); word = pay ? `JACKPOT +${pay}` : 'Glitter. Nobody saw it'; sfx.rainbow(); }
    else if (CLOUDS[c.t].bolts) { c.wrung = true; c.boltT = 0; word = 'THUNDERCLAP!'; sfx.thunder(); }
    else return false;
    c.born = 0.5; mark('sky'); shake(3);
    onLayer('sky', () => { say(c.x, c.y, CLOUD_Z + 1.2, word, '#ffffff', true); burst(c.x, c.y, CLOUD_Z - 0.1, c.t === 'sun' ? '#ffe680' : '#bfe4ff', 22, 3); });
    say(c.x, c.y, 1.2, word, '#ffffff', true);
    return true;
  }
  function updateClouds(dt) {
    if (G.n < FROM.sky) return;
    G.puffT -= dt;
    if (G.puffT <= 0) { G.puffT = puffS(); if (G.clouds.length < PUFF_MAX) spawnPuff(); }
    // clouds only drift while nobody watches them
    const drift = G.layer !== 'sky' && !has('vane');
    // a flicked cloud glides, bounces off the edge of the map and mixes with the cloud that it runs into
    for (const c of G.clouds.slice()) {
      if (!(c.vx || c.vy) || c === G.drag || !G.clouds.includes(c)) continue;
      c.x += c.vx * dt; c.y += c.vy * dt;
      const f = Math.pow(0.16, dt); c.vx *= f; c.vy *= f;
      if (c.x < 0.3 || c.x > N - 0.3) { c.vx *= -0.7; c.x = clamp(c.x, 0.3, N - 0.3); }
      if (c.y < 0.3 || c.y > N - 0.3) { c.vy *= -0.7; c.y = clamp(c.y, 0.3, N - 0.3); }
      if (Math.hypot(c.vx, c.vy) < 0.3) { c.vx = c.vy = 0; continue; }
      const o = dragTarget(c);
      if (o && o !== G.drag && !mergeClouds(c, o)) { const a = Math.atan2(c.y - o.y, c.x - o.x); o.vx = (o.vx || 0) + c.vx * 0.6; o.vy = (o.vy || 0) + c.vy * 0.6; c.vx *= -0.3; c.vy *= -0.3; c.x = o.x + Math.cos(a) * 0.9; c.y = o.y + Math.sin(a) * 0.9; sfx.puff(); }
    }
    for (const c of G.clouds) {
      if (c.born > 0) c.born -= dt;
      if (c.zap > 0) c.zap -= dt;
      if (c.gush > 0) c.gush -= dt;
      if (c.callCd > 0) c.callCd -= dt;
      const D = CLOUDS[c.t];
      if (drift && !c.anchored && !(c.vx || c.vy)) {
        c.x += G.wind[0] * DRIFT * dt; c.y += G.wind[1] * DRIFT * dt;
        if (c.x < -0.4 || c.y < -0.4 || c.x > N + 0.4 || c.y > N + 0.4) { c.gone = true; if (!D.raw) heckle('hDrift'); continue; }
      }
      if (D.life) { c.life -= dt * (c.anchored && capped('anchors') ? 0.67 : 1); if (c.life <= 0) c.gone = true; }
      if (D.bolts) { c.boltT -= dt; if (c.boltT <= 0) { c.boltT = c.wrung ? 0.14 : c.t === 'super' ? 0.7 : 1.3; if (!strike(c) && c.wrung) c.bolts--; } if (c.bolts <= 0) c.gone = true; }
      if (c.t === 'rainbow') for (const e of G.enemies) if (e.danced === c.id && !e.paid) { e.paid = true; const p = Math.round(3 * coinMul()); G.coins += p; say(e.x, e.y, 0.7, `+${p}`, '#ff9ad8'); }
    }
    for (const c of G.clouds) if (c.gone) { if (c.anchored) G.anchors--; onLayer('sky', () => burst(c.x, c.y, CLOUD_Z + 0.2, '#ffffff', 8, 1.6)); }
    G.clouds = G.clouds.filter((c) => !c.gone);
    // the Spy Cloud: tiles under a shadow show what they hide
    if (lv('spy')) {
      G.spyT -= dt;
      if (G.spyT <= 0) {
        G.spyT = 0.5;
        for (const c of G.clouds) for (const t of G.ug) if (!t.dug && !t.spied && dist(t.i + 0.5, t.j + 0.5, c.x, c.y) <= cloudR(c)) t.spied = true;
      }
    }
  }
  // how much faster a hamster digs under the rain: 2, or 3 in a downpour
  function rainOver(x, y) { let k = 1; for (const c of G.clouds) if (c.t === 'rain' && dist(c.x, c.y, x, y) <= cloudR(c)) k = Math.max(k, c.gush > 0 ? 3 : 2); return k; }

  // ---------- the mine ----------
  function revealAround(t) {
    for (const [di, dj] of DIRS) { const q = tileAt(t.i + di, t.j + dj); if (q) q.known = true; }
    cacheDirty.dig = true;
  }
  // The shortest way through the tunnels from a dug tile to the first tile that `goal` accepts. Returns the tiles after the start.
  function bfs(from, goal) {
    const prev = new Map([[from, null]]), q = [from];
    while (q.length) {
      const t = q.shift();
      if (goal(t)) { const out = []; for (let c = t; c !== from; c = prev.get(c)) out.unshift(c); return out; }
      for (const [di, dj] of DIRS) { const n = tileAt(t.i + di, t.j + dj); if (n && n.dug && !prev.has(n)) { prev.set(n, t); q.push(n); } }
    }
    return null;
  }
  const nextTo = (a, b) => Math.abs(a.i - b.i) + Math.abs(a.j - b.j) === 1;
  const canQueue = (t) => !!t && !t.dug && !t.queued && !t.chalk && DIRS.some(([di, dj]) => { const q = tileAt(t.i + di, t.j + dj); return q && (q.dug || q.queued); });
  const digLayer = () => (G.layer === 'dig' ? 'dig' : 'ground');
  function orderDig(t) {
    if (!canQueue(t)) { sfx.nope(); return false; }
    const cost = digCost(t);
    if (G.coins < cost) { sfx.nope(); onLayer('dig', () => say(t.i + 0.5, t.j + 0.5, 0.4, `Need ${cost} coins`, '#ff9a9a')); return false; }
    G.coins -= cost; G.digOrders++; t.paid = cost; mark('dig'); sfx.dig();
    if (cost === 0) onLayer('dig', () => say(t.i + 0.5, t.j + 0.5, 0.4, 'Free dig!', '#7cf2a8'));
    if (G.freeDigs > 0) { G.freeDigs--; finishDig(t, null); return true; } // the Golden Shovel
    t.queued = true; t.prog = 0; t.taken = null; G.orders.push(t);
    return true;
  }
  function dropOrder(t) {
    const k = G.orders.indexOf(t); if (k >= 0) G.orders.splice(k, 1);
    t.queued = false; t.taken = null; t.prog = 0;
    for (const h of G.hamsters) if (h.order === t) { h.order = null; h.route = []; if (h.state !== 'home') h.state = 'idle'; }
  }
  function cancelDig(t) { dropOrder(t); G.coins += t.paid || 0; t.paid = 0; sfx.tab(); }
  // what a carried thing is worth once it is home
  function collect(k, x, y, z) {
    let s = '', c = '#8fe6ff';
    if (k === 'gem') { G.loot += 1; s = '+1 gem'; }
    else if (k === 'coins') { const v = 20 + 4 * G.n; G.coins += v; s = `+${v} coins`; c = '#ffd84a'; }
    else if (k === 'fossil') { G.loot += 3; s = 'Fossil! +3 gems'; }
    else if (k === 'crystal') { G.loot += 3; s = 'Crystal! +3 gems'; c = '#b9a8ff'; }
    else if (k === 'heart') { G.hearts = Math.min(G.maxHearts, G.hearts + 2); s = '+2 hearts'; c = '#ff8aa0'; }
    else if (k === 'blueprint') {
      run.bp++; s = 'Blueprint!'; c = '#bfe9ff';
      const next = TOWER_ORDER.find((t) => !towerUnlocked(t)) ? null : TOWER_ORDER.filter((t) => TOWERS[t].from > run.level).slice(-1)[0];
      toast(next ? `Blueprint: the ${TOWERS[next].name} arrives early` : 'Blueprint: worth 2 gems to a collector'); if (!next) G.loot += 2;
    }
    say(x, y, z, s, c); sfx.gem();
  }
  const luckyMul = () => (G.lucky >= 10 ? 2 : G.lucky >= 5 ? 1.5 : 1);
  function bank(h) {
    const L = digLayer();
    // the lucky streak pays when the backpack is home
    const m = luckyMul(), worth = h.pack.reduce((a, k) => a + ({ gem: 1, fossil: 3, crystal: 3 }[k] || 0), 0), extra = Math.round(worth * (m - 1));
    if (extra > 0) { G.loot += extra; onLayer(L, () => say(G.hut.x, G.hut.y, (L === 'dig' ? DIG_Z + 0.5 : 0.9) + h.pack.length * 0.32, `Lucky ×${m}: +${extra} gem${extra > 1 ? 's' : ''}`, '#7cf2a8', true)); }
    onLayer(L, () => h.pack.forEach((k, n) => collect(k, G.hut.x, G.hut.y, (L === 'dig' ? DIG_Z + 0.5 : 0.9) + n * 0.32)));
    h.pack = []; sfx.loot();
  }
  // Letters: old post that turns up in the dirt, one a level at most, in the order of the story.
  const lettersLeft = () => (LORE.letters || []).length - meta.letters.length;
  function maybeLetter(x, y) {
    if (G.letterFound || lettersLeft() <= 0 || Math.random() > (G.digs >= 6 ? 0.4 : 0.15)) return;
    const idx = meta.letters.length, L = LORE.letters[idx];
    G.letterFound = true; meta.letters.push(idx); saveMeta(); G.loot += 2; sfx.relic();
    G.letter = { idx, t: 14, T: 14 };
    onLayer('dig', () => { say(x, y, DIG_Z + 1, 'A LETTER! +2 gems', '#fff1c9', true); burst(x, y, DIG_Z + 0.4, '#fff1c9', 14, 2.4); });
    if (lettersLeft() === 0) { G.loot += 12; G.banner2 = { text: 'THE WHOLE STORY!', sub: `all ${LORE.letters.length} letters: +12 gems`, t: 3 }; }
    return L;
  }
  function finishDig(t, h) {
    dropOrder(t);
    t.dug = true; G.digs++;
    if (h) { h.order = null; h.state = 'idle'; }
    revealAround(t);
    const x = t.i + 0.5, y = t.j + 0.5, z = DIG_Z + 0.5, c = t.content;
    t.content = null;
    if (h) voice('hamsters', HAZARDS[c] ? 'hazard' : c ? 'loot' : 'dig', x, y, DIG_Z + 1, HAZARDS[c] ? 0.8 : c ? 0.5 : 0.1, 'dig');
    if (h && !HAZARDS[c] && c !== 'lode') maybeLetter(x, y);
    onLayer('dig', () => {
      burst(x, y, DIG_Z + 0.3, '#8a5a36', 8, 2);
      if (HAZARDS[c]) { G.hazN++; if (G.lucky >= 5) say(x, y, z + 0.8, 'Lucky streak lost', '#ff9a9a'); G.lucky = 0; }
      else if (h && t.far >= 2) { G.lucky++; if (G.lucky === 5 || G.lucky === 10) { say(x, y, z + 0.8, `LUCKY STREAK ×${luckyMul()}`, '#7cf2a8', true); sfx.combo(G.lucky / 5); } }
      if (!c) {
        sfx.digDone();
        if (t.hard >= 2 && Math.random() < 0.22) { G.gems.push({ x, y, t: GEM_ROLL_S * (capped('socks') ? 2 : 1), wob: rand(0, 6) }); sfx.gemRoll(); say(x, y, z, 'A loose gem! Tap it!', '#8fe6ff'); }
      } else if (c === 'gas') {
        sfx.gas(); burst(x, y, DIG_Z + 0.3, '#b6e36a', 16, 2.2); heckle('hGas');
        if (lv('helmet') || !h) say(x, y, z, 'Stink pocket. Masks on!', '#b6e36a');
        else { h.daze = 6; say(x, y, z, 'Stink pocket!', '#b6e36a', true); if (h.pack.length) { h.pack = []; say(x, y, z + 0.4, 'Backpack lost', '#ff9a9a'); heckle('hPackLost'); } }
      } else if (c === 'cave') {
        if (lv('props')) { say(x, y, z, 'Creak... the props hold', '#d9b97f'); sfx.digDone(); }
        else { // the tile falls in again, as soft dirt
          t.dug = false; t.hard = 1; t.known = true; cacheDirty.dig = true; if (h) h.daze = 4;
          sfx.cave(); shake(8); burst(x, y, DIG_Z + 0.3, '#6b4a2a', 18, 2.6); say(x, y, 0.4, 'Cave-in!', '#ffb38a', true); heckle('hCave');
        }
      } else if (c === 'nest') {
        sfx.worms(); say(x, y, z, 'Worm nest!', '#ff9a9a', true); heckle('hWorms');
        const way = bfs(t, (q) => q.i === G.hut.i && q.j === G.hut.j) || [];
        const route = way.map((q) => ({ x: q.i + 0.5, y: q.j + 0.5 }));
        if (route.length) route[route.length - 1].surface = true;
        const jp = routeAt(G.joinD); route.push({ x: jp.x, y: jp.y });
        for (let k = 0; k < 2 + Math.floor(G.n / 8); k++) spawnFoe('worm', { x, y, state: way.length ? 'tunnel' : 'walk', route: route.map((p) => Object.assign({}, p)), ri: 0, stun: 0.6 + k * 0.5 });
      } else if (c === 'lode') {
        G.lodeFound = true; t.chest = true; G.loot += 5; sfx.relic(); shake(6); G.flash = 0.3;
        burst(x, y, DIG_Z + 0.4, '#ffe680', 26, 3.2); say(x, y, z + 0.4, 'THE MOTHER LODE! +5 gems', '#ffe680', true); heckle('motherlode');
      } else if (c === 'crystal') {
        const tw = G.towers.find((q) => q.i === t.i && q.j === t.j); if (tw) tw.crystal = false;
        if (h && !has('pouch')) { h.pack.push('crystal'); say(x, y, z, 'Crystal!', '#b9a8ff'); } else collect('crystal', x, y, z);
        sfx.loot();
      } else if (LOOT[c].carry) {
        if (h && !has('pouch')) { h.pack.push(c); say(x, y, z, LOOT[c].name + '!', '#ffe680'); sfx.loot(); } else collect(c, x, y, z);
      } else bonusLoot(c, x, y, z);
    });
  }
  // loot that works on the spot
  function bonusLoot(c, x, y, z) {
    sfx.loot();
    if (c === 'spring') { G.boot.n = bootMax(); G.boot.t = 0; say(x, y, z, 'Spring! The Boot is ready', '#7cf2a8'); }
    else if (c === 'mushroom') { G.mush = true; say(x, y, z, 'Zoomy mushroom! Faster hamsters', '#ff9ad8'); }
    else if (c === 'relic') { G.urnDmg += 0.1; say(x, y, z, 'Old urn! Towers +10%', '#ffe680'); }
    else if (c === 'dynamite') { G.dyn++; say(x, y, z, 'Dynamite! +1 stick', '#ff8a5c'); }
  }
  function updateHamsters(dt) {
    const eyes = G.n >= FROM.combo && (G.layer === 'dig' || capped('hire')) ? EYES_DIG : 1;
    const v = 2.4 * (G.mush ? 1.5 : 1);
    for (const h of G.hamsters) {
      if (h.cheer > 0) h.cheer -= dt;
      if (h.daze > 0) { h.daze -= dt; continue; }
      const here = tileAt(h.i, h.j), home = h.i === G.hut.i && h.j === G.hut.j;
      if (h.state === 'idle') {
        if (home && h.pack.length) bank(h);
        const free = (t) => G.orders.some((o) => !o.taken && nextTo(o, t));
        const way = h.pack.length < PACK_CAP && G.orders.some((o) => !o.taken) ? bfs(here, free) : null;
        if (way) {
          const end = way.length ? way[way.length - 1] : here, o = G.orders.find((q) => !q.taken && nextTo(q, end));
          o.taken = h; h.order = o; h.route = way; h.state = 'go';
        } else if (h.pack.length && !home) { const back = bfs(here, (t) => t.i === G.hut.i && t.j === G.hut.j); if (back) { h.route = back; h.state = 'home'; } }
        continue;
      }
      if (h.state === 'go' || h.state === 'home') {
        if (h.route.length) {
          const t = h.route[0], tx = t.i + 0.5, ty = t.j + 0.5, dx = tx - h.x, dy = ty - h.y, q = Math.hypot(dx, dy), step = v * dt;
          if (Math.abs(dx) > Math.abs(dy)) { h.fx = Math.sign(dx); h.fy = 0; } else if (dy) { h.fy = Math.sign(dy); h.fx = 0; }
          if (q <= step) { h.x = tx; h.y = ty; h.i = t.i; h.j = t.j; h.route.shift(); } else { h.x += dx / q * step; h.y += dy / q * step; }
          continue;
        }
        if (h.state === 'home') { h.state = 'idle'; continue; }
        const o = h.order;
        if (!o || !o.queued || !nextTo(o, here)) { if (o) o.taken = null; h.order = null; h.state = 'idle'; continue; }
        h.state = 'dig'; h.fx = o.i - h.i; h.fy = o.j - h.j;
        continue;
      }
      if (h.state === 'dig') {
        const o = h.order;
        if (!o || !o.queued) { h.order = null; h.state = 'idle'; continue; }
        o.prog += dt / digTime(o) * eyes * (h.cheer > 0 ? 2 : 1) * rainOver(o.i + 0.5, o.j + 0.5);
        G.digSfx -= dt;
        if (G.digSfx <= 0 && G.layer === 'dig') { G.digSfx = 0.42; sfx.dig(); onLayer('dig', () => burst(o.i + 0.5 - h.fx * 0.4, o.j + 0.5 - h.fy * 0.4, DIG_Z + 0.4, '#a8744a', 3, 1.4)); }
        if (o.prog >= 1) finishDig(o, h);
      }
    }
  }
  function cheer(h) { voice('hamsters', 'cheer', h.x, h.y, DIG_Z + 0.9, 0.7, 'dig'); h.cheer = 2.5; sfx.squeak(); mark('dig'); onLayer('dig', () => say(h.x, h.y, DIG_Z + 0.8, pick(['Squeak!', 'On it!', 'Digging!', 'Yes boss!']), '#ffe680')); }
  function takeGem(g) {
    g.gone = true; const v = capped('socks') ? 2 : 1; G.loot += v; sfx.gem(); mark('dig');
    onLayer('dig', () => { say(g.x, g.y, DIG_Z + 0.6, `+${v} gem${v > 1 ? 's' : ''}`, '#8fe6ff'); burst(g.x, g.y, DIG_Z + 0.3, '#8fe6ff', 8, 2); });
  }
  // dynamite: a stick on a dug tile opens the eight tiles around it and shakes the ground above
  function placeStick(t) {
    if (!t.dug || G.dyn <= 0 || G.sticks.some((s) => s.i === t.i && s.j === t.j)) { sfx.nope(); return false; }
    G.dyn--; G.armed = false; G.sticks.push({ i: t.i, j: t.j, x: t.i + 0.5, y: t.j + 0.5, t: FUSE_S }); sfx.fuse(); mark('dig');
    return true;
  }
  function blast(s) {
    sfx.boom(); shake(12); G.flash = 0.3; buzz(80); heckle('hDynamite');
    let lost = 0; const up = [];
    onLayer('dig', () => {
      burst(s.x, s.y, DIG_Z + 0.4, '#ffb14a', 30, 4); ring(s.x, s.y, DIG_Z + 0.1, 1.5, '#ffb14a');
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const t = tileAt(s.i + di, s.j + dj);
        if (!t || t.dug || t.content === 'lode') continue;
        const c = t.content; t.content = null;
        if (t.queued) { G.coins += t.paid || 0; dropOrder(t); }
        t.dug = true; revealAround(t);
        if (c === 'crystal') { const tw = G.towers.find((q) => q.i === t.i && q.j === t.j); if (tw) tw.crystal = false; }
        t.chalk = false;
        if (HAZARDS[c]) up.push([c, t]); // a danger that is blown up goes off upwards, at the enemy
        if (c && (LOOT[c] || c === 'crystal')) {
          if (!capped('fuse')) lost++;
          else if (c === 'crystal' || LOOT[c].carry) collect(c, t.i + 0.5, t.j + 0.5, DIG_Z + 0.5); else bonusLoot(c, t.i + 0.5, t.j + 0.5, DIG_Z + 0.5);
        }
      }
      if (lost) say(s.x, s.y, DIG_Z + 0.9, `${lost} treasure${lost > 1 ? 's' : ''} blown to bits`, '#ff9a9a');
      for (const h of G.hamsters) if (dist(h.x, h.y, s.x, s.y) < 1.6) { h.daze = 3; say(h.x, h.y, DIG_Z + 0.7, 'Eek!', '#ffffff'); }
    });
    for (const [c, t] of up) {
      const x = t.i + 0.5, y = t.j + 0.5, g = groundAt(t.i, t.j);
      if (c === 'gas') { G.puddles.push({ x, y, r: 1.2, t: 7, dps: 0, stink: true }); say(x, y, 0.8, 'Stink cloud!', '#b6e36a', true); sfx.gas(); }
      else if (c === 'cave' && (g.t === 'path' || g.t === 'mud') && !(t.i === G.castle.i && t.j === G.castle.j)) { t.pitted = true; G.pits.push({ i: t.i, j: t.j, t: PIT_S, count: 0 }); say(x, y, 0.8, 'Free sinkhole!', '#ffb38a', true); }
      else if (c === 'nest') { const v = 12 + 2 * G.n; G.coins += v; say(x, y, 0.8, `Worm pie! +${v}`, '#ffd84a', true); }
    }
    const dmg = 60 + 14 * G.n; let n = 0;
    for (const e of G.enemies) {
      if (e.dead || e.fly || dist(e.x, e.y, s.x, s.y) > 1.7) continue;
      if (hidden(e)) { onLayer('dig', () => (e.k === 'tyrant' ? surface(e, true) : kill(e))); n++; continue; }
      e.stun = Math.max(e.stun, e.F.boss ? 0.5 : 1.2); hurt(e, dmg, { splash: true }); n++;
    }
    G.geysers.push({ x: s.x, y: s.y, t: 0.6 }); ring(s.x, s.y, 0.05, 1.7, '#ffb14a'); burst(s.x, s.y, 0.1, '#8a5a36', 16, 3);
    if (n >= 3) say(s.x, s.y, 1, `KABOOM ×${n}`, '#ffe680', true);
  }
  // a tunnel under the path can be collapsed into a pit; later it fills with mud
  const canPit = (t) => G.n >= FROM.pit && !!t && t.dug && !t.pitted && groundAt(t.i, t.j).t === 'path' && !(t.i === G.castle.i && t.j === G.castle.j);
  function collapse(t) {
    if (!canPit(t) || G.coins < PIT_COST) { sfx.nope(); return false; }
    G.coins -= PIT_COST; t.pitted = true; G.pits.push({ i: t.i, j: t.j, t: PIT_S, count: 0 });
    sfx.cave(); shake(6); mark('dig'); heckle('hSinkhole');
    onLayer('dig', () => say(t.i + 0.5, t.j + 0.5, 0.2, 'Sinkhole!', '#ffb38a', true));
    burst(t.i + 0.5, t.j + 0.5, 0.1, '#8a5a36', 14, 2.6);
    return true;
  }
  function updateMine(dt) {
    updateHamsters(dt);
    for (const g of G.gems) { g.t -= dt; if (g.t <= 0 && !g.gone) { g.gone = true; heckle('hGemLost'); onLayer('dig', () => say(g.x, g.y, DIG_Z + 0.5, 'Rolled away', '#9aa3d6')); } }
    G.gems = G.gems.filter((g) => !g.gone);
    for (const s of G.sticks) { s.t -= dt; if (s.t <= 0) { s.done = true; blast(s); } }
    G.sticks = G.sticks.filter((s) => !s.done);
    for (const p of G.pits) {
      if (p.t <= 0) continue;
      p.t -= dt;
      if (p.t <= 0) { const g = groundAt(p.i, p.j); g.t = 'mud'; cacheDirty.ground = true; if (p.count) say(p.i + 0.5, p.j + 0.5, 0.5, `${p.count} fell in`, '#ffd9b0'); }
    }
    for (const g of G.geysers) g.t -= dt;
    G.geysers = G.geysers.filter((g) => g.t > 0);
  }

  // ---------- update ----------
  function updateFx(dt) {
    for (const p of G.parts) {
      p.t -= dt;
      if (p.ring) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 9 * dt;
    }
    G.parts = G.parts.filter((p) => p.t > 0);
    for (const t of G.texts) { t.t -= dt; t.z += dt * 0.5; }
    G.texts = G.texts.filter((t) => t.t > 0);
    for (const b of G.bubbles) { b.t -= dt; if (b.e && !b.e.dead) { b.x = b.e.x; b.y = b.e.y; } }
    G.bubbles = G.bubbles.filter((b) => b.t > 0);
    if (G.letter && G.letter.t > 0) G.letter.t -= dt;
    // small talk while the garden waits
    G.idleSay -= dt;
    if (G.idleSay <= 0) {
      G.idleSay = rand(16, 28);
      if (G.layer === 'dig' && G.hamsters.length) { const h = pick(G.hamsters); voice('hamsters', h.state === 'dig' ? 'dig' : 'idle', h.x, h.y, DIG_Z + 0.9, 1, 'dig'); }
      else if (G.layer === 'ground' && !G.enemies.length) grandma('idle', 1);
    }
    for (const b of G.bolts) b.t -= dt;
    G.bolts = G.bolts.filter((b) => b.t > 0);
    for (const t of G.towers) if (t.born > 0) t.born -= dt;
    for (const e of G.enemies) { if (e.spin > 0) e.spin -= dt; if (e.frozen > 0) e.frozen -= dt; }
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
    if (G.flash > 0) G.flash -= dt;
  }
  function update(dt) {
    G.time += dt;
    updateWaves(dt); updateEnemies(dt); updateEggs(dt); updateTowers(dt); updateShots(dt); updateBoot(dt); updateClouds(dt); updateMine(dt); updateFx(dt);
    if (G.swatT > 0) G.swatT -= dt;
    if (G.doorT > 0) G.doorT -= dt;
    if (G.bellT > 0) G.bellT -= dt;
    if (G.banner > 0) G.banner -= dt;
    if (G.banner2 && G.banner2.t > 0) G.banner2.t -= dt;
    if (G.barNote && G.barNote.t > 0) G.barNote.t -= dt;
    if (G.heckle && G.heckle.t > 0) G.heckle.t -= dt;
    if (G.toast && G.toast.t > 0) G.toast.t -= dt;
    if (G.streak.t > 0) { G.streak.t -= dt; if (G.streak.t <= 0) { G.streak.n = 0; A.streak(0); } }
    if (G.combo > 0) { G.combo -= dt; if (G.combo <= 0) { G.combo = 0; G.links = 0; G.comboMul = 2; G.comboCd = G.time + 10; for (const l of LAYERS) G.act[l] = -99; A.fever(false); } }
    // the gnome notices a layer that nobody uses
    G.idleT += dt;
    if (G.idleT > 30) { G.idleT = 0; heckle('hIdle'); }
    if (G.time > 70 && G.n >= FROM.sky + 1 && !G.used.sky) heckle('hSkyIdle');
    if (G.time > 50 && G.n >= FROM.dig + 1 && !G.used.dig) heckle('hDigIdle');
    if (G.hearts <= 0) { G.hearts = 0; gameOver(); return; }
    if (G.clearT < 0 && G.waveIdx >= G.waves.length && !G.spawnQ.length && !G.enemies.length && !G.eggs.length) { G.clearT = 1.5; sfx.cheer(); }
    if (G.clearT > 0) { G.clearT -= dt; if (G.clearT <= 0) finishLevel(); }
  }
  const ringing = () => G.enemies.some((e) => e.state === 'ring' && !e.dead);

  // ---------- the end of a level ----------
  let pendingRelics = 0;
  function finishLevel() {
    const n = G.n, boss = BOSS_AT[n] || G.bossDown;
    for (const h of G.hamsters) if (h.pack.length) bank(h);
    for (const t of G.orders) G.coins += t.paid || 0;
    const stars = 1 + (G.leaks <= 2 ? 1 : 0) + (G.leaks === 0 ? 1 : 0);
    const rows = [['Level cleared', 3 + Math.floor(n / 3)], [`${stars} star${stars > 1 ? 's' : ''}`, stars]];
    if (G.loot) rows.push(['Loot from the mine', G.loot]);
    const conv = Math.min(GEM_CAP, Math.floor(G.coins / GEM_RATE));
    if (conv) rows.push([`${Math.floor(G.coins)} coins left over`, conv]);
    if (boss) rows.push([`${BOSS_NAMES[boss]} beaten`, 8]);
    if (G.combos) rows.push([`Strata combo ×${G.combos}`, G.combos]);
    const marks = G.ug.filter((t) => t.chalk && !t.dug), right = marks.filter((t) => HAZARDS[t.content]).length, wrong = marks.length - right;
    if (marks.length) rows.push([`Chalk audit: ${right} right, ${wrong} wrong`, Math.min(5, Math.max(0, right - wrong))]);
    let dareNote = null;
    if (run.dare && DARE_BY_ID[run.dare]) {
      const d = DARE_BY_ID[run.dare], won = d.ok();
      if (won) rows.push([`Dare: ${d.text.split(':')[0]}`, dareGems(n)]);
      dareNote = { name: d.text.split(':')[0], won };
    }
    run.dare = null;
    let total = rows.reduce((a, r) => a + r[1], 0);
    const heat0 = run.heat;
    if (heat0 > 0 && n >= FROM.heat) { const b = Math.ceil(total * 0.1 * heat0); rows.push([`Heat ${heat0}: +${heat0 * 10}%`, b]); total += b; }
    if (n >= FROM.heat) { if (G.leaks === 0) run.heat = Math.min(5, run.heat + 1); else if (G.leaks >= 4) run.heat = Math.max(0, run.heat - 1); }
    summary = { n, name: G.name, stars, rows, total, leaks: G.leaks, hearts: G.hearts, kills: G.kills, digs: G.digs, loot: G.loot, time: G.time, usedSky: G.used.sky, usedDig: G.used.dig,
      heat0, heat1: run.heat, boss, lode: G.lodeFound, victory: n === CAMPAIGN, dare: dareNote };
    summary.news = gazette({ level: n, leaks: G.leaks, hearts: G.hearts, kills: G.kills, stomps: G.stompN, swats: G.swatN, built: G.builtN, digs: G.digs, loot: G.loot, hazards: G.hazN, boltKills: G.boltKills, combos: G.combos, early: G.early, boss: boss ? BOSS_NAMES[boss] : null, flawless: G.leaks === 0, coins: Math.floor(G.coins) });
    pendingRelics = (boss ? 1 : 0) + (G.lodeFound ? 1 : 0);
    run.level++; run.gems += total; run.stars += stars; run.score += total;
    saveRun(); recordBest(); saveMeta();
    mode = 'tally'; closePop(); pauseBtn.style.display = 'none';
    A.fever(false); A.streak(0); A.music(0); sfx.clear();
    showTally();
  }
  function gameOver() {
    mode = 'over'; closePop(); pauseBtn.style.display = 'none';
    A.fever(false); A.streak(0); A.music(0); sfx.over(); buzz([80, 60, 160]);
    meta.runs++; saveMeta(); recordBest(); store.del(SAVE_KEY);
    showOver();
  }

  // ---------- screens ----------
  // The HTML screens sit over the canvas. A button carries data-act; one listener handles them all.
  function showOverlay(html, see) { ov.innerHTML = html; ov.className = 'show' + (see ? ' see' : ''); ov.scrollTop = 0; }
  function hideOverlay() { ov.className = ''; ov.innerHTML = ''; }
  const soundBtns = () => `<div class="pair"><button class="big alt" data-act="sfx">${muted ? '🔇 Sound off' : '🔊 Sound on'}</button><button class="big alt" data-act="music">${musicOff ? '🎵 Music off' : '🎵 Music on'}</button></div>`;
  const relicBar = () => (run && run.relics.length ? `<div class="relicbar">Relics:${run.relics.map((id) => `<span title="${RELIC_BY_ID[id].name}">${RELIC_BY_ID[id].icon}</span>`).join('')}</div>` : '');
  const levelName = (n) => LV.names[(n - 1) % LV.names.length];
  function tipFor(n) { const t = LV.tips[n]; return t || ''; }
  const tipHtml = (t) => (t.startsWith('NEW:') ? `<b>NEW</b>${t.slice(4)}` : t);

  let screen = '';
  // What the player can do, by the level that brings it. The pause screen lists them.
  const TRICKS = [
    [1, 'Tap the castle when the bell rings: Grandma swats.'], [1, 'At three hearts the kettle whistles. Tap the castle once.'],
    [FROM.wanted, 'An enemy with a gold star is WANTED: the Boot or Grandma earns a gem.'],
    [FROM.pals, 'Some towers like their neighbours. A heart shows a pair.'],
    [4, 'Stomp a beetle to flip it. Stomp a curled hedgehog to bowl it back.'],
    [FROM.dig + 1, 'In the mine the tool button has chalk: mark the dirt you do not trust.'], [FROM.dig, 'Tap a digging hamster to cheer it on. Safe digs in a row are a lucky streak.'],
    [FROM.sky, 'Flick a cloud and it glides. A flyer that meets a cloud gets lost.'], [FROM.sky, 'Scrub a weather cloud to and fro to wring it out.'],
    [FROM.sky, 'Tap under a storm to call a bolt. An idle storm digs in the mine.'],
    [FROM.combo, 'During a Strata Combo, hop between layers: the coins go up to ×4.'],
    [FROM.dynamite, 'Dynamite on a danger sends it upwards, at the enemy.'],
  ];
  // ---------- the Almanac ----------
  // Everything the garden has told the player so far. Pages fill in as things are met, beaten, built and dug up.
  let almTab = 'story', almBack = 'menu';
  const foeUrl = {};
  function foeImg(k) {
    if (foeUrl[k] == null) { try { foeUrl[k] = foeSpr(FOES[k].art || k).cv.toDataURL(); } catch (e) { foeUrl[k] = ''; } }
    return foeUrl[k] ? `<img src="${foeUrl[k]}" alt="">` : '';
  }
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const listOf = (x) => (Array.isArray(x) ? x.map((v, k) => [v.id || v.key || k, v]) : Object.entries(x || {}));
  const ALM_TABS = [['story', '📖 Story'], ['foes', '🐀 Foes'], ['home', '🏰 Home'], ['letters', '✉️ Letters']];
  function almCounts() {
    const foes = Object.keys(FOES).filter((k) => LORE.foes && LORE.foes[k]);
    return { foes: foes.filter((k) => meta.foes[k]).length, foeN: foes.length, letters: meta.letters.length, letterN: (LORE.letters || []).length, ch: Math.min(meta.chapter, (LORE.chapters || []).length), chN: (LORE.chapters || []).length };
  }
  function almPage() {
    const c = almCounts();
    if (almTab === 'story') {
      const ch = (LORE.chapters || []).slice(0, c.ch);
      return `${(LORE.premise || []).map((t) => `<p class="lead">${esc(t)}</p>`).join('')}
        ${ch.map((q, k) => `<div class="entry"><b>${k + 1}. ${esc(q.title)}</b><span>${esc(q.text)}</span></div>`).join('')}
        ${c.ch < c.chN ? `<div class="entry lock"><span>${c.chN - c.ch} more chapter${c.chN - c.ch > 1 ? 's' : ''}. Reach level ${c.ch + 1} to read on.</span></div>` : ''}
        ${best.level > CAMPAIGN && LORE.endings ? `<div class="entry"><b>The end?</b><span>${esc(LORE.endings.win || '')}</span></div>` : ''}`;
    }
    if (almTab === 'foes') {
      return Object.keys(FOES).filter((k) => LORE.foes && LORE.foes[k]).map((k) => {
        const L = LORE.foes[k], n = meta.foes[k] || 0;
        if (!n) return '<div class="entry lock foe"><i>?</i><span>Not beaten yet. It knows.</span></div>';
        return `<div class="entry foe">${foeImg(k)}<div><b>${esc(L.name || k)}</b><span>${esc(L.bio)}</span>
          ${L.likes ? `<span class="sm">Likes: ${esc(L.likes)}</span>` : ''}${L.fears ? `<span class="sm">Fears: ${esc(L.fears)}</span>` : ''}<span class="sm">Seen off: ${n}</span></div></div>`;
      }).join('');
    }
    if (almTab === 'home') {
      const cast = listOf(LORE.cast).filter(([, v]) => v && v.name).map(([, v], k) => `<div class="entry"><b>${esc(v.name)}</b><span>${esc(v.role || v.bio || '')}</span>
        ${v.secret ? `<span class="sm">${best.level > 5 + k * 3 || meta.chapter > 5 + k * 3 ? 'Secret: ' + esc(v.secret) : `Secret: reach level ${6 + k * 3}`}</span>` : ''}</div>`).join('');
      const tw = TOWER_ORDER.filter((k) => LORE.towers && LORE.towers[k]).map((k) => (meta.built[k] ? `<div class="entry"><b>${TOWERS[k].name}</b><span>${esc(LORE.towers[k].bio || LORE.towers[k])}</span><span class="sm">Built: ${meta.built[k]}</span></div>` : '<div class="entry lock"><span>A tower you have not built yet.</span></div>')).join('');
      const crew = LORE.hamsters || (LORE.cast && LORE.cast.hamsters) || null, names = crew && (crew.names || crew.members || crew.roster);
      const ham = names ? `<div class="entry"><b>${esc(crew.union || crew.name || 'The hamsters')}</b>${names.map((h) => `<span class="sm"><b>${esc(h.name || h)}</b> ${esc(h.trait || h.bio || '')}</span>`).join('')}</div>` : '';
      return `<h3>The household</h3>${cast}${ham}<h3>The towers</h3>${tw}`;
    }
    const L = LORE.letters || [];
    return `<p class="lead">Old post turns up in the mine. One letter a level, if the hamsters dig enough. Two gems each, and twelve more for the set.</p>` + L.map((q, k) => (meta.letters.includes(k)
      ? `<div class="entry letter"><span>${esc(q.text)}</span><span class="sm">${esc(q.from || '')}</span></div>` : `<div class="entry lock"><span>Letter ${k + 1} is still in the dirt.</span></div>`)).join('');
  }
  function showAlmanac() {
    screen = 'almanac';
    const c = almCounts();
    showOverlay(`<div class="tallyv alm"><div class="tbody">
      <div class="tally-sub">CHAPTERS ${c.ch}/${c.chN} · FOES ${c.foes}/${c.foeN} · LETTERS ${c.letters}/${c.letterN}</div>
      <div class="tally-title small">The Garden Almanac</div>
      <div class="tabs">${ALM_TABS.map(([id, nm]) => `<button class="tabb${almTab === id ? ' on' : ''}" data-act="alm" data-id="${id}">${nm}</button>`).join('')}</div>
      <div class="almpage">${almPage()}</div>
    </div><div class="tfoot"><button class="big" data-act="almback">Back</button></div></div>`, true);
  }
  // The Garden Gazette: one headline about what really happened in the level.
  function gazette(z) {
    const all = VO.gazette || [], fit = [], any = [];
    for (const q of all) { try { if (new Function('s', `return (${q.when});`)(z)) (String(q.when).trim() === 'true' ? any : fit).push(q); } catch (e) { /* a bad rule prints nothing */ } }
    const q = fit.length && (Math.random() < 0.85 || !any.length) ? pick(fit) : any.length ? pick(any) : null;
    return q ? q.text.replace(/\{(\w+)\}/g, (m, k) => (z[k] == null ? '' : z[k])) : '';
  }
  function showMenu() {
    mode = 'menu'; screen = 'menu'; G = null; pauseBtn.style.display = 'none'; closePop(); A.music(0);
    const saved = loadRun();
    showOverlay(`<div class="center">
      <div class="logo">Strata<br>Siege</div>
      <div class="tag">Sky, garden and mine. One thumb.</div>
      ${keeperBubble(keeperLine(saved && saved.level > 1 ? 'menuBack' : 'menu', saved ? saved.level : 1), 0)}
      ${saved && saved.level > 1 ? `<button class="big gold" data-act="continue">Continue: level ${saved.level}</button>` : ''}
      <button class="big${saved && saved.level > 1 ? ' alt' : ''}" data-act="new">New run</button>
      ${soundBtns()}
      ${LORE.premise ? '<button class="big alt" data-act="almanac">📖 The Garden Almanac</button>' : ''}
      ${best.level > 1 ? `<div class="stat">Best: level <b>${best.level}</b></div>` : ''}
      ${LORE.loading && LORE.loading.length ? `<div class="fact"><b>Garden fact</b> ${esc(pick(LORE.loading))}</div>` : ''}
      <div class="hint">Tap to build, stomp and dig. Drag to look around and to herd clouds.<br>Escape or a right click pauses.</div>
    </div>`, true);
  }
  function recipeBook() {
    const rows = RECIPES.map(([a, b, r]) => (meta.recipes[[a, b].sort().join('+')] ? `<span><b>${CLOUDS[a].name} + ${CLOUDS[b].name}</b> = ${CLOUDS[r].name}</span>` : '<span>? + ? = ?</span>'));
    return `<div class="summary">${rows.join('')}</div>`;
  }
  function showPause() {
    if (mode !== 'play') return;
    mode = 'pause'; screen = 'pause'; closePop(); A.music(0);
    const tip = tipFor(G.n) || keeperLine('tips');
    showOverlay(`<div class="center">
      <h2>Paused</h2>
      <div class="stat">Level <b>${G.n}</b>: ${G.name}</div>
      ${relicBar()}
      ${run.dare && DARE_BY_ID[run.dare] ? `<div class="chip hot">Dare: ${DARE_BY_ID[run.dare].text}</div>` : ''}
      ${keeperBubble(keeperLine('gazette') || keeperLine('tips'), 0)}
      <button class="big" data-act="resume">Resume</button>
      <button class="big alt" data-act="restart">Restart level</button>
      ${LORE.premise ? '<button class="big alt" data-act="almanac">📖 The Garden Almanac</button>' : ''}
      ${soundBtns()}
      <button class="big alt" data-act="menu">Menu</button>
      ${G.n >= FROM.sky ? `<div class="hint">Weather recipes</div>${recipeBook()}` : ''}
      <div class="hint">${tipHtml(tip)}</div>
      <div class="tricks"><b>Tricks</b>${TRICKS.filter((q) => G.n >= q[0]).map((q) => `<span>${q[1]}</span>`).join('')}</div>
    </div>`, true);
  }
  function resume() { if (mode !== 'pause') return; mode = 'play'; hideOverlay(); A.music(G.combo > 0 || BOSS_AT[G.n] ? 2 : 1); }

  function tallyLine() {
    const s = summary;
    if (s.boss) return [keeperLine('afterBoss'), 1];
    if (s.lode) return [keeperLine('motherlode'), 1];
    if (s.leaks === 0) return [keeperLine('tallyFlawless'), 1];
    if (s.hearts <= 3) return [keeperLine('tallyClose'), 2];
    if (s.leaks >= 4) return [keeperLine('tallyLeaky', s.leaks), 2];
    if (s.n >= FROM.dig + 1 && !s.usedDig) return [keeperLine('tallyNoDig'), 0];
    if (s.n >= FROM.sky + 1 && !s.usedSky) return [keeperLine('tallyNoSky'), 0];
    if (s.loot >= 4) return [keeperLine('tallyLoot', s.loot), 1];
    return [keeperLine('tallyFast'), 0];
  }
  function showTally() {
    const s = summary; screen = 'tally';
    const notes = [['Cleared', true], ['At most 2 leaks', s.leaks <= 2], ['No leaks', s.leaks === 0]];
    const [line, mood] = tallyLine();
    const next = run.level, tip = tipFor(next);
    const newTowers = TOWER_ORDER.filter((k) => TOWERS[k].from === next).map((k) => TOWERS[k].name);
    const newStock = ITEMS.filter((it) => it.at === next).map((it) => it.name);
    const chips = [];
    if (s.heat1 > s.heat0) chips.push(`<div class="chip hot">🔥 Heat ${s.heat1}: enemies are tougher, gems are worth more</div>`);
    if (s.heat1 < s.heat0) chips.push(`<div class="chip">Heat cools to ${s.heat1}</div>`);
    if (s.dare) chips.push(`<div class="chip ${s.dare.won ? 'hot' : 'bad'}">Dare, ${s.dare.name}: ${s.dare.won ? 'done!' : 'not this time'}</div>`);
    if (tip.startsWith('NEW:')) chips.push(`<div class="chip new">Next level: <b>${tip.slice(4).split('.')[0].trim()}</b></div>`);
    else if (newTowers.length) chips.push(`<div class="chip new">Next level: <b>${newTowers.join(', ')}</b></div>`);
    if (newStock.length) chips.push(`<div class="chip new">New at Gnome Depot: <b>${newStock.join(', ')}</b></div>`);
    showOverlay(`<div class="tallyv">
      <div class="tbody">
        <div class="tally-sub">LEVEL ${s.n} · ${s.name.toUpperCase()}</div>
        <div class="tally-title">${s.boss ? 'BOSS DOWN!' : s.leaks === 0 ? 'FLAWLESS!' : 'CLEARED!'}</div>
        <div class="stars">${[0, 1, 2].map((k) => `<span class="star${k < s.stars ? ' on' : ''}" style="animation-delay:${0.25 + k * 0.3}s">★</span>`).join('')}</div>
        <div class="starnotes">${notes.map(([t, ok]) => `<span class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '·'} ${t}</span>`).join('')}</div>
        <div class="trows">${s.rows.map(([t, v]) => `<div class="trow"><span>${t}</span><b>+${v}</b></div>`).join('')}
          <div class="trow total"><span>Gems</span><b>+${s.total}</b></div></div>
        ${s.news ? `<div class="gazette"><b>The Garden Gazette</b><span>${esc(s.news)}</span></div>` : ''}
        ${keeperBubble(line, mood)}
        ${chips.join('')}
      </div>
      <div class="tfoot"><button class="big gold" data-act="next">${pendingRelics ? 'Choose a relic' : 'To Gnome Depot'}</button></div>
    </div>`, true);
    for (let k = 0; k < s.stars; k++) setTimeout(() => { if (screen === 'tally') sfx.star(k); }, 250 + k * 300);
  }
  let relicChoice = [];
  function showRelic() {
    mode = 'relic'; screen = 'relic';
    relicChoice = shuffle(RELICS.filter((r) => !run.relics.includes(r.id))).slice(0, 3);
    if (!relicChoice.length) { pendingRelics = 0; afterTally(); return; }
    sfx.relic();
    showOverlay(`<div class="tallyv"><div class="tbody">
      <div class="tally-sub">${summary && summary.lode && pendingRelics === 1 ? 'FROM THE MOTHER LODE' : 'A RELIC'}</div>
      <div class="tally-title">Pick one</div>
      ${keeperBubble(keeperLine('relic'), 0)}
      <div class="relics" style="margin-top:0.8em">${relicChoice.map((r, k) => `<button class="relic" data-act="relic" data-id="${r.id}" style="animation-delay:${k * 0.12}s"><span class="ric">${r.icon}</span><span class="rnm">${r.name}</span><span class="rds">${r.desc}</span></button>`).join('')}</div>
      <div class="hint">A relic changes a rule for the rest of the run.</div>
    </div></div>`, true);
  }
  function showVictory() {
    mode = 'victory'; screen = 'victory'; summary.victory = false; sfx.cheer(3);
    showOverlay(`<div class="center">
      <div class="tally-sub">LEVEL ${CAMPAIGN} CLEARED</div>
      <div class="tally-title">The garden is saved!</div>
      <div class="stat">Stars: <b>${run.stars}</b> of ${CAMPAIGN * 3}</div>
      ${relicBar()}
      ${LORE.endings && LORE.endings.win ? `<div class="storyend">${esc(LORE.endings.win)}</div>` : ''}
      ${keeperBubble(keeperLine('victory'), 1)}
      <button class="big gold" data-act="next">Keep going: endless siege</button>
      <div class="hint">${esc((LORE.endings && (LORE.endings.endless || LORE.endings.teaser)) || 'From here on a boss comes every fifth level, and they do not get smaller.')}</div>
    </div>`, true);
  }
  function afterTally() {
    if (summary && summary.victory) { showVictory(); return; }
    if (pendingRelics > 0) { showRelic(); return; }
    openShop();
  }
  function showOver() {
    screen = 'over';
    const n = run.level, isBest = n >= best.level && n > 1;
    showOverlay(`<div class="center">
      ${isBest ? '<div class="newbest">NEW BEST</div>' : ''}
      <div class="tally-title late">The castle fell</div>
      <div class="stat">Level <b>${n}</b>: ${levelName(n)}</div>
      <div class="stat">Best: level <b>${best.level}</b></div>
      ${relicBar()}
      ${keeperBubble(keeperLine(n <= 3 ? 'overEarly' : 'over') || keeperLine('over'), 2)}
      <button class="big gold" data-act="new">New run</button>
      <button class="big alt" data-act="menu">Menu</button>
    </div>`, true);
  }

  // ---------- the shop ----------
  let shopTab = 'tow', haggling = false, potOpen = false;
  const potCost = () => 4 + Math.floor(run.level / 3);
  // The lucky flowerpot: three pots, one tap. A free upgrade, the stake twice over, or a slug.
  function potPick() {
    potOpen = false; run.potAt = run.level;
    const r = Math.random(), free = ITEMS.filter((it) => unlocked(it) && lv(it.id) < it.max);
    if (r < 0.08 && RELICS.some((q) => !run.relics.includes(q.id))) { saveRun(); sfx.relic(); pendingRelics = 1; showRelic(); return; }
    if (r < 0.42 && free.length) { const it = pick(free); run.up[it.id] = lv(it.id) + 1; shopMsg = `🪴 The pot held a free level of ${it.icon} ${it.name}!`; quip('potWin'); sfx.buy(); }
    else if (r < 0.72) { const g = potCost() * 2; run.gems += g; shopMsg = `🪴 The pot held ${g} gems!`; quip('potWin'); sfx.gem(); }
    else { shopMsg = '🐌 A slug. He seems content.'; quip('potSlug'); sfx.nope(); }
    saveRun(); showShop();
  }
  function openShop() {
    mode = 'shop'; shopMsg = ''; haggling = false; potOpen = false;
    if (run.dareAt !== run.level) { // one dare per visit
      const pool = DARES.filter((d) => d.from <= run.level && d.id !== run.lastDare);
      run.dareOffer = pool.length ? pick(pool).id : null; run.dareAt = run.level; run.dare = null; saveRun();
    }
    if (run.refunded) { shopMsg = 'The shop has new stock. Your old upgrades were sold back for gems.'; delete run.refunded; saveRun(); }
    const s = summary;
    if (s && s.boss) quip('afterBoss');
    else if (s && s.hearts <= 3) quip('lowHearts');
    else if (run.gems >= 40) quip('rich', run.gems);
    else if (run.gems < 5) quip('broke');
    else quip('open');
    if (!ITEMS.some((it) => it.cat === shopTab && unlocked(it))) shopTab = (CATS.find((c) => ITEMS.some((it) => it.cat === c.id && unlocked(it))) || CATS[0]).id;
    A.music(0);
    showShop();
  }
  function showShop(flashId) {
    screen = 'shop';
    const stock = ITEMS.filter(unlocked);
    const tabs = CATS.map((c) => {
      const mine = stock.filter((it) => it.cat === c.id);
      return `<button class="tab${c.id === shopTab ? ' on' : ''}${mine.some((it) => itemState(it) === 'ok') ? ' can' : ''}" data-act="tab" data-id="${c.id}">${c.name}</button>`;
    }).join('');
    const cards = stock.filter((it) => it.cat === shopTab).map((it) => {
      const l = lv(it.id), st = itemState(it), isNew = it.at === run.level && l === 0;
      const pips = it.max > 1 ? `<div class="pips">${Array.from({ length: it.max }, (_, k) => `<span class="pip${k < l ? ' on' : ''}"></span>`).join('')}</div>` : '';
      const capNote = it.cap ? `<div class="setline${st === 'max' ? ' on' : ''}">★ ${it.cap[0]}: ${it.cap[1]}</div>` : '';
      const btn = st === 'max' ? '<button class="buy max">MAX</button>' : `<button class="buy${st === 'poor' ? ' no' : ''}" data-act="buy" data-id="${it.id}">💎 ${itemCost(it)}</button>`;
      return `<div class="card${st === 'ok' ? ' can' : ''}${it.id === flashId ? ' flash' : ''}">${isNew ? '<span class="sale new">NEW</span>' : ''}
        <div class="top"><span class="ic">${it.icon}</span><span class="nm">${it.name}</span></div>
        <div class="ds">${it.desc(Math.min(l, it.max - 1))}</div>${capNote}${pips}${btn}</div>`;
    });
    const later = ITEMS.filter((it) => it.cat === shopTab && !unlocked(it)).sort((a, b) => a.at - b.at)[0];
    if (later) cards.push(`<div class="teaser">More stock arrives at level ${later.at}.</div>`);
    const n = run.level, tip = tipFor(n);
    const dare = DARE_BY_ID[run.dareOffer];
    let extras = '';
    if (potOpen) extras = `<div class="dare">Pick a pot:<span class="pots">${[0, 1, 2].map(() => '<button class="mini" data-act="potpick">🪴</button>').join('')}</span></div>`;
    else {
      if (dare) extras += run.dare ? `<div class="dare on">✓ Dare accepted. ${dare.text} <b>+${dareGems(n)}💎</b></div>` : `<div class="dare">I dare you. ${dare.text} <b>+${dareGems(n)}💎</b><button class="mini" data-act="dare">Accept</button></div>`;
      const canHaggle = run.haggleAt !== n, canPot = run.potAt !== n;
      if (n >= 3 && (canHaggle || canPot || haggling)) extras += `<div class="minis">${canHaggle || haggling ? `<button class="mini${haggling ? ' armed' : ''}" data-act="haggle">🤝 ${haggling ? 'Now tap a price' : 'Haggle'}</button>` : ''}${canPot ? `<button class="mini" data-act="pot"${run.gems < potCost() ? ' disabled' : ''}>🪴 Lucky pot · 💎${potCost()}</button>` : ''}</div>`;
    }
    showOverlay(`<div class="shop">
      <div class="shop-head"><div><div class="t">Gnome Depot</div><div class="sub">Next: level ${n}, ${levelName(n)}</div></div><div class="coins${flashId ? ' bump' : ''}">💎 ${run.gems}</div></div>
      ${keeperBubble(shopQuip, flashId ? 1 : 0)}
      ${shopMsg ? `<div class="shopmsg">${shopMsg}</div>` : ''}
      ${relicBar()}
      ${extras}
      <div class="tabs">${tabs}</div>
      <div class="items">${cards.join('')}</div>
      <div class="shopfoot">${tip ? `<div class="hint" style="margin:0 0 0.5em">${tipHtml(tip)}</div>` : ''}<button class="big gold" data-act="go">Start level ${n}</button></div>
    </div>`, false);
  }

  const ACTS = {
    continue() { run = loadRun() || newRun(); summary = null; if (run.level > 1) openShop(); else startLevel(); },
    new() { run = newRun(); saveRun(); summary = null; pendingRelics = 0; startLevel(); },
    resume,
    restart() { startLevel(); },
    menu() { showMenu(); },
    sfx() { muted = !muted; store.set(MUTE_KEY, muted); A.setSfx(!muted); if (screen === 'pause') { mode = 'play'; showPause(); } else showMenu(); },
    music() { musicOff = !musicOff; store.set(MUSIC_KEY, musicOff); A.setMusic(!musicOff); if (screen === 'pause') { mode = 'play'; showPause(); } else showMenu(); },
    next() { afterTally(); },
    relic(id) {
      if (!RELIC_BY_ID[id] || run.relics.includes(id)) return;
      run.relics.push(id); pendingRelics--; saveRun(); sfx.buy();
      afterTally();
    },
    tab(id) { shopTab = id; sfx.tab(); showShop(); },
    almanac() { almBack = screen === 'pause' ? 'pause' : 'menu'; sfx.tab(); showAlmanac(); },
    alm(id) { almTab = id; sfx.tab(); showAlmanac(); },
    almback() { if (almBack === 'pause' && G) { mode = 'play'; showPause(); } else showMenu(); },
    buy(id) {
      const it = ITEM_BY_ID[id]; if (!it) return;
      if (haggling) { // a coin flip: a quarter off, or a quarter on, for this visit
        haggling = false; const win = Math.random() < 0.5;
        run.haggle = { id, at: run.level, f: win ? 0.75 : 1.25 }; run.haggleAt = run.level; saveRun();
        sfx.haggle(); quip(win ? 'haggleWin' : 'haggleLose'); shopMsg = win ? `🤝 ${it.name}: a quarter off.` : `🤝 ${it.name}: a quarter more. He noticed.`;
        showShop(id); return;
      }
      const ok = buy(it); showShop(ok ? id : null);
    },
    dare() { if (!run.dareOffer) return; run.dare = run.dareOffer; run.lastDare = run.dare; saveRun(); sfx.buy(); quip('dare'); showShop(); },
    haggle() { haggling = !haggling; sfx.tab(); showShop(); },
    pot() { if (run.potAt === run.level || run.gems < potCost()) { sfx.nope(); return; } run.gems -= potCost(); saveRun(); potOpen = true; sfx.buy(); showShop(); },
    potpick() { if (potOpen) potPick(); },
    go() { startLevel(); },
  };
  ov.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    audio();
    const act = ACTS[b.dataset.act];
    if (!['buy', 'tab', 'relic', 'dare', 'haggle', 'pot', 'potpick'].includes(b.dataset.act)) sfx.tap();
    if (act) act(b.dataset.id);
  });

  // ---------- popups ----------
  // A small menu next to the tapped tile: build, upgrade, sell, collapse.
  let popOpen = false;
  function closePop() { if (!popOpen && !(G && G.sel)) return; popOpen = false; pop.className = ''; pop.innerHTML = ''; if (G) G.sel = null; }
  function openPop(html, vx, vy) {
    const sx = vx * ZOOM, sy = vy * ZOOM + VIEW_Y0;
    pop.innerHTML = html; pop.className = 'show'; popOpen = true;
    const w = pop.offsetWidth, h = pop.offsetHeight, cw = W * scale, chh = H * scale;
    let x = sx * scale - w / 2, y = sy * scale + 26 * scale;
    if (y + h > chh - BAR_H * scale - 4) y = sy * scale - h - 40 * scale;
    pop.style.left = clamp(x, 4, cw - w - 4) + 'px'; pop.style.top = clamp(y, HUD_H * scale + 4, chh - h - 4) + 'px';
  }
  function popBuild(i, j) {
    const g = groundAt(i, j), u = tileAt(i, j), p = toScreen(i + 0.5, j + 0.5, g.z);
    const notes = [];
    if (g.hill) notes.push('On a hill: towers see further.');
    if (G.n >= FROM.crystal && u.content === 'crystal' && !u.dug) notes.push('A crystal hums below: +25% damage.');
    const rows = TOWER_ORDER.filter(towerUnlocked).map((k) => {
      const D = TOWERS[k], cost = buildCost(k);
      const match = G.n >= FROM.pals ? G.towers.filter((o) => Math.abs(o.i - i) + Math.abs(o.j - j) === 1).map((o) => PALS[[k, o.k].sort().join('+')]).filter(Boolean)[0] : null;
      return `<button class="pb${G.coins < cost ? ' no' : ''}" data-act="build" data-id="${k}"><span class="pi">${D.icon}</span><span class="pn">${D.name}<small>${match ? `♥ ${match[0]}: ${match[1]}` : D.desc}</small></span><span>${cost}</span></button>`;
    });
    const next = TOWER_ORDER.find((k) => !towerUnlocked(k));
    G.sel = { i, j };
    openPop(`<div class="ptitle">Build here</div>${notes.length ? `<div class="pinfo">${notes.join(' ')}</div>` : ''}${rows.join('')}
      ${next ? `<div class="pinfo" style="margin:0.5em 0 0">Next: ${TOWERS[next].name} at level ${TOWERS[next].from}</div>` : ''}`, p.x, p.y);
  }
  function popTower(t) {
    const D = TOWERS[t.k], p = toScreen(t.x, t.y, t.z), up = upgradeCost(t);
    G.sel = { i: t.i, j: t.j, tower: t };
    const extra = [t.hill ? 'hill' : '', t.crystal ? 'crystal' : '', t.sunny ? 'sunny' : ''].filter(Boolean).join(', ');
    const pals = Object.keys(t.pals || {}).map((k) => `<br>♥ ${PALS[k][0]}: ${PALS[k][1]}.`).join('');
    openPop(`<div class="ptitle">${D.icon} ${D.name} · level ${t.lvl}</div>
      <div class="pinfo">Damage ${Math.round(towerDmg(t))}, range ${towerRange(t).toFixed(1)}${extra ? ` (${extra})` : ''}.<br>${t.lvl >= 3 ? '★ ' : 'At level 3: '}${D.cap}${pals}</div>
      <div class="prow">${t.lvl < 3 ? `<button class="pb${G.coins < up ? ' no' : ''}" data-act="upgrade"><span class="pn">Upgrade</span><span>${up}</span></button>` : '<button class="pb no"><span class="pn">MAX</span></button>'}
      <button class="pb alt" data-act="sell"><span class="pn">Sell</span><span>+${sellValue(t)}</span></button></div>`, p.x, p.y - 30);
  }
  function popPit(t) {
    const p = toScreen(t.i + 0.5, t.j + 0.5, DIG_Z);
    G.sel = { i: t.i, j: t.j, dig: t };
    openPop(`<div class="ptitle">A tunnel under the path</div><div class="pinfo">Collapse it: for ${PIT_S} seconds walkers fall into the pit. Afterwards it is mud.</div>
      <button class="pb${G.coins < PIT_COST ? ' no' : ''}" data-act="pit"><span class="pi">🕳️</span><span class="pn">Collapse</span><span>${PIT_COST}</span></button>`, p.x, p.y);
  }
  pop.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  pop.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b || !G || !G.sel || mode !== 'play') return;
    const sel = G.sel, act = b.dataset.act;
    if (act === 'build') { if (tryBuild(b.dataset.id, sel.i, sel.j)) closePop(); }
    else if (act === 'upgrade') { if (tryUpgrade(sel.tower)) popTower(sel.tower); }
    else if (act === 'sell') { sellTower(sel.tower); closePop(); }
    else if (act === 'pit') { if (collapse(sel.dig)) closePop(); }
  });

  // ---------- layers ----------
  const ORDER = { sky: 0, ground: 1, dig: 2 };
  const layerOpen = (l) => l === 'ground' || G.n >= FROM[l];
  function setLayer(l, instant) {
    if (!G || G.trans || l === G.layer) return;
    if (!layerOpen(l)) { sfx.nope(); toast(`The ${l === 'sky' ? 'sky' : 'mine'} opens at level ${FROM[l]}`); return; }
    closePop(); G.armed = false; G.chalk = false; ptr.cloud = null; G.drag = null;
    if (!instant) G.trans = { from: G.layer, to: l, t: 0, T: 0.46 };
    if (ORDER[l] > ORDER[G.layer]) sfx.layerDown(); else sfx.layerUp();
    A.layer(l); G.layer = l; G.visited[l]++;
  }

  // ---------- picking ----------
  // The tile under a screen point. Higher tiles are tried first, and the one nearest to the viewer wins.
  function pickTile(sx, sy, zs, zOf) {
    let hit = null;
    for (const z of zs) {
      const w = toWorld(sx, sy, z), i = Math.floor(w.wx), j = Math.floor(w.wy);
      if (inMap(i, j) && Math.abs(zOf(i, j) - z) < 1e-6 && (!hit || i + j > hit.i + hit.j)) hit = { i, j, wx: w.wx, wy: w.wy };
    }
    return hit;
  }
  const EDGE_Z = ART.SLAB_Z == null ? -SLAB / ZU : ART.SLAB_Z, UG_EDGE = DIG_Z - 0.4;
  const gz = (i, j) => { const g = groundAt(i, j); return g ? g.z : EDGE_Z; };
  const uz = (i, j) => { const u = tileAt(i, j); return u ? (u.dug ? DIG_Z : 0) : UG_EDGE; };
  const near = (sx, sy, wx, wy, z, r) => { const p = toScreen(wx, wy, z); return Math.hypot(sx - p.x, sy - p.y) < r; };
  function cloudAt(sx, sy) {
    let bestC = null;
    for (const c of G.clouds) {
      const p = toScreen(c.x, c.y, CLOUD_Z), k = c.big ? 1.45 : 1;
      if (Math.abs(sx - p.x) < 40 * k && sy > p.y - 50 * k && sy < p.y + 10 && (!bestC || c.x + c.y > bestC.x + bestC.y)) bestC = c;
    }
    return bestC;
  }

  // ---------- taps ----------
  function tapGround(sx, sy) {
    const cp = toScreen(G.castle.x, G.castle.y, 0);
    if (Math.abs(sx - cp.x) < 36 && sy > cp.y - 86 && sy < cp.y + 14) {
      if (G.kettle === 1) { throwKettle(); return; }
      if (!swat()) toast(`Grandma is in. ${G.hearts} heart${G.hearts === 1 ? '' : 's'} left. Tap here when the bell rings`);
      return;
    }
    for (const g of G.eggs) if (!g.gone && near(sx, sy + 8, g.x, g.y, 0, 20)) { crackEgg(g); return; }
    for (const e of G.enemies) if (e.state === 'under' && near(sx, sy, e.x, e.y, 0, 26)) { stompAt(e.x, e.y); return; }
    // the path belongs to the Boot: a tower standing in front of it must not swallow a stomp
    const hit = pickTile(sx, sy, [0.32, 0.16, 0, -0.18], gz);
    const road = hit && ['path', 'mud'].includes(groundAt(hit.i, hit.j).t);
    let tw = null;
    for (const t of G.towers) {
      const p = toScreen(t.x, t.y, t.z);
      if (Math.abs(sx - p.x) < (road ? 14 : 20) && sy > p.y - (road ? 34 : 70) && sy < p.y + 12 && (!tw || t.i + t.j > tw.i + tw.j)) tw = t;
    }
    if (tw) { sfx.tap(); popTower(tw); return; }
    if (!hit) return;
    const g = groundAt(hit.i, hit.j);
    if (g.obj === 'hut') { setLayer('dig'); return; }
    if (g.t === 'path' || g.t === 'mud') { stompAt(clamp(hit.wx, hit.i + 0.2, hit.i + 0.8), clamp(hit.wy, hit.j + 0.2, hit.j + 0.8)); return; }
    if (canBuildOn(g)) { sfx.tap(); popBuild(hit.i, hit.j); return; }
    if (g.obj === 'tree') say(hit.i + 0.5, hit.j + 0.5, 1, 'A tree. It was here first', '#c9d0ff');
  }
  function tapDig(sx, sy) {
    for (const g of G.gems) if (near(sx, sy + 6, g.x, g.y, DIG_Z, 24)) { takeGem(g); return; }
    for (const e of G.enemies) {
      if (e.dead || (e.state !== 'under' && e.state !== 'tunnel') || !near(sx, sy + 12, e.x, e.y, DIG_Z, 28)) continue;
      if (e.state === 'under') bonk(e, false);
      else { sfx.bonk(); mark('dig'); e.stun = Math.max(e.stun, 0.4); onLayer('dig', () => { burst(e.x, e.y, DIG_Z + 0.3, '#ffe680', 6); hurt(e, e.maxhp * 0.5); }); }
      return;
    }
    for (const h of G.hamsters) if (h.state === 'dig' && h.daze <= 0 && near(sx, sy + 14, h.x, h.y, DIG_Z, 22)) { cheer(h); return; }
    // the grid of the mine is its top: a tap in the mouth of a hole means that hole
    const w = toWorld(sx, sy, 0), t = tileAt(Math.floor(w.wx), Math.floor(w.wy));
    if (!t) return;
    if (!t.dug && G.chalk) { if (t.queued) cancelDig(t); t.chalk = !t.chalk; sfx.tap(); mark('dig'); return; }
    if (!t.dug) {
      if (t.chalk) { sfx.nope(); onLayer('dig', () => say(t.i + 0.5, t.j + 0.5, 0.4, 'Chalked. Use the chalk to rub it out', '#c9d0ff')); }
      else if (t.queued) cancelDig(t);
      else if (canQueue(t)) orderDig(t);
      else { sfx.nope(); onLayer('dig', () => say(t.i + 0.5, t.j + 0.5, 0.4, 'Dig next to a tunnel', '#c9d0ff')); }
    } else if (G.armed) placeStick(t);
    else if (canPit(t)) { sfx.tap(); popPit(t); }
  }
  function barRects() {
    const y = H - BAR_H + 8, h = BAR_H - 16;
    return { sky: [6, y, 58, h], ground: [68, y, 58, h], dig: [130, y, 58, h], tool: [196, y, 62, h], wave: [264, y, 146, h], speed: [416, y, 58, h] };
  }
  const inRect = (r, x, y) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
  const BELL = [W / 2 - 44, HUD_H + 10, 88, 56];
  function tap(sx, sy) {
    if (G.trans) return;
    if (G.banner > 0.4) G.banner = 0.4;
    if (G.letter && G.letter.t > 0.3 && G.letter.t < G.letter.T - 1) { G.letter.t = 0.3; if (sy < HUD_H + 190 && sy > HUD_H) return; }
    if (sy >= H - BAR_H) {
      const R = barRects();
      for (const l of LAYERS) if (inRect(R[l], sx, sy)) { setLayer(l); return; }
      if (inRect(R.wave, sx, sy)) { callWave(); return; }
      if (inRect(R.speed, sx, sy)) { speed = speed === 1 ? 2 : 1; sfx.tab(); return; }
      if (inRect(R.tool, sx, sy)) {
        if (G.layer === 'dig') { // the tool of the mine: pick, chalk, dynamite
          sfx.tab();
          if (!G.chalk && !G.armed) { G.chalk = true; toast('Chalk: tap dirt that you think is dangerous. Hamsters leave it alone, and a right mark pays a gem at the end'); }
          else if (G.chalk && G.n >= FROM.dynamite && G.dyn > 0) { G.chalk = false; G.armed = true; toast('Dynamite: tap a tunnel to place the stick. It opens the tiles around it and shakes the garden above'); }
          else { G.chalk = false; G.armed = false; }
        }
        else if (G.layer === 'ground') toast(`The Boot: tap the path to stomp. ${G.boot.n} of ${bootMax()} ready`);
        else if (G.layer === 'sky') toast(`Anchors: tap a weather cloud to pin it. ${G.anchors} of ${anchorMax()} used`);
        else toast('Tap dirt next to a tunnel to dig. Tap a digging hamster to cheer it on');
      }
      return;
    }
    if (sy < HUD_H) return;
    if (G.layer !== 'ground' && ringing() && inRect(BELL, sx, sy)) { swat(); return; }
    const vx = sx / ZOOM, vy = (sy - VIEW_Y0) / ZOOM;
    if (G.layer === 'ground') tapGround(vx, vy);
    else if (G.layer === 'dig') tapDig(vx, vy);
    else {
      // a tap on a foe standing in a storm's shadow calls the bolt, even where the cloud itself overlaps it
      const w = toWorld(vx, vy, 0);
      const onFoe = G.enemies.some((e) => !e.dead && !hidden(e) && dist(e.x, e.y, w.wx, w.wy) < 0.7 + e.F.r);
      if (onFoe && callBolt(w.wx, w.wy)) return;
      const c = cloudAt(vx, vy); if (c) toggleAnchor(c); else callBolt(w.wx, w.wy);
    }
  }

  // ---------- input ----------
  const ptr = { down: false, id: -1, x0: 0, y0: 0, x: 0, y: 0, moved: false, cloud: null, cam0: 0, eat: false, ox: 0, oy: 0 };
  function evPos(ev) { const r = canvas.getBoundingClientRect(); return { x: (ev.clientX - r.left) / scale, y: (ev.clientY - r.top) / scale }; }
  canvas.addEventListener('pointerdown', (ev) => {
    audio();
    if (ev.button === 2 || mode !== 'play' || !G) return;
    const p = evPos(ev);
    Object.assign(ptr, { down: true, id: ev.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y, moved: false, cloud: null, cam0: cam.x, eat: false, vx: 0, vy: 0, lt: 0, px: null, dir: 0, turnX: null, revs: [] });
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    if (popOpen) {
      closePop();
      const h = G.layer === 'ground' && p.y > HUD_H && p.y < H - BAR_H && pickTile(p.x / ZOOM, (p.y - VIEW_Y0) / ZOOM, [0.32, 0.16, 0, -0.18], gz);
      if (!(h && ['path', 'mud'].includes(groundAt(h.i, h.j).t))) { ptr.eat = true; return; }
    }
    if (G.layer === 'sky' && !G.trans && p.y > HUD_H && p.y < H - BAR_H) {
      const vx = p.x / ZOOM, vy = (p.y - VIEW_Y0) / ZOOM, c = cloudAt(vx, vy);
      if (c) { const q = toScreen(c.x, c.y, CLOUD_Z); ptr.cloud = c; ptr.ox = q.x - vx; ptr.oy = q.y - vy; }
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!ptr.down || ev.pointerId !== ptr.id || !G) return;
    const p = evPos(ev); ptr.x = p.x; ptr.y = p.y;
    if (!ptr.moved && Math.hypot(p.x - ptr.x0, p.y - ptr.y0) > 9) ptr.moved = true;
    if (!ptr.moved || ptr.eat || mode !== 'play') return;
    if (ptr.cloud) {
      const c = ptr.cloud, w = toWorld(p.x / ZOOM + ptr.ox, (p.y - VIEW_Y0) / ZOOM + ptr.oy, CLOUD_Z), now = performance.now();
      const nx = clamp(w.wx, 0.3, N - 0.3), ny = clamp(w.wy, 0.3, N - 0.3), el = Math.max(0.008, (now - (ptr.lt || now - 16)) / 1000);
      // the speed of the thumb, for a flick
      ptr.vx = 0.6 * (ptr.vx || 0) + 0.4 * (nx - c.x) / el; ptr.vy = 0.6 * (ptr.vy || 0) + 0.4 * (ny - c.y) / el; ptr.lt = now;
      c.x = nx; c.y = ny; c.vx = c.vy = 0; G.drag = c;
      // to and fro, four times in a second: the cloud is wrung out
      const dir = Math.sign(p.x - (ptr.px == null ? p.x : ptr.px)); ptr.px = p.x;
      if (dir && dir !== ptr.dir && Math.abs(p.x - (ptr.turnX == null ? ptr.x0 : ptr.turnX)) > 14) {
        ptr.dir = dir; ptr.turnX = p.x; ptr.revs = (ptr.revs || []).filter((q) => now - q < 1000); ptr.revs.push(now);
        if (ptr.revs.length >= 4 && !CLOUDS[c.t].raw && wring(c)) { ptr.cloud = null; G.drag = null; ptr.eat = true; }
      }
    } else if (ptr.y0 > HUD_H && ptr.y0 < H - BAR_H) cam.x = clamp(ptr.cam0 - (p.x - ptr.x0) / ZOOM, -PAN_MAX, PAN_MAX);
  });
  function dragTarget(c) {
    let o = null, od = 0.85;
    for (const q of G.clouds) { if (q === c) continue; const d = dist(q.x, q.y, c.x, c.y); if (d < od) { od = d; o = q; } }
    return o;
  }
  function pointerEnd(ev) {
    if (!ptr.down || ev.pointerId !== ptr.id) return;
    ptr.down = false;
    if (!G || mode !== 'play' || ptr.eat) { ptr.cloud = null; if (G) G.drag = null; return; }
    if (ptr.cloud && ptr.moved) {
      const c = ptr.cloud, o = dragTarget(c);
      if (o && !mergeClouds(c, o)) { // they will not mix: step aside
        sfx.nope(); onLayer('sky', () => say(c.x, c.y, CLOUD_Z + 0.9, 'They will not mix', '#c9d0ff'));
        const a = Math.atan2(c.y - o.y, c.x - o.x) || 0; c.x = clamp(o.x + Math.cos(a) * 1.1, 0.3, N - 0.3); c.y = clamp(o.y + Math.sin(a) * 1.1, 0.3, N - 0.3);
      } else if (!o) {
        sfx.puff(); if (!CLOUDS[c.t].raw) mark('sky');
        const sp = Math.hypot(ptr.vx, ptr.vy);
        if (sp > 3 && performance.now() - ptr.lt < 90) { const k = Math.min(1, 11 / sp); c.vx = ptr.vx * k; c.vy = ptr.vy * k; }
      }
    } else if (!ptr.moved && ev.type === 'pointerup') tap(ptr.x, ptr.y);
    ptr.cloud = null; G.drag = null;
  }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  function togglePause() { if (mode === 'play') showPause(); else if (mode === 'pause') resume(); }
  pauseBtn.addEventListener('click', () => { audio(); sfx.tap(); togglePause(); });
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); togglePause(); return; }
    if (mode !== 'play' || !G) return;
    if (ev.key === '1') setLayer('sky'); else if (ev.key === '2') setLayer('ground'); else if (ev.key === '3') setLayer('dig');
    else if (ev.key === ' ') { ev.preventDefault(); callWave(); }
  });
  // a right click pauses, and never opens the browser menu
  window.addEventListener('contextmenu', (ev) => ev.preventDefault(), true);
  for (const type of ['pointerdown', 'mousedown']) window.addEventListener(type, (ev) => {
    if (ev.button !== 2) return;
    ev.preventDefault(); ev.stopPropagation();
    if (type === 'pointerdown') togglePause();
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') showPause(); });

  // ---------- drawing: helpers ----------
  let T = 0; // seconds of wall time, for animation
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  let textK = 1; // text inside the world is drawn larger, because the world is drawn smaller
  function text(s, x, y, color = '#ffffff', px = 13, align = 'center', outline = false, bold = true) {
    px *= textK;
    ctx.font = `${bold ? '800 ' : '600 '}${px}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    if (outline) { ctx.lineWidth = Math.max(2.5, px / 4.5); ctx.strokeStyle = 'rgba(12,14,30,0.85)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }
  function wrapLines(s, px, maxW) {
    ctx.font = `600 ${px}px ${FONT}`;
    const out = []; let line = '';
    for (const w of s.split(' ')) { const tryL = line ? line + ' ' + w : w; if (ctx.measureText(tryL).width > maxW && line) { out.push(line); line = w; } else line = tryL; }
    if (line) out.push(line);
    return out;
  }
  // a circle on a layer, seen from the corner: an ellipse
  function isoEllipse(wx, wy, z, r) { const p = toScreen(wx, wy, z); ctx.beginPath(); ctx.ellipse(p.x, p.y, r * Math.SQRT2 * HW, r * Math.SQRT2 * HH, 0, 0, 7); }
  function shadow(wx, wy, z, r, a = 0.22) { const p = toScreen(wx, wy, z); ctx.fillStyle = `rgba(10,14,30,${a})`; ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r / 2, 0, 0, 7); ctx.fill(); }
  const P_SCREEN = (wx, wy, z) => toScreen(wx, wy, z);
  function tilePath(i, j, z, inset = 0) {
    const a = toScreen(i + inset, j + inset, z), b = toScreen(i + 1 - inset, j + inset, z), c = toScreen(i + 1 - inset, j + 1 - inset, z), d = toScreen(i + inset, j + 1 - inset, z);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
  }

  // ---------- drawing: layer caches ----------
  // The terrain of a layer is painted once into a canvas. Only what moves is drawn every frame.
  const layerCv = {};
  function paintUg(c, P, u) {
    ART.ugTile(c, P, u, uz(u.i + 1, u.j), uz(u.i, u.j + 1));
    if (u.dug) return;
    const top = (col) => { const a = P(u.i, u.j, 0), b = P(u.i + 1, u.j, 0), d = P(u.i + 1, u.j + 1, 0), e = P(u.i, u.j + 1, 0); c.fillStyle = col; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); c.lineTo(e.x, e.y); c.closePath(); c.fill(); };
    const g = groundAt(u.i, u.j);
    if (g.t === 'path' || g.t === 'mud') top('rgba(255,225,170,0.10)'); // the path runs above this tile
    if (!u.known) top('rgba(8,5,4,0.3)');
  }
  function buildLayer(name) {
    const w = Math.ceil(CACHE_W * SZ), h = Math.ceil(CACHE_H * SZ);
    const cv = layerCv[name] || (layerCv[name] = document.createElement('canvas'));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h); c.setTransform(SZ, 0, 0, SZ, 0, 0);
    for (let d = 0; d <= 2 * (N - 1); d++) for (let i = Math.max(0, d - N + 1); i <= Math.min(d, N - 1); i++) {
      const j = d - i;
      if (name === 'ground') ART.groundTile(c, PC, groundAt(i, j), gz(i + 1, j), gz(i, j + 1));
      else if (name === 'dig') paintUg(c, PC, tileAt(i, j));
      else {
        ART.skyTile(c, PC, i, j);
        const g = groundAt(i, j);
        if (g.t === 'path' || g.t === 'mud' || g.obj === 'castle') { // the path below, seen through the glass
          const a = PC(i, j, 0), b = PC(i + 1, j, 0), e = PC(i + 1, j + 1, 0), f = PC(i, j + 1, 0);
          c.fillStyle = g.obj === 'castle' ? 'rgba(255,120,140,0.45)' : 'rgba(255,225,160,0.34)';
          c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(e.x, e.y); c.lineTo(f.x, f.y); c.closePath(); c.fill();
        }
      }
    }
    cacheDirty[name] = false;
  }
  function drawCache(name, off) {
    if (cacheDirty[name] || !layerCv[name]) buildLayer(name);
    const cv = layerCv[name];
    ctx.drawImage(cv, Math.round(mapLeft() * SZ) / SZ, Math.round((MAP_Y + view.dy + off) * SZ) / SZ, cv.width / SZ, cv.height / SZ);
  }

  // ---------- drawing: creatures ----------
  function foeXY(e) { // an enemy at the door runs round to the front step
    if (e.state !== 'ring') return e;
    const C = G.castle, dx = C.flip ? 0.62 : 0, dy = C.flip ? 0 : 0.62, p = routeAt(G.len - 0.62), f = clamp((ringS() - e.ring) / 0.35, 0, 1);
    return { x: p.x + (C.x + dx - p.x) * f, y: p.y + (C.y + dy - p.y) * f, fx: C.flip ? -1 : 0, fy: C.flip ? 0 : -1 };
  }
  function drawFoe(e, z, alt) {
    const q = foeXY(e), fx = q.fx == null ? e.fx : q.fx, fy = q.fy == null ? e.fy : q.fy, front = fx > 0 || fy > 0, mirrored = (fy !== 0) !== (!front);
    const o = {};
    if (!front) o.back = true;
    if (alt) o.alt = alt;
    if (!alt && (e.t + e.wob) % 3.3 < 0.13) o.blink = true;
    const s = foeSpr(e.F.art || e.k, o, e.flash > 0), p = toScreen(q.x, q.y, z);
    const K = e.k === 'king' ? 1.9 - 0.45 * e.gen : 1; // King Rat is a big rat
    const still = e.stun > 0 && !(e.dance > 0) && e.state !== 'ring';
    const ph = still || e.fly ? 0 : Math.abs(Math.sin(e.t * (e.state === 'ring' || e.dance > 0 ? 9 : 5 + e.spd * 2) + e.wob));
    const bob = e.fly ? Math.sin(e.t * 3 + e.wob) * 3 : -ph * (e.F.boss ? 3 : 5);
    const sq = 1 - ph, sx = e.fly ? 1 : 1 + 0.1 * sq - 0.05 * ph, sy = e.fly ? 1 : 1 - 0.1 * sq + 0.08 * ph;
    const y = p.y + bob - (e.drop || 0) * ZU;
    if (e.spin > 0) { ctx.save(); ctx.translate(p.x, y - s.h * 0.4); ctx.rotate(e.spin * 14); ctx.translate(-p.x, -(y - s.h * 0.4)); blit(s, p.x, y, K, K, mirrored); ctx.restore(); }
    else blit(s, p.x, y, sx * K, sy * K, mirrored);
    if (e.frozen > 0) { ctx.fillStyle = 'rgba(190,243,255,0.45)'; ctx.beginPath(); ctx.ellipse(p.x, y - s.ay * 0.45, s.w * 0.42, s.ay * 0.5, 0, 0, 7); ctx.fill(); }
    const top = y - s.ay * sy * K - 2;
    if (e.k === 'king') { // his crown
      const cw = 9 * K, cy = top + 7 * K;
      ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.beginPath();
      ctx.moveTo(p.x - cw / 2, cy); ctx.lineTo(p.x - cw / 2, cy - cw * 0.6); ctx.lineTo(p.x - cw / 4, cy - cw * 0.3); ctx.lineTo(p.x, cy - cw * 0.75); ctx.lineTo(p.x + cw / 4, cy - cw * 0.3); ctx.lineTo(p.x + cw / 2, cy - cw * 0.6); ctx.lineTo(p.x + cw / 2, cy); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (e.tw === 'fancy') { ctx.fillStyle = '#ff7ad9'; ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x - 5, top + 6); ctx.lineTo(p.x, top - 7); ctx.lineTo(p.x + 5, top + 6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ffe680'; ctx.beginPath(); ctx.arc(p.x, top - 7, 2, 0, 7); ctx.fill(); }
    if (e.wanted) { const wy = top - 12 + Math.sin(T * 5) * 2; ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, wy, 8, 0, 7); ctx.fill(); ctx.stroke(); text('★', p.x, wy + 0.5, '#7a4a00', 10); }
    if (e.lost > 0) text('?', p.x + 12, top + 2, '#ffffff', 15, 'center', true);
    if (e.hp < e.maxhp) {
      const w = e.F.boss ? 54 : e.k === 'king' ? 34 : 22, f = clamp(e.hp / e.maxhp, 0, 1);
      ctx.fillStyle = 'rgba(12,14,30,0.75)'; ctx.fillRect(p.x - w / 2 - 1, top - 5, w + 2, 5);
      ctx.fillStyle = f > 0.5 ? '#7cf28a' : f > 0.25 ? '#ffd84a' : '#ff5a7a'; ctx.fillRect(p.x - w / 2, top - 4, w * f, 3);
    }
    if (e.state === 'ring') {
      const f = clamp(e.ring / ringS(), 0, 1);
      ctx.strokeStyle = '#ff5a7a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, top - 14, 8, -Math.PI / 2, -Math.PI / 2 + f * 6.283); ctx.stroke();
      icon('bell', p.x + Math.sin(T * 30) * 1.5, top - 14, 14);
    }
    if (e.stun > 0 && e.state === 'walk' && !(e.dance > 0)) for (let k = 0; k < 2; k++) text('✦', p.x + Math.cos(T * 6 + k * 3.14) * 9, top - 3 + Math.sin(T * 6 + k * 3.14) * 3, '#ffe680', 9);
    if (e.dance > 0) text('♪', p.x + 10, top - 4 - (T * 20 % 8), '#ff9ad8', 12);
  }
  function hamsterAlt(h) { return h.daze > 0 ? 'daze' : h.state === 'dig' ? 'dig' : null; }
  function drawHamster(h, k) {
    const front = h.fx > 0 || h.fy > 0, mirrored = (h.fy !== 0) !== (!front);
    const o = {};
    if (!front) o.back = true;
    const alt = hamsterAlt(h); if (alt) o.alt = alt;
    o.pack = Math.min(3, h.pack.length);
    const idle = h.state === 'idle' && h.daze <= 0;
    const ox = idle ? (k - (G.hamsters.length - 1) / 2) * 0.2 : 0;
    const p = toScreen(h.x + ox, h.y - ox, DIG_Z);
    const ph = h.state === 'dig' ? Math.abs(Math.sin(T * (h.cheer > 0 ? 18 : 10) + k)) : idle || h.daze > 0 ? 0 : Math.abs(Math.sin(T * 12 + k));
    shadow(h.x + ox, h.y - ox, DIG_Z, 11, 0.3);
    blit(foeSpr('hamster', o), p.x, p.y - ph * 3, 1 + 0.06 * (1 - ph), 1 - 0.06 * (1 - ph), mirrored);
    if (h.cheer > 0) text('!', p.x + 12, p.y - 34, '#ffe680', 13, 'center', true);
    if (idle && !G.orders.length && h.i === G.hut.i && h.j === G.hut.j && T % 3 < 1.5 && k === 0) text('z', p.x + 12, p.y - 30 - (T % 1.5) * 6, '#c9d0ff', 11);
  }

  // ---------- drawing: the ground ----------
  function drawGround() {
    // decals: crystals, cloud shadows, ranges, pits
    if (G.n >= FROM.crystal) for (const t of G.ug) if (t.content === 'crystal' && !t.dug) {
      const p = toScreen(t.i + 0.5, t.j + 0.5, gz(t.i, t.j)), a = 0.5 + 0.5 * Math.sin(T * 3 + t.i * 2 + t.j);
      ctx.fillStyle = `rgba(185,168,255,${0.25 + 0.3 * a})`; ctx.beginPath(); ctx.ellipse(p.x, p.y, 15, 7.5, 0, 0, 7); ctx.fill();
      text('✦', p.x, p.y - 1, `rgba(255,255,255,${0.5 + 0.5 * a})`, 10);
    }
    for (const c of G.clouds) {
      const D = CLOUDS[c.t];
      isoEllipse(c.x, c.y, 0, D.raw ? 0.6 : cloudR(c));
      if (D.raw) { ctx.fillStyle = 'rgba(20,30,60,0.10)'; ctx.fill(); continue; }
      ctx.fillStyle = `rgba(${D.tint},0.22)`; ctx.fill(); ctx.strokeStyle = `rgba(${D.tint},0.6)`; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -T * 8; ctx.stroke(); ctx.setLineDash([]);
    }
    for (const p of G.puddles) { isoEllipse(p.x, p.y, 0.02, p.r * (p.stink ? 1 + 0.06 * Math.sin(T * 5) : 1)); ctx.fillStyle = `rgba(${p.stink ? '150,220,90' : '217,140,60'},${0.2 + 0.25 * Math.min(1, p.t)})`; ctx.fill(); }
    for (const p of G.pits) if (p.t > 0) { const q = toScreen(p.i + 0.5, p.j + 0.5, 0); ctx.globalAlpha = Math.min(1, p.t * 2); blit(art('pit'), q.x, q.y); ctx.globalAlpha = 1; }
    const sel = G.sel;
    if (sel && !sel.dig) {
      const z = gz(sel.i, sel.j);
      if (sel.tower) { isoEllipse(sel.tower.x, sel.tower.y, z, towerRange(sel.tower)); ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.stroke(); }
      tilePath(sel.i, sel.j, z, 0.04); ctx.strokeStyle = `rgba(255,255,255,${0.7 + 0.3 * Math.sin(T * 6)})`; ctx.lineWidth = 2.5; ctx.stroke();
    }
    for (const s of G.stomps) if (!s.done) { const f = 1 - s.t / BOOT_DELAY; isoEllipse(s.x, s.y, 0.02, bootR() * (0.4 + 0.6 * f)); ctx.fillStyle = `rgba(10,14,30,${0.15 + 0.3 * f})`; ctx.fill(); }

    // bodies, from the back of the map to the front
    const list = [];
    const add = (d, f) => list.push({ d, f });
    for (const g of G.map) {
      if (typeof g.obj !== 'string') continue;
      const p = toScreen(g.i + 0.5, g.j + 0.5, g.z);
      if (g.obj === 'tree') add(g.i + g.j + 1, () => blit(art('tree', { seed: Math.floor(g.seed * 4) & 3 }), p.x, p.y));
      else if (g.obj === 'hut') add(g.i + g.j + 1, () => { blit(art('hut'), p.x, p.y); if (G.n >= FROM.dig && G.layer === 'ground' && G.gems.length) text('!', p.x, p.y - 52 - Math.abs(Math.sin(T * 6)) * 4, '#8fe6ff', 18, 'center', true); });
      else if (g.obj === 'castle') add(g.i + g.j + 1, () => {
        const k = G.doorT > 0 ? 1 + 0.06 * Math.sin(G.doorT * 30) : 1;
        blit(art('castle', { door: G.doorT > 0 ? 1 : 0 }), p.x, p.y, k, 2 - k, G.castle.flip);
        if (G.kettle === 1) { const hy = p.y - 100 - Math.abs(Math.sin(T * 6)) * 6; text('♨', p.x, hy, '#ffffff', 22, 'center', true); text('TAP!', p.x, hy + 18, '#ffe680', 12, 'center', true); }
        else if (ringing()) { const b = art('bell'); blit(b, p.x + Math.sin(T * 34) * 3, p.y - 92, 1.3, 1.3); }
        else if (G.swatT > 0) { ctx.fillStyle = 'rgba(12,14,30,0.6)'; ctx.fillRect(p.x - 16, p.y - 92, 32, 5); ctx.fillStyle = '#ffe680'; ctx.fillRect(p.x - 15, p.y - 91, 30 * (1 - G.swatT / swatS()), 3); }
      });
    }
    for (const t of G.towers) for (const key in t.pals || {}) {
      const o = t.pals[key];
      if (o.i + o.j < t.i + t.j) continue;
      add(o.i + o.j + 1.05, () => { const p = toScreen((t.x + o.x) / 2, (t.y + o.y) / 2, Math.max(t.z, o.z) + 0.45 + 0.05 * Math.sin(T * 4 + t.i)); text('♥', p.x, p.y, '#ff7ad9', 13, 'center', true); });
    }
    for (const t of G.towers) add(t.i + t.j + 1, () => {
      const p = toScreen(t.x, t.y, t.z), b = t.born > 0 ? t.born / 0.35 : 0, k = t.kick > 0 ? t.kick / 0.12 : 0;
      blit(art(t.k, { lvl: t.lvl }), p.x, p.y, 1 + 0.25 * b - 0.05 * k, 1 - 0.25 * b + 0.07 * k);
      if (t.crystal) text('✦', p.x + 16, p.y - 8, '#b9a8ff', 11, 'center', true);
      if (t.sunny) text('☀', p.x - 16, p.y - 8, '#ffe680', 11, 'center', true);
    });
    for (const e of G.enemies) {
      if (e.dead || e.fly || e.state === 'tunnel') continue;
      const q = foeXY(e);
      if (e.state === 'under') add(e.x + e.y, () => { const p = toScreen(e.x, e.y, 0); blit(art('ridge'), p.x, p.y + Math.sin(e.t * 16) * 1, 1 + 0.08 * Math.sin(e.t * 16), 1); if (e.flash > 0) text('Bonk!', p.x, p.y - 22, '#ffe680', 11, 'center', true); });
      else if (e.state === 'fall') add(e.x + e.y, () => { const p = toScreen(e.x, e.y, 0); text('!', p.x, p.y - 12 - Math.sin(e.fallT * 9) * 4, '#ffd9b0', 14, 'center', true); });
      else add(q.x + q.y + (e.state === 'ring' ? 0.5 : 0), () => { shadow(q.x, q.y, 0, e.F.boss ? 24 : e.k === 'king' ? 20 - 4 * e.gen : 11); drawFoe(e, 0, e.k === 'beetle' && e.flip > 0 ? 'flip' : e.k === 'hedgehog' && (e.curl > 0 || e.bowl > 0) ? 'ball' : e.k === 'frog' && e.air ? 'hop' : null); });
    }
    for (const g of G.eggs) add(g.x + g.y, () => { const p = toScreen(g.x, g.y, 0), w = g.t < 1.5 ? Math.sin(T * 40) * 2 : 0; shadow(g.x, g.y, 0, 8); blit(art('egg'), p.x + w, p.y); });
    for (const pl of G.peels) add(pl.x + pl.y - 0.3, () => {
      if (pl.land > 0) { const f = 1 - pl.land / 0.5, p = toScreen(pl.fromX + (pl.x - pl.fromX) * f, pl.fromY + (pl.y - pl.fromY) * f, 0.9 * (1 - f) + Math.sin(f * Math.PI) * 0.9); blit(art('peel'), p.x, p.y); }
      else { const p = toScreen(pl.x, pl.y, 0); blit(art('peel'), p.x, p.y); }
    });
    for (const g of G.geysers) add(g.x + g.y + 0.2, () => { const p = toScreen(g.x, g.y, 0); blit(art('geyser', { f: Math.min(2, Math.floor((0.6 - g.t) / 0.2)) }), p.x, p.y); });
    for (const s of G.shots) add(s.x + s.y, () => {
      const p = toScreen(s.x, s.y, s.z);
      if (s.lob) { shadow(s.x, s.y, 0, 6, 0.25); ctx.fillStyle = '#7a4a2a'; ctx.beginPath(); ctx.arc(p.x, p.y, 5.5, 0, 7); ctx.fill(); ctx.fillStyle = '#e8c9a0'; ctx.beginPath(); ctx.arc(p.x - 1.5, p.y - 1.5, 2.5, 0, 7); ctx.fill(); return; }
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(p.x, p.y, s.s + 1.2, 0, 7); ctx.fill();
      ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(p.x, p.y, s.s, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(p.x - s.s * 0.3, p.y - s.s * 0.3, s.s * 0.35, 0, 7); ctx.fill();
    });
    for (const s of G.stomps) add(s.x + s.y + 0.4, () => {
      const f = s.done ? 0 : s.t / BOOT_DELAY, p = toScreen(s.x, s.y, f * f * 5), k = s.done ? clamp(s.show / 0.35, 0, 1) : 0;
      ctx.globalAlpha = s.done ? k : 1; blit(art('boot'), p.x, p.y, 1 + 0.25 * k, 1 - 0.25 * k); ctx.globalAlpha = 1;
    });
    list.sort((a, b) => a.d - b.d);
    for (const o of list) o.f();
    // flyers: over everything, each with a shadow on the grass
    const fl = G.enemies.filter((e) => e.fly && !e.dead).sort((a, b) => a.x + a.y - b.x - b.y);
    for (const e of fl) shadow(e.x, e.y, 0, e.F.boss ? 22 : 10, 0.18);
    for (const e of fl) drawFoe(e, e.z);
    for (const b of G.bolts) drawBolt(b);
  }
  const INK = ART.INK || '#1b1f33';
  function drawBolt(b) {
    ctx.strokeStyle = b.c; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.lineWidth = pass ? 1.6 : 4.5; ctx.globalAlpha = (pass ? 1 : 0.45) * Math.min(1, b.t * 10); if (pass) ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      for (let k = 0; k < b.pts.length - 1; k++) {
        const a = toScreen(...b.pts[k]), e = toScreen(...b.pts[k + 1]);
        ctx.moveTo(a.x, a.y);
        if (!b.straight) for (let q = 1; q < 5; q++) { const f = q / 5, h = ART.hash(k * 7 + q + Math.floor(T * 30)) - 0.5; ctx.lineTo(a.x + (e.x - a.x) * f + h * 16, a.y + (e.y - a.y) * f + h * 6); }
        ctx.lineTo(e.x, e.y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- drawing: the sky ----------
  function drawSky() {
    // what is below, as marks on the glass
    for (const t of G.towers) { tilePath(t.i, t.j, 0, 0.3); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill(); }
    for (const e of G.enemies) {
      if (e.dead || e.state === 'tunnel' || e.state === 'under') continue;
      const p = toScreen(e.x, e.y, 0), r = e.F.boss ? 9 : 4.5;
      if (e.fly && !e.F.boss) { blit(foeSpr(e.k, undefined, e.flash > 0), p.x, p.y + 4, 0.62, 0.62, e.fy !== 0); if (e.lost > 0) text('?', p.x + 10, p.y - 22, '#ffffff', 14, 'center', true); continue; }
      ctx.fillStyle = e.F.boss ? '#ff2a4d' : e.fly ? '#ff7ad9' : 'rgba(27,31,51,0.75)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.6, 0, 0, 7); ctx.fill();
    }
    for (const c of G.clouds) {
      const D = CLOUDS[c.t];
      isoEllipse(c.x, c.y, 0, D.raw ? 0.55 : cloudR(c));
      ctx.fillStyle = D.raw ? 'rgba(20,40,90,0.13)' : `rgba(${D.tint},0.3)`; ctx.fill();
      if (!D.raw) { ctx.strokeStyle = `rgba(${D.tint},0.85)`; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    const drag = G.drag, tgt = drag ? dragTarget(drag) : null;
    const list = G.clouds.slice().sort((a, b) => a.x + a.y - b.x - b.y);
    for (const c of list) {
      const D = CLOUDS[c.t], lift = c === drag ? 0.3 : 0, bob = Math.sin(T * 1.6 + c.wob) * 0.04;
      const p = toScreen(c.x, c.y, CLOUD_Z + lift + bob), b = c.born > 0 ? c.born / 0.4 : 0;
      if (c.anchored) {
        const q = toScreen(c.x, c.y, 0);
        ctx.strokeStyle = 'rgba(60,50,30,0.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.beginPath(); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(q.x, q.y - 6); ctx.stroke(); ctx.setLineDash([]);
        blit(art('anchor'), q.x, q.y + 2);
      }
      if (c === tgt) { ctx.strokeStyle = mergeResult(drag, c) ? '#ffe680' : '#ff5a7a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(p.x, p.y - 20, 50, 34, 0, 0, 7); ctx.stroke(); }
      if (c.zap > 0) { ctx.fillStyle = `rgba(255,246,168,${c.zap * 2})`; ctx.beginPath(); ctx.ellipse(p.x, p.y - 20, 52, 34, 0, 0, 7); ctx.fill(); }
      const wr = c.gush > 0 || c.wrung ? 0.12 * Math.sin(T * 40) : 0;
      blit(art('cloud', c.big ? { t: c.t, big: true } : { t: c.t }), p.x, p.y, 1 + 0.3 * b + wr, 1 - 0.3 * b - wr);
      if (!D.raw) {
        const f = D.bolts ? c.bolts / c.bolts0 : c.life / c.life0, w = 30;
        ctx.fillStyle = 'rgba(12,14,30,0.6)'; ctx.fillRect(p.x - w / 2 - 1, p.y + 5, w + 2, 5);
        ctx.fillStyle = f > 0.3 ? '#ffffff' : '#ff8a5c'; ctx.fillRect(p.x - w / 2, p.y + 6, w * clamp(f, 0, 1), 3);
      }
    }
    if (drag && tgt) { const r = mergeResult(drag, tgt), p = toScreen(tgt.x, tgt.y, CLOUD_Z + 1.5); text(r ? `= ${r.big && r.t === tgt.t ? 'Big ' : ''}${CLOUDS[r.t].name}` : 'no mix', p.x, p.y, r ? '#ffe680' : '#ff9a9a', 15, 'center', true); }
    // the wind
    if (!has('vane')) { const p = toScreen(N / 2 - G.wind[0] * 5.3, N / 2 - G.wind[1] * 5.3, 0), q = toScreen(N / 2 - G.wind[0] * 4.7, N / 2 - G.wind[1] * 4.7, 0); icon('wind', p.x, p.y, 20); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x + (q.x - p.x) * 0.6, p.y + (q.y - p.y) * 0.6); ctx.lineTo(p.x + (q.x - p.x) * 1.6, p.y + (q.y - p.y) * 1.6); ctx.stroke(); }
  }

  // ---------- drawing: the mine ----------
  function drawDig() {
    const queuedHint = 0.5 + 0.5 * Math.sin(T * 5);
    for (const t of G.ug) {
      if (t.dug) continue;
      const p = toScreen(t.i + 0.5, t.j + 0.5, 0);
      if (t.content === 'crystal' && (t.known || t.spied)) blit(art('crystal'), p.x, p.y + 6, 0.8, 0.8);
      else if (t.content === 'lode' && (t.known || t.spied)) text('✦', p.x + Math.sin(T * 2 + t.i) * 6, p.y - 2 + Math.cos(T * 3) * 3, `rgba(255,230,128,${0.5 + 0.5 * Math.sin(T * 4)})`, 14);
      else if (t.spied && t.content) {
        if (HAZARDS[t.content]) text('!', p.x, p.y, '#ff5a7a', 16, 'center', true);
        else { ctx.globalAlpha = 0.85; const s = art('loot', { k: t.content }); ctx.drawImage(s.cv, p.x - 9, p.y - 9, 18, 18); ctx.globalAlpha = 1; }
      }
      if (t.chalk) { const a = toScreen(t.i + 0.25, t.j + 0.5, 0), b = toScreen(t.i + 0.75, t.j + 0.5, 0), c2 = toScreen(t.i + 0.5, t.j + 0.25, 0), d = toScreen(t.i + 0.5, t.j + 0.75, 0); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.moveTo(c2.x, c2.y); ctx.lineTo(d.x, d.y); ctx.stroke(); }
      else if (has('lamp') && t.known && LOOT[t.content] && !t.spied) text('✦', p.x + Math.sin(T * 3 + t.i * 5) * 3, p.y, `rgba(255,230,128,${0.35 + 0.35 * Math.sin(T * 4 + t.j)})`, 11);
    }
    const sel = G.sel;
    if (sel && sel.dig) { tilePath(sel.i, sel.j, 0, 0.04); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke(); }
    if (G.armed) for (const t of G.ug) if (t.dug) { tilePath(t.i, t.j, 0, 0.2); ctx.strokeStyle = `rgba(255,138,92,${0.4 + 0.4 * queuedHint})`; ctx.lineWidth = 1.5; ctx.stroke(); }
    const list = [];
    const add = (x, y, f) => list.push({ d: x + y, x, y, f });
    add(G.hut.x - 0.3, G.hut.y - 0.3, () => { // the ladder up
      const a = toScreen(G.hut.x - 0.25, G.hut.y - 0.25, DIG_Z), b = toScreen(G.hut.x - 0.25, G.hut.y - 0.25, 0.5);
      ctx.strokeStyle = '#c99a5b'; ctx.lineWidth = 2.5; ctx.beginPath();
      for (const dx of [-5, 5]) { ctx.moveTo(a.x + dx, a.y); ctx.lineTo(b.x + dx, b.y); }
      for (let y = a.y - 6; y > b.y; y -= 8) { ctx.moveTo(a.x - 5, y); ctx.lineTo(a.x + 5, y); }
      ctx.stroke();
    });
    for (const t of G.ug) if (t.chest) add(t.i + 0.5, t.j + 0.5, () => { const p = toScreen(t.i + 0.5, t.j + 0.5, DIG_Z); blit(art('chest', { open: 1 }), p.x, p.y); });
    for (const t of G.ug) if (t.pitted) add(t.i + 0.5, t.j + 0.5, () => { const p = toScreen(t.i + 0.5, t.j + 0.5, DIG_Z); ctx.globalAlpha = 0.7; blit(art('crack'), p.x, p.y); ctx.globalAlpha = 1; });
    for (const s of G.sticks) add(s.x, s.y, () => { const p = toScreen(s.x, s.y, DIG_Z), k = 1 + 0.15 * Math.abs(Math.sin(s.t * (s.t < 1 ? 20 : 8))); blit(art('dynamite', { lit: 1 }), p.x, p.y, k, k); text(String(Math.ceil(s.t)), p.x, p.y - 34, '#ff8a5c', 15, 'center', true); });
    for (const g of G.gems) add(g.x, g.y, () => {
      const p = toScreen(g.x, g.y, DIG_Z), hop = Math.abs(Math.sin(T * 7 + g.wob)) * 8, s = art('loot', { k: 'gem' });
      shadow(g.x, g.y, DIG_Z, 8, 0.3); if (g.t < 2 && T * 8 % 2 < 1) return;
      ctx.drawImage(s.cv, p.x - 13, p.y - 26 - hop, 26, 26);
    });
    G.hamsters.forEach((h, k) => add(h.x, h.y, () => drawHamster(h, k)));
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (e.state === 'under') add(e.x, e.y, () => { drawFoe(e, DIG_Z, 'dig'); const p = toScreen(e.x, e.y, DIG_Z); text(`${Math.max(0, (e.k === 'tyrant' ? TYRANT_TAPS : SAPPER_TAPS) - e.taps)}`, p.x, p.y - (e.k === 'tyrant' ? 70 : 40), '#ffe680', 14, 'center', true); });
      else if (e.state === 'tunnel') add(e.x, e.y, () => { shadow(e.x, e.y, DIG_Z, 9, 0.3); drawFoe(e, DIG_Z); });
    }
    list.sort((a, b) => a.d - b.d);
    for (const o of list) {
      o.f();
      // the dirt in front of a body hides its feet
      const i = Math.floor(o.x), j = Math.floor(o.y);
      for (const [di, dj] of [[1, 0], [0, 1], [1, 1]]) { const u = tileAt(i + di, j + dj); if (u && !u.dug) paintUg(ctx, P_SCREEN, u); }
    }
    // orders go on top, so the dirt repainted in front of a hamster cannot hide them
    for (const t of G.orders) {
      const p = toScreen(t.i + 0.5, t.j + 0.5, 0);
      tilePath(t.i, t.j, 0, 0.08); ctx.strokeStyle = `rgba(255,230,128,${0.6 + 0.4 * queuedHint})`; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
      if (t.prog > 0) { ctx.fillStyle = 'rgba(12,14,30,0.7)'; ctx.fillRect(p.x - 15, p.y - 3, 30, 6); ctx.fillStyle = '#ffe680'; ctx.fillRect(p.x - 14, p.y - 2, 28 * clamp(t.prog, 0, 1), 4); }
      else icon('dig', p.x, p.y, 16);
    }
    // the price of the next dig, on the dirt beside a tunnel
    if (!G.armed && !G.chalk) for (const t of G.ug) {
      if (t.dug || t.queued || t.chalk || !canQueue(t)) continue;
      const p = toScreen(t.i + 0.5, t.j + 0.5, 0), c = digCost(t);
      text(c ? String(c) : 'free', p.x, p.y + 12, G.coins >= c ? 'rgba(255,230,128,0.8)' : 'rgba(255,154,154,0.8)', 10, 'center', false, false);
    }
    // feet on the road above, so dynamite can be aimed
    for (const e of G.enemies) {
      if (e.dead || e.fly || e.state === 'under' || e.state === 'tunnel' || hidden(e)) continue;
      const p = toScreen(e.x, e.y, 0);
      ctx.fillStyle = e.F.boss ? 'rgba(255,42,77,0.9)' : 'rgba(255,122,140,0.85)'; ctx.strokeStyle = 'rgba(12,14,30,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(p.x, p.y, e.F.boss ? 10 : 5.5, e.F.boss ? 5 : 3, 0, 0, 7); ctx.fill(); ctx.stroke();
    }
    // the numbers: how many dangers hide around a dug tile
    for (const t of G.ug) {
      if (!t.dug) continue;
      const n = dangerCount(t);
      if (n) { const p = toScreen(t.i + 0.5, t.j + 0.5, 0); text(String(n), p.x, p.y + 1, NUM_COL[n], 17, 'center', true); }
    }
    // the castle above: sappers head for it
    const cp = toScreen(G.castle.x, G.castle.y, 0.1);
    ctx.globalAlpha = 0.3 + 0.1 * Math.sin(T * 3); blit(art('castle', { door: 0 }), cp.x, cp.y, 0.6, 0.6); ctx.globalAlpha = 1;
  }

  // ---------- drawing: effects ----------
  function drawFx(name) {
    for (const p of G.parts) {
      if (p.layer !== name) continue;
      if (p.ring) { const f = 1 - p.t / p.T; isoEllipse(p.x, p.y, p.z, p.ring * (0.3 + 0.7 * f)); ctx.strokeStyle = p.c; ctx.globalAlpha = 1 - f; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1; continue; }
      const q = toScreen(p.x, p.y, Math.max(name === 'dig' ? DIG_Z : 0, p.z));
      ctx.globalAlpha = Math.min(1, p.t * 4); ctx.fillStyle = p.c; ctx.fillRect(q.x - p.s / 2, q.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    for (const t of G.texts) {
      if (t.layer !== name) continue;
      const q = toScreen(t.x, t.y, t.z), f = t.t / t.T, pop2 = t.big ? 1 + 0.4 * Math.max(0, f - 0.85) / 0.15 : 1;
      ctx.globalAlpha = Math.min(1, f * 3);
      text(t.s, clamp(q.x, 70, VW - 70), q.y, t.c, (t.big ? 17 : 12) * pop2, 'center', true);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- drawing: backgrounds and the layer switch ----------
  function drawBackground(name) {
    const g = ctx.createLinearGradient(0, VIEW_Y0, 0, VIEW_Y1);
    if (name === 'sky') { g.addColorStop(0, '#3f8fe0'); g.addColorStop(1, '#bfe4ff'); }
    else if (name === 'ground') { g.addColorStop(0, '#8fd0ff'); g.addColorStop(0.6, '#cfeaff'); g.addColorStop(1, '#a9dc9a'); }
    else { g.addColorStop(0, '#2a1b14'); g.addColorStop(1, '#0d0806'); }
    ctx.fillStyle = g; ctx.fillRect(0, VIEW_Y0, W, VIEW_Y1 - VIEW_Y0);
    if (name === 'dig') { // pebbles in the dark
      for (let k = 0; k < 26; k++) { const x = (ART.hash(k * 3 + 1) * (W + 300) - 150 - cam.x * 0.4), y = VIEW_Y0 + ART.hash(k * 5 + 2) * (VIEW_Y1 - VIEW_Y0); ctx.fillStyle = `rgba(120,90,60,${0.15 + ART.hash(k) * 0.2})`; ctx.beginPath(); ctx.ellipse(x, y, 4 + ART.hash(k + 9) * 7, 2 + ART.hash(k + 4) * 3, 0, 0, 7); ctx.fill(); }
    } else if (name === 'ground') { // far clouds
      for (let k = 0; k < 4; k++) { const x = ((ART.hash(k * 7 + 3) * 700 + T * (4 + k) - cam.x * 0.3) % 700 + 700) % 700 - 110, y = VIEW_Y0 + 24 + k * 22; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(x, y, 46, 10, 0, 0, 7); ctx.ellipse(x + 22, y - 7, 24, 9, 0, 0, 7); ctx.fill(); }
    }
  }
  function drawLayer(name, dy, alpha) {
    ctx.save(); ctx.translate(0, VIEW_Y0); ctx.scale(ZOOM, ZOOM); textK = 1.2;
    view.dy = dy;
    if (name === 'sky') { ctx.globalAlpha = 0.24 * alpha; drawCache('ground', 96); }
    ctx.globalAlpha = alpha; drawCache(name, 0); ctx.globalAlpha = 1;
    if (alpha > 0.6) {
      if (name === 'ground') drawGround(); else if (name === 'sky') drawSky(); else drawDig();
      drawFx(name);
    }
    view.dy = 0; textK = 1;
    ctx.restore();
  }
  function drawWorld() {
    const tr = G.trans;
    if (!tr) { drawBackground(G.layer); drawLayer(G.layer, 0, 1); return; }
    // a lift: the old layer slides away, strata rush past, the new layer arrives with a small bounce
    const p = Math.min(1, tr.t / tr.T), dir = ORDER[tr.to] > ORDER[tr.from] ? 1 : -1, SLIDE = 800;
    const pOut = Math.min(1, p / 0.55), pIn = Math.max(0, (p - 0.3) / 0.7);
    drawBackground(pIn > 0.5 ? tr.to : tr.from);
    if (tr.from === 'dig' || tr.to === 'dig') {
      const bands = ['#6b4a2a', '#5a3d24', '#7d5a42', '#4f3a2a', '#3d2c20'];
      ctx.globalAlpha = Math.sin(p * Math.PI) * 0.85;
      for (let k = 0; k < 10; k++) { const y = ((k * 72 - dir * p * 1100) % 720 + 720) % 720 + VIEW_Y0 - 36; ctx.fillStyle = bands[k % 5]; ctx.fillRect(0, y, W, 72); }
      ctx.globalAlpha = 1;
    }
    if (pOut < 1) drawLayer(tr.from, -dir * SLIDE * easeInCubic(pOut), pOut > 0.8 ? (1 - pOut) * 5 : 1);
    if (pIn > 0) drawLayer(tr.to, dir * SLIDE * (1 - easeOutBack(pIn, 1.1)), Math.min(1, pIn * 4));
  }

  // ---------- drawing: HUD and the bar ----------
  function panel(x, y, w, h, r, fill, stroke) { rr(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); } }
  function drawHud() {
    ctx.fillStyle = 'rgba(10,12,28,0.94)'; ctx.fillRect(0, 0, W, HUD_H);
    const low = G.hearts <= 3 && T % 0.6 < 0.3;
    icon('heart', 20, 19, 22); text(String(G.hearts), 34, 20, low ? '#ff5a7a' : '#ffffff', 17, 'left');
    icon('coin', 86, 19, 22); text(String(Math.floor(G.coins)), 100, 20, G.combo > 0 ? '#ffe680' : '#ffd84a', 17, 'left');
    icon('gem', 176, 19, 22); text(`${run.gems}${G.loot ? ` +${G.loot}` : ''}`, 190, 20, '#8fe6ff', 17, 'left');
    if (run.heat > 0 && G.n >= FROM.heat) text(`🔥${run.heat}`, 286, 20, '#ff9a3d', 13, 'left');
    text(`Level ${G.n} · ${G.name}`, 10, 43, '#9aa3d6', 12, 'left', false, false);
    // the three lights of the Strata Combo
    if (G.n >= FROM.combo) {
      if (G.combo > 0) { panel(250, 34, 170, 17, 8, 'rgba(255,230,128,0.18)'); panel(250, 34, 170 * clamp(G.combo / comboS(), 0, 1), 17, 8, '#ffb02e'); text(`STRATA COMBO ×${G.comboMul}`, 335, 43, '#2a1700', 11); }
      else LAYERS.forEach((l, k) => { const on = G.time - G.act[l] <= COMBO_WINDOW; ctx.globalAlpha = on ? 1 : 0.3; icon(l, 368 + k * 22, 43, 16); ctx.globalAlpha = 1; });
    }
    if (G.combo > 0 || G.flash > 0) { /* the frame glows */ }
  }
  function drawBar() {
    const R = barRects();
    ctx.fillStyle = 'rgba(10,12,28,0.96)'; ctx.fillRect(0, H - BAR_H, W, BAR_H);
    for (const l of LAYERS) {
      const r = R[l], on = G.layer === l, open = layerOpen(l);
      panel(r[0], r[1], r[2], r[3], 12, on ? '#ffe680' : '#1c2145', on ? '#fff6c9' : '#ffffff22');
      ctx.globalAlpha = open ? 1 : 0.35;
      icon(l, r[0] + r[2] / 2, r[1] + 23, 30);
      text(open ? LAYER_NAME[l] : `L${FROM[l]}`, r[0] + r[2] / 2, r[1] + r[3] - 11, on ? '#251a00' : '#c9d0ff', 11);
      ctx.globalAlpha = 1;
      // a badge: something on that layer wants a thumb
      let badge = '';
      if (!on && open) {
        if (l === 'ground' && ringing()) badge = '#ff2a4d';
        else if (l === 'dig' && (G.gems.length || G.enemies.some((e) => e.state === 'under'))) badge = '#5ef0ff';
        else if (l === 'sky' && G.clouds.filter((c) => CLOUDS[c.t].raw).length >= 2) badge = '#ffffff';
      }
      if (badge) { const k = 1 + 0.25 * Math.abs(Math.sin(T * 7)); ctx.fillStyle = badge; ctx.beginPath(); ctx.arc(r[0] + r[2] - 7, r[1] + 7, 6 * k, 0, 7); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    // the tool of the layer
    const t = R.tool; let ic = 'boot', label = '', hot = false;
    if (G.layer === 'ground') { ic = 'boot'; label = `${G.boot.n}/${bootMax()}`; }
    else if (G.layer === 'sky') { ic = 'anchor'; label = `${G.anchors}/${anchorMax()}`; }
    else if (G.armed) { ic = 'dynamite'; label = `×${G.dyn}`; hot = true; }
    else if (G.chalk) { ic = 'eye'; label = 'chalk'; hot = true; }
    else { ic = 'dig'; label = G.n >= FROM.dynamite ? `dig · 🧨${G.dyn}` : 'dig'; }
    panel(t[0], t[1], t[2], t[3], 12, hot ? '#ff8a5c' : '#14183a', hot ? '#ffd9b0' : '#ffffff22');
    icon(ic, t[0] + t[2] / 2, t[1] + 23, 28); text(label, t[0] + t[2] / 2, t[1] + t[3] - 11, hot ? '#2a1000' : '#c9d0ff', 11);
    if (G.layer === 'ground' && G.boot.n < bootMax()) { ctx.fillStyle = '#5ef0ff'; ctx.fillRect(t[0] + 8, t[1] + t[3] - 3, (t[2] - 16) * (1 - G.boot.t / bootS()), 2); }
    // the wave button
    const w = R.wave, can = canCallWave(), left = G.enemies.length + G.spawnQ.length;
    panel(w[0], w[1], w[2], w[3], 12, can ? (left === 0 && T % 1 < 0.5 ? '#4aa2ff' : '#2f8cff') : '#14183a', can ? '#9fd0ff' : '#ffffff22');
    if (G.barNote && G.barNote.t > 0) text(G.barNote.text, w[0] + w[2] / 2, w[1] + w[3] / 2, '#ffe680', 16);
    else if (can) { text(`Send wave ${G.waveIdx + 1}/${G.waves.length}`, w[0] + w[2] / 2, w[1] + 22, '#ffffff', 14); text(`in ${Math.ceil(G.countdown)} s · now: +${earlyBonus()} coins`, w[0] + w[2] / 2, w[1] + 43, '#d6ebff', 11, 'center', false, false); }
    else { text(G.waveIdx >= G.waves.length ? 'Last wave' : `Wave ${G.waveIdx}/${G.waves.length}`, w[0] + w[2] / 2, w[1] + 22, '#c9d0ff', 14); text(`${left} to go`, w[0] + w[2] / 2, w[1] + 43, '#9aa3d6', 11, 'center', false, false); }
    const s = R.speed;
    panel(s[0], s[1], s[2], s[3], 12, speed > 1 ? '#7cf28a' : '#14183a', '#ffffff22');
    text(speed > 1 ? '▶▶' : '▶', s[0] + s[2] / 2, s[1] + 23, speed > 1 ? '#0b2a10' : '#c9d0ff', 16); text(`×${speed}`, s[0] + s[2] / 2, s[1] + s[3] - 11, speed > 1 ? '#0b2a10' : '#c9d0ff', 11);
  }
  function drawBubbles() {
    if (G.trans) return;
    for (const b of G.bubbles) {
      if (b.layer !== G.layer) continue;
      const q = toScreen(b.x, b.y, b.z), lines = wrapLines(b.s, 11, b.boss ? 170 : 150), a = Math.min(1, b.t * 3, (b.T - b.t) * 8);
      ctx.font = `700 11px ${FONT}`;
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14, h = lines.length * 13 + 8;
      const tx = q.x * ZOOM, ty = q.y * ZOOM + VIEW_Y0, x = clamp(tx, w / 2 + 4, W - w / 2 - 4), y = Math.max(HUD_H + h + 6, ty - 8);
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.moveTo(clamp(tx, x - w / 2 + 8, x + w / 2 - 8) - 5, y - 1); ctx.lineTo(clamp(tx, x - w / 2 + 8, x + w / 2 - 8), y + 7); ctx.lineTo(clamp(tx, x - w / 2 + 8, x + w / 2 - 8) + 5, y - 1);
      ctx.fillStyle = b.boss ? '#ffe1e6' : b.home ? '#e8fbe8' : '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fill();
      rr(x - w / 2, y - h, w, h, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(clamp(tx, x - w / 2 + 8, x + w / 2 - 8) - 4, y - 1); ctx.lineTo(clamp(tx, x - w / 2 + 8, x + w / 2 - 8), y + 5.5); ctx.lineTo(clamp(tx, x - w / 2 + 8, x + w / 2 - 8) + 4, y - 1); ctx.fill();
      lines.forEach((l, k) => text(l, x, y - h + 11 + k * 13, INK, 11));
      ctx.globalAlpha = 1;
    }
  }
  function drawLetter() {
    const L = G.letter; if (!L || L.t <= 0 || !LORE.letters) return;
    const D = LORE.letters[L.idx], lines = wrapLines(D.text, 13, W - 110), h = 58 + lines.length * 17, a = Math.min(1, L.t * 3, (L.T - L.t) * 4), y0 = HUD_H + 16;
    ctx.globalAlpha = a; ctx.save(); ctx.translate(W / 2, y0 + h / 2); ctx.rotate(-0.012); ctx.translate(-W / 2, -(y0 + h / 2));
    panel(34, y0, W - 68, h, 6, '#f6e7c1', '#8a6a3a');
    text(`LETTER ${L.idx + 1} OF ${LORE.letters.length}`, W / 2, y0 + 16, '#8a6a3a', 10);
    lines.forEach((l, k) => text(l, W / 2, y0 + 38 + k * 17, '#3a2a12', 13, 'center', false, false));
    text(D.from ? `from ${D.from}`.replace(/^from from /i, 'from ') : '', W - 52, y0 + h - 12, '#8a6a3a', 11, 'right', false, false);
    ctx.restore(); ctx.globalAlpha = 1;
  }
  function drawNotices() {
    drawBubbles(); drawLetter();
    // who comes next, while the garden waits
    if (G.layer === 'ground' && !G.trans && canCallWave() && !(G.banner > 0) && !(G.banner2 && G.banner2.t > 0)) {
      const list = G.waves[G.waveIdx], kinds = [...new Set(list)].slice(0, 6), n = kinds.length, x0 = W / 2 - (n - 1) * 23 + 20, y = HUD_H + 34;
      panel(x0 - 70, y - 22, n * 46 + 58, 34, 10, 'rgba(12,14,30,0.6)', '#ffffff22');
      text(list.twist ? 'Next!' : 'Next', x0 - 44, y - 4, list.twist ? '#ffe680' : '#c9d0ff', 12);
      kinds.forEach((k, q) => { const x = x0 + q * 46 - 6, c = list.filter((v) => v === k).length, big = FOES[k].boss ? 0.34 : 0.55; blit(foeSpr(FOES[k].art || k), x, y + 8, big, big); if (c > 1) text('×' + c, x + 19, y, '#ffffff', 11, 'center', false, false); });
      // and where from
      const a = routeAt(0.3), q = toScreen(a.x, a.y, 0), py = q.y * ZOOM + VIEW_Y0 - 26 - Math.abs(Math.sin(T * 4)) * 6;
      text('▼', q.x * ZOOM, py, '#ff9a9a', 16, 'center', true);
    }
    // the doorbell, when the garden is not on screen
    if (G.layer !== 'ground' && !G.trans && ringing()) {
      const k = 1 + 0.08 * Math.sin(T * 20);
      panel(BELL[0], BELL[1], BELL[2], BELL[3], 14, 'rgba(255,42,77,0.92)', '#ffffff');
      blit(art('bell'), W / 2 - 22 + Math.sin(T * 34) * 2, BELL[1] + 44, 1.3 * k, 1.3 * k); text(G.swatT > 0 ? 'wait...' : 'SWAT!', W / 2 + 16, BELL[1] + 28, '#ffffff', 14);
    }
    if (G.toast && G.toast.t > 0) {
      const lines = wrapLines(G.toast.text, 12, W - 70), h = lines.length * 16 + 12, y = VIEW_Y1 - h - 8;
      ctx.globalAlpha = Math.min(1, G.toast.t * 3);
      panel(20, y, W - 40, h, 10, 'rgba(12,14,30,0.9)', '#ffffff33');
      lines.forEach((l, k) => text(l, W / 2, y + 14 + k * 16, '#e8ecff', 12, 'center', false, false));
      ctx.globalAlpha = 1;
    }
    const hk = G.heckle;
    if (hk && hk.t > 0 && !(G.toast && G.toast.t > 0)) {
      const lines = wrapLines(hk.text, 12, W - 130), h = Math.max(44, lines.length * 16 + 14), y = VIEW_Y1 - h - 8;
      ctx.globalAlpha = Math.min(1, hk.t * 3, (4.5 - hk.t) * 6);
      const gs = art('gnome', { mood: 0 }); ctx.drawImage(gs.cv, 8, y + h - 52, gs.w * 0.72, gs.h * 0.72);
      panel(70, y, W - 84, h, 12, '#f4f6ff'); ctx.fillStyle = '#f4f6ff'; ctx.beginPath(); ctx.moveTo(70, y + h - 24); ctx.lineTo(60, y + h - 18); ctx.lineTo(70, y + h - 12); ctx.fill();
      lines.forEach((l, k) => text(l, 80, y + (h - lines.length * 16) / 2 + 8 + k * 16, '#1b1f33', 12, 'left', false, false));
      ctx.globalAlpha = 1;
    }
    if (G.banner > 0) {
      const a = Math.min(1, G.banner * 2, ((G.banner0 || 5) - G.banner) * 4), tip = tipFor(G.n), isNew = tip.startsWith('NEW:');
      const ch = LORE.chapters && LORE.chapters[G.n - 1], story = ch ? wrapLines(ch.text, 13, W - 84) : [];
      const lines = tip ? wrapLines(isNew ? tip.slice(4).trim() : tip, 13, W - 80) : [], sh = story.length ? story.length * 17 + 30 : 0, h = 62 + sh + lines.length * 17 + (isNew ? 18 : 0);
      ctx.globalAlpha = a;
      panel(24, HUD_H + 14, W - 48, h, 14, 'rgba(12,14,30,0.92)', isNew ? '#ffe680' : '#ffffff33');
      text(`Level ${G.n}`, W / 2, HUD_H + 34, '#9aa3d6', 12); text(G.name, W / 2, HUD_H + 56, '#ffffff', 22);
      let y = HUD_H + 80;
      if (ch) { text(ch.title, W / 2, y, '#ffd9a0', 13); y += 19; story.forEach((l, k) => text(l, W / 2, y + k * 17, '#fff1c9', 13, 'center', false, false)); y += story.length * 17 + 11; }
      if (isNew) { text('NEW', W / 2, y, '#ffe680', 13); y += 18; }
      lines.forEach((l, k) => text(l, W / 2, y + k * 17, isNew ? '#fff6c9' : '#c9d0ff', 13, 'center', false, false));
      ctx.globalAlpha = 1;
    }
    const b = G.banner2;
    if (b && b.t > 0 && (mode === 'play' || mode === 'pause')) {
      const a = Math.min(1, b.t * 3), k = 1 + 0.5 * Math.max(0, b.t - (b.t0 || (b.t0 = b.t)) + 0.2) / 0.2;
      ctx.globalAlpha = a;
      text(b.text, W / 2, 330, '#ffe680', 34 * k, 'center', true); if (b.sub) text(b.sub, W / 2, 364, '#ffffff', 17, 'center', true);
      ctx.globalAlpha = 1;
    }
    if (G.layer === 'dig' && !G.trans && G.lucky >= 2) text(`Lucky streak ${G.lucky}${luckyMul() > 1 ? ` · loot ×${luckyMul()}` : G.lucky < 5 ? ' · ×1.5 at 5' : ''}`, W / 2, HUD_H + 16, '#7cf2a8', 12, 'center', true);
    if (G.clearT > 0) text('GARDEN SAFE!', W / 2, 330, '#7cf28a', 34, 'center', true);
  }
  function drawBackdrop() { // behind the menu, before a level exists
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3f8fe0'); g.addColorStop(0.55, '#bfe4ff'); g.addColorStop(0.56, '#62b354'); g.addColorStop(0.8, '#4d9a43'); g.addColorStop(0.81, '#8a5a36'); g.addColorStop(1, '#3d2c20');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    blit(art('cloud', { t: 'puff' }), 90 + Math.sin(T * 0.3) * 20, 120); blit(art('cloud', { t: 'rain' }), 380 + Math.sin(T * 0.23 + 2) * 24, 200);
    blit(art('castle', { door: 0 }), 360, 520); blit(art('pea', { lvl: 2 }), 120, 540); blit(art('tree', { seed: 1 }), 50, 500);
    blit(foeSpr('hamster', { alt: 'dig', pack: 2 }), 240, 730 - Math.abs(Math.sin(T * 6)) * 3);
  }
  function draw() {
    ctx.setTransform(S, 0, 0, S, 0, 0);
    if (!G) { drawBackdrop(); return; }
    ctx.save();
    ctx.beginPath(); ctx.rect(0, VIEW_Y0, W, VIEW_Y1 - VIEW_Y0); ctx.clip();
    if (G.shake > 0) ctx.translate(Math.sin(T * 90) * G.shake * 0.5, Math.cos(T * 77) * G.shake * 0.5);
    drawWorld();
    ctx.restore();
    if (G.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.5, G.flash)})`; ctx.fillRect(0, VIEW_Y0, W, VIEW_Y1 - VIEW_Y0); }
    if (G.combo > 0) { ctx.strokeStyle = `rgba(255,216,74,${0.5 + 0.3 * Math.sin(T * 8)})`; ctx.lineWidth = 6; ctx.strokeRect(3, VIEW_Y0 + 3, W - 6, VIEW_Y1 - VIEW_Y0 - 6); }
    drawNotices(); drawHud(); drawBar();
  }

  // ---------- the loop ----------
  let last = 0;
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000 || 0)); last = now; T += dt;
    if (G) {
      if (G.trans) { G.trans.t += dt; if (G.trans.t >= G.trans.T) G.trans = null; }
      for (let k = 0; k < speed && mode === 'play'; k++) update(dt);
    }
    try { draw(); } catch (e) { if (!frame.err) { frame.err = true; console.error(e); } }
    requestAnimationFrame(frame);
  }

  // ---------- debug hook ----------
  // For automated tests and for tuning from the console.
  window.__ss = {
    get G() { return G; }, get run() { return run; }, get mode() { return mode; }, get meta() { return meta; },
    state: () => ({ mode, screen, level: run ? run.level : 0, gems: run ? run.gems : 0, layer: G ? G.layer : '', coins: G ? G.coins : 0, hearts: G ? G.hearts : 0, wave: G ? G.waveIdx : 0, waves: G ? G.waves.length : 0, enemies: G ? G.enemies.length : 0, time: G ? G.time : 0 }),
    start(n, up) { run = newRun(); run.level = n || 1; Object.assign(run.up, up || {}); startLevel(); },
    layer: (l) => setLayer(l, true),
    step(seconds, dt = 1 / 30) { for (let t = 0; t < seconds && mode === 'play'; t += dt) update(dt); },
    screenOf: (wx, wy, z) => toScreen(wx, wy, z || 0),
    build: tryBuild, upgrade: tryUpgrade, stomp: stompAt, swat, wave: callWave, dig: (i, j) => orderDig(tileAt(i, j)), stick: (i, j) => placeStick(tileAt(i, j)),
    cloud: (t, x, y, big) => addCloud(t, x, y, big), merge: mergeClouds, spawn: spawnFoe, relic: (id) => run.relics.push(id),
    win() { G.waveIdx = G.waves.length; G.spawnQ = []; G.enemies = []; G.eggs = []; }, lose() { G.hearts = 0; },
    coins(n) { G.coins += n; }, gems(n) { run.gems += n; saveRun(); }, shop: openShop, tables: { TOWERS, FOES, ITEMS, RELICS, CLOUDS, RECIPES, FROM },
  };

  // ---------- start ----------
  resize();
  showMenu();
  requestAnimationFrame(frame);
})();
