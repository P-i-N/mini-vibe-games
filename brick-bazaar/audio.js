'use strict';
/* Brick Bazaar audio: synthesised sound effects and a generative music loop. No samples.
   Effects take their pitch from the chord that the music plays at that moment. */
window.BBAudio = (() => {
  let ctx = null, sfxBus = null, musicBus = null, musicFilter = null, noiseBuf = null;
  let sfxOn = true, musicOn = true;

  function init() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; return; }
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
      const master = ctx.createGain(); master.gain.value = 0.9;
      master.connect(comp); comp.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 900;
      musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? MUSIC_VOL : 0;
      musicBus.connect(musicFilter); musicFilter.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      nextT = ctx.currentTime + 0.1;
      setInterval(schedule, 40);
    }
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
  }
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  // ---------- building blocks ----------
  // o: type, vol, to (slide target Hz), at (delay s), attack
  function tone(f, dur, o = {}) {
    const t0 = ctx.currentTime + (o.at || 0);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.05, t0 + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }
  // o: type (filter), f, to, q, vol, at
  function noise(dur, o = {}) {
    const t0 = ctx.currentTime + (o.at || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'lowpass'; f.Q.value = o.q || 0.7;
    f.frequency.setValueAtTime(o.f || 1200, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol || 0.05, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.03);
  }
  // ---------- harmony ----------
  // The music loops over four chords. Every pitched effect takes its notes from the chord that sounds now,
  // so effects never clash with the music. Random picks among the chord tones keep repeats from sounding flat.
  const CHORDS = [[45, 57, 60, 64], [41, 53, 57, 60], [48, 55, 60, 64], [43, 55, 59, 62]]; // bass + triad, MIDI: Am F C G
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const ri = (n) => (Math.random() * n) | 0;
  const barQ = []; // bar changes that are scheduled but not audible yet
  let curBar = 0;
  function chord() {
    while (barQ.length && barQ[0].t <= ctx.currentTime) curBar = barQ.shift().bar;
    return CHORDS[curBar];
  }
  // Chord tone i, counted upward through the octaves. reg moves the whole ladder by octaves (0 = around 200-330 Hz).
  const ct = (reg, i) => hz(chord()[1 + (i % 3)] + 12 * (Math.floor(i / 3) + reg));
  const root = () => hz(chord()[0]); // bass note, 87-131 Hz

  // Wraps a sound so it respects mute and cannot retrigger faster than `gap` ms.
  const last = {};
  function fx(name, gap, fn) {
    return (...a) => {
      if (!sfxOn || !ctx || ctx.state !== 'running') return;
      if (gap) { const t = performance.now(); if (last[name] && t - last[name] < gap) return; last[name] = t; }
      fn(...a);
    };
  }
  const arp = (notes, step, o) => notes.forEach((f, i) => tone(f, o.dur || 0.12, Object.assign({}, o, { at: i * step })));
  const climb = (reg, from, n) => Array.from({ length: n }, (_, k) => ct(reg, from + k));

  const defs = {
    paddle: [30, () => { const r = root(); tone(r * 2, 0.1, { type: 'sine', vol: 0.14, to: r }); tone(ct(1, ri(3)), 0.03, { vol: 0.025 }); }],
    wall: [50, () => tone(ct(1, ri(3)), 0.03, { type: 'triangle', vol: 0.03 })],
    launch: [0, () => { const f = ct(0, 0); tone(f, 0.1, { type: 'triangle', vol: 0.06, to: f * 2 }); }],
    // combo = bricks broken since the last paddle touch; the pitch climbs the chord with it
    brick: [28, (combo = 0) => tone(ct(1, Math.min(combo, 6) + ri(2)), 0.05, { type: 'triangle', vol: 0.045 })],
    pop: [26, (combo = 0) => {
      const i = Math.min(combo, 7);
      tone(ct(1, i), 0.12, { type: 'triangle', vol: 0.075 });
      tone(ct(1, i + 1 + ri(2)), 0.06, { type: 'sine', vol: 0.03 });
      noise(0.05, { type: 'highpass', f: 3000, vol: 0.035 });
    }],
    stone: [40, () => { tone(root(), 0.05, { vol: 0.03 }); noise(0.04, { f: 800, vol: 0.03 }); }],
    coin: [38, (chain = 0) => {
      const i = Math.min(chain, 5);
      tone(ct(2, i), 0.07, { type: 'sine', vol: 0.05 }); tone(ct(2, i + 1 + ri(2)), 0.11, { type: 'sine', vol: 0.04, at: 0.05 });
    }],
    pu: [0, () => arp(climb(1, ri(3), 4), 0.05, { type: 'triangle', vol: 0.06, dur: 0.1 })],
    shot: [45, () => { const f = ct(2, ri(3)); tone(f, 0.05, { type: 'sawtooth', vol: 0.018, to: f / 4 }); }],
    laser: [60, () => { const f = ct(3, ri(3)); tone(f, 0.13, { type: 'sawtooth', vol: 0.028, to: f / 4 }); }],
    rocket: [80, () => noise(0.25, { type: 'bandpass', f: 500, to: 2600, q: 2, vol: 0.06 })],
    boom: [45, (small) => {
      const v = small ? 0.5 : 1, r = root();
      noise(0.38, { f: 1500, to: 70, vol: 0.24 * v }); tone(r, 0.32, { type: 'sine', vol: 0.22 * v, to: r / 2 });
    }],
    zap: [50, () => { const f = ct(3, ri(3)); noise(0.09, { type: 'highpass', f: 2500, vol: 0.045 }); tone(f, 0.09, { type: 'sawtooth', vol: 0.028, to: f / 8 }); }],
    lose: [0, () => { const f = ct(1, 0); tone(f, 0.5, { type: 'sawtooth', vol: 0.08, to: f / 4 }); noise(0.3, { f: 600, vol: 0.08 }); }],
    over: [0, () => arp(climb(1, 0, 4).reverse(), 0.16, { type: 'triangle', vol: 0.08, dur: 0.3 })],
    buy: [0, () => {
      arp(climb(2, ri(3), 3), 0.06, { type: 'triangle', vol: 0.07, dur: 0.12 });
      noise(0.06, { type: 'highpass', f: 5000, vol: 0.04, at: 0.12 });
    }],
    nope: [0, () => { tone(ct(0, 1), 0.12, { vol: 0.05 }); tone(ct(0, 0), 0.14, { vol: 0.05, at: 0.1 }); }],
    clear: [0, () => {
      arp(climb(1, 0, 5), 0.08, { type: 'triangle', vol: 0.08, dur: 0.16 });
      for (const f of climb(1, 0, 4)) tone(f, 0.6, { type: 'triangle', vol: 0.04, at: 0.42 });
    }],
    net: [40, () => { const f = ct(0, 0); tone(f, 0.14, { type: 'sine', vol: 0.09, to: f * 2 }); }],
    fever: [0, () => {
      const f = ct(0, 0);
      tone(f, 0.5, { type: 'sawtooth', vol: 0.045, to: f * 8 });
      arp(climb(1, 0, 6), 0.06, { type: 'square', vol: 0.035, dur: 0.1 });
    }],
    star: [0, (i = 0) => { const f = ct(2, i); tone(f, 0.3, { type: 'sine', vol: 0.1 }); tone(f * 2, 0.2, { type: 'sine', vol: 0.04, at: 0.03 }); }],
    tick: [45, () => tone(ct(3, ri(3)), 0.02, { vol: 0.02 })],
    tab: [0, () => tone(ct(2, ri(3)), 0.05, { type: 'triangle', vol: 0.05 })],
    warn: [0, () => { const f = ct(1, 0), g = ct(1, 1); for (let i = 0; i < 3; i++) tone(f, 0.22, { vol: 0.05, to: g, at: i * 0.3 }); }],
    bossHit: [40, () => { tone(root(), 0.07, { vol: 0.05 }); noise(0.05, { f: 1500, vol: 0.05 }); }],
    bossDie: [0, () => {
      const r = root();
      for (let i = 0; i < 4; i++) { noise(0.4, { f: 1500, to: 70, vol: 0.2, at: i * 0.14 }); tone(r, 0.35, { type: 'sine', vol: 0.18, to: r / 2, at: i * 0.14 }); }
    }],
    foeHit: [35, () => tone(ct(2, ri(3)), 0.04, { vol: 0.03 })],
    foePop: [30, () => { const f = ct(1, ri(3)); tone(f, 0.13, { type: 'triangle', vol: 0.06, to: f * 2 }); noise(0.06, { type: 'highpass', f: 2000, vol: 0.04 }); }],
    spit: [60, () => { const f = ct(0, ri(3)); tone(f, 0.1, { type: 'sine', vol: 0.04, to: f / 2 }); }],
    bossFire: [60, () => { const f = ct(0, 0); tone(f, 0.15, { type: 'sawtooth', vol: 0.04, to: f / 2 }); }],
    steal: [60, () => { const f = ct(1, ri(3)); tone(f, 0.08, { vol: 0.03, to: f / 2 }); }],
    stun: [0, () => { const r = root(); tone(r * 2, 0.25, { type: 'sawtooth', vol: 0.05, to: r }); }],
    streak: [0, (tier = 1) => { const i = Math.min(tier, 5); tone(ct(1, i), 0.16, { type: 'triangle', vol: 0.07 }); tone(ct(1, i + 2), 0.2, { type: 'triangle', vol: 0.05, at: 0.07 }); }],
    split: [60, () => { const f = ct(1, ri(3)), g = ct(2, ri(3)); tone(f, 0.1, { type: 'triangle', vol: 0.05, to: f * 2 }); tone(g, 0.1, { type: 'triangle', vol: 0.04, to: g * 2, at: 0.05 }); }],
    relic: [0, () => arp(climb(1, 0, 7), 0.07, { type: 'sine', vol: 0.07, dur: 0.3 })],
    blimp: [60, () => { tone(ct(3, 0), 0.08, { type: 'sine', vol: 0.06 }); tone(ct(3, 1 + ri(2)), 0.12, { type: 'sine', vol: 0.06, at: 0.07 }); }],
    firework: [110, () => { const r = root(); noise(0.25, { type: 'bandpass', f: 1800, q: 1, vol: 0.035 }); tone(r, 0.12, { type: 'sine', vol: 0.05, to: r / 2 }); }],
    life: [0, () => arp(climb(2, ri(2), 3), 0.08, { type: 'sine', vol: 0.08, dur: 0.18 })],
  };
  const sfx = {};
  for (const k in defs) sfx[k] = fx(k, defs[k][0], defs[k][1]);

  // ---------- music: a 4-bar chord loop, scheduled slightly ahead of the audio clock ----------
  const MUSIC_VOL = 0.5;
  const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
  const TEMPO = [96, 112, 128], CUTOFF = [900, 2400, 6500];
  let step = 0, nextT = 0, level = 0;

  function mnote(f, t, dur, type, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.03);
  }
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.2);
  }
  function hat(t, vol, dur) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(musicBus); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  function playStep(s, t) {
    const i = s & 15, ch = CHORDS[(s >> 4) & 3];
    if (i === 0) for (let k = 1; k < 4; k++) mnote(hz(ch[k]), t, 1.7, 'triangle', 0.03);
    if (i % 8 === 0 || (level >= 1 && (i === 6 || i === 14))) mnote(hz(ch[0]), t, 0.24, 'sawtooth', 0.075);
    if (level >= 2 && i % 4 === 2) mnote(hz(ch[0] + 12), t, 0.12, 'sawtooth', 0.045);
    const arpOn = level === 0 ? i % 4 === 0 : level === 1 ? i % 2 === 0 : true;
    if (arpOn) mnote(hz(ch[1 + ARP[i % 8]] + (level >= 2 && i >= 8 ? 24 : 12)), t, 0.14, level === 0 ? 'sine' : 'square', level === 0 ? 0.035 : 0.016);
    if (level === 1) { if (i % 8 === 0) kick(t); if (i % 8 === 4) hat(t, 0.03, 0.05); }
    if (level >= 2) { if (i % 4 === 0) kick(t); if (i % 2 === 1) hat(t, 0.025, 0.04); if (i % 8 === 4) hat(t, 0.07, 0.12); }
  }
  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05; // after a suspended tab
    while (nextT < ctx.currentTime + 0.18) {
      if ((step & 15) === 0) barQ.push({ t: nextT, bar: (step >> 4) & 3 });
      if (musicOn) playStep(step, nextT);
      nextT += 60 / TEMPO[level] / 4; step = (step + 1) & 63;
    }
  }

  return {
    init, sfx,
    // 0 = calm (menu, shop), 1 = playing, 2 = fever or boss
    music(l) { level = l; if (ctx) musicFilter.frequency.setTargetAtTime(CUTOFF[l], ctx.currentTime, 0.3); },
    setSfx(on) { sfxOn = on; },
    setMusic(on) { musicOn = on; if (ctx) musicBus.gain.setTargetAtTime(on ? MUSIC_VOL : 0, ctx.currentTime, 0.05); },
  };
})();
