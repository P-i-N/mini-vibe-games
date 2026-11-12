'use strict';
/* Strata Siege audio: synthesised sound effects and generative music. No samples.
   Effects take their pitch from the chord that the music plays at that moment. The frequent gameplay effects
   (tower shots, pops, coins, digging) play the next note of a riff on the music's grid, so a busy defence plays
   a tune. The music is one song with three moods and three layer colours (sky, ground, dig). */
window.SSAudio = (() => {
  let ctx = null, sfxBus = null, musicBus = null, musicFilter = null, noiseBuf = null, delay = null, duck = null;
  let padFilter = null, wet = null;
  let sfxOn = true, musicOn = true;

  function init() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; return; }
      // iOS: play also when the ringer switch is off
      if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ } }
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 6; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
      const master = ctx.createGain(); master.gain.value = 0.9;
      master.connect(comp); comp.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = cutoff();
      musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? MUSIC_VOL : 0;
      // duck lowers the music for a moment under a fanfare
      duck = ctx.createGain();
      musicBus.connect(duck); duck.connect(musicFilter); musicFilter.connect(master);
      // Each channel has two gains in a row: chan (set by the mood) and lay (set by the layer).
      // The pad also passes a filter that the layer opens or closes.
      const L = LAYER[layerName];
      padFilter = ctx.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = L.padCut;
      for (const n of CHANNELS) {
        chan[n] = ctx.createGain(); chan[n].gain.value = MIX[level][n];
        lay[n] = ctx.createGain(); lay[n].gain.value = L[n];
        if (n === 'pad') { chan[n].connect(padFilter); padFilter.connect(lay[n]); } else chan[n].connect(lay[n]);
        lay[n].connect(musicBus);
      }
      // a feedback echo on the melodic channels
      // the echo time is three sixteenth notes, so that it stays on the beat
      const fb = ctx.createGain();
      wet = ctx.createGain(); delay = ctx.createDelay(1);
      delay.delayTime.value = echoTime(); fb.gain.value = 0.3; wet.gain.value = L.wet;
      lay.arp.connect(delay); lay.lead.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(musicBus);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      nextT = ctx.currentTime + 0.1; gridT = nextT;
      setInterval(schedule, 40);
    }
    if (ctx.state !== 'running' && !document.hidden) ctx.resume();
  }
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else ctx.resume();
  });

  // ---------- building blocks ----------
  // o: type, vol, to (slide target Hz), at (delay s), attack, vib [rate Hz, depth Hz], trem [rate Hz, depth 0..1,
  // wave], filt [type, Hz, q]
  function tone(f, dur, o = {}) {
    const t0 = ctx.currentTime + (o.at || 0), tEnd = t0 + dur + 0.03;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.05, t0 + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let out = g;
    if (o.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1];
      l.connect(lg); lg.connect(osc.frequency); l.start(t0); l.stop(tEnd);
    }
    if (o.trem) {
      const l = ctx.createOscillator(), lg = ctx.createGain(), tg = ctx.createGain();
      l.type = o.trem[2] || 'sine'; l.frequency.value = o.trem[0];
      tg.gain.value = 1 - o.trem[1] / 2; lg.gain.value = o.trem[1] / 2;
      l.connect(lg); lg.connect(tg.gain); l.start(t0); l.stop(tEnd);
      out.connect(tg); out = tg;
    }
    if (o.filt) {
      const fl = ctx.createBiquadFilter();
      fl.type = o.filt[0]; fl.frequency.value = o.filt[1]; fl.Q.value = o.filt[2] || 0.7;
      out.connect(fl); out = fl;
    }
    osc.connect(g); out.connect(o.bus || sfxBus);
    osc.start(t0); osc.stop(tEnd);
  }
  // o: type (filter), f, to, q, vol, at, attack (s, for a soft start)
  function noise(dur, o = {}) {
    const t0 = ctx.currentTime + (o.at || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'lowpass'; f.Q.value = o.q || 0.7;
    f.frequency.setValueAtTime(o.f || 1200, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    const g = ctx.createGain();
    if (o.attack) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(o.vol || 0.05, t0 + o.attack); }
    else g.gain.setValueAtTime(o.vol || 0.05, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.03);
  }

  // ---------- harmony ----------
  // Every pitched effect takes its notes from the chord that the music plays now, so effects never clash with it.
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const ri = (n) => (Math.random() * n) | 0;
  const mod12 = (m) => ((m % 12) + 12) % 12;
  const MODES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10] };
  // the pentatonic subset of each mode: the melodies use it, because it has no semitones
  const PENTA = { major: [0, 2, 4, 7, 9], minor: [0, 3, 5, 7, 10], dorian: [0, 3, 5, 7, 9], mixo: [0, 2, 4, 7, 10] };
  // Level styles: tempo of the play mood, swing (how late the off-beat 16th notes come, in steps) and mode
  // Gentle tempos, a lilt on most of them, and mostly the bright modes: it is a garden, not a factory.
  const STYLES = [
    { bpm: 104, swing: 0.14, mode: 'major' }, { bpm: 96, swing: 0.18, mode: 'mixo' }, { bpm: 112, swing: 0.08, mode: 'major' },
    { bpm: 100, swing: 0.16, mode: 'dorian' }, { bpm: 108, swing: 0, mode: 'mixo' }, { bpm: 116, swing: 0.1, mode: 'major' },
    { bpm: 98, swing: 0.2, mode: 'minor' },
  ];
  const KEYS = [0, 2, -3, 4, -1, 3, -2, 5]; // tonic per level, 0 = C
  // key = the tonic that plays now, baseKey = the tonic of the level, lift = semitones up during a fever
  let style = STYLES[0], wantStyle = style, key = 0, wantKey = 0, baseKey = 0, lift = 0;

  // The chord on scale degree deg of the current key and mode. ext: 0 triad, 1 seventh, 2 sus4, 3 sus2.
  // Returns MIDI notes [bass, root, third, fifth, seventh?]; pcs = pitch classes of the triad.
  function chordOf(deg, ext) {
    const sc = MODES[style.mode], at = (n) => sc[n % 7] + 12 * Math.floor(n / 7) - sc[deg];
    let mid = at(deg + 2);
    if (ext === 2 && at(deg + 3) === 5) mid = 5;
    if (ext === 3 && at(deg + 1) === 2) mid = 2;
    const up = mod12(key + sc[deg] + 7), r = 53 + up; // root from F3 to E4, bass an octave lower
    const ch = [41 + up, r, r + mid, r + at(deg + 4)];
    if (ext === 1) ch.push(r + at(deg + 6));
    ch.pcs = ch.slice(1, 4).map(mod12);
    return ch;
  }
  // MIDI notes from lo to hi that fit chord ch: its chord tones, and the pentatonic tones that are not a semitone
  // from any note of the chord
  function ladder(ch, lo, hi, pent) {
    const all = ch.slice(1).map(mod12), out = [];
    for (let m = lo; m <= hi; m++) {
      const pc = m % 12;
      if (ch.pcs.includes(pc) || (pent.includes(pc) && !all.some((c) => mod12(pc - c) === 1 || mod12(c - pc) === 1))) out.push(m);
    }
    return out;
  }
  const tones = (ch, lo, hi) => { const out = []; for (let m = lo; m <= hi; m++) if (ch.pcs.includes(m % 12)) out.push(m); return out; };
  // Riff shapes in ladder steps. Even positions and the last one fall back to a chord tone, so the harmony is clear.
  const SHAPES = [[0, 1, 2, 1, 3, 2, 4, 2], [0, 2, 1, 3, 2, 4, 3, 5], [4, 3, 2, 1, 2, 3, 4, 2], [0, 2, 4, 2, 1, 3, 5, 4], [2, 1, 0, 1, 2, 4, 3, 2], [0, 0, 2, 1, 3, 3, 4, 2]];
  // Gives chord ch the 8-note riff that the melodic effects play over it, from its root (175-330 Hz) up.
  function writeRiff(ch, shape, pent) {
    const lad = ladder(ch, ch[1], ch[1] + 26, pent);
    ch.ladder = lad;
    ch.riff = shape.map((d, i) => {
      let k = d;
      if (i % 2 === 0 || i === 7) while (k > 0 && !ch.pcs.includes(lad[k] % 12)) k--;
      return lad[k];
    });
    return ch;
  }

  const barQ = []; // chords that are scheduled but not audible yet
  let curChord = writeRiff(chordOf(0, 0), SHAPES[0], PENTA.major);
  function chord() {
    while (barQ.length && barQ[0].t <= ctx.currentTime) curChord = barQ.shift().ch;
    return curChord;
  }
  // the chord that sounds at time t (at most one look-ahead into the future)
  function chordAt(t) {
    let c = chord();
    for (const b of barQ) if (b.t <= t) c = b.ch;
    return c;
  }
  // Chord tone i, counted upward through the octaves. reg moves the whole ladder by octaves (0 = around 175-500 Hz).
  const ct = (reg, i) => hz(chord()[1 + (i % 3)] + 12 * (Math.floor(i / 3) + reg));
  const root = () => hz(chord()[0]); // bass note, 87-165 Hz

  // ---------- melody engine ----------
  // The frequent gameplay effects play the next note of the riff of the chord that sounds, on the next slot of the
  // music's grid. Notes that land in one slot become a dyad or triad of the chord. A short noise transient at the
  // real moment keeps the hit immediate.
  const MEL_MAX = 8; // melodic effect notes that ring at once; a new note steals the oldest one
  let gridT = 0, gridStep = 0, gridLen = 0; // time, number and length of the last step that the scheduler wrote
  const mel = { pos: 0, last: -9, note: 72, bass: 0, wall: 0, voices: [], slots: [] };

  // Time of the next grid slot, plus n slots. res: 0.5 = 32nd notes, 1 = 16th notes.
  function gridAt(res, n = 0) {
    const len = gridLen || stepLen(), h = len * res;
    const k = Math.ceil((ctx.currentTime + 0.004 - gridT) / h) + n, q = k * res;
    let t = gridT + k * h;
    if (sec && Number.isInteger(q) && ((gridStep + q) & 1)) t += sec.swing * len;
    return t;
  }
  // Effect instruments: partials as [frequency ratio, wave, level, decay s]
  const INST = {
    marimba: [[1, 'sine', 1, 0.32], [4, 'sine', 0.3, 0.05]],
    kalimba: [[1, 'triangle', 0.8, 0.5], [2, 'sine', 0.35, 0.14]],
    glock: [[1, 'sine', 1, 0.6], [2.76, 'sine', 0.35, 0.14], [5.4, 'sine', 0.12, 0.05]],
    bell: [[1, 'sine', 1, 1.1], [2, 'sine', 0.4, 0.5], [3, 'sine', 0.18, 0.25]],
    // bass: partials 2 and 3 carry it on a phone speaker
    pluck: [[1, 'triangle', 1, 0.35], [2, 'sawtooth', 0.35, 0.08], [3, 'sine', 0.35, 0.18]],
    mallet: [[1, 'sine', 1, 0.28], [2, 'triangle', 0.25, 0.05]],
    pizz: [[1, 'triangle', 1, 0.2], [2, 'square', 0.12, 0.04]],
    brass: [[1, 'sawtooth', 0.45, 0.9], [1.004, 'triangle', 0.8, 0.9], [2, 'triangle', 0.25, 0.4]],
    // a toaster that hums in tune
    buzz: [[1, 'sawtooth', 0.4, 0.14], [2, 'square', 0.14, 0.06], [1.5, 'sine', 0.3, 0.1]],
    // a blown bottle: the kite line
    flute: [[1, 'sine', 1, 0.3], [2, 'sine', 0.18, 0.12], [3, 'triangle', 0.06, 0.05]],
  };
  // Plays MIDI note m on an instrument at time t. len stretches the decay. Returns false when the cap drops the note.
  function voice(inst, m, t, vol, len = 1) {
    const att = inst === 'brass' ? 0.025 : inst === 'flute' ? 0.015 : 0.003, dur = (k) => Math.max(INST[inst][k][3] * len, att + 0.02);
    const tEnd = t + Math.max(...INST[inst].map((p, k) => dur(k)));
    mel.voices = mel.voices.filter((v) => v.end > ctx.currentTime);
    // the notes that ring at some moment of the new one; the oldest ones that started before it give way
    let ringing = mel.voices.filter((v) => v.t < tEnd && v.end > t);
    while (ringing.length >= MEL_MAX) {
      const old = ringing.filter((v) => v.t < t - 0.001).sort((a, b) => a.t - b.t)[0];
      if (!old) return false;
      old.vg.gain.setTargetAtTime(0, t, 0.012); old.end = t;
      ringing = ringing.filter((v) => v !== old);
    }
    const f = hz(m), vg = ctx.createGain();
    // the longer decays overlap more than the old blips did, so the level drops with each ringing note
    vol *= 0.8 / (1 + 0.1 * ringing.length);
    vg.connect(sfxBus);
    let end = t;
    INST[inst].forEach(([r, type, lv], k) => {
      if (f * r > 12000) return;
      const d = dur(k), o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = f * r;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * lv, t + att);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(vg); o.start(t); o.stop(t + d + 0.03);
      end = Math.max(end, t + d);
    });
    mel.voices.push({ t, end, vg });
    return true;
  }
  // the notes that wait in the grid slot at time t
  function slotAt(t) {
    mel.slots = mel.slots.filter((s) => s.t > ctx.currentTime - 0.05);
    let s = mel.slots.find((x) => Math.abs(x.t - t) < 0.003);
    if (!s) { s = { t, notes: [], who: [] }; mel.slots.push(s); }
    return s;
  }
  // The chord tone near m that is at least a minor third from the notes of the slot and not their octave.
  // Notes under the slot win, so the tune stays on top.
  function harmonise(m, notes, ch) {
    const low = Math.min(...notes);
    let best = null, score = 99;
    for (let x = m - 12; x <= m + 9; x++) {
      if (!ch.pcs.includes(x % 12) || notes.some((n) => Math.abs(n - x) < 3 || n % 12 === x % 12)) continue;
      const s = Math.abs(x - m) + (x > low ? 12 : 0);
      if (s < score) { best = x; score = s; }
    }
    return best;
  }
  // Plays a melodic effect note in slot n after now. pick(ch, stacked) returns the MIDI note; stacked = this group
  // already has a note in the slot. free = no harmonising (bass notes).
  function melo(group, inst, res, vol, pick, n = 0, free = false) {
    const t = gridAt(res, n), s = slotAt(t), ch = chordAt(t);
    if (s.notes.length >= 3) return;
    let m = pick(ch, s.who.includes(group));
    if (s.notes.length && !free && Number.isFinite(m)) m = harmonise(m, s.notes, ch);
    if (!Number.isFinite(m) || !voice(inst, m, t, vol)) return;
    s.notes.push(m); s.who.push(group);
  }
  // The next riff note, reg octaves up. After a pause the riff starts again from its first note.
  function riffNext(ch, stacked, reg) {
    if (!stacked) {
      const now = ctx.currentTime;
      mel.pos = now - mel.last > 1.5 ? 0 : mel.pos + 1;
      mel.last = now;
    }
    mel.note = ch.riff[mel.pos % 8] + 12 * reg;
    return mel.note;
  }
  const mod7 = (d) => ((d % 7) + 7) % 7;
  // A short fanfare in the key: line = scale degrees on 16th notes (7 = the octave), then the chord `end` (default:
  // the tonic triad) on the bass tonic. o: step (in 16ths), wait (16ths before it starts), end, chord (instrument),
  // hold (decay stretch), bass, duck (lower the music and start its next bar on the tonic).
  function cadence(line, inst, vol, o = {}) {
    const sc = MODES[style.mode], tonic = 60 + mod12(key);
    const deg = (d) => tonic + sc[mod7(d)] + 12 * Math.floor(d / 7);
    const step = stepLen() * (o.step || 1), t0 = gridAt(1, o.wait || 0), tEnd = t0 + line.length * step;
    // a note that would clash with an effect note already in its slot sits out
    const play = (ins, m, t, v, len) => {
      const s = slotAt(t);
      if (s.notes.some((n) => Math.abs(n - m) < 3) || !voice(ins, m, t, v, len)) return;
      s.notes.push(m); s.who.push('fanfare');
    };
    line.forEach((d, i) => play(inst, deg(d), t0 + i * step, vol, 0.5));
    for (const d of o.end || [7, 9, 11]) play(o.chord || inst, deg(d), tEnd, vol * 0.6, o.hold || 1.2);
    if (o.bass !== false) play('pluck', tonic - 12, tEnd, vol * 1.4, 1.5);
    if (o.duck) {
      cut = true;
      if (musicOn) { duck.gain.setTargetAtTime(0.5, t0, 0.05); duck.gain.setTargetAtTime(1, tEnd + 0.5, 0.3); }
    }
  }

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
  const int = (n, max) => Math.max(0, Math.min(max, n | 0));
  // an instrument note `at` seconds from now, off the grid (for sounds that must be on time, such as a doorbell)
  const ring = (inst, m, at, vol, len) => voice(inst, m, ctx.currentTime + at, vol, len);
  // the riff register of a chain: a long chain lifts the tune an octave
  const lifted = (chain, reg) => reg + (chain >= 8 ? 1 : 0);

  // ---------- effects ----------
  // name: [minimum gap between two plays in ms, sound]
  const defs = {
    // --- interface ---
    // any plain tap on a tile or a button
    tap: [30, () => tone(ct(2, ri(3)), 0.035, { type: 'triangle', vol: 0.04 })],
    // a layer tab or a shop tab
    tab: [0, () => tone(ct(2, ri(3)), 0.05, { type: 'triangle', vol: 0.05 })],
    // a purchase at Gnome Depot: three notes up and the till
    buy: [0, () => {
      arp(climb(2, ri(3), 3), 0.06, { type: 'triangle', vol: 0.07, dur: 0.12 });
      noise(0.06, { type: 'highpass', f: 5000, vol: 0.04, at: 0.12 });
    }],
    // not allowed or too dear: two flat notes down
    nope: [0, () => { tone(ct(0, 1), 0.12, { vol: 0.05 }); tone(ct(0, 0), 0.14, { vol: 0.05, at: 0.1 }); }],
    // Gnorman considers an offer: three low mutters
    haggle: [200, () => {
      for (let i = 0; i < 3; i++) {
        const f = root() * 2 * [1, 1.12, 0.94][ri(3)];
        tone(f, 0.11 + (i === 2 ? 0.08 : 0), { type: 'sawtooth', vol: 0.07, to: f * (i === 2 ? 0.8 : 1.08), at: i * 0.13, attack: 0.02, filt: ['lowpass', 700, 2] });
      }
    }],
    // a soft clock tick (timers, counters that run up)
    tick: [45, () => tone(ct(3, ri(3)), 0.02, { vol: 0.02 })],
    // the count before a wave: a beep per second, n = seconds left, 0 = go (an octave up and longer)
    countdown: [0, (n = 1) => {
      const go = n <= 0, f = ct(go ? 3 : 2, 0);
      tone(f, go ? 0.4 : 0.1, { type: 'sine', vol: 0.09 }); tone(f * 2, go ? 0.25 : 0.05, { type: 'sine', vol: 0.03 });
    }],
    // the i-th star on the result screen
    star: [0, (i = 0) => { const f = ct(2, int(i, 8)); tone(f, 0.3, { type: 'sine', vol: 0.1 }); tone(f * 2, 0.2, { type: 'sine', vol: 0.04, at: 0.03 }); }],
    // applause for a good moment; a higher tier is a higher chord
    cheer: [150, (tier = 0) => { for (const f of climb(1, int(tier, 4), 3)) tone(f, 0.28, { type: 'sawtooth', vol: 0.035 }); noise(0.1, { type: 'highpass', f: 4000, vol: 0.03 }); }],

    // --- building ---
    // a tower is placed: two hammer knocks and a note
    build: [0, () => {
      noise(0.03, { type: 'bandpass', f: 900, q: 2, vol: 0.09 }); noise(0.03, { type: 'bandpass', f: 1100, q: 2, vol: 0.09, at: 0.09 });
      tone(ct(1, 0), 0.16, { type: 'triangle', vol: 0.07, at: 0.17 });
    }],
    // a tower gains a level: four notes up and a sparkle
    upgrade: [0, () => {
      arp(climb(1, ri(2), 4), 0.055, { type: 'triangle', vol: 0.06, dur: 0.11 });
      noise(0.12, { type: 'highpass', f: 6000, vol: 0.03, at: 0.2 }); ring('glock', chord()[1] + 36, 0.22, 0.05);
    }],
    // a tower is sold: three notes down and loose change
    sell: [0, () => {
      arp(climb(2, 0, 3).reverse(), 0.06, { type: 'triangle', vol: 0.06, dur: 0.1 });
      for (let i = 0; i < 3; i++) noise(0.015, { type: 'highpass', f: 7000, vol: 0.03, at: 0.18 + i * 0.045 });
    }],

    // --- tower shots: each one plays the next riff note on its own instrument ---
    // Pea Pod: a dry "pft" and a plucked note
    pea: [40, () => {
      noise(0.02, { type: 'bandpass', f: 1500, q: 1.5, vol: 0.03 });
      melo('riff', 'pizz', 0.5, 0.045, (ch, st) => riffNext(ch, st, 1));
    }],
    // Kite Launcher: a short whoosh up and a blown-bottle note an octave higher
    kite: [60, () => {
      noise(0.09, { type: 'bandpass', f: 900, to: 3200, q: 2, vol: 0.022, attack: 0.02 });
      melo('riff', 'flute', 0.5, 0.05, (ch, st) => riffNext(ch, st, 2));
    }],
    // Brain Freeze: an icy tinkle, two octaves up
    ice: [60, () => {
      noise(0.03, { type: 'highpass', f: 8000, vol: 0.02 });
      melo('riff', 'glock', 0.5, 0.04, (ch, st) => riffNext(ch, st, 2));
    }],
    // Teapot Mortar: a hollow "thoomp" and the bass line of the chord (root, fifth, octave, fifth)
    mortar: [80, () => {
      const r = root();
      noise(0.07, { f: 500, vol: 0.09 }); tone(r * 3, 0.09, { type: 'sine', vol: 0.09, to: r });
      melo('bass', 'pluck', 0.5, 0.12, (ch, st) => (st ? null : ch[0] + [0, 7, 12, 7][mel.bass++ % 4]), 0, true);
    }],
    // Tesla Toaster: a crackle and a buzzing riff note
    zap: [50, () => {
      noise(0.06, { type: 'highpass', f: 3000, vol: 0.035 });
      melo('riff', 'buzz', 0.5, 0.045, (ch, st) => riffNext(ch, st, 2));
    }],
    // Banana Peeler: a rubbery "fwip" and a mallet note
    peel: [60, () => {
      const f = ct(1, ri(3));
      tone(f, 0.06, { type: 'sine', vol: 0.035, to: f * 2.2 });
      melo('riff', 'mallet', 0.5, 0.06, (ch, st) => riffNext(ch, st, 1));
    }],

    // --- the fight on the ground ---
    // a mortar shell or a rain cloud lands: a wet slap and a drip
    splash: [60, () => {
      noise(0.22, { type: 'bandpass', f: 1400, to: 350, q: 1, vol: 0.07 });
      const f = ct(2, ri(3)); tone(f, 0.07, { type: 'sine', vol: 0.04, to: f * 1.8, at: 0.09 });
    }],
    // a foe steps on a peel: a quick whistle up and a small bump
    slip: [90, () => {
      const f = ct(2, ri(3));
      tone(f, 0.16, { type: 'sine', vol: 0.05, to: f * 3 });
      noise(0.05, { f: 700, vol: 0.07, at: 0.2 }); tone(root() * 2, 0.07, { type: 'triangle', vol: 0.06, to: root(), at: 0.2 });
    }],
    // the Boot is on its way: a slide whistle down, 0.6 s long (the tap)
    stomp: [200, () => {
      tone(1900, 0.6, { type: 'sine', vol: 0.06, to: 380, vib: [9, 22], attack: 0.02 });
      tone(950, 0.6, { type: 'triangle', vol: 0.015, to: 190, attack: 0.02 });
    }],
    // the Boot lands: a heavy thud and things that rattle after it
    stompHit: [100, () => {
      const r = root();
      noise(0.42, { f: 1400, to: 60, vol: 0.26 }); tone(r * 2, 0.36, { type: 'sine', vol: 0.22, to: r / 2 });
      tone(r * 4, 0.2, { type: 'triangle', vol: 0.1, to: r });
      for (let i = 0; i < 3; i++) noise(0.03, { type: 'bandpass', f: 1800 + ri(1400), q: 3, vol: 0.035, at: 0.14 + i * 0.08 + Math.random() * 0.03 });
    }],
    // a shot lands on a foe: a tick and a soft mallet that answers the riff an octave lower
    foeHit: [35, () => {
      noise(0.012, { type: 'bandpass', f: 2400, vol: 0.014 });
      melo('wall', 'mallet', 0.5, 0.035, (ch) => {
        const ts = tones(ch, 50, 74), k = ts.indexOf(ts.reduce((a, b) => (Math.abs(b - mel.note + 12) < Math.abs(a - mel.note + 12) ? b : a)));
        return ts[Math.min(ts.length - 1, k + [0, 1, 2, 1][mel.wall++ % 4])];
      });
    }],
    // a foe is beaten: a pop and the next riff note; a chain of 8 or more lifts the tune an octave
    foePop: [30, (chain = 0) => {
      noise(0.05, { type: 'highpass', f: 2200, vol: 0.03 });
      melo('riff', 'kalimba', 0.5, 0.065, (ch, st) => riffNext(ch, st, lifted(chain, 1)));
    }],
    // coins climb the riff's ladder with the chain
    coin: [38, (chain = 0) => {
      noise(0.008, { type: 'highpass', f: 7000, vol: 0.012 });
      melo('coin', 'glock', 0.5, 0.045, (ch) => ch.ladder[int(chain, Math.min(7, ch.ladder.length - 1))] + 24);
    }],
    // a gem is collected: two bright notes a chord tone apart
    gem: [60, () => {
      const k = ri(2);
      melo('gem', 'glock', 0.5, 0.05, (ch) => tones(ch, ch[1] + 24, ch[1] + 40)[k]);
      melo('gem', 'glock', 0.5, 0.05, (ch) => tones(ch, ch[1] + 24, ch[1] + 42)[k + 2], 1);
    }],
    // a foe gets past Grandma and a heart is lost: a sagging "wom-wom" and a thump
    leak: [150, () => {
      const f = ct(0, 1), r = root();
      tone(f, 0.2, { type: 'sawtooth', vol: 0.06, to: f * 0.84, filt: ['lowpass', 1200, 1] });
      tone(f * 0.84, 0.3, { type: 'sawtooth', vol: 0.06, to: f * 0.6, at: 0.2, filt: ['lowpass', 1000, 1] });
      noise(0.2, { f: 500, vol: 0.09 }); tone(r * 2, 0.2, { type: 'sine', vol: 0.1, to: r });
    }],
    // a foe rings at the castle door: ding-dong
    bell: [300, () => {
      const ch = chord(), dong = ch[1] + 24, up = ch.pcs.includes(mod12(dong + 4)) ? 4 : ch.pcs.includes(mod12(dong + 3)) ? 3 : 7;
      ring('bell', dong + up, 0, 0.09, 0.8); ring('bell', dong, 0.38, 0.09, 1.1);
      noise(0.012, { type: 'highpass', f: 5000, vol: 0.02 }); noise(0.012, { type: 'highpass', f: 5000, vol: 0.02, at: 0.38 });
    }],
    // Grandma's rolling pin: a hollow wooden bonk and a small boing after it
    swat: [80, () => {
      noise(0.03, { type: 'bandpass', f: 1300, q: 1.5, vol: 0.13 });
      tone(430, 0.11, { type: 'sine', vol: 0.2, to: 210 }); tone(1180, 0.05, { type: 'triangle', vol: 0.07, to: 760 });
      tone(300, 0.22, { type: 'sine', vol: 0.045, to: 380, at: 0.08, vib: [26, 40] });
    }],
    // a smaller bonk: a hamster is dazed, something bounces off a head
    bonk: [70, () => {
      noise(0.02, { type: 'bandpass', f: 1700, q: 1.5, vol: 0.08 });
      tone(620, 0.08, { type: 'sine', vol: 0.13, to: 330 }); tone(1500, 0.035, { type: 'triangle', vol: 0.04, to: 1000 });
    }],
    // a wave sets off: a little hunting horn, tonic then fifth, held on the octave
    wave: [0, () => cadence([0, 4], 'brass', 0.05, { step: 2, end: [7], hold: 0.7, bass: false })],
    // a warning (a wave of flyers, low hearts): three rising whoops
    warn: [0, () => { const f = ct(1, 0), g = ct(1, 1); for (let i = 0; i < 3; i++) tone(f, 0.22, { vol: 0.05, to: g, at: i * 0.3 }); }],
    // a balloon bursts
    pop: [40, () => {
      noise(0.05, { type: 'highpass', f: 1200, vol: 0.2 }); noise(0.09, { type: 'bandpass', f: 600, q: 0.8, vol: 0.08, at: 0.01 });
      tone(900, 0.05, { type: 'sine', vol: 0.12, to: 140 });
    }],
    // a duck
    quack: [80, () => {
      const f = 500 + ri(4) * 30;
      tone(f, 0.06, { type: 'sawtooth', vol: 0.09, to: f * 1.25, filt: ['bandpass', 1500, 3] });
      tone(f * 1.2, 0.12, { type: 'sawtooth', vol: 0.09, to: f * 0.7, at: 0.06, filt: ['bandpass', 1300, 3] });
    }],
    // the goose: a nasal two-part honk
    honk: [120, () => {
      const f = 270 + ri(3) * 14;
      tone(f, 0.07, { type: 'square', vol: 0.11, to: f * 1.3, filt: ['bandpass', 1000, 2.5] });
      tone(f * 1.3, 0.24, { type: 'sawtooth', vol: 0.13, to: f * 1.12, at: 0.07, attack: 0.01, filt: ['bandpass', 1150, 2.5] });
      tone(f * 2.6, 0.2, { type: 'square', vol: 0.02, to: f * 2.2, at: 0.07 });
    }],

    // --- underground ---
    // a pickaxe blow: a clink and the next riff note, an octave under the towers
    dig: [45, () => {
      noise(0.015, { type: 'bandpass', f: 3600, q: 4, vol: 0.05 }); noise(0.04, { f: 400, vol: 0.05 });
      melo('riff', 'marimba', 0.5, 0.07, (ch, st) => riffNext(ch, st, 0));
    }],
    // a tile gives way: crumbling dirt and the bass root
    digDone: [60, () => {
      noise(0.2, { type: 'bandpass', f: 900, to: 250, q: 0.8, vol: 0.09 });
      for (let i = 0; i < 3; i++) noise(0.025, { type: 'bandpass', f: 700 + ri(900), q: 3, vol: 0.04, at: 0.05 + i * 0.05 });
      melo('bass', 'pluck', 0.5, 0.1, (ch) => ch[0] + 12, 0, true);
    }],
    // a hamster finds loot: three chord tones up
    loot: [0, () => { const s = ri(2); for (let n = 0; n < 3; n++) melo('loot', 'kalimba', 0.5, 0.055, (ch) => tones(ch, ch[1] + 12, ch[1] + 36)[s + n], n); }],
    // a hamster
    squeak: [70, () => {
      const f = 2500 + ri(5) * 120;
      tone(f, 0.045, { type: 'sine', vol: 0.04, to: f * 1.45 }); tone(f * 1.3, 0.07, { type: 'sine', vol: 0.04, to: f * 0.9, at: 0.06 });
    }],
    // a stink pocket opens: a long rude raspberry that sags, and a hiss of gas
    gas: [250, () => {
      const f = 118 + ri(4) * 9;
      tone(f, 0.55, { type: 'sawtooth', vol: 0.16, to: f * 0.62, trem: [31, 1, 'square'], filt: ['lowpass', 1100, 2] });
      tone(f * 2.02, 0.4, { type: 'square', vol: 0.03, to: f * 1.2, trem: [29, 1, 'square'] });
      noise(0.5, { type: 'bandpass', f: 2600, to: 900, q: 1, vol: 0.02, attack: 0.05 });
    }],
    // a cave-in: a long rumble and rocks that knock
    cave: [300, () => {
      const r = root();
      noise(0.9, { f: 700, to: 60, vol: 0.2, attack: 0.03 }); tone(r, 0.7, { type: 'sine', vol: 0.14, to: r / 2, vib: [14, 8] });
      for (let i = 0; i < 6; i++) noise(0.04, { type: 'bandpass', f: 400 + ri(900), q: 2.5, vol: 0.08, at: 0.05 + i * 0.1 + Math.random() * 0.05 });
    }],
    // a worm nest: wet squirming, wobbly slides that cross
    worms: [250, () => {
      for (let i = 0; i < 4; i++) {
        const f = ct(1, ri(4)), up = i & 1;
        tone(up ? f : f * 1.5, 0.16, { type: 'sine', vol: 0.045, to: up ? f * 1.5 : f, at: i * 0.1, vib: [22 + ri(10), 30], attack: 0.02 });
      }
      noise(0.45, { type: 'bandpass', f: 500, to: 1500, q: 5, vol: 0.05, attack: 0.05 });
    }],
    // the dynamite is lit: a hiss with sparks, about 0.7 s
    fuse: [200, () => {
      noise(0.7, { type: 'highpass', f: 5200, vol: 0.03, attack: 0.03 });
      for (let i = 0; i < 6; i++) noise(0.015, { type: 'bandpass', f: 2600 + ri(2000), q: 5, vol: 0.04, at: 0.04 + i * 0.1 + Math.random() * 0.05 });
    }],
    // the dynamite goes off; boom(1) is a small blast
    boom: [45, (small) => {
      const v = small ? 0.5 : 1, r = root();
      noise(0.45, { f: 1600, to: 70, vol: 0.26 * v }); tone(r, 0.36, { type: 'sine', vol: 0.2 * v, to: r / 2 });
      tone(r * 2, 0.25, { type: 'triangle', vol: 0.1 * v, to: r });
      noise(0.5, { type: 'bandpass', f: 500, q: 0.6, vol: 0.05 * v, at: 0.15 });
    }],
    // a gem rolls out of the rock: glassy ticks that slow down, on the chord
    gemRoll: [150, () => {
      const ch = chord(), ts = tones(ch, ch[1] + 24, ch[1] + 44);
      [0, 0.06, 0.13, 0.22, 0.34].forEach((at, i) => ring('glock', ts[(i * 2 + ri(2)) % ts.length], at, 0.03, 0.5));
    }],
    // a sapper mole is tunnelling near: scratching and two low notes
    sapper: [300, () => {
      for (let i = 0; i < 4; i++) noise(0.05, { type: 'bandpass', f: 800 + ri(300), q: 3, vol: 0.05, at: i * 0.07, attack: 0.01 });
      const r = root(); tone(r * 2, 0.16, { type: 'sawtooth', vol: 0.06, at: 0.3, filt: ['lowpass', 600, 1] });
      tone(r * 2 * 1.06, 0.22, { type: 'sawtooth', vol: 0.06, at: 0.48, filt: ['lowpass', 600, 1] });
    }],

    // --- sky ---
    // a cloud is nudged or bumps another: a soft puff of air
    puff: [60, () => noise(0.16, { f: 900, to: 300, vol: 0.06, attack: 0.03 })],
    // two clouds merge; a higher tier is a grander sound: two notes, three notes, a glock figure, bells, then brass
    merge: [80, (tier = 1) => {
      const n = int(tier, 5);
      noise(0.2, { f: 700, to: 1800, vol: 0.05, attack: 0.05 });
      if (n <= 2) { for (let k = 0; k <= Math.max(1, n); k++) melo('merge', 'kalimba', 0.5, 0.06, (ch) => tones(ch, ch[1] + 12, ch[1] + 36)[k + n], k); }
      else if (n === 3) cadence([2, 4], 'glock', 0.05, { hold: 0.8 });
      else if (n === 4) cadence([0, 2, 4], 'bell', 0.05, { hold: 1 });
      else { cadence([0, 2, 4, 6], 'brass', 0.055, { duck: true }); noise(0.5, { type: 'highpass', f: 5000, vol: 0.03, at: 0.3, attack: 0.1 }); }
    }],
    // a rain cloud waters the ground: a short soft patter
    rain: [250, () => {
      noise(0.6, { type: 'highpass', f: 4500, vol: 0.014, attack: 0.08 });
      for (let i = 0; i < 10; i++) noise(0.02, { type: 'bandpass', f: 2200 + ri(3000), q: 3, vol: 0.022, at: Math.random() * 0.5 });
    }],
    // a storm cloud strikes: a crack, then a roll that fades
    thunder: [300, () => {
      const r = root();
      noise(0.07, { type: 'highpass', f: 2500, vol: 0.16 });
      noise(0.9, { f: 900, to: 80, vol: 0.2, at: 0.04 }); noise(0.7, { f: 500, to: 70, vol: 0.12, at: 0.4, attack: 0.08 });
      noise(0.7, { f: 350, to: 60, vol: 0.08, at: 0.8, attack: 0.1 });
      tone(r, 0.9, { type: 'sine', vol: 0.12, to: r / 2, vib: [11, 6], at: 0.04 });
    }],
    // an anchor pins a cloud: a brass clank and a chain
    anchor: [100, () => {
      const ch = chord();
      noise(0.03, { type: 'bandpass', f: 2800, q: 3, vol: 0.09 }); ring('bell', ch[1], 0, 0.07, 0.4); ring('glock', ch[3] + 12, 0, 0.04, 0.5);
      for (let i = 0; i < 4; i++) noise(0.015, { type: 'bandpass', f: 4200, q: 6, vol: 0.035, at: 0.1 + i * 0.045 });
    }],
    // a rainbow appears: a quick scale run up to the tonic
    rainbow: [300, () => cadence([0, 1, 2, 3, 4, 5, 6], 'glock', 0.04, { step: 0.5, hold: 0.7 })],

    // --- layers ---
    // the lift goes up one layer: a whoosh that rises and a ping on arrival
    layerUp: [120, () => {
      const f = ct(1, 0);
      noise(0.3, { type: 'bandpass', f: 400, to: 3400, q: 1.5, vol: 0.06, attack: 0.07 });
      tone(f, 0.26, { type: 'sine', vol: 0.045, to: f * 2, attack: 0.03 });
      ring('glock', chord()[1] + 36, 0.26, 0.045, 0.6);
    }],
    // the lift goes down one layer: a whoosh that falls and a soft knock on arrival
    layerDown: [120, () => {
      const f = ct(2, 0);
      noise(0.3, { type: 'bandpass', f: 3400, to: 320, q: 1.5, vol: 0.06, attack: 0.07 });
      tone(f, 0.26, { type: 'sine', vol: 0.045, to: f / 2, attack: 0.03 });
      ring('mallet', chord()[1], 0.26, 0.09, 1);
    }],

    // --- big moments ---
    // a combo tier is reached: two bell notes a third apart, higher with the tier; from tier 4 a brass call on top
    combo: [120, (tier = 1) => {
      const i = int(tier, 5);
      melo('combo', 'bell', 1, 0.05, (ch) => tones(ch, ch[1] + 12, ch[1] + 40)[i]);
      melo('combo', 'bell', 1, 0.045, (ch) => tones(ch, ch[1] + 12, ch[1] + 41)[i + 2], 1);
      if (i >= 4) cadence([4, 4], 'brass', 0.055, { wait: 2, duck: true });
    }],
    // the level is won: a brass fanfare up to the tonic, with a sparkle over the last chord
    clear: [0, () => {
      cadence([4, 5, 6], 'brass', 0.055, { duck: true });
      const sc = MODES[style.mode], t = stepLen() * 4;
      [12, 12 + sc[2], 19, 24].forEach((up, i) => ring('glock', 60 + mod12(key) + up, t + i * 0.07, 0.03, 0.8));
    }],
    // the castle falls: four slow bell notes down to the tonic and a sad trombone
    over: [0, () => {
      cadence([4, 3, 2, 1], 'bell', 0.06, { step: 2, end: [0], bass: false });
      const f = ct(0, 2);
      tone(f, 0.45, { type: 'sawtooth', vol: 0.035, to: f * 0.94, attack: 0.04, filt: ['lowpass', 900, 1] });
      tone(f * 0.94, 0.9, { type: 'sawtooth', vol: 0.035, to: f * 0.7, at: 0.45, attack: 0.04, vib: [5, 4], filt: ['lowpass', 800, 1] });
    }],
    // a boss arrives: three heavy low pulses under a riser
    bossWarn: [0, () => {
      const r = root();
      for (let i = 0; i < 3; i++) tone(r * 2, 0.32, { type: 'sawtooth', vol: 0.08, to: r * 2 * 0.94, at: i * 0.36, attack: 0.02, filt: ['lowpass', 900, 2] });
      noise(1.2, { type: 'bandpass', f: 300, to: 5000, q: 3, vol: 0.045, attack: 0.3 });
    }],
    // a shot lands on a boss: a short heavy knock
    bossHit: [40, () => { tone(root(), 0.07, { vol: 0.05 }); noise(0.05, { f: 1500, vol: 0.05 }); }],
    // a boss is beaten: four blasts, then a brass fanfare
    bossDie: [0, () => {
      const r = root();
      for (let i = 0; i < 4; i++) { noise(0.4, { f: 1500, to: 70, vol: 0.12, at: i * 0.14 }); tone(r * 2, 0.35, { type: 'triangle', vol: 0.1, to: r / 2, at: i * 0.14 }); }
      cadence([4, 4, 4], 'brass', 0.06, { wait: 4, duck: true });
    }],
    // a relic is found: three slow bell notes up the chord
    relic: [0, () => cadence([2, 4, 6], 'bell', 0.05, { step: 2, hold: 1, duck: true })],
  };
  // Any name that is not in the table is a silent function, so a call with a new name never throws.
  const table = {}, silent = () => {};
  for (const k in defs) table[k] = fx(k, defs[k][0], defs[k][1]);
  const sfx = new Proxy(table, { get: (t, k) => (Object.prototype.hasOwnProperty.call(t, k) ? t[k] : silent) });

  // ---------- music ----------
  // The song is made of 4-bar sections: verse, chorus and break, in forms such as verse verse chorus chorus.
  // Verse and chorus each have a progression, a riff shape, an arpeggio shape, a bass rhythm, a drum groove and
  // a composed lead, so themes come back. The level style sets tempo, swing and mode. Six channels have their own
  // gain: a mood change fades channels in and out, and the song continues without a restart.
  // The band is a garden band: a music-box lead, a plucked arpeggio, a bass that bounces between root, octave and
  // fifth, a soft kick, a woodblock for a snare and a shaker for hats.
  const MUSIC_VOL = 0.5;
  const CHANNELS = ['pad', 'bass', 'arp', 'lead', 'counter', 'drums'];
  // moods: 0 = ambient (menu, shop, pause), 1 = play, 2 = boss or combo fever
  const MIX = [
    { pad: 1, bass: 0.35, arp: 0.55, lead: 0, counter: 0, drums: 0, cutoff: 1000 },
    { pad: 0.8, bass: 1, arp: 0.8, lead: 1, counter: 0.8, drums: 0.7, cutoff: 3200 },
    { pad: 0.8, bass: 1, arp: 1, lead: 1, counter: 1, drums: 0.9, cutoff: 7000 },
  ];
  // Layer colours. Channel values multiply the mood mix; padCut = lowpass of the pad in Hz, cut = factor on the
  // cutoff of the whole music, wet = level of the echo. layer() fades from one row to another.
  const LAYER = {
    sky: { pad: 1.3, bass: 0.55, arp: 1.45, lead: 0.9, counter: 1.1, drums: 0.3, padCut: 6000, cut: 1.3, wet: 0.45 },
    ground: { pad: 1, bass: 1, arp: 1, lead: 1, counter: 1, drums: 1, padCut: 3200, cut: 1, wet: 0.3 },
    dig: { pad: 0.75, bass: 1.4, arp: 0.6, lead: 0.85, counter: 0.6, drums: 1.35, padCut: 550, cut: 0.7, wet: 0.16 },
  };
  const FADE = 0.13; // time constant of a layer change: the mix is 95 % there after 0.4 s
  // progressions as [scale degree, 0 triad | 1 seventh | 2 sus4 | 3 sus2]; all start on the tonic
  const PROGS = {
    major: [
      [[0, 0], [5, 1], [3, 0], [4, 2]], [[0, 0], [3, 0], [1, 1], [4, 0]], [[0, 0], [4, 0], [5, 1], [3, 0]],
      [[0, 3], [2, 1], [3, 0], [4, 1]], [[0, 0], [3, 0], [0, 0], [4, 2]], [[0, 0], [1, 1], [3, 0], [4, 0]],
    ],
    minor: [[[0, 0], [5, 0], [2, 0], [6, 0]], [[0, 1], [3, 1], [6, 0], [2, 1]], [[0, 3], [5, 1], [3, 0], [6, 2]], [[0, 0], [6, 0], [5, 0], [6, 0]]],
    dorian: [[[0, 1], [3, 0], [0, 1], [3, 1]], [[0, 1], [6, 0], [3, 0], [4, 1]], [[0, 0], [2, 0], [3, 0], [6, 0]], [[0, 1], [1, 1], [2, 1], [3, 0]]],
    mixo: [[[0, 0], [6, 0], [3, 0], [0, 2]], [[0, 0], [6, 0], [3, 0], [4, 1]], [[0, 0], [3, 0], [6, 0], [3, 0]], [[0, 3], [6, 0], [5, 1], [3, 0]]],
  };
  // v = verse, c = chorus (denser, harmony voice), b = break (no drums or lead)
  const FORMS = [['v', 'v', 'c', 'c'], ['v', 'c', 'v', 'c'], ['v', 'v', 'c', 'b'], ['b', 'v', 'c', 'c']];
  // arpeggio shapes: n = chord tone n % 3, raised by floor(n / 3) octaves; -1 = rest
  const ARPS = [[0, 1, 2, 1, 0, 2, 1, 2], [0, 2, 1, 2, 0, 2, 1, 2], [0, 1, 2, 3, 2, 1, 0, 1], [0, -1, 2, 1, -1, 2, 0, -1], [2, 1, 0, 1, 2, 1, 0, -1], [0, 3, 1, 4, 2, 5, 1, 4], [0, 2, 3, 2, -1, 2, 3, 5]];
  // bass rhythms: [step, semitones above the root]. 0 = ambient and break, 1-2 = verse, 3 = chorus, 4 = hot mood.
  // The bass bounces: root, octave, fifth. Step 14 is free for the walk into the next chord.
  const BASS = [
    [[0, 0], [8, 7]], [[0, 0], [4, 12], [8, 7], [12, 12]], [[0, 0], [6, 12], [8, 0], [10, 7]],
    [[0, 0], [2, 12], [4, 7], [8, 0], [10, 12], [12, 7]], [[0, 0], [2, 12], [4, 0], [6, 12], [8, 0], [10, 12], [12, 7]],
  ];
  // drum grooves: kick, woodblock, shaker, ghost block and open shaker steps. 0 = break, 1-2 = verse, 3 = chorus, 4 = hot.
  const DRUMS = [
    { k: [0], s: [], h: [4, 12], g: [], o: [] },
    { k: [0, 8], s: [4, 12], h: [2, 6, 10, 14], g: [], o: [] },
    { k: [0, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], g: [7], o: [] },
    { k: [0, 6, 8], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12], g: [11, 15], o: [14] },
    { k: [0, 4, 8, 12], s: [4, 12], h: [1, 3, 5, 7, 9, 11, 13, 15], g: [10, 14], o: [6] },
  ];
  // lead rhythms: the steps of a bar on which a note starts
  const RHY = [[0, 4, 8, 12], [0, 3, 6, 8, 12], [0, 6, 8, 10, 14], [2, 4, 8, 11, 12], [0, 8, 12], [0, 2, 4, 8, 10, 12], [4, 6, 8, 14]];
  const chan = {}, lay = {};
  let step = 0, nextT = 0, level = 0, layerName = 'ground', sec = null, form = null, formPos = 0, lastType = '', guide = 62;
  // hot = the streak (it adds a faster arpeggio and a shaker), rush = tempo factor in the last seconds of the clock,
  // cut = start a new section at the next bar
  let hot = 0, rush = 1, cut = false, beat0 = 0;
  const bpm = () => (level === 0 ? Math.max(88, style.bpm - 8) : level === 2 ? Math.min(132, style.bpm + 12) : style.bpm);
  const stepLen = () => 60 / (bpm() * rush) / 4;
  const echoTime = () => (3 * 60) / bpm() / 4;
  // the lowpass of the whole music: set by the mood, opened by a long streak, coloured by the layer
  const cutoff = () => Math.min(12000, (level === 1 && hot >= 20 ? 6000 : MIX[level].cutoff) * LAYER[layerName].cut);

  const near = (lad, m) => { let b = 0; lad.forEach((x, i) => { if (Math.abs(x - m) < Math.abs(lad[b] - m)) b = i; }); return b; };
  // the ladder index near k whose note is in pcs
  function snap(lad, k, pcs) {
    k = Math.max(0, Math.min(lad.length - 1, k));
    for (const o of [0, 1, -1, 2, -2, 3, -3]) { const x = lad[k + o]; if (x != null && pcs.includes(x % 12)) return k + o; }
    return k;
  }
  // A lead that develops a motif over 4 bars: statement, repeat or sequence, statement or sequence, answer.
  // The answer inverts the motif and ends on the root or third. Strong beats and phrase ends land on chord tones.
  function composeLead(chords, chorus, pent) {
    const lo = chorus ? 67 : 62, lads = chords.map((ch) => ladder(ch, lo, lo + 19, pent));
    const pool = chorus ? RHY.filter((r) => r.length >= 5) : RHY;
    const rA = pool[ri(pool.length)], rB = RHY[ri(RHY.length)];
    const mv = rA.map(() => [-2, -1, -1, 1, 1, 2, 0][ri(7)]);
    const plan = [0, ri(2) ? 1 : 2, ri(2) ? 0 : 2, 3], shift = ri(2) ? 2 : -2;
    const out = new Array(64).fill(null);
    let first = 0, prev = 0;
    for (let bar = 0; bar < 4; bar++) {
      const lad = lads[bar], ch = chords[bar], kind = plan[bar], r = kind === 3 ? rB : rA;
      const from = bar === 0 ? lad[lad.length >> 1] : kind === 3 ? prev : first;
      let k = snap(lad, near(lad, from) + (kind === 2 ? shift : 0), ch.pcs);
      if (bar === 0) first = lad[k];
      r.forEach((st, j) => {
        if (j > 0) k = Math.max(0, Math.min(lad.length - 1, k + (kind === 3 ? -mv[j % mv.length] : mv[j])));
        const end = j === r.length - 1;
        if (end && bar === 3) k = snap(lad, k, ch.pcs.slice(0, 2));
        else if (st % 8 === 0 || (end && bar === 1)) k = snap(lad, k, ch.pcs);
        out[bar * 16 + st] = { m: lad[k], len: Math.min((end ? 16 : r[j + 1]) - st, end && bar === 3 ? 10 : 6) };
        prev = lad[k];
      });
    }
    return out;
  }
  function newForm() {
    const pool = PROGS[style.mode], a = ri(pool.length);
    let b = ri(pool.length - 1); if (b >= a) b++;
    const pent = PENTA[style.mode].map((p) => mod12(p + key)), scale = MODES[style.mode].map((p) => mod12(p + key));
    const make = (p, type) => {
      const shape = SHAPES[ri(SHAPES.length)], chords = pool[p].map(([d, x]) => writeRiff(chordOf(d, x), shape, pent));
      return {
        type, chords, scale, swing: style.swing, lead: composeLead(chords, type === 'c', pent),
        arp: ARPS[ri(ARPS.length)], bass: type === 'c' ? 3 : 1 + ri(2), drum: 1 + ri(2),
      };
    };
    const V = make(a, 'v'), C = make(b, 'c'), Br = Object.assign({}, V, { type: 'b' });
    form = FORMS[ri(FORMS.length)].map((x) => (x === 'v' ? V : x === 'c' ? C : Br));
    formPos = 0;
    if (delay) delay.delayTime.setTargetAtTime(echoTime(), ctx.currentTime, 0.1);
  }
  function nextSection() {
    if (!form || formPos >= 4 || key !== wantKey || style !== wantStyle) { key = wantKey; style = wantStyle; newForm(); }
    const s = form[formPos++];
    // per-section variation: a chime at the start of the form or of a chorus, and one of four drum fills
    sec = Object.assign({}, s, { fill: Math.random() < 0.7 ? 1 + ri(4) : 0, crash: formPos === 1 || (s.type === 'c' && lastType !== 'c') });
    lastType = s.type;
  }

  function mnote(bus, f, t, dur, type, vol, attack = 0.012) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.03);
  }
  function padNote(f, t, dur, v) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.028 * v, t + 0.25); g.gain.linearRampToValueAtTime(0.02 * v, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(chan.pad); o.start(t); o.stop(t + dur + 0.03);
  }
  // The lead is a music box: a sine with two short bright partials. It rings for at least 0.3 s, also on a short note.
  function toy(bus, f, t, dur, vol) {
    const d = Math.max(dur, 0.3);
    mnote(bus, f, t, d, 'sine', vol, 0.004);
    mnote(bus, f * 2, t, d * 0.45, 'sine', vol * 0.4, 0.003);
    if (f * 4 < 9000) mnote(bus, f * 4, t, 0.06, 'triangle', vol * 0.2, 0.002);
  }
  // The bass is short and round, so it bounces. The square an octave up carries it on a phone speaker.
  function bassNote(m, t, dur, vol) {
    mnote(chan.bass, hz(m), t, dur, 'triangle', vol * 1.5, 0.006);
    mnote(chan.bass, hz(m + 12), t, dur * 0.6, 'square', vol * 0.22, 0.006);
  }
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g); g.connect(chan.drums); o.start(t); o.stop(t + 0.2);
  }
  function hiss(t, vol, dur, type, freq) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(chan.drums); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  const hat = (t) => hiss(t, 0.018, 0.03, 'highpass', 7000); // a shaker
  const openHat = (t) => hiss(t, 0.018, 0.14, 'highpass', 7500);
  // instead of a crash cymbal: a triangle "ting"
  function crash(t) { mnote(chan.drums, 2637, t, 0.9, 'sine', 0.02, 0.002); mnote(chan.drums, 5274, t, 0.4, 'sine', 0.008, 0.002); hiss(t, 0.012, 0.3, 'highpass', 8000); }
  // instead of a snare: a woodblock with a little brush
  function snare(t, vol) { mnote(chan.drums, 820, t, 0.05, 'sine', vol * 0.9, 0.002); mnote(chan.drums, 1650, t, 0.03, 'triangle', vol * 0.3, 0.002); hiss(t, vol * 0.4, 0.07, 'bandpass', 2600); }
  const tom = (t, f) => mnote(chan.drums, f, t, 0.14, 'triangle', 0.08, 0.002);
  // Garden life in the quiet moments: a bird over sky and ground, a water drip in the mine. Both go to the echo.
  function critter(t, ch) {
    const o = ctx.createOscillator(), g = ctx.createGain(), dig = layerName === 'dig';
    const f = hz(ch[1 + ri(3)] + (dig ? 24 : 36)), n = dig ? 1 : 2 + ri(2);
    o.type = 'sine'; g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k < n; k++) {
      const a = t + k * 0.09;
      o.frequency.setValueAtTime(dig ? f * 1.5 : f, a); o.frequency.exponentialRampToValueAtTime(dig ? f : f * 1.3, a + 0.05);
      g.gain.exponentialRampToValueAtTime(0.02, a + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, a + 0.07);
    }
    o.connect(g); g.connect(chan.arp); o.start(t); o.stop(t + n * 0.09 + 0.05);
  }

  // the scale note next to bass note nxt on the side of cur; null when the chord does not change
  function approach(cur, nxt, scale) {
    if (cur === nxt) return null;
    const dir = nxt > cur ? -1 : 1;
    for (let m = nxt + dir; Math.abs(m - nxt) <= 2; m += dir) if (scale.includes(mod12(m))) return m;
    return nxt + dir;
  }
  // the highest chord tone at least a minor third under m
  function below(ch, m) {
    for (let x = m - 3; x > m - 10; x--) if (ch.pcs.includes(mod12(x))) return x;
    return null;
  }
  // A slow line of guide tones (third and seventh) that moves to the nearest one of the next chord.
  function guideTone(ch) {
    const pcs = [ch[2], ch[4] != null ? ch[4] : ch[3]].map(mod12);
    let best = null;
    for (let m = 55; m <= 70; m++) if (pcs.includes(m % 12) && (best === null || Math.abs(m - guide) < Math.abs(best - guide))) best = m;
    guide = best;
    return best;
  }

  function playStep(s, t) {
    const i = s & 15, bar = (s >> 4) & 3, ch = sec.chords[bar], len = stepLen();
    const calm = level === 0, type = level === 2 && sec.type === 'b' ? 'c' : sec.type, brk = type === 'b';
    const sky = layerName === 'sky', dig = layerName === 'dig';
    if (i & 1) t += sec.swing * len;
    if (i === 0) for (let k = 1; k < ch.length; k++) padNote(hz(ch[k]), t, len * 17, 3 / (ch.length - 1));
    // bass; on step 14 it walks into the root of the next chord
    const walk = !calm && !brk && i === 14 ? approach(ch[0], sec.chords[(bar + 1) & 3][0], sec.scale) : null;
    if (walk != null) bassNote(walk, t, len * 1.6, 0.06);
    else for (const [st, up] of BASS[calm || brk ? 0 : level === 2 ? 4 : sec.bass]) if (st === i) bassNote(ch[0] + up, t, len * (calm || brk ? 3 : 1.7), 0.065);
    // arpeggio: plucked in play, soft sines in the calm parts; in the sky it rings an octave higher
    const every = calm || brk ? 4 : level === 1 && hot < 10 ? 2 : 1;
    if (i % every === 0) {
      const n = sec.arp[(i / every) % 8], soft = calm || brk || sky;
      if (n >= 0) mnote(chan.arp, hz(ch[1 + (n % 3)] + 12 * (1 + Math.floor(n / 3)) + (level === 2 && i >= 8 ? 12 : 0) + (sky ? 12 : 0)), t, len * (soft ? 2.4 : 1.3), soft ? 'sine' : 'triangle', soft ? 0.04 : 0.03, 0.005);
    }
    if ((calm || brk) && i === 10 && Math.random() < (calm ? 0.3 : 0.5)) critter(t, ch);
    if (calm) return;
    // lead; in a chorus a harmony voice follows it a chord tone lower
    const note = brk ? null : sec.lead[s & 63];
    if (note) {
      const d = len * note.len * 0.95;
      toy(chan.lead, hz(note.m + (level === 2 ? 12 : 0)), t, d, level === 2 ? 0.04 : 0.055);
      if (level === 2) mnote(chan.lead, hz(note.m), t, d, 'square', 0.012, 0.02);
      const h = type === 'c' ? below(ch, note.m) : null;
      if (h) mnote(chan.counter, hz(h), t, d, 'triangle', 0.03, 0.02);
    }
    if (type !== 'c' && i % 8 === 0) mnote(chan.counter, hz(guideTone(ch)), t, len * 7.5, 'triangle', 0.028, 0.1);
    // drums; in the mine a low tom doubles the first beat
    const d = DRUMS[brk ? 0 : level === 2 ? 4 : type === 'c' ? 3 : sec.drum];
    const fill = bar === 3 && i >= 12 ? sec.fill : 0;
    if (i === 0 && bar === 0 && sec.crash && !brk) crash(t);
    if (fill === 4 && i >= 14) return; // a stop: two silent steps before the next section
    if (d.k.includes(i)) kick(t);
    if (dig && !brk && (i === 0 || i === 11)) tom(t, hz(ch[0] + 12));
    if (d.s.includes(i)) snare(t, 0.07); else if (d.g.includes(i)) snare(t, 0.018);
    if (d.o.includes(i)) openHat(t); else if (d.h.includes(i) || (level === 1 && hot >= 10 && (i & 1))) hat(t);
    if (fill === 1) snare(t, 0.03 + (i - 12) * 0.015);
    if (fill === 2) tom(t, [220, 185, 156, 131][i - 12]);
    if (fill === 3) { if (i & 1) snare(t, 0.05); else if (!d.k.includes(i)) kick(t); }
  }
  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05; // after a suspended tab
    while (nextT < ctx.currentTime + 0.18) {
      if (cut && (step & 15) === 0) { cut = false; step = 0; }
      if (step === 0) nextSection();
      if ((step & 3) === 0) beat0 = nextT;
      if ((step & 15) === 0) barQ.push({ t: nextT, ch: sec.chords[(step >> 4) & 3] });
      while (barQ.length > 4) curChord = barQ.shift().ch;
      if (musicOn) playStep(step, nextT);
      gridT = nextT; gridStep = step; gridLen = stepLen();
      nextT += stepLen(); step = (step + 1) & 63;
    }
  }

  return {
    init, sfx,
    // 0 = ambient (menu, shop, pause), 1 = playing, 2 = boss or combo fever
    music(l) {
      level = int(l, 2); if (level === 0) rush = 1;
      if (!ctx) return;
      for (const n of CHANNELS) chan[n].gain.setTargetAtTime(MIX[level][n], ctx.currentTime, 0.6);
      musicFilter.frequency.setTargetAtTime(cutoff(), ctx.currentTime, 0.5);
      delay.delayTime.setTargetAtTime(echoTime(), ctx.currentTime, 0.1);
    },
    // The layer on screen: 'sky', 'ground' or 'dig'. Cross-fades the mix in about 0.4 s; the song goes on.
    // sky: airy (arpeggio an octave up, pad and echo up, drums far away). ground: the full band.
    // dig: bass and drums forward with a low tom, the pad dark, the whole mix duller.
    // Without an argument (or with an unknown name) it changes nothing. Returns the current layer.
    layer(name) {
      if (!Object.prototype.hasOwnProperty.call(LAYER, name) || name === layerName) return layerName;
      layerName = name;
      if (!ctx) return layerName;
      const L = LAYER[name], t = ctx.currentTime;
      for (const n of CHANNELS) lay[n].gain.setTargetAtTime(L[n], t, FADE);
      padFilter.frequency.setTargetAtTime(L.padCut, t, FADE);
      wet.gain.setTargetAtTime(L.wet, t, FADE);
      musicFilter.frequency.setTargetAtTime(cutoff(), t, FADE);
      return layerName;
    },
    // A fever lifts the song by two semitones from the next bar. on = false puts it back.
    fever(on) { lift = on ? 2 : 0; wantKey = baseKey + lift; cut = true; },
    // The streak count. A long streak makes the arpeggio faster, adds a shaker and opens the filter.
    streak(n) {
      const was = hot; hot = +n || 0;
      if (!ctx || level !== 1 || (was >= 20) === (hot >= 20)) return;
      musicFilter.frequency.setTargetAtTime(cutoff(), ctx.currentTime, 0.4);
    },
    // Seconds left on the level clock. The tempo rises in the last 10 seconds. Call with a big number to reset.
    rush(left) { rush = left < 10 ? 1 + 0.015 * (10 - Math.max(0, left)) : 1; },
    // 1 on a beat of the music, then down to 0. For visuals that move with the music.
    beat() {
      if (!ctx || !musicOn || ctx.state !== 'running') return 0;
      const len = stepLen() * 4, ph = (((ctx.currentTime - beat0) / len) % 1 + 1) % 1;
      return (1 - ph) * (1 - ph);
    },
    // A new key and level style from the next section on. Called with the level number.
    tune(n) {
      n = Math.abs(n | 0);
      baseKey = mod12(KEYS[n % KEYS.length]); wantKey = baseKey + lift;
      wantStyle = STYLES[n % STYLES.length];
    },
    // 'off' before the first tap, then the AudioContext state
    state() { return ctx ? ctx.state : 'off'; },
    setSfx(on) { sfxOn = !!on; },
    setMusic(on) { musicOn = !!on; if (ctx) musicBus.gain.setTargetAtTime(musicOn ? MUSIC_VOL : 0, ctx.currentTime, 0.05); },
  };
})();
