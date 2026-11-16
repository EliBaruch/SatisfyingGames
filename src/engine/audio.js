// Tiny WebAudio synth: sound effects, combo pitch runs and soft generative music.
// No samples, no network. Voice functions take any BaseAudioContext so they can be rendered offline.
import { GAME } from './config.js';

const MASTER_LEVEL = 0.85;
const MUSIC_LEVEL = 0.9;     // music notes are written quiet; this bus keeps them ~13% of the effects
const MAX_VOICES = 24;
const AUDIBLE_RANGE = 20;
const COMBO_RESET = 0.5;
const PENTA = [0, 2, 4, 7, 9];
const COMBO_MAX_DEGREE = 10; // two octaves, then hold
const COMBO_NAMES = new Set(['cut', 'stack', 'cash', 'pay', 'egg', 'shelf']);
const MIN_GAP = { cut: 0.04, stack: 0.04, cash: 0.04, pay: 0.04, drop: 0.06, sell: 0.12, unlock: 0.15, bigUnlock: 0.3, hire: 0.15, full: 0.15, win: 1.0, tractor: 0.25, step: 0.12,
  egg: 0.04, cluck: 0.35, pack: 0.2, machine: 0.25, crate: 0.08, shelf: 0.05, scan: 0.08, truck: 1.0, feed: 0.15, travel: 1.0, perk: 0.4,
  press: 0.3, weld: 0.2, servo: 0.3, car: 0.5, build: 0.05, whoosh: 0.4 };
const IMPORTANT = new Set(['unlock', 'bigUnlock', 'win', 'hire', 'travel', 'perk']);

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const fin = (x, d) => (Number.isFinite(x) ? x : d);

// ------------------------------------------------------------------ voice kit ---
const noiseBuffers = new WeakMap();
function getNoise(ctx) {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    const len = Math.floor(ctx.sampleRate * 1.0);
    b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let s = 22222; // deterministic LCG, so offline renders are repeatable
    for (let i = 0; i < len; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
    noiseBuffers.set(ctx, b);
  }
  return b;
}

/** Oscillator with soft attack and exponential decay. Frequencies are multiplied by kit.pitch. */
function tone(k, { type = 'sine', f0, f1, t = 0, dur = 0.1, vol = 0.2, atk = 0.006, filter, q = 0.7 }) {
  const ctx = k.ctx;
  const t0 = k.t + t;
  const osc = ctx.createOscillator();
  osc.type = type;
  const a = Math.max(20, fin(f0, 440) * k.pitch);
  osc.frequency.setValueAtTime(a, t0);
  if (f1 != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, fin(f1, a) * k.pitch), t0 + dur);
  const g = ctx.createGain();
  const v = Math.max(0.0002, vol * k.volume);
  const at = Math.min(atk, dur * 0.5);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(v, t0 + at);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = osc;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filter; f.Q.value = q;
    osc.connect(f); node = f;
  }
  node.connect(g); g.connect(k.out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
  if (t0 + dur > k.end) k.end = t0 + dur;
}

/** Filtered noise burst. */
function noise(k, { type = 'bandpass', f0 = 1000, f1, t = 0, dur = 0.05, vol = 0.15, atk = 0.004, q = 0.9 }) {
  const ctx = k.ctx;
  const t0 = k.t + t;
  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type; f.Q.value = q;
  const a = Math.max(20, f0 * k.pitch);
  f.frequency.setValueAtTime(a, t0);
  if (f1 != null) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * k.pitch), t0 + dur);
  const g = ctx.createGain();
  const v = Math.max(0.0002, vol * k.volume);
  const at = Math.min(atk, dur * 0.5);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(v, t0 + at);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(k.out);
  src.start(t0, (t0 * 0.37) % 0.5);
  src.stop(t0 + dur + 0.03);
  if (t0 + dur > k.end) k.end = t0 + dur;
}

