'use strict';
/* Brick Bazaar - a one-handed brick breaker with a coin shop.
   Controls: drag / move the mouse to steer, tap / click to launch. Everything else is automatic.
   Sound is in audio.js, the campaign maps are in levels.js. */
(() => {
  const W = 480, H = 800;
  const HUD_H = 64;
  const PADDLE_Y = H - 115, PADDLE_H = 14;
  const GOALIE_Y = H - 62, NET_Y = H - 26;
  const COLS = 10, BW = 44, BH = 20, GAP = 2;
  const LEFT = (W - (COLS * (BW + GAP) - GAP)) / 2, TOP = 82;
  const SAVE_KEY = 'brickbazaar.save.v1', BEST_KEY = 'brickbazaar.best.v1', MUTE_KEY = 'brickbazaar.mute', MUSIC_KEY = 'brickbazaar.musicoff', META_KEY = 'brickbazaar.meta.v1';

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

  // ---------- audio (synthesis lives in audio.js) ----------
  const A = window.BBAudio, sfx = A.sfx;
  let muted = store.get(MUTE_KEY, false), musicOff = store.get(MUSIC_KEY, false);
  A.setSfx(!muted); A.setMusic(!musicOff);
  const audio = () => A.init();
  function buzz(pattern) { if (!muted && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* ignore */ } } }

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
  function rr(x, y, w, h, r, c = ctx) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  // ---------- shop catalogue ----------
  // Guns fire by themselves from a clip and reload when the clip is empty. There is no ammo to buy.
  // rate = seconds between shots, clip = shots per clip, reload = seconds, dmg = base damage.
  const GUNS = {
    blaster: { name: 'Pea Blaster', icon: '🔫', rate: 0.42, clip: 16, reload: 5, dmg: 1, color: '#7cf2ff' },
    scatter: { name: 'Fan Cannon', icon: '🎆', rate: 1.5, clip: 5, reload: 6, dmg: 1, color: '#b9ff6b' },
    laser: { name: 'Prism Lance', icon: '🔆', rate: 1.4, clip: 6, reload: 5.5, dmg: 2, color: '#ff7cf0' },
    rocket: { name: 'Pop Rockets', icon: '🚀', rate: 2.2, clip: 3, reload: 7, dmg: 2, color: '#ffb14a' },
    arc: { name: 'Arc Coil', icon: '⚡', rate: 1.6, clip: 5, reload: 6, dmg: 2, color: '#9ab8ff' },
    saw: { name: 'Buzz Saw', icon: '🪚', rate: 3.5, clip: 2, reload: 8, dmg: 1, color: '#ffd6a0' },
    duck: { name: 'Duck Mortar', icon: '🦆', rate: 3.2, clip: 2, reload: 8, dmg: 2, color: '#ffe94a' },
  };
  // What each gun does at level 1, and what it gains at level 3 and at level 5.
  const GUN_TEXT = {
    blaster: ['Twin shots from the paddle tips.', 'A third shot from the centre.', 'Shots pierce one brick.'],
    scatter: ['Sprays a fan of pellets.', 'Pellets bounce off the walls.', 'Pellets pierce one brick.'],
    laser: ['A beam that cuts through bricks.', 'Two beams.', 'Three beams.'],
    rocket: ['Rockets blast everything near the impact.', 'Rockets steer to a target.', 'Each blast scatters three more.'],
    arc: ['Chain lightning that never misses.', 'Two chains.', 'Three chains.'],
    saw: ['A saw disc bounces around and cuts bricks.', 'A bigger disc that lasts longer.', 'Two discs.'],
    duck: ['Lobs a rubber duck that explodes on every bounce.', 'One more bounce.', 'Bigger blasts and one more bounce.'],
  };
  function gunDesc(g, l) {
    const t = GUN_TEXT[g];
    if (!l) return t[0] + ' Fires by itself. Paddle bounces reload it.';
    const next = l < 3 ? ` Level 3: ${t[1]}` : l < 5 ? ` Level 5: ${t[2]}` : '';
    return `${t[0]} Paddle bounces reload it. Each level: faster and stronger.${next}${l >= 5 && l < gunMax() ? ' The Gun Workshop allows this level.' : ''}`;
  }
  const CATS = [
    { id: 'weap', name: '🔫 Guns' }, { id: 'drone', name: '🛰️ Drones' }, { id: 'gear', name: '🧲 Gear' },
    { id: 'ball', name: '⚪ Ball' }, { id: 'eco', name: '🪙 Coins' }, { id: 'blimp', name: '🎈 Blimps' },
    { id: 'wild', name: '🎲 Wild' }, { id: 'arcade', name: '🎪 Arcade' }, { id: 'dark', name: '🌶️ Spicy' },
  ];
  // at = the level from which the shop stocks the item. A new player sees three items; two or three more arrive per level.
  // Normal items are upgrades: level lv(id), cost base * grow^level, up to max.
  // Wild items have their own price() and use(); full() says when they are not for sale.
  const ITEMS = [
    { id: 'gun_blaster', at: 3, cat: 'weap', gun: 'blaster', max: 5, base: 40, grow: 1.9 },
    { id: 'gun_scatter', at: 7, cat: 'weap', gun: 'scatter', max: 5, base: 120, grow: 1.9 },
    { id: 'gun_laser', at: 10, cat: 'weap', gun: 'laser', max: 5, base: 130, grow: 1.9 },
    { id: 'gun_rocket', at: 13, cat: 'weap', gun: 'rocket', max: 5, base: 170, grow: 1.9 },
    { id: 'gun_arc', at: 16, cat: 'weap', gun: 'arc', max: 5, base: 230, grow: 1.9 },
    { id: 'gun_saw', at: 21, cat: 'weap', gun: 'saw', max: 5, base: 260, grow: 1.9 },
    { id: 'gun_duck', at: 26, cat: 'weap', gun: 'duck', max: 5, base: 300, grow: 1.9 },
    { id: 'rounds', at: 12, cat: 'weap', icon: '🎯', name: 'Hardened Rounds', max: 4, base: 150, grow: 2.2,
      desc: (l) => `All guns and drone shots deal +${(l + 1) * 35}% damage.`, req: () => ownsAnyGun() || lv('d_orbit') > 0, reqText: 'Needs a gun' },
    { id: 'belt', at: 7, cat: 'weap', icon: '🎒', name: 'Ammo Belt', max: 4, base: 60, grow: 1.7,
      desc: (l) => `Clips hold ${(l + 1) * 25}% more shots.`, req: () => ownsAnyGun(), reqText: 'Needs a gun' },
    { id: 'factory', at: 9, cat: 'weap', icon: '🏭', name: 'Quick Hands', max: 4, base: 90, grow: 1.7,
      desc: (l) => `Reloads are ${Math.round((1 - Math.pow(RELOAD_CUT, l + 1)) * 100)}% shorter.`, req: () => ownsAnyGun(), reqText: 'Needs a gun' },
    { id: 'recycler', at: 14, cat: 'weap', icon: '♻️', name: 'Recycler', max: 4, base: 80, grow: 1.7,
      desc: (l) => `${(l + 1) * 12}% chance a shot uses no ammo.`, req: () => ownsAnyGun(), reqText: 'Needs a gun' },
    { id: 'echo', at: 22, cat: 'weap', icon: '📣', name: 'Echo Chamber', max: 4, base: 320, grow: 1.9,
      desc: (l) => `${(l + 1) * 12}% chance that a gun fires twice.`, req: () => ownsAnyGun(), reqText: 'Needs a gun' },
    { id: 'workshop', at: 32, cat: 'weap', icon: '🛠️', name: 'Gun Workshop', max: 2, base: 1500, grow: 3,
      desc: (l) => `Every gun can go one level higher. Now: up to level ${5 + l}.`, req: () => ownsAnyGun(), reqText: 'Needs a gun' },

    { id: 'd_orbit', at: 6, cat: 'drone', icon: '🛰️', name: 'Orbiter', max: 3, base: 100, grow: 1.8,
      desc: (l) => `Circles your paddle and fires free shots. Owned: ${l}/3.` },
    { id: 'd_hunter', at: 15, cat: 'drone', icon: '🐝', name: 'Hunter Bee', max: 3, base: 160, grow: 1.9,
      desc: (l) => `Flies off and rams bricks on its own. Owned: ${l}/3.` },
    { id: 'd_collect', at: 9, cat: 'drone', icon: '🤖', name: 'Collector', max: 2, base: 90, grow: 2.2,
      desc: (l) => `Zips around grabbing falling coins and capsules. Owned: ${l}/2.` },
    { id: 'd_goalie', at: 12, cat: 'drone', icon: '🧤', name: 'Goalie', max: 3, base: 140, grow: 1.8,
      desc: (l) => l ? `Saves a missed ball. Recharge: ${goalieRecharge(l)}s → ${goalieRecharge(l + 1)}s.` : `Patrols below the paddle and saves a missed ball every ${goalieRecharge(1)}s.` },
    { id: 'd_over', at: 18, cat: 'drone', icon: '⚙️', name: 'Overclock', max: 3, base: 120, grow: 1.8,
      desc: (l) => `All drones work ${(l + 1) * 25}% faster.`, req: () => DRONE_IDS.some((d) => lv(d) > 0), reqText: 'Needs a drone' },
    { id: 'd_ufo', at: 34, cat: 'drone', icon: '🛸', name: 'Abductor', max: 2, base: 900, grow: 2.5,
      desc: (l) => `A saucer that beams away half of a brick every few seconds. Owned: ${l}/2.` },

    { id: 'width', at: 2, cat: 'gear', icon: '↔️', name: 'Long Paddle', max: 6, base: 40, grow: 1.5,
      desc: () => 'Paddle +12% wider.' },
    { id: 'magnet', at: 3, cat: 'gear', icon: '🧲', name: 'Coin Magnet', max: 5, base: 45, grow: 1.6,
      desc: (l) => (l ? 'Bigger, stronger pull.' : 'Pulls falling coins toward the paddle.') + (l >= 2 ? ' Now pulls capsules too.' : ' Level 3 also pulls capsules.') },
    { id: 'net', at: 4, cat: 'gear', icon: '🥅', name: 'Safety Net', max: 4, base: 70, grow: 1.8,
      desc: (l) => `A barrier that bounces back ${l + 1} missed ball${l ? 's' : ''} each level.` },
    { id: 'aim', at: 5, cat: 'gear', icon: '🎯', name: 'Aim Sight', max: 1, base: 25, grow: 1,
      desc: () => 'Shows the launch path before you tap.' },
    { id: 'shield', at: 10, cat: 'gear', icon: '🛡️', name: 'Deflector', max: 3, base: 70, grow: 1.7,
      desc: (l) => `Blocks ${l + 1} enemy hit${l ? 's' : ''} each level, so your paddle never gets stunned.` },
    { id: 'second', at: 15, cat: 'gear', icon: '🌬️', name: 'Second Wind', max: 2, base: 150, grow: 2,
      desc: (l) => `Losing your last ball costs no life, ${l + 1} time${l ? 's' : ''} per level.` },
    { id: 'starter', at: 11, cat: 'gear', icon: '🚦', name: 'Head Start', max: 2, base: 80, grow: 1.9,
      desc: (l) => `Start every level with ${l + 1} random power-up${l ? 's' : ''} active.` },
    { id: 'demo', at: 8, cat: 'gear', icon: '🧨', name: 'Demolition', max: 3, base: 65, grow: 1.7,
      desc: (l) => `Bomb bricks blast a wider area and deal ${l + 3} damage.` },
    { id: 'puluck', at: 6, cat: 'gear', icon: '🎁', name: 'Lucky Capsules', max: 4, base: 50, grow: 1.6,
      desc: () => 'More power-up capsules, and they last 15% longer.' },
    { id: 'sand', at: 13, cat: 'gear', icon: '⏳', name: 'Sand Timer', max: 3, base: 90, grow: 1.9,
      desc: (l) => `The clock runs ${(l + 1) * SAND_S} seconds longer on every level.` },

    { id: 'dmg', at: 2, cat: 'ball', icon: '🔩', name: 'Heavy Core', max: 6, base: 90, grow: 1.9,
      desc: (l) => `Ball deals ${l + 2} damage per hit.` },
    { id: 'crit', at: 5, cat: 'ball', icon: '✨', name: 'Crit Spark', max: 6, base: 60, grow: 1.5,
      desc: (l) => `${(l + 1) * 8}% chance for a triple-damage hit.` },
    { id: 'pierce', at: 14, cat: 'ball', icon: '🔥', name: 'Ember Core', max: 4, base: 110, grow: 1.9,
      desc: (l) => `After each paddle bounce the ball smashes through ${l + 1} brick${l ? 's' : ''} without bouncing.` },
    { id: 'twin', at: 8, cat: 'ball', icon: '⚪', name: 'Twin Serve', max: 3, base: 100, grow: 2.2,
      desc: (l) => `Every serve launches ${l + 2} balls.` },
    { id: 'momentum', at: 17, cat: 'ball', icon: '☄️', name: 'Momentum', max: 4, base: 140, grow: 1.9,
      desc: (l) => `Each brick in a streak adds ${(l + 1) * 4}% ball damage, up to +${(l + 1) * 100}%. A paddle bounce resets it.` },
    { id: 'splash', at: 11, cat: 'ball', icon: '💥', name: 'Shatter Core', max: 4, base: 95, grow: 1.7,
      desc: (l) => `${(l + 1) * 15}% chance a ball hit also chips every brick around it.` },
    { id: 'chill', at: 13, cat: 'ball', icon: '❄️', name: 'Chill Field', max: 3, base: 60, grow: 1.7,
      desc: () => 'Ball moves 7% slower. Easier to follow.' },

    { id: 'luck', at: 2, cat: 'eco', icon: '🍀', name: 'Lucky Bricks', max: 6, base: 45, grow: 1.7,
      desc: (l) => `Coin drop chance ${Math.round(coinChance(l) * 100)}% → ${Math.round(coinChance(l + 1) * 100)}%.` },
    { id: 'value', at: 5, cat: 'eco', icon: '🪙', name: 'Gold Plating', max: 5, base: 90, grow: 2.3,
      desc: (l) => `Every coin is worth ${(l + 1) * 10}% more.` },
    { id: 'piggy', at: 7, cat: 'eco', icon: '🐷', name: 'Piggy Bank', max: 4, base: 80, grow: 1.7,
      desc: (l) => `Earn ${(l + 1) * 5}% interest on savings after each level (max ${(l + 1) * piggyCap()}).` },
    { id: 'streak', at: 8, cat: 'eco', icon: '🔗', name: 'Streak Bonus', max: 3, base: 70, grow: 2,
      desc: (l) => `Streak payouts are ${(l + 1) * 25}% bigger. Every 5 bricks without touching the paddle pays out, more the longer it runs.` },
    { id: 'foebounty', at: 9, cat: 'eco', icon: '🎯', name: 'Monster Bounty', max: 3, base: 70, grow: 1.7,
      desc: (l) => `Enemies drop +${l + 1} coin${l ? 's' : ''}, bosses drop ${(l + 1) * 25}% more.` },
    { id: 'bounty', at: 4, cat: 'eco', icon: '💰', name: 'Bounty Board', max: 4, base: 55, grow: 1.6,
      desc: (l) => `Level clear bonus +${(l + 1) * 15}%.` },
    { id: 'bonds', at: 20, cat: 'eco', icon: '📜', name: 'Bazaar Bonds', max: 8, base: 220, grow: 1.45,
      desc: (l) => `Pays ${bondPay(l + 1)} coins after every level, for the rest of the run.${l ? ` Now: ${bondPay(l)}.` : ''}` },
    { id: 'goldage', at: 28, cat: 'eco', icon: '🏺', name: 'Golden Age', max: 99, base: 500, grow: 1.7,
      desc: (l) => `Every coin is worth 10% more. Now +${l * 10}%. No limit.` },

    { id: 'bait', at: 9, cat: 'blimp', icon: '🪱', name: 'Blimp Bait', max: 2, base: 90, grow: 2.5,
      desc: (l) => `${l + 2} blimps visit every level.` },
    { id: 'cargo', at: 12, cat: 'blimp', icon: '📦', name: 'Fat Cargo', max: 3, base: 110, grow: 2.2,
      desc: (l) => `Each hit on a loot blimp shakes out ${l + 3} coins. A mother ship gives 2 more.` },
    { id: 'safari', at: 14, cat: 'blimp', icon: '🎪', name: 'Bonus Ticket', price: () => safariPrice(), full: () => run.safariAt === run.level,
      desc: () => `A random bonus round, right now: ${SAFARI_S} seconds of blimps, a piñata or bumpers. The price follows your best haul. One ticket per visit.`,
      use: () => { run.safariAt = run.level; run.pendingSafari = pick(BONUS_ORDER); } },
    { id: 'hull', at: 15, cat: 'blimp', icon: '🧵', name: 'Patched Hulls', max: 2, base: 160, grow: 2.4,
      desc: (l) => `In a level, blimps survive ${l + 1} more hit${l ? 's' : ''}. More hits, more loot. Not golden blimps.` },
    { id: 'goldtix', at: 19, cat: 'blimp', icon: '🎫', name: 'Golden Ticket', max: 3, base: 200, grow: 2.2,
      desc: (l) => `Golden blimps come ${l + 2} times as often. They are fast and full of coins.` },
    { id: 'd_blimp', at: 24, cat: 'blimp', icon: '🎈', name: 'War Blimp', max: 3, base: 420, grow: 2.1,
      desc: (l) => `Your own blimp. It floats over the bricks and drops bombs. Owned: ${l}/3.` },

    { id: 'power', at: 11, cat: 'wild', icon: '🔥', name: 'Overcharge', max: 99, base: 150, grow: 1.35,
      desc: (l) => `All damage +10%. Now +${l * 10}%. No limit.` },
    { id: 'box', at: 10, cat: 'wild', icon: '🎁', name: 'Mystery Box', flat: true, price: () => boxPrice(), full: () => upgradePool().length === 0,
      desc: () => 'One level of a random upgrade. Often worth more than it costs.',
      use: () => { const it = pick(upgradePool()); run.up[it.id] = lv(it.id) + 1; lastBox = lv(it.id) < maxOf(it) ? it.id : null; return `🎁 ${it.icon} ${it.name} level ${lv(it.id)}!`; } },
    { id: 'reroll', at: 12, cat: 'wild', icon: '🏷️', name: 'New Sales', price: () => 20 * (1 + shopRerolls),
      desc: () => 'Two new upgrades go on sale for 30% off.',
      use: () => { shopRerolls++; rollDeals(); return '🏷️ New sales are up!'; } },
    { id: 'relicbuy', at: 16, cat: 'wild', icon: '🗿', name: 'Relic Dealer', price: () => 400 * Math.pow(2, run.relicsBought), full: () => relicChoices().length === 0,
      desc: () => 'Pick one of three relics, right now.',
      use: () => { run.relicsBought++; run.pendingRelic = true; } },
    { id: 'life', at: 4, cat: 'wild', icon: '❤️', name: 'Extra Life', price: () => lifePrice(), full: () => run.lives >= 6,
      desc: () => `+1 life (max 6). You have ${run ? run.lives : 0}.`,
      use: () => { run.lives++; run.lifeBought++; } },
    { id: 'parbet', at: 10, cat: 'wild', icon: '🎟️', name: 'Speed Bet', flat: true, price: () => betStake(), full: () => run.bet > 0,
      desc: () => (run.bet ? `You bet ${run.bet} coins on the next level.` : `Bet that you clear the next level in the first half of the clock. Win: ${BET_PAYS} times your stake.`),
      use: () => { run.bet = betStake(); return '🎟️ The bet is on!'; } },
    { id: 'order', at: 17, cat: 'wild', icon: '📅', name: 'Special Order', price: () => 40 + 8 * run.level, full: () => !run.offer || !!run.nextSpecial || !!levelDef(run.level).boss,
      desc: () => (run.nextSpecial ? `Booked for the next level: ${specialById(run.nextSpecial).name}.` : levelDef(run.level).boss || !run.offer ? 'Book a special for the next level. Not for boss levels.'
        : `Book ${specialById(run.offer).name} for the next level: ${specialById(run.offer).text.toLowerCase()}.`),
      use: () => { run.nextSpecial = run.offer; return `📅 ${specialById(run.offer).name} is booked!`; } },
    { id: 'odd', at: 9, cat: 'wild', icon: '🧿', name: 'Oddity', price: () => 30 + 5 * run.level, full: () => !!run.odd || !run.oddOffer,
      desc: () => { const o = ODDS[run.odd || run.oddOffer]; return o ? `${run.odd ? 'Yours' : 'Today'}: ${o.icon} ${o.name}. ${o.text} For the next level only.` : 'Nothing odd today.'; },
      use: () => { run.odd = run.oddOffer; return `🧿 ${ODDS[run.odd].icon} ${ODDS[run.odd].name}. No refunds.`; } },
    { id: 'dare', at: 13, cat: 'wild', icon: '🤞', name: 'Dare', price: () => 0, verb: 'Take the dare', full: () => !!run.dare || !run.dareOffer,
      desc: () => (run.dare ? `You took the dare: ${DARES[run.dare].text.toLowerCase()}.` : run.dareOffer ? `In the next level: ${DARES[run.dareOffer].text.toLowerCase()}. Do it for ${betStake()} coins. A failed dare costs nothing.` : 'No dare today.'),
      use: () => { run.dare = run.dareOffer; return '🤞 Dare taken!'; } },
    { id: 'wanted', at: 27, cat: 'wild', icon: '🤠', name: 'Wanted Poster', price: () => Math.round(120 * levelVal() * Math.pow(1.6, run.wantedWon || 0)),
      full: () => !!run.wanted || !!levelDef(run.level).boss || run.level % 5 === 0 || relicChoices().length === 0,
      desc: () => (run.wanted ? 'A brick in the next level is WANTED.' : `One brick in the next level is WANTED. Break it with a ball in the first ${WANTED_S} seconds and you pick a relic. Not for levels that give a relic anyway.`),
      use: () => { run.wanted = true; return '🤠 The hunt is on!'; } },

    { id: 'chili', at: 23, cat: 'dark', icon: '🌶️', name: 'Ghost Pepper', price: () => 150 + 30 * run.level,
      desc: () => `Heat +1, right now: tougher bricks${run.heat >= 0 ? ', bigger bonuses' : ''}. Heat is ${run.heat}.`,
      use: () => { run.heat++; if (run.heat >= 8) sticker('hot'); return '🌶️ It burns!'; } },
    { id: 'icecream', at: 23, cat: 'dark', icon: '🍦', name: 'Ice Cream', price: () => Math.round((40 + 10 * run.level) * Math.pow(HEAT_HP, Math.max(0, run.heat))), full: () => run.heat <= HEAT_MIN || run.iceAt === run.level,
      desc: () => `Heat −1, right now: softer bricks${run.heat > 0 ? ', smaller bonuses' : ''}. Heat is ${run.heat}.`,
      use: () => { run.heat--; run.iceAt = run.level; return '🍦 Ahh. Cooler. One per visit.'; } },
    { id: 'devil', at: 25, cat: 'dark', icon: '😈', name: "Devil's Bargain", price: () => 0, full: () => run.lives <= 1 || relicChoices().length === 0,
      desc: () => 'Give one life. Pick a relic.', verb: 'Trade a life',
      use: () => { run.lives--; run.pendingRelic = true; } },
    { id: 'edge', at: 30, cat: 'dark', icon: '🗡️', name: 'Double Edge', max: 3, base: 500, grow: 2.2,
      desc: (l) => `All damage +25%, but the clock is ${EDGE_S} seconds shorter.${l ? ` Now +${l * 25}%, −${l * EDGE_S} s.` : ''}` },
  ];
  // The arcade: the mini-games of minigames.js (window.BBMini) as shop items. The price is the stake, the game pays a
  // multiple of it, and each game can be played once per shop visit.
  const ARCADE_FROM = { shell: 12, race: 15, whack: 18 };
  const arcadeDone = (id) => !!(run.arcade && run.arcade.at === run.level && run.arcade[id]);
  for (const g of window.BBMini ? window.BBMini.list : []) {
    ITEMS.push({ id: 'mg_' + g.id, at: ARCADE_FROM[g.id] || Math.max(20, g.at || 0), cat: 'arcade', icon: g.icon, name: g.name, verb: 'Play', flat: true, price: () => Math.round(betStake() * priceIndex()), full: () => arcadeDone(g.id),
      desc: () => `${g.blurb} The price is your stake. One game per visit.`, use: () => { run.pendingMini = g.id; } });
  }
  const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
  for (const it of ITEMS) {
    if (!it.gun) continue;
    it.icon = GUNS[it.gun].icon; it.name = GUNS[it.gun].name; it.gunItem = true; it.desc = (l) => gunDesc(it.gun, l);
  }

  const coinChance = (l) => 0.16 + 0.04 * l;
  const lifePrice = () => Math.round(60 * Math.pow(1.45, run.lifeBought));
  const piggyCap = () => 20 + 2 * run.level;
  // The value of a coin rises with the level, so that the income follows the prices. Upgrades add to it.
  const levelVal = () => 1 + run.level / 20;
  const coinVal = () => levelVal() * (1 + 0.1 * lv('value')) * (1 + 0.1 * lv('goldage'));
  // A ticket costs 70% of the best safari haul of the run, so that it stays a gamble.
  const safariPrice = () => Math.max(Math.round(80 * coinVal()), Math.round(0.7 * (run.safariBest || 0)));
  const betStake = () => Math.round((15 + 4 * run.level) * COIN_MULT);
  // The Mystery Box costs three quarters of the average price in its pool.
  function boxPrice() { const pool = upgradePool(); return pool.length ? Math.round(0.75 * pool.reduce((a, it) => a + itemCost(it), 0) / pool.length) : 0; }
  const goalieRecharge = (l) => [0, 12, 9, 6, 6][Math.min(l, 4)];
  const lv = (id) => (run && run.up[id]) || 0;
  const ownsAnyGun = () => Object.keys(GUNS).some((g) => lv('gun_' + g) > 0);
  const RELOAD_CUT = 0.82; // reload time factor per Quick Hands level
  // A reload runs at RELOAD_IDLE of its speed by itself, and each paddle bounce takes RELOAD_HIT seconds off it.
  // So a player who keeps the balls in play reloads fast, and guns do little for a player who does not play.
  const RELOAD_IDLE = 0.5, RELOAD_HIT = 1.6;
  const DRONE_IDS = ['d_orbit', 'd_hunter', 'd_collect', 'd_goalie', 'd_blimp', 'd_ufo'];
  const gunMax = () => 5 + lv('workshop');
  const maxOf = (it) => (it.gunItem ? gunMax() : it.max);
  const bondPay = (l) => 10 * l + 4 * l * (l - 1);
  const odd = (k) => run.odd === k && !(G && G.safari);
  const ODDS = {
    flip: { icon: '🙃', name: 'Upside-Down Map', text: 'The map is upside down: the soft rows are on top.' },
    grease: { icon: '🧈', name: 'Greasy Paddle', text: 'The paddle is 50% wider, but it slides slowly.' },
    bouncy: { icon: '🏀', name: 'Bouncy Castle', text: 'The ball is 25% faster and hits 50% harder.' },
    tiny: { icon: '🔬', name: 'Shrink Ray', text: 'The balls are half the size. They fit through any gap.' },
  };
  // A dare is a free bet on the next level. ok() says if the level allows it, done() if the player did it.
  const DARES = {
    clean: { text: 'Lose no ball', ok: () => true, done: () => G.flawless },
    streak: { text: 'Break 30 bricks in one streak', ok: () => !levelDef(run.level).boss, done: () => G.comboBest >= 30 },
    blimps: { text: 'Pop 2 blimps', ok: () => !levelDef(run.level).boss && run.level >= FROM.blimp, done: () => G.popped >= 2 },
    dings: { text: 'Hit the sweet spot 3 times in a row', ok: () => run.level >= FROM.sweet, done: () => G.dingBest >= 3 },
    smash: { text: 'Land 5 smashes', ok: () => run.level >= FROM.smash, done: () => G.smashes >= 5 },
  };
  const SAND_S = 8, EDGE_S = 8, BET_PAYS = 2.5, SAFARI_S = 20;
  // Heat: the game adapts to the player. A fast clear adds heat, a slow clear removes heat.
  // Each point makes bricks, monsters and bosses 25% tougher, and the level bonuses 6% bigger, up to 30%.
  const HEAT_MIN = -6, HEAT_HP = 1.25, HEAT_PAY = 0.06, HEAT_PAY_MAX = 0.3;
  const heatMult = () => Math.pow(HEAT_HP, run.heat);
  // The change of Heat after a level. share = the part of the clock that the level took. A level that takes
  // HEAT_TARGET of its clock changes nothing; a faster or slower level moves Heat in proportion, so that one very
  // fast level is answered at once. The caller scales the share to a map of HEAT_BRICKS bricks, because a small map
  // is always quick.
  const HEAT_TARGET = 0.4, HEAT_GAIN = 0.5, HEAT_BRICKS = 50;
  const heatStep = (share, late) => (late ? -3 : clamp(Math.round((HEAT_GAIN * Math.log(HEAT_TARGET / Math.max(share, 0.03))) / Math.log(HEAT_HP)), -3, 3));
  const heatPay = () => 1 + Math.min(HEAT_PAY_MAX, HEAT_PAY * Math.max(0, run.heat));
  // The game holds these features back until the given level, so that a new player meets one thing at a time.
  const FROM = { capsules: 2, fever: 5, sales: 6, streak: 7, blimp: 8, clock: 9, sweet: 11, heat: 12, specials: 13, smash: 16 };
  // The first level on which each capsule can drop.
  const PU_FROM = { wide: 2, multi: 2, slow: 2, cash: 3, life: 4, glue: 5, fire: 6, ammo: 6, net: 7, mega: 8, freeze: 9, blimp: 10, x2: 11, storm: 14, gold: 17, nuke: 20 };
  const unlocked = (it) => run.level >= it.at || lv(it.id) > 0;
  // upgrades that can still go up: the pool for sales and the Mystery Box
  const upgradePool = () => ITEMS.filter((it) => it.base && it.max < 99 && it.cat !== 'dark' && unlocked(it) && !(it.req && !it.req()) && lv(it.id) < maxOf(it));

  // Prices follow the player's wealth, as Heat follows the player's speed. refCoins(level) is the money that an
  // average run has earned when it reaches that level; earned() is what this run has earned. A richer run pays more
  // and a poorer run pays less, so that the shop cannot be bought empty early, whatever new coin source the game gets.
  // flat = an item whose price is a stake or is already made from other prices.
  const PRICE_FROM = 12, PRICE_K = 0.65;
  const earned = () => run.coins + (run.spent || 0);
  const refCoins = (n) => 3.1 * Math.pow(n, 2.75);
  const priceIndex = () => (run.level < PRICE_FROM ? 1 : clamp(Math.pow(earned() / refCoins(run.level), PRICE_K), 0.7, 99));
  function itemCost(it) {
    if (it.price) return Math.round(it.price() * (it.flat ? 1 : priceIndex()));
    return Math.round(it.base * Math.pow(it.grow, lv(it.id)) * (onSale(it) ? SALE : 1) * haggleF(it) * priceIndex());
  }
  // Two random upgrades are discounted on every shop visit.
  const SALE = 0.7;
  const onSale = (it) => run.deals.includes(it.id);
  function itemState(it) {
    if (!unlocked(it) || (it.req && !it.req())) return 'locked';
    if (it.use ? it.full && it.full() : lv(it.id) >= maxOf(it)) return 'max';
    return run.coins >= itemCost(it) ? 'ok' : 'poor';
  }
  let shopMsg = '', shopRerolls = 0, shopLevel = 0;
  // Mortimer Mortar keeps the Bazaar. He is a snail. His lines change nothing in the game.
  const QUIPS = {
    open: ['Welcome back. Wipe your feet. Not on the bricks.', 'Fresh stock! Well. Stock.', 'Take your time. I always do.', 'Everything here fell off a blimp.', 'You break it, you bought it. That is the business model.'],
    boss: ['A boss is next door. Do not tell him my prices.', 'Big one coming. Buy something sharp.', 'If you see the Auditor, I was never here.'],
    buy: ['Pleasure.', 'No refunds. I am a snail. I cannot chase you.', 'A fine choice. Probably.', 'Sold! Slowly.', 'That one was my favourite. They all are.'],
    poor: ['That is a lot of zeros you do not have.', 'Window shopping is free. For now.', 'Come back when your purse is heavier than me.'],
    sale: ['You are robbing me. Please continue.', 'Thirty percent off. My shell weeps.'],
    chili: ['Smells like a bad decision. Enjoy.'],
    icecream: ['Sensible. Boring, but sensible.'],
    devil: ['Oh no. Not HIM again. He never wipes his feet.'],
    box: ['I do not know what is in it. Nobody does.'],
    haggleArm: ['Go on. Point at something.'],
    haggleWin: ['Fine. FINE. My children will eat gravel.', 'You drive a hard bargain. I drive a shell.'],
    haggleLose: ['Haggling? In THIS economy? The price went up.', 'Now it costs more. That is how insults work.'],
    haggleNo: ['Not that one. I have principles. Two of them.'],
    donWin: ["Beginner's luck. Every time."],
    donLose: ['The box ate it. Boxes do that.'],
    tip: ['Oh! Thank you.', 'Most kind.', 'For the shell fund.', 'You are my favourite customer. Today.'],
  };
  const TIP_LINES = { 1: 'Oh! A tip! Thank you.', 5: 'I will name a brick after you.', 9: 'One more and you get a surprise.', 10: 'Here. A Mystery Box, on the house.',
    24: 'One more. Trust me.', 25: 'My favourite brick will visit your next level. Be gentle. Or not.', 49: 'One more and I open the back room.', 50: 'Take a relic. I am retiring. Kidding.' };
  let keeper = '', haggleArm = false, lastBox = null, lastPaid = 0;
  // Mortimer's lines are in snail.js. A key that is not there falls back to the short list in QUIPS.
  // {n} in a line is replaced by a number.
  function snailSay(key, n) {
    const all = (window.BB_SNAIL && window.BB_SNAIL.lines) || {};
    const list = all[key] && all[key].length ? all[key] : QUIPS[key] || [];
    return list.length ? pick(list).replace('{n}', n) : '';
  }
  const quip = (ev, n) => { keeper = snailSay(ev, n) || snailSay('open'); };
  const snailBubble = (key, n) => { const t = snailSay(key, n); return t ? `<div class="keeper"><span class="snail">🐌</span><span class="bubble">${t}</span></div>` : ''; };
  // What he says when the player comes in: the most special thing first.
  function greet() {
    const idx = priceIndex(), last = lastSummary, pct = Math.round(Math.abs(idx - 1) * 100);
    if (levelDef(run.level).boss) quip('boss');
    else if (last && last.boss) quip('afterBoss');
    else if (last && last.late) quip('lateVisit');
    else if (run.lives <= 1) quip('lives1');
    else if (idx >= 1.15 && Math.random() < 0.6) quip('inflation', pct);
    else if (idx <= 0.9 && Math.random() < 0.6) quip('discount', pct);
    else if (!ITEMS.some((it) => unlocked(it) && itemState(it) === 'ok')) quip('broke');
    else if (run.coins > 6 * betStake() && Math.random() < 0.4) quip('rich');
    else quip('open');
  }
  // One haggle per shop visit: the price of one upgrade goes 25% down or 25% up, until you leave.
  const haggleF = (it) => (run.haggle && run.haggle.id === it.id && run.haggle.at === run.level ? run.haggle.f : 1);
  function haggle(it) {
    haggleArm = false;
    const st = itemState(it);
    if (!it.base || (st !== 'ok' && st !== 'poor')) { quip('haggleNo'); sfx.nope(); return; }
    const win = Math.random() < 0.5;
    run.haggle = { id: it.id, at: run.level, f: win ? 0.75 : 1.25 }; saveRun();
    quip(win ? 'haggleWin' : 'haggleLose'); if (win) sfx.jackpot(); else sfx.nope();
  }
  const tipCost = () => Math.max(1, Math.round(coinVal() * (1 + run.tips / 4)));
  function tip() {
    if (run.coins < tipCost()) { quip('poor'); sfx.nope(); return; }
    run.spent = (run.spent || 0) + tipCost();
    run.coins -= tipCost(); run.tips++; shopMsg = '';
    keeper = TIP_LINES[run.tips] || snailSay('tip'); sfx.coin(run.tips % 8);
    if (run.tips === 10) { sticker('tipper'); if (upgradePool().length) shopMsg = ITEM_BY_ID.box.use(); }
    if (run.tips === 25) run.favourite = true;
    if (run.tips === 50 && relicChoices().length) run.pendingRelic = true;
    saveRun();
  }
  // After a Mystery Box: a coin flip for one more level of the same upgrade, or the loss of the level from the box.
  function doubleOrNothing() {
    const it = ITEM_BY_ID[lastBox]; lastBox = null;
    if (!it || lv(it.id) < 1) return;
    const win = Math.random() < 0.5;
    run.up[it.id] = lv(it.id) + (win ? 1 : -1);
    shopMsg = win ? `🎲 ${it.icon} ${it.name} level ${lv(it.id)}!` : `🎲 ${it.icon} ${it.name} is back at level ${lv(it.id)}.`;
    quip(win ? 'donWin' : 'donLose'); if (win) sfx.jackpot(); else sfx.nope();
    saveRun();
  }
  function buy(it) {
    if (itemState(it) !== 'ok') { sfx.nope(); quip('poor'); return false; }
    const sale = onSale(it), cost = itemCost(it);
    run.coins -= cost; run.spent = (run.spent || 0) + cost; lastPaid = cost;
    shopMsg = ''; lastBox = null;
    if (it.use) shopMsg = it.use() || '';
    else run.up[it.id] = lv(it.id) + 1;
    quip(QUIPS[it.id] ? it.id : !it.use && lv(it.id) >= maxOf(it) ? 'maxed' : sale ? 'sale' : it.gunItem ? 'gunBuy' : it.cat === 'drone' ? 'droneBuy'
      : it.cat === 'blimp' ? 'blimpBuy' : it.id === 'relicbuy' ? 'relicBuy' : 'buy');
    sfx.buy(); buzz(12); saveRun(); return true;
  }

  // ---------- run / save ----------
  let run = null;
  function newRun() {
    return { level: 1, coins: 0, lives: 3, up: {}, lifeBought: 0, relicsBought: 0, score: 0,
      relics: {}, fever: 0, deals: [], pendingRelic: false, champion: false, bonusStart: 0, stats: newStats(),
      heat: 0, bet: 0, offer: null, nextSpecial: null, safariAt: 0, pendingSafari: false,
      spent: 0, kit: 'none', tips: 0, dare: null, dareOffer: null, banked: {}, star3: 0 };
  }
  const newStats = () => ({ bricks: 0, coins: 0, streak: 0, foes: 0, stars: 0, blimps: 0 });
  function saveRun() { if (run) store.set(SAVE_KEY, run); }
  function loadRun() {
    const r = store.get(SAVE_KEY, null);
    if (!r || typeof r.level !== 'number') return null;
    r.up = r.up || {};
    // older saves do not have these fields
    r.relics = r.relics || {}; r.fever = r.fever || 0; r.deals = r.deals || [];
    r.lifeBought = r.lifeBought || 0; r.relicsBought = r.relicsBought || 0; r.bonusStart = r.bonusStart || 0;
    r.stats = Object.assign(newStats(), r.stats || {});
    if (r.spent == null) {
      r.spent = 0;
      for (const it of ITEMS) for (let i = 0; it.base && i < (r.up[it.id] || 0); i++) r.spent += Math.round(it.base * Math.pow(it.grow, i));
    }
    r.heat = r.heat || 0; r.bet = r.bet || 0; r.tips = r.tips || 0; r.banked = r.banked || {}; r.star3 = r.star3 || 0;
    // The Big Ball upgrade is gone. A save that has it gets the coins back.
    for (let i = 0; i < (r.up.bigball || 0); i++) r.coins += Math.round(85 * Math.pow(1.8, i));
    delete r.up.bigball;
    return r;
  }
  let best = store.get(BEST_KEY, { level: 0, score: 0 });

  // ---------- album, kits and lifetime totals ----------
  // meta outlives the run: the stickers, and totals over all runs.
  const meta = Object.assign({ stickers: {}, bricks: 0, blimps: 0, foes: 0, coins: 0, wins: 0, runs: 0 }, store.get(META_KEY, {}));
  const saveMeta = () => store.set(META_KEY, meta);
  const STICKERS = [
    { id: 'first', icon: '🧱', name: 'First Brick', hint: 'Clear level 1.' },
    { id: 'runner', icon: '🏃', name: 'Tag, You Are It', hint: 'Catch a runaway brick.' },
    { id: 'perfect', icon: '🔔', name: 'Ding Dong', hint: 'Hit the sweet spot 5 times in a row.' },
    { id: 'boss1', icon: '👑', name: 'Regicide', hint: 'Beat the Crate King.' },
    { id: 'late', icon: '⏰', name: 'Fashionably Late', hint: 'Let the clock run out.' },
    { id: 'broke', icon: '🕳️', name: 'Tax Evasion', hint: 'Start a level with 0 coins.' },
    { id: 'streak', icon: '🧻', name: 'Toilet Paper Trail', hint: 'Break 50 bricks in one streak.' },
    { id: 'plumber', icon: '⭐', name: 'Three-Star Plumber', hint: 'Get 3 stars on 5 levels in a row.' },
    { id: 'butter', icon: '🧈', name: 'Butterfingers', hint: 'Lose 3 balls in one level and still clear it.' },
    { id: 'chicken', icon: '🐔', name: 'Poultry in Motion', hint: 'Clear a level with the rubber chicken in play.' },
    { id: 'convoy', icon: '🚂', name: 'Convoy Robbery', hint: 'Pop all five blimps of a convoy.' },
    { id: 'tilt', icon: '🎯', name: 'Tilt', hint: 'Light all seven bumpers twice in one round.' },
    { id: 'bubble', icon: '🎈', name: 'Bubble Wrap Enthusiast', hint: 'Pop 25 blimps in one run.' },
    { id: 'spin', icon: '🐚', name: 'Shell Shocked', hint: 'Find the pearl in the shell game.' },
    { id: 'tipper', icon: '🫙', name: 'Big Tipper', hint: 'Tip the shopkeeper 10 times in one run.' },
    { id: 'bounty', icon: '🤠', name: 'Bounty Hunter', hint: 'Win a Wanted Poster.' },
    { id: 'hoard', icon: '🗿', name: 'Relic Hoarder', hint: 'Own 8 relics.' },
    { id: 'hot', icon: '🌶️', name: 'Too Hot To Handle', hint: 'Reach Heat 8.' },
    { id: 'windbag', icon: '💨', name: 'Gone With The Windbag', hint: 'Pop the Windbag.' },
    { id: 'mash', icon: '👾', name: 'Monster Mash', hint: 'Pop 200 monsters in one run.' },
    { id: 'landlord', icon: '🏠', name: 'Landlord', hint: 'Clear level 50.' },
    { id: 'crash', icon: '💾', name: 'Have You Tried Turning It Off', hint: 'Break the game. It gets better.' },
  ];
  const stickerCount = () => STICKERS.filter((k) => meta.stickers[k.id]).length;
  let newStickers = []; // earned since the last results screen
  function sticker(id) {
    if (meta.stickers[id]) return;
    meta.stickers[id] = true; saveMeta();
    const k = STICKERS.find((x) => x.id === id);
    newStickers.push(k);
    if (G && mode === 'play') { say(W / 2, H * 0.32, `📒 STICKER: ${k.name}`, '#7cf2ff', 2.6, true); sfx.relic(); }
  }
  function stickerNote() {
    if (!newStickers.length) return '';
    const html = `<div class="unlock">📒 New sticker${newStickers.length > 1 ? 's' : ''}: ${newStickers.map((k) => `<b>${k.icon} ${k.name}</b>`).join(' · ')}</div>`;
    newStickers = [];
    return html;
  }
  // Adds what this run did since the last call to the lifetime totals.
  function bankStats() {
    for (const k of ['bricks', 'blimps', 'foes', 'coins']) { meta[k] += run.stats[k] - (run.banked[k] || 0); run.banked[k] = run.stats[k]; }
    saveMeta();
  }
  // Starting kits. A kit opens when the album has enough stickers.
  const KITS = [
    { id: 'none', icon: '🧺', name: 'Empty Pockets', need: 0, desc: 'The normal start.', apply: () => {} },
    { id: 'hoarder', icon: '💰', name: 'Hoarder', need: 3, desc: 'Start with 150 coins.', apply: (r) => { r.coins = 150; } },
    { id: 'plumber', icon: '🗿', name: 'Plumber', need: 6, desc: 'Start with a relic of your choice.', apply: (r) => { r.pendingRelic = true; } },
    { id: 'blimps', icon: '🎈', name: 'Blimp Whisperer', need: 9, desc: 'Blimps come from level 2, and one more visits every level.', apply: () => {} },
    { id: 'sauce', icon: '🌶️', name: 'Hot Sauce', need: 12, desc: 'Start at Heat 3 with a Pea Blaster. Tougher bricks, bigger bonuses.', apply: (r) => { r.heat = 3; r.up.gun_blaster = 1; } },
    { id: 'cat', icon: '🐈', name: 'Nine Lives', need: 15, desc: 'Start with 6 lives.', apply: (r) => { r.lives = 6; } },
  ];
  const blimpFrom = () => (run.kit === 'blimps' ? 2 : FROM.blimp);
  function beginRun(kitId) {
    const kit = KITS.find((k) => k.id === kitId) || KITS[0];
    run = newRun(); lastSummary = null; store.del(SAVE_KEY); shopLevel = 0;
    run.kit = kit.id; kit.apply(run);
    meta.runs++; saveMeta(); saveRun();
    if (run.pendingRelic) showRelics(); else startLevel();
  }
  const brickFact = (n) => (n < 500 ? 'a garden wall' : n < 5000 ? 'a garage' : n < 20000 ? 'a small house' : n < 100000 ? 'a block of flats' : 'a small town');
  function recordBest() {
    const reached = run.level;
    if (reached > best.level || run.score > best.score) {
      best = { level: Math.max(best.level, reached), score: Math.max(best.score, run.score) };
      store.set(BEST_KEY, best);
    }
  }

  // ---------- levels ----------
  // The campaign maps are in levels.js.
  const LEVELS = window.BB_LEVELS;
  const BRICK_COLORS = ['#5ef0ff', '#7cf2a8', '#ffe066', '#ffa94d', '#ff6b8b', '#c08cff', '#7c8cff'];

  function makeBrick(r, c, type, hp) {
    return { x: LEFT + c * (BW + GAP), y: TOP + r * (BH + GAP), w: BW, h: BH, hp, maxhp: hp, type, alive: true, flash: 0, col: c, row: r, spawnT: 6 + Math.random() * 4,
      punch: 0, delay: r * 0.045 + c * 0.022, loot: 8 };
  }
  // Brick toughness by level: [level, factor], linear between the points. It follows the arsenal that a player
  // can afford at that level, with average play. Heat corrects it for each player. The first five levels have soft
  // bricks. After level 50 it grows 5% per level.
  const HP_CURVE = [[1, 0.6], [5, 0.6], [6, 1], [8, 1], [12, 1.6], [16, 3.5], [20, 8], [24, 16], [30, 45], [35, 100], [40, 180], [45, 300], [50, 420]];
  function hpMult(n) {
    if (n >= 50) return 420 * Math.pow(1.05, n - 50);
    const i = HP_CURVE.findIndex(([l]) => l > n), [l0, h0] = HP_CURVE[i - 1], [l1, h1] = HP_CURVE[i];
    return h0 + ((h1 - h0) * (n - l0)) / (l1 - l0);
  }
  function brickFor(ch, r, c, n) {
    const m = hpMult(n) * heatMult();
    if (ch >= '1' && ch <= '9') return makeBrick(r, c, 'normal', Math.round(+ch * m));
    if (ch === 'S') return makeBrick(r, c, 'steel', Math.round((4 + Math.floor(Math.min(n, 50) / 6)) * m));
    if (ch === 'B') return makeBrick(r, c, 'bomb', 1);
    if (ch === 'T') return makeBrick(r, c, 'tnt', 1);
    if (ch === 'G') return makeBrick(r, c, 'gold', Math.round((2 + Math.floor(Math.min(n, 50) / 8)) * m));
    if (ch === 'X') return makeBrick(r, c, 'stone', 999);
    if (ch === 'H') return makeBrick(r, c, 'hive', Math.round((6 + Math.floor(Math.min(n, 50) / 5)) * m));
    if (ch === 'Z') return makeBrick(r, c, 'volt', Math.round(2 * m));
    if (ch === 'P') return makeBrick(r, c, 'prism', Math.round(2 * m));
    if (ch === 'D') return makeBrick(r, c, 'dice', Math.round(2 * m));
    if (ch === 'C') return makeBrick(r, c, 'chest', Math.round(6 * m));
    if (ch === '?') return makeBrick(r, c, 'mystery', Math.round(m));
    if (ch === 'J') return makeBrick(r, c, 'pinata', PINATA_HITS);
    return null;
  }
  // Endless mode after the campaign: seeded symmetric maps, more enemies, a boss every 10 levels.
  const PINATA_HITS = 5;
  const SPECIAL_BRICKS = [[0.08, 'S'], [0.1, 'B'], [0.13, 'G'], [0.145, 'H'], [0.165, 'Z'], [0.185, 'P'], [0.2, '?'], [0.212, 'T'], [0.226, 'C'], [0.24, 'D'], [0.25, 'J']];
  function endlessLevel(n) {
    const rnd = mulberry32(n * 7919 + 13), over = n - LEVELS.length;
    const R = 7 + Math.floor(rnd() * 3);
    const top = Math.min(9, 7 + Math.floor(over / 5));
    const boss = n % 10 === 0 ? 1 + ((n / 10 - 1) % (BOSSES.length - 1)) : 0;
    const map = [];
    if (boss) for (let r = 0; r < 5; r++) map.push('..........');
    const rows = boss ? 3 : R;
    for (let r = 0; r < rows; r++) {
      const half = [];
      for (let c = 0; c < 5; c++) {
        const roll = rnd();
        let ch = roll < 0.78 ? String(Math.max(1, Math.min(9, top - Math.floor(r / 2) - Math.floor(rnd() * 2)))) : '.';
        const sp = SPECIAL_BRICKS.find(([p]) => roll < p);
        if (sp && !(boss && sp[1] === 'H')) ch = sp[1];
        half.push(ch);
      }
      map.push(half.join('') + half.slice().reverse().join(''));
    }
    if (!boss) {
      map.push('..........', '..........');
      for (let r = 0; r < 2; r++) {
        const half = [];
        for (let c = 0; c < 5; c++) {
          const roll = rnd();
          half.push(r === 1 && roll < 0.1 ? 'X' : roll < 0.45 ? String(Math.max(1, top - 3 - Math.floor(rnd() * 2))) : '.');
        }
        map.push(half.join('') + half.slice().reverse().join(''));
      }
    }
    const kinds = ['drifter', 'shooter', 'mender', 'thief', 'splitter', 'bomber'];
    const foes = {};
    const count = Math.min(7, 4 + Math.floor(over / 4));
    for (let i = 0; i < count; i++) { const k = kinds[Math.floor(rnd() * kinds.length)]; foes[k] = (foes[k] || 0) + 1; }
    return { name: boss ? BOSSES[boss].name + ' returns' : 'Endless ' + over, map, foes: boss ? {} : foes, boss };
  }
  function levelDef(n) { return n <= LEVELS.length ? LEVELS[n - 1] : endlessLevel(n); }
  // The Upside-Down Map oddity turns the map over. Boss maps stay as they are.
  const flipped = (def) => run.odd === 'flip' && !def.boss;
  const levelMap = (def) => (flipped(def) ? def.map.slice().reverse() : def.map);
  // def.slide = { row: px per second }: the row is a conveyor that wraps around.
  // def.wheel = { x, y, r, n, speed, hp }: n bricks that turn around a hub.
  function genLevel(n) {
    const def = levelDef(n), bricks = [];
    levelMap(def).forEach((row, r) => {
      const slide = def.slide && !flipped(def) ? def.slide[r] : 0;
      for (let c = 0; c < COLS; c++) {
        const b = brickFor(row[c] || '.', r, c, n);
        if (!b) continue;
        if (slide) { b.slide = slide; b.x0 = b.x; }
        bricks.push(b);
      }
    });
    for (let i = 0; def.wheel && i < def.wheel.n; i++) {
      const b = makeBrick(99, -9, 'normal', Math.round(def.wheel.hp * hpMult(n) * heatMult()));
      b.wheel = (i / def.wheel.n) * Math.PI * 2; b.delay = 0.3; bricks.push(b);
    }
    return bricks;
  }
  // Bumpers ('O') and the two portals ('(' and ')') of a map.
  function setupField() {
    levelMap(G.def).forEach((row, r) => {
      for (let c = 0; c < COLS; c++) {
        const x = LEFT + c * (BW + GAP) + BW / 2, y = TOP + r * (BH + GAP) + BH / 2;
        if (row[c] === 'O') spawnFoe('bumper', x, y).r = 16;
        if (row[c] === '(' || row[c] === ')') G.portals.push({ x, y });
      }
    });
  }
  const BELT_W = W + BW; // a conveyor is as long as the field plus one brick
  function updateField() {
    const wh = G.def.wheel;
    for (const b of G.bricks) {
      if (!b.alive) continue;
      if (b.slide) b.x = -BW + ((((b.x0 + BW + b.slide * G.time) % BELT_W) + BELT_W) % BELT_W);
      else if (b.wheel != null && wh) { const a = b.wheel + G.time * wh.speed; b.x = wh.x + Math.cos(a) * wh.r - BW / 2; b.y = wh.y + Math.sin(a) * wh.r - BH / 2; }
    }
    G.wind = special('wind') ? Math.sin(G.time * 0.5) * 130 : 0;
  }
  // Today's special: about one level in three has a twist, and always the level that introduces them. Never on boss levels.
  const SPECIALS = [
    { id: 'gold', name: 'GOLD RUSH', text: 'Extra gold bricks' },
    { id: 'tnt', name: 'DEMOLITION DAY', text: 'Extra bomb bricks' },
    { id: 'capsules', name: 'CAPSULE RAIN', text: 'Three times the capsules' },
    { id: 'big', name: 'BIG BALL DAY', text: 'Giant balls all level', open: true },
    { id: 'storm', name: 'THUNDERSTORM', text: 'Lightning helps all level' },
    { id: 'blimps', name: 'BLIMP PARADE', text: 'Loot blimps keep coming' },
    { id: 'party', name: 'FEVER PARTY', text: 'Fever fills twice as fast' },
    { id: 'twins', name: 'DOUBLE TROUBLE', text: 'Two more balls on every serve' },
    { id: 'wind', name: 'WINDY DAY', text: 'Gusts push the ball and the coins' },
    { id: 'night', name: 'NIGHT MARKET', text: 'Lights out. Coins are worth 50% more' },
    { id: 'bill', name: 'YOU BREAK IT, YOU BUY IT', text: 'Every brick goes on your bill' },
  ];
  function rollSpecial(def, bricks) {
    if (def.boss) return null;
    const booked = run.nextSpecial;
    if (!booked && (run.level < FROM.specials || (run.level > FROM.specials && Math.random() > 0.35))) return null;
    // giant balls do not fit through the gaps of a stone map
    const stone = def.map.some((row) => row.includes('X'));
    const sp = booked ? specialById(booked) : pick(SPECIALS.filter((x) => !(x.open && stone)));
    const swap = (type, share) => { for (const b of bricks) if (b.type === 'normal' && Math.random() < share) { b.type = type; if (type === 'bomb') b.hp = b.maxhp = 1; } };
    if (sp.id === 'gold') swap('gold', 0.14);
    if (sp.id === 'tnt') swap('bomb', 0.1);
    return sp;
  }
  const special = (id) => !!G.special && G.special.id === id;
  const specialById = (id) => SPECIALS.find((x) => x.id === id);

  // ---------- game state ----------
  let mode = 'menu'; // menu | play | pause | shop | over
  let G = null;
  const paddle = { x: W / 2, tx: W / 2, w: 90, y: PADDLE_Y, squish: 0 };
  let lastSummary = null;
  const sessionT0 = performance.now();
  let said10 = false;

  // Generous on the first levels (more so on the first three), then it grows slowly: late levels must not drag.
  const parTime = (n) => Math.min(100, Math.round((n <= 3 ? 15 : 0) + 45 + 6 * Math.min(n, 8) + 2.5 * clamp(n - 8, 0, 8) + 1.5 * Math.max(0, n - 16)));
  function basePaddleW() { return 84 * (1 + 0.12 * lv('width')) * (odd('grease') ? 1.5 : 1); }
  function puDur(base) { return base * (1 + 0.15 * lv('puluck')); }

  const MIMIC_FROM = 12, PANIC_FROM = 10, BIRD_FROM = 6;
  // ---------- pigeons ----------
  // Birds sit on bricks and watch the ball. A ball that comes close scares a bird away; it drops a coin, three times at most.
  function perch(p) {
    const taken = new Set(G.birds.map((o) => o.on));
    const spots = G.bricks.filter((b) => b.alive && b.row < 90 && !b.slide && !taken.has(b) && !G.bricks.some((o) => o.alive && o.col === b.col && o.row === b.row - 1));
    p.on = spots.length ? pick(spots) : null;
    p.tx = p.on ? p.on.x + p.on.w / 2 + rand(-10, 10) : p.x < W / 2 ? -30 : W + 30;
    p.ty = p.on ? p.on.y - 6 : rand(110, 300);
    p.fly = true;
  }
  function updateBirds(dt) {
    for (const p of G.birds) {
      if (p.gone) continue;
      if (p.fly) {
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy) || 1, sp = 260 * dt;
        if (d <= sp) { p.x = p.tx; p.y = p.ty; p.fly = false; p.gone = !p.on; } else { p.x += (dx / d) * sp; p.y += (dy / d) * sp; }
        continue;
      }
      if (!p.on.alive || p.on.row > 90) { perch(p); continue; }
      if (!G.balls.some((b) => !b.stuck && Math.hypot(b.x - p.x, b.y - p.y) < 46)) continue;
      if (p.paid++ < 3) dropCoin(p.x, p.y, 1, true);
      burst(p.x, p.y, '#e8ecff', 4, 90); sfx.eek(); perch(p);
    }
  }
  function drawBirds(t) {
    const ball = G.balls[0];
    for (const p of G.birds) {
      if (p.gone) continue;
      const look = ball ? clamp((ball.x - p.x) / 50, -2, 2) : 0, flap = p.fly ? Math.sin(t * 30) * 5 : 0;
      ctx.fillStyle = '#b8c0d8'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 7, 5, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + look * 1.5, p.y - 6, 4, 0, TAU); ctx.fill();
      if (p.fly) {
        ctx.beginPath(); ctx.moveTo(p.x - 3, p.y - 2); ctx.lineTo(p.x - 13, p.y - 6 - flap); ctx.lineTo(p.x - 2, p.y + 2);
        ctx.moveTo(p.x + 3, p.y - 2); ctx.lineTo(p.x + 13, p.y - 6 - flap); ctx.lineTo(p.x + 2, p.y + 2); ctx.fill();
      }
      ctx.fillStyle = '#ff9a3d'; ctx.fillRect(p.x + look * 1.5 + (look >= 0 ? 3 : -6), p.y - 6, 3, 2);
      ctx.fillStyle = '#1b1f33'; ctx.beginPath(); ctx.arc(p.x + look * 2.2, p.y - 7, 1.2, 0, TAU); ctx.fill();
    }
  }
  // ---------- the game talks back ----------
  // The shopkeeper comments on how you play. Each line comes at most once per level.
  // text = the line to use when snail.js has no line for the id
  function heckle(id, text) {
    if (!G || G.safari || G.heckled[id]) return;
    const line = snailSay(id) || text;
    if (!line) return;
    G.heckled[id] = true; G.heckle = { s: line, t: 4 }; sfx.taunt();
  }
  function updateHeckle(dt) {
    if (G.heckle && (G.heckle.t -= dt) <= 0) G.heckle = null;
    if (!G.started || G.clearT >= 0 || G.safari) return;
    G.idleT = Math.abs(paddle.vx) < 4 ? G.idleT + dt : 0;
    G.wallT = paddle.x <= paddle.w / 2 + 2 || paddle.x >= W - paddle.w / 2 - 2 ? G.wallT + dt : 0;
    if (G.idleT > 6) heckle('idle', 'Still there? 🧻');
    if (G.wallT > 5) heckle('wall', 'Wall-hugger detected.');
    if (G.dry >= 8 && !G.boss) heckle('dry', 'The ball is bored.');
    if (!said10 && performance.now() - sessionT0 > 600000) { said10 = true; heckle('ten', '10 minutes. Legs still awake?'); dropCoin(paddle.x, PADDLE_Y - 200, 10, true); }
  }
  // Silly achievements: once per run, for things that every player does. Each pays one coin.
  function ach(id, text) {
    if (!G || G.safari || run.level < 4) return;
    run.ach = run.ach || {};
    if (run.ach[id]) return;
    run.ach[id] = 1; run.coins++;
    G.toasts.push({ s: '🏆 ACHIEVEMENT: ' + text, t: 2.6 });
  }
  // A joke that happens once per run: the game "stops working" after a nuke. Nothing is lost.
  function fakeCrash() {
    if (mode !== 'play' || G.clearT >= 0 || run.crashed) return;
    run.crashed = true; mode = 'crash'; A.music(0); sfx.nope();
    showOverlay(`<div class="center"><div class="crash"><div class="ct">brick_bazaar.exe has stopped working</div>
      <div class="cb">The bricks are too broken to continue.<br>Error 0xSNAIL</div>
      <div class="cbtns"><button class="cbtn" data-act="uncrash">Send report</button><button class="cbtn" data-act="uncrash">Cry</button></div></div></div>`, 'see');
  }
  // Bonus rounds: no bricks, three balls, and no ball can be lost. G.safari holds the kind.
  const BONUS = {
    blimps: { name: 'Blimp Safari', title: '🎈 SAFARI 🎈', over: 'SAFARI OVER!', count: 'Blimps popped 🎈', tip: 'BONUS ROUND! Pop the blimps with your ball. You cannot lose a ball here' },
    pinata: { name: 'Piñata Party', title: '🪅 PIÑATA 🪅', over: 'PARTY OVER!', count: 'Piñata hits 🪅', tip: 'BONUS ROUND! Whack the piñata with your ball. Each hit pays more. You cannot lose a ball here' },
    bumper: { name: 'Bumper Bazaar', title: '🎯 BUMPERS 🎯', over: 'LAST CALL!', count: 'Bumper hits 🎯', tip: 'BONUS ROUND! Light all seven bumpers for a jackpot. You cannot lose a ball here' },
    stock: { name: 'Stock Toss', title: '📦 STOCK TOSS 📦', over: 'SHELVES EMPTY!', count: 'Coins caught 📦', tip: 'BONUS ROUND! No ball. Catch what the snail throws. Not the socks' },
  };
  const BONUS_ORDER = ['blimps', 'stock', 'pinata', 'bumper'];
  // ---------- round plug-ins ----------
  // rounds.js can add bonus rounds that are other games: window.BBRounds = { id: round }. A round has the texts of a
  // BONUS entry (name, title, over, count, tip) and: seconds (length), ball (false = no ball is served),
  // hidePaddle (true = the round draws its own player), start(api), tick(api, dt), draw(api, ctx, t), tap(api, x, y).
  // The round talks to the game only through the api object below. Coins go through api.coin, so that the coin value,
  // the catch and the sounds are the same as in the rest of the game. ROUND_COINS limits the coins of one round.
  const ROUNDS = window.BBRounds || {};
  for (const id in ROUNDS) { BONUS[id] = ROUNDS[id]; BONUS_ORDER.push(id); }
  const ROUND_COINS = 160;
  function roundApi() {
    let paid = 0;
    const room = (n) => { const k = Math.max(0, Math.min(n, ROUND_COINS - paid)); paid += k; return k; };
    return {
      W, H, HUD_H, PADDLE_Y, PADDLE_H, paddle, level: run.level, state: {},
      rand, pick, clamp,
      get time() { return G.clock; }, get left() { return timeLeft(); },
      // n coins fall from (x, y); the paddle must catch them
      coin(x, y, n = 1) { const k = room(n); if (k) dropCoin(x, y, k, true); },
      // n coins go straight to the player
      pay(n = 1) { const k = room(n); if (k) dropCoin(paddle.x, PADDLE_Y - 30, k, true); },
      // adds to the number that the results screen shows beside the round's 'count' text
      score(n = 1) { G.popped += n; },
      say(x, y, text, color = '#ffffff', big = false) { say(clamp(x, 80, W - 80), y, text, color, big ? 1.6 : 1.2, big); },
      snail: (key) => snailSay(key), drawSnail: (x, y, dir = 1, flash = false) => drawSnail({ x, y, dir, flash: flash ? 1 : 0 }),
      sfx, burst, ring, shake, flash: flashScreen, beat: () => A.beat(),
      // makes the paddle small and slow for a moment; a round has no other penalty
      stun(sec = 1.2) { G.stun = Math.max(G.stun, sec); },
      end() { G.par = Math.min(G.par, G.clock); },
    };
  }
  // Stock Toss: the snail walks on a shelf and throws coins, coin bags and socks. A sock makes the paddle small for a moment.
  const STOCK_LINES = ['Inventory day!', 'That one is fragile!', 'No refunds on socks!', 'Catch! I have no hands.', 'Everything must go. Down.', 'Mind the antiques!'];
  function throwStock(f) {
    const roll = Math.random();
    if (roll < 0.16) enemyShot(f.x, f.y + 14, rand(-0.25, 0.25), 210, 'sock');
    else dropCoin(f.x, f.y + 10, roll < 0.28 ? 4 : 1, true);
    if (Math.random() < 0.07) say(clamp(f.x, 110, W - 110), f.y - 30, pick(STOCK_LINES), '#ffffff', 1.4);
  }
  const BUMPERS = [[120, 180], [240, 150], [360, 180], [75, 300], [240, 280], [405, 300], [240, 400]];
  // each boss gives a different bonus round
  const bossBonus = (lvl) => BONUS_ORDER[(Math.round(lvl / 10) - 1) % BONUS_ORDER.length];
  function startSafari(kind) {
    kind = kind || (BONUS[run.pendingSafari] ? run.pendingSafari : 'blimps');
    run.pendingSafari = false; startLevel(kind);
  }
  function startLevel(safari = false) {
    G = {
      safari, fever0: run.fever, clock: 0, timeUp: false, noLoot: false, blimpsLeft: 0, popped: 0, lastTick: 99,
      lost: 0, dingBest: 0, smashes: 0,
      portals: [], wind: 0, birds: [], bribe: false, heckled: {}, heckle: null, idleT: 0, wallT: 0, dry: 0, toasts: [], bill: 0,
      sweet: 0, sweetN: 0, tapT: -9, cam: null, eventAt: -1, wantedWon: false, convoyN: 0, convoys: {}, rounds: 0,
      bricks: safari ? [] : genLevel(run.level), balls: [], coins: [], pus: [], shots: [], parts: [], texts: [], drones: [], bolts: [],
      fx: noFx(), fxMax: {}, net: lv('net'), goalieCd: 0, combo: 0, comboBest: 0, comboPop: 0,
      level: run.level, timers: [], beams: [], feverT: 0, feverMax: 8, feverIdle: 0, stormT: 0, hitstop: 0, slowmo: 0,
      flash: 0, flashC: '#ffffff', flawless: true, paddleHits: 0, coinChain: 0, coinChainT: 0, celebT: 0, blimpT: -1,
      lasers: [], clip: {}, reload: {}, special: null, coinCount: 0,
      levelCoins: 0, streakCoins: 0, time: 0, clearT: -1, gunCd: { blaster: 0.3, laser: 0.5, rocket: 0.8, scatter: 0.6, arc: 0.7, saw: 1, duck: 1.2 },
      shake: 0, banner: 3.2, started: false,
      foes: [], eshots: [], foeQueue: [], foeQueueT: 1.2, boss: null, stun: 0, shield: lv('shield'), secondWind: lv('second'),
      def: safari ? { map: [], ...BONUS[safari] } : levelDef(run.level), crumbleT: 0, crumbling: false, seekT: 0,
    };
    G.par = safari ? SAFARI_S : Math.max(30, parTime(run.level) + (G.def.boss ? BOSS_CLOCK_S : 0) + SAND_S * lv('sand') - EDGE_S * lv('edge'));
    G.special = safari ? null : rollSpecial(G.def, G.bricks);
    if (!safari && !G.def.boss) {
      const plain = G.bricks.filter((b) => b.type === 'normal');
      if (run.wanted && plain.length) { const top = Math.min(...plain.map((b) => b.row)); pick(plain.filter((b) => b.row === top)).wanted = true; }
      const rest = plain.filter((b) => !b.wanted);
      if (run.favourite && rest.length) {
        const fav = rest.splice((Math.random() * rest.length) | 0, 1)[0];
        fav.type = 'pinata'; fav.hp = fav.maxhp = PINATA_HITS;
      }
      if (run.level >= MIMIC_FROM && rest.length > 6 && Math.random() < 0.5) pick(rest).mimic = true;
      if (run.level >= PANIC_FROM && Math.random() < 0.2) G.eventAt = rand(6, 18);
      if (run.level >= PANIC_FROM && Math.random() < 0.35) after(rand(12, 30), spawnSnail);
      G.bribe = run.level >= 8 && Math.random() < 0.2;
      for (let i = 0; run.level >= BIRD_FROM && i < 2 + ((Math.random() * 3) | 0); i++) {
        const p = { x: 0, y: 0, paid: 0 };
        G.birds.push(p); perch(p);
        p.x = p.tx; p.y = p.ty; p.fly = false; p.gone = !p.on;
      }
    }
    if (!safari) setupField();
    G.brick0 = destructibleLeft();
    if (safari) {
      G.net = 999; G.blimpT = safari === 'blimps' ? 0.6 : -1;
      if (safari === 'pinata') spawnFoe('pinata', W / 2, 190);
      if (safari === 'bumper') for (const [x, y] of BUMPERS) spawnFoe('bumper', x, y);
      if (safari === 'stock') { const f = spawnFoe('snail', W / 2, 128); f.shelf = true; f.dir = 1; f.cd = 2.2; G.started = true; }
    }
    else if (G.def.boss) G.boss = makeBoss(G.def.boss);
    else if (run.level >= blimpFrom()) { G.blimpsLeft = 1 + lv('bait') + (run.kit === 'blimps' ? 1 : 0); G.blimpT = special('blimps') ? 4 : rand(6, 14); }
    const q = [];
    for (const [k, n] of Object.entries(G.def.foes || {})) for (let i = 0; i < n; i++) q.push(k);
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    G.foeQueue = q;
    for (const g in GUNS) { G.clip[g] = clipSize(g); G.reload[g] = 0; }
    // Head Start, plus the lucky-spin prize. A bonus round leaves both for the next level.
    for (let i = 0; !safari && i < lv('starter') + run.bonusStart; i++) {
      const k = pick(['wide', 'slow', 'fire', 'mega', 'x2'].filter((p) => run.level >= PU_FROM[p]));
      setFx(k, puDur(k === 'fire' ? 7 : 12));
    }
    if (!safari) run.bonusStart = 0;
    paddle.w = basePaddleW(); paddle.x = paddle.tx = W / 2;
    const plug = ROUNDS[safari];
    if (safari !== 'stock' && !(plug && plug.ball === false)) serve();
    if (plug) {
      G.api = roundApi(); G.par = plug.seconds || SAFARI_S;
      if (plug.ball === false) G.started = true;
      plug.start(G.api);
    }
    // drones
    for (let i = 0; i < lv('d_orbit'); i++) G.drones.push({ type: 'orbit', a: (i / Math.max(1, lv('d_orbit'))) * Math.PI * 2, cd: 0.5 + i * 0.3, x: W / 2, y: PADDLE_Y - 40 });
    for (let i = 0; i < lv('d_hunter'); i++) G.drones.push({ type: 'hunter', x: rand(80, 400), y: 420, vx: 0, vy: 0, cd: 0, target: null });
    for (let i = 0; i < lv('d_collect'); i++) G.drones.push({ type: 'collect', x: W / 2 + (i ? 40 : -40), y: PADDLE_Y - 60, target: null });
    if (lv('d_goalie')) G.drones.push({ type: 'goalie', x: W / 2 });
    for (let i = 0; i < lv('d_blimp'); i++) G.drones.push({ type: 'war', x: 80 + i * 150, y: TOP + 30 + i * 34, dir: i % 2 ? -1 : 1, cd: 2 + i, t: i * 2 });
    for (let i = 0; i < lv('d_ufo'); i++) G.drones.push({ type: 'ufo', x: W / 2 + (i ? 90 : -90), y: PADDLE_Y - 150, target: null, beam: 0, cd: 2 + i * 1.5 });
    mode = 'play';
    hideOverlay();
    pauseBtn.style.display = 'block';
    if (!safari && run.coins === 0 && run.level > 3) sticker('broke');
    if (!safari && run.level >= 4 && Math.random() < 0.35) after(2.5, () => heckle('levelStart'));
    hud.coins = run.coins;
    A.fever(false); A.rush(99); A.streak(0);
    A.tune(run.level); A.music(G.boss || safari ? 2 : 1);
    if (G.boss) sfx.warn();
  }
  const noFx = () => ({ wide: 0, slow: 0, fire: 0, glue: 0, mega: 0, storm: 0, x2: 0, freeze: 0, gold: 0, over: 0, panic: 0 });

  const MAX_BALLS = 8;
  const CHICKEN_FROM = 12, WANTED_S = 15;
  function makeBall(x, y, vx, vy) {
    const r0 = odd('tiny') ? 4 : 7;
    return { x, y, vx, vy, r: r0, r0, stuck: false, off: 0, stuckT: 0, pierce: 0, banks: 0, spin: 0, smash: false, inside: new Set(), trail: [], serve: false };
  }
  function serve() {
    const b = makeBall(paddle.x, PADDLE_Y - 8, 0, 0);
    b.stuck = true; b.off = 0; b.serve = true;
    G.balls.push(b);
    if (run.level >= CHICKEN_FROM && !G.safari && Math.random() < 0.1) {
      b.chicken = true; say(W / 2, PADDLE_Y - 70, 'RUBBER CHICKEN! Double coins', '#ffe94a', 2.2); sfx.squawk(2);
    }
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
        for (let i = 0; i < lv('twin') + (special('twins') || G.safari ? 2 : 0); i++) {
          const a2 = a + (i % 2 ? -1 : 1) * (0.32 + 0.15 * Math.floor(i / 2));
          const nb = makeBall(b.x, b.y, Math.sin(a2) * s, -Math.cos(a2) * s); nb.pierce = lv('pierce');
          G.balls.push(nb);
        }
      }
    }
    if (any) { G.started = true; sfx.launch(); ach('launch', 'Launched a ball'); }
  }
  function ballSpeed() {
    // A slow ball on the first levels. The speed stops rising at level 30, and it rises less during a level than before.
    let s = 343 + Math.min(run.level, 10) * 7 + clamp(run.level - 10, 0, 20) * 3 + Math.min(run.level < 4 ? 15 : 40, G.time * 0.6);
    s *= 1 - 0.07 * lv('chill');
    if (odd('bouncy')) s *= 1.25;
    if (G.fx.slow > 0) s *= 0.68;
    return s;
  }

  // ---------- drops ----------
  const PU = {
    wide: { c: '#4fd1ff', l: 'W', w: 3 }, multi: { c: '#c08cff', l: 'M', w: 3 }, slow: { c: '#7cf2a8', l: 'S', w: 2 },
    fire: { c: '#ff8a3d', l: 'F', w: 2 }, glue: { c: '#ffe066', l: 'G', w: 1.6 }, ammo: { c: '#d8dee9', l: 'A', w: 3 },
    life: { c: '#ff5c8a', l: '♥', w: 0.45 }, cash: { c: '#ffd700', l: '$', w: 1.8 }, net: { c: '#6ee7ff', l: 'N', w: 1 },
    mega: { c: '#ff7ad9', l: 'B', w: 1.6 }, storm: { c: '#fff27a', l: '⚡', w: 1.4 }, x2: { c: '#ffb02e', l: '×2', w: 1.4 },
    freeze: { c: '#a8e6ff', l: '❄', w: 1.3 }, gold: { c: '#ffd23f', l: '★', w: 1.1 }, nuke: { c: '#ff5c5c', l: '☢', w: 0.5 },
    blimp: { c: '#ffb0e6', l: '🎈', w: 1 },
  };
  const PU_TEXT = { wide: 'WIDE!', multi: 'MULTI!', slow: 'SLOW', fire: 'FIREBALL!', glue: 'GLUE', ammo: 'OVERDRIVE!', life: '+1 LIFE', cash: 'CASH!', net: '+NET',
    mega: 'BIG BALL!', storm: 'STORM!', x2: 'DOUBLE COINS!', freeze: 'FREEZE!', gold: 'GOLDEN BALL!', nuke: 'KABOOM!', blimp: 'BLIMP AHOY!' };
  function rollPU() {
    const foes = G.foes.some((f) => !passive(f)) || (G.boss && !G.boss.dead);
    const opts = Object.entries(PU).filter(([k]) => k !== 'ammo' || ownsAnyGun()).filter(([k]) => k !== 'life' || run.lives < 6)
      .filter(([k]) => k !== 'freeze' || foes).filter(([k]) => G.level >= PU_FROM[k]).filter(([k]) => !G.safari || (k !== 'blimp' && k !== 'nuke' && k !== 'storm'));
    let tot = 0; for (const [, v] of opts) tot += v.w;
    let r = Math.random() * tot;
    for (const [k, v] of opts) { r -= v.w; if (r <= 0) return k; }
    return 'wide';
  }
  // Every coin drop is boosted 1.5x on average (fractions round up at random).
  const COIN_MULT = 1.5;
  function dropCoin(x, y, n = 1, exact = false) {
    if (!exact) { const raw = n * COIN_MULT; n = Math.floor(raw) + (Math.random() < raw % 1 ? 1 : 0); }
    const raw = coinVal() * coinMult();
    for (let i = 0; i < n; i++) {
      const val = Math.floor(raw) + (Math.random() < raw % 1 ? 1 : 0);
      G.coins.push({ x: x + rand(-6, 6), y, vx: rand(-40, 40) * (n > 1 ? 2 : 1), vy: rand(-140, -40), spin: Math.random() * 6, val });
    }
  }
  function collectCoin(c) {
    if (G.safari === 'stock') G.popped++;
    run.coins += c.val; G.levelCoins += c.val; run.stats.coins += c.val;
    if (relic('overload') && ++G.coinCount % 30 === 0) for (let i = 0; i < 3; i++) after(i * 0.15, stormStrike);
    // quick pickups climb the scale
    G.coinChain = G.coinChainT > 0 ? G.coinChain + 1 : 0; G.coinChainT = 0.6;
    sfx.coin(G.coinChain); hud.coinPop = 1;
    // coins grabbed in quick succession add up in one growing number
    const sum = G.coinText;
    if (sum && sum.t > sum.T - 0.45) {
      sum.n += c.val; sum.s = '+' + sum.n; sum.t = sum.T; sum.x += (c.x - sum.x) * 0.3; sum.y = c.y - 14; sum.sz = 13 + Math.min(11, Math.sqrt(sum.n));
    } else {
      say(c.x, c.y - 14, '+' + c.val, '#ffd84a', 0.7);
      G.coinText = G.texts[G.texts.length - 1]; G.coinText.n = c.val;
    }
    burst(c.x, c.y, '#ffd84a', 3, 90);
    if (relic('coinshot') && G.clearT < 0 && Math.random() < 0.3) G.shots.push({ x: clamp(c.x, 8, W - 8), y: PADDLE_Y - 6, vx: 0, vy: -700, dmg: gunDmg(1), k: 'orbit' });
  }
  function collectPU(p) {
    sfx.pu(); buzz(15); ach('pu', 'Caught a capsule. Yum');
    const k = p.k;
    say(p.x, p.y - 14, PU_TEXT[k], PU[k].c, 1.1);
    ring(p.x, p.y, 44, PU[k].c, 0.35);
    if (k === 'wide') setFx('wide', puDur(15));
    else if (k === 'slow') setFx('slow', puDur(10));
    else if (k === 'fire') setFx('fire', puDur(7));
    else if (k === 'glue') setFx('glue', puDur(14));
    else if (k === 'mega') setFx('mega', puDur(10));
    else if (k === 'storm') setFx('storm', puDur(6));
    else if (k === 'x2') setFx('x2', puDur(12));
    else if (k === 'freeze') setFx('freeze', puDur(7));
    else if (k === 'life') { run.lives = Math.min(6, run.lives + 1); sfx.life(); }
    else if (k === 'net') G.net++;
    else if (k === 'cash') dropCoin(p.x, p.y - 20, 8);
    else if (k === 'ammo') { for (const g in GUNS) { G.clip[g] = clipSize(g); G.reload[g] = 0; } setFx('over', puDur(6)); sfx.overdrive(); }
    else if (k === 'gold') setFx('gold', puDur(8));
    else if (k === 'nuke') nuke();
    else if (k === 'blimp') spawnBlimp();
    else if (k === 'multi') {
      if (G.balls.some((b) => b.stuck)) launch();
      const src = G.balls.slice();
      for (const b of src) {
        if (G.balls.length >= MAX_BALLS) break;
        for (const d of [-0.4, 0.4]) {
          const c = Math.cos(d), s = Math.sin(d);
          const nb = makeBall(b.x, b.y, b.vx * c - b.vy * s, b.vx * s + b.vy * c);
          nb.pierce = b.pierce; G.balls.push(nb);
        }
      }
    }
  }

  // ---------- bricks ----------
  const TYPE_COLOR = { steel: '#9fb0c8', gold: '#ffd23f', bomb: '#ff4d5e', stone: '#4a4f6a', hive: '#b36bff', volt: '#ffe94a', prism: '#ffffff', mystery: '#ff7ad9', tnt: '#ff8a3d', chest: '#c8874a', dice: '#f4f6ff', pinata: '#ff7ad9', runner: '#9cff57' };
  function brickColor(b) {
    return TYPE_COLOR[b.type] || BRICK_COLORS[(b.maxhp - 1 + b.row) % BRICK_COLORS.length];
  }
  function hitBrick(b, dmg, fromBall) {
    if (!b.alive) return false;
    if (b.type === 'stone') { b.flash = 0.12; sfx.stone(); return false; }
    b.byBall = fromBall;
    if (b.mimic) { runAway(b); return false; }
    // sometimes the last brick tries to buy its life
    if (fromBall && G.bribe && !G.boss && b.type !== 'pinata' && b.type !== 'runner' && destructibleLeft() === 1) {
      G.bribe = false; b.flash = 0.2; b.punch = 1.5; sfx.taunt();
      say(clamp(b.x + b.w / 2, 110, W - 110), b.y - 12, 'WAIT! Take this. Just go!', '#ffffff', 1.8);
      dropCoin(b.x + b.w / 2, b.y + b.h, 8, true);
      after(1.3, () => { if (b.alive) say(clamp(b.x + b.w / 2, 90, W - 90), b.y - 12, '...worth a try', '#c9d0ff', 1.4); });
      return false;
    }
    // only a ball can hurt a pinata or catch a runner
    if (b.type === 'pinata' || b.type === 'runner') {
      if (!fromBall) { b.flash = 0.06; return false; }
      if (b.type === 'runner') { catchRunner(b); return true; }
      b.hp--; b.flash = 0.12; b.punch = 1.6; sfx.whack(); burst(b.x + b.w / 2, b.y + b.h / 2, pick(RAINBOW), 8, 180);
      if (b.hp <= 0) { destroyBrick(b); return true; }
      return false;
    }
    if (G.fx.panic > 0 && Math.random() < 0.12) { say(b.x + b.w / 2, b.y - 4, pick(PANIC_CRIES), '#ffffff', 0.7); sfx.eek(); }
    if (fromBall && Math.random() < lv('crit') * 0.08) {
      dmg *= 3; say(b.x + b.w / 2, b.y, 'CRIT', '#fff27a', 0.6);
    }
    b.hp -= dmg; b.flash = 0.12; b.punch = 1;
    if (b.type === 'chest' && b.loot > 0) { b.loot--; dropCoin(b.x + b.w / 2, b.y + b.h, 1); }
    if (fromBall && G.fx.gold > 0 && Math.random() < 0.35) dropCoin(b.x + b.w / 2, b.y + b.h, 1);
    if (fromBall && lv('splash') && Math.random() < 0.15 * lv('splash')) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      burst(cx, cy, '#e8f0ff', 6, 140);
      for (const o of G.bricks) if (o !== b && b.row < 90 && o.row < 90 && hurtable(o) && !o.mimic && Math.abs(o.col - b.col) <= 1 && Math.abs(o.row - b.row) <= 1) hitBrick(o, 1, false);
    }
    if (b.hp <= 0) { destroyBrick(b); return true; }
    sfx.brick(G.combo);
    return false;
  }
  function destroyBrick(b) {
    b.alive = false;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    shards(b); burst(cx, cy, brickColor(b), 5);
    run.score += 10 * b.maxhp * (feverOn() ? 2 : 1);
    G.combo++; G.comboPop = 1; A.streak(G.combo); G.dry = 0;
    ach('brick', 'Touched a brick');
    if (G.combo === 30) heckle('streak'); G.comboBest = Math.max(G.comboBest, G.combo);
    run.stats.bricks++; run.stats.streak = Math.max(run.stats.streak, G.combo);
    sfx.pop(G.combo);
    addFever(special('party') ? 0.08 : 0.04);
    if (G.noLoot) return;
    if (G.fx.panic > 0) dropCoin(cx, cy, 1, true);
    if (special('bill')) {
      G.bill += Math.max(1, Math.round(coinVal() * 0.6));
      if (Math.random() < 0.1) say(clamp(cx, 90, W - 90), cy - 12, pick(['That was an antique!', 'You pay for that!', 'My stock!', 'It goes on the bill!']), '#ff9aa8', 0.9);
    }
    if (b.wanted) {
      const won = b.byBall && G.clock < WANTED_S;
      if (won) { G.wantedWon = true; sfx.jackpot(); flashScreen('#ffd23f', 0.25); }
      say(clamp(cx, 90, W - 90), cy + 26, won ? 'BOUNTY CLAIMED! A relic waits' : 'The bandit got away', won ? '#ffd23f' : '#ff9aa8', 1.8, won);
    }
    if (b.type === 'gold') { dropCoin(cx, cy, 5 + Math.floor(Math.random() * 5)); if (relic('bombardier')) explode(cx, cy, 44, Math.round(2 * power()), '#ffd23f', true); }
    else if (b.type === 'chest') dropCoin(cx, cy, 6);
    else if (Math.random() < coinChance(lv('luck'))) dropCoin(cx, cy, 1);
    if (G.combo % STREAK_STEP === 0) streakPayout(cx, cy);
    if (b.type === 'mystery' || (G.level >= FROM.capsules && Math.random() < (0.075 + 0.02 * lv('puluck')) * (special('capsules') ? 3 : 1))) G.pus.push({ x: cx, y: cy, vy: 110, k: rollPU() });
    if (b.type === 'bomb') explode(cx, cy, 30 + 14 * lv('demo'), Math.round((2 + lv('demo')) * power()), '#ff6b3d');
    else if (b.type === 'tnt') explode(cx, cy, 80 + 14 * lv('demo'), Math.round((4 + lv('demo')) * power()), '#ff8a3d');
    else if (b.type === 'volt') zapRow(b);
    else if (b.type === 'prism') splitBall(cx, cy);
    else if (b.type === 'dice') rollDice(cx, cy);
    else if (b.type === 'pinata') candyRain();
    cheer();
    relicBricks(b, cx, cy);
    // the last brick falls in slow motion
    if (!G.boss && G.clearT < 0 && destructibleLeft() === 0) {
      G.slowmo = 0.7; flashScreen('#ffffff', 0.3); ring(cx, cy, 160, '#ffffff', 0.6, 4);
      G.cam = { x: cx, y: cy, t: CAM_S, T: CAM_S }; sfx.roar();
      say(W / 2, clamp(cy + 60, 160, 420), pick(['SMASHED!', 'CLEAN!', 'BOOM!', 'TIDY!', 'LAST ONE!']), '#ffffff', 1.2, true);
    }
  }
  const CAM_S = 0.9; // the camera zooms on the last hit of a level
  // A broken pinata rains coins and capsules across the field.
  function candyRain() {
    say(W / 2, H * 0.4, 'CANDY RAIN!', '#ff7ad9', 1.6, true); sfx.jackpot(); flashScreen('#ff7ad9', 0.25);
    for (let i = 0; i < 14; i++) after(i * 0.12, () => dropCoin(rand(20, W - 20), HUD_H + 10, 1, true));
    for (let i = 0; i < 3; i++) after(0.3 + i * 0.5, () => G.pus.push({ x: rand(40, W - 40), y: HUD_H + 10, vy: 110, k: rollPU() }));
  }
  // A mimic brick: on its first hit it grows legs, leaves the wall and runs below the bricks. A ball can catch it.
  // A runner does not count for the level clear.
  function runAway(b) {
    const lane = clamp(brickBottom() + 18, TOP + 60, PADDLE_Y - 260);
    b.mimic = false; b.slide = 0; b.wheel = null; b.type = 'runner'; b.hp = b.maxhp = 1; b.row = 99; b.col = -9;
    b.baseY = lane; b.y = lane; b.vx = (Math.random() < 0.5 ? -1 : 1) * 130; b.hop = 0; b.flash = 0.2;
    say(b.x + b.w / 2, lane - 14, 'NYEH! Catch me!', '#9cff57', 1.4); sfx.taunt();
  }
  function catchRunner(b) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    b.alive = false; shards(b); burst(cx, cy, '#9cff57', 18, 240); ring(cx, cy, 60, '#9cff57');
    sticker('runner');
    say(cx, cy - 18, 'GOTCHA!', '#9cff57', 1.2, true); sfx.jackpot(); shake(5);
    dropCoin(cx, cy, 12, true); G.pus.push({ x: cx, y: cy, vy: 110, k: rollPU() });
  }
  function updateRunners(dt) {
    for (const b of G.bricks) {
      if (!b.alive || b.type !== 'runner') continue;
      b.hop += dt; b.x += b.vx * dt; b.y = b.baseY - Math.abs(Math.sin(b.hop * 9)) * 8;
      if (b.x < 4) { b.x = 4; b.vx = Math.abs(b.vx); } else if (b.x > W - b.w - 4) { b.x = W - b.w - 4; b.vx = -Math.abs(b.vx); }
    }
  }
  // Googly Panic: a rare event. For some seconds every brick has eyes, cries, and drops a coin when it breaks.
  const PANIC_CRIES = ['EEK!', 'NOT ME!', 'OUCH!', 'MOMMY!', 'HELP!', 'WHY?!'];
  function startPanic() {
    setFx('panic', 10);
    say(W / 2, H * 0.42, 'THE BRICKS CAN SEE YOU!', '#ffffff', 2, true); sfx.taunt(); flashScreen('#ffffff', 0.2);
    say(W / 2, H * 0.42 + 30, 'Every brick drops a coin', '#ffd84a', 2);
  }
  // Streaks pay out every STREAK_STEP bricks; each payout is bigger than the last.
  const STREAK_STEP = 5;
  function streakCoins(combo) {
    const tier = Math.floor(combo / STREAK_STEP); // 5 -> 1, 10 -> 2, 15 -> 3 ...
    return Math.round(Math.min(tier, 5) * (1 + 0.25 * lv('streak')));
  }
  function streakPayout(x, y) {
    const n = streakCoins(G.combo);
    if (n <= 0 || G.level < FROM.streak) return;
    dropCoin(x, y, n, true);
    G.streakCoins += Math.round(n * coinVal() * coinMult());
    say(clamp(x, 80, W - 80), y + 24, `${G.combo} STREAK! +${n} coins`, '#ffe680', 1.1);
    sfx.streak(G.combo / STREAK_STEP);
  }
  // small = an echo from the Chain Reaction relic: quieter, with no hit-stop
  function explode(x, y, rad, dmg, color, small = false) {
    shake(small ? 3 : 8); sfx.boom(small);
    if (!small) { G.hitstop = Math.max(G.hitstop, 0.045); flashScreen(color, 0.12); buzz(20); }
    burst(x, y, color, small ? 8 : 18, 260);
    ring(x, y, rad, color); if (!small) ring(x, y, rad * 1.6, '#ffffff', 0.4, 2);
    for (const o of G.bricks) {
      if (!o.alive) continue;
      const dx = clamp(x, o.x, o.x + o.w) - x, dy = clamp(y, o.y, o.y + o.h) - y;
      if (dx * dx + dy * dy > rad * rad) continue;
      const chain = relic('chain') && o.type !== 'bomb' && o.type !== 'tnt' && o.type !== 'stone';
      if (hitBrick(o, dmg, false) && chain) after(0.09, () => explode(o.x + o.w / 2, o.y + o.h / 2, 26, 1, '#ffd23f', true));
    }
    for (const f of G.foes) if (Math.hypot(f.x - x, f.y - y) <= rad + f.r) damageFoe(f, dmg);
    if (bossAt(x, y, rad)) damageBoss(dmg);
  }
  // A brick that guns, drones and lightning can damage.
  const hurtable = (k) => k.alive && k.type !== 'stone' && k.type !== 'pinata' && k.type !== 'runner';
  function destructibleLeft() { let n = 0; for (const b of G.bricks) if (b.alive && b.type !== 'stone' && b.type !== 'runner') n++; return n; }

  // ---------- input ----------
  function toGame(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }
  canvas.addEventListener('pointerdown', (e) => {
    audio();
    if (mode !== 'play' || e.button === 2) return;
    const p = toGame(e); paddle.tx = p.x;
    G.tapT = G.time;
    if (G.api && ROUNDS[G.safari].tap) ROUNDS[G.safari].tap(G.api, p.x, p.y);
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
    else if (mode === 'pause') { mode = 'play'; hideOverlay(); playMusic(); }
  });

  // ---------- update ----------
  function update(dt) {
    if (mode !== 'play') return;
    // screen effects run on real time, also during hit-stop and slow motion
    G.shake = Math.max(0, G.shake - dt * 30);
    if (G.cam) G.cam.t -= dt;
    if (G.toasts.length && (G.toasts[0].t -= dt) <= 0) G.toasts.shift();
    G.flash = Math.max(0, G.flash - dt * 2.5);
    G.comboPop = Math.max(0, G.comboPop - dt * 6);
    paddle.squish = Math.max(0, paddle.squish - dt * 8);
    if (G.hitstop > 0) { G.hitstop -= dt; return; }
    if (G.slowmo > 0) { G.slowmo -= dt; dt *= 0.3; }

    G.time += dt;
    if (G.started && G.clearT < 0 && !(relic('stopwatch') && feverOn())) G.clock += dt;
    if (G.banner > 0) G.banner -= dt;
    for (const k in G.fx) if (G.fx[k] > 0) G.fx[k] = Math.max(0, G.fx[k] - dt);
    if (G.coinChainT > 0) G.coinChainT -= dt;
    runTimers(dt);
    updateFever(dt);
    if ((G.fx.storm > 0 || (special('storm') && G.started)) && G.clearT < 0 && (G.stormT -= dt) <= 0) { G.stormT = G.fx.storm > 0 ? 0.28 : 2; stormStrike(); }
    if (G.blimpT > 0 && G.started && G.clearT < 0 && (G.blimpT -= dt) <= 0) {
      if (G.level >= CONVOY_FROM && Math.random() < 0.2) spawnConvoy(); else spawnBlimp();
      G.blimpT = G.safari ? rand(0.6, 1) : special('blimps') ? 6 : --G.blimpsLeft > 0 ? rand(8, 13) : -1;
    }

    // paddle (slime stun shrinks and slows it)
    if (G.stun > 0) G.stun -= dt;
    const targetW = basePaddleW() * (G.fx.wide > 0 ? 1.5 : 1) * (G.stun > 0 ? 0.75 : 1);
    paddle.w += (targetW - paddle.w) * Math.min(1, dt * 8);
    paddle.x += (paddle.tx - paddle.x) * Math.min(1, dt * (G.stun > 0 ? 12 : odd('grease') ? 7 : 30));
    paddle.x = clamp(paddle.x, paddle.w / 2, W - paddle.w / 2);
    paddle.vx = (paddle.x - (paddle.px == null ? paddle.x : paddle.px)) / dt; paddle.px = paddle.x;

    updateBalls(dt);
    updateFoes(dt);
    updateGuns(dt);
    updateDrones(dt);
    updateShots(dt);
    updateDrops(dt);
    updateParticles(dt);
    for (const b of G.bricks) { if (b.flash > 0) b.flash -= dt; if (b.punch > 0) b.punch = Math.max(0, b.punch - dt * 7); }
    updateRunners(dt);
    updateField();
    updateBirds(dt);
    updateHeckle(dt);
    if (G.api && G.clearT < 0) ROUNDS[G.safari].tick(G.api, dt);
    if (G.eventAt > 0 && G.clock >= G.eventAt && G.clearT < 0) { G.eventAt = -1; startPanic(); }

    updateOvertime(dt);
    if (G.clearT < 0 && levelDone()) {
      G.clearT = 1.4; sfx.clear(); buzz([20, 30, 60]); A.rush(99);
      if (special('bill') && !G.timeUp) say(W / 2, H * 0.52, 'INSURANCE PAYS THE BILL!', '#7cf2a8', 1.4, true);
      for (const f of G.foes) damageFoe(f, 999);
      G.eshots = [];
    }
    if (G.clearT >= 0) { G.clearT -= dt; if (G.clearT <= 0) finishLevel(); }
  }

  function updateBalls(dt) {
    const sp = ballSpeed();
    const fire = G.fx.fire > 0;
    const dmg = ballDmg();
    for (const b of G.balls) {
      b.r += (b.r0 * (mega() ? 1.7 : 1) - b.r) * Math.min(1, dt * 10);
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
      // the wind does not reach the paddle zone, so the aim stays fair
      if (G.wind && b.y < PADDLE_Y - 150) b.vx += G.wind * dt;
      // the lower portal pulls a ball that comes near, so that the way in is not a matter of luck
      if (G.portals.length === 2 && G.time - (b.warpT || -9) > 0.5) {
        const p = G.portals[1], d = Math.hypot(p.x - b.x, p.y - b.y);
        if (d < 80 && d > 1) { b.vx += ((p.x - b.x) / d) * 1100 * dt; b.vy += ((p.y - b.y) / d) * 1100 * dt; }
      }
      if (b.spin) { b.spin *= Math.max(0, 1 - dt * 1.2); if (Math.abs(b.spin) < 0.05) b.spin = 0; }
      const steps = Math.max(1, Math.ceil((sp * dt) / (b.r * 0.7)));
      const sdt = dt / steps;
      for (let s = 0; s < steps && !b.dead; s++) {
        if (b.spin) { const c = Math.cos(b.spin * sdt), sn = Math.sin(b.spin * sdt), vx = b.vx; b.vx = vx * c - b.vy * sn; b.vy = vx * sn + b.vy * c; }
        b.x += b.vx * sdt; b.y += b.vy * sdt;
        // walls
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); sfx.wall(); b.banks++; }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); sfx.wall(); b.banks++; }
        if (b.y < HUD_H + b.r) { b.y = HUD_H + b.r; b.vy = Math.abs(b.vy); sfx.wall(); b.banks++; }
        // paddle (and its mirror image, with the Mirror Paddle relic)
        const P = b.vy > 0 && b.y + b.r >= PADDLE_Y && b.y - b.r <= PADDLE_Y + PADDLE_H ? paddles().find((p) => Math.abs(b.x - p.x) <= p.w / 2 + b.r) : null;
        if (P) {
          const off = clamp((b.x - P.x) / (P.w / 2), -1, 1);
          const a = off * 1.08 + rand(-0.07, 0.07);
          b.vx = Math.sin(a) * sp; b.vy = -Math.cos(a) * sp; b.y = PADDLE_Y - b.r;
          b.pierce = lv('pierce'); b.banks = 0; b.smash = false;
          // a hit on the sweet spot keeps the streak
          const sweet = P === paddle && G.level >= FROM.sweet && Math.abs(b.x - sweetX()) <= 10;
          if (!sweet) { G.combo = 0; G.sweetN = 0; A.streak(0); }
          sfx.paddle(); burst(b.x, PADDLE_Y, '#bff8ff', 4, 110);
          if (P === paddle) { paddle.squish = 1; paddleSkill(b, sweet); }
          paddleBounce(b);
          if (G.fx.glue > 0 && P === paddle) { b.stuck = true; b.off = b.x - paddle.x; b.stuckT = 0; break; }
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
        if (b.y - b.r > H) {
          if (!relic('boomerang') || Math.random() > 0.35) { b.dead = true; break; }
          b.y = HUD_H + b.r + 2; b.vy = Math.abs(b.vy); sfx.net(); say(b.x, HUD_H + 30, 'BOOMERANG!', '#6ee7ff', 0.9);
        }
        // enemies, boss, slime
        const dmgE = dmg;
        for (const f of G.foes) {
          if (f.dead || !ballVsCircle(b, f.x, f.y, f.r)) continue;
          if (f.hitCd <= 0) { damageFoe(f, dmgE, true); f.hitCd = 0.15; if (relic('frost')) f.frozenT = 2; }
        }
        if (G.boss && !G.boss.dead) {
          const B = G.boss;
          if (ballVsRect(b, B.x - B.w / 2, B.y, B.w, B.h) && (G.time - (b.bossT || -1)) > 0.12) { b.bossT = G.time; damageBoss(dmgE); }
          // a ball in the Auditor's tractor beam turns the beam around
          if (B.state === 'tractor' && Math.abs(b.x - B.x) < 40 && b.y > B.y + B.h && b.y < PADDLE_Y - 60) {
            B.state = 'idle'; B.atkT = 2; bossSay('That is MY money!');
            say(B.x, B.y + B.h + 60, 'REFUND!', '#7cf2a8', 1.4, true); dropCoin(B.x, B.y + B.h + 10, 8); sfx.jackpot(); ring(B.x, B.y + B.h, 90, '#7cf2a8', 0.4, 4);
          }
        }
        for (const e of G.eshots) if (!e.dead && Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) { e.dead = true; burst(e.x, e.y, '#9cff57', 6, 100); }
        if (G.portals.length === 2 && G.time - (b.warpT || -9) > 0.5) {
          const pi = G.portals.findIndex((p) => Math.hypot(p.x - b.x, p.y - b.y) < 15);
          if (pi >= 0) {
            const out = G.portals[1 - pi];
            ring(b.x, b.y, 30, '#c08cff', 0.3); ring(out.x, out.y, 40, '#7cf2ff', 0.3); sfx.teleport();
            b.x = out.x; b.y = out.y; b.warpT = G.time; b.trail = [];
          }
        }
        // bricks
        const nowInside = new Set();
        for (const k of G.bricks) {
          if (!k.alive) continue;
          if (b.x + b.r < k.x || b.x - b.r > k.x + k.w || b.y + b.r < k.y || b.y - b.r > k.y + k.h) continue;
          const cx = clamp(b.x, k.x, k.x + k.w), cy = clamp(b.y, k.y, k.y + k.h);
          const dx = b.x - cx, dy = b.y - cy;
          if (dx * dx + dy * dy > b.r * b.r) continue;
          if (b.inside.has(k)) { nowInside.add(k); continue; }
          const passes = k.type !== 'stone' && (fire || b.pierce > 0);
          if (passes) {
            nowInside.add(k);
            if (!fire) b.pierce--;
            hitBrick(k, ballHit(b, dmg), true);
            continue;
          }
          // bounce
          const kx = k.x + k.w / 2, ky = k.y + k.h / 2;
          const ox = k.w / 2 + b.r - Math.abs(b.x - kx), oy = k.h / 2 + b.r - Math.abs(b.y - ky);
          if (ox < oy) { const sg = Math.sign(b.x - kx) || 1; b.vx = sg * Math.abs(b.vx); b.x += sg * ox; }
          else { const sg = Math.sign(b.y - ky) || 1; b.vy = sg * Math.abs(b.vy); b.y += sg * oy; }
          hitBrick(k, ballHit(b, dmg), true);
          break;
        }
        b.inside = nowInside;
      }
      b.trail.push(b.x, b.y); if (b.trail.length > 22) b.trail.splice(0, 2);
    }
    const before = G.balls.length;
    G.balls = G.balls.filter((b) => !b.dead);
    if (before && G.balls.length === 0 && G.clearT < 0) loseLife();
  }
  const mega = () => G.fx.mega > 0 || special('big');
  const momentum = () => 1 + Math.min(G.combo * 0.04, 1) * lv('momentum');
  const ballDmg = () => Math.round(((1 + lv('dmg')) * (G.fx.fire > 0 ? 3 : 1) * (feverOn() ? 2 : 1) + (mega() ? 2 : 0)) * power() * momentum() * (odd('bouncy') ? 1.5 : 1));
  function paddles() {
    return relic('mirror') ? [paddle, { x: W - paddle.x, w: paddle.w * 0.7 }] : [paddle];
  }
  // Skill shots on the player's own paddle.
  // Sweet spot: a bright mark that moves after each bounce. A hit on it rings, pays, and keeps the streak. Five in a row give a fireball.
  // Smash: a tap just before the bounce doubles the damage and adds pierce until the next bounce.
  const sweetX = () => paddle.x + G.sweet * paddle.w / 2;
  function paddleSkill(b, sweet) {
    if (sweet) {
      const n = ++G.sweetN;
      G.dingBest = Math.max(G.dingBest, n);
      sfx.ding(n); ring(b.x, PADDLE_Y, 30 + n * 8, '#fff27a', 0.35); dropCoin(b.x, PADDLE_Y - 24, n, true);
      say(b.x, PADDLE_Y - 30, n >= 5 ? 'PERFECT!' : 'DING ×' + n, '#fff27a', 0.9, n >= 5);
      if (n >= 5) { G.sweetN = 0; sticker('perfect'); setFx('fire', 3); flashScreen('#fff27a', 0.2); sfx.cheer(3); }
    }
    G.sweet = rand(-0.7, 0.7);
    if (G.level >= FROM.smash && G.time - G.tapT < 0.2) {
      G.tapT = -9; b.smash = true; b.pierce += 3; G.smashes++;
      say(b.x, PADDLE_Y - 46, 'SMASH!', '#ff9a3d', 0.8, true); ring(b.x, PADDLE_Y, 70, '#ff9a3d', 0.3, 4); sfx.whack(); shake(5);
    }
    if (relic('spin')) b.spin = clamp(paddle.vx / 300, -2, 2);
  }
  // The damage of one ball hit on a brick. The smash and the Bank Shot relic multiply it.
  function ballHit(b, dmg) {
    const m = (b.smash ? 2 : 1) * (1 + (relic('bank') ? Math.min(b.banks, 3) : 0));
    b.banks = 0;
    if (b.chicken) { sfx.squawk((G.combo / 5) | 0); burst(b.x, b.y, '#ffffff', 2, 90); }
    return dmg * m;
  }
  const HYDRA_MAX = 5;
  // relics that trigger on a paddle bounce
  function paddleBounce(b) {
    G.paddleHits++; G.dry++;
    for (const g in GUNS) if (G.reload[g] > 0) G.reload[g] = Math.max(0.01, G.reload[g] - RELOAD_HIT);
    if (relic('hydra') && G.balls.length < HYDRA_MAX && Math.random() < 0.15) splitBall(b.x, b.y, b.vx, b.vy);
    if (relic('aftershock') && G.paddleHits % 4 === 0 && anyTarget()) {
      G.shots.push({ x: b.x, y: PADDLE_Y - 4, vx: 0, vy: -380, dmg: gunDmg(3), k: 'rocket', rad: 52 }); sfx.rocket();
    }
    if (relic('seismic') && G.paddleHits % 6 === 0) {
      shake(6); ring(paddle.x, PADDLE_Y, 300, '#ffd6a0', 0.5, 4); sfx.boom(true);
      for (const k of G.bricks) if (k.alive && k.type !== 'stone') hitBrick(k, Math.round(power()), false);
    }
  }
  function launchOne(b) {
    const a = launchAngle(b), s = ballSpeed();
    b.stuck = false; b.vx = Math.sin(a) * s; b.vy = -Math.cos(a) * s; b.pierce = lv('pierce');
  }
  function loseLife() {
    G.combo = 0; G.flawless = false; G.lost++; A.streak(0);
    ach('lose', 'Lost a ball. It happens');
    heckle('lose');
    if (G.secondWind > 0) {
      G.secondWind--; sfx.net();
      say(W / 2, H / 2, 'Second Wind!', '#6ee7ff', 1.4, true);
      serve(); return;
    }
    run.lives--; sfx.lose();
    if (run.lives === 1) { G.heckled.lastLife = false; G.heckle = null; heckle('lastLife'); } shake(12); flashScreen('#ff2a4d', 0.35); buzz(90);
    G.fx = noFx();
    if (run.lives <= 0) { gameOver(); return; }
    say(W / 2, H / 2, 'Ball lost!', '#ff6b8b', 1.2, true);
    serve();
  }

  // ---------- the clock ----------
  // From level FROM.clock each level has a clock. A level that is not clear when the clock runs out pays no bonus,
  // and the bricks crumble fast, without loot. Before that level the bricks crumble slowly, as a quiet helping hand.
  // When few bricks are left, balls home in on them. On the first three levels they home in sooner.
  const clockOn = () => G.safari || G.level >= FROM.clock;
  const timeLeft = () => Math.max(0, G.par - G.clock);
  function updateOvertime(dt) {
    if (G.clearT >= 0 || !G.started || G.safari) return;
    const left = timeLeft();
    if (clockOn() && left > 0 && left <= 10 && Math.ceil(left) < G.lastTick) { G.lastTick = Math.ceil(left); sfx.tick(); A.rush(left); heckle('timeLow'); }
    if (left <= 0) {
      if (!G.crumbling) {
        G.crumbling = true; G.timeUp = clockOn();
        if (G.timeUp) { say(W / 2, H * 0.5, "TIME'S UP! No bonus pay", '#ff6b3d', 2.4, true); sfx.warn(); flashScreen('#ff2a4d', 0.3); shake(8); buzz([60, 40, 60]); }
        else say(W / 2, H * 0.5, 'The bricks start to crumble', '#ffd6a0', 2.2);
      }
      G.crumbleT -= dt;
      if (G.crumbleT <= 0) {
        G.crumbleT = G.timeUp ? 0.8 : 2;
        const share = G.timeUp ? 0.25 : 0.12;
        G.noLoot = G.timeUp;
        for (const b of G.bricks) if (b.alive && b.type !== 'stone') { b.hp -= Math.max(1, Math.ceil(b.maxhp * share)); b.flash = 0.1; if (b.hp <= 0) destroyBrick(b); }
        G.noLoot = false;
        if (G.boss && !G.boss.dead) damageBoss(Math.ceil(G.boss.maxhp * (G.timeUp ? 0.1 : 0.05)));
        G.shake = Math.max(G.shake, 3);
      }
    }
    G.seekT = !G.boss && destructibleLeft() <= seekFrom() ? G.seekT + dt : 0;
  }
  // The last fifth of a level's bricks (at least 5) pulls the balls, so that the end of a level does not drag.
  const seekFrom = () => (G.level <= 3 ? 8 : Math.max(5, Math.ceil(G.brick0 * 0.2)));
  function steerBall(b, dt) {
    if (G.seekT < (G.level <= 3 ? 0.5 : 1.5) || b.y > PADDLE_Y - 120) return;
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
    for (const k of G.bricks) if (hurtable(k) && x >= k.x - slack && x <= k.x + k.w + slack) return true;
    for (const f of G.foes) if (!passive(f) && Math.abs(f.x - x) <= f.r + slack) return true;
    if (G.boss && !G.boss.dead && Math.abs(G.boss.x - x) <= G.boss.w / 2 + slack) return true;
    return false;
  }
  function anyTarget() { return destructibleLeft() > 0 || G.foes.some((f) => !passive(f)) || (G.boss && !G.boss.dead); }
  // Targets are bricks (x, y = top left), foes (x, y = centre, r) or the boss (x = centre, y = top, kind).
  const centerOf = (o) => (o.r ? [o.x, o.y] : o.kind ? [o.x, o.y + o.h / 2] : [o.x + o.w / 2, o.y + o.h / 2]);
  const targetLive = (o) => (o.r || o.kind ? !o.dead : o.alive);
  function allTargets() {
    const out = G.bricks.filter(hurtable);
    for (const f of G.foes) if (!f.dead && !passive(f)) out.push(f);
    if (G.boss && !G.boss.dead) out.push(G.boss);
    return out;
  }
  function nearestTarget(x, y) {
    let best = null, bd = Infinity;
    for (const o of allTargets()) { const [cx, cy] = centerOf(o), d = Math.hypot(cx - x, cy - y); if (d < bd) { bd = d; best = o; } }
    return best;
  }
  function hitTarget(o, dmg) { if (o.r) damageFoe(o, dmg); else if (o.kind) damageBoss(dmg); else hitBrick(o, dmg, false); }

  const power = () => (1 + 0.1 * lv('power')) * (1 + 0.25 * lv('edge'));
  // Base damage, scaled by the gun level (30% per level), Hardened Rounds (35% per level) and Overcharge.
  const gunDmg = (d, gl = 1) => Math.max(1, Math.round(d * (1 + 0.3 * (gl - 1)) * (1 + 0.35 * lv('rounds')) * power()));
  const clipSize = (g) => Math.round(GUNS[g].clip * (1 + 0.25 * lv('belt')));
  const reloadTime = (g) => GUNS[g].reload * Math.pow(RELOAD_CUT, lv('factory'));
  const overdrive = () => G.fx.over > 0;
  function updateGuns(dt) {
    const active = G.balls.some((b) => !b.stuck) && G.clearT < 0;
    const px = paddle.x, py = PADDLE_Y - 4;
    for (const g in GUNS) {
      const l = lv('gun_' + g); if (!l) continue;
      if (G.reload[g] > 0) {
        G.reload[g] -= dt * (overdrive() ? 4 : RELOAD_IDLE);
        if (G.reload[g] <= 0) { G.clip[g] = clipSize(g); if (active) sfx.reload(); }
        continue;
      }
      G.gunCd[g] -= dt;
      if (!active || G.gunCd[g] > 0 || !fireGun(g, l, px, py)) continue;
      if (!overdrive() && Math.random() >= lv('recycler') * 0.12 && --G.clip[g] <= 0) G.reload[g] = reloadTime(g);
      G.gunCd[g] = GUNS[g].rate * Math.pow(0.9, l - 1) * (overdrive() ? 0.5 : 1);
      if (Math.random() < 0.12 * lv('echo')) after(0.14, () => { if (G.clearT < 0) fireGun(g, l, paddle.x, PADDLE_Y - 4); });
      burst(px, py, GUNS[g].color, 2, 70);
    }
  }
  // Fires gun g at level l. Returns false when there is nothing to shoot at.
  function fireGun(g, l, px, py) {
    const dmg = gunDmg(GUNS[g].dmg, l);
    if (g === 'blaster') {
      const xl = px - paddle.w / 2 + 6, xr = px + paddle.w / 2 - 6;
      if (!(brickAbove(xl) || brickAbove(xr) || (l >= 3 && brickAbove(px)))) return false;
      for (const x of l >= 3 ? [xl, px, xr] : [xl, xr]) G.shots.push({ x, y: py, vx: 0, vy: -720, dmg, k: g, pierce: l >= 5 ? 2 : 1, hit: new Set() });
      sfx.shot();
    } else if (g === 'laser') {
      const xs = l >= 5 ? [-16, 0, 16] : l >= 3 ? [-10, 10] : [0];
      if (!xs.some((o) => brickAbove(px + o))) return false;
      for (const o of xs) G.shots.push({ x: px + o, y: py, vx: 0, vy: -900, dmg, k: g, pierce: 3 + (l - 1), hit: new Set() });
      sfx.laser();
    } else if (g === 'rocket') {
      if (l >= 3 ? !anyTarget() : !brickAbove(px, 30)) return false;
      G.shots.push({ x: px, y: py, vx: 0, vy: -380, dmg, k: g, rad: 52 + 8 * (l - 1), homing: l >= 3, cluster: l >= 5 });
      sfx.rocket();
    } else if (g === 'scatter') {
      if (!anyTarget()) return false;
      const n = 5 + (l - 1);
      for (let i = 0; i < n; i++) {
        const a = -0.55 + (1.1 * i) / (n - 1);
        G.shots.push({ x: px, y: py, vx: Math.sin(a) * 620, vy: -Math.cos(a) * 620, dmg, k: g, life: l >= 3 ? 1.2 : 0.75, bounce: l >= 3 ? 2 : 0, pierce: l >= 5 ? 2 : 1, hit: new Set() });
      }
      sfx.shot();
    } else if (g === 'arc') {
      if (!anyTarget()) return false;
      const used = new Set(), chains = l >= 5 ? 3 : l >= 3 ? 2 : 1;
      for (let c = 0; c < chains; c++) arcZap(px + (c - (chains - 1) / 2) * 16, py, 3 + (l - 1), dmg, used);
    } else if (g === 'saw') {
      if (!anyTarget()) return false;
      for (const a of l >= 5 ? [-0.45, 0.45] : [rand(-0.5, 0.5)]) {
        G.shots.push({ x: px, y: py - 6, vx: Math.sin(a) * 430, vy: -Math.cos(a) * 430, dmg, k: g, life: 4 + 0.5 * l + (l >= 3 ? 1.5 : 0), r: l >= 3 ? 13 : 9, cd: new Map(), spin: 0 });
      }
      sfx.saw();
    } else if (g === 'duck') {
      const targets = allTargets();
      if (!targets.length) return false;
      // a high lob: the duck flies over everything on the way up and lands on the target
      const [tx, ty] = centerOf(pick(targets)), apex = HUD_H + 16, v0 = Math.sqrt(2 * DUCK_G * (py - apex));
      const flight = v0 / DUCK_G + Math.sqrt((2 * Math.max(10, ty - apex)) / DUCK_G);
      G.shots.push({ x: px, y: py, vx: (tx - px) / flight, vy: -v0, dmg, k: g, rad: l >= 5 ? 60 : 44, bounces: 1 + (l >= 3 ? 1 : 0) + (l >= 5 ? 1 : 0), first: true, spin: 0 });
      sfx.launch();
    }
    return true;
  }
  const DUCK_G = 900;
  function arcZap(x, y, jumps, dmg, used) {
    const pts = [[x, y]]; let cx = x, cy = y;
    for (let j = 0; j < jumps; j++) {
      let best = null, bd = Infinity;
      for (const o of allTargets()) {
        if (used.has(o)) continue;
        const [ox, oy] = centerOf(o), d = Math.hypot(ox - cx, oy - cy);
        if (j > 0 && d > 140) continue;
        if (d < bd) { bd = d; best = o; }
      }
      if (!best) break;
      used.add(best); [cx, cy] = centerOf(best); pts.push([cx, cy]);
      hitTarget(best, dmg);
    }
    if (pts.length > 1) { G.bolts.push({ pts, t: 0.18, T: 0.18 }); sfx.zap(); }
  }
  function rocketBoom(s, x, y, scale = 1) {
    explode(x, y, s.rad * scale, s.dmg, '#ffb14a');
    if (!s.cluster) return;
    for (let i = 0; i < 3; i++) after(0.1 + i * 0.06, () => explode(x + rand(-55, 55), y + rand(-40, 40), 30, Math.ceil(s.dmg / 2), '#ffb14a', true));
  }
  function steer(s, dt) {
    if (!s.target || !targetLive(s.target)) s.target = nearestTarget(s.x, s.y);
    if (!s.target) return;
    const [tx, ty] = centerOf(s.target), sp = Math.hypot(s.vx, s.vy), cur = Math.atan2(s.vy, s.vx);
    let diff = Math.atan2(ty - s.y, tx - s.x) - cur;
    while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    const a = cur + clamp(diff, -4 * dt, 4 * dt);
    s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp;
  }
  // The saw bounces like a ball that never falls. It cuts through bricks that it destroys.
  function updateSaw(s, dt) {
    s.life -= dt; s.spin += dt * 22;
    if (s.life <= 0) { s.dead = true; burst(s.x, s.y, '#ffd6a0', 8, 140); return; }
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.x < s.r) { s.x = s.r; s.vx = Math.abs(s.vx); } if (s.x > W - s.r) { s.x = W - s.r; s.vx = -Math.abs(s.vx); }
    if (s.y < HUD_H + s.r) { s.y = HUD_H + s.r; s.vy = Math.abs(s.vy); }
    if (s.y > PADDLE_Y - 30) { s.y = PADDLE_Y - 30; s.vy = -Math.abs(s.vy); }
    const fresh = (o) => { const t = s.cd.get(o); if (t != null && G.time - t < 0.3) return false; s.cd.set(o, G.time); return true; };
    for (const k of G.bricks) {
      if (!k.alive) continue;
      const cx = clamp(s.x, k.x, k.x + k.w), cy = clamp(s.y, k.y, k.y + k.h), dx = s.x - cx, dy = s.y - cy;
      if (dx * dx + dy * dy > s.r * s.r || !fresh(k)) continue;
      burst(cx, cy, '#ffd6a0', 3, 120);
      if (hitBrick(k, s.dmg, false)) continue;
      if (Math.abs(dx) > Math.abs(dy)) s.vx = Math.sign(dx || 1) * Math.abs(s.vx); else s.vy = Math.sign(dy || 1) * Math.abs(s.vy);
    }
    for (const f of G.foes) if (!f.dead && Math.hypot(f.x - s.x, f.y - s.y) < f.r + s.r && fresh(f)) damageFoe(f, s.dmg);
    if (bossAt(s.x, s.y, s.r) && fresh(G.boss)) { damageBoss(s.dmg * 2); s.vy = Math.abs(s.vy); }
  }
  function updateDuck(s, dt) {
    s.vy += DUCK_G * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.spin += dt * 7;
    if (s.x < 10) { s.x = 10; s.vx = Math.abs(s.vx); } if (s.x > W - 10) { s.x = W - 10; s.vx = -Math.abs(s.vx); }
    if (s.y > PADDLE_Y - 20) { s.dead = true; burst(s.x, s.y, '#ffe94a', 6, 100); return; }
    if (s.vy < 0) return;
    let hit = !!foeAt(s.x, s.y, 8) || bossAt(s.x, s.y, 8);
    if (!hit) for (const k of G.bricks) if (k.alive && s.x > k.x - 6 && s.x < k.x + k.w + 6 && s.y > k.y - 8 && s.y < k.y + k.h) { hit = true; break; }
    if (!hit) return;
    explode(s.x, s.y, s.rad, s.dmg, '#ffe94a', !s.first);
    s.first = false;
    sfx.quack(); say(s.x, s.y - 18, 'QUACK!', '#ffe94a', 0.7);
    if (s.bounces-- <= 0) { s.dead = true; return; }
    s.vy = -430; s.vx = rand(-150, 150);
  }
  function updateShots(dt) {
    for (const s of G.shots) {
      if (s.k === 'saw') { updateSaw(s, dt); continue; }
      if (s.k === 'duck') { updateDuck(s, dt); continue; }
      if (s.homing) steer(s, dt);
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life != null) { s.life -= dt; if (s.life <= 0) s.dead = true; }
      if (s.bounce > 0) {
        if (s.x < 0 || s.x > W) { s.vx = -s.vx; s.x = clamp(s.x, 0, W); s.bounce--; }
        if (s.y < HUD_H) { s.vy = Math.abs(s.vy); s.y = HUD_H; s.bounce--; }
      }
      if (s.y < HUD_H || s.x < 0 || s.x > W || s.y > H) { s.dead = true; if (s.k === 'rocket') rocketBoom(s, s.x, Math.max(s.y, HUD_H), 0.6); continue; }
      const f = foeAt(s.x, s.y, 3);
      if (f && !(s.hit && s.hit.has(f))) {
        if (s.k === 'rocket') { rocketBoom(s, s.x, s.y); s.dead = true; continue; }
        damageFoe(f, s.dmg);
        if (!s.hit) { s.dead = true; continue; }
        s.hit.add(f);
        if (--s.pierce <= 0) { s.dead = true; continue; }
      }
      if (bossAt(s.x, s.y)) {
        if (s.k === 'rocket') rocketBoom(s, s.x, s.y); else damageBoss(s.dmg);
        s.dead = true; continue;
      }
      for (const e of G.eshots) if (!e.dead && Math.hypot(e.x - s.x, e.y - s.y) < e.r + 4) { e.dead = true; s.dead = true; burst(e.x, e.y, '#9cff57', 6, 100); }
      if (s.dead) continue;
      const color = GUNS[s.k] ? GUNS[s.k].color : '#ffffff';
      for (const k of G.bricks) {
        if (!k.alive || s.x < k.x - 2 || s.x > k.x + k.w + 2 || s.y < k.y || s.y > k.y + k.h + 6) continue;
        if (s.k === 'rocket') { rocketBoom(s, s.x, s.y); s.dead = true; break; }
        if (!s.hit) { hitBrick(k, s.dmg, false); burst(s.x, s.y, color, 3, 80); s.dead = true; break; }
        // piercing shots damage each brick once and stop at stone
        if (s.hit.has(k)) continue;
        s.hit.add(k);
        if (k.type === 'stone') { s.dead = true; k.flash = 0.12; break; }
        hitBrick(k, s.dmg, false); burst(s.x, s.y, color, 3, 80);
        if (--s.pierce <= 0) { s.dead = true; break; }
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
          const opts = G.bricks.filter(hurtable);
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
          hitBrick(d.target, gunDmg(1), false); d.cd = 0.55 / oc; d.vx *= -0.6; d.vy = Math.abs(d.vy) + 120;
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
      } else if (d.type === 'war') {
        d.t += dt; d.x += d.dir * 38 * oc * dt; d.cd -= dt;
        if (d.x < 40) d.dir = 1; else if (d.x > W - 40) d.dir = -1;
        if (!active || d.cd > 0) continue;
        let best = null, bd = 95;
        for (const k of G.bricks) {
          if (!k.alive || k.type === 'stone') continue;
          const dd = Math.abs(k.x + k.w / 2 - d.x) + Math.abs(k.y + k.h / 2 - d.y) * 0.3;
          if (dd < bd) { bd = dd; best = k; }
        }
        if (!best) continue;
        d.cd = 3.4 / oc;
        const bx = best.x + best.w / 2, by = best.y + best.h / 2;
        G.bolts.push({ pts: [[d.x, d.y + 10], [bx, by]], t: 0.2, T: 0.2, c: '#7cf2ff' });
        explode(bx, by, 46, gunDmg(3), '#7cf2ff', true);
      } else if (d.type === 'ufo') {
        if (d.target && !d.target.alive) { d.target = null; d.beam = 0; }
        if (!d.target && active && (d.cd -= dt) <= 0) {
          const opts = G.bricks.filter((k) => k.alive && k.type !== 'stone' && k.type !== 'pinata' && k.type !== 'runner' && !k.taken);
          d.target = opts.length ? pick(opts) : null;
          if (d.target) d.target.taken = true;
        }
        const side = G.drones.indexOf(d) % 2 ? 80 : -80;
        const tx = d.target ? d.target.x + d.target.w / 2 : paddle.x + side, ty = d.target ? d.target.y + d.target.h + 28 : PADDLE_Y - 150;
        const dx = tx - d.x, dy = ty - d.y, dist = Math.hypot(dx, dy) || 1, sp = Math.min(dist / dt, 260 * oc);
        d.x += (dx / dist) * sp * dt; d.y += (dy / dist) * sp * dt;
        if (!d.target || dist > 6) continue;
        d.beam += dt * oc;
        if (d.beam < 1) continue;
        const k = d.target;
        d.target = null; d.beam = 0; d.cd = 4 / oc;
        say(k.x + k.w / 2, k.y, 'ZOOP!', '#7ee0ff', 0.7); sfx.teleport(); ring(k.x + k.w / 2, k.y + k.h / 2, 40, '#7ee0ff', 0.4);
        hitBrick(k, Math.ceil(k.maxhp * 0.5), false);
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
      // the Auditor's tractor beam takes coins that are in the air
      if (tractorOn(c)) {
        c.vy -= 1300 * dt; c.x += (G.boss.x - c.x) * Math.min(1, dt * 3);
        if (c.y < G.boss.y + G.boss.h) { c.dead = true; say(c.x, c.y + 20, 'TAXED!', '#ff5c5c', 0.6); sfx.steal(); continue; }
      }
      c.vy += 420 * dt; c.vy = Math.min(c.vy, 330); c.vx *= 1 - dt * 1.5; c.vx += G.wind * dt;
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
      p.x = clamp(p.x + G.wind * 0.4 * dt, 16, W - 16); p.y += p.vy * dt;
      if (onPaddle(p.x, p.y, 10)) { p.dead = true; collectPU(p); }
      else if (p.y > H + 14) p.dead = true;
    }
    G.coins = G.coins.filter((c) => !c.dead);
    G.pus = G.pus.filter((p) => !p.dead);
  }
  function onPaddle(x, y, r) {
    return y + r >= PADDLE_Y - 2 && y - r <= PADDLE_Y + PADDLE_H + 6 && paddles().some((p) => Math.abs(x - p.x) <= p.w / 2 + r);
  }
  function updateParticles(dt) {
    for (const p of G.parts) {
      p.t -= dt;
      if (p.ring) continue;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === 'shard') { p.vy += 520 * dt; p.rot += p.vr * dt; } else { p.vy += 260 * dt; p.vx *= 1 - dt * 1.5; }
    }
    G.parts = G.parts.filter((p) => p.t > 0);
    for (const t of G.texts) { if (t.T == null) t.T = t.t; t.t -= dt; t.y -= (t.big ? 12 : 30) * dt; }
    G.texts = G.texts.filter((t) => t.t > 0);
    for (const b of G.beams) b.t -= dt;
    G.beams = G.beams.filter((b) => b.t > 0);
  }

  // ---------- enemies ----------
  const FOE = {
    drifter: { r: 13, hp: 3, color: '#c08cff', coins: 2 },
    shooter: { r: 14, hp: 4, color: '#ff9a4d', coins: 3 },
    mender: { r: 12, hp: 4, color: '#5ee08a', coins: 3 },
    thief: { r: 12, hp: 2, color: '#8b93b8', coins: 2 },
    blimp: { r: 17, hp: 3, color: '#ffd23f', coins: 8 },
    splitter: { r: 20, hp: 9, color: '#8f5cff', coins: 4 },
    bomber: { r: 11, hp: 2, color: '#ff5c5c', coins: 3 },
    pinata: { r: 42, hp: 1e9, color: '#ff7ad9', coins: 0 },
    bumper: { r: 22, hp: 1e9, color: '#5ef0ff', coins: 0 },
    snail: { r: 14, hp: 1e9, color: '#c8874a', coins: 0 },
  };
  // Blimps and the targets of the bonus rounds: only a ball touches them, and guns do not aim at them.
  const passive = (f) => f.type === 'blimp' || f.type === 'pinata' || f.type === 'bumper' || f.type === 'snail';
  // The shopkeeper crosses the field on his lunch break. A ball hit shakes a coin out of him, five times at most.
  const SNAIL_CRIES = ["Hey! I'm on my lunch!", 'Mind the shell!', 'I will remember this. Slowly.', 'Not the face!', 'This is why I close early.'];
  function spawnSnail() {
    if (G.clearT >= 0) return;
    const dir = Math.random() < 0.5 ? 1 : -1, z = foeZone();
    const f = spawnFoe('snail', dir > 0 ? -20 : W + 20, (z.top + z.bot) / 2);
    f.dir = dir; f.paid = 0;
  }
  function snailHit(f) {
    f.flash = 0.12; sfx.eek();
    say(clamp(f.x, 100, W - 100), f.y - 26, snailSay('lunch') || pick(SNAIL_CRIES), '#ffffff', 1.4);
    if (f.paid++ < 5) dropCoin(f.x, f.y, 1, true);
  }
  function bonusHit(f) {
    if (f.type === 'snail') { snailHit(f); return; }
    f.flash = 0.12; if (G.safari) G.popped++;
    if (f.type === 'pinata') {
      sfx.whack(); shake(3); burst(f.x, f.y, pick(RAINBOW), 10, 200);
      dropCoin(f.x, f.y + 20, 2 + Math.floor(G.popped / 6), true);
      if (G.popped % 8 === 0) { G.pus.push({ x: f.x, y: f.y, vy: 110, k: rollPU() }); say(f.x, f.y - 50, pick(['WHACK!', 'POW!', 'OOF!', 'CANDY!']), pick(RAINBOW), 0.8, true); }
      return;
    }
    sfx.ping(G.popped + G.rounds); if (G.safari || !f.lit) dropCoin(f.x, f.y, 1, true);
    if (f.lit) return;
    f.lit = true;
    if (G.foes.some((o) => o.type === 'bumper' && !o.lit)) return;
    if (!G.safari && G.rounds >= 3) return;
    G.rounds++;
    if (G.rounds >= 2 && G.safari) sticker('tilt');
    say(W / 2, H * 0.6, 'JACKPOT! ×' + G.rounds, '#ffd23f', 1.4, true); sfx.jackpot(); flashScreen('#ffd23f', 0.3);
    for (const o of G.foes) if (o.type === 'bumper') { o.lit = false; dropCoin(o.x, o.y, 3 * Math.min(G.rounds, 4), true); }
  }
  // Blimps: bonus targets that cross the field. Only a ball can hurt a blimp, and each hit shakes loot out.
  // hits = ball hits to pop it, coins = coins on the pop, w = how often it comes, from = first level.
  const BLIMPS = {
    loot: { hits: 3, r: 17, speed: 62, coins: 8, w: 10, from: 8, body: '#ffd23f', band: '#ff7ad9', mark: '$', call: 'LOOT BLIMP!' },
    gift: { hits: 2, r: 16, speed: 72, coins: 2, w: 4, from: 12, body: '#ff7ad9', band: '#ffffff', mark: '?', call: 'GIFT BLIMP!' },
    gold: { hits: 1, r: 12, speed: 150, coins: 30, w: 1, from: 16, body: '#fff3a0', band: '#ffb02e', mark: '★', call: 'GOLDEN BLIMP! Quick!' },
    bomb: { hits: 2, r: 18, speed: 52, coins: 4, w: 3, from: 20, body: '#ff5c5c', band: '#2b0b10', mark: '!', call: 'BOMBER BLIMP! Pop it!' },
    mother: { hits: 6, r: 28, speed: 34, coins: 16, w: 2, from: 24, body: '#ffb02e', band: '#c08cff', mark: '$$', call: 'MOTHER SHIP!' },
    windbag: { hits: 12, r: 44, speed: 26, coins: 40, w: 1, from: 28, body: '#c08cff', band: '#ffd23f', mark: '', call: 'THE WINDBAG! Only the ball can pop it!' },
  };
  const CONVOY_FROM = 18;
  function rollBlimp() {
    if (G.level === FROM.blimp && !G.safari) return 'loot';
    const opts = Object.entries(BLIMPS).filter(([k, d]) => (G.safari ? k === 'loot' || k === 'gift' || k === 'gold' || G.level >= d.from : G.level >= d.from) && !(G.safari && k === 'bomb'));
    const wt = (k, d) => d.w * (k === 'gold' ? 1 + lv('goldtix') : 1);
    let r = Math.random() * opts.reduce((a, [k, d]) => a + wt(k, d), 0);
    for (const [k, d] of opts) { r -= wt(k, d); if (r <= 0) return k; }
    return 'loot';
  }
  // With x and y: a small blimp that comes out of a mother ship.
  function spawnBlimp(kind = rollBlimp(), x, y, dir = Math.random() < 0.5 ? 1 : -1) {
    const d = BLIMPS[kind];
    const lane = G.safari ? rand(HUD_H + 70, PADDLE_Y - 190) : clamp(brickBottom() + 50 + rand(0, 50), TOP + 70, PADDLE_Y - 230);
    const f = spawnFoe('blimp', x != null ? x : dir > 0 ? -d.r - 6 : W + d.r + 6, y != null ? y : lane);
    f.kind = kind; f.dir = dir; f.baseY = f.y; f.r = d.r; f.speed = d.speed * (G.safari ? 1.4 : 1);
    f.hp = f.maxhp = d.hits + (kind === 'gold' || G.safari ? 0 : lv('hull'));
    if (x != null) { f.hitCd = 0.5; return f; }
    if (G.safari) return f;
    say(W / 2, f.y - 34, d.call, d.body, 1.4); sfx.blimp();
    if (Math.random() < 0.4) heckle('blimp');
    if (G.level === FROM.blimp) say(W / 2, f.y - 12, 'Hit it with the ball for coins!', '#ffffff', 2.4);
    return f;
  }
  function blimpHit(f) {
    const n = 2 + lv('cargo');
    shake(3);
    if (f.kind === 'gift') G.pus.push({ x: f.x, y: f.y, vy: 110, k: rollPU() });
    else if (f.kind !== 'gold') dropCoin(f.x, f.y, f.kind === 'mother' ? n + 2 : n, true);
    if (f.kind !== 'windbag') return;
    if (f.hp > 1 && (f.hp - 1) % 4 === 0) spawnBlimp('loot', f.x, f.y + f.r * 0.6, f.hp % 8 < 4 ? 1 : -1);
    if (!f.leak && f.hp <= 5) { f.leak = true; f.la = 0; say(f.x, f.y - f.r - 12, "I'm full of hot air!", '#ffffff', 1.8); sfx.raspberry(); }
  }
  // A convoy: a leader and four small blimps in a line. All five popped pay a bonus.
  function spawnConvoy() {
    const dir = Math.random() < 0.5 ? 1 : -1, id = ++G.convoyN;
    const lane = G.safari ? rand(HUD_H + 90, PADDLE_Y - 220) : clamp(brickBottom() + 70, TOP + 90, PADDLE_Y - 240);
    G.convoys[id] = 0;
    for (let i = 0; i < 5; i++) {
      const f = spawnBlimp('loot', (dir > 0 ? -24 : W + 24) - dir * i * 44, lane, dir);
      f.convoy = id; f.t = -i * 0.45; f.hitCd = 0;
      if (i) { f.r = 12; f.small = true; f.hp = f.maxhp = 1; }
    }
    say(W / 2, lane - 46, 'BLIMP CONVOY! Pop all five!', '#ffd23f', 1.8); sfx.blimp();
  }
  function popBlimp(f) {
    G.popped++; run.stats.blimps++; shake(6);
    if (run.stats.blimps >= 25) sticker('bubble');
    if (f.kind === 'windbag') sticker('windbag');
    say(f.x, f.y - 20, f.kind === 'gold' ? 'GOLDEN JACKPOT!' : 'JACKPOT!', '#ffd23f', 1.2, f.kind === 'gold');
    if (f.kind === 'gold') { G.slowmo = Math.max(G.slowmo, 0.5); flashScreen('#ffd23f', 0.25); sfx.jackpot(); }
    if ((f.kind === 'loot' && !f.small) || f.kind === 'gift') G.pus.push({ x: f.x, y: f.y, vy: 110, k: rollPU() });
    if (f.convoy && ++G.convoys[f.convoy] === 5) {
      sticker('convoy');
      say(W / 2, f.y - 40, 'CONVOY BONUS!', '#ffd23f', 1.6, true); dropCoin(f.x, f.y, 15, true); flashScreen('#ffd23f', 0.25); sfx.jackpot();
    }
    if (f.kind === 'windbag') {
      G.slowmo = Math.max(G.slowmo, 0.6); sfx.roar(); flashScreen('#c08cff', 0.3);
      for (let i = 0; i < 3; i++) G.pus.push({ x: f.x + (i - 1) * 40, y: f.y, vy: 110, k: rollPU() });
    }
    if (f.kind === 'bomb') airStrike(4, 54, 4);
    if (f.kind === 'mother') [-26, 0, 26].forEach((dy, i) => spawnBlimp('loot', f.x, f.y + dy, i % 2 ? -1 : 1));
    if (relic('pirate')) airStrike(6, 40, 3);
  }
  // Bombs on random bricks.
  function airStrike(n, rad, dmg) {
    const opts = G.bricks.filter((k) => k.alive && k.type !== 'stone');
    for (let i = 0; i < n && opts.length; i++) {
      const k = opts.splice((Math.random() * opts.length) | 0, 1)[0];
      after(0.15 + i * 0.12, () => explode(k.x + k.w / 2, k.y + k.h / 2, rad, gunDmg(dmg), '#ff5c5c', i > 0));
    }
  }
  // Monsters get tougher with the bricks, but more slowly.
  function foeScale() { return (1 + (run.level - 1) / 14) * Math.max(1, Math.sqrt(hpMult(run.level) * heatMult())); }
  function brickBottom() { let y = TOP; for (const b of G.bricks) if (b.alive && b.y + b.h > y) y = b.y + b.h; return y; }
  function foeZone() {
    const top = Math.max(G.boss ? 190 : TOP, Math.min(brickBottom() + 24, 330));
    return { top, bot: Math.max(top + 60, Math.min(top + 200, PADDLE_Y - 190)) };
  }
  function spawnFoe(type, x, y) {
    const d = FOE[type], z = foeZone();
    const hp = Math.round(d.hp * foeScale());
    const f = { type, x: x != null ? x : rand(40, W - 40), y: y != null ? y : rand(z.top, z.bot), r: d.r, hp, maxhp: hp,
      vx: rand(-1, 1) * 55, vy: rand(-1, 1) * 30, t: Math.random() * 6, cd: rand(1.5, 3.5), hitCd: 0, flash: 0, loot: 0, dir: Math.random() < 0.5 ? -1 : 1, frozenT: 0 };
    G.foes.push(f); burst(f.x, f.y, d.color, 10, 120);
    return f;
  }
  // ball = the hit comes from a ball. A blimp takes one hit per ball hit, whatever the damage.
  function damageFoe(f, dmg, ball = false) {
    if (f.dead) return;
    if (f.type === 'pinata' || f.type === 'bumper' || f.type === 'snail') { if (ball && G.clearT < 0) bonusHit(f); return; }
    if (f.type === 'blimp') {
      // at the end of a level the blimps fly off
      if (G.clearT >= 0) { f.dead = true; burst(f.x, f.y, BLIMPS[f.kind].body, 10, 160); return; }
      if (!ball) return;
      dmg = 1; blimpHit(f);
    }
    f.hp -= dmg; f.flash = 0.12; sfx.foeHit();
    if (f.hp > 0) return;
    f.dead = true; sfx.foePop(); burst(f.x, f.y, FOE[f.type].color, 16, 220); ring(f.x, f.y, f.r * 2.4, FOE[f.type].color);
    run.score += 50; run.stats.foes++; addFever(0.06);
    if (f.type === 'blimp') dropCoin(f.x, f.y, f.small ? 3 : BLIMPS[f.kind].coins, true);
    else dropCoin(f.x, f.y, FOE[f.type].coins + lv('foebounty') + f.loot * 2);
    if (f.loot) say(f.x, f.y - 16, 'Loot back x2!', '#ffd84a');
    if (G.clearT >= 0) return;
    if (f.type === 'blimp') popBlimp(f);
    if (f.type === 'splitter') for (const sd of [-1, 1]) spawnFoe('drifter', f.x + sd * 14, f.y).vx = sd * 55;
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
  // Enemy projectiles. k: undefined = slime, 'curse' = cursed coin (falls, takes coins), 'paper' = tax form (zigzag).
  function enemyShot(x, y, angle, speed, k) {
    G.eshots.push({ x, y, vx: Math.sin(angle) * speed, vy: Math.cos(angle) * speed, r: k ? 8 : 6, k, t: 0 });
  }
  function aimAtPaddle(x, y) { return Math.atan2(paddle.x - x, PADDLE_Y - y); }
  // Something nasty reached the paddle. The Deflector absorbs it; otherwise the paddle is small and slow for a moment.
  function hurtPaddle(x, color = '#9cff57') {
    if (G.shield > 0) { G.shield--; burst(x, PADDLE_Y, '#6ee7ff', 12, 160); sfx.net(); say(x, PADDLE_Y - 20, 'Blocked!', '#6ee7ff', 0.8); return false; }
    G.stun = 1.5; burst(x, PADDLE_Y, color, 14, 160); sfx.stun(); shake(5); buzz(30);
    return true;
  }
  // A laser column: a warning first, then the beam. It stuns the paddle if the paddle stays in it.
  function laserAt(x, warn = 1) { G.lasers.push({ x, w: 36, warn, fire: 0.45, hit: false }); sfx.beamWarn(); }

  function updateFoes(dt) {
    const frozen = G.fx.freeze > 0;
    // staggered arrivals
    if (G.foeQueue.length && G.started && !frozen) {
      G.foeQueueT -= dt;
      if (G.foeQueueT <= 0) { spawnFoe(G.foeQueue.shift()); G.foeQueueT = 2.2; }
    }
    // hives
    for (const b of G.bricks) {
      if (!b.alive || b.type !== 'hive' || !G.started || frozen) continue;
      b.spawnT -= dt;
      if (b.spawnT <= 0) {
        b.spawnT = 9;
        if (G.foes.filter((f) => f.type === 'drifter').length < 4) spawnFoe('drifter', b.x + b.w / 2, b.y + b.h + 16);
      }
    }
    const z = foeZone();
    for (const f of G.foes) {
      if (f.flash > 0) f.flash -= dt; if (f.hitCd > 0) f.hitCd -= dt;
      if (f.frozenT > 0) f.frozenT -= dt;
      if (frozen || f.frozenT > 0) continue;
      f.t += dt;
      if (f.type === 'blimp') {
        if (f.leak) {
          // a Windbag with a leak shoots around like a balloon that you let go
          f.la += dt * 5; f.x += Math.cos(f.la * 0.7) * 260 * dt * f.dir;
          f.baseY = clamp(f.baseY + Math.sin(f.la) * 200 * dt, HUD_H + 60, PADDLE_Y - 210);
          if (f.x < f.r) { f.x = f.r; f.dir = 1; } else if (f.x > W - f.r) { f.x = W - f.r; f.dir = -1; }
          f.y = f.baseY; f.r = 18 + 5 * f.hp;
          if (Math.random() < dt * 3) { sfx.raspberry(); burst(f.x - f.dir * f.r, f.y, '#ffffff', 3, 120); }
        } else {
          f.x += f.dir * f.speed * dt; f.y = f.baseY + Math.sin(f.t * 2) * (f.convoy ? 22 : 8);
          if ((f.x < -60 && f.dir < 0) || (f.x > W + 60 && f.dir > 0)) f.dead = true;
        }
      } else if (f.type === 'drifter' || f.type === 'splitter') {
        f.vx += Math.sin(f.t * 0.9) * 12 * dt; f.vy += Math.cos(f.t * 0.7) * 10 * dt;
        const sp = Math.hypot(f.vx, f.vy) || 1, want = f.type === 'splitter' ? 36 : 55; f.vx *= want / sp; f.vy *= want / sp;
        f.x += f.vx * dt; f.y += f.vy * dt;
      } else if (f.type === 'shooter') {
        f.x += f.dir * 70 * dt;
        if (f.x < 30 || f.x > W - 30) f.dir *= -1;
        f.y += (z.top + 20 - f.y) * Math.min(1, dt * 1.5);
        f.cd -= dt;
        if (f.cd <= 0 && G.clearT < 0) { f.cd = rand(3, 4.2); enemyShot(f.x, f.y + f.r, aimAtPaddle(f.x, f.y) + rand(-0.12, 0.12), 170); sfx.spit(); }
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
          if (best) { best.hp++; best.flash = 0.15; G.bolts.push({ pts: [[f.x, f.y], [best.x + best.w / 2, best.y + best.h / 2]], t: 0.3, T: 0.3, c: '#5ee08a' }); }
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
          target.dead = true; f.loot += target.val; sfx.steal();
        }
        if (f.fleeing && f.y < HUD_H - 10) {
          f.dead = true; f.escaped = true;
          say(clamp(f.x, 80, W - 80), HUD_H + 20, `Thief got away with ${f.loot}!`, '#ff6b8b', 1.4);
        }
      } else if (f.type === 'snail' && f.shelf) {
        f.x = W / 2 + Math.sin(f.t * 0.9) * 170; f.dir = Math.cos(f.t * 0.9) >= 0 ? 1 : -1;
        if (G.clearT < 0 && (f.cd -= dt) <= 0) { f.cd = 0.34; throwStock(f); }
      } else if (f.type === 'snail') {
        f.x += f.dir * 14 * dt;
        if ((f.x < -40 && f.dir < 0) || (f.x > W + 40 && f.dir > 0)) f.dead = true;
      } else if (f.type === 'pinata') {
        f.x = W / 2 + Math.sin(f.t * 1.3) * 130; f.y = 225 + Math.cos(f.t * 2.6) * 22;
      } else if (f.type === 'bomber') {
        updateBomber(f, dt, z);
      }
      if (f.type !== 'thief' && !passive(f) && !f.dive) {
        if (f.x < f.r) { f.x = f.r; f.vx = Math.abs(f.vx); } if (f.x > W - f.r) { f.x = W - f.r; f.vx = -Math.abs(f.vx); }
        if (f.y < z.top) { f.y = Math.min(f.y + 60 * dt, z.top); f.vy = Math.abs(f.vy); }
        if (f.y > z.bot) { f.y = z.bot; f.vy = -Math.abs(f.vy); }
      }
    }
    G.foes = G.foes.filter((f) => !f.dead);

    updateBoss(dt);
    if (frozen) return;

    for (const s of G.eshots) {
      s.t += dt;
      if (s.k === 'curse') s.vy = Math.min(s.vy + 320 * dt, 260);
      if (s.k === 'paper') s.x += Math.cos(s.t * 6) * 110 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.k && (s.x < 8 || s.x > W - 8)) { s.vx = -s.vx; s.x = clamp(s.x, 8, W - 8); }
      if (s.x < -10 || s.x > W + 10 || s.y > H + 10) { s.dead = true; continue; }
      if (s.vy > 0 && s.y + s.r >= PADDLE_Y && s.y - s.r <= PADDLE_Y + PADDLE_H && Math.abs(s.x - paddle.x) <= paddle.w / 2 + s.r) {
        s.dead = true;
        if (hurtPaddle(s.x, s.k === 'curse' ? '#ff5c5c' : '#9cff57') && s.k === 'curse') {
          const tax = Math.min(run.coins, 3 + Math.floor(run.level / 5));
          run.coins -= tax; sfx.curse(); say(s.x, PADDLE_Y - 24, `TAXED −${tax}`, '#ff5c5c', 1.1);
        }
      }
    }
    G.eshots = G.eshots.filter((s) => !s.dead);

    for (const l of G.lasers) {
      if (l.warn > 0) { l.warn -= dt; if (l.warn <= 0) { sfx.beam(); shake(4); } continue; }
      l.fire -= dt;
      if (!l.hit && Math.abs(paddle.x - l.x) < paddle.w / 2 + l.w / 2) { l.hit = true; hurtPaddle(paddle.x, '#ff2a4d'); }
    }
    G.lasers = G.lasers.filter((l) => l.fire > 0);
  }
  // Bomber: hovers, flashes a warning, then dives at the place where the paddle was. Pop it before it lands.
  function updateBomber(f, dt, z) {
    if (!f.dive) {
      f.x += f.dir * 60 * dt; if (f.x < 30 || f.x > W - 30) f.dir *= -1;
      f.y += (z.top + 10 - f.y) * Math.min(1, dt * 1.5);
      if (G.clearT >= 0 || (f.cd -= dt) > -0.7) return; // the last 0.7 s is the warning
      const dx = paddle.x - f.x, dy = PADDLE_Y - f.y, d = Math.hypot(dx, dy) || 1;
      f.dive = true; f.vx = (dx / d) * 340; f.vy = (dy / d) * 340; sfx.spit();
      return;
    }
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.y < PADDLE_Y - 4) return;
    f.dead = true; burst(f.x, f.y, '#ff5c5c', 14, 200); ring(f.x, f.y, 40, '#ff5c5c'); sfx.boom(true);
    if (Math.abs(f.x - paddle.x) <= paddle.w / 2 + f.r) hurtPaddle(f.x, '#ff5c5c');
  }

  // ---------- bosses ----------
  // Every boss has three phases (at 66% and 33% health) and its own attacks. An attack can stun the paddle or take
  // a few coins; it never takes a life. Overtime damage guarantees that every boss falls.
  const BOSSES = [null,
    { name: 'Crate King', w: 150, h: 46, says: ['Fragile? ME?', 'Ship it!', 'Handle with care!', 'This side up!'], dies: 'Return to sender...' },
    { name: 'Twin Cannon', w: 160, h: 44, says: ['Pew. Pew.', 'Have you tried dodging?', 'Reloading...', 'Target acquired!'], dies: 'Out of ammo...' },
    { name: 'Bazaar Baron', w: 140, h: 48, says: ['No refunds!', 'Everything must go!', 'Prices just went up!', 'That will cost you!'], dies: 'I am ruined!' },
    { name: 'Slime Queen', w: 130, h: 66, says: ['Wobble wobble!', 'Bow to the goo!', 'Sticky situation!', 'Bloop.'], dies: 'I am melting...' },
    { name: 'The Auditor', w: 170, h: 50, says: ['Receipts, please.', 'That is not deductible.', 'You owe 3 coins. And interest.', 'Audit time!'], dies: 'Filing... for... bankruptcy...' },
  ];
  const BOSS_Y = 94, STOMP_Y = 420;
  // The health of a boss follows the brick toughness of its level, and the heat at a lower rate: area damage
  // does not help against one target. Boss levels get a longer clock.
  const BOSS_K = [0, 75, 55, 50, 35, 35];
  const bossHp = (n, kind) => Math.round(BOSS_K[kind] * hpMult(n));
  const BOSS_CLOCK_S = 20;
  function makeBoss(kind) {
    const d = BOSSES[kind], hp = Math.round(bossHp(run.level, kind) * Math.pow(heatMult(), 0.6));
    return { kind, x: W / 2, y: BOSS_Y, w: d.w, h: d.h, hp, maxhp: hp, t: 0, phase: 1, atkT: 3, moveT: 4, talkT: 5, flash: 0, dead: false,
      coinAcc: 0, talk: null, state: 'idle', stateT: 0, vx: 95, vy: 40 };
  }
  function bossSay(s) { G.boss.talk = { s, t: 2.2 }; sfx.taunt(); }
  function damageBoss(dmg) {
    const B = G.boss; if (!B || B.dead) return;
    // the Crate King lands on his head after a stomp
    if (B.kind === 1 && B.state === 'rest') dmg *= 2;
    B.hp -= dmg; B.flash = 0.1; sfx.bossHit();
    // a boss leaks coins as it takes damage: 25 drops over the fight
    B.coinAcc += Math.min(dmg / B.maxhp, 0.2);
    while (B.coinAcc >= 0.04) { B.coinAcc -= 0.04; dropCoin(B.x + rand(-40, 40), B.y + B.h, 1); }
    const phase = B.hp > B.maxhp * 0.66 ? 1 : B.hp > B.maxhp * 0.33 ? 2 : 3;
    if (phase > B.phase && B.hp > 0) {
      B.phase = phase; B.atkT = 1.5;
      say(W / 2, clamp(B.y + B.h + 54, 170, 420), phase === 3 ? 'ENRAGED!' : 'PHASE 2!', '#ff2a4d', 1.6, true);
      sfx.warn(); flashScreen('#ff2a4d', 0.3); shake(8); G.hitstop = 0.08;
      bossSay(pick(BOSSES[B.kind].says));
      BOSS_PHASE[B.kind](B);
    }
    if (B.hp > 0) return;
    B.dead = true; shake(16); sfx.bossDie(); buzz([40, 40, 40, 40, 120]);
    G.slowmo = 1.2; flashScreen('#ffffff', 0.6); G.lasers = []; G.eshots = [];
    G.cam = { x: B.x, y: B.y + B.h / 2, t: 1.2, T: 1.2 }; sfx.roar();
    for (let i = 0; i < 7; i++) after(i * 0.07, () => { const x = B.x + rand(-60, 60), y = B.y + rand(-5, B.h); burst(x, y, pick(RAINBOW), 20, 260); ring(x, y, 50, '#ffd23f'); });
    dropCoin(B.x, B.y + 20, Math.round((15 + 10 * B.kind) * (1 + 0.25 * lv('foebounty'))));
    run.score += 2000 * B.kind;
    say(W / 2, H / 2, BOSSES[B.kind].name + ' defeated!', '#ffd23f', 2, true);
    say(W / 2, H / 2 + 34, `"${BOSSES[B.kind].dies}"`, '#ffffff', 2);
    for (const b of G.bricks) if (b.alive && b.type !== 'stone') destroyBrick(b);
    for (const f of G.foes) damageFoe(f, 999);
  }
  // Drops n new bricks into free cells below the boss.
  function dropBricks(n, type, hp) {
    const free = [];
    for (let r = 4; r <= 8; r++) for (let c = 0; c < COLS; c++) if (!G.bricks.some((b) => b.alive && b.row === r && b.col === c)) free.push([r, c]);
    for (let i = 0; i < n && free.length; i++) {
      const [r, c] = free.splice((Math.random() * free.length) | 0, 1)[0];
      const b = makeBrick(r, c, type, Math.max(1, Math.round(hp * hpMult(run.level) * heatMult())));
      b.delay = G.time; G.bricks.push(b);
    }
    sfx.stone();
  }
  function poof(x, y, color) { burst(x, y, color, 16, 200); ring(x, y, 60, color, 0.35); }
  const sweepX = (B, speed) => W / 2 + Math.sin(B.t * speed) * (W / 2 - B.w / 2 - 8);

  // One-time events when a boss enters phase 2 or 3.
  const BOSS_PHASE = [null,
    () => dropBricks(4, 'normal', 2),
    (B) => { for (const x of [80, 240, 400]) laserAt(x + rand(-30, 30), 1.3); },
    (B) => { for (let i = 0; i < 2 + B.phase; i++) enemyShot(B.x + rand(-30, 30), B.y + B.h, rand(-0.5, 0.5), 60, 'curse'); },
    (B) => { for (const s of [-1, 1]) spawnFoe(B.phase === 2 ? 'splitter' : 'drifter', clamp(B.x + s * 80, 30, W - 30), 230); },
    (B) => { dropBricks(4, 'steel', 3); for (let i = 0; i < B.phase - 1; i++) spawnFoe('bomber'); },
  ];
  // Movement and attacks. live = the ball is in play, so attacks are allowed.
  const BOSS_AI = [null,
    // Crate King: sweeps, throws crates and slime; from phase 2 he stomps down at the paddle.
    (B, dt, live) => {
      if (B.state === 'idle') {
        B.x = sweepX(B, 0.55); B.y += (BOSS_Y - B.y) * Math.min(1, dt * 4);
        if (!live || (B.atkT -= dt) > 0) return;
        const roll = Math.random();
        if (B.phase >= 2 && roll < 0.35) { B.state = 'aim'; B.stateT = 0.9; bossSay('STOMP!'); }
        else if (roll < 0.65) { B.atkT = 3.6 - B.phase * 0.4; dropBricks(B.phase, 'normal', 2); }
        else { B.atkT = 2.9 - B.phase * 0.3; for (const a of [-0.35, 0, 0.35]) enemyShot(B.x, B.y + B.h, a, 160); sfx.bossFire(); }
      } else if (B.state === 'aim') {
        B.x = clamp(B.x + clamp(paddle.x - B.x, -280 * dt, 280 * dt) + rand(-2, 2), B.w / 2, W - B.w / 2);
        if ((B.stateT -= dt) <= 0) B.state = 'drop';
      } else if (B.state === 'drop') {
        B.y += 900 * dt;
        if (B.y < STOMP_Y) return;
        B.y = STOMP_Y; B.state = 'rest'; B.stateT = 1.8;
        bossSay('This side up!'); say(B.x, B.y - 16, 'DIZZY! Double damage', '#ffd23f', 1.6);
        shake(12); sfx.boom(); ring(B.x, B.y + B.h, 130, '#c8874a', 0.5, 4);
        for (const a of [-1.1, -0.6, 0.6, 1.1]) enemyShot(B.x, B.y + B.h, a, 190);
      } else if (B.state === 'rest') {
        if ((B.stateT -= dt) <= 0) B.state = 'rise';
      } else {
        B.y -= 260 * dt;
        if (B.y > BOSS_Y) return;
        // continue the sweep from where he is
        B.y = BOSS_Y; B.state = 'idle'; B.atkT = 2; B.t = Math.asin(clamp((B.x - W / 2) / (W / 2 - B.w / 2 - 8), -1, 1)) / 0.55;
      }
    },
    // Twin Cannon: aimed double shots, laser columns on the paddle, blob minions.
    (B, dt, live) => {
      B.x = sweepX(B, 0.7);
      if (!live || (B.atkT -= dt) > 0) return;
      const roll = Math.random(), by = B.y + B.h;
      if (roll < 0.4) { B.atkT = 2.3; for (const ox of [-55, 55]) enemyShot(B.x + ox, by, aimAtPaddle(B.x + ox, by), 185); sfx.bossFire(); }
      else if (roll < 0.78) {
        B.atkT = 2.8;
        const xs = [paddle.x];
        if (B.phase >= 2) xs.push(clamp(paddle.x + (Math.random() < 0.5 ? -130 : 130), 40, W - 40));
        if (B.phase >= 3) xs.push(rand(40, W - 40));
        for (const x of xs) laserAt(x);
      } else { B.atkT = 3; if (G.foes.length < 4) { for (let i = 0; i < B.phase; i++) spawnFoe('drifter', clamp(B.x + rand(-60, 60), 30, W - 30), 230); bossSay('Minions!'); } }
    },
    // Bazaar Baron: teleports, throws coins (some are cursed), fans of slime, hired help.
    (B, dt, live) => {
      B.y = (B.by || BOSS_Y) + Math.sin(B.t * 2) * 5;
      if (!live) return;
      if ((B.moveT -= dt) <= 0) {
        B.moveT = 5.5 - B.phase; poof(B.x, B.y + B.h / 2, '#d4a5ff');
        B.x = pick([90, W / 2, W - 90].filter((x) => Math.abs(x - B.x) > 40));
        // from phase 2 the Baron also appears lower in the field
        B.by = B.phase >= 2 && Math.random() < 0.5 ? 292 : BOSS_Y;
        B.y = B.by + Math.sin(B.t * 2) * 5;
        poof(B.x, B.y + B.h / 2, '#d4a5ff'); sfx.teleport();
      }
      if ((B.atkT -= dt) > 0) return;
      const roll = Math.random(), by = B.y + B.h;
      if (roll < 0.4) {
        B.atkT = 2.7; dropCoin(B.x, by, 3);
        for (let i = 0; i < B.phase; i++) enemyShot(B.x + rand(-30, 30), by, rand(-0.7, 0.7), 110, 'curse');
        if (Math.random() < 0.5) bossSay('Free samples!');
      } else if (roll < 0.72) { B.atkT = 2.3; const aim = aimAtPaddle(B.x, by); for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) enemyShot(B.x, by, aim + a, 165); sfx.bossFire(); }
      else if (B.phase >= 3 && roll < 0.88) { B.atkT = 3.2; for (let i = 0; i < 10; i++) after(i * 0.12, () => { if (!B.dead) enemyShot(B.x, B.y + B.h, -1.2 + i * 0.27, 150); }); }
      else { B.atkT = 3.2; if (G.foes.length < 5) spawnFoe(Math.random() < 0.5 ? 'thief' : 'mender', B.x, 230); }
    },
    // Slime Queen: bounces around the top, rains slime, spawns blobs.
    (B, dt, live, fast) => {
      B.x += B.vx * fast * dt; B.y += B.vy * fast * dt;
      if (B.x < B.w / 2) { B.x = B.w / 2; B.vx = Math.abs(B.vx); } if (B.x > W - B.w / 2) { B.x = W - B.w / 2; B.vx = -Math.abs(B.vx); }
      if (B.y < 66) { B.y = 66; B.vy = Math.abs(B.vy); } if (B.y > 116) { B.y = 116; B.vy = -Math.abs(B.vy); }
      if (!live || (B.atkT -= dt) > 0) return;
      const roll = Math.random();
      if (roll < 0.45) { B.atkT = 2.8; for (let i = 0; i < 3 + B.phase; i++) enemyShot(rand(20, W - 20), HUD_H + 4, 0, rand(190, 250)); sfx.bossFire(); bossSay('Rain!'); }
      else if (roll < 0.75) { B.atkT = 2.4; for (const a of [-0.6, -0.3, 0, 0.3, 0.6]) enemyShot(B.x, B.y + B.h, a, 170); sfx.bossFire(); }
      else { B.atkT = 3; if (G.foes.length < 5) spawnFoe('drifter', B.x, B.y + B.h + 30); }
    },
    // The Auditor: a saucer. Tax forms, laser columns, and a tractor beam that takes falling coins.
    (B, dt, live) => {
      if (B.state === 'tractor') {
        if ((B.stateT -= dt) <= 0) { B.state = 'idle'; B.atkT = 1.5; }
        return;
      }
      B.x = sweepX(B, 0.5); B.y = BOSS_Y + Math.sin(B.t * 1.7) * 14;
      if (!live || (B.atkT -= dt) > 0) return;
      const roll = Math.random(), by = B.y + B.h;
      if (roll < 0.3) { B.atkT = 2.6; for (let i = 0; i < 1 + B.phase; i++) enemyShot(B.x + rand(-50, 50), by, rand(-0.3, 0.3), 125, 'paper'); sfx.bossFire(); }
      else if (roll < 0.6) { B.atkT = 2.8; laserAt(paddle.x); for (let i = 0; i < B.phase; i++) laserAt(rand(40, W - 40), 1 + i * 0.35); }
      else if (roll < 0.8 && G.coins.length > 2) { B.state = 'tractor'; B.stateT = 2.4; bossSay('Mine now.'); sfx.teleport(); }
      else { B.atkT = 3; if (G.foes.length < 4) spawnFoe(Math.random() < 0.5 ? 'bomber' : 'shooter'); }
    },
  ];
  function updateBoss(dt) {
    const B = G.boss;
    if (!B) return;
    if (B.flash > 0) B.flash -= dt;
    if (B.talk && (B.talk.t -= dt) <= 0) B.talk = null;
    if (B.dead || G.fx.freeze > 0) return;
    const fast = 1 + 0.25 * (B.phase - 1), live = G.started && G.clearT < 0;
    B.t += dt * fast;
    BOSS_AI[B.kind](B, dt, live, fast);
    if (live && (B.talkT -= dt) <= 0) { B.talkT = rand(7, 11); bossSay(pick(BOSSES[B.kind].says)); }
  }
  const tractorOn = (c) => G.boss && !G.boss.dead && G.boss.state === 'tractor' && Math.abs(c.x - G.boss.x) < 70 && c.y > G.boss.y;

  function foeAt(x, y, pad = 0) {
    for (const f of G.foes) if (!f.dead && !passive(f) && Math.hypot(f.x - x, f.y - y) <= f.r + pad) return f;
    return null;
  }
  function bossAt(x, y, pad = 0) {
    const B = G.boss; if (!B || B.dead) return false;
    return x >= B.x - B.w / 2 - pad && x <= B.x + B.w / 2 + pad && y >= B.y - pad && y <= B.y + B.h + pad;
  }
  function levelDone() { return G.safari ? G.clock >= G.par : G.boss ? G.boss.dead : destructibleLeft() === 0; }

  // ---------- drawing: enemies and bosses ----------
  // d = a row of BLIMPS, or the colours of the player's War Blimp.
  function drawBlimp(x, y, r, dir, d, flash, pips) {
    const w = r * 1.53, h = r * 0.88;
    ctx.fillStyle = '#7a4a1e'; rr(x - w * 0.27, y + h - 1, w * 0.54, h * 0.47, 2); ctx.fill();
    ctx.fillStyle = flash ? '#ffffff' : d.body; ctx.beginPath(); ctx.ellipse(x, y, w, h, 0, 0, 7); ctx.fill();
    if (!flash) {
      ctx.fillStyle = d.band; ctx.beginPath(); ctx.ellipse(x, y, w * 0.45, h, 0, 0, 7); ctx.fill();
      ctx.fillStyle = d.body; ctx.beginPath(); ctx.ellipse(x, y, w * 0.16, h, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(x - w * 0.23, y - h * 0.4, w * 0.46, h * 0.23, 0, 0, 7); ctx.fill();
    }
    ctx.fillStyle = d.band === '#ffffff' ? '#ff9a3d' : d.band; ctx.beginPath(); ctx.moveTo(x - dir * w, y); ctx.lineTo(x - dir * (w + 9), y - 8); ctx.lineTo(x - dir * (w + 9), y + 8); ctx.fill();
    ctx.fillStyle = '#3a2600'; ctx.font = `bold ${Math.round(r * 0.76)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.mark, x, y + 1);
    for (let i = 0; i < pips; i++) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x - (pips - 1) * 3 + i * 6, y - h - 6, 2, 0, 7); ctx.fill(); }
  }
  const WAR_BLIMP = { body: '#7cf2ff', band: '#2f8cff', mark: '✦' };
  function eyes(x, y, gap, r, look, pupil = '#1b1f33') {
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x - gap, y, r, 0, 7); ctx.arc(x + gap, y, r, 0, 7); ctx.fill();
    ctx.fillStyle = pupil; ctx.beginPath(); ctx.arc(x - gap + look, y + r * 0.3, r * 0.5, 0, 7); ctx.arc(x + gap + look, y + r * 0.3, r * 0.5, 0, 7); ctx.fill();
  }
  function drawSnail(f) {
    const d = f.dir, flash = f.flash > 0;
    if (f.shelf) { ctx.fillStyle = '#7a4a1e'; rr(14, f.y + 13, W - 28, 7, 3); ctx.fill(); }
    ctx.fillStyle = flash ? '#ffffff' : '#e8c98a'; rr(f.x - 16, f.y + 4, 32, 9, 4); ctx.fill();
    ctx.beginPath(); ctx.ellipse(f.x + d * 15, f.y - 2, 5, 8, d * 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = flash ? '#ffffff' : '#c8874a'; ctx.beginPath(); ctx.arc(f.x - d * 3, f.y - 2, 11, 0, 7); ctx.fill();
    ctx.strokeStyle = '#7a4a1e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x - d * 3, f.y - 2, 6, 0, 5); ctx.stroke();
    ctx.strokeStyle = '#e8c98a'; ctx.beginPath(); ctx.moveTo(f.x + d * 14, f.y - 8); ctx.lineTo(f.x + d * 12, f.y - 17); ctx.moveTo(f.x + d * 18, f.y - 8); ctx.lineTo(f.x + d * 20, f.y - 17); ctx.stroke();
    ctx.fillStyle = '#1b1f33'; ctx.beginPath(); ctx.arc(f.x + d * 12, f.y - 18, 2, 0, 7); ctx.arc(f.x + d * 20, f.y - 18, 2, 0, 7); ctx.fill();
  }
  function drawPinata(f) {
    const flash = f.flash > 0, col = (c) => (flash ? '#ffffff' : c);
    ctx.strokeStyle = '#c9d0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W / 2, HUD_H); ctx.lineTo(f.x, f.y - 18); ctx.stroke();
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(Math.sin(f.t * 1.3) * 0.25); ctx.scale(1.25, 1.25);
    RAINBOW.forEach((c, i) => { ctx.fillStyle = col(c); ctx.fillRect(-32 + i * 8, -18, 8, 36); });
    ctx.fillStyle = col('#ff7ad9'); rr(24, -40, 26, 26, 6); ctx.fill();
    ctx.fillStyle = col('#ffe066'); ctx.fillRect(30, -52, 6, 14); ctx.fillRect(40, -52, 6, 14);
    ctx.fillStyle = col('#5ef0ff'); for (const lx of [-28, -14, 8, 22]) ctx.fillRect(lx, 18, 7, 16);
    ctx.fillStyle = '#1b1f33'; ctx.beginPath(); ctx.arc(40, -30, 3, 0, 7); ctx.fill();
    ctx.restore();
  }
  function drawBumper(f) {
    ctx.globalCompositeOperation = 'lighter'; glow(f.x, f.y, f.r * (f.lit ? 2.4 : 1.6), f.lit ? '#ffd23f' : '#5ef0ff', f.lit ? 0.6 : 0.25);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    const r = f.r * (f.flash > 0 ? 1.15 : 1);
    ctx.fillStyle = f.lit ? '#ffd23f' : '#1d2a52'; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = f.lit ? '#fff6c0' : '#5ef0ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, r - 2, 0, 7); ctx.stroke();
    ctx.fillStyle = f.lit ? '#7a5300' : '#5ef0ff'; ctx.font = 'bold 18px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', f.x, f.y + 1);
  }
  function drawFoes(t) {
    for (const f of G.foes) {
      const d = FOE[f.type], wob = Math.sin(f.t * 4) * 1.5;
      ctx.fillStyle = f.flash > 0 ? '#ffffff' : d.color;
      if (f.type === 'snail') { drawSnail(f); continue; }
      if (f.type === 'pinata') { drawPinata(f); continue; }
      if (f.type === 'bumper') { drawBumper(f); continue; }
      if (f.type === 'blimp') {
        drawBlimp(f.x, f.y, f.r, f.dir, BLIMPS[f.kind], f.flash > 0, f.hp);
        if (f.kind === 'windbag' && f.flash <= 0) {
          eyes(f.x, f.y - f.r * 0.1, f.r * 0.32, f.r * 0.16, clamp((paddle.x - f.x) / 60, -3, 3));
          ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x + f.r * 0.32, f.y - f.r * 0.1, f.r * 0.22, 0, 7); ctx.stroke();
        }
        continue;
      }
      if (f.type === 'drifter' || f.type === 'splitter') {
        ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r + wob, f.r - wob, 0, 0, 7); ctx.fill();
        if (f.type === 'splitter') { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(f.x, f.y - f.r + 3); ctx.lineTo(f.x, f.y + f.r - 3); ctx.stroke(); ctx.setLineDash([]); }
      } else if (f.type === 'shooter') {
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
      } else if (f.type === 'bomber') {
        // the warning: it blinks white before the dive
        if (!f.dive && f.cd < 0 && Math.sin(f.t * 40) > 0) ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(f.x - f.r, f.y - 2); ctx.lineTo(f.x - f.r - 8, f.y - 9); ctx.lineTo(f.x - 3, f.y - 7); ctx.moveTo(f.x + f.r, f.y - 2); ctx.lineTo(f.x + f.r + 8, f.y - 9); ctx.lineTo(f.x + 3, f.y - 7); ctx.fill();
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(f.x, f.y - f.r - 2, 2.5, 0, 7); ctx.fill();
      }
      if (f.type !== 'mender') {
        const ey = f.type === 'thief' ? f.y - 2 : f.y - 3;
        ctx.fillStyle = f.type === 'thief' ? '#ffe066' : '#ffffff';
        ctx.beginPath(); ctx.arc(f.x - 4, ey, 2.6, 0, 7); ctx.arc(f.x + 4, ey, 2.6, 0, 7); ctx.fill();
        if (f.type !== 'thief') { ctx.fillStyle = '#1b1f33'; ctx.beginPath(); ctx.arc(f.x - 4, ey + 0.8, 1.2, 0, 7); ctx.arc(f.x + 4, ey + 0.8, 1.2, 0, 7); ctx.fill(); }
      }
      if (G.fx.freeze > 0 || f.frozenT > 0) { ctx.fillStyle = 'rgba(168,230,255,0.5)'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r + 3, 0, 7); ctx.fill(); }
      if (f.hp < f.maxhp) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(f.x - 12, f.y - f.r - 8, 24, 3);
        ctx.fillStyle = d.color; ctx.fillRect(f.x - 12, f.y - f.r - 8, 24 * Math.max(0, f.hp / f.maxhp), 3);
      }
    }
    drawLasers(t);
    drawBoss(t);
    for (const s of G.eshots) {
      if (s.k === 'curse') {
        ctx.fillStyle = '#7a0f1e'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
        ctx.fillStyle = '#ff5c5c'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r - 2, 0, 7); ctx.fill();
        ctx.fillStyle = '#3a0008'; ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('☠', s.x, s.y + 1);
      } else if (s.k === 'sock') {
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.t * 5);
        ctx.font = '20px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🧦', 0, 0);
        ctx.restore();
      } else if (s.k === 'paper') {
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.sin(s.t * 6) * 0.5);
        ctx.fillStyle = '#f4f6ff'; ctx.fillRect(-7, -9, 14, 18);
        ctx.fillStyle = '#9aa6c9'; for (let i = 0; i < 3; i++) ctx.fillRect(-4, -5 + i * 4, 8, 1.5);
        ctx.fillStyle = '#ff5c5c'; ctx.fillRect(-4, 6, 5, 1.5);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(156,255,87,0.35)'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 4, 0, 7); ctx.fill();
        ctx.fillStyle = '#9cff57'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
      }
    }
  }
  function drawLasers(t) {
    for (const l of G.lasers) {
      if (l.warn > 0) {
        ctx.fillStyle = `rgba(255,42,77,${0.1 + 0.12 * (Math.sin(t * 30) > 0 ? 1 : 0)})`; ctx.fillRect(l.x - l.w / 2, HUD_H, l.w, H - HUD_H);
        ctx.fillStyle = '#ff2a4d'; ctx.font = 'bold 20px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', l.x, PADDLE_Y - 40);
      } else {
        const k = clamp(l.fire / 0.45, 0, 1);
        ctx.fillStyle = `rgba(255,42,77,${0.75 * k})`; ctx.fillRect(l.x - l.w / 2, HUD_H, l.w, H - HUD_H);
        ctx.fillStyle = `rgba(255,255,255,${k})`; ctx.fillRect(l.x - l.w / 6, HUD_H, l.w / 3, H - HUD_H);
      }
    }
  }
  function drawBoss(t) {
    const B = G.boss;
    if (!B || B.dead) return;
    const x = B.x - B.w / 2, y = B.y, hot = B.phase === 3, look = clamp((paddle.x - B.x) / 60, -3, 3);
    const frozen = G.fx.freeze > 0, body = (c) => (B.flash > 0 ? '#ffffff' : frozen ? '#a8e6ff' : c);
    ctx.globalCompositeOperation = 'lighter'; glow(B.x, y + B.h / 2, B.w * 0.75, hot ? '#ff2a4d' : '#ffd23f', 0.3 + 0.1 * Math.sin(t * 5), 60);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (B.kind === 1) {
      const flip = B.state === 'rest';
      if (flip) { ctx.save(); ctx.translate(0, 2 * y + B.h); ctx.scale(1, -1); }
      ctx.fillStyle = body('#c8874a'); rr(x, y, B.w, B.h, 8); ctx.fill();
      ctx.strokeStyle = '#7a4a1e'; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + B.w - 6, y + B.h - 6); ctx.moveTo(x + B.w - 6, y + 6); ctx.lineTo(x + 6, y + B.h - 6); ctx.stroke();
      rr(x + 1.5, y + 1.5, B.w - 3, B.h - 3, 7); ctx.stroke();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(x + 40, y); ctx.lineTo(x + 52, y - 16); ctx.lineTo(x + 75, y - 4); ctx.lineTo(x + 98, y - 16); ctx.lineTo(x + 110, y); ctx.fill();
      eyes(B.x, y + 22, 22, 8, look, hot ? '#ff2a4d' : '#1b1f33');
      if (flip) ctx.restore();
    } else if (B.kind === 2) {
      ctx.fillStyle = '#3d4760'; for (const ox of [-55, 55]) { rr(B.x + ox - 9, y + B.h - 6, 18, 20, 4); ctx.fill(); }
      ctx.fillStyle = body('#8a9bb8'); rr(x, y, B.w, B.h, 12); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x + 10, y + 4, B.w - 20, 5);
      ctx.fillStyle = '#26303f'; for (const ox of [-66, 66]) { ctx.beginPath(); ctx.arc(B.x + ox, y + 12, 3, 0, 7); ctx.fill(); }
      eyes(B.x, y + 24, 20, 8, look, hot ? '#ff2a4d' : '#1b1f33');
    } else if (B.kind === 3) {
      ctx.fillStyle = '#2b1a40'; ctx.fillRect(x + 8, y - 4, B.w - 16, 6);
      ctx.fillStyle = '#ffd23f'; rr(x + 24, y - 24, B.w - 48, 22, 4); ctx.fill();
      ctx.fillStyle = '#7a5300'; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', B.x, y - 12);
      ctx.fillStyle = body('#d4a5ff'); rr(x, y, B.w, B.h, 14); ctx.fill();
      eyes(B.x, y + 20, 20, 8, look, hot ? '#ff2a4d' : '#1b1f33');
      // a moustache
      ctx.fillStyle = '#2b1a40'; ctx.beginPath(); ctx.ellipse(B.x - 11, y + 36, 12, 4, -0.25, 0, 7); ctx.ellipse(B.x + 11, y + 36, 12, 4, 0.25, 0, 7); ctx.fill();
    } else if (B.kind === 4) {
      const wob = Math.sin(t * 6) * 5;
      ctx.fillStyle = body('#7ee05a'); ctx.beginPath(); ctx.ellipse(B.x, y + B.h / 2 + 4, B.w / 2 + wob, B.h / 2 - wob * 0.6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(B.x - 22, y + 16, 22, 7, -0.3, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(B.x - 22, y + 6); ctx.lineTo(B.x - 16, y - 12); ctx.lineTo(B.x - 6, y); ctx.lineTo(B.x, y - 16); ctx.lineTo(B.x + 6, y); ctx.lineTo(B.x + 16, y - 12); ctx.lineTo(B.x + 22, y + 6); ctx.fill();
      eyes(B.x, y + 30, 20, 9, look, hot ? '#ff2a4d' : '#1b1f33');
      ctx.strokeStyle = '#1e5a12'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(B.x, y + 44, 10, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    } else {
      if (B.state === 'tractor') {
        ctx.fillStyle = `rgba(126,224,255,${0.18 + 0.08 * Math.sin(t * 20)})`;
        ctx.beginPath(); ctx.moveTo(B.x - 24, y + B.h); ctx.lineTo(B.x + 24, y + B.h); ctx.lineTo(B.x + 70, PADDLE_Y); ctx.lineTo(B.x - 70, PADDLE_Y); ctx.fill();
      }
      ctx.fillStyle = frozen ? '#a8e6ff' : '#bfe9ff'; ctx.beginPath(); ctx.ellipse(B.x, y + 14, 40, 22, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = body('#9aa6c9'); ctx.beginPath(); ctx.ellipse(B.x, y + 26, B.w / 2, 18, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#5d6b80'; ctx.beginPath(); ctx.ellipse(B.x, y + 34, B.w / 2 - 14, 9, 0, 0, Math.PI); ctx.fill();
      for (let i = 0; i < 5; i++) { ctx.fillStyle = Math.floor(t * 4 + i) % 2 ? '#ffd23f' : '#ff5c5c'; ctx.beginPath(); ctx.arc(B.x - 60 + i * 30, y + 28, 4, 0, 7); ctx.fill(); }
      eyes(B.x, y + 6, 12, 6, look * 0.7, hot ? '#ff2a4d' : '#1b1f33');
      // glasses
      ctx.strokeStyle = '#1b1f33'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(B.x - 12, y + 6, 8, 0, 7); ctx.moveTo(B.x + 20, y + 6); ctx.arc(B.x + 12, y + 6, 8, 0, 7); ctx.stroke();
    }
    if (!B.talk) return;
    ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(B.talk.s).width + 18, bx = clamp(B.x, tw / 2 + 6, W - tw / 2 - 6), by = y + B.h + 22;
    ctx.globalAlpha = Math.min(1, B.talk.t * 3);
    ctx.fillStyle = '#ffffff'; rr(bx - tw / 2, by - 12, tw, 24, 10); ctx.fill();
    ctx.beginPath(); ctx.moveTo(B.x - 6, by - 11); ctx.lineTo(B.x, by - 20); ctx.lineTo(B.x + 6, by - 11); ctx.fill();
    ctx.fillStyle = '#1b1f33'; ctx.fillText(B.talk.s, bx, by + 1);
    ctx.globalAlpha = 1;
  }

  // ---------- level end ----------
  function finishLevel() {
    for (const c of G.coins) collectCoin(c);
    G.coins = [];
    if (G.safari) {
      const record = G.levelCoins > (run.safariBest || 0);
      if (record) run.safariBest = G.levelCoins;
      lastSummary = { safari: G.safari, picked: G.levelCoins, popped: G.popped, record };
      run.fever = G.fever0;
      saveRun(); showTally(); return;
    }
    const lvl = run.level, late = G.timeUp, timed = clockOn();
    // one star each for: clearing, beating the clock, losing no ball
    const stars = 1 + (G.clock <= G.par ? 1 : 0) + (G.flawless ? 1 : 0);
    const clear = Math.round((15 + lvl * 4) * COIN_MULT * levelVal() * (1 + 0.15 * lv('bounty')));
    const speed = timed ? Math.round(clear * clamp(1 - G.clock / G.par, 0, 1)) : 0;
    const starPay = Math.round(stars * (3 + lvl) * levelVal());
    const heatBonus = Math.round((clear + speed + starPay) * (heatPay() - 1));
    // a level that ends after the clock pays no bonus
    const pay = late ? { bonus: 0, speed: 0, starBonus: 0, heatBonus: 0 } : { bonus: clear, speed, starBonus: starPay, heatBonus };
    run.coins += pay.bonus + pay.speed + pay.starBonus + pay.heatBonus;
    const pl = lv('piggy');
    const interest = pl && !late ? Math.min(Math.floor(run.coins * 0.05 * pl), piggyCap() * pl) : 0;
    const bonds = bondPay(lv('bonds'));
    const betWon = run.bet && !late && G.clock <= G.par / 2 ? Math.round(run.bet * BET_PAYS) : 0;
    const dare = run.dare ? DARES[run.dare].text : '', darePay = run.dare && DARES[run.dare].done() ? betStake() : 0;
    const insurance = special('bill') && !late ? G.bill : 0;
    // the Back Alley pays the level bonuses a second time
    const alley = run.alley && !late ? pay.bonus + pay.speed + pay.starBonus + pay.heatBonus : 0;
    run.alley = false; run.coins += alley;
    run.coins += interest + bonds + betWon + darePay + insurance;
    run.stats.stars += stars;
    run.star3 = stars === 3 ? run.star3 + 1 : 0;
    sticker('first');
    if (lvl === 10) sticker('boss1');
    if (lvl === LEVELS.length) sticker('landlord');
    if (late) sticker('late');
    if (G.comboBest >= 50) sticker('streak');
    if (run.star3 >= 5) sticker('plumber');
    if (G.lost >= 3) sticker('butter');
    if (G.balls.some((b) => b.chicken)) sticker('chicken');
    if (G.wantedWon) sticker('bounty');
    if (run.stats.foes >= 200) sticker('mash');
    bankStats();
    // heat follows the pace of the player; boss fights do not change it
    let heat = 0;
    if (lvl >= FROM.heat && !G.def.boss) {
      const r = G.clock / G.par, was = run.heat;
      run.heat = clamp(run.heat + heatStep(r * Math.pow(HEAT_BRICKS / Math.max(10, G.brick0), 0.6), late), HEAT_MIN, 99);
      heat = run.heat - was;
    }
    lastSummary = { level: lvl, name: G.def.name, picked: G.levelCoins, ...pay, lost: late ? clear + starPay + heatBonus : 0, interest, bonds, bet: run.bet, betWon, heat, dare, darePay, insurance, alley,
      combo: G.comboBest, streak: G.streakCoins, stars, time: Math.ceil(G.clock), par: G.par, flawless: G.flawless, late, timed, boss: !!G.def.boss };
    run.bet = 0; run.nextSpecial = null; run.wanted = false; run.dare = null; run.odd = null; if (!G.def.boss) run.favourite = false;
    if (run.heat >= 8) sticker('hot');
    run.score += 100 * lvl * stars;
    run.level++;
    if (G.wantedWon) run.wantedWon = (run.wantedWon || 0) + 1;
    run.pendingRelic = (lvl % 5 === 0 || G.wantedWon) && relicChoices().length > 0;
    rollDeals();
    recordBest();
    saveRun();
    showTally();
  }
  function gameOver() {
    mode = 'over'; pauseBtn.style.display = 'none'; A.music(0); A.fever(false); sfx.over();
    bankStats();
    const record = run.level > best.level || run.score > best.score;
    recordBest();
    const keep = Math.floor(run.coins / 2), st = run.stats;
    showOverlay(`<div class="center">
      <h2>Out of balls</h2>
      ${snailBubble('gameOver')}
      ${record ? '<div class="newbest">★ NEW BEST ★</div>' : ''}
      <div class="stat">Reached level <b>${run.level}</b> · Score <b>${run.score}</b></div>
      <div class="stat">Bricks <b>${st.bricks}</b> · Monsters <b>${st.foes}</b> · Stars <b>${st.stars}</b></div>
      <div class="stat">Coins earned <b>${st.coins}</b> · Best streak <b>${st.streak}</b></div>
      <div class="stat">Best: level <b>${best.level}</b> · score <b>${best.score}</b></div>
      ${stickerNote()}
      <div style="height:1.2em"></div>
      <button class="big gold" data-act="continue">Try again (keep upgrades, ${keep} 🪙)</button>
      <button class="big alt" data-act="newrun">New run</button>
      <button class="big alt" data-act="menu">Menu</button>
      <div class="hint">Trying again keeps everything you bought but costs half your coins.</div>
    </div>`);
  }

  // ---------- overlays ----------
  // cls 'see' makes the overlay translucent so the canvas shows through.
  function showOverlay(html, cls = '') { ov.innerHTML = html; ov.className = 'show ' + cls; }
  function hideOverlay() { ov.className = ''; ov.innerHTML = ''; }
  const soundBtns = () => `<div class="pair"><button class="big alt" data-act="mute">Sound: ${muted ? 'off' : 'on'}</button><button class="big alt" data-act="music">Music: ${musicOff ? 'off' : 'on'}</button></div>`;
  const relicIcons = () => RELICS.filter((r) => run.relics[r.id]).map((r) => `<span title="${r.name}: ${r.desc}">${r.icon}</span>`).join('');
  function playMusic() { A.music(feverOn() || (G.boss && !G.boss.dead) ? 2 : 1); }

  function showMenu() {
    mode = 'menu'; pauseBtn.style.display = 'none'; G = null; A.music(0); A.fever(false);
    const saved = loadRun();
    showOverlay(`<div class="center">
      <div class="logo">BRICK<br>BAZAAR</div>
      <div class="tag">Smash bricks. Grab coins. Shop for silly hardware.</div>
      ${snailBubble('menu')}
      ${saved ? `<button class="big gold" data-act="resume">Continue · level ${saved.level} · ${saved.coins} 🪙</button>` : ''}
      <button class="big" data-act="newrun">${saved ? 'New run' : 'Play'}</button>
      ${stickerCount() ? `<button class="big alt" data-act="album">📒 Sticker album ${stickerCount()}/${STICKERS.length}</button>` : ''}
      ${soundBtns()}
      ${meta.bricks ? `<div class="stat life">You have smashed <b>${meta.bricks.toLocaleString('en')}</b> bricks. That is ${brickFact(meta.bricks)}.</div>` : ''}
      ${best.level ? `<div class="stat" style="margin-top:1em">Best: level <b>${best.level}</b> · score <b>${best.score}</b></div>` : ''}
      <div class="hint">Drag or move the mouse to steer · tap or click to launch<br>Right click or Esc pauses. Guns and drones fire on their own. One hand is enough.</div>
    </div>`, 'see');
  }
  function showAlbum() {
    mode = 'album';
    const have = stickerCount();
    const cell = (on, icon, name, text) => `<div class="stk ${on ? 'on' : ''}"><span class="si">${icon}</span><b>${name}</b><i>${text}</i></div>`;
    const cells = STICKERS.map((k) => { const on = !!meta.stickers[k.id]; return cell(on, on ? k.icon : '❔', on ? k.name : '???', k.hint); }).join('');
    const kits = KITS.slice(1).map((k) => cell(have >= k.need, k.icon, k.name, have >= k.need ? k.desc : `Opens at ${k.need} stickers.`)).join('');
    showOverlay(`<div class="shop">
      <div class="shop-head"><div><div class="t">Sticker Album</div><div class="sub">${have} of ${STICKERS.length} · ${meta.blimps} blimps popped · ${meta.wins} campaign${meta.wins === 1 ? '' : 's'} won</div></div></div>
      <div class="items">${cells}<div class="teaser">🧺 Starting kits: stickers open them</div>${kits}</div>
      <div class="shopfoot"><button class="big" data-act="menu">Back</button></div>
    </div>`);
  }
  function showKits() {
    mode = 'kits';
    const have = stickerCount();
    const btns = KITS.filter((k) => have >= k.need).map((k) => `<button class="relic kit" data-kit="${k.id}">
      <span class="ric">${k.icon}</span><span class="rnm">${k.name}</span><span class="rds">${k.desc}</span></button>`).join('');
    showOverlay(`<div class="center"><div class="tally-sub">THE SHED OF JUNK</div><h2>Pick a starting kit</h2>${snailBubble('kits')}<div class="relics">${btns}</div>
      <div class="hint">More stickers open more kits.</div></div>`, 'see');
  }
  function showPause() {
    mode = 'pause'; A.music(0);
    const owned = RELICS.filter((r) => run.relics[r.id]);
    showOverlay(`<div class="center">
      <h2>Paused</h2>
      <div class="stat">Level <b>${run.level}</b> · <b>${run.coins}</b> 🪙 · ${'❤️'.repeat(run.lives)}${run.heat ? ` · ${heatTag()}` : ''}</div>
      ${owned.length ? `<div class="owned">${owned.map((r) => `<div><span>${r.icon}</span> <b>${r.name}</b> ${r.desc}</div>`).join('')}</div>` : ''}
      <div style="height:1em"></div>
      <button class="big" data-act="unpause">Resume</button>
      ${soundBtns()}
      <button class="big alt" data-act="quit">Quit to menu</button>
      <div class="hint">Quitting keeps your run from the last shop visit.</div>
    </div>`);
  }

  const heatTag = () => (run.heat > 0 ? '🌶️ Heat ' : '🧊 Heat ') + run.heat;
  const priceTag = () => { const p = Math.round((priceIndex() - 1) * 100); return Math.abs(p) < 5 ? '' : p > 0 ? ` · 📈 prices +${p}%` : ` · 📉 prices ${p}%`; };
  let shopCat = 'weap';
  function openShop() {
    mode = 'shop'; pauseBtn.style.display = 'none'; A.music(0);
    if (shopLevel !== run.level) { shopLevel = run.level; shopRerolls = 0; }
    shopMsg = ''; haggleArm = false; lastBox = null;
    greet();
    renderShop(false);
  }
  const SHOP_TABS_FROM = 10; // with fewer items than this, the shop is one short list without tabs
  function renderShop(keepScroll, flashId) {
    const prev = ov.querySelector('.items');
    const st = keepScroll && prev ? prev.scrollTop : 0;
    const open = (it) => { const s = itemState(it); return s === 'ok' || s === 'poor'; };
    const fresh = (it) => run.level > 2 && it.at === run.level;
    const stock = ITEMS.filter(unlocked), useTabs = stock.length >= SHOP_TABS_FROM;
    const cats = CATS.filter((c) => stock.some((it) => it.cat === c.id));
    if (!cats.some((c) => c.id === shopCat)) shopCat = cats[0].id;
    const cards = stock.filter((it) => !useTabs || it.cat === shopCat).map((it) => {
      const state = itemState(it);
      const l = it.use ? 0 : lv(it.id);
      const max = maxOf(it);
      const pips = max > 8 ? `<div class="lvl">Level ${l}</div>` : max > 1 ? `<div class="pips">${Array.from({ length: max }, (_, i) => `<span class="pip ${i < l ? 'on' : ''}"></span>`).join('')}</div>` : '';
      const desc = it.desc(l);
      const sale = onSale(it) && open(it);
      let btn;
      if (state === 'locked') btn = `<button class="buy no" disabled>🔒 ${it.reqText || 'Locked'}</button>`;
      else if (state === 'max') btn = `<button class="buy max" disabled>${it.id === 'life' ? 'Full' : it.use ? 'Sold out' : 'Maxed'}</button>`;
      else {
        const verb = l ? 'Upgrade' : 'Buy';
        btn = `<button class="buy ${state === 'ok' ? '' : 'no'}" data-buy="${it.id}">${it.verb && !itemCost(it) ? it.verb : `${it.verb || verb} · ${itemCost(it)} 🪙`}</button>`;
      }
      return `<div class="card ${state === 'locked' ? 'locked' : ''} ${state === 'ok' ? 'can' : ''} ${sale ? 'onsale' : ''} ${flashId === it.id ? 'flash' : ''}">
        ${sale ? '<span class="sale">−30%</span>' : fresh(it) ? '<span class="sale new">NEW</span>' : ''}
        <div class="top"><span class="ic">${it.icon}</span><span class="nm">${it.name}</span></div>
        ${pips}<div class="ds">${desc}</div>${btn}</div>`;
    }).join('');
    const tabs = cats.map((c) => {
      const items = stock.filter((it) => it.cat === c.id);
      const can = items.some((it) => itemState(it) === 'ok'), sale = items.some((it) => onSale(it) && open(it));
      return `<button class="tab ${c.id === shopCat ? 'on' : ''} ${can ? 'can' : ''}" data-cat="${c.id}">${c.name}${sale ? '<i>%</i>' : items.some(fresh) ? '<i>NEW</i>' : ''}</button>`;
    }).join('');
    const later = ITEMS.filter((it) => !unlocked(it)).map((it) => it.at);
    const teaser = later.length ? `<div class="teaser">🔒 More stock arrives after level ${Math.min(...later) - 1}</div>` : '';
    const relics = relicIcons();
    showOverlay(`<div class="shop">
      <div class="shop-head"><div><div class="t">The Bazaar</div><div class="sub">${'❤️'.repeat(run.lives)} · next up: level ${run.level}${run.heat ? ` · ${heatTag()}` : ''}${priceTag()}</div></div><div class="coins ${flashId ? 'bump' : ''}">${run.coins} 🪙</div></div>
      ${relics ? `<div class="relicbar">Relics ${relics}</div>` : ''}
      <div class="keeper"><span class="snail">🐌</span><span class="bubble">${keeper}</span></div>
      ${shopMsg ? `<div class="shopmsg">${shopMsg}${lastBox ? ' <button class="mini" data-act="don">🎲 Double or nothing?</button>' : ''}</div>` : ''}
      ${useTabs ? `<div class="tabs">${tabs}</div>` : '<div class="notabs">Spend your coins on upgrades. They last for the whole run.</div>'}
      <div class="items">${cards}${teaser}</div>
      <div class="shopfoot"><div class="minis">
        <button class="mini" data-act="tip">🫙 Tip ${tipCost()} 🪙</button>
        <button class="mini ${haggleArm ? 'armed' : ''}" data-act="haggle" ${run.haggle && run.haggle.at === run.level ? 'disabled' : ''}>🤝 ${haggleArm ? 'Pick an item' : 'Haggle'}</button>
      </div><button class="big" data-act="next">Start level ${run.level} ▶</button></div>
    </div>`);
    const items = ov.querySelector('.items'); if (items) items.scrollTop = st;
  }
  function startMini() {
    const id = run.pendingMini, stake = lastPaid;
    run.pendingMini = null;
    if (!run.arcade || run.arcade.at !== run.level) run.arcade = { at: run.level };
    run.arcade[id] = true; saveRun();
    mode = 'mini';
    showOverlay('<div class="mghost"></div>');
    window.BBMini.play(id, ov.firstChild, { stake, level: run.level, sfx, say: (key) => snailSay(key), done: (mult) => {
      if (mode !== 'mini') return;
      const win = Math.round(stake * (mult || 0));
      run.coins += win; saveRun();
      if (id === 'shell' && win) sticker('spin');
      quip(win > stake ? 'arcadeWin' : 'arcadeLose');
      shopMsg = win ? `🎪 You won ${win} coins.` : '🎪 The arcade keeps your stake.';
      mode = 'shop'; renderShop(false);
    } });
  }
  function takeRelic(id) {
    run.relics[id] = true; run.pendingRelic = false; saveRun();
    if (Object.keys(run.relics).length >= 8) sticker('hoard');
    sfx.relic(); buzz(30);
    if (run.level === 1) startLevel(); else openShop();
  }

  ov.addEventListener('click', (e) => {
    audio();
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.cat) { shopCat = t.dataset.cat; sfx.tab(); renderShop(false); return; }
    if (t.dataset.buy) {
      const it = ITEM_BY_ID[t.dataset.buy];
      if (haggleArm) { haggle(it); renderShop(true, it.id); return; }
      const ok = buy(it);
      if (ok && run.pendingMini) startMini(); else if (ok && run.pendingSafari) startSafari(); else if (ok && run.pendingRelic) showRelics(); else renderShop(true, ok ? it.id : null);
      return;
    }
    if (t.dataset.relic) { takeRelic(t.dataset.relic); return; }
    if (t.dataset.kit) { beginRun(t.dataset.kit); return; }
    if (t.dataset.fork) { takeFork(t.dataset.fork); return; }
    const act = t.dataset.act;
    if (act === 'newrun') { if (KITS.some((k) => k.need > 0 && stickerCount() >= k.need)) showKits(); else beginRun('none'); }
    else if (act === 'album') showAlbum();
    else if (act === 'tip') { tip(); if (run.pendingRelic) showRelics(); else renderShop(true); }
    else if (act === 'haggle') { haggleArm = !haggleArm; if (haggleArm) quip('haggleArm'); renderShop(true); }
    else if (act === 'don') { doubleOrNothing(); renderShop(true); }
    else if (act === 'resume') {
      run = loadRun(); lastSummary = null;
      if (run.pendingSafari) startSafari();
      else if (run.pendingRelic && relicChoices().length) showRelics();
      else if (run.level === 1) startLevel();
      else openShop();
    }
    else if (act === 'next') { lastSummary = null; startLevel(); }
    else if (act === 'tallynext') afterTally();
    else if (act === 'unpause') { mode = 'play'; hideOverlay(); playMusic(); ach('pause', 'Found the pause button'); heckle('back', 'Welcome back. We did not look.'); }
    else if (act === 'uncrash') {
      mode = 'play'; hideOverlay(); playMusic(); sticker('crash');
      say(W / 2, H * 0.5, '🐌 jk', '#ffffff', 2, true); candyRain();
    }
    else if (act === 'quit') { showMenu(); }
    else if (act === 'menu') { showMenu(); }
    else if (act === 'continue') { run.coins = Math.floor(run.coins / 2); run.lives = 3; saveRun(); startLevel(); }
    else if (act === 'mute') { muted = !muted; store.set(MUTE_KEY, muted); A.setSfx(!muted); t.textContent = 'Sound: ' + (muted ? 'off' : 'on'); }
    else if (act === 'music') { musicOff = !musicOff; store.set(MUSIC_KEY, musicOff); A.setMusic(!musicOff); t.textContent = 'Music: ' + (musicOff ? 'off' : 'on'); }
  });

  // ---------- juice helpers ----------
  const TAU = Math.PI * 2;
  const easeOutBack = (k) => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
  const RAINBOW = ['#ff5c5c', '#ff9a3d', '#ffe066', '#9cff57', '#5ef0ff', '#7c8cff', '#c08cff', '#ff7ad9'];
  const rainbow = (t, o = 0) => RAINBOW[Math.floor(t * 8 + o) % RAINBOW.length];
  // f > 0 lightens toward white, f < 0 darkens toward black
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16), to = f > 0 ? 255 : 0, k = Math.abs(f);
    const ch = (s) => Math.round(((n >> s) & 255) * (1 - k) + to * k);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }
  const hud = { coins: 0, coinPop: 0 };

  function addPart(p) { if (G.parts.length < 900) G.parts.push(p); }
  function burst(x, y, color, n = 8, sp = 160) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = rand(sp * 0.3, sp), T = rand(0.3, 0.65);
      addPart({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: T, T, c: color, s: rand(2, 4) });
    }
  }
  function shards(b) {
    const c = brickColor(b);
    for (let i = 0; i < 7; i++) {
      const T = rand(0.5, 0.9);
      addPart({ k: 'shard', x: b.x + rand(4, b.w - 4), y: b.y + rand(3, b.h - 3), vx: rand(-120, 120), vy: rand(-200, -20), t: T, T, c, s: rand(4, 9), rot: rand(0, TAU), vr: rand(-12, 12) });
    }
  }
  function ring(x, y, rad, color, T = 0.3, lw = 3) { addPart({ x, y, ring: rad, t: T, T, c: color, lw }); }
  function say(x, y, s, c, T = 1, big = false) { G.texts.push({ x, y, s, c, t: T, T, big }); }
  function flashScreen(color, a) { if (a > G.flash) { G.flash = a; G.flashC = color; } }
  function shake(v) { G.shake = Math.min(16, Math.max(G.shake, v)); }
  // Runs fn after t seconds of game time. Timers die with the level.
  function after(t, fn) { G.timers.push({ t, fn }); }
  function runTimers(dt) {
    if (!G.timers.length) return;
    const due = [];
    for (const tm of G.timers) { tm.t -= dt; if (tm.t <= 0) due.push(tm); }
    if (!due.length) return;
    G.timers = G.timers.filter((tm) => tm.t > 0);
    for (const tm of due) tm.fn();
  }
  function setFx(k, dur) { G.fx[k] = Math.max(G.fx[k], dur); G.fxMax[k] = G.fx[k]; }

  // ---------- fever ----------
  // Breaking bricks fills the gauge. A full gauge starts a fever: double coins and double ball damage.
  const feverOn = () => G.feverT > 0;
  const coinMult = () => 1 + (feverOn() ? 1 : 0) + (G.fx.x2 > 0 ? 1 : 0) + (G.balls.some((b) => b.chicken) ? 1 : 0) + (special('night') ? 0.5 : 0);
  function addFever(v) {
    if (feverOn() || G.clearT >= 0 || G.level < FROM.fever) return;
    G.feverIdle = 0;
    run.fever = Math.min(1, run.fever + v * (relic('engine') ? 1.4 : 1));
    if (run.fever >= 1) startFever();
  }
  function startFever() {
    run.fever = 0; G.feverT = G.feverMax = 8 + (relic('engine') ? 4 : 0);
    say(W / 2, H * 0.46, 'FEVER! ×2', '#ffe066', 1.8, true);
    heckle('fever');
    sfx.fever(); sfx.riser(); buzz([30, 40, 30]); flashScreen('#ffe066', 0.35); A.music(2); A.fever(true);
    for (let i = 0; i < 3; i++) after(i * 0.12, () => ring(paddle.x, PADDLE_Y, 260, RAINBOW[i * 2], 0.6, 4));
    if (relic('twinfever')) for (const b of G.balls.slice()) if (!b.stuck) splitBall(b.x, b.y, b.vx, b.vy);
  }
  function updateFever(dt) {
    if (feverOn()) {
      G.feverT -= dt;
      if (G.feverT <= 0) { G.feverT = 0; A.music(G.boss && !G.boss.dead ? 2 : 1); A.fever(false); }
      return;
    }
    G.feverIdle += dt;
    if (G.feverIdle > 5) run.fever = Math.max(0, run.fever - 0.03 * dt);
  }

  // ---------- special bricks and capsules ----------
  function stormStrike() {
    const cands = [];
    for (const k of G.bricks) if (hurtable(k)) cands.push({ x: k.x + k.w / 2, y: k.y + k.h / 2, hit: () => hitBrick(k, gunDmg(2), false) });
    for (const f of G.foes) if (!f.dead && !passive(f)) cands.push({ x: f.x, y: f.y, hit: () => damageFoe(f, gunDmg(2)) });
    if (G.boss && !G.boss.dead) cands.push({ x: G.boss.x + rand(-50, 50), y: G.boss.y + G.boss.h, hit: () => damageBoss(gunDmg(2)) });
    if (!cands.length) return;
    const c = pick(cands);
    G.bolts.push({ pts: [[c.x + rand(-40, 40), HUD_H], [c.x, c.y]], t: 0.22, T: 0.22, c: '#fff6a0' });
    burst(c.x, c.y, '#fff6a0', 6, 160); sfx.zap(); c.hit();
  }
  function zapRow(b) {
    const cy = b.y + b.h / 2, dmg = gunDmg(2 + Math.floor(Math.min(G.level, 50) / 8));
    G.beams.push({ y: cy, t: 0.3 });
    sfx.zap(); sfx.boom(true); flashScreen('#ffe94a', 0.18); shake(5);
    for (const o of G.bricks) if (o.alive && o !== b && o.row === b.row) hitBrick(o, dmg, false);
    for (const f of G.foes) if (!f.dead && Math.abs(f.y - cy) < f.r + 10) damageFoe(f, dmg);
  }
  function splitBall(x, y, vx, vy) {
    const s = ballSpeed(), base = vx == null ? 0 : Math.atan2(vx, -vy);
    for (const d of vx == null ? [-0.6, 0.6] : [0.45]) {
      if (G.balls.length >= MAX_BALLS) break;
      const a = base + d, nb = makeBall(x, y, Math.sin(a) * s, -Math.cos(a) * s);
      nb.pierce = lv('pierce'); G.balls.push(nb);
    }
    ring(x, y, 46, '#ffffff', 0.35); sfx.split();
  }

  function nuke() {
    if (!run.crashed && run.level >= 15) after(0.7, fakeCrash);
    sfx.nuke(); flashScreen('#ffffff', 0.8); shake(16); buzz([60, 30, 120]); G.hitstop = 0.1;
    ring(W / 2, H / 2, 420, '#ff5c5c', 0.7, 6);
    const dmg = Math.round(3 * power());
    for (const k of G.bricks) if (k.alive && k.type !== 'stone') hitBrick(k, dmg, false);
    for (const f of G.foes) damageFoe(f, dmg * 2);
    if (G.boss && !G.boss.dead) damageBoss(Math.ceil(G.boss.maxhp * 0.06));
  }
  function rollDice(x, y) {
    const n = 1 + ((Math.random() * 6) | 0);
    sfx.dice(); say(x, y - 14, `🎲 ${n}: ${['', 'COINS!', 'CAPSULE!', 'BOOM!', 'SPLIT!', 'FEVER!', 'ZAP!'][n]}`, '#ffffff', 1.1);
    if (n === 1) dropCoin(x, y, 6);
    else if (n === 2) G.pus.push({ x, y, vy: 110, k: rollPU() });
    else if (n === 3) explode(x, y, 60, Math.round(3 * power()), '#f4f6ff');
    else if (n === 4) splitBall(x, y);
    else if (n === 5) addFever(0.35);
    else for (let i = 0; i < 4; i++) after(i * 0.12, stormStrike);
  }
  // Streak milestones get a shout.
  const CHEERS = [[10, 'NICE!'], [20, 'GREAT!'], [30, 'AMAZING!'], [45, 'UNSTOPPABLE!'], [60, 'BRICKTASTIC!'], [80, 'LEGENDARY!']];
  function cheer() {
    const i = CHEERS.findIndex(([n]) => n === G.combo);
    if (i < 0 || G.level < FROM.streak) return;
    say(W / 2, H * 0.4, CHEERS[i][1], RAINBOW[(i * 2 + 2) % RAINBOW.length], 1.3, true);
    sfx.cheer(i); flashScreen('#ffffff', 0.12);
  }

  // ---------- relics ----------
  // One of three is offered after every 5th level. Each changes a rule instead of a number.
  const RELICS = [
    { id: 'mirror', icon: '🪞', name: 'Mirror Paddle', desc: 'A ghost paddle copies your moves on the opposite side.' },
    { id: 'chain', icon: '🧨', name: 'Chain Reaction', desc: 'Every brick destroyed by an explosion explodes too.' },
    { id: 'hydra', icon: '🐍', name: 'Hydra Ball', desc: 'Each paddle bounce has a 15% chance to split the ball, up to 5 balls.' },
    { id: 'popcorn', icon: '🍿', name: 'Popcorn', desc: 'A destroyed brick has a 20% chance to pop a neighbour.' },
    { id: 'midas', icon: '👑', name: 'Midas Touch', desc: 'Every 12th brick you break turns another brick to gold.' },
    { id: 'coinshot', icon: '💸', name: 'Coin Cannon', desc: 'Each coin you grab has a 30% chance to fire a free shot.' },
    { id: 'engine', icon: '🔥', name: 'Fever Engine', desc: 'Fever fills 40% faster and lasts 4 seconds longer.' },
    { id: 'aftershock', icon: '🌋', name: 'Aftershock', desc: 'Every 4th paddle bounce launches a free rocket.' },
    { id: 'leech', icon: '🧛', name: 'Brick Leech', desc: 'Every 60 bricks broken restores a life. Full lives pay 15 coins.' },
    { id: 'boomerang', icon: '🪃', name: 'Boomerang', desc: 'A lost ball has a 35% chance to come back from the top.' },
    { id: 'twinfever', icon: '👯', name: 'Fever Twins', desc: 'When a fever starts, every ball splits in two.' },
    { id: 'bombardier', icon: '💣', name: 'Bombardier', desc: 'Gold bricks explode when they break.' },
    { id: 'overload', icon: '🌩️', name: 'Coin Storm', desc: 'Every 30 coins you grab call down 3 lightning strikes.' },
    { id: 'frost', icon: '🧊', name: 'Frostbite', desc: 'A ball hit freezes a monster for 2 seconds.' },
    { id: 'seismic', icon: '🥁', name: 'Seismic Paddle', desc: 'Every 6th paddle bounce cracks every brick.' },
    { id: 'pirate', at: 10, icon: '🏴‍☠️', name: 'Sky Pirates', desc: 'Popping a blimp calls an air strike of 6 bombs.' },
    { id: 'balloons', at: 10, icon: '🎈', name: 'Balloon Party', desc: 'Every 40 bricks you break call a blimp.' },
    { id: 'stopwatch', at: 10, icon: '⏱️', name: 'Stopwatch', desc: 'The clock stops during a fever.' },
    { id: 'bank', icon: '🎱', name: 'Bank Shot', desc: 'Each wall bounce since the paddle adds +100% damage to the next brick hit, up to +300%.' },
    { id: 'spin', icon: '🌀', name: 'Curveball', desc: 'A moving paddle puts spin on the ball, and the ball curves.' },
  ];
  const relic = (id) => !!(run && run.relics[id]);
  function relicChoices() {
    const pool = RELICS.filter((r) => !run.relics[r.id] && (r.at || 0) <= run.level);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, 3);
  }
  function showRelics() {
    mode = 'relic'; pauseBtn.style.display = 'none';
    const cards = relicChoices().map((r, i) => `<button class="relic" data-relic="${r.id}" style="animation-delay:${i * 0.12}s">
      <span class="ric">${r.icon}</span><span class="rnm">${r.name}</span><span class="rds">${r.desc}</span></button>`).join('');
    showOverlay(`<div class="center"><div class="tally-sub">A GIFT FROM THE BAZAAR</div><h2>Pick a relic</h2>${snailBubble('relicPick')}<div class="relics">${cards}</div>
      <div class="hint">Relics last for the whole run.</div></div>`, 'see');
    sfx.relic();
  }
  function relicBricks(b, cx, cy) {
    if (relic('popcorn') && Math.random() < 0.2) {
      const near = G.bricks.filter((o) => o.alive && o.type !== 'stone' && Math.abs(o.col - b.col) + Math.abs(o.row - b.row) === 1);
      if (near.length) { const o = pick(near); after(0.07, () => { burst(o.x + o.w / 2, o.y + o.h / 2, '#fff6c0', 5, 120); hitBrick(o, 2 + lv('dmg'), false); }); }
    }
    if (relic('midas') && run.stats.bricks % 12 === 0) {
      const opts = G.bricks.filter((o) => o.alive && o.type === 'normal' && !o.mimic && !o.wanted);
      if (opts.length) { const o = pick(opts); o.type = 'gold'; o.flash = 0.3; o.punch = 1; ring(o.x + o.w / 2, o.y + o.h / 2, 40, '#ffd23f', 0.4); say(o.x + o.w / 2, o.y - 6, 'MIDAS!', '#ffd23f', 0.9); }
    }
    if (relic('balloons') && run.stats.bricks % 40 === 0 && !G.boss) spawnBlimp();
    if (relic('leech') && run.stats.bricks % 60 === 0) {
      if (run.lives < 6) { run.lives++; sfx.life(); say(cx, cy, '+1 LIFE', '#ff5c8a', 1.2); } else dropCoin(cx, cy, 15, true);
    }
  }

  // ---------- shop deals ----------
  function rollDeals() {
    run.deals = [];
    run.dareOffer = pick(Object.keys(DARES).filter((k) => DARES[k].ok()));
    const next = levelDef(run.level), fixed = next.boss || next.wheel || next.map.some((row) => /[X()]/.test(row));
    run.oddOffer = pick(Object.keys(ODDS).filter((k) => k !== 'flip' || !fixed));
    const stone = levelDef(run.level).map.some((row) => row.includes('X'));
    run.offer = pick(SPECIALS.filter((x) => !(x.open && stone))).id;
    if (run.level < FROM.sales) return;
    const pool = upgradePool();
    for (let i = 0; i < 2 && pool.length; i++) run.deals.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id);
  }

  // ---------- level results ----------
  // The results screen. The button is outside the part that scrolls, so that it is always in view.
  function showTally() {
    mode = 'tally'; pauseBtn.style.display = 'none'; A.music(0); A.fever(false);
    const s = lastSummary;
    const row = (label, v) => (v ? `<div class="trow"><span>${label}</span><b data-count="${v}">0</b></div>` : '');
    const chip = (text, cls = '') => `<div class="chip ${cls}">${text}</div>`;
    const purse = `<div class="trow total"><span>Purse</span><b id="purse" data-count="${run.coins}">0</b></div>`;
    const page = (body) => showOverlay(`<div class="tallyv"><div class="tbody">${body}</div>
      <div class="tfoot"><button class="big gold" data-act="tallynext">${tallyLabel(s)}</button></div></div>`, 'see');
    if (s.safari) {
      page(`<div class="tally-sub">BONUS ROUND</div><div class="tally-title">${BONUS[s.safari].over}</div>
        ${s.record ? '<div class="newbest">★ BEST HAUL ★</div>' : ''}
        <div class="trows">${row(BONUS[s.safari].count, s.popped)}${row('Coins grabbed', s.picked)}${purse}</div>
        ${snailBubble('tallyBonus')}${stickerNote()}`);
      countUp();
      return;
    }
    const parts = [['clear', s.bonus], ['speed', s.speed], ['stars', s.starBonus], ['heat', s.heatBonus], ['piggy', s.interest], ['bonds', s.bonds],
      ['bet', s.betWon], ['dare', s.darePay], ['insurance', s.insurance], ['alley', s.alley]].filter(([, v]) => v);
    const fresh = run.level > 2 ? ITEMS.filter((it) => it.at === run.level) : [];
    const verdict = s.late ? 'tallyLate' : s.boss ? 'tallyBoss' : !s.flawless ? 'tallyClumsy' : s.time < s.par * 0.25 ? 'tallyFast'
      : s.stars === 3 ? 'tallyThree' : s.time > s.par * 0.8 ? 'tallySlow' : 'tallyOk';
    page(`<div class="tally-sub">LEVEL ${s.level} · ${s.name.toUpperCase()}</div>
      <div class="tally-title ${s.late ? 'late' : ''}">${s.late ? "TIME'S UP!" : 'CLEARED!'}</div>
      <div class="stars">${[0, 1, 2].map((i) => `<span class="star ${i < s.stars ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.3}s">★</span>`).join('')}</div>
      <div class="trows">
        ${row('Coins grabbed', s.picked)}${row('Bonus', parts.reduce((a, [, v]) => a + v, 0))}
        ${parts.length > 1 ? `<div class="tparts">${parts.map(([k, v]) => `${k} ${v}`).join(' · ')}</div>` : ''}
        ${s.late ? `<div class="trow lost"><span>Bonus lost to the clock</span><b>−${s.lost}</b></div>` : ''}
        ${purse}
      </div>
      ${snailBubble(verdict)}
      ${s.heat > 0 ? chip(`🌶️ Heat ${run.heat}: tougher bricks, bonuses +${Math.round((heatPay() - 1) * 100)}%`, 'hot') : s.heat < 0 ? chip(`🧊 Heat cools to ${run.heat}: softer bricks`) : ''}
      ${s.bet && !s.betWon ? chip(`🎟️ Speed bet lost: −${s.bet} coins`, 'bad') : ''}
      ${s.dare && !s.darePay ? chip(`🤞 Dare failed: ${s.dare.toLowerCase()}`) : ''}
      ${fresh.length ? chip(`🔓 New in the bazaar: ${fresh.map((it) => `<b>${it.icon} ${it.name}</b>`).join(' · ')}`, 'new') : ''}
      ${stickerNote()}`);
    for (let i = 0; i < s.stars; i++) setTimeout(() => { if (mode === 'tally') sfx.star(i); }, 250 + i * 300);
    countUp();
  }
  function countUp() {
    const els = [...ov.querySelectorAll('[data-count]')], t0 = performance.now();
    function tick(now) {
      if (!els.length || !els[0].isConnected) return;
      let busy = false;
      els.forEach((el, i) => {
        const k = clamp((now - t0 - 500 - i * 220) / 600, 0, 1);
        el.textContent = Math.round(+el.dataset.count * (1 - Math.pow(1 - k, 3)));
        if (k < 1) busy = true;
        if (k > 0 && k < 1) sfx.tick();
      });
      if (busy) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  const tallyLabel = (s) => (s.boss && !s.safariDone ? `Bonus round: ${BONUS[bossBonus(s.level)].name} ▶` : run.pendingRelic ? 'Claim a relic 🎁' : 'To the Bazaar ▶');
  function afterTally() {
    const s = lastSummary;
    if (s && s.level === LEVELS.length && !run.champion) { run.champion = true; meta.wins++; saveMeta(); saveRun(); showVictory(); return; }
    // every boss pays with a bonus round
    if (s && s.boss && !s.safariDone) { s.safariDone = true; startSafari(bossBonus(s.level)); return; }
    if (run.pendingSafari) { startSafari(); return; }
    if (s && !s.safari && !s.forked && !s.boss && s.level >= FORK_FROM && s.level % 3 === 0) { s.forked = true; showFork(); return; }
    if (run.pendingRelic) { showRelics(); return; }
    openShop();
  }
  // From level FORK_FROM, after every third level, the snail offers three ways on.
  const FORK_FROM = 21;
  const FORKS = {
    skip: { icon: '🚪', name: 'The Shortcut', text: () => `Skip level ${run.level}. You get its clear bonus: ${forkPay()} coins.`, line: 'Nobody uses it. It is quite clean.' },
    scenic: { icon: '🌄', name: 'The Scenic Route', text: () => 'A bonus round, right now.', line: 'Slow. Pretty. My kind of road.' },
    alley: { icon: '🕳️', name: 'The Back Alley', text: () => 'The next level has a special of the day and pays its bonus twice.', line: 'I would not. So you should.' },
  };
  const forkPay = () => Math.round((15 + run.level * 4) * COIN_MULT * levelVal());
  function showFork() {
    mode = 'fork';
    // a boss level or a level that gives a relic cannot be skipped
    const open = Object.keys(FORKS).filter((k) => k !== 'skip' || (run.level % 5 !== 0 && !levelDef(run.level).boss));
    const doors = open.map((k) => `<button class="relic kit" data-fork="${k}"><span class="ric">${FORKS[k].icon}</span><span class="rnm">${FORKS[k].name}</span>
      <span class="rds">${FORKS[k].text()}<br><i>🐌 "${FORKS[k].line}"</i></span></button>`).join('');
    showOverlay(`<div class="center"><div class="tally-sub">A FORK IN THE ROAD</div><h2>Which way?</h2><div class="relics">${doors}</div></div>`, 'see');
    sfx.relic();
  }
  function takeFork(k) {
    if (k === 'scenic') { startSafari(pick(BONUS_ORDER)); return; }
    if (k === 'skip') {
      run.coins += forkPay(); run.level++;
      rollDeals(); recordBest();
    } else {
      const stone = levelDef(run.level).map.some((row) => row.includes('X'));
      run.alley = true; run.nextSpecial = pick(SPECIALS.filter((x) => !(x.open && stone))).id;
    }
    saveRun(); sfx.buy(); afterTally();
  }
  function showVictory() {
    mode = 'victory'; sfx.clear();
    const st = run.stats;
    showOverlay(`<div class="center tally">
      <div class="tally-sub">THE AUDIT IS OVER</div>
      <div class="tally-title">THE BAZAAR<br>IS YOURS!</div>
      ${snailBubble('victory')}
      <div class="stat">Score <b>${run.score}</b> · Stars <b>${st.stars}</b>/${LEVELS.length * 3}</div>
      <div class="stat">Bricks smashed <b>${st.bricks}</b> · Monsters popped <b>${st.foes}</b></div>
      <div class="stat">Coins earned <b>${st.coins}</b> · Best streak <b>${st.streak}</b></div>
      <div style="height:1em"></div>
      <button class="big gold" data-act="tallynext">Keep going: Endless ▶</button>
      <div class="hint">Endless levels get tougher forever. A boss returns every 10 levels.</div>
    </div>`, 'see');
  }
  // Fireworks behind the results screen.
  function celebrate(dt) {
    G.celebT -= dt;
    if (G.celebT <= 0) {
      G.celebT = rand(0.25, 0.6);
      const x = rand(50, W - 50), y = rand(HUD_H + 60, H * 0.6), c = pick(RAINBOW);
      burst(x, y, c, 26, 240); ring(x, y, 60, c, 0.5); sfx.firework();
    }
    updateParticles(dt);
  }

  // ---------- drawing ----------
  const sprites = {};
  function sprite(key, w, h, paint) {
    let s = sprites[key];
    if (!s) { s = sprites[key] = document.createElement('canvas'); s.width = w; s.height = h; paint(s.getContext('2d'), w, h); }
    return s;
  }
  function glowSprite(color) {
    return sprite('glow' + color, 64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, color + 'ff'); g.addColorStop(0.4, color + '66'); g.addColorStop(1, color + '00');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    });
  }
  // Soft light blob. color must be #rrggbb. The caller sets the 'lighter' blend mode and resets globalAlpha.
  function glow(x, y, r, color, a = 1, ry = r) {
    ctx.globalAlpha = a; ctx.drawImage(glowSprite(color), x - r, y - ry, r * 2, ry * 2);
  }

  const stars = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.6 + 0.4, v: Math.random() * 10 + 2, p: Math.random() * TAU }));
  const floaters = Array.from({ length: 16 }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, v: 12 + Math.random() * 22, c: BRICK_COLORS[i % BRICK_COLORS.length], r: Math.random() * TAU, vr: rand(-0.4, 0.4), s: 0.6 + Math.random() * 0.9 }));
  let bgCanvas = null, bgKey = -1;
  // Each level gets its own sky. Only cool hues: warm skies hide coins and gold bricks.
  const SKY_HUES = [235, 282, 200, 320, 172, 258, 345, 215, 300, 188];
  function bgSprite() {
    const key = G ? G.level : 0;
    if (bgKey === key) return bgCanvas;
    bgKey = key;
    if (!bgCanvas) { bgCanvas = document.createElement('canvas'); bgCanvas.width = W / 2; bgCanvas.height = H / 2; }
    const x = bgCanvas.getContext('2d'), cw = bgCanvas.width, chh = bgCanvas.height, h = SKY_HUES[key % SKY_HUES.length];
    x.globalCompositeOperation = 'source-over';
    const g = x.createLinearGradient(0, 0, 0, chh);
    g.addColorStop(0, `hsl(${h},55%,15%)`); g.addColorStop(0.6, `hsl(${(h + 25) % 360},60%,8%)`); g.addColorStop(1, `hsl(${(h + 50) % 360},60%,4%)`);
    x.fillStyle = g; x.fillRect(0, 0, cw, chh);
    const rnd = mulberry32(key * 131 + 7);
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const cx = rnd() * cw, cy = rnd() * chh * 0.9, r = 60 + rnd() * 110, hh = (h + rnd() * 50 + 335) % 360;
      const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, `hsla(${hh},80%,45%,0.22)`); rg.addColorStop(1, `hsla(${hh},80%,45%,0)`);
      x.fillStyle = rg; x.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    return bgCanvas;
  }
  function drawBg(t) {
    ctx.drawImage(bgSprite(), 0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    const beat = G && mode === 'play' ? A.beat() : 0; // the stars swell with the music
    for (const s of stars) {
      const y = (s.y + t * s.v) % H;
      ctx.globalAlpha = (0.2 + s.s * 0.2) * (0.65 + 0.35 * Math.sin(t * 2.5 + s.p)); ctx.fillRect(s.x, y, s.s * (1 + beat), s.s * (1 + beat));
    }
    ctx.globalAlpha = 1;
    if (G) return;
    for (const f of floaters) {
      const y = H + 40 - ((f.y + t * f.v) % (H + 80));
      ctx.save(); ctx.translate(f.x + Math.sin(t * 0.5 + f.r) * 14, y); ctx.rotate(f.r + t * f.vr); ctx.scale(f.s, f.s);
      ctx.globalAlpha = 0.5; ctx.drawImage(brickSprite('normal', f.c), -BW / 2, -BH / 2, BW, BH);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  const SS = 3; // brick sprites are painted at 3x so they stay sharp on high-density screens
  function brickSprite(type, col) {
    return sprite('b' + type + col, BW * SS, BH * SS, (c) => {
      c.scale(SS, SS);
      let g = c.createLinearGradient(0, 0, 0, BH);
      g.addColorStop(0, shade(col, 0.4)); g.addColorStop(0.45, col); g.addColorStop(1, shade(col, -0.4));
      if (type === 'prism') { g = c.createLinearGradient(0, 0, BW, 0); RAINBOW.forEach((rc, i) => g.addColorStop(i / (RAINBOW.length - 1), rc)); }
      c.fillStyle = g; rr(0, 0, BW, BH, 5, c); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = 1; rr(0.75, 0.75, BW - 1.5, BH - 1.5, 4.5, c); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.32)'; rr(3, 2, BW - 6, 4.5, 2.2, c); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.2)'; rr(2, BH - 5, BW - 4, 3.5, 1.7, c); c.fill();
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const mx = BW / 2, my = BH / 2;
      if (type === 'steel') {
        c.fillStyle = '#5d6b80';
        for (const [dx, dy] of [[5, 5], [BW - 5, 5], [5, BH - 5], [BW - 5, BH - 5]]) { c.beginPath(); c.arc(dx, dy, 1.6, 0, TAU); c.fill(); }
      } else if (type === 'gold') {
        c.fillStyle = '#7a5300'; c.font = 'bold 14px system-ui, sans-serif'; c.fillText('$', mx, my + 1);
      } else if (type === 'bomb') {
        c.fillStyle = '#2b0b10'; c.beginPath(); c.arc(mx - 1, my + 1, 6.5, 0, TAU); c.fill();
        c.strokeStyle = '#2b0b10'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(mx + 3, my - 4); c.quadraticCurveTo(mx + 7, my - 9, mx + 10, my - 5); c.stroke();
        c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(mx + 10, my - 5, 2.2, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.arc(mx - 3, my - 1, 1.8, 0, TAU); c.fill();
      } else if (type === 'stone') {
        c.strokeStyle = '#2c3045'; c.lineWidth = 1.5; c.beginPath();
        c.moveTo(8, 4); c.lineTo(16, 12); c.lineTo(12, 17); c.moveTo(30, 3); c.lineTo(34, 10); c.stroke();
      } else if (type === 'hive') {
        c.fillStyle = 'rgba(30,5,50,0.6)';
        for (const dx of [-12, 0, 12]) { c.beginPath(); c.arc(mx + dx, my + 0.5, 4.5, 0, TAU); c.fill(); }
      } else if (type === 'volt') {
        c.fillStyle = '#3a2a00'; c.beginPath();
        c.moveTo(mx + 2, my - 8); c.lineTo(mx - 5, my + 1); c.lineTo(mx - 1, my + 1); c.lineTo(mx - 3, my + 8); c.lineTo(mx + 5, my - 2); c.lineTo(mx + 1, my - 2);
        c.closePath(); c.fill();
      } else if (type === 'prism') {
        c.fillStyle = 'rgba(255,255,255,0.92)'; c.beginPath();
        c.moveTo(mx, my - 7); c.lineTo(mx + 7, my); c.lineTo(mx, my + 7); c.lineTo(mx - 7, my); c.closePath(); c.fill();
      } else if (type === 'mystery') {
        c.fillStyle = '#4a0f3a'; c.font = 'bold 15px system-ui, sans-serif'; c.fillText('?', mx, my + 1);
      } else if (type === 'tnt') {
        c.fillStyle = '#5a1500'; c.font = 'bold 11px system-ui, sans-serif'; c.fillText('TNT', mx, my + 1);
      } else if (type === 'chest') {
        c.fillStyle = '#ffd23f'; c.fillRect(1, my - 2, BW - 2, 4);
        c.fillStyle = '#5a3b00'; c.beginPath(); c.arc(mx, my, 3.5, 0, TAU); c.fill();
      } else if (type === 'pinata') {
        RAINBOW.forEach((rc, i) => { c.fillStyle = rc; c.fillRect(3 + i * 4.75, 3, 4.75, BH - 6); });
        c.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 7; i++) c.fillRect(4 + i * 5.5, BH - 6, 3, 3);
      } else if (type === 'dice') {
        c.fillStyle = '#1b1f33';
        for (const [dx, dy] of [[-9, -4], [9, -4], [0, 0], [-9, 4], [9, 4]]) { c.beginPath(); c.arc(mx + dx, my + dy + 0.5, 2, 0, TAU); c.fill(); }
      }
    });
  }
  // 1854 -> 1.9k, so that a number fits on a brick
  const short = (n) => (n < 1000 ? n : n < 10000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n / 1000) + 'k');
  const CRACKS = [[[8, 0], [13, 7], [9, 12], [15, 20]], [[32, 0], [27, 8], [33, 13], [29, 20]], [[0, 9], [10, 11], [20, 8], [30, 12], [44, 10]]];
  const INTRO = 0.35; // seconds a brick takes to drop into place
  function drawBricks(t) {
    const wh = G.def.wheel, dance = feverOn() ? A.beat() * 0.06 : 0; // in a fever the bricks pulse with the music
    if (wh) {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2; ctx.beginPath();
      for (const b of G.bricks) if (b.alive && b.wheel != null) { ctx.moveTo(wh.x, wh.y); ctx.lineTo(b.x + b.w / 2, b.y + b.h / 2); }
      ctx.stroke();
    }
    ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const b of G.bricks) {
      if (!b.alive) continue;
      const it = (G.time - b.delay) / INTRO;
      if (it <= 0) continue;
      const oy = it < 1 ? -(1 - easeOutBack(it)) * 46 : 0;
      const sc = 1 + b.punch * 0.16 + dance, w = b.w * sc, h = b.h * sc, cx = b.x + b.w / 2, cy = b.y + b.h / 2 + oy;
      ctx.globalAlpha = it < 1 ? Math.min(1, it * 2) : 1;
      ctx.drawImage(brickSprite(b.type, brickColor(b)), cx - w / 2, cy - h / 2, w, h);
      if (b.type === 'runner') {
        const k = Math.sin(b.hop * 18) * 5;
        ctx.strokeStyle = '#1b1f33'; ctx.lineWidth = 2.5; ctx.beginPath();
        ctx.moveTo(cx - 9, cy + h / 2 - 1); ctx.lineTo(cx - 9 + k, cy + h / 2 + 9); ctx.moveTo(cx + 9, cy + h / 2 - 1); ctx.lineTo(cx + 9 - k, cy + h / 2 + 9); ctx.stroke();
      }
      if (b.type === 'runner' || (G.fx.panic > 0 && b.type !== 'stone')) {
        const ball = G.balls[0];
        eyes(cx, cy - 1, 8, 4.5, ball ? clamp((ball.x - cx) / 60, -2.5, 2.5) : 0);
        ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      } else if ((b.type === 'normal' && b.maxhp > 1) || b.type === 'steel' || b.type === 'pinata') {
        ctx.fillStyle = b.type === 'steel' ? '#26303f' : 'rgba(0,0,0,0.45)'; ctx.fillText(short(b.hp), cx, cy + 1);
      }
      if (b.type !== 'stone' && b.hp < b.maxhp) {
        const n = Math.min(3, 1 + Math.floor((1 - b.hp / b.maxhp) * 3));
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.2; ctx.beginPath();
        for (let i = 0; i < n; i++) CRACKS[i].forEach(([px, py], j) => (j ? ctx.lineTo(b.x + px, b.y + oy + py) : ctx.moveTo(b.x + px, b.y + oy + py)));
        ctx.stroke();
      }
      if (b.flash > 0) { ctx.globalAlpha = Math.min(1, b.flash * 8); ctx.fillStyle = '#ffffff'; rr(cx - w / 2, cy - h / 2, w, h, 5); ctx.fill(); }
      if (b.wanted) {
        const left = Math.ceil(WANTED_S - G.clock);
        ctx.globalAlpha = 1; ctx.strokeStyle = Math.sin(t * 10) > 0 ? '#ff2a4d' : '#ffd23f'; ctx.lineWidth = 2.5; rr(b.x - 3, b.y - 3, b.w + 6, b.h + 6, 7); ctx.stroke();
        ctx.fillStyle = left > 0 ? '#ffd23f' : '#8b93b8'; ctx.font = 'bold 10px system-ui, sans-serif'; ctx.fillText(left > 0 ? '🤠 WANTED ' + left : 'too late', cx, b.y - 10);
        ctx.font = 'bold 12px system-ui, sans-serif';
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    for (const b of G.bricks) {
      if (!b.alive || b.type === 'normal' || b.type === 'stone' || b.type === 'steel' || G.time - b.delay < INTRO) continue;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (b.type === 'bomb') glow(cx, cy, 18 + 4 * Math.sin(t * 6 + b.col), '#ff4d5e', 0.5);
      else if (b.type === 'gold') { const ph = (t * 0.7 + b.col * 0.11 + b.row * 0.07) % 2.4; if (ph < 1) glow(b.x + ph * b.w, cy, 12, '#fff6c0', 0.55 * Math.sin(ph * Math.PI)); }
      else if (b.type === 'volt') glow(cx, cy, 16, '#ffe94a', 0.25 + 0.3 * Math.random());
      else if (b.type === 'prism') glow(cx, cy, 18, rainbow(t * 0.5, b.col), 0.4);
      else if (b.type === 'mystery') glow(cx, cy, 16, '#ff7ad9', 0.3 + 0.2 * Math.sin(t * 5 + b.col));
      else if (b.type === 'hive') glow(cx, cy, 14, '#d15cff', 0.2 + 0.4 * clamp(1 - b.spawnT / 9, 0, 1));
      else if (b.type === 'tnt') glow(cx, cy, 22 + 5 * Math.sin(t * 8 + b.col), '#ff8a3d', 0.55);
      else if (b.type === 'chest') glow(cx, cy, 14, '#ffd23f', 0.25 + 0.2 * Math.sin(t * 4 + b.col));
      else if (b.type === 'dice') glow(cx, cy, 14, rainbow(t * 0.4, b.col), 0.35);
      else if (b.type === 'pinata') glow(cx, cy, 18, rainbow(t * 0.8, b.col), 0.4);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  function paddleBody(cx, w, y, top, bot) {
    const x = cx - w / 2, g = ctx.createLinearGradient(0, y, 0, y + PADDLE_H);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.fillStyle = g; rr(x, y, w, PADDLE_H, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; rr(x + 5, y + 2, w - 10, 3, 1.5); ctx.fill();
  }
  function drawPaddle(t) {
    const sq = paddle.squish, w = paddle.w * (1 + sq * 0.1), y = PADDLE_Y + sq * 3, x = paddle.x - w / 2;
    const glue = G.fx.glue > 0, fire = G.fx.fire > 0, stun = G.stun > 0;
    const col = stun ? '#9cff57' : glue ? '#ffe066' : feverOn() ? rainbow(t) : '#5ef0ff';
    ctx.globalCompositeOperation = 'lighter';
    glow(paddle.x, y + PADDLE_H / 2, w * 0.8, col, 0.4, 26);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (relic('mirror')) { ctx.globalAlpha = 0.55; paddleBody(W - paddle.x, paddle.w * 0.7, PADDLE_Y, '#ffd0f5', '#b04aff'); ctx.globalAlpha = 1; }
    if (G.shield > 0) { ctx.strokeStyle = 'rgba(110,231,255,0.6)'; ctx.lineWidth = 2; rr(x - 7, y - 7, w + 14, PADDLE_H + 14, 12); ctx.stroke(); }
    paddleBody(paddle.x, w, y, stun ? '#d8ffb0' : glue ? '#fff3a8' : '#d6fbff', stun ? '#4f9a1e' : glue ? '#e0a800' : '#2f8cff');
    ctx.fillStyle = col; rr(x + 2, y + 4, 4, PADDLE_H - 8, 2); ctx.fill(); rr(x + w - 6, y + 4, 4, PADDLE_H - 8, 2); ctx.fill();
    if (lv('gun_blaster')) { ctx.fillStyle = '#7cf2ff'; ctx.fillRect(x + 3, y - 5, 6, 6); ctx.fillRect(x + w - 9, y - 5, 6, 6); }
    const center = ['laser', 'rocket', 'scatter', 'arc'].filter((g2) => lv('gun_' + g2));
    center.forEach((g2, i) => { ctx.fillStyle = GUNS[g2].color; ctx.fillRect(paddle.x - center.length * 4 + i * 8 + 1, y - 6, 6, 7); });
    if (fire) { ctx.fillStyle = '#ff8a3d'; ctx.fillRect(x + 10, y + PADDLE_H - 3, w - 20, 2); }
    if (G.level >= FROM.sweet && !stun) {
      const sx = clamp(sweetX(), x + 7, x + w - 7), pulse = 0.6 + 0.4 * Math.sin(t * 8);
      ctx.globalCompositeOperation = 'lighter'; glow(sx, y + 2, 12 + G.sweetN * 3, '#fff27a', 0.5 * pulse); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff27a'; rr(sx - 5, y - 3, 10, PADDLE_H + 3, 3); ctx.fill();
      ctx.fillStyle = '#ffffff'; rr(sx - 2, y - 2, 4, PADDLE_H + 1, 2); ctx.fill();
    }
    const ml = lv('magnet');
    if (ml) {
      ctx.strokeStyle = 'rgba(255,216,74,0.12)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(paddle.x, PADDLE_Y, 100 + 45 * ml, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    }
  }
  function ballGlowColor(b, t) {
    return G.fx.fire > 0 ? '#ff8a3d' : G.fx.gold > 0 ? '#ffd23f' : feverOn() ? rainbow(t, b.r0) : b.pierce > 0 ? '#ffb36b' : '#7fe9ff';
  }
  function drawBall(b) {
    const fire = G.fx.fire > 0;
    if (b.chicken) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx) + Math.sin(tAcc * 20) * 0.3);
      const r = b.r * 1.25;
      ctx.fillStyle = '#ffe94a'; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.3, r * 0.85, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 1.25, -r * 0.35, r * 0.55, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff5c5c'; ctx.beginPath(); ctx.arc(r * 1.2, -r * 0.95, r * 0.28, 0, TAU); ctx.arc(r * 1.5, -r * 0.85, r * 0.22, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff9a3d'; ctx.beginPath(); ctx.moveTo(r * 1.7, -r * 0.45); ctx.lineTo(r * 2.25, -r * 0.3); ctx.lineTo(r * 1.7, -r * 0.1); ctx.fill();
      ctx.fillStyle = '#1b1f33'; ctx.beginPath(); ctx.arc(r * 1.4, -r * 0.45, r * 0.12, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = fire ? '#ffe2c0' : '#ffffff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(120,200,255,0.35)'; ctx.beginPath(); ctx.arc(b.x + b.r * 0.25, b.y + b.r * 0.3, b.r * 0.6, 0, TAU); ctx.fill();
    if (b.pierce > 0 && !fire) { ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 1, 0, TAU); ctx.stroke(); }
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
        if (i % 2 === 0) { ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill(); }
      }
    }
  }
  function drawCoin(c) {
    const sx = Math.abs(Math.cos(c.spin));
    ctx.fillStyle = '#a8730a'; ctx.beginPath(); ctx.ellipse(c.x, c.y, 7 * sx + 1, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.ellipse(c.x, c.y, 5.5 * sx + 0.5, 5.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff6c0'; ctx.beginPath(); ctx.ellipse(c.x - 1.5 * sx, c.y - 2, 2 * sx + 0.3, 1.6, 0, 0, TAU); ctx.fill();
    if (c.val > 1 && sx > 0.5) { ctx.fillStyle = '#8a5a00'; ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c.val, c.x, c.y + 0.5); }
  }
  function drawPU(p, t) {
    const d = PU[p.k];
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.sin(t * 6 + p.x) * 0.12);
    ctx.fillStyle = d.c; rr(-16, -10, 32, 20, 10); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; rr(-11, -7.5, 22, 5, 2.5); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.5; rr(-16, -10, 32, 20, 10); ctx.stroke();
    ctx.fillStyle = '#10142c'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(d.l, 0, 1.5);
    ctx.restore();
  }
  function drawDrones(t) {
    for (const d of G.drones) {
      if (d.type === 'orbit') {
        ctx.fillStyle = '#e8f0ff'; ctx.fillRect(d.x - 10, d.y - 1.5, 20, 3);
        ctx.fillStyle = '#9ab8ff'; ctx.beginPath(); ctx.arc(d.x, d.y, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(d.x - 1.5, d.y - 1.5, 2, 0, TAU); ctx.fill();
      } else if (d.type === 'hunter') {
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.ellipse(d.x, d.y, 8, 6, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2b2200'; ctx.fillRect(d.x - 3, d.y - 6, 2, 12); ctx.fillRect(d.x + 2, d.y - 6, 2, 12);
        ctx.globalAlpha = 0.6; ctx.fillStyle = '#e8f6ff';
        const f = Math.sin(t * 50) * 2;
        ctx.beginPath(); ctx.ellipse(d.x - 4, d.y - 8 - f, 5, 3, -0.4, 0, TAU); ctx.ellipse(d.x + 4, d.y - 8 - f, 5, 3, 0.4, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      } else if (d.type === 'collect') {
        ctx.fillStyle = '#7cf2a8'; rr(d.x - 8, d.y - 7, 16, 14, 4); ctx.fill();
        ctx.fillStyle = '#0d2a1c'; ctx.fillRect(d.x - 5, d.y - 3, 3, 3); ctx.fillRect(d.x + 2, d.y - 3, 3, 3);
        ctx.strokeStyle = '#7cf2a8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(d.x, d.y - 7); ctx.lineTo(d.x, d.y - 12); ctx.stroke();
      } else if (d.type === 'war') {
        drawBlimp(d.x, d.y + Math.sin(d.t * 2) * 4, 13, d.dir, WAR_BLIMP, false, 0);
      } else if (d.type === 'ufo') {
        if (d.target && d.beam > 0) {
          ctx.fillStyle = `rgba(126,224,255,${0.25 + 0.2 * Math.sin(t * 30)})`;
          ctx.beginPath(); ctx.moveTo(d.x - 5, d.y - 4); ctx.lineTo(d.x + 5, d.y - 4); ctx.lineTo(d.target.x + d.target.w, d.target.y + d.target.h); ctx.lineTo(d.target.x, d.target.y + d.target.h); ctx.fill();
        }
        ctx.fillStyle = '#bfe9ff'; ctx.beginPath(); ctx.ellipse(d.x, d.y - 3, 7, 6, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#9aa6c9'; ctx.beginPath(); ctx.ellipse(d.x, d.y, 14, 5, 0, 0, TAU); ctx.fill();
        for (let i = 0; i < 3; i++) { ctx.fillStyle = Math.floor(t * 5 + i) % 2 ? '#ffd23f' : '#ff7ad9'; ctx.beginPath(); ctx.arc(d.x - 8 + i * 8, d.y + 1, 1.8, 0, TAU); ctx.fill(); }
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
  function drawSaw(s) {
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.spin);
    ctx.fillStyle = '#dfe6f2'; ctx.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, r = i % 2 ? s.r : s.r * 0.72; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8b93b8'; ctx.beginPath(); ctx.arc(0, 0, s.r * 0.3, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawDuck(s) {
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.sin(s.spin) * 0.5);
    ctx.fillStyle = '#ffe94a'; ctx.beginPath(); ctx.ellipse(0, 2, 10, 7, 0, 0, TAU); ctx.arc(6, -6, 5.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff9a3d'; ctx.beginPath(); ctx.moveTo(10, -7); ctx.lineTo(16, -5); ctx.lineTo(10, -3); ctx.fill();
    ctx.fillStyle = '#1b1f33'; ctx.beginPath(); ctx.arc(7.5, -7.5, 1.2, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawShots() {
    for (const s of G.shots) {
      if (s.k === 'saw') { drawSaw(s); continue; }
      if (s.k === 'duck') { drawDuck(s); continue; }
      if (s.k === 'laser') { ctx.fillStyle = '#ff7cf0'; ctx.fillRect(s.x - 2, s.y - 14, 4, 22); ctx.fillStyle = '#ffffff'; ctx.fillRect(s.x - 0.75, s.y - 12, 1.5, 18); }
      else if (s.k === 'rocket') {
        ctx.fillStyle = '#ffb14a'; rr(s.x - 3.5, s.y - 10, 7, 16, 3); ctx.fill();
        ctx.fillStyle = '#ff5a2a'; ctx.beginPath(); ctx.moveTo(s.x - 3, s.y + 6); ctx.lineTo(s.x, s.y + 12 + Math.random() * 6); ctx.lineTo(s.x + 3, s.y + 6); ctx.fill();
      } else if (s.k === 'scatter') { ctx.fillStyle = '#b9ff6b'; ctx.beginPath(); ctx.arc(s.x, s.y, 2.5, 0, TAU); ctx.fill(); }
      else { ctx.fillStyle = s.k === 'orbit' ? '#9ab8ff' : '#7cf2ff'; ctx.fillRect(s.x - 1.5, s.y - 7, 3, 10); }
    }
    for (const b of G.bolts) {
      ctx.strokeStyle = b.c || '#cfe0ff'; ctx.lineWidth = 2.5; ctx.globalAlpha = clamp(b.t / (b.T || 0.18), 0, 1); ctx.beginPath();
      for (let i = 0; i < b.pts.length - 1; i++) {
        const [x1, y1] = b.pts[i], [x2, y2] = b.pts[i + 1];
        ctx.moveTo(x1, y1);
        for (let j = 1; j < 5; j++) { const f = j / 5; ctx.lineTo(x1 + (x2 - x1) * f + rand(-6, 6), y1 + (y2 - y1) * f + rand(-6, 6)); }
        ctx.lineTo(x2, y2);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (const b of G.beams) {
      const k = b.t / 0.3;
      ctx.globalAlpha = k; ctx.fillStyle = '#ffe94a'; ctx.fillRect(0, b.y - 7 * k, W, 14 * k);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, b.y - 2 * k, W, 4 * k); ctx.globalAlpha = 1;
    }
  }
  // Everything that glows is drawn in one additive pass.
  function drawGlowPass(t) {
    ctx.globalCompositeOperation = 'lighter';
    for (const b of G.balls) {
      const c = ballGlowColor(b, t), n = b.trail.length;
      for (let i = 0; i < n; i += 2) glow(b.trail[i], b.trail[i + 1], b.r * (0.8 + (i / n) * 1.4), c, (i / n) * 0.3);
      glow(b.x, b.y, b.r * 3.2, c, 0.55);
    }
    const plain = Math.ceil(coinVal());
    for (const c of G.coins) if (c.val > plain) glow(c.x, c.y, 16, '#ffd84a', 0.5);
    for (const p of G.pus) glow(p.x, p.y, 26, PU[p.k].c, 0.35 + 0.15 * Math.sin(t * 8 + p.x));
    for (const s of G.shots) glow(s.x, s.y, s.k === 'rocket' ? 16 : 9, s.k === 'orbit' ? '#9ab8ff' : GUNS[s.k].color, 0.6);
    for (const e of G.eshots) glow(e.x, e.y, 16, '#9cff57', 0.5);
    for (const p of G.parts) if (p.k === 'spark') glow(p.x, p.y, p.s * 2.6, p.c, Math.min(1, (p.t / p.T) * 1.6));
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function drawParts() {
    for (const p of G.parts) {
      if (p.ring) {
        ctx.strokeStyle = p.c; ctx.globalAlpha = p.t / p.T; ctx.lineWidth = p.lw || 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.ring * (1 - (p.t / p.T) * 0.6), 0, TAU); ctx.stroke();
      } else if (p.k === 'shard') {
        ctx.globalAlpha = Math.min(1, p.t * 3); ctx.fillStyle = p.c;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s / 1.5); ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawTexts() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const tx of G.texts) {
      const age = (tx.T || tx.t) - tx.t, pop = age < 0.14 ? 0.6 + 0.4 * easeOutBack(age / 0.14) : 1;
      ctx.globalAlpha = Math.min(1, tx.t * 3);
      ctx.font = `bold ${Math.round((tx.big ? 27 : tx.sz || 13) * pop)}px system-ui, sans-serif`;
      ctx.lineWidth = tx.big ? 5 : 3; ctx.strokeStyle = 'rgba(5,6,18,0.75)'; ctx.strokeText(tx.s, tx.x, tx.y);
      ctx.fillStyle = tx.c; ctx.fillText(tx.s, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;
  }
  // Big faint streak counter behind the action.
  function drawCombo(t) {
    if (G.combo < 3 || G.level < FROM.streak) return;
    const pop = G.comboPop, y = 455, next = Math.ceil((G.combo + 1) / STREAK_STEP) * STREAK_STEP;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.1 + pop * 0.18; ctx.fillStyle = feverOn() ? rainbow(t) : '#ffffff';
    ctx.font = `900 ${Math.round(120 * (1 + pop * 0.12))}px system-ui, sans-serif`; ctx.fillText(G.combo, W / 2, y);
    ctx.globalAlpha = 0.32; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.fillStyle = '#ffe680';
    ctx.fillText(`STREAK · +${streakCoins(next)} coins at ${next}`, W / 2, y + 72);
    ctx.globalAlpha = 1;
  }
  function drawNet(t) {
    if (G.net <= 0) return;
    ctx.strokeStyle = '#6ee7ff'; ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 4); ctx.lineWidth = 2;
    ctx.beginPath(); for (let x = 0; x <= W; x += 12) ctx.lineTo(x, NET_Y + Math.sin(x * 0.2 + t * 3) * 2); ctx.stroke();
    ctx.globalAlpha = 0.8; ctx.fillStyle = '#6ee7ff'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    if (!G.safari) ctx.fillText('NET ×' + G.net, W - 8, NET_Y - 10);
    ctx.globalAlpha = 1;
  }

  const FX_HUD = [['wide', 'W'], ['slow', 'S'], ['fire', 'F'], ['glue', 'G'], ['mega', 'B'], ['storm', '⚡'], ['x2', '×2'], ['freeze', '❄'], ['gold', '★'], ['over', 'A']];
  const fxColor = (k) => (PU[k] || PU.ammo).c;
  function drawHUD(t) {
    const g = ctx.createLinearGradient(0, 0, 0, HUD_H);
    g.addColorStop(0, 'rgba(8,10,26,0.94)'); g.addColorStop(1, 'rgba(8,10,26,0.74)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, HUD_H);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    // level dial: the ring drains toward the par time
    const lx = 28, ly = 32, left = clockOn() ? 1 : clamp(1 - G.clock / G.par, 0, 1);
    ctx.fillStyle = '#9aa3d6'; ctx.font = 'bold 9px system-ui, sans-serif'; ctx.fillText('LEVEL', lx, 8);
    ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(lx, ly, 15, 0, TAU); ctx.stroke();
    ctx.strokeStyle = G.crumbling ? (Math.sin(t * 10) > 0 ? '#ffa94d' : '#ff6b3d') : left < 0.25 ? '#ffa94d' : '#5ef0ff';
    ctx.beginPath(); ctx.arc(lx, ly, 15, -Math.PI / 2, -Math.PI / 2 + TAU * (G.crumbling ? 1 : left)); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = `bold ${G.level > 99 ? 11 : 15}px system-ui, sans-serif`; ctx.fillText(G.level, lx, ly + 1);
    // coins and lives
    ctx.textAlign = 'left';
    drawCoin({ x: 70, y: 19, spin: 0, val: 0 });
    ctx.fillStyle = '#ffd84a'; ctx.font = `bold ${Math.round(20 * (1 + hud.coinPop * 0.25))}px system-ui, sans-serif`; ctx.fillText(Math.round(hud.coins), 82, 20);
    ctx.font = '15px system-ui, sans-serif'; ctx.fillStyle = '#ff5c8a'; ctx.fillText('♥'.repeat(Math.max(0, run.lives)), 62, 41);
    if (run.heat) { ctx.font = 'bold 11px system-ui, sans-serif'; ctx.fillStyle = run.heat > 0 ? '#ff9a3d' : '#a8e6ff'; ctx.fillText((run.heat > 0 ? '🌶' : '🧊') + run.heat, 158, 41); }
    // guns: the bar is the clip, or the reload progress in grey
    let ax = 176;
    ctx.font = '13px system-ui, sans-serif';
    for (const gk in GUNS) {
      if (!lv('gun_' + gk)) continue;
      const loading = G.reload[gk] > 0;
      ctx.globalAlpha = loading ? 0.4 : 1; ctx.fillStyle = '#ffffff'; ctx.fillText(GUNS[gk].icon, ax + 2, 15); ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(ax, 25, 24, 3);
      ctx.fillStyle = loading ? '#8b93b8' : GUNS[gk].color;
      ctx.fillRect(ax, 25, 24 * clamp(loading ? 1 - G.reload[gk] / reloadTime(gk) : G.clip[gk] / clipSize(gk), 0, 1), 3);
      ax += 33;
    }
    // active capsules: a dial per effect
    let tx = 204;
    ctx.textAlign = 'center'; ctx.font = 'bold 10px system-ui, sans-serif'; ctx.lineWidth = 2.5;
    for (const [k, l] of FX_HUD) {
      if (G.fx[k] <= 0) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.arc(tx, 40, 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = fxColor(k); ctx.beginPath(); ctx.arc(tx, 40, 9, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(G.fx[k] / (G.fxMax[k] || 1), 0, 1)); ctx.stroke();
      ctx.fillStyle = fxColor(k); ctx.fillText(l, tx, 40.5);
      tx += 23;
    }
    ctx.textAlign = 'left'; ctx.font = 'bold 12px system-ui, sans-serif';
    if (G.shield > 0) { ctx.fillStyle = '#6ee7ff'; ctx.fillText('🛡×' + G.shield, tx - 6, 41); }
    drawClock(t);
    // fever gauge
    if (G.level < FROM.fever) return;
    const fy = HUD_H - 11;
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(0, fy, W, 5);
    if (feverOn()) {
      const fw = W * (G.feverT / G.feverMax), fg = ctx.createLinearGradient(0, 0, W, 0);
      RAINBOW.forEach((c, i) => fg.addColorStop(i / (RAINBOW.length - 1), c));
      ctx.fillStyle = fg; ctx.fillRect(0, fy, fw, 5);
    } else if (run.fever > 0) {
      const fw = W * run.fever;
      ctx.fillStyle = '#ff9a3d'; ctx.fillRect(0, fy, fw, 5);
      ctx.fillStyle = '#fff3c0'; ctx.fillRect(Math.max(0, fw - 4), fy, 4, 5);
    }
  }

  // The clock: a bar that runs down along the bottom of the HUD, and the seconds beside the pause button.
  function drawClock(t) {
    if (!clockOn()) return;
    const y = HUD_H - 6, left = timeLeft(), k = left / G.par, hurry = left <= 10 && G.started;
    const col = G.timeUp ? '#ff2a4d' : k > 0.4 ? '#5ef0ff' : k > 0.2 ? '#ffd23f' : '#ff6b3d';
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(0, y, W, 6);
    ctx.globalAlpha = G.timeUp || hurry ? 0.6 + 0.4 * Math.sin(t * 14) : 1;
    ctx.fillStyle = col; ctx.fillRect(0, y, G.timeUp ? W : W * k, 6);
    ctx.globalAlpha = 1;
    if (!G.timeUp && k > 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(W * k - 3, y - 1, 3, 8); }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = col;
    ctx.font = `bold ${hurry && !G.timeUp ? 16 : 13}px system-ui, sans-serif`;
    ctx.fillText(G.timeUp ? 'NO BONUS' : '⏱ ' + Math.ceil(left), 424, 42);
    ctx.textAlign = 'left';
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
    const y = HUD_H + 3;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; rr(10, y, W - 20, 11, 5); ctx.fill();
    ctx.fillStyle = B.hp < B.maxhp * 0.4 ? '#ff2a4d' : '#ffd23f'; rr(11, y + 1, Math.max(8, (W - 22) * Math.max(0, B.hp / B.maxhp)), 9, 4); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(BOSSES[B.kind].name, W / 2, y + 6);
  }
  function drawBanner(t) {
    if (mode !== 'play') return;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (G.toasts.length) {
      const tt = G.toasts[0], a = Math.min(1, tt.t * 3, (2.6 - tt.t) * 5);
      ctx.font = 'bold 13px system-ui, sans-serif';
      const tw = ctx.measureText(tt.s).width + 26, ty = HUD_H + 4 + 22 * a;
      ctx.globalAlpha = a; ctx.fillStyle = 'rgba(16,18,40,0.92)'; rr(W / 2 - tw / 2, ty - 13, tw, 26, 13); ctx.fill();
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1.5; rr(W / 2 - tw / 2, ty - 13, tw, 26, 13); ctx.stroke();
      ctx.fillStyle = '#ffe680'; ctx.fillText(tt.s, W / 2, ty + 1); ctx.globalAlpha = 1;
    }
    if (G.heckle) {
      const a = Math.min(1, G.heckle.t * 2, (4 - G.heckle.t) * 4);
      ctx.globalAlpha = a; ctx.textAlign = 'left'; ctx.font = 'bold 13px system-ui, sans-serif';
      const tw = ctx.measureText(G.heckle.s).width + 20;
      ctx.fillStyle = '#f4f6ff'; rr(46, H - 62, tw, 28, 12); ctx.fill();
      ctx.fillStyle = '#1b1f33'; ctx.fillText(G.heckle.s, 56, H - 47);
      ctx.font = '26px system-ui, sans-serif'; ctx.fillText('🐌', 8, H - 46);
      ctx.globalAlpha = 1; ctx.textAlign = 'center';
    }
    if (special('bill')) {
      ctx.textAlign = 'right'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.fillStyle = Math.sin(t * 8) > 0 ? '#ff6b8b' : '#ffb0c0';
      ctx.fillText('🧾 BILL: ' + G.bill + ' 🪙', W - 8, HUD_H + 12); ctx.textAlign = 'center';
    }
    if (G.banner > 0) {
      const s = 0.7 + 0.3 * easeOutBack(clamp((3.2 - G.banner) / 0.35, 0, 1));
      ctx.save(); ctx.translate(W / 2, H * 0.55); ctx.scale(s, s); ctx.globalAlpha = Math.min(1, G.banner);
      if (G.def.boss) { ctx.fillStyle = Math.sin(t * 14) > 0 ? '#ff2a4d' : '#ffd23f'; ctx.font = 'bold 18px system-ui, sans-serif'; ctx.fillText('⚠ WARNING ⚠', 0, -44); }
      ctx.fillStyle = '#ffffff'; ctx.font = '900 42px system-ui, sans-serif'; ctx.fillText(G.safari ? G.def.title : 'LEVEL ' + G.level, 0, 0);
      ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 20px system-ui, sans-serif'; ctx.fillText(G.def.name, 0, 34);
      if (G.def.tip) {
        const isNew = G.def.tip.startsWith('NEW');
        ctx.fillStyle = isNew ? '#7cf2ff' : '#c9d0ff'; ctx.font = (isNew ? 'bold 16px' : '15px') + ' system-ui, sans-serif'; wrapText(G.def.tip, 0, 62, 380, 21);
      }
      if (G.special) {
        ctx.fillStyle = '#ff7ad9'; ctx.font = 'bold 17px system-ui, sans-serif'; ctx.fillText("TODAY'S SPECIAL: " + G.special.name, 0, -66);
        ctx.fillStyle = '#ffd0f0'; ctx.font = '14px system-ui, sans-serif'; ctx.fillText(G.special.text, 0, -44);
      }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    if (clockOn() && G.started && G.clearT < 0 && !G.timeUp && timeLeft() <= 5) {
      ctx.globalAlpha = 0.22; ctx.fillStyle = G.safari ? '#ffd23f' : '#ff6b3d'; ctx.font = '900 190px system-ui, sans-serif';
      ctx.fillText(Math.ceil(timeLeft()), W / 2, H * 0.5); ctx.globalAlpha = 1;
    }
    if (G.level === 1 && !G.started) {
      ctx.fillStyle = 'rgba(124,242,255,' + (0.6 + 0.3 * Math.sin(t * 4)) + ')'; ctx.font = 'bold 15px system-ui, sans-serif';
      const dx = Math.sin(t * 3) * 8;
      ctx.fillText('◀', paddle.x - paddle.w / 2 - 22 - dx, PADDLE_Y + 8); ctx.fillText('▶', paddle.x + paddle.w / 2 + 22 + dx, PADDLE_Y + 8);
    }
    if (G.balls.some((b) => b.stuck && b.serve)) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.55 + 0.35 * Math.sin(t * 5)) + ')'; ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText('tap to launch', W / 2, PADDLE_Y + 50);
    }
  }
  const vignette = () => sprite('vignette', 120, 200, (c) => {
    const g = c.createRadialGradient(60, 100, 50, 60, 100, 125);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
    c.fillStyle = g; c.fillRect(0, 0, 120, 200);
  });

  function drawPortals(t) {
    G.portals.forEach((p, i) => {
      const c = i ? '#7cf2ff' : '#c08cff';
      ctx.globalCompositeOperation = 'lighter'; glow(p.x, p.y, 26, c, 0.5 + 0.2 * Math.sin(t * 6 + i)); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.strokeStyle = c; ctx.lineWidth = 2.5;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(p.x, p.y, 5 + k * 4, t * (3 + k) * (i ? -1 : 1) + k, t * (3 + k) * (i ? -1 : 1) + k + 3.6); ctx.stroke(); }
    });
  }
  function drawWind(t) {
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const x = (((i * 97 + t * G.wind * 1.6) % (W + 80)) + W + 80) % (W + 80) - 40, y = HUD_H + 40 + i * 38;
      ctx.moveTo(x, y); ctx.lineTo(x + G.wind * 0.3, y);
    }
    ctx.stroke();
  }
  // Night Market: the field is dark. The balls, the loot and the special bricks are the only lights.
  const NIGHT_LIGHTS = new Set(['gold', 'bomb', 'tnt', 'volt', 'prism', 'mystery', 'pinata', 'chest', 'dice', 'runner']);
  let nightC = null;
  function drawNight() {
    const top = HUD_H, hgt = PADDLE_Y - 130 - top, k = 0.5;
    if (!nightC) { nightC = document.createElement('canvas'); nightC.width = W * k; nightC.height = Math.ceil(hgt * k); }
    const c = nightC.getContext('2d');
    c.setTransform(k, 0, 0, k, 0, -top * k);
    c.globalCompositeOperation = 'source-over'; c.clearRect(0, top, W, hgt);
    c.fillStyle = 'rgba(3,4,14,0.95)'; c.fillRect(0, top, W, hgt);
    c.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    };
    for (const b of G.balls) hole(b.x, b.y, 95);
    for (const o of G.coins) hole(o.x, o.y, 28);
    for (const o of G.pus) hole(o.x, o.y, 44);
    for (const o of G.shots) hole(o.x, o.y, 26);
    for (const f of G.foes) if (passive(f)) hole(f.x, f.y, f.r * 2.4);
    for (const b of G.bricks) if (b.alive && NIGHT_LIGHTS.has(b.type)) hole(b.x + b.w / 2, b.y + b.h / 2, 36);
    const fade = c.createLinearGradient(0, top + hgt - 70, 0, top + hgt);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = fade; c.fillRect(0, top + hgt - 70, W, 70);
    ctx.drawImage(nightC, 0, top, W, hgt);
  }

  let tAcc = 0;
  function draw(t) {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    drawBg(t);
    if (!G) { ctx.drawImage(vignette(), 0, 0, W, H); return; }
    const playing = mode === 'play';
    ctx.save();
    if (G.shake > 0 && playing) ctx.translate(rand(-G.shake, G.shake) * 0.45, rand(-G.shake, G.shake) * 0.45);
    if (G.cam && G.cam.t > 0 && playing) {
      const z = 1 + 0.3 * Math.sin((G.cam.t / G.cam.T) * Math.PI);
      ctx.translate(G.cam.x, G.cam.y); ctx.scale(z, z); ctx.translate(-G.cam.x, -G.cam.y);
    }
    drawCombo(t);
    if (G.wind) drawWind(t);
    drawBricks(t);
    if (G.portals.length) drawPortals(t);
    drawBirds(t);
    drawNet(t);
    drawAim();
    for (const p of G.pus) drawPU(p, t);
    for (const c of G.coins) drawCoin(c);
    drawShots();
    drawFoes(t);
    if (G.api) ROUNDS[G.safari].draw(G.api, ctx, t);
    if (special('night') && G.clearT < 0) drawNight();
    drawDrones(t);
    if (!(G.api && ROUNDS[G.safari].hidePaddle)) drawPaddle(t);
    drawGlowPass(t);
    for (const b of G.balls) drawBall(b);
    drawParts();
    drawTexts();
    ctx.restore();
    drawHUD(t);
    drawBossBar();
    drawBanner(t);
    if (playing && feverOn()) {
      ctx.globalCompositeOperation = 'lighter';
      const a = Math.min(1, G.feverT) * (0.35 + 0.1 * Math.sin(t * 9));
      glow(0, H / 2, 46, rainbow(t), a, H / 2); glow(W, H / 2, 46, rainbow(t, 4), a, H / 2);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    if (G.flash > 0) { ctx.globalAlpha = Math.min(1, G.flash); ctx.fillStyle = G.flashC; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    ctx.drawImage(vignette(), 0, 0, W, H);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
    tAcc += dt;
    update(dt);
    if (mode === 'tally' && G) celebrate(dt);
    if (run) { hud.coins += (run.coins - hud.coins) * Math.min(1, dt * 12); hud.coinPop = Math.max(0, hud.coinPop - dt * 5); }
    draw(tAcc);
    requestAnimationFrame(frame);
  }

  // debug hook for automated testing (harmless in normal play)
  window.__bb = {
    get mode() { return mode; }, get run() { return run; }, get G() { return G; },
    clear() { if (G) { for (const b of G.bricks) if (b.type !== 'stone') b.alive = false; if (G.boss) G.boss.dead = true; } },
    give(n) { if (run) { run.coins += n; } },
    step(dt) { update(dt); }, draw() { draw(tAcc); },
    paddle, launch() { launch(); },
    buyId(id) { return buy(ITEM_BY_ID[id]); },
    next() { lastSummary = null; startLevel(); },
    skip() { if (mode === 'tally' || mode === 'victory') afterTally(); if (mode === 'relic') takeRelic(relicChoices()[0].id); },
    relic(id) { run.relics[id] = true; }, fever() { startFever(); }, capsule(k) { collectPU({ k, x: paddle.x, y: PADDLE_Y }); },
    blimp(kind) { return spawnBlimp(kind); }, panic() { startPanic(); }, safari(kind) { startSafari(kind); },
    FROM, toughness(n) { return hpMult(n) * heatMult(); },
    shop() { return ITEMS.filter(unlocked).map((it) => ({ id: it.id, state: itemState(it), cost: itemCost(it), level: lv(it.id) })); },
    get summary() { return lastSummary; },
    price() { return priceIndex(); },
  };

  showMenu();
  requestAnimationFrame(frame);
})();
