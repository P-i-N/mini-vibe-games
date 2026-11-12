// Brick Bazaar arcade corner: short stake mini-games. One global: window.BBMini.
(function () {
  'use strict';

  ////////////////////////////////////////////////////////////////////////////
  // Pure models (no DOM). Exposed as BBMini.model so node can simulate them.

  const shuffle = (a, rand) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pick = (a, rand) => a[Math.floor(rand() * a.length)];

  // Shell game: a list of moves. A move maps each slot to its new slot.
  function shellPlan(level, rand) {
    const moves = [];
    const count = Math.min(14, 8 + Math.floor(level / 8));
    const rotChance = Math.min(0.5, 0.3 + level * 0.004);
    for (let i = 0; i < count; i++) {
      if (rand() < rotChance) {
        moves.push(rand() < 0.5 ? [1, 2, 0] : [2, 0, 1]);
        continue;
      }
      const m = [0, 1, 2];
      const a = Math.floor(rand() * 3);
      const b = (a + 1 + Math.floor(rand() * 2)) % 3;
      m[a] = b;
      m[b] = a;
      moves.push(m);
    }
    return { pearl: Math.floor(rand() * 3), moves, ms: Math.max(180, 300 - level * 2) };
  }

  const SHELL_WIN = 2.5;

  // Win chance is proportional to 1 / odds, so every pick has the same expected payout.
  const RACERS = [
    { name: 'Zippy Pip', odds: 2.2, hue: 0, lines: ['zoom!', 'eat my slime', 'full speed. Almost.', 'whoosh'] },
    { name: 'Slimey Sue', odds: 3.5, hue: 140, lines: ['wheee', 'slime time!', 'catch me!', 'la la la'] },
    { name: 'Old Shellby', odds: 5, hue: 220, lines: ['my knees!', 'back in my day…', 'still got it', 'whoa'] },
    { name: 'Sir Dozes', odds: 9, hue: 290, lines: ['is it lunch?', 'huh?', 'five more minutes', 'yawn'] },
  ];
  const raceWeights = RACERS.map(r => 1 / r.odds);
  const raceTotal = raceWeights.reduce((a, b) => a + b, 0);
  const raceChances = raceWeights.map(w => w / raceTotal);

  function raceWinner(rand) {
    let r = rand();
    for (let i = 0; i < raceChances.length; i++) {
      r -= raceChances[i];
      if (r < 0) return i;
    }
    return raceChances.length - 1;
  }

  // Random bursty progress curves, scaled so that only the winner reaches 1.
  function raceCurves(winner, rand, steps) {
    const sleeper = rand() < 0.6 ? Math.floor(rand() * RACERS.length) : -1;
    const sleepFrom = Math.floor(steps * (0.2 + rand() * 0.2));
    const sleepTo = sleepFrom + Math.floor(steps * (0.12 + rand() * 0.12));
    const curves = RACERS.map((_, i) => {
      const raw = [0];
      let pos = 0;
      let speed = 1;
      let burst = 0;
      for (let s = 1; s <= steps; s++) {
        if (--burst <= 0) {
          speed = 0.2 + rand() * 1.8;
          burst = 4 + Math.floor(rand() * 9);
        }
        if (!(i === sleeper && s >= sleepFrom && s < sleepTo)) pos += speed;
        raw.push(pos);
      }
      const end = i === winner ? 1 : 0.8 + rand() * 0.17;
      return raw.map(p => p / pos * end);
    });
    return { curves, sleeper, sleepFrom, sleepTo };
  }

  // Whack-a-Thief: 16 thieves and 3 snails in 12 seconds.
  const WHACK_MS = 12000;
  const WHACK_THIEVES = 16;
  const WHACK_SNAILS = 3;
  const WHACK_TIERS = [[16, 3], [15, 2.5], [14, 2], [12, 1.5], [10, 1], [8, 0.5]];

  function whackPayout(score) {
    for (const [min, mult] of WHACK_TIERS) if (score >= min) return mult;
    return 0;
  }

  function whackPlan(level, rand) {
    const kinds = shuffle([...Array(WHACK_THIEVES).fill('thief'), ...Array(WHACK_SNAILS).fill('snail')], rand);
    const gap = (WHACK_MS - 1600) / kinds.length;
    const show = Math.max(520, 850 - level * 6);
    return kinds.map((kind, i) => ({
      kind,
      at: Math.round(400 + i * gap + (rand() - 0.5) * gap * 0.6),
      show: kind === 'snail' ? 1200 : show,
    }));
  }

  // Normal distribution, mean 0, deviation 1.
  const gauss = rand => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

  // Ping-pong from 0 to 1 and back. Speed in units per ms.
  const pingPong = (ms, speed) => {
    const u = (ms * speed) % 2;
    return u < 1 ? u : 2 - u;
  };

  // Claw machine: the claw sweeps over one prize per column. The grip is lower for big prizes and
  // at the edge of a column.
  const CLAW_COLS = 6;
  const CLAW_EDGE = 0.6;
  const CLAW_PRIZES = [
    { icon: '👢', name: 'an old boot', mult: 0, grip: 0.95 },
    { icon: '🦆', name: 'a rubber duck', mult: 0.5, grip: 0.95 },
    { icon: '🧸', name: 'a teddy', mult: 1.2, grip: 0.95 },
    { icon: '🤖', name: 'a robot', mult: 1.6, grip: 0.75 },
    { icon: '🐌', name: 'a Mortimer plush', mult: 2.5, grip: 0.48 },
    { icon: '💎', name: 'the diamond', mult: 5, grip: 0.25 },
  ];

  function clawPlan(level, rand) {
    return {
      order: shuffle(CLAW_PRIZES.map((_, i) => i), rand),
      speed: Math.min(4, 2.2 + level * 0.03) / 1000,
      wait: 9000,
    };
  }

  // Claw centre in columns (0 is the centre of the first column) after ms.
  const clawPos = (ms, speed) => pingPong(ms, speed / (CLAW_COLS - 1)) * (CLAW_COLS - 1);
  const clawColumn = pos => Math.min(CLAW_COLS - 1, Math.max(0, Math.round(pos)));
  const clawChance = (prize, pos) => prize.grip * (1 - CLAW_EDGE * Math.min(1, Math.abs(pos - clawColumn(pos)) * 2));

  // Higher or Lower: cards 2..14 with replacement. A tie loses. HILO_PAY[k] pays after k + 1 right guesses.
  const HILO_PAY = [1.3, 2, 3.2];
  const hiloDraw = rand => 2 + Math.floor(rand() * 13);
  const hiloWin = (card, next, up) => (up ? next > card : next < card);
  const hiloChance = (card, up) => (up ? 14 - card : card - 2) / 13;

  // Snail curling: two shells. Hold to fill a ping-pong power meter; the shell slides power + ice noise.
  // CURL_RINGS: [distance from the centre, pay]. Past 1 the shell falls off the end.
  const CURL_RINGS = [[0.04, 2], [0.09, 1.2], [0.15, 0.5]];
  const CURL_SHOTS = 2;
  const CURL_ICE = 0.055;

  function curlPlan(level, rand) {
    return {
      targets: Array.from({ length: CURL_SHOTS }, () => 0.6 + rand() * 0.22),
      speed: 1 / Math.max(700, 820 - level * 4),
    };
  }

  const curlSlide = (power, rand) => Math.max(0.05, power + gauss(rand) * CURL_ICE);

  function curlScore(target, at) {
    if (at > 1) return 0;
    const off = Math.abs(at - target);
    for (const [r, mult] of CURL_RINGS) if (off < r) return mult;
    return 0;
  }

  // Scratch & Sniff: a 3x3 card with one sock. Each other cell gets a symbol by weight. Each symbol that shows three
  // or more times on the open cells pays its value; a cash out pays the sum. The sock voids the card. An open cell
  // next to the sock (not diagonal) smells.
  const SCRATCH_SYMBOLS = [
    { icon: '🍄', weight: 4, pay: 0.6 },
    { icon: '🍓', weight: 2, pay: 1 },
    { icon: '💎', weight: 1, pay: 2 },
  ];
  const SCRATCH_SOCK = -1;
  // Eight safe cells hold at most two sets: the two best.
  const SCRATCH_MAX = SCRATCH_SYMBOLS.map(x => x.pay).sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0);

  function scratchPlan(rand) {
    const total = SCRATCH_SYMBOLS.reduce((a, x) => a + x.weight, 0);
    const sock = Math.floor(rand() * 9);
    const cells = Array.from({ length: 9 }, (_, i) => {
      if (i === sock) return SCRATCH_SOCK;
      let r = rand() * total;
      let k = 0;
      while (k < SCRATCH_SYMBOLS.length - 1 && (r -= SCRATCH_SYMBOLS[k].weight) >= 0) k++;
      return k;
    });
    return { sock, cells };
  }

  const scratchNear = (a, b) => Math.abs(a % 3 - b % 3) + Math.abs(Math.floor(a / 3) - Math.floor(b / 3)) === 1;
  const scratchPay = found => Math.round(found.reduce((a, n, k) => a + (n >= 3 ? SCRATCH_SYMBOLS[k].pay : 0), 0) * 100) / 100;

  // Salad Sling: a top view of SLING_W x SLING_H units. The lettuce lands opposite the pull, SLING_REACH times as
  // far, plus wind. One snail customer walks in each row; the far one is small and pays most. Pays the sum of the
  // shots.
  const SLING_W = 300;
  const SLING_H = 340;
  const SLING_FROM = { x: 150, y: 290 };
  const SLING_PULL = 110;
  const SLING_MIN = 14;
  const SLING_REACH = 2.6;
  const SLING_WIND = 9;
  const SLING_SHOTS = 3;
  const SLING_ROWS = [
    { y: 70, r: 11, pay: 0.65 },
    { y: 140, r: 20, pay: 0.35 },
    { y: 210, r: 26, pay: 0.2 },
  ];

  // Speed in track lengths per ms. The far row walks fastest.
  function slingPlan(level, rand) {
    const base = 0.00015 * (1 + level * 0.005);
    return SLING_ROWS.map((row, i) => Object.assign({}, row, {
      speed: base * (1 + 0.3 * (SLING_ROWS.length - 1 - i)),
      phase: rand() * 2,
    }));
  }

  // Mouth centre of a customer after ms. The track leaves room for the snail on the right of the mouth.
  const slingX = (t, ms) => t.r + 8 + pingPong(ms + t.phase / t.speed, t.speed) * (SLING_W - 4 * t.r - 30);

  function slingPull(dx, dy) {
    const k = Math.min(1, SLING_PULL / (Math.hypot(dx, dy) || 1));
    return { x: dx * k, y: dy * k };
  }

  function slingLand(dx, dy) {
    const p = slingPull(dx, dy);
    return { x: SLING_FROM.x - p.x * SLING_REACH, y: SLING_FROM.y - p.y * SLING_REACH };
  }

  const slingFlight = (x, y) => 350 + Math.hypot(x - SLING_FROM.x, y - SLING_FROM.y);

  // The row whose mouth the lettuce lands in, or -1.
  function slingHit(targets, x, y, ms) {
    return targets.findIndex(t => Math.hypot(x - slingX(t, ms), y - t.y) < t.r);
  }

  // Coin Stack: lengths in coin widths. A coin swings over the plate; it lands DROP_MS after the tap. Its offset from
  // the top coin adds tilt, and each landing gives a random kick that grows with the height. The stack falls at a
  // tilt of 1 and pays the last bank point (every third coin). A cash out pays STACK_PAY at the height.
  const STACK_PAY = [0, 0.1, 0.2, 0.35, 0.45, 0.6, 0.8, 0.95, 1.1, 1.3, 1.6, 1.9, 2.3];
  const STACK_MAX = STACK_PAY.length - 1;
  const STACK_BANK = 3;
  const STACK_THICK = 0.23;
  const STACK_RANGE = 1.2;
  const STACK_EDGE = 0.5;
  const STACK_PLATE = 0.9;
  const STACK_GAIN = 1.6;
  const STACK_LEAN = 0.05;
  const STACK_KICK = 0.016;
  const STACK_ANGLE = 0.22;
  const STACK_SWAY = 0.006;
  const STACK_SWAY_MS = 1500;
  const STACK_DROP_MS = 350;

  // Speed in coin widths per ms.
  const stackPlan = level => ({ speed: Math.min(0.0019, 0.0011 + level * 0.000008), wait: 6000 });

  const stackBanked = n => STACK_PAY[n - n % STACK_BANK];
  const stackSpeed = (plan, n) => plan.speed * (1 + 0.05 * n);

  // Swing position after ms on the current coin. side 1 starts on the left, -1 on the right.
  const stackSwing = (plan, n, side, ms) => side * (pingPong(ms, stackSpeed(plan, n) / (2 * STACK_RANGE)) * 2 - 1) * STACK_RANGE;

  // st: { n, tilt, offs, jolt, joltAt }. Angle of the stack in radians at ms (game clock).
  function stackAngle(st, ms) {
    const sway = STACK_SWAY * st.n * Math.sin(ms * 2 * Math.PI / STACK_SWAY_MS);
    const since = ms - st.joltAt;
    const jolt = since < 0 ? 0 : st.jolt * Math.exp(-since / 350) * Math.sin(since / 45);
    return st.tilt * STACK_ANGLE + sway + jolt;
  }

  // Centre of the landing spot (top of the stack) at ms.
  function stackTop(st, ms) {
    const a = stackAngle(st, ms);
    const off = st.n ? st.offs[st.n - 1] : 0;
    return off * Math.cos(a) + (st.n + 0.5) * STACK_THICK * Math.sin(a);
  }

  // Lands a coin dropped at x. Returns 'miss', 'fall' or 'ok' and updates st.
  function stackLand(st, x, ms, rand) {
    const d = x - stackTop(st, ms);
    if (Math.abs(d) > (st.n ? STACK_EDGE : STACK_PLATE)) return 'miss';
    // The plate is flat: the first coin adds no tilt.
    const gain = st.n ? STACK_GAIN : 0;
    st.offs.push((st.n ? st.offs[st.n - 1] : 0) + d);
    st.n++;
    const lean = st.tilt * (1 + STACK_LEAN * st.n);
    st.tilt = lean + d * gain + gauss(rand) * STACK_KICK * st.n * st.n * (0.4 + Math.abs(lean));
    st.jolt = Math.min(0.12, 0.02 + Math.abs(d) * 0.2);
    st.joltAt = ms;
    return Math.abs(st.tilt) >= 1 ? 'fall' : 'ok';
  }

  // Wobbly Wire: Pip walks a wire in legs of WIRE_LEG_MS. The lean is a fraction of the fall angle: at 1 he falls.
  // Gravity tips him more the more he leans, gusts push him, the player pushes back. Each leg has a wind of WIRE_WINDS,
  // shown before the leg. The flag after a leg is safe: float off to cash out its WIRE_PAY, or walk on. A fall pays 0.
  const WIRE_PAY = [0.6, 1.2, 2.5];
  const WIRE_LEG_MS = 5000;
  const WIRE_DT = 15;
  const WIRE_PUSH = 5;
  const WIRE_DRAG = 2.5;
  const WIRE_TIP = 4.1;
  const WIRE_WINDS = [
    { icon: '🌤️', name: 'calm', gust: 1.5 },
    { icon: '💨', name: 'breezy', gust: 3.5 },
    { icon: '🌪️', name: 'stormy', gust: 7 },
  ];
  // The winds that each leg can get, equally likely.
  const WIRE_LEG_WINDS = [[0, 1], [0, 1, 2], [1, 2]];

  function wirePlan(level, rand) {
    return {
      tip: WIRE_TIP * Math.min(1.3, 1 + Math.max(0, level - 46) * 0.004),
      legs: WIRE_LEG_WINDS.map(winds => {
        const wind = pick(winds, rand);
        const gusts = [];
        for (let at = 400 + rand() * 600; at < WIRE_LEG_MS; at += 700 + rand() * 900) {
          gusts.push({ at, ms: 300 + rand() * 500, f: (rand() < 0.5 ? -1 : 1) * WIRE_WINDS[wind].gust * (0.6 + rand() * 0.4) });
        }
        return { wind, gusts, lean: (rand() < 0.5 ? -1 : 1) * (0.15 + rand() * 0.1) };
      }),
    };
  }

  const wireGust = (leg, ms) => leg.gusts.reduce((a, g) => a + (ms >= g.at && ms < g.at + g.ms ? g.f : 0), 0);

  // st: { lean, vel, ms } on the leg. push is -1 (left), 0 or 1. Returns 'fall', 'flag' or 'ok'.
  function wireStep(st, plan, leg, push) {
    const k = WIRE_DT / 1000;
    st.vel += (plan.tip * st.lean + wireGust(leg, st.ms) + push * WIRE_PUSH) * k;
    st.vel *= 1 - WIRE_DRAG * k;
    st.lean += st.vel * k;
    st.ms += WIRE_DT;
    if (Math.abs(st.lean) >= 1) return 'fall';
    return st.ms >= WIRE_LEG_MS ? 'flag' : 'ok';
  }

  ////////////////////////////////////////////////////////////////////////////
  // Session: owns every timer and listener of one game, calls done once.

  function session(host, ctx) {
    const timers = new Set();
    const offs = [];
    let dead = false;
    let called = false;

    const s = {
      get dead() { return dead; },
      later(fn, ms) {
        const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms);
        timers.add(id);
        return id;
      },
      every(fn, ms) {
        const id = setInterval(() => { if (!dead) fn(); }, ms);
        timers.add(id);
        return id;
      },
      clearTimers() {
        timers.forEach(id => { clearTimeout(id); clearInterval(id); });
        timers.clear();
        watch();
      },
      on(el, type, fn) {
        el.addEventListener(type, fn);
        offs.push(() => el.removeEventListener(type, fn));
      },
      sfx(name) {
        try { if (ctx.sfx && typeof ctx.sfx[name] === 'function') ctx.sfx[name](); } catch (e) { /* sound is optional */ }
      },
      say(key) {
        try { return typeof ctx.say === 'function' ? String(ctx.say(key) || '') : ''; } catch (e) { return ''; }
      },
      dispose() {
        dead = true;
        timers.forEach(id => { clearTimeout(id); clearInterval(id); });
        timers.clear();
        offs.forEach(off => off());
        offs.length = 0;
      },
      done(mult) {
        if (called) return;
        called = true;
        s.dispose();
        try { if (typeof ctx.done === 'function') ctx.done(mult); } catch (e) { /* caller error is not ours */ }
      },
    };

    // The host can be removed at any time: stop everything without a payout.
    function watch() {
      s.every(() => { if (!host.isConnected) s.dispose(); }, 400);
    }
    watch();
    return s;
  }

  function el(tag, cls, text, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  // Common screen: title, rules, stake, area, footer with Start / result / Back.
  function frame(host, ctx, info, rand) {
    const s = session(host, ctx);
    const stake = Math.max(0, Number(ctx.stake) || 0);
    host.textContent = '';
    const root = el('div', 'mg-root', null, host);
    const head = el('div', 'mg-head', null, root);
    el('span', 'mg-ic', info.icon, head);
    el('span', 'mg-title', info.name, head);
    const rules = el('div', 'mg-rules', info.rules, root);
    const stakeLine = el('div', 'mg-stake', null, root);
    const area = el('div', 'mg-area mg-game-' + info.id, null, root);
    const foot = el('div', 'mg-foot', null, root);

    const coins = mult => Math.round(stake * mult);
    const api = {
      s, area, rules, rand, stake, coins,
      level: Math.max(1, Number(ctx.level) || 1),
      setWin(text) {
        stakeLine.textContent = '';
        el('span', null, 'Stake ', stakeLine);
        el('b', null, String(stake), stakeLine);
        el('span', null, ' · ' + text, stakeLine);
      },
      finish(mult, text) {
        s.clearTimers();
        foot.textContent = '';
        const won = mult >= 1;
        const res = el('div', 'mg-result' + (won ? ' mg-won' : ''), text + ' ', foot);
        el('b', null, mult > 0 ? '+' + coins(mult) + ' coins' : 'No coins', res);
        const keeper = el('div', 'mg-keeper', null, foot);
        el('span', 'mg-snail', '🐌', keeper);
        const line = s.say(won ? 'arcadeWin' : 'arcadeLose') || (won ? 'Hmph. Take it.' : 'The house thanks you.');
        el('div', 'mg-bubble', line, keeper);
        const back = el('button', 'mg-big mg-gold', 'Back to the Bazaar', foot);
        s.on(back, 'click', () => s.done(mult));
        s.sfx(mult >= 2 ? 'jackpot' : mult >= 1 ? 'coin' : 'nope');
      },
    };
    api.setWin(info.win(coins));

    const intro = s.say('arcade');
    if (intro) {
      const keeper = el('div', 'mg-keeper', null, foot);
      el('span', 'mg-snail', '🐌', keeper);
      el('div', 'mg-bubble', intro, keeper);
    }
    const start = el('button', 'mg-big mg-gold', 'Start', foot);
    s.on(start, 'click', () => {
      foot.textContent = '';
      s.sfx('ding');
      info.run(api);
    });
    return api;
  }

  // Mortimer on the game area. The returned function shows a line and makes him hop.
  function keeper(api) {
    const box = el('div', 'mg-keeper mg-live', null, null);
    api.area.prepend(box);
    const snail = el('span', 'mg-snail', '🐌', box);
    const bubble = el('div', 'mg-bubble', '…', box);
    return text => {
      bubble.textContent = text;
      snail.classList.remove('mg-hop');
      // Read the layout so that the animation starts again.
      void snail.offsetWidth;
      snail.classList.add('mg-hop');
    };
  }

  ////////////////////////////////////////////////////////////////////////////
  // Shell Game

  function prepShell(api) {
    const row = el('div', 'mg-shells', null, api.area);
    return [0, 1, 2].map(i => {
      const shell = el('button', 'mg-shell', null, row);
      shell.style.left = (i * 100 / 3) + '%';
      el('span', 'mg-pearl', null, shell);
      el('span', 'mg-cup', '🐚', shell);
      return shell;
    });
  }

  function runShell(api) {
    const { s, rand, rules } = api;
    const plan = shellPlan(api.level, rand);
    const shells = api.area.querySelectorAll('.mg-shell');
    const slotOf = [0, 1, 2];
    let canPick = false;

    shells.forEach((sh, i) => {
      sh.classList.toggle('mg-has', i === plan.pearl);
      sh.style.setProperty('--mg-d', plan.ms + 'ms');
    });
    rules.textContent = 'Watch the pearl…';
    shells[plan.pearl].classList.add('mg-up');
    s.sfx('ding');

    const step = plan.ms + 90;
    s.later(() => shells[plan.pearl].classList.remove('mg-up'), 1400);
    plan.moves.forEach((move, k) => {
      s.later(() => {
        shells.forEach((sh, i) => {
          const from = slotOf[i];
          const to = move[from];
          slotOf[i] = to;
          sh.style.left = (to * 100 / 3) + '%';
          // Lift one moving shell and dip another so they do not overlap.
          sh.style.transform = to === from ? '' : to > from ? 'translateY(-0.9em)' : 'translateY(0.9em)';
        });
        s.sfx('tick');
      }, 1900 + k * step);
      s.later(() => shells.forEach(sh => { sh.style.transform = ''; }), 1900 + k * step + plan.ms * 0.7);
    });
    s.later(() => {
      canPick = true;
      rules.textContent = 'Where is the pearl? Tap a shell.';
      api.area.classList.add('mg-pick');
    }, 1900 + plan.moves.length * step + 150);

    shells.forEach((sh, i) => s.on(sh, 'click', () => {
      if (!canPick) return;
      canPick = false;
      api.area.classList.remove('mg-pick');
      sh.classList.add('mg-up', 'mg-chosen');
      const right = i === plan.pearl;
      s.sfx(right ? 'ding' : 'whack');
      if (!right) s.later(() => shells[plan.pearl].classList.add('mg-up'), 500);
      s.later(() => api.finish(right ? SHELL_WIN : 0, right ? 'Sharp eyes!' : 'The pearl was over there.'), right ? 700 : 1200);
    }));
  }

  ////////////////////////////////////////////////////////////////////////////
  // Snail Race

  const RACE_STEPS = 80;
  const RACE_MS = 8000;

  function prepRace(api) {
    const list = el('div', 'mg-lanes', null, api.area);
    RACERS.forEach((r, i) => {
      const lane = el('button', 'mg-lane', null, list);
      lane.dataset.i = String(i);
      const info = el('div', 'mg-lane-info', null, lane);
      el('b', null, r.name, info);
      el('span', 'mg-odds', '×' + r.odds, info);
      el('span', 'mg-pays', 'win ' + api.coins(r.odds), info);
      const track = el('div', 'mg-track', null, lane);
      const runner = el('span', 'mg-runner', null, track);
      const body = el('span', 'mg-body', '🐌', runner);
      body.style.filter = 'hue-rotate(' + r.hue + 'deg)';
      el('span', 'mg-say', null, runner);
    });
  }

  function runRace(api) {
    const { s, rand, rules, area } = api;
    const lanes = Array.from(area.querySelectorAll('.mg-lane'));
    let bet = -1;
    rules.textContent = 'Tap the snail you bet on.';
    area.classList.add('mg-pick');

    lanes.forEach((lane, i) => s.on(lane, 'click', () => {
      if (bet >= 0) return;
      bet = i;
      area.classList.remove('mg-pick');
      lane.classList.add('mg-bet');
      api.setWin(RACERS[i].name + ' wins: ' + api.coins(RACERS[i].odds));
      s.sfx('coin');
      countdown(3);
    }));

    function countdown(n) {
      rules.textContent = n > 0 ? 'Ready… ' + n : 'GO!';
      s.sfx(n > 0 ? 'tick' : 'riser');
      if (n > 0) s.later(() => countdown(n - 1), 600);
      else race();
    }

    function race() {
      const winner = raceWinner(rand);
      const plan = raceCurves(winner, rand, RACE_STEPS);
      const runners = lanes.map(l => l.querySelector('.mg-runner'));
      const says = lanes.map(l => l.querySelector('.mg-say'));
      const t0 = Date.now();
      let leader = -1;
      let nextTalk = 900;

      const posAt = (i, f) => {
        const c = plan.curves[i];
        const k = Math.min(RACE_STEPS - 1, Math.floor(f));
        return c[k] + (c[k + 1] - c[k]) * (f - k);
      };
      const talk = (i, text, ms) => {
        says[i].textContent = text;
        says[i].classList.add('mg-on');
        s.later(() => says[i].classList.remove('mg-on'), ms);
      };

      s.every(() => {
        const t = Date.now() - t0;
        const f = Math.min(RACE_STEPS, t / RACE_MS * RACE_STEPS);
        let best = 0;
        runners.forEach((rn, i) => {
          const p = posAt(i, f);
          rn.style.left = 'calc((100% - 2em) * ' + p.toFixed(4) + ')';
          if (p > posAt(best, f)) best = i;
        });
        if (best !== leader && t > 600) s.sfx('tick');
        leader = best;
        lanes.forEach((l, i) => l.classList.toggle('mg-lead', i === best));

        const asleep = plan.sleeper >= 0 && f >= plan.sleepFrom && f < plan.sleepTo;
        lanes.forEach((l, i) => l.classList.toggle('mg-sleep', asleep && i === plan.sleeper));
        if (asleep && !says[plan.sleeper].classList.contains('mg-on')) talk(plan.sleeper, '💤 zzz', 700);

        if (t > nextTalk && t < RACE_MS - 800) {
          nextTalk = t + 700 + rand() * 900;
          const i = Math.floor(rand() * RACERS.length);
          if (!(asleep && i === plan.sleeper)) talk(i, pick(RACERS[i].lines, rand), 1000);
        }

        if (t < RACE_MS) return;
        s.clearTimers();
        lanes[winner].classList.add('mg-winner');
        talk(winner, '🏆 YES!', 5000);
        const right = winner === bet;
        rules.textContent = RACERS[winner].name + ' wins!';
        s.later(() => api.finish(right ? RACERS[bet].odds : 0, right ? 'Your snail won!' : RACERS[bet].name + ' lost.'), 900);
      }, 50);
    }
  }

  ////////////////////////////////////////////////////////////////////////////
  // Whack-a-Thief

  const THIEF_FACES = ['🦝', '🥷'];
  const SNAIL_CRIES = ['OW! My shell!', 'Hey! I work here!', 'That is assault!', 'Not the snail!'];

  function prepWhack(api) {
    const bar = el('div', 'mg-whack-bar', null, api.area);
    el('span', 'mg-score', '🦝 0 · ×0', bar);
    el('span', 'mg-time', null, el('span', 'mg-timebox', null, bar));
    el('div', 'mg-cry', null, api.area);
    const grid = el('div', 'mg-grid', null, api.area);
    for (let i = 0; i < 9; i++) {
      const crate = el('button', 'mg-crate', null, grid);
      el('span', 'mg-box', '📦', crate);
      el('span', 'mg-pop', null, crate);
    }
  }

  function runWhack(api) {
    const { s, rand, rules, area } = api;
    const crates = Array.from(area.querySelectorAll('.mg-crate'));
    const pops = crates.map(c => c.querySelector('.mg-pop'));
    const score = area.querySelector('.mg-score');
    const time = area.querySelector('.mg-time');
    const cry = area.querySelector('.mg-cry');
    const cells = crates.map(() => null);
    let hits = 0;
    let oops = 0;
    let over = false;
    rules.textContent = 'Whack thieves. Leave Mortimer alone!';

    const total = () => Math.max(0, hits - oops);
    const showScore = () => { score.textContent = '🦝 ' + total() + ' · ×' + whackPayout(total()); };
    const hide = (i, who) => {
      if (cells[i] !== who) return;
      cells[i] = null;
      crates[i].classList.remove('mg-out', 'mg-hit', 'mg-is-snail');
    };

    whackPlan(api.level, rand).forEach(ev => s.later(() => {
      const free = cells.map((c, i) => (c ? -1 : i)).filter(i => i >= 0);
      if (!free.length) return;
      const i = pick(free, rand);
      const who = { kind: ev.kind, hit: false };
      cells[i] = who;
      pops[i].textContent = ev.kind === 'snail' ? '🐌' : pick(THIEF_FACES, rand);
      crates[i].classList.add('mg-out');
      crates[i].classList.toggle('mg-is-snail', ev.kind === 'snail');
      s.later(() => hide(i, who), ev.show);
    }, ev.at));

    crates.forEach((crate, i) => s.on(crate, 'pointerdown', e => {
      e.preventDefault();
      const who = cells[i];
      if (over || !who || who.hit) return;
      who.hit = true;
      crate.classList.add('mg-hit');
      if (who.kind === 'snail') {
        oops++;
        pops[i].textContent = '😵';
        cry.textContent = '🐌 ' + pick(SNAIL_CRIES, rand);
        s.sfx('eek');
      } else {
        hits++;
        pops[i].textContent = '💥';
        s.sfx('whack');
      }
      showScore();
      s.later(() => hide(i, who), 260);
    }));

    const t0 = Date.now();
    s.every(() => {
      const left = Math.max(0, WHACK_MS - (Date.now() - t0));
      time.style.width = (left / WHACK_MS * 100) + '%';
      if (left > 0) return;
      over = true;
      const mult = whackPayout(total());
      api.finish(mult, total() + ' thieves caught' + (oops ? ' (' + oops + ' snail bonk' + (oops > 1 ? 's' : '') + ')' : '') + '.');
    }, 100);
  }

  ////////////////////////////////////////////////////////////////////////////
  // Claw Machine

  const CLAW_AIM = {
    0: 'A boot? Bold choice.',
    4: 'Careful! That is my face!',
    5: 'The diamond? Greedy. I like it.',
  };

  function prepClaw(api) {
    api.plan = clawPlan(api.level, api.rand);
    const cab = el('div', 'mg-cab', null, api.area);
    const claw = el('div', 'mg-claw', null, cab);
    el('div', 'mg-cable', null, claw);
    el('div', 'mg-hand', null, claw);
    api.plan.order.forEach((p, col) => {
      const prize = CLAW_PRIZES[p];
      const slot = el('div', 'mg-prize', null, cab);
      slot.style.left = (col * 100 / CLAW_COLS) + '%';
      const toy = el('span', 'mg-toy', prize.icon, slot);
      toy.style.transform = 'rotate(' + Math.round((api.rand() - 0.5) * 30) + 'deg)';
      el('span', 'mg-tag', '×' + prize.mult, slot);
    });
    const drop = el('button', 'mg-big mg-drop', '⬇ Drop', api.area);
    drop.disabled = true;
  }

  function runClaw(api) {
    const { s, rand, rules, area, plan } = api;
    const talk = keeper(api);
    const claw = area.querySelector('.mg-claw');
    const slots = Array.from(area.querySelectorAll('.mg-prize'));
    const drop = area.querySelector('.mg-drop');
    const t0 = Date.now();
    let pos = 0;
    let moving = true;
    let teased = false;
    rules.textContent = 'Tap Drop when the claw is over a prize.';
    talk('The diamond is slippery. Just saying.');
    drop.disabled = false;
    area.classList.add('mg-pick');

    s.every(() => {
      if (!moving) return;
      const ms = Date.now() - t0;
      pos = clawPos(ms, plan.speed);
      claw.style.left = ((pos + 0.5) * 100 / CLAW_COLS).toFixed(2) + '%';
      if (!teased && plan.order[clawColumn(pos)] === 4) {
        teased = true;
        talk('Hey! That plush is me! Hands off!');
      }
      if (ms < plan.wait) return;
      talk('Too slow. I pressed it for you.');
      release();
    }, 30);
    s.on(drop, 'pointerdown', e => {
      e.preventDefault();
      release();
    });

    function release() {
      if (!moving) return;
      moving = false;
      drop.disabled = true;
      area.classList.remove('mg-pick');
      const col = clawColumn(pos);
      const p = plan.order[col];
      const prize = CLAW_PRIZES[p];
      const got = rand() < clawChance(prize, pos);
      if (CLAW_AIM[p]) talk(CLAW_AIM[p]);
      claw.classList.add('mg-down');
      s.sfx('riser');

      // The cable and the lifted prize use the same transition, so the prize moves with the claw.
      s.later(() => {
        claw.classList.add('mg-shut');
        slots[col].style.left = (pos * 100 / CLAW_COLS).toFixed(2) + '%';
        s.sfx('whack');
      }, 850);
      s.later(() => {
        claw.classList.remove('mg-down');
        slots[col].classList.add('mg-lift');
        talk('Grab it… grab it…');
      }, 1250);
      if (!got) {
        s.later(() => {
          slots[col].classList.remove('mg-lift');
          claw.classList.remove('mg-shut');
          talk('Oops. Slippery claws. Not my fault.');
          s.sfx('nope');
        }, 1550 + rand() * 350);
      }
      s.later(() => {
        if (got) {
          slots[col].classList.add('mg-won');
          talk(p === 4 ? 'You won me. Weird, but fine.' : 'It is yours. Do not lick it.');
        }
        api.finish(got ? prize.mult : 0, got ? 'You got ' + prize.name + '!' : 'It slipped!');
      }, 2600);
    }
  }

  ////////////////////////////////////////////////////////////////////////////
  // Higher or Lower

  const HILO_FACES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const HILO_SUITS = ['♠', '♥', '♦', '♣'];
  const HILO_DEAL = [
    'Dealing… slowly.', 'Where did I put that card?', 'Licking my thumb. Sorry.',
    'Snail speed is house speed.', 'Careful, careful…', 'One moment. I have no hands.',
  ];
  const HILO_RIGHT = ['Hmph. Lucky.', 'Right again? Suspicious.', 'Fine. You are good at this.'];

  function prepHilo(api) {
    const pips = el('div', 'mg-pips', null, api.area);
    HILO_PAY.forEach(m => el('span', 'mg-pip', '×' + m, pips));
    const cards = el('div', 'mg-cards', null, api.area);
    el('div', 'mg-card mg-back', null, cards);
    el('div', 'mg-card mg-back', null, cards);
    const btns = el('div', 'mg-hilo', null, api.area);
    el('button', 'mg-big mg-higher', '⬆ Higher', btns).disabled = true;
    el('button', 'mg-big mg-lower', '⬇ Lower', btns).disabled = true;
    el('button', 'mg-big mg-gold mg-cash', null, btns).hidden = true;
  }

  function runHilo(api) {
    const { s, rand, rules, area } = api;
    const talk = keeper(api);
    const [cur, next] = area.querySelectorAll('.mg-card');
    const pips = area.querySelectorAll('.mg-pip');
    const up = area.querySelector('.mg-higher');
    const down = area.querySelector('.mg-lower');
    const cash = area.querySelector('.mg-cash');
    let card = hiloDraw(rand);
    let wins = 0;
    let busy = true;

    const show = (box, value) => {
      const suit = pick(HILO_SUITS, rand);
      box.className = 'mg-card' + (suit === '♥' || suit === '♦' ? ' mg-red' : '');
      box.textContent = HILO_FACES[value - 2] + suit;
    };
    const ready = () => {
      busy = false;
      up.disabled = false;
      down.disabled = false;
      rules.textContent = 'Higher or lower than ' + HILO_FACES[card - 2] + '?';
    };

    show(cur, card);
    talk(card === 8 ? 'An 8. Right in the middle. Hee hee.' : 'First card. Do not rush me.');
    s.sfx('tick');
    s.later(ready, 500);

    const guess = isUp => {
      if (busy) return;
      busy = true;
      up.disabled = true;
      down.disabled = true;
      cash.hidden = true;
      next.classList.add('mg-deal');
      talk(pick(HILO_DEAL, rand));
      s.sfx('tick');
      s.later(() => reveal(isUp), 1000 + rand() * 700);
    };

    function reveal(isUp) {
      const value = hiloDraw(rand);
      show(next, value);
      if (!hiloWin(card, value, isUp)) {
        talk(value === card ? 'A tie! Ties go to the house.' : 'Ooh. Wrong way.');
        s.sfx('nope');
        s.later(() => api.finish(0, 'The card was ' + HILO_FACES[value - 2] + '.'), 1100);
        return;
      }
      pips[wins].classList.add('mg-on');
      wins++;
      s.sfx('ding');
      if (wins === HILO_PAY.length) {
        talk('Three in a row?! My dealing foot hurts.');
        s.later(() => api.finish(HILO_PAY[wins - 1], 'Three in a row!'), 900);
        return;
      }
      talk(pick(HILO_RIGHT, rand));
      s.later(() => {
        card = value;
        show(cur, card);
        next.className = 'mg-card mg-back';
        next.textContent = '';
        cash.textContent = 'Cash out ' + api.coins(HILO_PAY[wins - 1]);
        cash.hidden = false;
        ready();
      }, 900);
    }

    s.on(up, 'click', () => guess(true));
    s.on(down, 'click', () => guess(false));
    s.on(cash, 'click', () => {
      if (busy || !wins) return;
      busy = true;
      talk('Take the coins. Leave slowly. I always do.');
      api.finish(HILO_PAY[wins - 1], 'Cashed out after ' + wins + '.');
    });
  }

  ////////////////////////////////////////////////////////////////////////////
  // Snail Curling

  // Length of the ice run in em. Ring sizes follow it.
  const CURL_EM = 14;

  function prepCurl(api) {
    const rink = el('div', 'mg-rink', null, api.area);
    const ice = el('div', 'mg-ice', null, rink);
    ice.style.height = CURL_EM + 'em';
    const house = el('div', 'mg-house', null, ice);
    CURL_RINGS.slice().reverse().forEach(([r]) => {
      const ring = el('span', 'mg-ring', null, house);
      ring.style.width = ring.style.height = (2 * r * CURL_EM).toFixed(2) + 'em';
    });
    el('span', 'mg-leaf', '🥬', house);
    el('span', 'mg-stone', '🐚', ice);
    const meter = el('div', 'mg-meter', null, rink);
    meter.style.height = CURL_EM + 'em';
    el('span', 'mg-fill', null, meter);
    el('span', 'mg-mark', null, meter);
    el('div', 'mg-shots', null, api.area);
    const hold = el('button', 'mg-big mg-hold', 'Hold to push', api.area);
    hold.disabled = true;
  }

  function runCurl(api) {
    const { s, rand, rules, area } = api;
    const talk = keeper(api);
    const plan = curlPlan(api.level, rand);
    const house = area.querySelector('.mg-house');
    const stone = area.querySelector('.mg-stone');
    const fill = area.querySelector('.mg-fill');
    const mark = area.querySelector('.mg-mark');
    const shots = area.querySelector('.mg-shots');
    const hold = area.querySelector('.mg-hold');
    const pays = [];
    let shot = 0;
    let t0 = 0;
    let holding = false;
    let ready = false;

    const place = (node, at) => { node.style.bottom = (at * 100).toFixed(2) + '%'; };
    const showShots = () => {
      shots.textContent = pays.map(m => '×' + m).concat(Array(CURL_SHOTS - pays.length).fill('🐚')).join('  ');
    };

    function setup() {
      const target = plan.targets[shot];
      stone.classList.remove('mg-slide', 'mg-gone');
      place(stone, 0);
      place(house, target);
      place(mark, target);
      fill.style.height = '0';
      showShots();
      ready = true;
      hold.disabled = false;
      area.classList.add('mg-pick');
      rules.textContent = 'Hold. Let go at the line.';
    }

    s.every(() => {
      if (holding) fill.style.height = (pingPong(Date.now() - t0, plan.speed) * 100).toFixed(1) + '%';
    }, 30);

    s.on(hold, 'pointerdown', e => {
      e.preventDefault();
      if (!ready || holding) return;
      holding = true;
      t0 = Date.now();
      try { hold.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
      talk(shot ? 'Again. Gentle this time.' : 'Push my good shell. Gently!');
      s.sfx('tick');
    });
    s.on(hold, 'pointerup', letGo);
    s.on(hold, 'pointercancel', letGo);
    s.on(hold, 'contextmenu', e => e.preventDefault());

    function letGo() {
      if (!holding) return;
      holding = false;
      ready = false;
      hold.disabled = true;
      area.classList.remove('mg-pick');
      const power = pingPong(Date.now() - t0, plan.speed);
      const target = plan.targets[shot];
      const at = curlSlide(power, rand);
      fill.style.height = (power * 100).toFixed(1) + '%';
      stone.classList.add('mg-slide');
      place(stone, Math.min(at, 1.1));
      s.sfx('riser');
      talk(at > target + 0.15 ? 'Too fast! I have no brakes!' : at < target - 0.15 ? 'Come on, little shell…' : 'Ooh… ooh… OOH…');

      s.later(() => {
        const mult = curlScore(target, at);
        pays.push(mult);
        showShots();
        if (at > 1) stone.classList.add('mg-gone');
        talk(at > 1 ? 'Off the edge. I will need a new shell.' : mult >= 2 ? 'Bullseye! On the lettuce!' : mult > 0 ? 'In the rings. Not bad.' : at < target ? 'Short. Very short.' : 'Long. The lettuce is over there.');
        s.sfx(mult >= 2 ? 'jackpot' : mult > 0 ? 'coin' : 'nope');
        shot++;
        if (shot < CURL_SHOTS) {
          s.later(setup, 1300);
          return;
        }
        const total = pays.reduce((a, b) => a + b, 0) / CURL_SHOTS;
        s.later(() => api.finish(total, 'Shells: ' + pays.map(m => '×' + m).join(' + ') + '.'), 1100);
      }, 1700);
    }

    setup();
    talk('This is my spare shell. Be nice to it.');
  }

  ////////////////////////////////////////////////////////////////////////////
  // Scratch & Sniff

  const SCRATCH_RUB = [
    'Rub, rub. Like my shell on bath day.', 'Gently. The ink is lettuce juice.',
    'I smell nothing. Yet.', 'Another one? Brave.', 'Hm. Hm hm hm.',
  ];
  const SCRATCH_SET = ['Three mushrooms. Soup money!', 'Three berries! Sweet.', 'Three gems?! I printed too many.'];
  const SCRATCH_SOCK_LINES = ['THE SOCK! I wore that one all week.', 'My gym sock. The card is void. Sorry.', 'Sock! Open a window, please.'];
  // Rub this far, in cell widths, to clear the foil.
  const SCRATCH_RUB_CELLS = 2;

  function prepScratch(api) {
    const pips = el('div', 'mg-pips', null, api.area);
    SCRATCH_SYMBOLS.forEach(x => {
      const pip = el('span', 'mg-pip', x.icon, pips);
      el('span', 'mg-count', '○○○', pip);
      el('span', null, '×' + x.pay, pip);
    });
    const card = el('div', 'mg-scratch', null, api.area);
    for (let i = 0; i < 9; i++) {
      const cell = el('button', 'mg-cell', null, card);
      el('span', 'mg-sym', null, cell);
      el('span', 'mg-foil', null, cell);
      el('span', 'mg-smell', '💨', cell);
    }
    el('button', 'mg-big mg-gold mg-cash', null, api.area).hidden = true;
  }

  function runScratch(api) {
    const { s, rand, rules, area } = api;
    const talk = keeper(api);
    const plan = scratchPlan(rand);
    const cells = Array.from(area.querySelectorAll('.mg-cell'));
    const pips = area.querySelectorAll('.mg-pip');
    const counts = area.querySelectorAll('.mg-count');
    const cash = area.querySelector('.mg-cash');
    const found = SCRATCH_SYMBOLS.map(() => 0);
    const open = cells.map(() => false);
    const rub = cells.map(() => 0);
    let active = -1;
    let last = null;
    let busy = false;
    let over = false;
    let smelled = false;
    rules.textContent = 'Rub a cell. 💨 means the sock is next to it.';
    talk('Rub gently. I printed these myself.');

    const showPay = () => {
      found.forEach((n, k) => {
        counts[k].textContent = '●'.repeat(Math.min(3, n)) + '○'.repeat(Math.max(0, 3 - n));
        pips[k].classList.toggle('mg-on', n >= 3);
      });
      const pay = scratchPay(found);
      cash.textContent = 'Cash out ' + api.coins(pay);
      cash.hidden = !pay || over;
    };

    // Show the cells that are still closed, faded, so that the player sees where the sock was.
    const peek = () => cells.forEach((cell, i) => {
      if (open[i]) return;
      const k = plan.cells[i];
      cell.querySelector('.mg-sym').textContent = k === SCRATCH_SOCK ? '🧦' : SCRATCH_SYMBOLS[k].icon;
      cell.classList.add('mg-peek');
    });

    function scrub(i, amount) {
      const before = Math.floor(rub[i] * 4);
      rub[i] = Math.min(1, rub[i] + amount);
      cells[i].style.setProperty('--mg-rub', rub[i].toFixed(2));
      if (Math.floor(rub[i] * 4) > before) s.sfx('tick');
      if (rub[i] >= 1) reveal(i);
    }

    function reveal(i) {
      active = -1;
      if (open[i]) return;
      open[i] = true;
      const cell = cells[i];
      const k = plan.cells[i];
      cell.classList.remove('mg-rubbing');
      cell.classList.add('mg-open');

      if (k === SCRATCH_SOCK) {
        over = true;
        cash.hidden = true;
        cell.querySelector('.mg-sym').textContent = '🧦';
        cell.classList.add('mg-sock');
        talk(pick(SCRATCH_SOCK_LINES, rand));
        s.sfx('eek');
        s.later(peek, 600);
        s.later(() => api.finish(0, 'The stinky sock! The card is void.'), 1500);
        return;
      }

      cell.querySelector('.mg-sym').textContent = SCRATCH_SYMBOLS[k].icon;
      const stinky = scratchNear(i, plan.sock);
      cell.classList.toggle('mg-stinky', stinky);
      found[k]++;
      busy = true;
      s.later(() => { busy = false; }, 250);

      if (open.filter(Boolean).length === cells.length - 1) {
        over = true;
        showPay();
        const pay = scratchPay(found);
        talk(pay ? 'Every cell but the sock! I am impressed.' : 'All clean, and no set. That is rare.');
        s.sfx('ding');
        s.later(peek, 400);
        s.later(() => api.finish(pay, 'Only the sock is left.'), 1300);
        return;
      }

      showPay();
      if (found[k] === 3) {
        talk(SCRATCH_SET[k] + ' Cash out, or rub on?');
        s.sfx('coin');
      } else if (stinky && !smelled) {
        smelled = true;
        talk('Sniff… sniff… the sock is next to that one.');
        s.sfx('eek');
      } else {
        talk(pick(SCRATCH_RUB, rand));
        s.sfx('ding');
      }
    }

    cells.forEach((cell, i) => {
      s.on(cell, 'pointerdown', e => {
        e.preventDefault();
        if (busy || over || open[i] || active >= 0) return;
        active = i;
        last = { x: e.clientX, y: e.clientY };
        try { cell.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
        cell.classList.add('mg-rubbing');
        scrub(i, 0.15);
      });
      s.on(cell, 'pointermove', e => {
        if (active !== i) return;
        const d = Math.hypot(e.clientX - last.x, e.clientY - last.y);
        last = { x: e.clientX, y: e.clientY };
        scrub(i, d / ((cell.offsetWidth || 60) * SCRATCH_RUB_CELLS));
      });
      // A tap or a short rub clears the rest of the foil.
      s.on(cell, 'pointerup', () => { if (active === i) reveal(i); });
      s.on(cell, 'pointercancel', () => {
        if (active !== i) return;
        active = -1;
        cell.classList.remove('mg-rubbing');
      });
      s.on(cell, 'contextmenu', e => e.preventDefault());
    });

    s.on(cash, 'click', () => {
      const pay = scratchPay(found);
      if (busy || over || !pay) return;
      over = true;
      cash.hidden = true;
      talk('Cashing out? Wise. My nose agrees.');
      peek();
      s.later(() => api.finish(pay, 'Cashed out with ×' + pay + '.'), 1100);
    });
  }

  ////////////////////////////////////////////////////////////////////////////
  // Salad Sling

  const SLING_HIT = ['The tiny one ate it! Big tipper.', 'Caught it! Good manners.', 'Easy one. Still counts.'];
  const SLING_MISS = ['Missed. The floor is fed now.', 'That lettuce was fresh. Was.', 'The wind took it. Blame the wind.'];

  // The lettuce flies a lob; on the top view it bends towards the top of the field.
  const quad = (a, c, b, u) => (1 - u) * (1 - u) * a + 2 * (1 - u) * u * c + u * u * b;
  const slingBend = (x, y) => (SLING_FROM.y + y) / 2 - Math.hypot(x - SLING_FROM.x, y - SLING_FROM.y) * 0.35;

  // Draws the field at ms. st: { pull, aim, fly, splats, fed, loaded }.
  function drawSling(cv, plan, ms, st) {
    const g = cv.getContext && cv.getContext('2d');
    if (!g) return;
    g.setTransform(cv.width / SLING_W, 0, 0, cv.height / SLING_H, 0, 0);
    g.clearRect(0, 0, SLING_W, SLING_H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    plan.forEach((t, i) => {
      const x = slingX(t, ms);
      g.fillStyle = '#ffffff0a';
      g.fillRect(6, t.y - t.r - 6, SLING_W - 12, 2 * t.r + 12);
      g.fillStyle = '#3a0d1e';
      g.strokeStyle = '#ff4f8b';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, t.y, t.r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.font = (2 * t.r + 8) + 'px sans-serif';
      g.fillText('🐌', x + 2 * t.r + 4, t.y);
      g.font = '800 11px sans-serif';
      g.fillStyle = '#ffe680';
      g.fillText(st.fed[i] > ms ? 'Yum!' : '×' + t.pay, x, t.y - t.r - 9);
    });

    g.globalAlpha = 0.55;
    g.font = '12px sans-serif';
    st.splats.forEach(p => g.fillText('🥬', p.x, p.y));
    g.globalAlpha = 1;

    const pull = st.pull ? slingPull(st.pull.x, st.pull.y) : { x: 0, y: 0 };
    const pouch = { x: SLING_FROM.x + pull.x * 0.35, y: SLING_FROM.y + pull.y * 0.35 };
    g.lineCap = 'round';
    g.strokeStyle = '#c58a4a';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(SLING_FROM.x, SLING_H - 4);
    g.lineTo(SLING_FROM.x, SLING_FROM.y + 18);
    g.lineTo(SLING_FROM.x - 18, SLING_FROM.y - 4);
    g.moveTo(SLING_FROM.x, SLING_FROM.y + 18);
    g.lineTo(SLING_FROM.x + 18, SLING_FROM.y - 4);
    g.stroke();
    g.strokeStyle = '#ff9aa8';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(SLING_FROM.x - 18, SLING_FROM.y - 4);
    g.lineTo(pouch.x, pouch.y);
    g.lineTo(SLING_FROM.x + 18, SLING_FROM.y - 4);
    g.stroke();
    if (st.loaded) {
      g.font = '22px sans-serif';
      g.fillText('🥬', pouch.x, pouch.y);
    }

    if (st.aim) {
      const { x, y } = st.aim;
      const cy = slingBend(x, y);
      g.setLineDash([3, 6]);
      g.strokeStyle = '#ffe680cc';
      g.beginPath();
      g.moveTo(SLING_FROM.x, SLING_FROM.y);
      g.quadraticCurveTo((SLING_FROM.x + x) / 2, cy, x, y);
      g.stroke();
      g.beginPath();
      g.arc(x, y, SLING_WIND * 1.6, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }

    if (st.fly) {
      const f = st.fly;
      const u = Math.min(1, Math.max(0, (ms - f.t) / f.dur));
      const cy = slingBend(f.x, f.y);
      g.fillStyle = '#0006';
      g.beginPath();
      g.ellipse(SLING_FROM.x + (f.x - SLING_FROM.x) * u, SLING_FROM.y + (f.y - SLING_FROM.y) * u, 8, 4, 0, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(quad(SLING_FROM.x, (SLING_FROM.x + f.x) / 2, f.x, u), quad(SLING_FROM.y, cy, f.y, u));
      g.rotate(u * 7);
      g.font = Math.round(16 + 12 * Math.sin(Math.PI * u)) + 'px sans-serif';
      g.fillText('🥬', 0, 0);
      g.restore();
    }
  }

  function prepSling(api) {
    api.plan = slingPlan(api.level, api.rand);
    const cv = el('canvas', 'mg-field', null, api.area);
    cv.width = SLING_W * 2;
    cv.height = SLING_H * 2;
    el('div', 'mg-shots', null, api.area);
    drawSling(cv, api.plan, 0, { pull: null, aim: null, fly: null, splats: [], fed: [], loaded: true });
  }

  function runSling(api) {
    const { s, rand, rules, area, plan } = api;
    const talk = keeper(api);
    const cv = area.querySelector('.mg-field');
    const shots = area.querySelector('.mg-shots');
    const st = { pull: null, aim: null, fly: null, splats: [], fed: plan.map(() => 0), loaded: true };
    const pays = [];
    const t0 = Date.now();
    let grab = null;
    let ready = true;

    const showShots = () => {
      shots.textContent = pays.map(m => '×' + m).concat(Array(SLING_SHOTS - pays.length).fill('🥬')).join('  ');
    };
    const toField = e => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) * SLING_W / (r.width || SLING_W), y: (e.clientY - r.top) * SLING_H / (r.height || SLING_H) };
    };
    const arm = () => {
      ready = true;
      st.loaded = true;
      area.classList.add('mg-pick');
      rules.textContent = 'Pull back and let go. Lead the walkers.';
    };

    s.every(() => {
      const ms = Date.now() - t0;
      if (st.fly && ms >= st.fly.t + st.fly.dur) land(ms);
      drawSling(cv, plan, ms, st);
    }, 30);

    s.on(cv, 'pointerdown', e => {
      e.preventDefault();
      if (!ready || grab) return;
      grab = toField(e);
      st.pull = { x: 0, y: 0 };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
      s.sfx('tick');
    });
    s.on(cv, 'pointermove', e => {
      if (!grab) return;
      const p = toField(e);
      st.pull = { x: p.x - grab.x, y: p.y - grab.y };
      st.aim = Math.hypot(st.pull.x, st.pull.y) < SLING_MIN ? null : slingLand(st.pull.x, st.pull.y);
    });
    s.on(cv, 'pointerup', letGo);
    s.on(cv, 'pointercancel', () => {
      grab = null;
      st.pull = null;
      st.aim = null;
    });
    s.on(cv, 'contextmenu', e => e.preventDefault());

    function letGo() {
      if (!grab) return;
      grab = null;
      const aim = st.aim;
      st.pull = null;
      st.aim = null;
      if (!aim) {
        talk('Pull back more. It is a sling, not a sneeze.');
        return;
      }
      ready = false;
      st.loaded = false;
      area.classList.remove('mg-pick');
      const x = aim.x + gauss(rand) * SLING_WIND;
      const y = aim.y + gauss(rand) * SLING_WIND;
      st.fly = { x, y, t: Date.now() - t0, dur: slingFlight(x, y) };
      s.sfx('riser');
    }

    function land(ms) {
      const { x, y } = st.fly;
      st.fly = null;
      const row = slingHit(plan, x, y, ms);
      pays.push(row < 0 ? 0 : plan[row].pay);
      showShots();
      if (row >= 0) st.fed[row] = ms + 1200;
      else st.splats.push({ x, y });
      talk(row < 0 ? pick(SLING_MISS, rand) : SLING_HIT[row]);
      s.sfx(row === 0 ? 'jackpot' : row > 0 ? 'coin' : 'nope');
      if (pays.length < SLING_SHOTS) {
        s.later(arm, 700);
        return;
      }
      const total = Math.round(pays.reduce((a, b) => a + b, 0) * 100) / 100;
      s.later(() => api.finish(total, 'Fed: ' + pays.map(m => '×' + m).join(' + ') + '.'), 1300);
    }

    showShots();
    arm();
    talk('Lunch rush! They walk, so aim ahead of them.');
  }

  ////////////////////////////////////////////////////////////////////////////
  // Coin Stack

  // Coin width in em. Coin thickness, plate and swing heights follow it.
  const STACK_EM = 3;
  const STACK_TOWER = 14;
  const STACK_FLOOR = 1.2;
  const STACK_GOOD = ['Dead centre. Lovely.', 'Plink! Neat as my shell.', 'Right on top. You have done this before.'];
  const STACK_OFF = ['Ooh, a bit off.', 'Wobble, wobble…', 'It leans. Like me after lunch.'];
  const STACK_SAFE = ['Bank! Those coins are safe now.', 'Locked away. Nobody touches those.', 'Banked. My nerves thank you.'];
  const STACK_TIPSY = ['It is leaning. Cash out, or be brave?', 'Hold your breath. I am holding mine.', 'That tower looks nervous.'];
  const STACK_CRASH = ['CRASH! Coins under the counter!', 'Down it goes. I will sweep. Slowly.', 'Coins everywhere! One rolled into my shell.'];

  const coinEl = parent => el('span', 'mg-coin', null, parent);

  function prepStack(api) {
    el('div', 'mg-tally', null, api.area);
    const tower = el('div', 'mg-tower', null, api.area);
    tower.style.height = STACK_TOWER + 'em';
    el('div', 'mg-rail', null, tower);
    el('div', 'mg-plate', null, tower);
    const pile = el('div', 'mg-pile', null, tower);
    pile.style.bottom = STACK_FLOOR + 'em';
    coinEl(tower).classList.add('mg-swing');
    const gauge = el('div', 'mg-level', null, api.area);
    el('span', 'mg-bubble-mark', null, gauge);
    const btns = el('div', 'mg-btns', null, api.area);
    el('button', 'mg-big mg-drop', '⬇ Drop', btns).disabled = true;
    el('button', 'mg-big mg-gold mg-cash', null, btns).hidden = true;
  }

  function runStack(api) {
    const { s, rand, rules, area } = api;
    const talk = keeper(api);
    const plan = stackPlan(api.level);
    const tally = area.querySelector('.mg-tally');
    const tower = area.querySelector('.mg-tower');
    const pile = area.querySelector('.mg-pile');
    const coin = area.querySelector('.mg-swing');
    const mark = area.querySelector('.mg-bubble-mark');
    const drop = area.querySelector('.mg-drop');
    const cash = area.querySelector('.mg-cash');
    const thick = STACK_EM * STACK_THICK;
    const st = { n: 0, tilt: 0, offs: [], jolt: 0, joltAt: 0 };
    const start = Date.now();
    let side = 1;
    let t0 = 0;
    let swinging = false;
    let over = false;
    let x = 0;

    const clock = () => Date.now() - start;
    const placeCoin = () => { coin.style.left = 'calc(50% + ' + (x * STACK_EM).toFixed(3) + 'em)'; };
    const showTally = () => {
      tally.textContent = '🪙 ' + st.n + '/' + STACK_MAX + ' · now ×' + STACK_PAY[st.n] + ' · 🔒 ×' + stackBanked(st.n);
      cash.textContent = 'Cash out ' + api.coins(STACK_PAY[st.n]);
      cash.hidden = !st.n || over || !swinging;
    };

    function spawn() {
      side = rand() < 0.5 ? 1 : -1;
      t0 = Date.now();
      x = stackSwing(plan, st.n, side, 0);
      placeCoin();
      coin.className = 'mg-coin mg-swing';
      coin.style.bottom = (STACK_TOWER - 1.4 - thick).toFixed(2) + 'em';
      swinging = true;
      drop.disabled = false;
      area.classList.add('mg-pick');
      rules.textContent = 'Tap to drop the coin on the stack.';
      showTally();
    }

    s.every(() => {
      if (swinging) {
        const ms = Date.now() - t0;
        x = stackSwing(plan, st.n, side, ms);
        if (ms >= plan.wait) {
          talk('Too slow. My feeler slipped.');
          release();
        }
      }
      placeCoin();
      if (over) return;
      pile.style.transform = 'rotate(' + stackAngle(st, clock()).toFixed(4) + 'rad)';
      mark.style.left = (50 + Math.max(-1, Math.min(1, st.tilt)) * 50).toFixed(1) + '%';
      mark.classList.toggle('mg-hot', Math.abs(st.tilt) > 0.6);
    }, 30);

    function release() {
      if (!swinging || over) return;
      swinging = false;
      drop.disabled = true;
      area.classList.remove('mg-pick');
      x = stackSwing(plan, st.n, side, Date.now() - t0);
      placeCoin();
      coin.classList.add('mg-fall');
      coin.style.bottom = (STACK_FLOOR + st.n * thick).toFixed(2) + 'em';
      s.sfx('tick');
      s.later(land, STACK_DROP_MS);
    }

    function land() {
      const ms = clock();
      const d = x - stackTop(st, ms);
      const result = stackLand(st, x, ms, rand);
      if (result === 'miss') {
        coin.classList.add('mg-lost');
        coin.style.bottom = '-3em';
        talk('Missed the stack! It clipped the edge!');
        topple(Math.sign(d) || 1, stackBanked(st.n));
        return;
      }

      coin.className = 'mg-coin mg-swing mg-hide';
      const placed = coinEl(pile);
      placed.style.left = (st.offs[st.n - 1] * STACK_EM - STACK_EM / 2).toFixed(3) + 'em';
      placed.style.bottom = ((st.n - 1) * thick).toFixed(3) + 'em';
      placed.classList.add('mg-land');
      // The coin that tips the stack does not reach its bank point.
      if (result === 'fall') {
        topple(Math.sign(st.tilt), stackBanked(st.n - 1));
        return;
      }

      const banked = st.n % STACK_BANK === 0;
      if (banked) {
        placed.classList.add('mg-bank');
        el('span', 'mg-lock', '🔒 ×' + STACK_PAY[st.n], placed);
      }
      showTally();
      if (st.n === STACK_MAX) {
        over = true;
        cash.hidden = true;
        talk('Twelve high! I need a ladder to see the top.');
        s.sfx('jackpot');
        s.later(() => api.finish(STACK_PAY[st.n], 'A full stack of ' + st.n + '!'), 1200);
        return;
      }

      if (banked) talk(pick(STACK_SAFE, rand));
      else if (Math.abs(st.tilt) > 0.6) talk(pick(STACK_TIPSY, rand));
      else talk(pick(Math.abs(d) < 0.12 ? STACK_GOOD : STACK_OFF, rand));
      s.sfx(banked ? 'coin' : 'ding');
      s.later(spawn, 600);
    }

    // The stack tips over, then the coins scatter, top coin first.
    function topple(dir, keep) {
      over = true;
      cash.hidden = true;
      const coins = Array.from(pile.children);
      const n = coins.length;
      mark.style.left = dir > 0 ? '100%' : '0%';
      mark.classList.add('mg-hot');
      pile.classList.add('mg-tip');
      pile.style.transform = 'rotate(' + (dir * 0.6).toFixed(2) + 'rad)';
      tower.classList.add('mg-shake');
      s.sfx('whack');
      s.later(() => {
        coins.forEach((c, i) => {
          c.style.setProperty('--mg-fx', (dir * (1.5 + rand() * 3 + (i / n) * 3)).toFixed(2) + 'em');
          c.style.setProperty('--mg-fy', (i * thick + 1 + rand()).toFixed(2) + 'em');
          c.style.setProperty('--mg-fr', Math.round(dir * (90 + rand() * 400)) + 'deg');
          c.style.transitionDelay = ((n - 1 - i) * 40) + 'ms';
          c.classList.add('mg-tumble');
        });
        talk(pick(STACK_CRASH, rand));
        s.sfx('nope');
      }, 350);
      s.later(() => api.finish(keep, keep ? 'It fell. The bank keeps ×' + keep + '.' : 'It fell before the first bank.'), 1900);
    }

    s.on(tower, 'pointerdown', e => {
      e.preventDefault();
      release();
    });
    s.on(drop, 'pointerdown', e => {
      e.preventDefault();
      release();
    });
    s.on(cash, 'click', () => {
      if (over || !swinging || !st.n) return;
      over = true;
      swinging = false;
      drop.disabled = true;
      area.classList.remove('mg-pick');
      coin.classList.add('mg-hide');
      showTally();
      talk('Wise. A tall stack is a nervous stack.');
      api.finish(STACK_PAY[st.n], 'Cashed out at ' + st.n + ' coins.');
    });

    talk('My coins. Stack them high. Not too high.');
    spawn();
  }

  ////////////////////////////////////////////////////////////////////////////
  // Wobbly Wire

  // Lean 1 (the fall) shows as this angle.
  const WIRE_DEG = 60;
  const WIRE_WAIT = 6000;
  const WIRE_LEG_TALK = ['Calm air. Easy money.', 'A breeze. Hold on to your cap, Pip.', 'A STORM? Pip, you are brave. Or silly.'];
  const WIRE_SCARE = ['Whoa whoa WHOA!', 'Lean back! The other back!', 'Pip! My soup is right there!'];
  const WIRE_SPLASH = ['SPLOSH! Pip, that was my lunch!', 'Pip is in the soup. Again.', 'Glub. Now it is woodlouse soup.'];

  function prepWire(api) {
    api.plan = wirePlan(api.level, api.rand);
    const legs = WIRE_PAY.length;
    const pips = el('div', 'mg-pips', null, api.area);
    WIRE_PAY.forEach((m, i) => el('span', 'mg-pip', (i < legs - 1 ? '🚩' : '🏁') + ' ×' + m, pips));
    el('div', 'mg-tally', null, api.area);
    const sky = el('div', 'mg-sky', null, api.area);
    el('div', 'mg-wire', null, sky);
    WIRE_PAY.forEach((_, i) => {
      el('span', 'mg-flag', i < legs - 1 ? '🚩' : '🏁', sky).style.left = (6 + 88 * (i + 1) / legs) + '%';
    });
    el('div', 'mg-soup', "Mortimer's soup", sky);
    el('span', 'mg-splash', '💦', sky);
    const walker = el('div', 'mg-walker', null, sky);
    el('span', 'mg-gust', '💨', walker);
    el('span', 'mg-balloon', '🎈', walker);
    const lean = el('div', 'mg-lean', null, walker);
    el('span', 'mg-pole', null, lean);
    el('span', 'mg-bug', '🪲', lean);
    el('span', 'mg-cap', '🧢', lean);
    el('span', 'mg-sweat', '💧', lean);
    const btns = el('div', 'mg-btns', null, api.area);
    el('button', 'mg-big mg-left', '◀', btns).disabled = true;
    el('button', 'mg-big mg-right', '▶', btns).disabled = true;
    el('button', 'mg-big mg-gold mg-cash', null, btns).hidden = true;
    el('button', 'mg-big mg-go', 'Walk on ▶', btns).hidden = true;
  }

  function runWire(api) {
    const { s, rand, rules, area, plan } = api;
    const talk = keeper(api);
    const legs = WIRE_PAY.length;
    const pips = area.querySelectorAll('.mg-pip');
    const tally = area.querySelector('.mg-tally');
    const sky = area.querySelector('.mg-sky');
    const walker = area.querySelector('.mg-walker');
    const lean = area.querySelector('.mg-lean');
    const gust = area.querySelector('.mg-gust');
    const splash = area.querySelector('.mg-splash');
    const left = area.querySelector('.mg-left');
    const right = area.querySelector('.mg-right');
    const cash = area.querySelector('.mg-cash');
    const go = area.querySelector('.mg-go');
    // Pointer id -> -1 (left) or 1 (right).
    const holds = new Map();
    let leg = 0;
    let st = null;
    let walking = false;
    let scared = false;
    let last = 0;
    let acc = 0;
    let waitId = 0;

    const windOf = i => WIRE_WINDS[plan.legs[i].wind];
    const push = () => Math.sign([...holds.values()].reduce((a, b) => a + b, 0));
    const showHolds = () => {
      const p = [...holds.values()];
      left.classList.toggle('mg-on', p.includes(-1));
      right.classList.toggle('mg-on', p.includes(1));
    };
    const place = () => {
      const along = leg + (st ? st.ms / WIRE_LEG_MS : 0);
      walker.style.left = (6 + 88 * along / legs).toFixed(2) + '%';
      lean.style.transform = 'rotate(' + ((st ? st.lean : 0) * WIRE_DEG).toFixed(1) + 'deg)';
    };
    const showButtons = walk => {
      left.hidden = right.hidden = !walk;
      left.disabled = right.disabled = !walk;
      cash.hidden = go.hidden = walk;
    };

    function startLeg() {
      clearTimeout(waitId);
      const w = windOf(leg);
      st = { lean: plan.legs[leg].lean, vel: 0, ms: 0 };
      scared = false;
      walking = true;
      last = Date.now();
      acc = 0;
      showButtons(true);
      area.classList.add('mg-pick');
      tally.textContent = 'Wind: ' + w.icon + ' ' + w.name;
      rules.textContent = 'Pip leans left? Hold ▶. Leans right? Hold ◀.';
      talk(WIRE_LEG_TALK[plan.legs[leg].wind]);
      s.sfx('riser');
    }

    function stop() {
      walking = false;
      showHolds();
      gust.className = 'mg-gust';
      lean.classList.remove('mg-hot');
      area.classList.remove('mg-pick');
      left.disabled = right.disabled = true;
    }

    function fall() {
      stop();
      const dir = Math.sign(st.lean);
      walker.classList.add('mg-plunge');
      lean.style.transform = 'rotate(' + (dir * 200) + 'deg)';
      splash.style.left = walker.style.left;
      s.sfx('eek');
      s.later(() => {
        splash.classList.add('mg-on');
        sky.classList.add('mg-shake');
        talk(pick(WIRE_SPLASH, rand));
        s.sfx('nope');
      }, 650);
      s.later(() => api.finish(0, 'Pip fell into the soup.'), 1900);
    }

    function flag() {
      stop();
      pips[leg].classList.add('mg-on');
      s.sfx('ding');
      if (leg === legs - 1) {
        lean.style.transform = '';
        walker.classList.add('mg-bow');
        talk('The whole wire! Pip, take a bow.');
        s.later(() => api.finish(WIRE_PAY[leg], 'Pip crossed the whole wire!'), 1300);
        return;
      }
      const next = windOf(leg + 1);
      st.lean = 0;
      place();
      showButtons(false);
      cash.textContent = '🎈 Float off ' + api.coins(WIRE_PAY[leg]);
      tally.textContent = 'Next: ' + next.icon + ' ' + next.name;
      rules.textContent = 'Float off with the coins, or walk on?';
      talk('Flag! The next stretch is ' + next.name + '. Float off, or walk on?');
      // Nobody decides: Pip walks on, and nobody holds him.
      waitId = s.later(() => {
        talk('Pip got bored. He walks on. Alone.');
        leg++;
        startLeg();
      }, WIRE_WAIT);
    }

    s.every(() => {
      const now = Date.now();
      if (!walking) {
        last = now;
        return;
      }
      acc += Math.min(100, now - last);
      last = now;
      const leg0 = plan.legs[leg];
      while (walking && acc >= WIRE_DT) {
        acc -= WIRE_DT;
        const r = wireStep(st, plan, leg0, push());
        if (r === 'fall') {
          place();
          fall();
          return;
        }
        if (r === 'flag') {
          place();
          flag();
          return;
        }
      }
      place();
      const g = wireGust(leg0, st.ms);
      gust.className = 'mg-gust' + (g > 0 ? ' mg-l' : g < 0 ? ' mg-r' : '');
      const hot = Math.abs(st.lean) > 0.6;
      lean.classList.toggle('mg-hot', hot);
      if (Math.abs(st.lean) > 0.8 && !scared) {
        scared = true;
        talk(pick(WIRE_SCARE, rand));
        s.sfx('tick');
      }
    }, 30);

    const press = (e, dir) => {
      e.preventDefault();
      holds.set(e.pointerId, dir);
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
      showHolds();
    };
    const lift = e => {
      holds.delete(e.pointerId);
      showHolds();
    };
    for (const [node, dir] of [[left, () => -1], [right, () => 1], [sky, e => {
      const r = sky.getBoundingClientRect();
      return e.clientX < r.left + r.width / 2 ? -1 : 1;
    }]]) {
      s.on(node, 'pointerdown', e => press(e, dir(e)));
      s.on(node, 'pointerup', lift);
      s.on(node, 'pointercancel', lift);
      s.on(node, 'contextmenu', e => e.preventDefault());
    }

    s.on(go, 'click', () => {
      if (walking || cash.hidden) return;
      leg++;
      startLeg();
    });
    s.on(cash, 'click', () => {
      if (walking || cash.hidden) return;
      clearTimeout(waitId);
      cash.hidden = go.hidden = true;
      walker.classList.add('mg-float');
      talk('Bye, Pip! Smart bug. Here are the coins.');
      s.sfx('coin');
      s.later(() => api.finish(WIRE_PAY[leg], 'Pip floated off at flag ' + (leg + 1) + '.'), 1200);
    });

    place();
    talk('Pip walks the wire. Do not drop him in my soup.');
    s.later(startLeg, 900);
  }

  ////////////////////////////////////////////////////////////////////////////
  // Registry

  const GAMES = {
    shell: {
      icon: '🐚', name: 'Shell Game', rules: 'Follow the pearl. Tap its shell.',
      win: coins => 'win ' + coins(SHELL_WIN), prep: prepShell, run: runShell,
    },
    race: {
      icon: '🏁', name: 'Snail Race', rules: 'Bet on a snail. Long odds pay more.',
      win: coins => 'win up to ' + coins(RACERS[RACERS.length - 1].odds), prep: prepRace, run: runRace,
    },
    whack: {
      icon: '🦝', name: 'Whack-a-Thief', rules: 'Tap thieves in 12 seconds. Not the snail!',
      win: coins => 'win up to ' + coins(WHACK_TIERS[0][1]), prep: prepWhack, run: runWhack,
    },
    claw: {
      icon: '🕹️', name: 'Claw Machine', rules: 'Drop the claw on a prize. Big prizes slip.',
      win: coins => 'win up to ' + coins(CLAW_PRIZES[CLAW_PRIZES.length - 1].mult), prep: prepClaw, run: runClaw,
    },
    hilo: {
      icon: '🃏', name: 'Higher or Lower', rules: 'Guess the next card. Three right pays most. Ties lose.',
      win: coins => 'win up to ' + coins(HILO_PAY[HILO_PAY.length - 1]), prep: prepHilo, run: runHilo,
    },
    curl: {
      icon: '🥌', name: 'Snail Curling', rules: 'Slide two shells onto the lettuce.',
      win: coins => 'win up to ' + coins(CURL_RINGS[0][1]), prep: prepCurl, run: runCurl,
    },
    scratch: {
      icon: '🧦', name: 'Scratch & Sniff', rules: 'Find three alike. Cash out before the sock.',
      win: coins => 'win up to ' + coins(SCRATCH_MAX), prep: prepScratch, run: runScratch,
    },
    sling: {
      icon: '🥬', name: 'Salad Sling', rules: 'Fling lettuce into hungry mouths. Far ones pay most.',
      win: coins => 'win up to ' + coins(SLING_ROWS[0].pay * SLING_SHOTS), prep: prepSling, run: runSling,
    },
    stack: {
      icon: '🪙', name: 'Coin Stack', rules: 'Stack coins. Every third is banked. A fall pays the bank.',
      win: coins => 'win up to ' + coins(STACK_PAY[STACK_MAX]), prep: prepStack, run: runStack,
    },
    wire: {
      icon: '🪢', name: 'Wobbly Wire', rules: 'Hold ◀ ▶ to keep Pip up. At a flag, float off or walk on.',
      win: coins => 'win up to ' + coins(WIRE_PAY[WIRE_PAY.length - 1]), prep: prepWire, run: runWire,
    },
  };

  window.BBMini = {
    list: [
      { id: 'shell', icon: '🐚', name: 'Shell Game', blurb: 'Follow the pearl. Pays 2.5×.', at: 1 },
      { id: 'race', icon: '🏁', name: 'Snail Race', blurb: 'Bet on a snail. Up to 9×.', at: 1 },
      { id: 'whack', icon: '🦝', name: 'Whack-a-Thief', blurb: 'Bonk thieves for 12 s. Up to 3×.', at: 1 },
      { id: 'hilo', icon: '🃏', name: 'Higher or Lower', blurb: 'Mortimer deals. Three right: 3.2×.', at: 22 },
      { id: 'claw', icon: '🕹️', name: 'Claw Machine', blurb: 'Grab a prize. The diamond pays 5×.', at: 26 },
      { id: 'curl', icon: '🥌', name: 'Snail Curling', blurb: 'Slide shells to the lettuce. Up to 2×.', at: 30 },
      { id: 'scratch', icon: '🧦', name: 'Scratch & Sniff', blurb: 'Rub a card. Mind the sock. Up to 3×.', at: 34 },
      { id: 'sling', icon: '🥬', name: 'Salad Sling', blurb: 'Feed the snails from afar. Up to 1.95×.', at: 38 },
      { id: 'stack', icon: '🪙', name: 'Coin Stack', blurb: 'Stack coins. Bank every third. Up to 2.3×.', at: 42 },
      { id: 'wire', icon: '🪢', name: 'Wobbly Wire', blurb: 'Walk Pip over the soup. Up to 2.5×.', at: 46 },
    ],

    play(id, host, ctx) {
      const game = GAMES[id];
      if (!game || !host) return false;
      ctx = ctx || {};
      const info = Object.assign({ id }, game);
      const api = frame(host, ctx, info, Math.random);
      game.prep(api);
      return true;
    },

    model: {
      shellPlan, SHELL_WIN, RACERS, raceChances, raceWinner, raceCurves,
      whackPlan, whackPayout, WHACK_THIEVES, WHACK_SNAILS,
      gauss, CLAW_COLS, CLAW_PRIZES, clawPlan, clawPos, clawColumn, clawChance,
      HILO_PAY, hiloDraw, hiloWin, hiloChance,
      CURL_RINGS, CURL_SHOTS, curlPlan, pingPong, curlSlide, curlScore,
      SCRATCH_SYMBOLS, SCRATCH_SOCK, SCRATCH_MAX, scratchPlan, scratchNear, scratchPay,
      SLING_W, SLING_H, SLING_FROM, SLING_PULL, SLING_REACH, SLING_WIND, SLING_SHOTS, SLING_ROWS,
      slingPlan, slingX, slingPull, slingLand, slingFlight, slingHit,
      STACK_PAY, STACK_MAX, STACK_BANK, STACK_DROP_MS, stackPlan, stackBanked, stackSwing, stackAngle, stackTop, stackLand,
      WIRE_PAY, WIRE_LEG_MS, WIRE_DT, WIRE_WINDS, WIRE_LEG_WINDS, wirePlan, wireGust, wireStep,
    },
  };
})();
