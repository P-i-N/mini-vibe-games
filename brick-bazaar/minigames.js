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
  };

  window.BBMini = {
    list: [
      { id: 'shell', icon: '🐚', name: 'Shell Game', blurb: 'Follow the pearl. Pays 2.5×.', at: 1 },
      { id: 'race', icon: '🏁', name: 'Snail Race', blurb: 'Bet on a snail. Up to 9×.', at: 1 },
      { id: 'whack', icon: '🦝', name: 'Whack-a-Thief', blurb: 'Bonk thieves for 12 s. Up to 3×.', at: 1 },
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
    },
  };
})();