// ------------------------------------------------------------------ the sounds ---
const SOUNDS = {
  cut(k) {
    noise(k, { type: 'bandpass', f0: 2200, f1: 800, dur: 0.05, vol: 0.12, q: 1.1 });
    tone(k, { type: 'sine', f0: 640, f1: 360, dur: 0.07, vol: 0.2 });
  },
  stack(k) {
    tone(k, { type: 'triangle', f0: 780, f1: 560, dur: 0.045, vol: 0.16, atk: 0.003 });
    noise(k, { type: 'bandpass', f0: 2400, dur: 0.02, vol: 0.06, q: 3, atk: 0.002 });
  },
  drop(k) {
    tone(k, { type: 'sine', f0: 200, f1: 70, dur: 0.15, vol: 0.34 });
    noise(k, { type: 'lowpass', f0: 500, dur: 0.06, vol: 0.1 });
  },
  sell(k) {
    tone(k, { type: 'triangle', f0: 1318, dur: 0.2, vol: 0.14 });
    tone(k, { type: 'sine', f0: 2637, dur: 0.12, vol: 0.04 });
    tone(k, { type: 'triangle', f0: 1760, t: 0.09, dur: 0.28, vol: 0.14 });
    tone(k, { type: 'sine', f0: 3520, t: 0.09, dur: 0.15, vol: 0.035 });
  },
  cash(k) {
    tone(k, { type: 'triangle', f0: 1175, dur: 0.07, vol: 0.12 });
    tone(k, { type: 'sine', f0: 1760, t: 0.045, dur: 0.15, vol: 0.13 });
    tone(k, { type: 'sine', f0: 3520, t: 0.045, dur: 0.06, vol: 0.025 });
  },
  pay(k) {
    tone(k, { type: 'triangle', f0: 620, f1: 560, dur: 0.035, vol: 0.12, atk: 0.003 });
    tone(k, { type: 'sine', f0: 1240, dur: 0.025, vol: 0.04, atk: 0.003 });
  },
  unlock(k) {
    const notes = [72, 76, 79, 84];
    for (let i = 0; i < notes.length; i++) {
      tone(k, { type: 'triangle', f0: midi(notes[i]), t: i * 0.08, dur: 0.34, vol: 0.14 });
      tone(k, { type: 'sine', f0: midi(notes[i] + 12), t: i * 0.08, dur: 0.2, vol: 0.04 });
    }
    tone(k, { type: 'sine', f0: 3136, t: 0.3, dur: 0.18, vol: 0.04 });
    tone(k, { type: 'sine', f0: 3951, t: 0.36, dur: 0.22, vol: 0.03 });
  },
  bigUnlock(k) {
    const notes = [60, 64, 67, 72, 76, 79, 84];
    for (let i = 0; i < notes.length; i++) {
      tone(k, { type: 'triangle', f0: midi(notes[i]), t: i * 0.085, dur: 0.38, vol: 0.12 });
      tone(k, { type: 'sine', f0: midi(notes[i]), t: i * 0.085, dur: 0.3, vol: 0.06 });
    }
    const t = notes.length * 0.085;
    [72, 76, 79, 84].forEach((n) => tone(k, { type: 'triangle', f0: midi(n), t, dur: 0.9, vol: 0.07, atk: 0.02, filter: 3500 }));
    tone(k, { type: 'sine', f0: 95, f1: 42, dur: 0.4, vol: 0.34, atk: 0.004 });
    tone(k, { type: 'sine', f0: 3136, t: t + 0.05, dur: 0.4, vol: 0.03 });
    tone(k, { type: 'sine', f0: 4186, t: t + 0.12, dur: 0.4, vol: 0.025 });
  },
  hire(k) {
    tone(k, { type: 'sine', f0: 392, f1: 520, dur: 0.1, vol: 0.2, atk: 0.008 });
    tone(k, { type: 'triangle', f0: 784, t: 0.09, dur: 0.22, vol: 0.16 });
    tone(k, { type: 'sine', f0: 1568, t: 0.09, dur: 0.14, vol: 0.04 });
  },
  full(k) {
    tone(k, { type: 'sine', f0: 150, f1: 85, dur: 0.17, vol: 0.3, atk: 0.008 });
    tone(k, { type: 'triangle', f0: 110, f1: 70, dur: 0.14, vol: 0.12, atk: 0.008, filter: 400 });
  },
  win(k) {
    const seq = [[0, 72, 0.13], [0.15, 76, 0.13], [0.3, 79, 0.13], [0.45, 84, 0.28], [0.78, 79, 0.12], [0.92, 84, 0.4]];
    for (const [t, n, d] of seq) {
      tone(k, { type: 'triangle', f0: midi(n), t, dur: d + 0.12, vol: 0.14 });
      tone(k, { type: 'sine', f0: midi(n + 12), t, dur: d, vol: 0.04 });
      tone(k, { type: 'sawtooth', f0: midi(n), t, dur: d + 0.1, vol: 0.03, filter: 1800 });
    }
    [60, 67, 72, 76, 84].forEach((n) => tone(k, { type: 'triangle', f0: midi(n), t: 1.0, dur: 0.75, vol: 0.075, atk: 0.015, filter: 3500 }));
    tone(k, { type: 'sine', f0: 100, f1: 50, t: 1.0, dur: 0.45, vol: 0.3 });
    noise(k, { type: 'highpass', f0: 6000, t: 1.0, dur: 0.6, vol: 0.025, q: 0.5, atk: 0.05 });
    [3136, 3951, 4699, 5274].forEach((f, i) => tone(k, { type: 'sine', f0: f, t: 1.05 + i * 0.1, dur: 0.3, vol: 0.025 }));
  },
  tractor(k) {
    for (let i = 0; i < 3; i++) {
      tone(k, { type: 'sawtooth', f0: 72, f1: 52, t: i * 0.085, dur: 0.07, vol: 0.14, atk: 0.008, filter: 240, q: 1.2 });
    }
    noise(k, { type: 'lowpass', f0: 180, dur: 0.25, vol: 0.05, atk: 0.02 });
  },
  egg(k) {
    tone(k, { type: 'sine', f0: 640, f1: 940, dur: 0.085, vol: 0.2, atk: 0.008 });
    tone(k, { type: 'triangle', f0: 1280, f1: 1500, dur: 0.04, vol: 0.035, atk: 0.005 });
  },
  cluck(k) {
    tone(k, { type: 'triangle', f0: 520, f1: 860, dur: 0.055, vol: 0.14, atk: 0.008, filter: 2600 });
    tone(k, { type: 'triangle', f0: 470, f1: 740, t: 0.075, dur: 0.065, vol: 0.12, atk: 0.008, filter: 2600 });
  },
  pack(k) {
    tone(k, { type: 'triangle', f0: 420, f1: 280, dur: 0.04, vol: 0.1, atk: 0.003, filter: 1500 });
    noise(k, { type: 'lowpass', f0: 900, dur: 0.05, vol: 0.1, atk: 0.003 });
    tone(k, { type: 'sine', f0: 170, f1: 70, t: 0.1, dur: 0.14, vol: 0.28, atk: 0.004 });
    noise(k, { type: 'lowpass', f0: 600, t: 0.1, dur: 0.06, vol: 0.09, atk: 0.003 });
  },
  machine(k) {
    for (let i = 0; i < 2; i++) {
      tone(k, { type: 'triangle', f0: 95, f1: 70, t: i * 0.09, dur: 0.07, vol: 0.1, atk: 0.01, filter: 260, q: 1 });
    }
    noise(k, { type: 'lowpass', f0: 260, dur: 0.18, vol: 0.03, atk: 0.02 });
  },
  // a piece of belt or machinery dropping into place (reveals)
  build(k) {
    tone(k, { type: 'triangle', f0: 520, f1: 300, dur: 0.05, vol: 0.13, atk: 0.002, filter: 1800 });
    tone(k, { type: 'sine', f0: 150, f1: 90, dur: 0.07, vol: 0.2, atk: 0.003 });
    noise(k, { type: 'bandpass', f0: 3200, dur: 0.02, vol: 0.05, q: 2, atk: 0.002 });
  },
  // the camera sweeping off to something new
  whoosh(k) {
    noise(k, { type: 'bandpass', f0: 300, f1: 2400, dur: 0.5, vol: 0.1, q: 0.8, atk: 0.12 });
    tone(k, { type: 'sine', f0: 180, f1: 420, dur: 0.45, vol: 0.06, atk: 0.1 });
  },
  crate(k) {
    tone(k, { type: 'sine', f0: 170, f1: 80, dur: 0.11, vol: 0.3, atk: 0.004 });
    tone(k, { type: 'triangle', f0: 330, f1: 200, dur: 0.05, vol: 0.09, atk: 0.003, filter: 900 });
    noise(k, { type: 'bandpass', f0: 700, dur: 0.04, vol: 0.08, q: 1.2, atk: 0.003 });
  },
  shelf(k) {
    tone(k, { type: 'triangle', f0: 1000, f1: 760, dur: 0.045, vol: 0.13, atk: 0.003 });
    noise(k, { type: 'bandpass', f0: 2800, dur: 0.015, vol: 0.05, q: 3, atk: 0.002 });
  },
  scan(k) {
    const v = 1 + (Math.random() - 0.5) * 0.09;
    tone(k, { type: 'sine', f0: 1568 * v, dur: 0.09, vol: 0.14, atk: 0.004 });
    tone(k, { type: 'triangle', f0: 3136 * v, dur: 0.05, vol: 0.02, atk: 0.004 });
  },
  truck(k) {
    for (let i = 0; i < 4; i++) {
      tone(k, { type: 'sawtooth', f0: 62 - i * 2, f1: 44, t: i * 0.12, dur: 0.1, vol: 0.15, atk: 0.012, filter: 210, q: 1.1 });
    }
    noise(k, { type: 'lowpass', f0: 160, dur: 0.5, vol: 0.06, atk: 0.05 });
  },
  feed(k) {
    noise(k, { type: 'bandpass', f0: 3200, f1: 1600, dur: 0.22, vol: 0.14, q: 0.6, atk: 0.05 });
    noise(k, { type: 'lowpass', f0: 1200, dur: 0.16, vol: 0.07, atk: 0.04 });
  },
  travel(k) {
    noise(k, { type: 'bandpass', f0: 400, f1: 3200, dur: 0.6, vol: 0.07, q: 1, atk: 0.18 });
    [72, 76, 79, 84].forEach((n, i) => {
      tone(k, { type: 'triangle', f0: midi(n), t: 0.12 + i * 0.09, dur: 0.4, vol: 0.1 });
      tone(k, { type: 'sine', f0: midi(n + 12), t: 0.12 + i * 0.09, dur: 0.22, vol: 0.03 });
    });
  },
  perk(k) {
    [79, 83, 86, 91, 95].forEach((n, i) => {
      tone(k, { type: 'triangle', f0: midi(n), t: i * 0.06, dur: 0.26, vol: 0.1 });
      tone(k, { type: 'sine', f0: midi(n + 12), t: i * 0.06 + 0.02, dur: 0.14, vol: 0.025 });
    });
    tone(k, { type: 'sine', f0: midi(98), t: 0.32, dur: 0.3, vol: 0.03 });
  },
  step(k) {
    noise(k, { type: 'lowpass', f0: 600, dur: 0.035, vol: 0.05, atk: 0.003 });
  },
  // factory world
  press(k) {     // a stamping press coming down
    tone(k, { type: 'sine', f0: 120, f1: 38, dur: 0.22, vol: 0.4, atk: 0.003 });
    noise(k, { type: 'lowpass', f0: 420, dur: 0.09, vol: 0.14, atk: 0.002 });
    tone(k, { type: 'triangle', f0: 1900, f1: 1500, t: 0.02, dur: 0.07, vol: 0.03 });
  },
  weld(k) {      // a short welding crackle
    for (let i = 0; i < 4; i++) noise(k, { type: 'highpass', f0: 3800 + i * 500, t: i * 0.035, dur: 0.03, vol: 0.06, q: 0.7, atk: 0.002 });
    tone(k, { type: 'sawtooth', f0: 220, f1: 180, dur: 0.16, vol: 0.03, filter: 900 });
  },
  servo(k) {     // a robot arm moving
    tone(k, { type: 'triangle', f0: 320, f1: 620, dur: 0.14, vol: 0.05, atk: 0.02, filter: 1600 });
    tone(k, { type: 'triangle', f0: 620, f1: 360, t: 0.14, dur: 0.12, vol: 0.04, atk: 0.01, filter: 1600 });
  },
  car(k) {       // a finished car rolling off: two-tone horn
    tone(k, { type: 'triangle', f0: 392, dur: 0.14, vol: 0.12, atk: 0.01, filter: 2000 });
    tone(k, { type: 'triangle', f0: 494, dur: 0.14, vol: 0.1, atk: 0.01, filter: 2000 });
    tone(k, { type: 'triangle', f0: 392, t: 0.2, dur: 0.22, vol: 0.12, atk: 0.01, filter: 2000 });
    tone(k, { type: 'triangle', f0: 494, t: 0.2, dur: 0.22, vol: 0.1, atk: 0.01, filter: 2000 });
  },
};

