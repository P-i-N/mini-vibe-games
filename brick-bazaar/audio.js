'use strict';
/* Brick Bazaar audio: synthesised sound effects and generative music. No samples.
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
      musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = MIX[level].cutoff;
      musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? MUSIC_VOL : 0;
      musicBus.connect(musicFilter); musicFilter.connect(master);
      for (const n of ['pad', 'bass', 'arp', 'lead', 'drums']) {
        chan[n] = ctx.createGain(); chan[n].gain.value = MIX[level][n]; chan[n].connect(musicBus);
      }
      // a feedback echo on the melodic channels
      const delay = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
      delay.delayTime.value = 0.32; fb.gain.value = 0.3; wet.gain.value = 0.3;
      chan.arp.connect(delay); chan.lead.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(musicBus);
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
  // Every pitched effect takes its notes from the chord that the music plays now, so effects never clash with it.
  // Random picks among the chord tones keep repeats from sounding flat.
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const ri = (n) => (Math.random() * n) | 0;
  // [bass, root, third, fifth] as MIDI notes. pc is the pitch class of the root, 0 = C.
  function voicing(pc, minor) {
    const up = (pc + 7) % 12; // semitones above F
    return [41 + up, 53 + up, 53 + up + (minor ? 3 : 4), 60 + up];
  }
  const barQ = []; // chords that are scheduled but not audible yet
  let curChord = voicing(9, true);
  function chord() {
    while (barQ.length && barQ[0].t <= ctx.currentTime) curChord = barQ.shift().ch;
    return curChord;
  }
  // Chord tone i, counted upward through the octaves. reg moves the whole ladder by octaves (0 = around 175-500 Hz).
  const ct = (reg, i) => hz(chord()[1 + (i % 3)] + 12 * (Math.floor(i / 3) + reg));
  const root = () => hz(chord()[0]); // bass note, 87-165 Hz

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
    quack: [80, () => { const f = ct(1, ri(3)); tone(f, 0.07, { vol: 0.06, to: f * 0.75 }); tone(f * 0.9, 0.11, { type: 'sawtooth', vol: 0.05, to: f * 0.6, at: 0.08 }); }],
    saw: [150, () => { noise(0.2, { type: 'bandpass', f: 3200, q: 4, vol: 0.05 }); tone(ct(2, ri(3)), 0.15, { type: 'sawtooth', vol: 0.025 }); }],
    reload: [80, () => { tone(ct(2, ri(3)), 0.03, { vol: 0.03 }); tone(ct(2, 1 + ri(3)), 0.04, { vol: 0.03, at: 0.07 }); }],
    taunt: [0, () => { for (let i = 0; i < 4; i++) tone(ct(1, ri(4)), 0.06, { vol: 0.04, at: i * 0.07 }); }],
    beamWarn: [100, () => { const f = ct(2, 0); tone(f, 0.5, { type: 'sawtooth', vol: 0.03, to: f * 2 }); }],
    beam: [100, () => { const f = ct(3, 0); noise(0.35, { type: 'highpass', f: 1800, vol: 0.06 }); tone(f, 0.35, { type: 'sawtooth', vol: 0.05, to: f / 4 }); }],
    curse: [60, () => { const f = ct(0, 1); tone(f, 0.22, { type: 'sawtooth', vol: 0.06, to: f / 2 }); }],
    teleport: [0, () => { const f = ct(1, 0); tone(f, 0.16, { type: 'sine', vol: 0.07, to: f * 4 }); }],
    nuke: [0, () => {
      const r = root();
      noise(0.9, { f: 3000, to: 60, vol: 0.3 }); tone(r * 2, 0.8, { type: 'sine', vol: 0.25, to: r / 2 });
      tone(ct(1, 0), 0.5, { type: 'sawtooth', vol: 0.04, to: ct(3, 0) });
    }],
    jackpot: [0, () => arp(climb(2, 0, 8), 0.045, { type: 'sine', vol: 0.07, dur: 0.14 })],
    dice: [0, () => { for (let i = 0; i < 3; i++) tone(ct(2, ri(4)), 0.04, { vol: 0.04, at: i * 0.06 }); }],
    cheer: [0, (tier = 0) => { for (const f of climb(1, Math.min(tier, 4), 3)) tone(f, 0.28, { type: 'sawtooth', vol: 0.035 }); noise(0.1, { type: 'highpass', f: 4000, vol: 0.03 }); }],
    overdrive: [0, () => { const f = ct(0, 0); tone(f, 0.35, { type: 'sawtooth', vol: 0.05, to: f * 4 }); arp(climb(2, 0, 4), 0.05, { vol: 0.03, dur: 0.08 }); }],
  };
  const sfx = {};
  for (const k in defs) sfx[k] = fx(k, defs[k][0], defs[k][1]);

  // ---------- music ----------
  // The song never repeats exactly. It is made of 4-bar sections in an A A B A form. A and B each have a chord
  // progression, an arpeggio shape, a bass rhythm, a drum groove and a composed lead melody, so themes come back.
  // Five channels (pad, bass, arp, lead, drums) have their own gain: a mood change fades channels in and out,
  // and the song continues without a restart.
  const MUSIC_VOL = 0.5;
  // moods: 0 = ambient (menu, bazaar, pause), 1 = play, 2 = fever or boss
  const MIX = [
    { pad: 1, bass: 0.35, arp: 0.5, lead: 0, drums: 0, cutoff: 800 },
    { pad: 0.8, bass: 1, arp: 0.8, lead: 1, drums: 0.8, cutoff: 2600 },
    { pad: 0.8, bass: 1, arp: 1, lead: 1, drums: 1, cutoff: 7000 },
  ];
  const TEMPO = [112, 112, 128];
  // progressions in C: [pitch class of the root, minor]
  const PROGS = [
    [[9, 1], [5, 0], [0, 0], [7, 0]], [[5, 0], [7, 0], [9, 1], [4, 1]], [[0, 0], [7, 0], [9, 1], [5, 0]],
    [[2, 1], [9, 1], [5, 0], [7, 0]], [[9, 1], [4, 1], [5, 0], [7, 0]], [[5, 0], [0, 0], [2, 1], [7, 0]],
  ];
  const KEYS = [0, 2, -3, 4, -1, 3, -2, 5]; // transpose per level
  // arpeggio shapes: n = chord tone n % 3, raised by floor(n / 3) octaves; -1 = rest
  const ARPS = [[0, 1, 2, 1, 0, 2, 1, 2], [0, 2, 1, 2, 0, 2, 1, 2], [0, 1, 2, 3, 2, 1, 0, 1], [0, -1, 2, 1, -1, 2, 0, -1], [2, 1, 0, 1, 2, 1, 0, -1], [0, 3, 1, 4, 2, 5, 1, 4]];
  // bass rhythms: [step, semitones above the root]. 0 is for the ambient mood, 3 for the hot mood.
  const BASS = [[[0, 0], [8, 0]], [[0, 0], [6, 0], [8, 0], [14, 7]], [[0, 0], [4, 12], [8, 0], [12, 7]], [[0, 0], [3, 0], [6, 12], [8, 0], [11, 0], [14, 7]]];
  // drum grooves: kick, snare and hat steps. 3 is for the hot mood.
  const DRUMS = [
    { k: [0, 8], s: [], h: [4, 12] },
    { k: [0, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14] },
    { k: [0, 6, 8], s: [4, 12], h: [2, 6, 10, 14] },
    { k: [0, 4, 8, 12], s: [4, 12], h: [1, 3, 5, 7, 9, 11, 13, 15] },
  ];
  // lead rhythms: the steps of a bar on which a note starts
  const RHY = [[0, 4, 8, 12], [0, 3, 6, 8, 12], [0, 6, 8, 10, 14], [2, 4, 8, 11, 12], [0, 8, 12], [0, 2, 4, 8, 10, 12], [4, 6, 8, 14]];
  const chan = {};
  let step = 0, nextT = 0, level = 0, key = 0, wantKey = 0, sec = null, form = null, formPos = 0;

  // A melody on the major pentatonic scale of the key. Strong beats land on chord tones.
  // Bar 2 repeats the contour of bar 0, which makes the tune sound intended.
  function composeLead(chords) {
    const scale = [0, 2, 4, 7, 9].map((p) => (p + key + 120) % 12);
    const ladder = [];
    for (let m = 62; m <= 86; m++) if (scale.includes(m % 12)) ladder.push(m);
    const out = new Array(64).fill(null);
    const r1 = RHY[ri(RHY.length)], r2 = RHY[ri(RHY.length)], motif = [];
    let d = 3 + ri(5);
    for (let bar = 0; bar < 4; bar++) {
      const r = bar % 2 ? r2 : r1, pcs = chords[bar].slice(1).map((m) => m % 12);
      r.forEach((st, j) => {
        const move = bar === 2 ? motif[j] : [-2, -1, -1, 1, 1, 2, 0][ri(7)];
        if (bar === 0) motif[j] = move;
        d = Math.max(0, Math.min(ladder.length - 1, d + move));
        if (st % 8 === 0) {
          for (const o of [0, 1, -1]) { const m = ladder[d + o]; if (m != null && pcs.includes(m % 12)) { d += o; break; } }
        }
        out[bar * 16 + st] = { m: ladder[d], len: Math.min((j + 1 < r.length ? r[j + 1] : 16) - st, 6) };
      });
    }
    return out;
  }
  function newForm() {
    const a = ri(PROGS.length); let b = ri(PROGS.length - 1); if (b >= a) b++;
    const make = (p) => {
      const chords = PROGS[p].map(([pc, minor]) => voicing((pc + key + 120) % 12, minor));
      return { chords, lead: composeLead(chords), arp: ARPS[ri(ARPS.length)], bass: 1 + ri(2), drum: ri(3) };
    };
    const A = make(a), B = make(b);
    form = [A, A, B, A]; formPos = 0;
  }
  function nextSection() {
    if (!form || formPos >= 4 || key !== wantKey) { key = wantKey; newForm(); }
    // per-section variation: a drum fill at the end, the lead sits out, or the drums drop for one bar
    sec = Object.assign({}, form[formPos++], { fill: Math.random() < 0.6, rest: Math.random() < 0.2, calm: Math.random() < 0.2 ? 1 + ri(3) : -1 });
  }

  function mnote(bus, f, t, dur, type, vol, attack = 0.012) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.03);
  }
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(chan.drums); o.start(t); o.stop(t + 0.2);
  }
  function hiss(t, vol, dur, type, freq) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(chan.drums); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  const hat = (t) => hiss(t, 0.025, 0.04, 'highpass', 6000);
  function snare(t, vol) { hiss(t, vol, 0.12, 'bandpass', 1800); mnote(chan.drums, 190, t, 0.07, 'triangle', vol * 0.8, 0.002); }

  function playStep(s, t) {
    const i = s & 15, bar = (s >> 4) & 3, ch = sec.chords[bar], len = 60 / TEMPO[level] / 4;
    if (i === 0) for (let k = 1; k < 4; k++) mnote(chan.pad, hz(ch[k]), t, len * 17, 'triangle', 0.03, 0.2);
    for (const [st, up] of BASS[level === 0 ? 0 : level === 2 ? 3 : sec.bass]) if (st === i) mnote(chan.bass, hz(ch[0] + up), t, len * 2.2, 'sawtooth', 0.075);
    const every = level === 0 ? 4 : level === 1 ? 2 : 1;
    if (i % every === 0) {
      const n = sec.arp[(i / every) % 8];
      if (n >= 0) mnote(chan.arp, hz(ch[1 + (n % 3)] + 12 * (1 + Math.floor(n / 3)) + (level === 2 && i >= 8 ? 12 : 0)), t, len * 1.6, level === 0 ? 'sine' : 'square', level === 0 ? 0.04 : 0.016);
    }
    if (level === 0) return;
    const note = sec.lead[s & 63];
    if (note && !(level === 1 && sec.rest)) {
      mnote(chan.lead, hz(note.m + (level === 2 ? 12 : 0)), t, len * note.len * 0.95, level === 2 ? 'square' : 'triangle', level === 2 ? 0.026 : 0.055, 0.02);
    }
    if (level === 1 && bar === sec.calm) return;
    const d = DRUMS[level === 2 ? 3 : sec.drum];
    if (d.k.includes(i)) kick(t);
    if (d.s.includes(i)) snare(t, 0.08);
    if (d.h.includes(i)) hat(t);
    if (sec.fill && bar === 3 && i >= 12) snare(t, 0.03 + (i - 12) * 0.02);
  }
  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05; // after a suspended tab
    while (nextT < ctx.currentTime + 0.18) {
      if (step === 0) nextSection();
      if ((step & 15) === 0) barQ.push({ t: nextT, ch: sec.chords[(step >> 4) & 3] });
      if (musicOn) playStep(step, nextT);
      nextT += 60 / TEMPO[level] / 4; step = (step + 1) & 63;
    }
  }

  return {
    init, sfx,
    // 0 = ambient (menu, bazaar, pause), 1 = playing, 2 = fever or boss
    music(l) {
      level = l;
      if (!ctx) return;
      for (const n in chan) chan[n].gain.setTargetAtTime(MIX[l][n], ctx.currentTime, 0.6);
      musicFilter.frequency.setTargetAtTime(MIX[l].cutoff, ctx.currentTime, 0.5);
    },
    // A new key from the next section on. Called with the level number.
    tune(n) { wantKey = KEYS[n % KEYS.length]; },
    // 'off' before the first tap, then the AudioContext state
    state() { return ctx ? ctx.state : 'off'; },
    setSfx(on) { sfxOn = on; },
    setMusic(on) { musicOn = on; if (ctx) musicBus.gain.setTargetAtTime(on ? MUSIC_VOL : 0, ctx.currentTime, 0.05); },
  };
})();
