'use strict';
/* Brick Bazaar audio: synthesised sound effects and generative music. No samples.
   Effects take their pitch from the chord that the music plays at that moment. The frequent gameplay effects
   play the next note of a riff on the music's grid, so a run of hits plays a tune. */
window.BBAudio = (() => {
  let ctx = null, sfxBus = null, musicBus = null, musicFilter = null, noiseBuf = null, delay = null, duck = null;
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
      musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = MIX[level].cutoff;
      musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? MUSIC_VOL : 0;
      // duck lowers the music for a moment under a fanfare
      duck = ctx.createGain();
      musicBus.connect(duck); duck.connect(musicFilter); musicFilter.connect(master);
      for (const n of ['pad', 'bass', 'arp', 'lead', 'counter', 'drums']) {
        chan[n] = ctx.createGain(); chan[n].gain.value = MIX[level][n]; chan[n].connect(musicBus);
      }
      // a feedback echo on the melodic channels
      // the echo time is three sixteenth notes, so that it stays on the beat
      const fb = ctx.createGain(), wet = ctx.createGain();
      delay = ctx.createDelay(1);
      delay.delayTime.value = echoTime(); fb.gain.value = 0.3; wet.gain.value = 0.3;
      chan.arp.connect(delay); chan.lead.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(musicBus);
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
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const ri = (n) => (Math.random() * n) | 0;
  const mod12 = (m) => ((m % 12) + 12) % 12;
  const MODES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10] };
  // the pentatonic subset of each mode: the melodies use it, because it has no semitones
  const PENTA = { major: [0, 2, 4, 7, 9], minor: [0, 3, 5, 7, 10], dorian: [0, 3, 5, 7, 9], mixo: [0, 2, 4, 7, 10] };
  // Level styles: tempo of the play mood, swing (how late the off-beat 16th notes come, in steps) and mode
  const STYLES = [
    { bpm: 112, swing: 0, mode: 'major' }, { bpm: 104, swing: 0.12, mode: 'dorian' }, { bpm: 120, swing: 0, mode: 'mixo' },
    { bpm: 116, swing: 0, mode: 'minor' }, { bpm: 100, swing: 0.16, mode: 'major' }, { bpm: 124, swing: 0.08, mode: 'dorian' },
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
  let gridT = 0, gridStep = 0; // time and number of the last step that the scheduler wrote
  const mel = { pos: 0, last: -9, note: 72, bass: 0, wall: 0, voices: [], slots: [] };

  // Time of the next grid slot, plus n slots. res: 0.5 = 32nd notes, 1 = 16th notes.
  function gridAt(res, n = 0) {
    const len = stepLen(), h = len * res;
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
  };
  // Plays MIDI note m on an instrument at time t. len stretches the decay. Returns false when the cap drops the note.
  function voice(inst, m, t, vol, len = 1) {
    const att = inst === 'brass' ? 0.025 : 0.003, dur = (k) => Math.max(INST[inst][k][3] * len, att + 0.02);
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

  const defs = {
    // a plucked bass line on the chord: root, fifth, octave, fifth on successive touches
    paddle: [30, () => {
      noise(0.025, { type: 'bandpass', f: 1800, vol: 0.03 });
      melo('bass', 'pluck', 0.5, 0.13, (ch, st) => (st ? null : ch[0] + [0, 7, 12, 7][mel.bass++ % 4]), 0, true);
    }],
    // a soft mallet that answers the riff an octave lower
    wall: [50, () => {
      noise(0.01, { type: 'bandpass', f: 2500, vol: 0.012 });
      melo('wall', 'mallet', 0.5, 0.035, (ch) => {
        const ts = tones(ch, 50, 74), k = ts.indexOf(ts.reduce((a, b) => (Math.abs(b - mel.note + 12) < Math.abs(a - mel.note + 12) ? b : a)));
        return ts[Math.min(ts.length - 1, k + [0, 1, 2, 1][mel.wall++ % 4])];
      });
    }],
    launch: [0, () => { const f = ct(0, 0); tone(f, 0.1, { type: 'triangle', vol: 0.06, to: f * 2 }); }],
    // combo = bricks broken since the last paddle touch; a long combo lifts the riff an octave
    brick: [28, (combo = 0) => {
      noise(0.012, { type: 'highpass', f: 5000, vol: 0.018 });
      melo('riff', 'marimba', 0.5, 0.05, (ch, st) => riffNext(ch, st, combo >= 8 ? 2 : 1));
    }],
    pop: [26, (combo = 0) => {
      noise(0.04, { type: 'highpass', f: 3000, vol: 0.03 });
      melo('riff', 'kalimba', 0.5, 0.065, (ch, st) => riffNext(ch, st, combo >= 8 ? 2 : 1));
    }],
    stone: [40, () => { tone(root(), 0.05, { vol: 0.03 }); noise(0.04, { f: 800, vol: 0.03 }); }],
    // coins climb the riff's ladder with the chain
    coin: [38, (chain = 0) => {
      noise(0.008, { type: 'highpass', f: 7000, vol: 0.012 });
      melo('coin', 'glock', 0.5, 0.045, (ch) => ch.ladder[int(chain, Math.min(7, ch.ladder.length - 1))] + 24);
    }],
    // a capsule: four chord tones up
    pu: [0, () => { const s = ri(2); for (let n = 0; n < 4; n++) melo('pu', 'kalimba', 0.5, 0.05, (ch) => tones(ch, ch[1] + 12, ch[1] + 36)[s + n], n); }],
    shot: [45, () => { const f = ct(2, ri(3)); tone(f, 0.05, { type: 'sawtooth', vol: 0.018, to: f / 4 }); }],
    laser: [60, () => { const f = ct(3, ri(3)); tone(f, 0.13, { type: 'sawtooth', vol: 0.028, to: f / 4 }); }],
    rocket: [80, () => noise(0.25, { type: 'bandpass', f: 500, to: 2600, q: 2, vol: 0.06 })],
    boom: [45, (small) => {
      const v = small ? 0.5 : 1, r = root();
      noise(0.38, { f: 1500, to: 70, vol: 0.24 * v }); tone(r, 0.32, { type: 'sine', vol: 0.2 * v, to: r / 2 });
      tone(r * 2, 0.25, { type: 'triangle', vol: 0.1 * v, to: r });
    }],
    zap: [50, () => { const f = ct(3, ri(3)); noise(0.09, { type: 'highpass', f: 2500, vol: 0.045 }); tone(f, 0.09, { type: 'sawtooth', vol: 0.028, to: f / 8 }); }],
    // the ball falls: three chord tones down, then the bass root
    lose: [0, () => {
      noise(0.3, { f: 600, vol: 0.07 });
      for (let n = 0; n < 3; n++) melo('lose', 'kalimba', 1, 0.06, (ch) => tones(ch, ch[1], ch[1] + 24)[5 - n], n);
      melo('lose', 'pluck', 1, 0.1, (ch) => ch[0], 3, true);
    }],
    over: [0, () => cadence([4, 3, 2, 1], 'bell', 0.06, { step: 2, end: [0], bass: false })],
    buy: [0, () => {
      arp(climb(2, ri(3), 3), 0.06, { type: 'triangle', vol: 0.07, dur: 0.12 });
      noise(0.06, { type: 'highpass', f: 5000, vol: 0.04, at: 0.12 });
    }],
    nope: [0, () => { tone(ct(0, 1), 0.12, { vol: 0.05 }); tone(ct(0, 0), 0.14, { vol: 0.05, at: 0.1 }); }],
    clear: [0, () => cadence([4, 5, 6], 'brass', 0.055, { duck: true })],
    net: [40, () => { const f = ct(0, 0); tone(f, 0.14, { type: 'sine', vol: 0.09, to: f * 2 }); }],
    fever: [0, () => cadence([4, 4], 'brass', 0.06, { duck: true })],
    star: [0, (i = 0) => { const f = ct(2, i); tone(f, 0.3, { type: 'sine', vol: 0.1 }); tone(f * 2, 0.2, { type: 'sine', vol: 0.04, at: 0.03 }); }],
    tick: [45, () => tone(ct(3, ri(3)), 0.02, { vol: 0.02 })],
    tab: [0, () => tone(ct(2, ri(3)), 0.05, { type: 'triangle', vol: 0.05 })],
    warn: [0, () => { const f = ct(1, 0), g = ct(1, 1); for (let i = 0; i < 3; i++) tone(f, 0.22, { vol: 0.05, to: g, at: i * 0.3 }); }],
    bossHit: [40, () => { tone(root(), 0.07, { vol: 0.05 }); noise(0.05, { f: 1500, vol: 0.05 }); }],
    bossDie: [0, () => {
      const r = root();
      for (let i = 0; i < 4; i++) { noise(0.4, { f: 1500, to: 70, vol: 0.12, at: i * 0.14 }); tone(r * 2, 0.35, { type: 'triangle', vol: 0.1, to: r / 2, at: i * 0.14 }); }
      cadence([4, 4, 4], 'brass', 0.06, { wait: 4, duck: true });
    }],
    foeHit: [35, () => melo('riff', 'pizz', 0.5, 0.035, (ch, st) => riffNext(ch, st, 1))],
    foePop: [30, () => {
      noise(0.06, { type: 'highpass', f: 2000, vol: 0.03 });
      melo('riff', 'kalimba', 0.5, 0.06, (ch, st) => riffNext(ch, st, 1));
    }],
    spit: [60, () => { const f = ct(0, ri(3)); tone(f, 0.1, { type: 'sine', vol: 0.04, to: f / 2 }); }],
    bossFire: [60, () => { const f = ct(0, 0); tone(f, 0.15, { type: 'sawtooth', vol: 0.04, to: f / 2 }); }],
    steal: [60, () => { const f = ct(1, ri(3)); tone(f, 0.08, { vol: 0.03, to: f / 2 }); }],
    stun: [0, () => { const r = root(); tone(r * 2, 0.25, { type: 'sawtooth', vol: 0.05, to: r }); }],
    // two bell notes a third apart; a higher tier starts higher
    streak: [120, (tier = 1) => {
      const i = int(tier, 5);
      melo('streak', 'bell', 1, 0.05, (ch) => tones(ch, ch[1] + 12, ch[1] + 40)[i]);
      melo('streak', 'bell', 1, 0.045, (ch) => tones(ch, ch[1] + 12, ch[1] + 40)[i + 2], 1);
    }],
    split: [60, () => { const f = ct(1, ri(3)), g = ct(2, ri(3)); tone(f, 0.1, { type: 'triangle', vol: 0.05, to: f * 2 }); tone(g, 0.1, { type: 'triangle', vol: 0.04, to: g * 2, at: 0.05 }); }],
    relic: [0, () => cadence([2, 4, 6], 'bell', 0.05, { step: 2, hold: 1, duck: true })],
    blimp: [60, () => {
      melo('blimp', 'bell', 1, 0.05, (ch) => tones(ch, ch[1] + 24, ch[1] + 40)[0]);
      const k = 1 + ri(2);
      melo('blimp', 'bell', 1, 0.05, (ch) => tones(ch, ch[1] + 24, ch[1] + 40)[k], 1);
    }],
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
      noise(0.9, { f: 3000, to: 60, vol: 0.18 }); tone(r * 2, 0.8, { type: 'sine', vol: 0.15, to: r / 2 }); tone(r * 4, 0.5, { type: 'triangle', vol: 0.08, to: r });
      tone(ct(1, 0), 0.5, { type: 'sawtooth', vol: 0.04, to: ct(3, 0) });
    }],
    // a fast scale run up to the tonic
    jackpot: [300, () => cadence([0, 1, 2, 3, 4, 5, 6], 'glock', 0.04, { step: 0.5, hold: 0.7 })],
    dice: [0, () => { for (let i = 0; i < 3; i++) tone(ct(2, ri(4)), 0.04, { vol: 0.04, at: i * 0.06 }); }],
    cheer: [150, (tier = 0) => { for (const f of climb(1, Math.min(tier, 4), 3)) tone(f, 0.28, { type: 'sawtooth', vol: 0.035 }); noise(0.1, { type: 'highpass', f: 4000, vol: 0.03 }); }],
    overdrive: [0, () => { const f = ct(0, 0); tone(f, 0.35, { type: 'sawtooth', vol: 0.05, to: f * 4 }); arp(climb(2, 0, 4), 0.05, { vol: 0.03, dur: 0.08 }); }],
    // bell chord tones that climb with n
    ding: [0, (n = 0) => melo('ding', 'bell', 1, 0.07, (ch) => tones(ch, ch[1] + 12, ch[1] + 40)[int(n, 6)])],
    squawk: [60, (n = 0) => { const f = ct(1, Math.min(n, 5)); tone(f * 1.5, 0.05, { type: 'square', vol: 0.035, to: f }); tone(f, 0.09, { type: 'sawtooth', vol: 0.04, to: f * 1.3, at: 0.05 }); }],
    riser: [0, () => noise(1.3, { type: 'bandpass', f: 400, to: 6000, q: 3, vol: 0.05 })],
    roar: [0, () => { noise(0.9, { type: 'bandpass', f: 900, q: 0.6, vol: 0.12 }); for (const f of climb(1, 0, 3)) tone(f, 0.7, { type: 'sawtooth', vol: 0.03 }); }],
    raspberry: [120, () => { const f = root(); for (let i = 0; i < 6; i++) tone(f * (1 + ri(3) * 0.06), 0.04, { type: 'sawtooth', vol: 0.06, at: i * 0.045 }); }],
    // the n-th riff note, two octaves up
    ping: [40, (n = 0) => melo('ping', 'glock', 0.5, 0.05, (ch) => ch.riff[int(n, 1e9) % 8] + 24)],
    eek: [90, () => { const f = ct(3, ri(4)); tone(f, 0.06, { type: 'sine', vol: 0.035, to: f * 1.4 }); }],
    whack: [50, () => { noise(0.07, { f: 900, vol: 0.1 }); tone(ct(0, ri(3)), 0.08, { type: 'triangle', vol: 0.07, to: root() / 2 }); }],
  };
  const sfx = {};
  for (const k in defs) sfx[k] = fx(k, defs[k][0], defs[k][1]);

  // ---------- music ----------
  // The song is made of 4-bar sections: verse, chorus and break, in forms such as verse verse chorus chorus.
  // Verse and chorus each have a progression, a riff shape, an arpeggio shape, a bass rhythm, a drum groove and
  // a composed lead, so themes come back. The level style sets tempo, swing and mode. Six channels have their own
  // gain: a mood change fades channels in and out, and the song continues without a restart.
  const MUSIC_VOL = 0.5;
  // moods: 0 = ambient (menu, bazaar, pause), 1 = play, 2 = fever or boss
  const MIX = [
    { pad: 1, bass: 0.35, arp: 0.5, lead: 0, counter: 0, drums: 0, cutoff: 800 },
    { pad: 0.8, bass: 1, arp: 0.8, lead: 1, counter: 0.8, drums: 0.8, cutoff: 2600 },
    { pad: 0.8, bass: 1, arp: 1, lead: 1, counter: 1, drums: 1, cutoff: 7000 },
  ];
  // progressions as [scale degree, 0 triad | 1 seventh | 2 sus4 | 3 sus2]; all start on the tonic
  const PROGS = {
    major: [
      [[0, 0], [5, 1], [3, 0], [4, 2]], [[0, 1], [3, 1], [1, 1], [4, 0]], [[0, 0], [4, 0], [5, 1], [3, 0]],
      [[0, 3], [2, 1], [3, 0], [4, 1]], [[0, 0], [3, 0], [0, 0], [4, 2]], [[0, 1], [5, 1], [1, 1], [4, 1]],
    ],
    minor: [[[0, 0], [5, 0], [2, 0], [6, 0]], [[0, 1], [3, 1], [6, 0], [2, 1]], [[0, 3], [5, 1], [3, 0], [6, 2]], [[0, 0], [6, 0], [5, 0], [6, 0]]],
    dorian: [[[0, 1], [3, 0], [0, 1], [3, 1]], [[0, 1], [6, 0], [3, 0], [4, 1]], [[0, 0], [2, 0], [3, 0], [6, 0]], [[0, 1], [1, 1], [2, 1], [3, 0]]],
    mixo: [[[0, 0], [6, 0], [3, 0], [0, 2]], [[0, 1], [6, 0], [3, 0], [4, 1]], [[0, 0], [3, 0], [6, 0], [3, 0]], [[0, 3], [6, 0], [5, 1], [3, 0]]],
  };
  // v = verse, c = chorus (denser, harmony voice), b = break (no drums or lead)
  const FORMS = [['v', 'v', 'c', 'c'], ['v', 'c', 'v', 'c'], ['v', 'v', 'c', 'b'], ['b', 'v', 'c', 'c']];
  // arpeggio shapes: n = chord tone n % 3, raised by floor(n / 3) octaves; -1 = rest
  const ARPS = [[0, 1, 2, 1, 0, 2, 1, 2], [0, 2, 1, 2, 0, 2, 1, 2], [0, 1, 2, 3, 2, 1, 0, 1], [0, -1, 2, 1, -1, 2, 0, -1], [2, 1, 0, 1, 2, 1, 0, -1], [0, 3, 1, 4, 2, 5, 1, 4]];
  // bass rhythms: [step, semitones above the root]. 0 = ambient and break, 1-2 = verse, 3 = chorus, 4 = hot mood.
  // Step 14 is free for the walk into the next chord.
  const BASS = [
    [[0, 0], [8, 0]], [[0, 0], [6, 0], [8, 0]], [[0, 0], [4, 12], [8, 0], [12, 7]],
    [[0, 0], [3, 0], [6, 12], [8, 0], [10, 7]], [[0, 0], [3, 0], [6, 12], [8, 0], [11, 0]],
  ];
  // drum grooves: kick, snare, closed hat, ghost snare and open hat steps. 0 = break, 1-2 = verse, 3 = chorus, 4 = hot.
  const DRUMS = [
    { k: [0, 8], s: [], h: [4, 12], g: [], o: [] },
    { k: [0, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], g: [7, 15], o: [] },
    { k: [0, 6, 8], s: [4, 12], h: [2, 6, 10], g: [11], o: [14] },
    { k: [0, 3, 8, 11], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12], g: [7, 9, 15], o: [14] },
    { k: [0, 4, 8, 12], s: [4, 12], h: [1, 3, 5, 7, 9, 11, 13, 15], g: [10, 14], o: [6] },
  ];
  // lead rhythms: the steps of a bar on which a note starts
  const RHY = [[0, 4, 8, 12], [0, 3, 6, 8, 12], [0, 6, 8, 10, 14], [2, 4, 8, 11, 12], [0, 8, 12], [0, 2, 4, 8, 10, 12], [4, 6, 8, 14]];
  const chan = {};
  let step = 0, nextT = 0, level = 0, sec = null, form = null, formPos = 0, lastType = '', guide = 62;
  // hot = the streak (it adds a faster arpeggio and hats), rush = tempo factor in the last seconds of the clock,
  // cut = start a new section at the next bar
  let hot = 0, rush = 1, cut = false, beat0 = 0;
  const bpm = () => (level === 0 ? Math.max(100, style.bpm - 8) : level === 2 ? Math.min(132, style.bpm + 12) : style.bpm);
  const stepLen = () => 60 / (bpm() * rush) / 4;
  const echoTime = () => (3 * 60) / bpm() / 4;

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
    // per-section variation: a crash at the start of the form or of a chorus, and one of four drum fills
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
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.1);
    g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(chan.drums); o.start(t); o.stop(t + 0.2);
    hiss(t, 0.05, 0.008, 'highpass', 3000);
  }
  function hiss(t, vol, dur, type, freq) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(chan.drums); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  const hat = (t) => hiss(t, 0.025, 0.04, 'highpass', 6000);
  const openHat = (t) => hiss(t, 0.025, 0.22, 'highpass', 7000);
  const crash = (t) => hiss(t, 0.045, 1.2, 'highpass', 5000);
  function snare(t, vol) { hiss(t, vol, 0.12, 'bandpass', 1800); mnote(chan.drums, 190, t, 0.07, 'triangle', vol * 0.8, 0.002); }
  const tom = (t, f) => mnote(chan.drums, f, t, 0.14, 'triangle', 0.09, 0.002);

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
    if (i & 1) t += sec.swing * len;
    if (i === 0) for (let k = 1; k < ch.length; k++) padNote(hz(ch[k]), t, len * 17, 3 / (ch.length - 1));
    // bass; on step 14 it walks into the root of the next chord
    const walk = !calm && !brk && i === 14 ? approach(ch[0], sec.chords[(bar + 1) & 3][0], sec.scale) : null;
    if (walk != null) mnote(chan.bass, hz(walk), t, len * 1.8, 'sawtooth', 0.07);
    else for (const [st, up] of BASS[calm || brk ? 0 : level === 2 ? 4 : sec.bass]) if (st === i) mnote(chan.bass, hz(ch[0] + up), t, len * 2.2, 'sawtooth', 0.075);
    const every = calm || brk ? 4 : level === 1 && hot < 10 ? 2 : 1;
    if (i % every === 0) {
      const n = sec.arp[(i / every) % 8];
      if (n >= 0) mnote(chan.arp, hz(ch[1 + (n % 3)] + 12 * (1 + Math.floor(n / 3)) + (level === 2 && i >= 8 ? 12 : 0)), t, len * 1.6, calm || brk ? 'sine' : 'square', calm || brk ? 0.04 : 0.016);
    }
    if (calm) return;
    // lead; in a chorus a harmony voice follows it a chord tone lower
    const note = brk ? null : sec.lead[s & 63];
    if (note) {
      const d = len * note.len * 0.95;
      mnote(chan.lead, hz(note.m + (level === 2 ? 12 : 0)), t, d, level === 2 ? 'square' : 'triangle', level === 2 ? 0.026 : 0.055, 0.02);
      const h = type === 'c' ? below(ch, note.m) : null;
      if (h) mnote(chan.counter, hz(h), t, d, 'triangle', 0.03, 0.02);
    }
    if (type !== 'c' && i % 8 === 0) mnote(chan.counter, hz(guideTone(ch)), t, len * 7.5, 'triangle', 0.028, 0.1);
    // drums
    const d = DRUMS[brk ? 0 : level === 2 ? 4 : type === 'c' ? 3 : sec.drum];
    const fill = bar === 3 && i >= 12 ? sec.fill : 0;
    if (i === 0 && bar === 0 && sec.crash && !brk) crash(t);
    if (fill === 4 && i >= 14) return; // a stop: two silent steps before the next section
    if (d.k.includes(i)) kick(t);
    if (d.s.includes(i)) snare(t, 0.08); else if (d.g.includes(i)) snare(t, 0.018);
    if (d.o.includes(i)) openHat(t); else if (d.h.includes(i) || (level === 1 && hot >= 10 && (i & 1))) hat(t);
    if (fill === 1) snare(t, 0.03 + (i - 12) * 0.02);
    if (fill === 2) tom(t, [220, 185, 156, 131][i - 12]);
    if (fill === 3) { if (i & 1) snare(t, 0.06); else if (!d.k.includes(i)) kick(t); }
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
      gridT = nextT; gridStep = step;
      nextT += stepLen(); step = (step + 1) & 63;
    }
  }

  return {
    init, sfx,
    // 0 = ambient (menu, bazaar, pause), 1 = playing, 2 = fever or boss
    music(l) {
      level = l; if (l === 0) rush = 1;
      if (!ctx) return;
      for (const n in chan) chan[n].gain.setTargetAtTime(MIX[l][n], ctx.currentTime, 0.6);
      musicFilter.frequency.setTargetAtTime(MIX[l].cutoff, ctx.currentTime, 0.5);
      delay.delayTime.setTargetAtTime(echoTime(), ctx.currentTime, 0.1);
    },
    // A fever lifts the song by two semitones from the next bar. on = false puts it back.
    fever(on) { lift = on ? 2 : 0; wantKey = baseKey + lift; cut = true; },
    // The streak count. A long streak makes the arpeggio faster, adds hats and opens the filter.
    streak(n) {
      const was = hot; hot = n;
      if (!ctx || level !== 1 || (was >= 20) === (n >= 20)) return;
      musicFilter.frequency.setTargetAtTime(n >= 20 ? 6000 : MIX[1].cutoff, ctx.currentTime, 0.4);
    },
    // Seconds left on the level clock. The tempo rises in the last 10 seconds. Call with a big number to reset.
    rush(left) { rush = left < 10 ? 1 + 0.015 * (10 - left) : 1; },
    // 1 on a beat of the music, then down to 0. For visuals that move with the music.
    beat() {
      if (!ctx || !musicOn || ctx.state !== 'running') return 0;
      const len = stepLen() * 4, ph = (((ctx.currentTime - beat0) / len) % 1 + 1) % 1;
      return (1 - ph) * (1 - ph);
    },
    // A new key and level style from the next section on. Called with the level number.
    tune(n) {
      baseKey = mod12(KEYS[n % KEYS.length]); wantKey = baseKey + lift;
      wantStyle = STYLES[n % STYLES.length];
    },
    // 'off' before the first tap, then the AudioContext state
    state() { return ctx ? ctx.state : 'off'; },
    setSfx(on) { sfxOn = on; },
    setMusic(on) { musicOn = on; if (ctx) musicBus.gain.setTargetAtTime(on ? MUSIC_VOL : 0, ctx.currentTime, 0.05); },
  };
})();