export const SOUND_NAMES = Object.keys(SOUNDS);

/** Render one sound into any context/destination. Returns the time (ctx clock) at which it has finished. */
export function playSound(ctx, out, name, t, pitch = 1, volume = 1) {
  const fn = SOUNDS[name];
  if (!fn) return t;
  const k = { ctx, out, t, pitch: fin(pitch, 1), volume: fin(volume, 1), end: t };
  fn(k);
  return k.end;
}

// ------------------------------------------------------------------ music ---
const CHORDS = [ // I V vi IV in C, voicings around C4
  { root: 36, notes: [55, 60, 64] },
  { root: 43, notes: [55, 59, 62] },
  { root: 45, notes: [57, 60, 64] },
  { root: 41, notes: [57, 60, 65] },
];
const MELODY = [72, 74, 76, 79, 81, 84]; // C pentatonic, octave 5-6
export const MUSIC_BEAT = 0.75;
export const MUSIC_BAR = MUSIC_BEAT * 4;

// Variations. flower is the original loop; chicken is bouncy G major (G C G D); grocery is a bossa lounge (Cmaj7 Am7 Dm7 G7).
const CHICKEN_CHORDS = [
  { root: 43, notes: [55, 59, 62] },
  { root: 48, notes: [55, 60, 64] },
  { root: 43, notes: [55, 59, 62] },
  { root: 50, notes: [54, 57, 62] },
];
const CHICKEN_MELODY = [67, 69, 71, 74, 76, 79];
const GROCERY_CHORDS = [
  { root: 36, notes: [55, 59, 64, 67] },
  { root: 45, notes: [55, 60, 64, 67] },
  { root: 38, notes: [57, 60, 65, 69] },
  { root: 43, notes: [53, 59, 62, 65] },
];
const GROCERY_MELODY = [72, 74, 76, 79, 81];
const FACTORY_CHORDS = [
  { root: 45, notes: [57, 60, 64] },      // Am
  { root: 41, notes: [57, 60, 65] },      // F
  { root: 48, notes: [55, 60, 64] },      // C
  { root: 43, notes: [55, 59, 62] },      // G
];
const FACTORY_ARP = [69, 72, 76, 79, 81, 84];
const FROST_CHORDS = [
  { root: 38, notes: [57, 62, 65] },      // Dm
  { root: 46, notes: [58, 62, 65] },      // Bb
  { root: 41, notes: [57, 60, 65] },      // F
  { root: 36, notes: [55, 60, 64] },      // C
];
const FROST_BELLS = [74, 77, 81, 84, 86, 89];
export const WORLD_IDS = ['flower', 'chicken', 'grocery', 'factory', 'frost'];
export const MUSIC_BARS = { flower: MUSIC_BAR, chicken: 0.6 * 4, grocery: 0.8 * 4, factory: 0.5 * 4, frost: 0.7 * 4 };

