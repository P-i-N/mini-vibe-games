'use strict';
/* Brick Bazaar round plug-ins: bonus rounds that are other games. See the 'round plug-ins' section of game.js. */
(() => {
  const TAU = Math.PI * 2;

  // ---------- shared drawing ----------
  // Mortimer at scale s, turned by rot
  function snail(api, ctx, x, y, s, dir = 1, flash = false, rot = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s); api.drawSnail(0, 0, dir, flash); ctx.restore();
  }
  // Mortimer's speech bubble. A round keeps it in state.talk and draws it with drawTalk.
  function talk(api, s, T = 2.4) { if (s) api.state.talk = { s, t: T }; }
  // api.pay drops the coins at the paddle, and they are lost when the paddle moves away. So a round keeps its pay in
  // state.bank and pays it all at the end: when the round ends, the game pulls every coin in the air to the paddle.
  function bank(api, n) {
    const st = api.state;
    if (st.cashed) { api.pay(n); return; }
    st.bank = (st.bank || 0) + n; st.bankPop = 1;
  }
  function cashOut(api) {
    const st = api.state;
    if (st.cashed) return;
    st.cashed = true;
    if (st.bank) api.pay(st.bank);
  }
  // per frame: the speech bubble, the bank counter and the cash-out
  function settle(api, dt) {
    const st = api.state, k = st.talk;
    if (k && (k.t -= dt) <= 0) st.talk = null;
    st.bankPop = Math.max(0, (st.bankPop || 0) - dt * 4);
    if (api.left < 0.25) cashOut(api);
  }
  function drawBank(api, ctx) {
    const st = api.state, s = 20 + 8 * (st.bankPop || 0);
    label(ctx, '🪙 ' + Math.min(st.bank || 0, 160), api.W - 50, api.HUD_H + 22, '#ffd23f', s);
  }
  function drawTalk(api, ctx, x, y) {
    const k = api.state.talk;
    if (!k) return;
    ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(k.s).width + 22, bx = Math.max(w / 2 + 8, Math.min(api.W - w / 2 - 8, x));
    ctx.globalAlpha = Math.min(1, k.t * 3);
    ctx.fillStyle = '#f4f6ff'; ctx.beginPath(); ctx.roundRect(bx - w / 2, y - 34, w, 28, 12); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 6, y - 7); ctx.lineTo(x + 6, y - 7); ctx.lineTo(x, y + 2); ctx.fill();
    ctx.fillStyle = '#1b1f33'; ctx.fillText(k.s, bx, y - 19);
    ctx.globalAlpha = 1;
  }
  function emoji(ctx, ch, x, y, size, rot = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.font = size + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, 0, 0);
    ctx.restore();
  }
  function label(ctx, s, x, y, color, size = 15) {
    ctx.font = 'bold ' + size + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Shell Pachinko: Mortimer rides the dropper. Each tap drops a marble through the pegs into a pay bucket.
  const PACH = { marbles: 10, pegR: 5, r: 8, dropY: 150, binTop: 592, binY: 660, binW: 96, grav: 900 };
  const BINS = [
    { pay: 0, text: 'KEEPS IT', c: '#8a8fb0' }, { pay: 5, text: '+5', c: '#5ef0ff' }, { pay: 16, text: '🐌 +16', c: '#ffd23f' },
    { pay: 5, text: '+5', c: '#5ef0ff' }, { pay: 0, text: 'KEEPS IT', c: '#8a8fb0' },
  ];
  function pegField() {
    const pegs = [];
    for (let row = 0; row < 8; row++) {
      const y = 230 + row * 42, odd = row & 1;
      for (let x = odd ? 48 : 24; x <= 456; x += 48) pegs.push({ x, y, flash: 0 });
    }
    for (let k = 1; k < BINS.length; k++) pegs.push({ x: k * PACH.binW, y: PACH.binTop, flash: 0 });
    return pegs;
  }
  function dropMarble(api) {
    const st = api.state;
    if (st.left <= 0 || st.cd > 0) return;
    st.left--; st.cd = 0.25;
    st.balls.push({ x: api.clamp(api.paddle.x, 20, api.W - 20), y: PACH.dropY + 14, vx: api.rand(-15, 15), vy: 0, hits: 0 });
    api.sfx.tick();
  }
  function moveMarble(api, m, h) {
    const st = api.state, R = PACH.r + PACH.pegR;
    m.vy += PACH.grav * h; m.vx *= 1 - 2 * h; m.x += m.vx * h; m.y += m.vy * h;
    if (m.x < PACH.r) { m.x = PACH.r; m.vx = Math.abs(m.vx) * 0.6; }
    if (m.x > api.W - PACH.r) { m.x = api.W - PACH.r; m.vx = -Math.abs(m.vx) * 0.6; }
    for (const p of st.pegs) {
      const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy);
      if (d >= R || d === 0) continue;
      const nx = dx / d, ny = dy / d, vn = m.vx * nx + m.vy * ny;
      m.x = p.x + nx * R; m.y = p.y + ny * R;
      if (vn >= 0) continue;
      m.vx -= 1.3 * vn * nx; m.vy -= 1.3 * vn * ny;
      // a marble must not balance on top of a peg
      m.vx += api.rand(-6, 6) + (Math.abs(nx) < 0.1 ? api.pick([-30, 30]) : 0);
      if (p.flash <= 0) api.sfx.ping(m.hits++);
      p.flash = 0.25;
    }
    // walls between the buckets
    if (m.y > PACH.binTop) {
      for (let k = 1; k < BINS.length; k++) {
        const wx = k * PACH.binW;
        if (Math.abs(m.x - wx) >= PACH.r + 2) continue;
        m.x = wx + Math.sign(m.x - wx || 1) * (PACH.r + 2); m.vx = -m.vx * 0.5;
      }
    }
    const v = Math.hypot(m.vx, m.vy);
    if (v > 700) { m.vx *= 700 / v; m.vy *= 700 / v; }
  }
  function landMarble(api, m) {
    const st = api.state, k = api.clamp(Math.floor(m.x / PACH.binW), 0, BINS.length - 1), b = BINS[k];
    st.binFlash[k] = 0.5; m.dead = true;
    if (b.pay >= 16) {
      bank(api, b.pay); api.score(1); api.sfx.jackpot(); api.flash('#ffd23f', 0.2); api.burst(m.x, PACH.binY - 20, '#ffd23f', 18, 220);
      api.say(m.x, PACH.binTop - 30, 'SNAIL JACKPOT!', '#ffd23f', true); talk(api, api.pick(PACH_LINES.jackpot));
    } else if (b.pay > 0) {
      bank(api, b.pay); api.sfx.ding(2); api.burst(m.x, PACH.binY - 20, b.c, 8, 140);
    } else {
      api.sfx.nope(); api.say(m.x, PACH.binTop - 30, 'MORTIMER KEEPS IT', '#c9d0ff'); talk(api, api.pick(PACH_LINES.keep));
    }
  }
  const PACH_LINES = {
    start: ['Ten marbles. Aim for my face.', 'Pachinko! Imported. From the back room.'],
    jackpot: ['My face! Beautiful!', 'Right in the shell!', 'You have a gift.'],
    keep: ['Mine! Thank you.', 'The house says thanks.', 'That goes in my piggy shell.'],
    rush: ['Use them or lose them!', 'Clock! Drop, drop, drop!'],
    end: ['That was relaxing. For me.', 'Pachinko closed. Pegs need a nap.'],
  };
  const pachinko = {
    name: 'Shell Pachinko', title: '🎰 PACHINKO 🎰', over: 'BALLS OUT!', count: 'Snail jackpots 🐌',
    tip: 'BONUS ROUND! Move to aim, tap to drop a marble. Hit the snail bucket', seconds: 20, ball: false,
    start(api) {
      Object.assign(api.state, { pegs: pegField(), balls: [], left: PACH.marbles, cd: 0, binFlash: BINS.map(() => 0), rushT: 0, rushed: false, done: false });
      talk(api, api.pick(PACH_LINES.start), 3);
    },
    tick(api, dt) {
      const st = api.state;
      settle(api, dt);
      st.cd -= dt;
      for (const p of st.pegs) p.flash = Math.max(0, p.flash - dt);
      for (let k = 0; k < st.binFlash.length; k++) st.binFlash[k] = Math.max(0, st.binFlash[k] - dt);
      // the last seconds drop what is left
      if (api.left < 4 && st.left > 0 && (st.rushT -= dt) <= 0) {
        if (!st.rushed) { st.rushed = true; talk(api, api.pick(PACH_LINES.rush)); }
        st.rushT = 0.35; st.cd = 0; dropMarble(api);
      }
      for (const m of st.balls) {
        for (let i = 0; i < 4; i++) moveMarble(api, m, dt / 4);
        if (m.y > PACH.binY - PACH.r) landMarble(api, m);
      }
      st.balls = st.balls.filter((m) => !m.dead);
      if (!st.done && st.left === 0 && !st.balls.length) { st.done = true; talk(api, api.pick(PACH_LINES.end)); cashOut(api); api.end(); }
    },
    draw(api, ctx, t) {
      const st = api.state, W = api.W;
      for (let k = 0; k < BINS.length; k++) {
        const b = BINS[k], x = k * PACH.binW, f = st.binFlash[k];
        ctx.globalAlpha = 0.25 + f; ctx.fillStyle = b.c; ctx.fillRect(x + 3, PACH.binTop, PACH.binW - 6, PACH.binY - PACH.binTop);
        ctx.globalAlpha = 1; label(ctx, b.text, x + PACH.binW / 2, PACH.binY - 22, f > 0 ? '#ffffff' : b.c, b.pay >= 16 ? 18 : 14);
      }
      ctx.fillStyle = '#c9d0ff';
      for (let k = 1; k < BINS.length; k++) ctx.fillRect(k * PACH.binW - 2, PACH.binTop, 4, PACH.binY - PACH.binTop);
      ctx.fillRect(0, PACH.binY, W, 3);
      for (const p of st.pegs) {
        ctx.fillStyle = p.flash > 0 ? '#ffd23f' : '#9aa6e8';
        ctx.beginPath(); ctx.arc(p.x, p.y, PACH.pegR + (p.flash > 0 ? 2 : 0), 0, TAU); ctx.fill();
      }
      for (const m of st.balls) {
        ctx.fillStyle = '#e8ecff'; ctx.beginPath(); ctx.arc(m.x, m.y, PACH.r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(m.x - 3, m.y - 3, 3, 0, TAU); ctx.fill();
      }
      // the dropper with Mortimer on it
      const x = api.clamp(api.paddle.x, 20, W - 20);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(x, PACH.dropY + 14); ctx.lineTo(x, 220); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ff7ad9'; ctx.beginPath(); ctx.roundRect(x - 22, PACH.dropY - 2, 44, 12, 6); ctx.fill();
      if (st.left > 0) { ctx.fillStyle = '#e8ecff'; ctx.beginPath(); ctx.arc(x, PACH.dropY + 16, PACH.r, 0, TAU); ctx.fill(); }
      snail(api, ctx, x, PACH.dropY - 18, 1.4, 1, st.cd > 0.1);
      label(ctx, '×' + st.left, x + (x > W - 80 ? -46 : 46), PACH.dropY + 16, st.left ? '#e8ecff' : '#8a8fb0', 20);
      drawBank(api, ctx);
      drawTalk(api, ctx, x, PACH.dropY - 44);
    },
    tap(api) { dropMarble(api); },
  };

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Lettuce Tower: catch salad parts on the paddle. The stack leans when the paddle moves fast. A tap serves it.
  const TOWER = { foods: ['🥬', '🍅', '🧀', '🥒', '🍞', '🥚'], h: 24, fall: 240, maxPay: 64, seatX: 400, seatY: 190 };
  const TOWER_LINES = {
    start: ['Lunch time! Build me a salad.', 'I am hungry. Stack it high.'],
    warn: ['Careful!', 'It wobbles!', 'Steady, steady...'],
    fall: ['My lunch!', 'NOOO! My salad!', 'That was art!'],
    empty: ['An empty plate? Rude.', 'I cannot eat air.'],
    end: ['Kitchen closed!', 'Burp. Thank you.'],
  };
  function review(h) {
    if (h <= 2) return 'A snack. One star.';
    if (h <= 4) return 'Crunchy. Three stars.';
    if (h <= 6) return 'Delicious! Four stars!';
    if (h <= 8) return 'MASTERPIECE! I weep!';
    return 'Too much. Still five stars.';
  }
  // x offset of stack item i (1 = bottom) for a lean
  const lean = (st, i) => st.lean * i * i * 0.9;
  function serve(api) {
    const st = api.state, h = st.stack.length;
    if (st.served) return;
    if (!h) { talk(api, api.pick(TOWER_LINES.empty)); api.sfx.nope(); return; }
    st.served = st.stack.map((f, i) => ({ f, x: api.paddle.x + lean(st, i + 1), y: api.PADDLE_Y - 8 - TOWER.h * (i + 0.5), t: 0 }));
    st.stack = []; st.lean = 0; api.sfx.riser();
  }
  function eat(api, n) {
    const st = api.state, pay = Math.min(n * n, TOWER.maxPay);
    bank(api, pay); st.chew = 0.8;
    api.say(TOWER.seatX - 60, TOWER.seatY + 50, '+' + pay + ' 🪙', '#ffd23f', n >= 7);
    talk(api, review(n), 2.6);
    if (n >= 7) { api.sfx.jackpot(); api.flash('#7cf2a8', 0.2); } else api.sfx.ding(Math.min(n, 6));
  }
  function topple(api) {
    const st = api.state;
    st.stack.forEach((f, i) => st.debris.push({ f, x: api.paddle.x + lean(st, i + 1), y: api.PADDLE_Y - TOWER.h * (i + 0.5), vx: Math.sign(st.lean) * api.rand(60, 260), vy: api.rand(-320, -120), rot: 0 }));
    api.burst(api.paddle.x, api.PADDLE_Y - 60, '#7cf2a8', 24, 260); api.burst(api.paddle.x, api.PADDLE_Y - 60, '#ff6b8b', 16, 220);
    api.sfx.squawk(); api.shake(6); talk(api, api.pick(TOWER_LINES.fall));
    st.stack = []; st.lean = 0;
  }
  const tower = {
    name: 'Lettuce Tower', title: '🥬 TOWER 🥬', over: 'LUNCH OVER!', count: 'Salad parts stacked 🥗',
    tip: 'BONUS ROUND! Stack the salad on your paddle. Tap to serve. Do not rush', seconds: 20, ball: false,
    start(api) {
      Object.assign(api.state, { items: [], stack: [], debris: [], served: null, lean: 0, spawnT: 1, warnT: 0, chew: 0, ate: false });
      talk(api, api.pick(TOWER_LINES.start), 3);
    },
    tick(api, dt) {
      const st = api.state, p = api.paddle;
      settle(api, dt);
      st.chew = Math.max(0, st.chew - dt);
      if ((st.spawnT -= dt) <= 0) {
        st.spawnT = api.rand(0.6, 0.9);
        st.items.push({ f: api.pick(TOWER.foods), x: api.rand(30, api.W - 30), y: api.HUD_H + 10, rot: api.rand(-1, 1) });
      }
      const h = st.stack.length, topX = p.x + lean(st, h), topY = api.PADDLE_Y - 2 - TOWER.h * h;
      for (const it of st.items) {
        it.y += TOWER.fall * dt; it.rot += dt * 2;
        if (it.y < topY - 14 || it.y > topY + 16) continue;
        if (Math.abs(it.x - topX) > (h ? 30 : p.w / 2 + 8)) continue;
        it.dead = true; st.stack.push(it.f); api.score(1); api.sfx.ping(h);
      }
      st.items = st.items.filter((it) => !it.dead && it.y < api.H + 20);
      // the stack leans against the paddle's speed; a tall stack leans more
      const n = st.stack.length, target = (-(p.vx || 0) / 600) * (n / 7);
      st.lean += (target - st.lean) * Math.min(1, dt * 4);
      if (n < 2) st.lean = api.clamp(st.lean, -0.5, 0.5);
      if (Math.abs(st.lean) > 0.65 && (st.warnT -= dt) <= 0) { st.warnT = 0.8; api.sfx.eek(); talk(api, api.pick(TOWER_LINES.warn), 1); }
      if (Math.abs(st.lean) > 1) topple(api);
      for (const d of st.debris) { d.vy += 900 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += dt * 8; }
      st.debris = st.debris.filter((d) => d.y < api.H + 30);
      if (st.served) {
        for (const s of st.served) s.t += dt * 2;
        if (st.served[0].t >= 1) { eat(api, st.served.length); st.served = null; }
      }
      // at the end he eats what is on the paddle
      if (api.left < 0.5 && !st.ate) {
        st.ate = true;
        if (st.stack.length) { eat(api, st.stack.length); st.stack = []; } else talk(api, api.pick(TOWER_LINES.end));
      }
    },
    draw(api, ctx, t) {
      const st = api.state, p = api.paddle, sx = TOWER.seatX, sy = TOWER.seatY;
      // his table
      ctx.fillStyle = '#7a4a1e'; ctx.fillRect(sx - 70, sy + 22, 120, 8); ctx.fillRect(sx - 60, sy + 30, 6, 40); ctx.fillRect(sx + 38, sy + 30, 6, 40);
      emoji(ctx, '🍽️', sx - 40, sy + 12, 30);
      snail(api, ctx, sx + 14, sy - 4, 2, -1, st.chew > 0 && Math.sin(t * 30) > 0);
      for (const it of st.items) emoji(ctx, it.f, it.x, it.y, 30, Math.sin(it.rot) * 0.4);
      const n = st.stack.length, danger = Math.abs(st.lean) > 0.65 ? Math.sin(t * 40) * 2 : 0;
      st.stack.forEach((f, i) => emoji(ctx, f, p.x + lean(st, i + 1) + danger, api.PADDLE_Y - 8 - TOWER.h * (i + 0.5), 30, st.lean * 0.3));
      if (n) label(ctx, n + ' 🥗 = ' + Math.min(n * n, TOWER.maxPay), p.x + lean(st, n), api.PADDLE_Y - 30 - TOWER.h * n, '#ffffff', 14);
      for (const d of st.debris) emoji(ctx, d.f, d.x, d.y, 30, d.rot);
      if (st.served) {
        for (const s of st.served) {
          const k = Math.min(1, s.t), x = s.x + (sx - 40 - s.x) * k, y = s.y + (sy + 10 - s.y) * k - Math.sin(k * Math.PI) * 120;
          emoji(ctx, s.f, x, y, 30 * (1 - k * 0.5));
        }
      }
      if (n >= 2) label(ctx, 'TAP TO SERVE', api.W / 2, api.PADDLE_Y + 50, Math.sin(t * 6) > 0 ? '#7cf2a8' : '#ffffff', 16);
      drawBank(api, ctx);
      drawTalk(api, ctx, sx + 14, sy - 40);
    },
    tap(api) { serve(api); },
  };

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Snail Rally: Mortimer drives; the road comes down. Drive over coins, miss the cones. A tap is a slime boost.
  const KART = { y: 676, speed: 380, boostSpeed: 640, boost: 1.5, charges: 3, left: 50, right: 430, line: 6, gap: 36 };
  const KART_LINES = {
    start: ['Vroom. Slowly. Then fast.', 'Shell on wheels! Mind my lettuce.'],
    hit: ['My shell! My paint!', 'Who put a cone there?!', 'I want a lawyer.', 'Ow. Ow. Ow.'],
    pigeon: ['Not you again!', 'Pigeon! Insurance!'],
    boost: ['SLIME BOOST!', 'Wheeeee!'],
    line: ['Every coin! Nice!', 'Ka-ching!'],
    end: ['FINISH! Shell yeah!', 'First place! Only place!'],
  };
  const PROPS = ['🌵', '🌴', '🏪', '🪧', '🌳'];
  const OBST = { cone: '🚧', puddle: '💧', pigeon: '🐦' };
  function kartSpawn(api) {
    const st = api.state, y = api.HUD_H - 30;
    st.wave++;
    if (st.wave % 2) {
      const k = api.pick(['cone', 'cone', 'puddle', 'pigeon']), x = api.rand(KART.left + 30, KART.right - 30);
      st.things.push({ k, x, y, vx: k === 'pigeon' ? api.pick([-70, 70]) : 0 });
      st.lastObst = x;
      if (api.time > 8 && Math.random() < 0.5) st.things.push({ k: 'cone', x: api.clamp(x + api.pick([-150, 150]), KART.left + 30, KART.right - 30), y, vx: 0 });
      return;
    }
    // a coin line away from the last obstacle, straight or slanted
    let x0 = api.rand(KART.left + 40, KART.right - 40);
    if (Math.abs(x0 - st.lastObst) < 100) x0 = st.lastObst > api.W / 2 ? x0 - 140 : x0 + 140;
    x0 = api.clamp(x0, KART.left + 40, KART.right - 40);
    const dx = api.pick([0, 0, -14, 14]), id = st.wave;
    st.lines[id] = { got: 0, lost: false };
    for (let i = 0; i < KART.line; i++) st.things.push({ k: 'coin', x: api.clamp(x0 + dx * i, KART.left + 20, KART.right - 20), y: y - i * KART.gap, line: id });
  }
  function kartHit(api, o) {
    const st = api.state;
    o.dead = true;
    if (st.boost > 0) { api.sfx.whack(); api.burst(o.x, o.y, '#9cff57', 12, 200); api.say(o.x, o.y - 20, 'SLIMED!', '#9cff57'); return; }
    st.spin = 0.9; api.stun(1); api.shake(5);
    if (o.k === 'pigeon') { api.sfx.squawk(); talk(api, api.pick(KART_LINES.pigeon), 1.6); } else { api.sfx.boom(true); talk(api, api.pick(KART_LINES.hit), 1.6); }
    // the coins of the next line are lost
    let next = null;
    for (const c of st.things) if (c.k === 'coin' && !c.dead && c.y < KART.y && (!next || c.y > next.y)) next = c;
    if (!next) return;
    st.lines[next.line].lost = true;
    for (const c of st.things) if (c.k === 'coin' && c.line === next.line && !c.dead) { c.dead = true; api.burst(c.x, c.y, '#8a8fb0', 3, 80); }
  }
  const kart = {
    name: 'Snail Rally', title: '🏁 SNAIL RALLY 🏁', over: 'CHECKERED FLAG!', count: 'Coins collected 🪙',
    tip: 'BONUS ROUND! Steer over the coins, dodge the cones. Tap for a slime boost', seconds: 20, ball: false, hidePaddle: true,
    start(api) {
      Object.assign(api.state, { things: [], props: [], lines: {}, wave: 0, spawnT: 1.4, propT: 0, dist: 0, boost: 0, charges: KART.charges, spin: 0, lastObst: -999, finish: null, x: api.W / 2 });
      talk(api, api.pick(KART_LINES.start), 3);
    },
    tick(api, dt) {
      const st = api.state;
      settle(api, dt);
      st.boost = Math.max(0, st.boost - dt); st.spin = Math.max(0, st.spin - dt);
      st.x = api.clamp(api.paddle.x, KART.left + 20, KART.right - 20);
      const v = (st.boost > 0 ? KART.boostSpeed : KART.speed) * (st.spin > 0 ? 0.5 : 1);
      st.dist += v * dt;
      if (api.left > 2.6 && (st.spawnT -= dt) <= 0) { st.spawnT = 0.75; kartSpawn(api); }
      if (api.left <= 2.6 && !st.finish) st.finish = { y: api.HUD_H - 20, crossed: false };
      if ((st.propT -= dt) <= 0) { st.propT = 0.35; st.props.push({ f: api.pick(PROPS), x: api.pick([22, api.W - 22]), y: api.HUD_H - 20 }); }
      for (const pr of st.props) pr.y += v * dt;
      st.props = st.props.filter((pr) => pr.y < api.H + 30);
      for (const o of st.things) {
        o.y += v * dt; o.x += (o.vx || 0) * dt;
        if (o.k === 'pigeon' && (o.x < KART.left + 20 || o.x > KART.right - 20)) o.vx = -o.vx;
        if (o.dead || Math.abs(o.y - KART.y) > 24) continue;
        if (o.k !== 'coin') { if (Math.abs(o.x - st.x) < 34) kartHit(api, o); continue; }
        if (Math.abs(o.x - st.x) > 30) continue;
        const line = st.lines[o.line];
        o.dead = true; line.got++;
        bank(api, st.boost > 0 ? 2 : 1); api.score(1); api.sfx.coin(line.got);
        if (line.got === KART.line) { bank(api, 2); api.say(st.x, KART.y - 60, 'FULL LINE!', '#ffd23f'); if (Math.random() < 0.4) talk(api, api.pick(KART_LINES.line), 1.4); }
      }
      st.things = st.things.filter((o) => !o.dead && o.y < api.H + 40);
      if (st.finish) {
        st.finish.y += v * dt;
        if (!st.finish.crossed && st.finish.y >= KART.y) {
          st.finish.crossed = true; api.sfx.jackpot(); api.flash('#ffffff', 0.25); talk(api, api.pick(KART_LINES.end));
          for (let i = 0; i < 4; i++) api.burst(api.rand(60, 420), KART.y - 40, api.pick(['#ffd23f', '#ff6b8b', '#5ef0ff', '#9cff57']), 14, 260);
        }
      }
    },
    draw(api, ctx, t) {
      const st = api.state, W = api.W, top = api.HUD_H;
      ctx.fillStyle = 'rgba(30,34,52,0.75)'; ctx.fillRect(KART.left, top, KART.right - KART.left, api.H - top);
      ctx.fillStyle = 'rgba(70,160,90,0.35)'; ctx.fillRect(0, top, KART.left, api.H - top); ctx.fillRect(KART.right, top, W - KART.right, api.H - top);
      // kerbs and lane dashes move with the road
      const off = st.dist % 60;
      for (let y = top - 60 + off; y < api.H; y += 60) {
        ctx.fillStyle = '#ff5c5c'; ctx.fillRect(KART.left - 6, y, 6, 30); ctx.fillRect(KART.right, y, 6, 30);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(KART.left - 6, y + 30, 6, 30); ctx.fillRect(KART.right, y + 30, 6, 30);
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(177, y, 4, 30); ctx.fillRect(303, y, 4, 30);
      }
      for (const pr of st.props) emoji(ctx, pr.f, pr.x, pr.y, 28);
      if (st.finish) {
        for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) {
          ctx.fillStyle = (i + j) & 1 ? '#ffffff' : '#1b1f33'; ctx.fillRect(KART.left + i * 24, st.finish.y + j * 12, 24, 12);
        }
      }
      for (const o of st.things) {
        if (o.k !== 'coin') { emoji(ctx, OBST[o.k], o.x, o.y, o.k === 'puddle' ? 40 : 36, o.k === 'pigeon' ? Math.sin(t * 20) * 0.2 : 0); continue; }
        const sq = Math.abs(Math.cos(t * 5 + o.y * 0.02));
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.ellipse(o.x, o.y, 10 * sq + 2, 10, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#b38600'; ctx.lineWidth = 2; ctx.stroke();
      }
      // the kart, with a slime trail during a boost
      const x = st.x, y = KART.y, rot = st.spin > 0 ? st.spin * 14 : 0;
      if (st.boost > 0) { ctx.fillStyle = 'rgba(156,255,87,0.5)'; ctx.beginPath(); ctx.ellipse(x, y + 60, 18, 50, 0, 0, TAU); ctx.fill(); }
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.fillStyle = '#1b1f33'; for (const [wx, wy] of [[-29, -8], [29, -8], [-29, 14], [29, 14]]) { ctx.beginPath(); ctx.roundRect(wx - 6, wy - 8, 12, 16, 4); ctx.fill(); }
      ctx.fillStyle = st.boost > 0 ? '#9cff57' : '#ff5c5c'; ctx.beginPath(); ctx.roundRect(-24, -14, 48, 34, 10); ctx.fill();
      ctx.restore();
      snail(api, ctx, x, y - 4, 1.5, 1, st.spin > 0 && Math.sin(t * 30) > 0, rot);
      for (let i = 0; i < KART.charges; i++) emoji(ctx, i < st.charges ? '🟢' : '⚪', 26 + i * 30, api.H - 60, 22);
      if (st.charges) label(ctx, 'TAP = BOOST', 56, api.H - 34, '#9cff57', 12);
      drawBank(api, ctx);
      drawTalk(api, ctx, x, y - 34);
    },
    tap(api) {
      const st = api.state;
      if (!st.charges || st.boost > 0) return;
      st.charges--; st.boost = KART.boost; api.sfx.zap(); api.flash('#9cff57', 0.15); talk(api, api.pick(KART_LINES.boost), 1.2);
    },
  };

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Shell Karaoke: notes fall in four lanes on the beat. Be under a note when it reaches the paddle.
  const KARA = { lanes: [72, 184, 296, 408], colors: ['#ff7ad9', '#5ef0ff', '#ffd23f', '#9cff57'],top: 236, beats: 3, late: 0.22, period: 0.52, singX: 240, singY: 150 };
  const KARA_LINES = {
    start: ['This one is for my mother.', 'Ahem. Mi mi mi. Ready!'],
    streak: ['You are my backup band!', 'The crowd goes wild!', 'Encore! Encore!'],
    miss: ['Wrong note! Your fault.', 'I forgot the words!'],
    end: ['Thank you! I am here all week.', 'No autographs. Slime only.'],
  };
  const WRONG = ['🎤 ...and I ate the whole shelf!', '🎤 ...my shell is full of soup!', '🎤 ...lettuce be together!', '🎤 ...brick by brick by sock!',
    '🎤 ...I am a slimy disco star!', '🎤 ...no change, no change, no change!', '🎤 ...la la la... receipt!', '🎤 ...oh salad of my heart... cucumber!'];
  function karaBeat(api) {
    const st = api.state, T = st.period * KARA.beats;
    if (api.time < 0.8 || api.left < T + 0.3 || Math.random() < 0.15) return;
    st.lane = api.clamp(st.lane + api.pick([-1, 0, 1, 1, -1, 2, -2]), 0, 3);
    st.notes.push({ lane: st.lane, x: KARA.lanes[st.lane], t0: api.time, T, y: KARA.top });
  }
  function karaCatch(api, n, perfect) {
    const st = api.state;
    n.done = 'hit'; st.streak++; st.best = Math.max(st.best, st.streak);
    const pay = (perfect ? 2 : 1) + Math.min(2, Math.floor(st.streak / 10));
    bank(api, pay); api.score(1);
    api.say(n.x, api.PADDLE_Y - 50, perfect ? 'PERFECT' : 'fine', perfect ? '#ffd23f' : '#c9d0ff', perfect);
    if (perfect) { api.sfx.ping(st.streak); api.burst(n.x, api.PADDLE_Y - 10, '#ffd23f', 8, 160); } else api.sfx.tick();
    st.glow = 0.3;
    if (st.streak % 10 === 0) { talk(api, api.pick(KARA_LINES.streak), 1.6); api.say(api.W / 2, 300, 'STREAK ' + st.streak + '!', '#7cf2a8', true); }
  }
  function karaMiss(api, n) {
    const st = api.state;
    n.done = 'miss'; st.streak = 0; st.oops = 0.5;
    api.sfx.nope(); api.say(KARA.singX, KARA.singY + 70, api.pick(WRONG), '#ff9aa8');
    if (Math.random() < 0.3) talk(api, api.pick(KARA_LINES.miss), 1.4);
  }
  const karaoke = {
    name: 'Shell Karaoke', title: '🎤 KARAOKE 🎤', over: 'MIC DROP!', count: 'Notes caught 🎵',
    tip: 'BONUS ROUND! Be under each note when it lands. On the beat pays double', seconds: 20, ball: false,
    start(api) {
      Object.assign(api.state, { notes: [], lane: 1, lastB: 0, period: KARA.period, beatT: 0, realT: -9, streak: 0, best: 0, glow: 0, oops: 0, ended: false });
      talk(api, api.pick(KARA_LINES.start), 3);
    },
    tick(api, dt) {
      const st = api.state, p = api.paddle, line = api.PADDLE_Y;
      settle(api, dt);
      st.glow = Math.max(0, st.glow - dt); st.oops = Math.max(0, st.oops - dt);
      // a rising edge of the music beat; without music an own clock keeps the time
      const b = api.beat(), edge = b > st.lastB + 0.4;
      st.lastB = b;
      if (edge) {
        const gap = api.time - st.beatT;
        if (api.time - st.realT < 1.5 && gap > 0.3 && gap < 1) st.period += (gap - st.period) * 0.4;
        st.realT = st.beatT = api.time; karaBeat(api);
      } else if (api.time - st.realT > 1.5 && api.time - st.beatT >= st.period) { st.beatT += st.period; karaBeat(api); }
      for (const n of st.notes) {
        const age = api.time - n.t0;
        n.y = KARA.top + (line - KARA.top) * (age / n.T);
        if (n.done) continue;
        const under = Math.abs(p.x - n.x) <= p.w / 2 + 8;
        if (age >= n.T && !n.checked) { n.checked = true; if (under) { karaCatch(api, n, true); continue; } }
        if (n.checked && under) karaCatch(api, n, false);
        else if (age >= n.T + KARA.late) karaMiss(api, n);
      }
      st.notes = st.notes.filter((n) => n.done !== 'hit' && n.y < api.H + 30);
      if (!st.ended && api.left < 0.6) { st.ended = true; talk(api, api.pick(KARA_LINES.end)); }
    },
    draw(api, ctx, t) {
      const st = api.state, line = api.PADDLE_Y, b = api.beat();
      // spotlight and stage
      ctx.fillStyle = 'rgba(255,240,170,0.08)'; ctx.beginPath(); ctx.moveTo(KARA.singX - 30, api.HUD_H); ctx.lineTo(KARA.singX + 30, api.HUD_H); ctx.lineTo(KARA.singX + 110, KARA.singY + 40); ctx.lineTo(KARA.singX - 110, KARA.singY + 40); ctx.fill();
      ctx.fillStyle = '#7a4a1e'; ctx.fillRect(KARA.singX - 16, KARA.singY + 18, 32, 6); ctx.fillRect(KARA.singX - 12, KARA.singY + 24, 4, 28); ctx.fillRect(KARA.singX + 8, KARA.singY + 24, 4, 28);
      snail(api, ctx, KARA.singX, KARA.singY, 2.2, st.oops > 0 ? -1 : 1, st.oops > 0, Math.sin(t * 6) * 0.06 + b * 0.05);
      emoji(ctx, '🎤', KARA.singX + 52, KARA.singY - 6, 26, -0.4);
      for (const x of KARA.lanes) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x - 2, KARA.top, 4, line - KARA.top);
        ctx.strokeStyle = 'rgba(255,210,63,' + (0.3 + b * 0.5) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, line - 4, 18 + b * 4, 0, TAU); ctx.stroke();
      }
      for (const n of st.notes) {
        ctx.globalAlpha = n.done === 'miss' ? 0.35 : 1;
        ctx.fillStyle = KARA.colors[n.lane]; ctx.beginPath(); ctx.arc(n.x, n.y, 17, 0, TAU); ctx.fill();
        label(ctx, '♪', n.x, n.y + 1, '#1b1f33', 24);
      }
      ctx.globalAlpha = 1;
      if (st.streak >= 3) label(ctx, '🔥 ' + st.streak, 50, api.HUD_H + 22, '#ffd23f', 18);
      drawBank(api, ctx);
      drawTalk(api, ctx, KARA.singX, KARA.singY - 44);
    },
  };

  window.BBRounds = { pachinko, tower, kart, karaoke };
})();