/** Factory: a steady 120 bpm machine groove: soft kick, off-beat tick, pumping bass, a bright arpeggio. */
function factoryBar(k, t, chordIdx, rnd) {
  const B = 0.5;
  const c = FACTORY_CHORDS[chordIdx % 4];
  for (const n of c.notes) tone(k, { type: 'sine', f0: midi(n), dur: B * 4 + 0.3, vol: 0.011, atk: 0.4 });
  for (let b = 0; b < 4; b++) {
    tone(k, { type: 'sine', f0: 92, f1: 44, t: b * B, dur: 0.16, vol: 0.05, atk: 0.004 });                                  // kick
    noise(k, { type: 'highpass', f0: 7000, t: b * B + B * 0.5, dur: 0.03, vol: 0.012, q: 0.6, atk: 0.002 });                  // tick
    tone(k, { type: 'triangle', f0: midi(c.root), t: b * B + B * 0.5, dur: 0.18, vol: 0.028, atk: 0.006, filter: 600 });     // off-beat bass
  }
  let idx = (rnd() * FACTORY_ARP.length) | 0;
  for (let step = 0; step < 8; step++) {
    if (rnd() > 0.72) continue;
    idx = (idx + 1 + ((rnd() * 2) | 0)) % FACTORY_ARP.length;
    const tt = step * B * 0.5;
    tone(k, { type: 'triangle', f0: midi(FACTORY_ARP[idx]), t: tt, dur: 0.16, vol: 0.016, atk: 0.004, filter: 2600 });
    tone(k, { type: 'sine', f0: midi(FACTORY_ARP[idx] + 12), t: tt, dur: 0.08, vol: 0.004, atk: 0.004 });
  }
}

/** Frost: a slow winter march: a low drum on one and three, a soft pad, glassy bells high above. */
function frostBar(k, t, chordIdx, rnd) {
  const B = 0.7;
  const c = FROST_CHORDS[chordIdx % 4];
  for (const n of c.notes) {
    tone(k, { type: 'sine', f0: midi(n), dur: B * 4 + 0.5, vol: 0.013, atk: 0.8 });
    tone(k, { type: 'triangle', f0: midi(n - 12), dur: B * 4 + 0.3, vol: 0.006, atk: 0.9, filter: 700 });
  }
  for (const b of [0, 2]) {
    tone(k, { type: 'sine', f0: 78, f1: 46, t: b * B, dur: 0.24, vol: 0.05, atk: 0.005 });                                  // drum
    tone(k, { type: 'triangle', f0: midi(c.root), t: b * B, dur: 0.5, vol: 0.03, atk: 0.01, filter: 520 });
  }
  noise(k, { type: 'highpass', f0: 5200, t: B, dur: 0.05, vol: 0.008, q: 0.5, atk: 0.003 });
  noise(k, { type: 'highpass', f0: 5200, t: B * 3, dur: 0.05, vol: 0.008, q: 0.5, atk: 0.003 });
  let last = -1;
  for (let step = 0; step < 8; step++) {
    if (rnd() > (step % 2 === 0 ? 0.55 : 0.3)) continue;
    let idx = (rnd() * FROST_BELLS.length) | 0;
    if (idx === last) idx = (idx + 2) % FROST_BELLS.length;
    last = idx;
    const tt = step * B * 0.5;
    tone(k, { type: 'sine', f0: midi(FROST_BELLS[idx]), t: tt, dur: 0.7, vol: 0.013, atk: 0.004 });
    tone(k, { type: 'sine', f0: midi(FROST_BELLS[idx] + 12), t: tt, dur: 0.35, vol: 0.004, atk: 0.004 });
  }
}

function chickenBar(k, t, chordIdx, rnd) {
  const B = 0.6;
  const c = CHICKEN_CHORDS[chordIdx % 4];
  for (const n of c.notes) tone(k, { type: 'sine', f0: midi(n), dur: B * 4 + 0.3, vol: 0.014, atk: 0.5 });
  for (let b = 0; b < 4; b++) {
    const root = b % 2 === 0 ? c.root : c.root + 7; // oom (root) / pah (fifth), bouncy
    tone(k, { type: 'triangle', f0: midi(root), t: b * B, dur: 0.22, vol: 0.03, atk: 0.008, filter: 700 });
    if (b % 2 === 1) for (const n of c.notes) tone(k, { type: 'triangle', f0: midi(n + 12), t: b * B + 0.01, dur: 0.16, vol: 0.006, atk: 0.005, filter: 1800 });
  }
  let last = -1;
  for (let step = 0; step < 8; step++) {
    if (rnd() > (step % 2 === 0 ? 0.62 : 0.4)) continue;
    let idx = (rnd() * CHICKEN_MELODY.length) | 0;
    if (idx === last) idx = (idx + 2) % CHICKEN_MELODY.length;
    last = idx;
    const tt = step * B * 0.5;
    tone(k, { type: 'triangle', f0: midi(CHICKEN_MELODY[idx]), t: tt, dur: 0.2, vol: 0.02, atk: 0.004, filter: 2400 });
    tone(k, { type: 'sine', f0: midi(CHICKEN_MELODY[idx] + 12), t: tt, dur: 0.1, vol: 0.004, atk: 0.004 });
  }
}

function groceryBar(k, t, chordIdx, rnd) {
  const B = 0.8;
  const c = GROCERY_CHORDS[chordIdx % 4];
  for (const n of c.notes) {
    tone(k, { type: 'sine', f0: midi(n), dur: B * 4 + 0.6, vol: 0.012, atk: 1.0 });
    tone(k, { type: 'triangle', f0: midi(n + 12) * 1.002, dur: B * 4 + 0.4, vol: 0.004, atk: 1.1, filter: 1000 });
  }
  tone(k, { type: 'sine', f0: midi(c.root), dur: B * 1.5, vol: 0.03, atk: 0.02 });
  tone(k, { type: 'sine', f0: midi(c.root + 7), t: B * 2, dur: B * 1.2, vol: 0.026, atk: 0.02 });
  const S = B / 4; // sixteenth; bossa stab pattern
  for (const st of [3, 6, 10, 13]) {
    for (const n of c.notes) tone(k, { type: 'triangle', f0: midi(n + 12), t: st * S, dur: 0.28, vol: 0.006, atk: 0.006, filter: 1600 });
  }
  let last = -1;
  for (const st of [0, 4, 8, 12]) {
    if (rnd() > 0.4) continue;
    let idx = (rnd() * GROCERY_MELODY.length) | 0;
    if (idx === last) idx = (idx + 2) % GROCERY_MELODY.length;
    last = idx;
    tone(k, { type: 'sine', f0: midi(GROCERY_MELODY[idx]), t: (st + 2) * S, dur: 0.5, vol: 0.017, atk: 0.01 });
  }
}

/** Schedule one bar of the generative loop starting at time t. `rnd` returns [0,1). `world` picks the variation. */
export function scheduleMusicBar(ctx, out, t, chordIdx, rnd = Math.random, world = 'flower') {
  const k = { ctx, out, t, pitch: 1, volume: 1, end: t };
  if (world === 'chicken') { chickenBar(k, t, chordIdx, rnd); return k.end; }
  if (world === 'grocery') { groceryBar(k, t, chordIdx, rnd); return k.end; }
  if (world === 'factory') { factoryBar(k, t, chordIdx, rnd); return k.end; }
  if (world === 'frost') { frostBar(k, t, chordIdx, rnd); return k.end; }
  const c = CHORDS[chordIdx % CHORDS.length];
  for (const n of c.notes) {
    tone(k, { type: 'sine', f0: midi(n), dur: MUSIC_BAR + 0.7, vol: 0.022, atk: 0.9 });
    tone(k, { type: 'triangle', f0: midi(n + 12) * 1.002, dur: MUSIC_BAR + 0.5, vol: 0.006, atk: 1.1, filter: 1200 });
  }
  tone(k, { type: 'sine', f0: midi(c.root), dur: MUSIC_BAR + 0.4, vol: 0.03, atk: 0.4 });
  let last = -1;
  for (let step = 0; step < 8; step++) {
    if (rnd() > (step % 2 === 0 ? 0.5 : 0.28)) continue;
    let idx = (rnd() * MELODY.length) | 0;
    if (idx === last) idx = (idx + 2) % MELODY.length;
    last = idx;
    tone(k, { type: 'sine', f0: midi(MELODY[idx]), t: step * MUSIC_BEAT * 0.5, dur: 0.9, vol: 0.02, atk: 0.008 });
    tone(k, { type: 'triangle', f0: midi(MELODY[idx]), t: step * MUSIC_BEAT * 0.5, dur: 0.25, vol: 0.006, atk: 0.006 });
  }
  return k.end;
}

// ------------------------------------------------------------------ the audio object ---
export function createAudio(G) {
  const Ctor = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
  let ctx = null, master = null, fxBus = null, musicBus = null;
  let failed = !Ctor;

  let muted = false;
  try { muted = typeof localStorage !== 'undefined' && localStorage.getItem(GAME.muteKey) === '1'; } catch (e) { /* ignore */ }

  const ends = new Float64Array(MAX_VOICES + 4); // end times of active plays
  const lastPlay = Object.create(null);
  const lastCombo = Object.create(null);
  const steps = Object.create(null);

  function build() {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_LEVEL;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    fxBus = ctx.createGain();
    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_LEVEL;
    fxBus.connect(master); musicBus.connect(master);
    master.connect(comp); comp.connect(ctx.destination);
  }

  function ensure() {
    if (failed) return false;
    try {
      if (!ctx) build();
      if (ctx.state !== 'running' && ctx.state !== 'closed' && !document.hidden) {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
      startMusic();
      return true;
    } catch (e) {
      failed = true; ctx = null;
      return false;
    }
  }

  // ---- music scheduler
  let musicTimer = 0, nextBar = 0, barIdx = 0, world = 'flower';
  function musicTick() {
    if (!ctx || ctx.state !== 'running' || muted || document.hidden || (G.timeScale || 1) > 3) return;
    const now = ctx.currentTime;
    if (nextBar < now + 0.05) nextBar = now + 0.1;
    while (nextBar < now + 0.5) {
      try { scheduleMusicBar(ctx, musicBus, nextBar, barIdx, Math.random, world); } catch (e) { /* ignore */ }
      barIdx++;
      nextBar += MUSIC_BARS[world] || MUSIC_BAR;
    }
  }
  function startMusic() {
    if (musicTimer || !ctx) return;
    musicTimer = setInterval(musicTick, 150);
  }

  // ---- gestures / visibility
  const onGesture = () => ensure();
  if (typeof window !== 'undefined') {
    for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'keydown', 'click']) window.addEventListener(ev, onGesture, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      try {
        if (document.hidden) { const p = ctx.suspend(); if (p && p.catch) p.catch(() => {}); }
        else { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
      } catch (e) { /* ignore */ }
    });
  }

  function play(name, { pitch = 1, volume = 1, pos } = {}) {
    if (muted || failed || !ctx || ctx.state !== 'running') return;
    if ((G.timeScale || 1) > 3) return;
    const fn = SOUNDS[name];
    if (!fn) return;
    const now = ctx.currentTime;
    const gap = MIN_GAP[name] || 0.03;
    if (now - (lastPlay[name] ?? -1) < gap) return;

    let vol = volume;
    if (pos) {
      const pp = G.player && G.player.pos;
      if (pp) {
        const d = Math.hypot(fin(pos.x, 0) - pp.x, fin(pos.z, 0) - pp.z);
        vol *= Math.max(0, 1 - d / AUDIBLE_RANGE);
        if (vol < 0.02) return;
      }
    }

    // voice cap
    let active = 0, free = -1;
    for (let i = 0; i < ends.length; i++) {
      if (ends[i] > now) active++; else if (free < 0) free = i;
    }
    if (active >= (IMPORTANT.has(name) ? MAX_VOICES + 4 : MAX_VOICES) || free < 0) return;

    let p = pitch;
    if (COMBO_NAMES.has(name)) {
      let s = steps[name] || 0;
      s = now - (lastCombo[name] ?? -10) > COMBO_RESET ? 0 : s + 1;
      steps[name] = s;
      lastCombo[name] = now;
      const d = Math.min(s, COMBO_MAX_DEGREE);
      p *= Math.pow(2, (12 * Math.floor(d / 5) + PENTA[d % 5]) / 12);
    }
    lastPlay[name] = now;
    try {
      ends[free] = playSound(ctx, fxBus, name, now + 0.005, p, vol) + 0.05;
    } catch (e) { /* never throw */ }
  }

  let lastHaptic = -1;
  function haptic(ms = 10) {
    try {
      const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (t - lastHaptic < 60) return;
      lastHaptic = t;
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* ignore */ }
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(GAME.muteKey, muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (ctx && master) {
      try { master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, ctx.currentTime, 0.03); } catch (e) { /* ignore */ }
    }
  }

  const audio = {
    play, haptic, setMuted,
    /** Select the music variation: 'flower' (default), 'chicken' or 'grocery'. Safe before/after the context exists. */
    setWorld(id) { if (WORLD_IDS.includes(id)) world = id; },
    get world() { return world; },
    get muted() { return muted; },
    /** Debug/testing. */
    get context() { return ctx; },
    ensure,
    activeVoices() {
      if (!ctx) return 0;
      let n = 0;
      for (let i = 0; i < ends.length; i++) if (ends[i] > ctx.currentTime) n++;
      return n;
    },
  };
  return audio;
}
