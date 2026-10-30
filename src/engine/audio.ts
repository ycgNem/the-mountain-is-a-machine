// All game audio (PLAN.md §10). Everything is procedural: there are no audio files.
//
// - Sound effects come from a small sfxr-style synth: sine, triangle, square, saw and noise voices with
//   pitch slides, envelopes and sweeping filters, layered into short recipes. Each effect is rendered
//   once (in a few seeded variants) into an AudioBuffer, so playing one is a buffer source and a gain.
//   jsfxr was the plan, but it renders one naive (aliasing, harsh) oscillator per sound and can't
//   layer voices (bells, arpeggios, crumbles); this is the same idea with band-limited waves and layers.
// - The hum of Old Thrum is a live Web Audio graph: detuned drones, partials, filtered noise and one
//   texture per layer, crossfaded by setLayer() and resolved into a warm chord by ending().
// - The machine bed is one soft loop per machine family near the camera, saturating so a big factory
//   never gets loud.
//
// Everything tonal is in A, the note Old Thrum hums, so effects, machines and the hum never clash.
// Levels: effect peaks sit at -12 dBFS or below, the ambience far lower, and a compressor on the master
// bus catches pile-ups. Without Web Audio (tests, Node) every call is a no-op; nothing here throws.

export type SfxName =
  | 'place'
  | 'remove'
  | 'rotate'
  | 'sale'
  | 'coin_big'
  | 'contract'
  | 'milestone'
  | 'dig'
  | 'reveal'
  | 'survey'
  | 'elevator'
  | 'drill_tick'
  | 'breakthrough'
  | 'assay'
  | 'error'
  | 'click'
  | 'hover'
  | 'spore'
  | 'crackle'
  | 'chime'
  | 'hiss'
  | 'pulse'
  | 'shatter'
  | 'toast';

/** Every sound effect, in a stable order (debug panels, tests). */
export const SFX_NAMES: readonly SfxName[] = [
  'place',
  'remove',
  'rotate',
  'sale',
  'coin_big',
  'contract',
  'milestone',
  'dig',
  'reveal',
  'survey',
  'elevator',
  'drill_tick',
  'breakthrough',
  'assay',
  'error',
  'click',
  'hover',
  'spore',
  'crackle',
  'chime',
  'hiss',
  'pulse',
  'shatter',
  'toast',
];

interface Families {
  heat: number;
  crystal: number;
  fabrication: number;
  extraction: number;
}

// ---------------------------------------------------------------------------------------------- tuning

/** Same effect again within this many seconds is dropped (at most ~8 per second). */
const DEFAULT_GAP = 1 / 8;
/** Simultaneous effects; past this, a new effect steals an older, less important one or is dropped. */
const MAX_VOICES = 24;
/** Ambient one-shots (drips, bubbles, pings) are rolled this often, seconds. */
const TICK_S = 0.25;
/** Time constants (seconds) for parameter glides: layer crossfade settles in ~4 s. */
const LAYER_TAU = 1.4;
const FADE_IN_TAU = 1.2;
const END_TAU = 0.4;
const MACHINE_TAU = 0.5;
/** A fresh or resumed context reports 'suspended' for a moment before it runs: effects may queue. */
const START_GRACE_MS = 600;

/**
 * Mix levels, measured at full volume: the hum runs about -43 dBA (Surface) to -38 dBA (Alien Strata)
 * and -32 dBA at the ending; a saturated machine bed about -40 dBA. Cave reverb sits 17-28 dB under the
 * dry sound underground (convolver output is normalized very low, hence a return above 1), and the
 * Surface is nearly dry.
 */
const HUM_LEVEL = 0.12;
const MACHINE_LEVEL = 0.32;
const REVERB_LEVEL = 2.2;

/** Master bus compressor: mostly idle; it squeezes pile-ups of effects. */
const COMP = { threshold: -14, knee: 8, ratio: 4, attack: 0.004, release: 0.22 };

// ---------------------------------------------------------------------------------------------- pitch

const semis = (n: number): number => Math.pow(2, n / 12);
/** Equal-tempered pitch, n semitones from A4. */
const note = (n: number): number => 440 * semis(n);
const A1 = note(-36);
const E2 = note(-29);
const A2 = note(-24);
const E3 = note(-17);
const A3 = note(-12);
const C4 = note(-9);
const Cs4 = note(-8);
const D4 = note(-7);
const E4 = note(-5);
const A4 = 440;
const Cs5 = note(4);
const E5 = note(7);
const A5 = note(12);
const Cs6 = note(16);
const E6 = note(19);
const Fs6 = note(21);
const A6 = note(24);
const B6 = note(26);
const Cs7 = note(28);
const E7 = note(31);
/** A major pentatonic as playback-rate ratios, for pitched one-shots. */
const PENTA: readonly number[] = [0, 2, 4, 7, 9, 12].map(semis);

// ----------------------------------------------------------------------------------------- the synth

type Wave = 'sine' | 'tri' | 'square' | 'saw' | 'noise';

/** One voice of a sound: an oscillator with a pitch glide, an envelope and an optional filter. */
interface Tone {
  wave: Wave;
  /** Start, seconds. */
  at?: number;
  /** Pitch at the start and at the end of the glide, Hz (noise ignores it). */
  f?: number;
  f2?: number;
  /** Glide time, seconds (default: the whole tone). */
  glide?: number;
  /** Attack, hold and decay (exponential, to -60 dB), seconds. */
  a?: number;
  h?: number;
  d: number;
  g?: number;
  /** Square duty, 0..1. */
  duty?: number;
  /** Vibrato: rate Hz, depth as a pitch ratio. */
  vib?: readonly [number, number];
  /** Filter; `f2` sweeps the cutoff exponentially over the tone. */
  filt?: { type: 'lp' | 'hp' | 'bp'; f: number; f2?: number; q?: number };
}

interface Rand {
  next(): number;
  range(lo: number, hi: number): number;
  pick<T>(xs: readonly T[]): T;
}

/** Seeded PRNG (mulberry32): a sound's variants are the same every session. */
function rand(seed: number): Rand {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range(lo, hi) {
      return lo + (hi - lo) * next();
    },
    pick(xs) {
      return xs[Math.min(xs.length - 1, Math.floor(next() * xs.length))];
    },
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Topology-preserving state-variable filter (Zavalishin): stays stable while its cutoff sweeps. */
class Svf {
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  private k = 1.414;

  set(cutoff: number, q: number, fs: number): void {
    const g = Math.tan((Math.PI * Math.min(Math.max(cutoff, 10), fs * 0.45)) / fs);
    this.k = 1 / Math.max(0.1, q);
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }

  /** mode 0 low-pass, 1 band-pass (unity peak), 2 high-pass. */
  run(x: number, mode: number): number {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return mode === 0 ? v2 : mode === 1 ? this.k * v1 : x - this.k * v1 - v2;
  }
}

/** PolyBLEP: rounds the steps of a saw or square so they don't alias into fizz. */
function blep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

const WAVE_CODE: Record<Wave, number> = { sine: 0, tri: 1, saw: 2, square: 3, noise: 4 };

function renderTone(t: Tone, out: Float32Array, fs: number, noise: () => number, wrap: boolean): void {
  const n = out.length;
  const start = Math.round((t.at ?? 0) * fs);
  const aN = Math.max(1, Math.round((t.a ?? 0.002) * fs));
  const hN = Math.max(0, Math.round((t.h ?? 0) * fs));
  const dN = Math.max(1, Math.round(t.d * fs));
  const len = aN + hN + dN;
  const fadeN = Math.min(dN, Math.max(1, Math.round(0.003 * fs)));
  const decay = Math.pow(0.001, 1 / dN);
  const gain = t.g ?? 1;
  const wave = WAVE_CODE[t.wave];
  const f0 = t.f ?? 440;
  const glideN = Math.max(1, Math.round((t.glide ?? len / fs) * fs));
  const fMul = Math.exp(Math.log((t.f2 ?? f0) / f0) / glideN);
  const duty = Math.min(0.95, Math.max(0.05, t.duty ?? 0.5));
  const vibW = t.vib ? (2 * Math.PI * t.vib[0]) / fs : 0;
  const vibD = t.vib ? t.vib[1] : 0;
  const ft = t.filt;
  const svf = ft ? new Svf() : null;
  const mode = !ft || ft.type === 'lp' ? 0 : ft.type === 'bp' ? 1 : 2;
  const c0 = ft ? ft.f : 1000;
  const cLn = ft ? Math.log((ft.f2 ?? c0) / c0) : 0;
  const q = ft?.q ?? 0.707;
  if (svf) svf.set(c0, q, fs);
  let f = f0;
  let phase = 0;
  let env = 1;
  for (let i = 0; i < len; i++) {
    let idx = start + i;
    if (idx >= n) {
      if (!wrap) break;
      idx %= n;
    }
    let e: number;
    if (i < aN) e = i / aN;
    else if (i < aN + hN) e = 1;
    else {
      env *= decay;
      e = env;
      if (len - i < fadeN) e *= (len - i) / fadeN;
    }
    let s: number;
    if (wave === 4) s = noise() * 2 - 1;
    else {
      if (i < glideN) f *= fMul;
      const fi = vibD !== 0 ? f * (1 + vibD * Math.sin(vibW * i)) : f;
      const dt = Math.min(0.45, fi / fs);
      if (wave === 0) s = Math.sin(2 * Math.PI * phase);
      else if (wave === 1) s = phase < 0.25 ? 4 * phase : phase < 0.75 ? 2 - 4 * phase : 4 * phase - 4;
      else if (wave === 2) s = 2 * phase - 1 - blep(phase, dt);
      else s = (phase < duty ? 1 : -1) + blep(phase, dt) - blep((phase + 1 - duty) % 1, dt);
      phase += dt;
      if (phase >= 1) phase -= 1;
    }
    if (svf) {
      if (cLn !== 0 && (i & 15) === 0) svf.set(c0 * Math.exp((cLn * i) / len), q, fs);
      s = svf.run(s, mode);
    }
    out[idx] += s * e * gain;
  }
}

/** Mixes the tones; with `loopSeconds` the buffer is that long and tails wrap around (seamless). */
function renderTones(tones: readonly Tone[], fs: number, noise: () => number, loopSeconds: number): Float32Array {
  let end = 0;
  for (const t of tones) end = Math.max(end, (t.at ?? 0) + (t.a ?? 0.002) + (t.h ?? 0) + t.d);
  const wrap = loopSeconds > 0;
  const out = new Float32Array(Math.max(1, Math.ceil((wrap ? loopSeconds : end + 0.006) * fs)));
  for (const t of tones) renderTone(t, out, fs, noise, wrap);
  return out;
}

/** Removes DC, fades the very end and normalizes to the sound's peak level. */
function finish(x: Float32Array, fs: number, peak: number, loop: boolean): Float32Array {
  const n = x.length;
  if (loop) {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += x[i];
    mean /= n;
    for (let i = 0; i < n; i++) x[i] -= mean;
  } else {
    const r = 1 - (2 * Math.PI * 20) / fs;
    let px = 0;
    let py = 0;
    for (let i = 0; i < n; i++) {
      const y = x[i] - px + r * py;
      px = x[i];
      py = y;
      x[i] = y;
    }
    const fade = Math.min(n, Math.round(0.002 * fs));
    for (let i = 0; i < fade; i++) x[n - 1 - i] *= i / fade;
  }
  let m = 0;
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > 0) {
    const k = peak / m;
    for (let i = 0; i < n; i++) x[i] *= k;
  }
  return x;
}

// --------------------------------------------------------------------------------------- the effects

interface SfxDef {
  make: (r: Rand, variant: number) => Tone[];
  /** Peak of the rendered sound (0.25 = -12 dBFS). Effects are balanced against each other here. */
  peak: number;
  variants?: number;
  /** Random playback-rate spread per play (0.03 = ±3%). */
  jitter?: number;
  /** Minimum seconds between two plays (default 1/8). */
  gap?: number;
  /** Reverb send, 0..1. */
  send?: number;
  /** Pitches to pick from per play, as playback-rate ratios. */
  notes?: readonly number[];
  /** 1 frequent and UI, 2 events, 3 big moments: a full mixer steals from lower priorities. */
  prio?: number;
  /** Render as a seamless loop this many seconds long. */
  loop?: number;
}

const SFX: Record<SfxName, SfxDef> = {
  // A chunky two-part click: the latch, then the machine settling onto the floor.
  place: {
    peak: 0.2,
    variants: 3,
    jitter: 0.04,
    send: 0.12,
    make: (r) => [
      { wave: 'noise', a: 0.0004, d: 0.016, g: 0.6, filt: { type: 'bp', f: r.range(1900, 2400), q: 1.3 } },
      { wave: 'sine', at: 0.016, f: r.range(190, 210), f2: 95, glide: 0.06, a: 0.001, d: 0.11, g: 0.5 },
      { wave: 'tri', at: 0.016, f: r.range(380, 420), f2: 240, glide: 0.05, a: 0.001, d: 0.07, g: 0.5 },
      { wave: 'noise', at: 0.016, a: 0.001, d: 0.06, g: 0.75, filt: { type: 'bp', f: 700, q: 0.9 } },
      { wave: 'square', at: 0.016, f: r.range(500, 560), duty: 0.3, a: 0.0005, d: 0.05, g: 0.14, filt: { type: 'lp', f: 2200 } },
    ],
  },
  // An unlatch and a falling, airy "fwoop".
  remove: {
    peak: 0.16,
    variants: 2,
    jitter: 0.04,
    send: 0.12,
    make: (r) => [
      { wave: 'noise', a: 0.0004, d: 0.012, g: 0.4, filt: { type: 'bp', f: r.range(1600, 2000), q: 1.2 } },
      { wave: 'sine', at: 0.006, f: r.range(560, 620), f2: 190, glide: 0.11, a: 0.002, d: 0.16, g: 0.8 },
      { wave: 'tri', at: 0.006, f: 280, f2: 120, glide: 0.1, a: 0.002, d: 0.1, g: 0.3 },
      { wave: 'noise', at: 0.006, a: 0.01, d: 0.16, g: 0.45, filt: { type: 'lp', f: 3200, f2: 500 } },
    ],
  },
  // A small ratchet: three teeth and a rising blip.
  rotate: {
    peak: 0.11,
    variants: 3,
    jitter: 0.03,
    send: 0.08,
    make: (r) => [
      ...[0, 0.028, 0.056].map(
        (at, i): Tone => ({ wave: 'noise', at, a: 0.0003, d: 0.01, g: 0.7 - i * 0.12, filt: { type: 'bp', f: r.range(3000, 3600), q: 2 } }),
      ),
      { wave: 'sine', f: 900, f2: 1250, glide: 0.06, a: 0.002, d: 0.07, g: 0.3 },
    ],
  },
  // A tiny, soft coin tick. It fires constantly, so it stays small and short.
  sale: {
    peak: 0.085,
    variants: 3,
    jitter: 0.02,
    send: 0.05,
    make: (_r, v) => {
      const f = [A6, B6, Cs7][v % 3];
      return [
        { wave: 'sine', f, a: 0.0008, d: 0.09 },
        { wave: 'sine', f: f * 2.76, a: 0.0005, d: 0.03, g: 0.22 },
        { wave: 'noise', a: 0.0003, d: 0.004, g: 0.15, filt: { type: 'hp', f: 5000 } },
      ];
    },
  },
  // Ka-ching: a drawer thump, two coins up a fourth, a little jingle and sparkle.
  coin_big: {
    peak: 0.22,
    prio: 2,
    gap: 0.25,
    send: 0.2,
    make: (r) => {
      const t: Tone[] = [
        { wave: 'sine', f: 160, f2: 80, glide: 0.06, a: 0.001, d: 0.1, g: 0.45 },
        { wave: 'sine', f: B6, a: 0.001, d: 0.12, g: 0.6 },
        { wave: 'sine', f: B6 * 2.76, a: 0.0005, d: 0.04, g: 0.14 },
        { wave: 'sine', at: 0.075, f: E7, a: 0.001, d: 0.55, g: 0.8 },
        { wave: 'sine', at: 0.075, f: E7 * 2, a: 0.001, d: 0.25, g: 0.16 },
        { wave: 'saw', at: 0.075, f: E6, a: 0.001, d: 0.2, g: 0.1, filt: { type: 'lp', f: 2600 } },
        { wave: 'noise', at: 0.075, a: 0.01, d: 0.35, g: 0.1, filt: { type: 'bp', f: 7000, q: 1.5 } },
      ];
      for (let i = 0; i < 4; i++) {
        t.push({ wave: 'sine', at: 0.13 + i * 0.05 + r.range(0, 0.02), f: r.pick([A6, Cs7, E7]), a: 0.0008, d: 0.09, g: 0.22 });
      }
      return t;
    },
  },
  // A rubber stamp, then a warm major chord: deal done.
  contract: {
    peak: 0.24,
    prio: 3,
    gap: 0.4,
    send: 0.25,
    make: () => [
      { wave: 'sine', f: 130, f2: 55, glide: 0.08, a: 0.001, d: 0.18 },
      { wave: 'noise', a: 0.001, d: 0.06, g: 0.6, filt: { type: 'lp', f: 1200 } },
      ...[A4, Cs5, E5, A5].flatMap((f, i): Tone[] => [
        { wave: 'tri', at: 0.09 + i * 0.022, f, a: 0.006, d: 1.1, g: 0.32 },
        { wave: 'sine', at: 0.09 + i * 0.022, f: f * 2, a: 0.004, d: 0.6, g: 0.1 },
      ]),
    ],
  },
  // Three bright rising notes, the last one ringing.
  milestone: {
    peak: 0.25,
    prio: 3,
    gap: 0.3,
    send: 0.25,
    make: () => [
      ...[A5, Cs6, E6].flatMap((f, i): Tone[] => [
        { wave: 'square', at: i * 0.08, f, duty: 0.25, a: 0.002, h: 0.03, d: i === 2 ? 0.7 : 0.28, g: 0.22, filt: { type: 'lp', f: 4500 } },
        { wave: 'tri', at: i * 0.08, f, a: 0.002, h: 0.03, d: i === 2 ? 0.8 : 0.3, g: 0.5 },
      ]),
      { wave: 'sine', at: 0.16, f: E7, a: 0.002, d: 0.45, g: 0.1, vib: [7, 0.004] },
    ],
  },
  // Rock crumbling: a thunk and a scatter of grit.
  dig: {
    peak: 0.18,
    variants: 4,
    jitter: 0.05,
    send: 0.2,
    make: (r) => {
      const t: Tone[] = [
        { wave: 'sine', f: r.range(150, 170), f2: 80, glide: 0.08, a: 0.001, d: 0.12, g: 0.45 },
        { wave: 'noise', a: 0.001, d: 0.09, g: 0.6, filt: { type: 'bp', f: 500, q: 0.8 } },
      ];
      for (let i = 0; i < 14; i++) {
        const at = 0.015 + 0.32 * Math.pow(r.next(), 1.6);
        t.push({
          wave: 'noise',
          at,
          a: 0.0008,
          d: r.range(0.015, 0.06),
          g: r.range(0.4, 1) * (1 - at * 1.5),
          filt: { type: 'bp', f: r.range(500, 2400), q: r.range(1.2, 3) },
        });
      }
      for (let i = 0; i < 3; i++) t.push({ wave: 'sine', at: 0.05 + r.next() * 0.3, f: r.range(2200, 3800), a: 0.0005, d: 0.02, g: 0.1 });
      return t;
    },
  },
  // Darkness lifting: an airy swell and an open fifth.
  reveal: {
    peak: 0.16,
    prio: 2,
    gap: 0.25,
    send: 0.4,
    make: () => [
      { wave: 'noise', a: 0.28, d: 0.75, g: 0.6, filt: { type: 'bp', f: 350, f2: 2200, q: 1.1 } },
      { wave: 'sine', at: 0.08, f: A4, a: 0.25, d: 0.9, g: 0.35 },
      { wave: 'sine', at: 0.16, f: E5, a: 0.25, d: 0.9, g: 0.28 },
      { wave: 'sine', at: 0.24, f: E6, a: 0.2, d: 0.7, g: 0.08, vib: [5, 0.003] },
    ],
  },
  // A sonar ping and its echoes off the rock.
  survey: {
    peak: 0.19,
    prio: 2,
    gap: 0.3,
    send: 0.45,
    make: () => [
      { wave: 'sine', f: E6, f2: E6 * 0.97, a: 0.002, d: 0.9 },
      { wave: 'sine', f: E7, a: 0.002, d: 0.22, g: 0.1 },
      { wave: 'sine', at: 0.3, f: E6, f2: E6 * 0.97, a: 0.004, d: 0.7, g: 0.3, filt: { type: 'lp', f: 2000 } },
      { wave: 'sine', at: 0.6, f: E6, f2: E6 * 0.97, a: 0.006, d: 0.6, g: 0.1, filt: { type: 'lp', f: 1600 } },
    ],
  },
  // The freight elevator's arrival bell.
  elevator: {
    peak: 0.22,
    prio: 2,
    gap: 0.5,
    send: 0.35,
    make: () => [
      { wave: 'noise', a: 0.0004, d: 0.008, g: 0.25, filt: { type: 'bp', f: 3800, q: 1.5 } },
      { wave: 'sine', f: A5, a: 0.0015, d: 1.9 },
      { wave: 'sine', f: A5 * 1.0028, a: 0.0015, d: 1.6, g: 0.3 },
      { wave: 'sine', f: A5 * 2, a: 0.001, d: 0.9, g: 0.3 },
      { wave: 'sine', f: A5 * 2.76, a: 0.001, d: 0.5, g: 0.18 },
      { wave: 'sine', f: A5 * 4.07, a: 0.001, d: 0.25, g: 0.08 },
    ],
  },
  // One tooth of the drill's progress gear.
  drill_tick: {
    peak: 0.11,
    variants: 3,
    jitter: 0.03,
    send: 0.15,
    make: (r) => [
      { wave: 'noise', a: 0.0004, d: 0.01, g: 0.5, filt: { type: 'bp', f: r.range(1200, 1600), q: 1.5 } },
      { wave: 'sine', f: r.range(220, 240), f2: 120, glide: 0.04, a: 0.001, d: 0.07, g: 0.8 },
      { wave: 'square', f: 660, duty: 0.4, a: 0.0005, d: 0.03, g: 0.12, filt: { type: 'lp', f: 1800 } },
    ],
  },
  // Boring into the next layer: a deep rumble that swells, a tone climbing two octaves from the hum's
  // A, the boom of the rock giving way, and the open air of a major chord.
  breakthrough: {
    peak: 0.25,
    prio: 3,
    gap: 3,
    send: 0.3,
    make: (r) => {
      const t: Tone[] = [
        { wave: 'noise', a: 0.5, h: 1.6, d: 1.6, g: 0.9, filt: { type: 'lp', f: 70, f2: 260, q: 0.9 } },
        { wave: 'noise', a: 0.8, h: 1.0, d: 1.4, g: 0.35, filt: { type: 'bp', f: 160, f2: 500, q: 0.8 } },
        { wave: 'saw', at: 0.2, f: A1, f2: A3, glide: 2.6, a: 1.0, h: 1.5, d: 1.2, g: 0.4, filt: { type: 'lp', f: 220, f2: 1500, q: 1.2 } },
        { wave: 'sine', at: 0.2, f: A2, f2: A4, glide: 2.6, a: 1.0, h: 1.5, d: 1.2, g: 0.3 },
        { wave: 'sine', at: 2.6, f: 90, f2: 38, glide: 0.5, a: 0.004, d: 1.1, g: 0.9 },
        { wave: 'noise', at: 2.6, a: 0.002, d: 0.5, g: 0.5, filt: { type: 'lp', f: 900, f2: 200 } },
        ...[A3, E4, A4, Cs5].map((f, i): Tone => ({ wave: 'tri', at: 2.62 + i * 0.03, f, a: 0.08, d: 1.8, g: 0.2 })),
      ];
      for (let i = 0; i < 34; i++) {
        const at = 0.2 + 2.5 * Math.pow(r.next(), 0.7);
        t.push({
          wave: 'noise',
          at,
          a: 0.001,
          d: r.range(0.02, 0.09),
          g: r.range(0.15, 0.45) * (0.4 + at / 3),
          filt: { type: 'bp', f: r.range(300, 1600), q: r.range(1, 2.5) },
        });
      }
      return t;
    },
  },
  // The assay lab's readout: a glassy bloop, quick blips, then a ding.
  assay: {
    peak: 0.18,
    prio: 2,
    variants: 2,
    gap: 0.3,
    send: 0.2,
    make: (r) => {
      const seq = [E6, Fs6, A6, B6];
      for (let i = seq.length - 1; i > 0; i--) {
        const j = Math.floor(r.next() * (i + 1));
        [seq[i], seq[j]] = [seq[j], seq[i]];
      }
      const t: Tone[] = [{ wave: 'sine', f: 400, f2: 900, glide: 0.08, a: 0.004, d: 0.1, g: 0.2 }];
      seq.forEach((f, i) => {
        t.push({ wave: 'sine', at: i * 0.065, f, a: 0.002, h: 0.025, d: 0.07, g: 0.5 });
        t.push({ wave: 'square', at: i * 0.065, f, a: 0.002, h: 0.02, d: 0.05, g: 0.05, filt: { type: 'lp', f: 3000 } });
      });
      t.push({ wave: 'sine', at: 0.29, f: A6, a: 0.002, d: 0.7, g: 0.6 });
      t.push({ wave: 'sine', at: 0.29, f: A6 * 2.76, a: 0.001, d: 0.2, g: 0.08 });
      return t;
    },
  },
  // "Nope": a muted, falling minor third.
  error: {
    peak: 0.16,
    prio: 2,
    gap: 0.2,
    make: () =>
      [C4, A3].flatMap((f, i): Tone[] => [
        { wave: 'square', at: i * 0.12, f, a: 0.003, h: 0.05 + i * 0.02, d: 0.09 + i * 0.03, g: 0.45, filt: { type: 'lp', f: 1100, q: 0.8 } },
        { wave: 'tri', at: i * 0.12, f, a: 0.003, h: 0.05 + i * 0.02, d: 0.09 + i * 0.03, g: 0.6 },
      ]),
  },
  click: {
    peak: 0.07,
    variants: 2,
    jitter: 0.02,
    make: (r) => [
      { wave: 'noise', a: 0.0003, d: 0.006, g: 0.6, filt: { type: 'bp', f: r.range(2400, 2800), q: 1.2 } },
      { wave: 'sine', f: 1500, f2: 1300, a: 0.0008, d: 0.03, g: 0.5 },
    ],
  },
  hover: {
    peak: 0.03,
    jitter: 0.03,
    make: () => [{ wave: 'sine', f: 2200, a: 0.002, d: 0.035 }],
  },
  // A spore pod popping and puffing, with a glint of drifting spores.
  spore: {
    peak: 0.11,
    variants: 3,
    jitter: 0.05,
    send: 0.25,
    make: (r) => [
      { wave: 'sine', f: r.range(380, 460), f2: 170, glide: 0.05, a: 0.001, d: 0.07, g: 0.45 },
      { wave: 'noise', at: 0.008, a: 0.02, h: 0.03, d: 0.38, g: 0.8, filt: { type: 'bp', f: 1300, f2: 450, q: 0.9 } },
      { wave: 'noise', at: 0.01, a: 0.01, d: 0.1, g: 0.14, filt: { type: 'bp', f: 3200, q: 0.9 } },
      { wave: 'sine', at: r.range(0.05, 0.15), f: r.range(2500, 3500), a: 0.003, d: 0.15, g: 0.06, vib: [9, 0.01] },
    ],
  },
  // Interference: clustered static, a short buzz, a falling zap.
  crackle: {
    peak: 0.12,
    variants: 4,
    send: 0.2,
    make: (r) => {
      const t: Tone[] = [{ wave: 'sine', f: 2400, f2: 900, glide: 0.06, a: 0.001, d: 0.07, g: 0.15 }];
      let at = 0;
      for (let i = 0; i < 14; i++) {
        at += r.next() < 0.3 ? r.range(0.03, 0.07) : r.range(0.003, 0.015);
        t.push({ wave: 'noise', at, a: 0.0002, d: r.range(0.002, 0.012), g: r.range(0.3, 1), filt: { type: 'bp', f: r.range(1200, 4000), q: r.range(1, 2) } });
      }
      for (let i = 0; i < 3; i++) {
        t.push({ wave: 'saw', at: r.range(0, 0.25), f: A2 * r.pick([1, 2]), a: 0.002, h: r.range(0.015, 0.04), d: 0.02, g: 0.18, filt: { type: 'bp', f: 1400, q: 1.5 } });
      }
      return t;
    },
  },
  // A struck crystal: glassy inharmonic partials, pitched to a random note of the pentatonic.
  chime: {
    peak: 0.12,
    notes: PENTA,
    send: 0.45,
    make: () => [
      { wave: 'sine', f: A5, a: 0.002, d: 2.2 },
      { wave: 'sine', f: A5 * 1.0018, a: 0.002, d: 2.0, g: 0.35 },
      { wave: 'sine', f: A5 * 2.756, a: 0.001, d: 0.9, g: 0.22 },
      { wave: 'sine', f: A5 * 5.404, a: 0.001, d: 0.35, g: 0.07 },
      { wave: 'noise', a: 0.0005, d: 0.004, g: 0.1, filt: { type: 'hp', f: 6000 } },
    ],
  },
  // Magma meeting air: a sputtering hiss over a low blorp.
  hiss: {
    peak: 0.11,
    variants: 3,
    jitter: 0.05,
    send: 0.2,
    make: (r) => {
      const t: Tone[] = [
        { wave: 'noise', a: 0.04, h: 0.22, d: 0.5, g: 0.6, filt: { type: 'bp', f: 3000, f2: 1800, q: 0.9 } },
        { wave: 'sine', f: 120, f2: 70, glide: 0.12, a: 0.005, d: 0.2, g: 0.45 },
      ];
      for (let i = 0; i < 12; i++) {
        t.push({ wave: 'noise', at: r.range(0.02, 0.5), a: 0.001, d: r.range(0.01, 0.04), g: r.range(0.2, 0.5), filt: { type: 'bp', f: r.range(1800, 4200), q: 1.5 } });
      }
      return t;
    },
  },
  // A conduit pulse: a soft "whomm" on the hum's A with a closing filter and a teal glint.
  pulse: {
    peak: 0.13,
    send: 0.3,
    make: () => [
      { wave: 'sine', f: A2, a: 0.05, d: 0.6, g: 0.3 },
      { wave: 'sine', f: A3, a: 0.04, d: 0.55, g: 0.6 },
      { wave: 'saw', f: A3, a: 0.03, d: 0.5, g: 0.45, filt: { type: 'lp', f: 2400, f2: 300, q: 2.2 } },
      { wave: 'tri', f: E4, a: 0.05, d: 0.45, g: 0.18 },
      { wave: 'sine', f: E6, a: 0.004, d: 0.25, g: 0.07 },
    ],
  },
  // Glass breaking: a crack, a crunch and a shower of tinkles.
  shatter: {
    peak: 0.18,
    prio: 2,
    variants: 3,
    jitter: 0.04,
    send: 0.3,
    make: (r) => {
      const t: Tone[] = [
        { wave: 'noise', a: 0.0003, d: 0.035, g: 0.9, filt: { type: 'hp', f: 3000 } },
        { wave: 'noise', a: 0.0005, d: 0.09, g: 0.45, filt: { type: 'bp', f: 900, q: 0.9 } },
      ];
      for (let i = 0; i < 18; i++) {
        const at = 0.004 + 0.38 * Math.pow(r.next(), 2);
        const f = r.range(2200, 5000);
        const g = r.range(0.2, 0.6) * (1 - at * 1.4);
        t.push({ wave: 'sine', at, f, a: 0.0004, d: r.range(0.05, 0.25), g });
        t.push({ wave: 'sine', at, f: f * r.range(1.9, 2.4), a: 0.0003, d: r.range(0.02, 0.06), g: g * 0.3 });
      }
      return t;
    },
  },
  // A friendly two-note "bloop" for notices.
  toast: {
    peak: 0.13,
    gap: 0.2,
    make: () =>
      [E5, A5].flatMap((f, i): Tone[] => [
        { wave: 'sine', at: i * 0.075, f, a: 0.003, h: 0.03 + i * 0.01, d: 0.18 + i * 0.17, g: 0.75 },
        { wave: 'tri', at: i * 0.075, f, a: 0.003, h: 0.03 + i * 0.01, d: 0.15 + i * 0.15, g: 0.25 },
      ]),
  },
};

// Ambient one-shots and loops used by the hum and the machine bed (never played by the game directly).
type AmbName = 'bubble' | 'drip' | 'ping' | 'groan' | 'clunk' | 'pop' | 'fab';

const AMB: Record<AmbName, SfxDef> = {
  // A rising sine blip; slowed right down it becomes a magma blorp.
  bubble: {
    peak: 1,
    variants: 6,
    make: (r) => {
      const f = r.range(280, 650);
      const len = r.range(0.04, 0.09);
      const t: Tone[] = [{ wave: 'sine', f, f2: f * r.range(1.7, 2.4), glide: len, a: 0.002, d: len * 1.6 }];
      if (r.next() < 0.4) {
        const f2 = f * r.range(1.2, 1.6);
        t.push({ wave: 'sine', at: len * r.range(0.8, 1.5), f: f2, f2: f2 * 1.9, glide: len * 0.7, a: 0.002, d: len * 1.2, g: 0.5 });
      }
      return t;
    },
  },
  drip: {
    peak: 1,
    variants: 4,
    make: (r) => [
      { wave: 'sine', f: r.range(1100, 1500), f2: r.range(2000, 2600), glide: 0.025, a: 0.001, d: 0.07 },
      { wave: 'sine', at: 0.004, f: 300, f2: 500, glide: 0.02, a: 0.001, d: 0.03, g: 0.2 },
    ],
  },
  // A crystal ringing on its own, slower and softer than the 'chime' effect.
  ping: {
    peak: 1,
    variants: 2,
    make: (r) => [
      { wave: 'sine', f: A5, a: 0.012, d: 3.2 },
      { wave: 'sine', f: A5 * r.range(1.0012, 1.0022), a: 0.012, d: 2.6, g: 0.4 },
      { wave: 'sine', f: A5 * 2.756, a: 0.006, d: 1.1, g: 0.18 },
    ],
  },
  // Rock (or something larger) settling, far off.
  groan: {
    peak: 1,
    variants: 2,
    make: (r) => [
      { wave: 'saw', f: r.range(56, 60), f2: r.range(48, 52), a: 0.8, h: 0.6, d: 1.8, vib: [0.7, 0.012], filt: { type: 'lp', f: 260, q: 2 } },
      { wave: 'noise', a: 0.6, h: 0.4, d: 1.5, g: 0.5, filt: { type: 'lp', f: 120 } },
    ],
  },
  // A stone gear somewhere in the walls taking one step.
  clunk: {
    peak: 1,
    variants: 2,
    make: (r) => [
      { wave: 'sine', f: r.range(85, 95), f2: 48, glide: 0.1, a: 0.002, d: 0.35 },
      { wave: 'noise', a: 0.001, d: 0.12, g: 0.6, filt: { type: 'lp', f: 500 } },
      { wave: 'tri', f: r.range(170, 190), f2: 140, glide: 0.05, a: 0.001, d: 0.15, g: 0.35 },
    ],
  },
  // A fire pop from a furnace.
  pop: {
    peak: 1,
    variants: 4,
    make: (r) => [{ wave: 'noise', a: 0.0003, d: r.range(0.006, 0.015), filt: { type: 'bp', f: r.range(1200, 3000), q: 1.2 } }],
  },
  // Presses and assemblers at work: thump, clank, softer thump, air release, clank (1.6 s loop).
  fab: {
    peak: 0.25,
    loop: 1.6,
    make: () => {
      const thump = (at: number, g: number, p: number): Tone[] => [
        { wave: 'sine', at, f: 150 * p, f2: 75 * p, glide: 0.05, a: 0.001, d: 0.16, g: 0.7 * g },
        { wave: 'noise', at, a: 0.001, d: 0.08, g: 0.7 * g, filt: { type: 'bp', f: 520 * p, q: 1 } },
        { wave: 'square', at, f: 262 * p, a: 0.0005, d: 0.05, g: 0.2 * g, filt: { type: 'lp', f: 1400 } },
      ];
      const clank = (at: number, f: number, g: number): Tone[] => [
        { wave: 'tri', at, f, a: 0.0005, d: 0.07, g: 0.45 * g },
        { wave: 'sine', at, f: f * 2.76, a: 0.0005, d: 0.05, g: 0.12 * g },
        { wave: 'noise', at, a: 0.0003, d: 0.012, g: 0.35 * g, filt: { type: 'bp', f: 2500, q: 1.5 } },
      ];
      return [
        ...thump(0, 1, 1),
        ...clank(0.3, 900, 1),
        ...thump(0.8, 0.6, 0.9),
        { wave: 'noise', at: 1.05, a: 0.01, d: 0.18, g: 0.2, filt: { type: 'bp', f: 4000, q: 0.8 } },
        ...clank(1.3, 760, 0.8),
      ];
    },
  },
};

function renderDef(def: SfxDef, key: string, fs: number, variant: number): Float32Array {
  const r = rand((hash(key) + Math.imul(variant + 1, 0x9e3779b9)) >>> 0);
  const loop = def.loop ?? 0;
  return finish(renderTones(def.make(r, variant), fs, r.next, loop), fs, def.peak, loop > 0);
}

/** Renders one effect to samples (pure; for tests and tools). The game uses `audio.play`. */
export function renderSfx(name: SfxName, sampleRate: number, variant = 0): Float32Array {
  return renderDef(SFX[name], name, sampleRate, variant);
}

// ------------------------------------------------------------------------------ the hum, by layer

interface AmbientEvent {
  name: AmbName;
  /** Average events per second. */
  rate: number;
  gain: readonly [number, number];
  /** Playback-rate range. */
  pitch: readonly [number, number];
  /** Up to this many in a quick cluster. */
  cluster?: number;
  /** Also pick a pentatonic note. */
  penta?: boolean;
}

const DRIPS = (rate: number): AmbientEvent => ({ name: 'drip', rate, gain: [0.2, 0.45], pitch: [0.8, 1.25] });
const BUBBLES: AmbientEvent = { name: 'bubble', rate: 1.6, gain: [0.15, 0.4], pitch: [0.8, 1.4], cluster: 3 };
const PINGS: AmbientEvent = { name: 'ping', rate: 0.22, gain: [0.15, 0.35], pitch: [1, 1], penta: true };
const BLORPS: AmbientEvent = { name: 'bubble', rate: 0.45, gain: [0.3, 0.6], pitch: [0.2, 0.32], cluster: 2 };
const GROANS: AmbientEvent = { name: 'groan', rate: 0.05, gain: [0.18, 0.33], pitch: [0.9, 1.1] };
const CLUNKS: AmbientEvent = { name: 'clunk', rate: 0.1, gain: [0.25, 0.5], pitch: [0.85, 1] };
const POPS: AmbientEvent = { name: 'pop', rate: 1.6, gain: [0.02, 0.06], pitch: [0.8, 1.3] };
const MACHINE_PINGS: AmbientEvent = { name: 'ping', rate: 0.25, gain: [0.015, 0.04], pitch: [1, 1], penta: true };

/** One layer's hum: voice levels (0..1 before HUM_LEVEL), filter cutoffs, heartbeat depth, reverb. */
interface Profile {
  wind: number;
  body: number;
  drone: number;
  fifth: number;
  octave: number;
  wet: number;
  glass: number;
  rumble: number;
  /** Chord voice levels (see CHORD). */
  chord: readonly number[];
  toneCut: number;
  chordCut: number;
  pulse: number;
  reverb: number;
  events: readonly AmbientEvent[];
}

const PROFILES: readonly Profile[] = [
  // 0 Surface: wind over the dig site, the hum only just there.
  { wind: 1, body: 0.25, drone: 0.3, fifth: 0, octave: 0, wet: 0, glass: 0, rumble: 0, chord: [], toneCut: 240, chordCut: 700, pulse: 0, reverb: 0.06, events: [] },
  // 1 Shallows: a draft, the hum closer and its fifth, water dripping.
  { wind: 0.12, body: 0.4, drone: 0.6, fifth: 0.36, octave: 0, wet: 0, glass: 0, rumble: 0, chord: [], toneCut: 330, chordCut: 700, pulse: 0, reverb: 0.4, events: [DRIPS(0.3)] },
  // 2 Fungal: the octave joins with a slow beating; wet and bubbly.
  { wind: 0, body: 0.4, drone: 0.55, fifth: 0.32, octave: 0.3, wet: 0.8, glass: 0, rumble: 0, chord: [], toneCut: 420, chordCut: 700, pulse: 0, reverb: 0.45, events: [BUBBLES, DRIPS(0.12)] },
  // 3 Crystal: glassy partials ring over the hum.
  { wind: 0, body: 0.3, drone: 0.55, fifth: 0.35, octave: 0.35, wet: 0, glass: 0.6, rumble: 0, chord: [], toneCut: 520, chordCut: 700, pulse: 0, reverb: 0.6, events: [PINGS] },
  // 4 Magma: rumble underneath, slow magma blorps.
  { wind: 0, body: 0.5, drone: 0.6, fifth: 0.35, octave: 0.35, wet: 0, glass: 0, rumble: 0.9, chord: [], toneCut: 450, chordCut: 700, pulse: 0, reverb: 0.4, events: [BLORPS, GROANS] },
  // 5 Alien: the hum becomes a slow pulsing chord, a heartbeat engine (suspended, unresolved).
  { wind: 0, body: 0.4, drone: 0.6, fifth: 0.4, octave: 0.4, wet: 0, glass: 0, rumble: 0.25, chord: [0.32, 0.28, 0.22, 0.14], toneCut: 650, chordCut: 900, pulse: 0.8, reverb: 0.55, events: [CLUNKS, GROANS] },
];

/** Where ending() takes the hum at t = 1: a full, warm, steady A major chord. */
const END = { body: 0.3, drone: 0.65, fifth: 0.42, octave: 0.42, toneCut: 900, chordCut: 2400, reverb: 0.5, level: 1 };

/** The Heart's chord. Voice 2 is the suspension: D, resolving to C# as the ending comes. */
const CHORD: readonly { f: number; type: OscillatorType; detune: number; enter: number; end: number }[] = [
  { f: E3, type: 'sawtooth', detune: -5, enter: 0, end: 0.3 },
  { f: A3, type: 'sawtooth', detune: 4, enter: 0.05, end: 0.28 },
  { f: D4, type: 'sawtooth', detune: -3, enter: 0.15, end: 0.26 },
  { f: E4, type: 'sawtooth', detune: 6, enter: 0.25, end: 0.2 },
  { f: A4, type: 'triangle', detune: -4, enter: 0.4, end: 0.18 },
  { f: Cs5, type: 'triangle', detune: 3, enter: 0.5, end: 0.14 },
  { f: E5, type: 'triangle', detune: -2, enter: 0.6, end: 0.1 },
];
const SUS = 2;

/** High partials of the Crystal layer: [Hz, swell rate Hz, pan]. */
const GLASS: readonly (readonly [number, number, number])[] = [
  [A5, 0.05, -0.5],
  [E6, 0.083, 0.45],
  [A6, 0.061, 0.1],
];

/** Machine family levels; the bed's summed power is capped at MACHINE.cap² families' worth. */
const MACHINE = { generic: 0.35, heat: 0.45, crystal: 0.3, fabrication: 1.6, extraction: 0.6, cap: 1.3 };

const HEART_PERIOD = 1.15;

// ---------------------------------------------------------------------------------------- helpers

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Soft saturation: the first machines count most, a hundred count about as much as a dozen. */
const sat = (n: number, k: number): number => (n > 0 ? 1 - Math.exp(-n / k) : 0);
const finite = (x: unknown, fallback: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);
const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const noop = (): void => {};

/** Runs `fn` when the browser is idle (or soon), so pre-rendering never stalls a frame. */
function later(fn: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn(), { timeout: 400 });
  else setTimeout(fn, 20);
}

type AudioCtor = new (options?: AudioContextOptions) => AudioContext;

function audioContextCtor(): AudioCtor | null {
  const g = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/**
 * The makeup gain a DynamicsCompressorNode adds on its own (the WebKit kernel that Chrome, Firefox and
 * Safari share): (1 / curve(0 dBFS))^0.6. The master bus divides it back out, so the compressor
 * only ever turns pile-ups down instead of turning everything up.
 */
function compressorMakeup(thresholdDb: number, kneeDb: number, ratio: number): number {
  const toLin = (db: number): number => Math.pow(10, db / 20);
  const toDb = (x: number): number => 20 * Math.log10(Math.max(x, 1e-12));
  const lt = toLin(thresholdDb);
  const curve = (x: number, k: number): number => (x < lt ? x : lt + (1 - Math.exp(-k * (x - lt))) / k);
  const slopeAt = (x: number, k: number): number => {
    if (x < lt) return 1;
    const x2 = x * 1.001;
    return (toDb(curve(x2, k)) - toDb(curve(x, k))) / (toDb(x2) - toDb(x));
  };
  const kneeDbEnd = thresholdDb + kneeDb;
  const kneeX = toLin(kneeDbEnd);
  let lo = 0.1;
  let hi = 10000;
  let k = 5;
  for (let i = 0; i < 15; i++) {
    if (slopeAt(kneeX, k) < 1 / ratio) hi = k;
    else lo = k;
    k = Math.sqrt(lo * hi);
  }
  const full = kneeX > 1 ? curve(1, k) : toLin(toDb(curve(kneeX, k)) + (0 - kneeDbEnd) / ratio);
  return Math.pow(1 / full, 0.6);
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const n = Math.round(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const r = rand(0x5eed);
  for (let i = 0; i < n; i++) d[i] = r.next() * 2 - 1;
  return buf;
}

/** A cave: 12 ms pre-delay, a few early reflections, a tail that darkens as it dies (T60 ≈ 1.9 s). */
function impulseResponse(ctx: BaseAudioContext): AudioBuffer {
  const fs = ctx.sampleRate;
  const n = Math.round(2.2 * fs);
  const pre = Math.round(0.012 * fs);
  const fall = Math.pow(0.001, 1 / (1.9 * fs));
  const buf = ctx.createBuffer(2, n, fs);
  const r = rand(0x7e7e);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let env = 1;
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const k = 0.35 + 0.55 * ((i - pre) / (n - pre));
      lp += (r.next() * 2 - 1 - lp) * (1 - k);
      d[i] = lp * env * Math.min(1, (i - pre) / (0.005 * fs));
      env *= fall;
    }
    for (let j = 0; j < 7; j++) {
      const at = pre + Math.round(r.range(0.006, 0.08) * fs);
      d[at] += (r.next() < 0.5 ? -1 : 1) * r.range(0.15, 0.4) * (1 - j / 10);
    }
  }
  return buf;
}

/** One period of a lub-dub, 0..1, looped onto the hum's gain on the Alien Strata. */
function heartbeatBuffer(ctx: BaseAudioContext): AudioBuffer {
  const fs = ctx.sampleRate;
  const n = Math.round(HEART_PERIOD * fs);
  const buf = ctx.createBuffer(1, n, fs);
  const d = buf.getChannelData(0);
  const bump = (t: number, peak: number, rise: number, fall: number): number => {
    if (t < peak - rise || t > peak + fall) return 0;
    const x = t < peak ? (t - peak + rise) / rise : 1 - (t - peak) / fall;
    return 0.5 - 0.5 * Math.cos(Math.PI * x);
  };
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    d[i] = Math.max(bump(t, 0.08, 0.08, 0.22), 0.65 * bump(t, 0.4, 0.07, 0.3));
  }
  return buf;
}

// ------------------------------------------------------------------------------------ the graph

type Glide = (p: AudioParam, v: number, tau: number) => void;

/** A voice group with its own level; one that sits silent gets unplugged so the browser skips it. */
class Group {
  readonly out: GainNode;
  private readonly dest: AudioNode;
  private on = true;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(out: GainNode, dest: AudioNode) {
    this.out = out;
    this.dest = dest;
    out.connect(dest);
  }

  set(level: number, tau: number, glide: Glide): void {
    glide(this.out.gain, level, tau);
    if (level > 1e-4) {
      if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      if (!this.on) {
        this.out.connect(this.dest);
        this.on = true;
      }
    } else if (this.on && this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        try {
          this.out.disconnect();
        } catch {
          // already gone
        }
        this.on = false;
      }, (tau * 7 + 0.5) * 1000);
    }
  }
}

interface HumNodes {
  hum: GainNode;
  events: GainNode;
  pulse: GainNode;
  beat: GainNode;
  toneLP: BiquadFilterNode;
  toneLfo: GainNode;
  chordLP: BiquadFilterNode;
  wind: Group;
  body: Group;
  drone: Group;
  fifth: Group;
  octave: Group;
  wet: Group;
  glass: Group;
  rumble: Group;
  chord: Group;
  voices: GainNode[];
  sus: OscillatorNode;
}

interface MachineNodes {
  bus: GainNode;
  generic: Group;
  extraction: Group;
  heat: Group;
  fab: Group;
  fab2: GainNode;
  crystal: Group;
}

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  prio: number;
}

/** The Web Audio side. Exists only once a context does; Audio below holds the settings before that. */
class Engine {
  readonly ctx: AudioContext;
  /** Master output, after the compressor. */
  readonly out: GainNode;
  /** Volume buses (dry and reverb send) for effects and the hum; at volume 0 they unplug. */
  private readonly sfxBus: Group;
  private readonly sfxRev: Group;
  private readonly musicBus: Group;
  private readonly musicRev: Group;
  private readonly revReturn: GainNode;
  private readonly noiseBuf: AudioBuffer;
  private readonly hum: HumNodes;
  private readonly mach: MachineNodes;
  private readonly targets = new WeakMap<AudioParam, number>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly lastVariant = new Map<string, number>();
  private readonly voices: Voice[] = [];
  private heatW = 0;
  private crystalW = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = COMP.threshold;
    comp.knee.value = COMP.knee;
    comp.ratio.value = COMP.ratio;
    comp.attack.value = COMP.attack;
    comp.release.value = COMP.release;
    this.out = this.gain(1 / compressorMakeup(COMP.threshold, COMP.knee, COMP.ratio), ctx.destination);
    comp.connect(this.out);

    this.sfxBus = this.group(comp);
    this.musicBus = this.group(comp);
    this.revReturn = this.gain(0, comp);
    const verb = ctx.createConvolver();
    verb.buffer = impulseResponse(ctx);
    verb.connect(this.revReturn);
    this.sfxRev = this.group(verb);
    this.musicRev = this.group(verb);

    this.noiseBuf = noiseBuffer(ctx, 5);
    this.hum = this.buildHum();
    this.mach = this.buildMachines();
  }

  // ---- node helpers

  /**
   * Glides a parameter to `v` with time constant `tau` (0 = set now), skipping no-op updates so
   * callers may repeat themselves freely.
   */
  private readonly glide: Glide = (p, v, tau) => {
    if (!Number.isFinite(v)) return;
    const prev = this.targets.get(p);
    if (prev !== undefined && Math.abs(prev - v) <= 1e-5 + Math.abs(prev) * 0.003) return;
    this.targets.set(p, v);
    try {
      if (tau <= 0) p.setValueAtTime(v, this.ctx.currentTime);
      else p.setTargetAtTime(v, this.ctx.currentTime, Math.max(0.005, tau));
    } catch {
      p.value = v;
    }
  };

  private gain(v: number, dest?: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    if (dest) g.connect(dest);
    return g;
  }

  private group(dest: AudioNode): Group {
    return new Group(this.gain(0), dest);
  }

  private osc(type: OscillatorType, freq: number, dest: AudioNode, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(dest);
    o.start();
    return o;
  }

  /** A sine LFO adding ±depth to `param`; returns the depth gain. */
  private lfo(rate: number, depth: number, param: AudioParam): GainNode {
    const g = this.gain(depth);
    g.connect(param);
    this.osc('sine', rate, g);
    return g;
  }

  private filter(type: BiquadFilterType, freq: number, q: number, dest: AudioNode): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(dest);
    return f;
  }

  private noise(offset: number): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.start(0, offset);
    return s;
  }

  /** A stereo panner into `dest` (or `dest` itself where panners don't exist). */
  private pan(p: number, dest: AudioNode): AudioNode {
    if (typeof this.ctx.createStereoPanner !== 'function') return dest;
    const n = this.ctx.createStereoPanner();
    n.pan.value = p;
    n.connect(dest);
    return n;
  }

  private loopSrc(buf: AudioBuffer, rate: number, offset: number, dest: AudioNode): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate;
    s.connect(dest);
    s.start(0, offset);
    return s;
  }

  // ---- building

  private buildHum(): HumNodes {
    const c = this.ctx;
    const hum = this.gain(0, this.musicBus.out);
    hum.connect(this.gain(0.12, this.musicRev.out));

    // The heartbeat: a looping lub-dub added onto the pulse gain (deep enough to hear on layer 5 only).
    const pulse = this.gain(1, hum);
    const beat = this.gain(0);
    beat.connect(pulse.gain);
    const heart = c.createBufferSource();
    heart.buffer = heartbeatBuffer(c);
    heart.loop = true;
    heart.connect(beat);
    heart.start();

    // The tonal core: two saws on A1 beating slowly against each other, the fifth and the octave
    // (each a beating pair), through one low-pass that opens a little more on each layer down.
    const toneLP = this.filter('lowpass', 180, 0.7, pulse);
    const toneLfo = this.lfo(0.031, 20, toneLP.frequency);
    const drone = this.group(toneLP);
    this.osc('sawtooth', A1, this.pan(-0.3, drone.out));
    this.osc('sawtooth', A1 * 1.0034, this.pan(0.3, drone.out));
    const fifth = this.group(toneLP);
    this.osc('triangle', E2, this.pan(-0.15, fifth.out));
    this.osc('triangle', E2 * 1.0041, this.pan(0.2, fifth.out));
    const octave = this.group(toneLP);
    this.osc('sine', A2, octave.out);
    this.osc('sine', A2 * 1.0029, octave.out);
    // Breath under the hum: low filtered noise, on the heartbeat too.
    const body = this.group(pulse);
    this.noise(1.3).connect(this.filter('lowpass', 150, 0.9, body.out));

    // The Heart's chord (layer 5 and the ending), with a slow shared vibrato.
    const chordLP = this.filter('lowpass', 900, 0.5, pulse);
    const chord = this.group(chordLP);
    const vibrato = this.gain(4);
    this.osc('sine', 0.17, vibrato);
    const voices: GainNode[] = [];
    const oscs: OscillatorNode[] = [];
    for (const v of CHORD) {
      const g = this.gain(0, chord.out);
      const o = this.osc(v.type, v.f, g, v.detune);
      vibrato.connect(o.detune);
      voices.push(g);
      oscs.push(o);
    }

    // Layer textures.
    const wind = this.group(hum);
    this.windChain(0, -0.5, 0.071, 0.113, wind.out);
    this.windChain(2.7, 0.5, 0.053, 0.089, wind.out);
    const wet = this.group(hum);
    const wetAm = this.gain(0.9, wet.out);
    this.lfo(0.83, 0.45, wetAm.gain);
    this.noise(3.1).connect(this.filter('bandpass', 720, 3.2, wetAm));
    const glass = this.group(hum);
    for (const [f, rate, p] of GLASS) {
      const g = this.gain(0.06, this.pan(p, glass.out));
      this.lfo(rate, 0.06, g.gain);
      this.osc('sine', f, g);
      this.osc('sine', f * 1.0021, g);
    }
    const rumble = this.group(hum);
    const surge = this.gain(0.7, rumble.out);
    this.lfo(0.061, 0.3, surge.gain);
    const deep = this.noise(4.2);
    deep.connect(this.filter('lowpass', 120, 0.8, this.filter('lowpass', 120, 0.8, surge)));
    deep.connect(this.filter('bandpass', 260, 1.2, this.gain(0.5, surge)));

    // Ambient one-shots (drips, bubbles, pings): wetter than the rest.
    const events = this.gain(1, hum);
    events.connect(this.gain(0.5, this.musicRev.out));

    return {
      hum,
      events,
      pulse,
      beat,
      toneLP,
      toneLfo,
      chordLP,
      wind,
      body,
      drone,
      fifth,
      octave,
      wet,
      glass,
      rumble,
      chord,
      voices,
      sus: oscs[SUS],
    };
  }

  /** Stereo-ish wind: noise through a wandering low-pass, with slow gusts. */
  private windChain(offset: number, pan: number, sweepRate: number, gustRate: number, dest: AudioNode): void {
    const gust = this.gain(0.6, this.pan(pan, dest));
    this.lfo(gustRate, 0.25, gust.gain);
    this.lfo(gustRate * 0.43, 0.13, gust.gain);
    const lp = this.filter('lowpass', 650, 0.7, gust);
    this.lfo(sweepRate, 280, lp.frequency);
    this.noise(offset).connect(this.filter('highpass', 140, 0.6, lp));
  }

  private buildMachines(): MachineNodes {
    const bus = this.gain(0, this.sfxBus.out);
    bus.connect(this.gain(0.2, this.sfxRev.out));

    // Any machine: a soft mechanical whirr and a little mains hum (on A).
    const generic = this.group(bus);
    this.noise(0.4).connect(this.filter('bandpass', 380, 0.7, generic.out));
    this.osc('sine', A2, this.gain(0.2, generic.out));
    this.osc('sine', E4, this.gain(0.05, generic.out));

    // Extraction: a grinding bit (chattering band of noise) and a motor.
    const extraction = this.group(bus);
    const grind = this.gain(0.6, extraction.out);
    this.lfo(7.3, 0.35, grind.gain);
    this.noise(1.9).connect(this.filter('bandpass', 230, 1.1, grind));
    const motor = this.filter('lowpass', 240, 0.8, this.gain(0.3, extraction.out));
    this.osc('sawtooth', A1, motor);
    this.osc('sawtooth', A1 * 1.012, motor);

    // Heat: a flickering furnace roar (fire pops come from tick()).
    const heat = this.group(bus);
    const flicker = this.gain(0.7, heat.out);
    this.lfo(3.1, 0.12, flicker.gain);
    this.lfo(4.9, 0.1, flicker.gain);
    this.noise(2.3).connect(this.filter('lowpass', 650, 0.6, this.filter('highpass', 90, 0.6, flicker)));

    // Fabrication: the press loop, and a second, slower one that drifts against it in bigger shops.
    const fab = this.group(bus);
    const loop = this.bufferFor(AMB.fab, 'amb:fab', 0);
    this.loopSrc(loop, 1, 0, this.pan(-0.25, fab.out));
    const fab2 = this.gain(0, this.pan(0.3, fab.out));
    this.loopSrc(loop, 0.87, 0.7, fab2);

    // Crystal: a faint high chord that swells (they ring when power runs near), and an electric buzz.
    const crystal = this.group(bus);
    const shimmer = this.gain(0.6, crystal.out);
    this.lfo(0.29, 0.35, shimmer.gain);
    const levels = [0.07, 0.055, 0.035];
    [Cs6, E6, A6].forEach((f, i) => {
      const g = this.gain(levels[i], shimmer);
      this.osc('sine', f, g);
      this.osc('sine', f * 1.0025, g);
    });
    this.osc('sawtooth', A2, this.filter('bandpass', 900, 3, this.gain(0.25, crystal.out)));

    return { bus, generic, extraction, heat, fab, fab2, crystal };
  }

  // ---- state → graph

  applyVolumes(sfx: number, music: number, tau: number): void {
    const s = sfx * sfx;
    const m = music * music;
    this.sfxBus.set(s, tau, this.glide);
    this.sfxRev.set(s, tau, this.glide);
    this.musicBus.set(m, tau, this.glide);
    this.musicRev.set(m, tau, this.glide);
  }

  applyAmbience(layer: number, endT: number, tau: number): void {
    const P = PROFILES[layer] ?? PROFILES[0];
    const h = this.hum;
    const e = smoothstep(0, 0.75, endT);
    const duck = 1 - 0.8 * smoothstep(0.05, 0.8, endT);
    const set = (gr: Group, v: number): void => gr.set(v, tau, this.glide);
    set(h.wind, P.wind * duck);
    set(h.wet, P.wet * duck);
    set(h.glass, P.glass * duck);
    set(h.rumble, P.rumble * duck);
    set(h.body, lerp(P.body, END.body, e));
    set(h.drone, Math.max(P.drone, END.drone * e));
    set(h.fifth, Math.max(P.fifth, END.fifth * e));
    set(h.octave, Math.max(P.octave, END.octave * e));
    let chordOn = 0;
    for (let i = 0; i < CHORD.length; i++) {
      const v = CHORD[i];
      const level = Math.max(P.chord[i] ?? 0, v.end * smoothstep(v.enter, v.enter + 0.3, endT));
      this.glide(h.voices[i].gain, level, tau);
      chordOn = Math.max(chordOn, level);
    }
    set(h.chord, chordOn > 0 ? 1 : 0);
    // The suspension resolves (D down to C#) halfway through the ending.
    this.glide(h.sus.frequency, endT >= 0.5 ? Cs4 : D4, 0.8);
    const cut = lerp(P.toneCut, END.toneCut, e);
    this.glide(h.toneLP.frequency, cut, tau);
    this.glide(h.toneLfo.gain, cut * 0.12, tau);
    this.glide(h.chordLP.frequency, lerp(P.chordCut, END.chordCut, e), tau);
    // Heartbeat depth: the gain swings between 1 - 0.6 d (rest) and 1 + 0.1 d (the lub).
    const depth = P.pulse * (1 - smoothstep(0.1, 0.7, endT));
    this.glide(h.pulse.gain, 1 - 0.6 * depth, tau);
    this.glide(h.beat.gain, 0.7 * depth, tau);
    this.glide(this.revReturn.gain, lerp(P.reverb, END.reverb, e) * REVERB_LEVEL, tau);
    this.glide(h.hum.gain, HUM_LEVEL * lerp(1, END.level, e), tau);
  }

  applyMachines(count: number, f: Families, endT: number, tau: number): void {
    const m = this.mach;
    const heat = sat(f.heat, 2.5);
    const crystal = sat(f.crystal, 2.5);
    const fab = sat(f.fabrication, 2.5);
    const ext = sat(f.extraction, 2.5);
    const other = Math.max(0, count - f.heat - f.crystal - f.fabrication - f.extraction);
    const generic = Math.min(1, 0.6 * sat(count, 6) + 0.5 * sat(other, 3));
    const power = Math.sqrt(heat * heat + crystal * crystal + fab * fab + ext * ext + 0.25 * generic * generic);
    const s = power > MACHINE.cap ? MACHINE.cap / power : 1;
    m.generic.set(generic * s * MACHINE.generic, tau, this.glide);
    m.heat.set(heat * s * MACHINE.heat, tau, this.glide);
    m.crystal.set(crystal * s * MACHINE.crystal, tau, this.glide);
    m.fab.set(fab * s * MACHINE.fabrication, tau, this.glide);
    m.extraction.set(ext * s * MACHINE.extraction, tau, this.glide);
    this.glide(m.fab2.gain, 0.6 * sat(f.fabrication - 2, 3), tau);
    this.glide(m.bus.gain, MACHINE_LEVEL * (1 - 0.5 * smoothstep(0.1, 0.8, endT)), tau);
    this.heatW = heat * s;
    this.crystalW = crystal * s;
  }

  // ---- sounds

  private bufferFor(def: SfxDef, key: string, variant: number): AudioBuffer {
    const id = `${key}#${variant}`;
    let buf = this.buffers.get(id);
    if (!buf) {
      const fs = this.ctx.sampleRate;
      const data = renderDef(def, key, fs, variant);
      buf = this.ctx.createBuffer(1, data.length, fs);
      buf.getChannelData(0).set(data);
      this.buffers.set(id, buf);
    }
    return buf;
  }

  /** Pre-renders every effect in idle time, one per callback. */
  warm(): void {
    const jobs: (() => void)[] = [];
    for (const name of SFX_NAMES) {
      const def = SFX[name];
      for (let v = 0; v < (def.variants ?? 1); v++) jobs.push(() => void this.bufferFor(def, name, v));
    }
    for (const name of Object.keys(AMB) as AmbName[]) {
      const def = AMB[name];
      for (let v = 0; v < (def.variants ?? 1); v++) jobs.push(() => void this.bufferFor(def, `amb:${name}`, v));
    }
    const step = (): void => {
      const job = jobs.shift();
      if (!job) return;
      try {
        job();
      } catch {
        // rendered on demand instead
      }
      later(step);
    };
    later(step);
  }

  private voice(
    buf: AudioBuffer,
    when: number,
    vol: number,
    rate: number,
    pan: number,
    dest: AudioNode,
    send: number,
    sendDest: AudioNode | null,
  ): Voice {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(g);
    const nodes: AudioNode[] = [src, g];
    let tail: AudioNode = g;
    if (Math.abs(pan) > 0.01 && typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      nodes.push(p);
      tail = p;
    }
    tail.connect(dest);
    if (send > 0 && sendDest) {
      const s = c.createGain();
      s.gain.value = send;
      tail.connect(s);
      s.connect(sendDest);
      nodes.push(s);
    }
    const v: Voice = { src, gain: g, prio: 0 };
    src.onended = () => {
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {
          // already disconnected
        }
      }
      const i = this.voices.indexOf(v);
      if (i >= 0) this.voices.splice(i, 1);
    };
    src.start(when);
    return v;
  }

  /** Frees a voice for a new sound: steals the oldest less important one, or says no. */
  private makeRoom(prio: number): boolean {
    if (this.voices.length < MAX_VOICES) return true;
    const i = this.voices.findIndex((v) => v.prio < prio || (prio >= 2 && v.prio <= prio));
    if (i < 0) return false;
    const [v] = this.voices.splice(i, 1);
    try {
      const t = this.ctx.currentTime;
      v.gain.gain.setTargetAtTime(0, t, 0.01);
      v.src.stop(t + 0.06);
    } catch {
      // already stopped
    }
    return true;
  }

  private pickVariant(key: string, n: number): number {
    if (n <= 1) return 0;
    let v = Math.floor(Math.random() * n);
    if (v === this.lastVariant.get(key)) v = (v + 1) % n;
    this.lastVariant.set(key, v);
    return v;
  }

  playSfx(name: SfxName, vol: number, rate: number, pan: number): void {
    const def = SFX[name];
    const prio = def.prio ?? 1;
    if (!this.makeRoom(prio)) return;
    const buf = this.bufferFor(def, name, this.pickVariant(name, def.variants ?? 1));
    let r = rate;
    if (def.notes && def.notes.length) r *= def.notes[Math.floor(Math.random() * def.notes.length)];
    if (def.jitter) r *= 1 + (Math.random() * 2 - 1) * def.jitter;
    const v = this.voice(buf, this.ctx.currentTime, vol, r, pan, this.sfxBus.out, def.send ?? 0, this.sfxRev.out);
    v.prio = prio;
    this.voices.push(v);
  }

  private ambient(ev: AmbientEvent, when: number, dest: AudioNode): void {
    const def = AMB[ev.name];
    const buf = this.bufferFor(def, `amb:${ev.name}`, Math.floor(Math.random() * (def.variants ?? 1)));
    let rate = lerp(ev.pitch[0], ev.pitch[1], Math.random());
    if (ev.penta) rate *= PENTA[Math.floor(Math.random() * PENTA.length)];
    this.voice(buf, when, lerp(ev.gain[0], ev.gain[1], Math.random()), rate, Math.random() * 1.4 - 0.7, dest, 0, null);
  }

  /** Rolls the layer's ambient one-shots and the machines' (fire pops, crystal rings) for `dt` s. */
  tick(layer: number, endT: number, dt: number): void {
    const now = this.ctx.currentTime;
    const P = PROFILES[layer] ?? PROFILES[0];
    const fade = 1 - smoothstep(0.05, 0.6, endT);
    for (const ev of P.events) {
      if (Math.random() >= ev.rate * dt * fade) continue;
      const n = 1 + Math.floor(Math.random() * (ev.cluster ?? 1));
      let when = now + 0.03 + Math.random() * dt;
      for (let k = 0; k < n; k++) {
        this.ambient(ev, when, this.hum.events);
        when += 0.04 + Math.random() * 0.12;
      }
    }
    if (Math.random() < POPS.rate * this.heatW * dt) this.ambient(POPS, now + 0.03 + Math.random() * dt, this.mach.bus);
    if (Math.random() < MACHINE_PINGS.rate * this.crystalW * dt) {
      this.ambient(MACHINE_PINGS, now + 0.03 + Math.random() * dt, this.mach.bus);
    }
  }
}

// ------------------------------------------------------------------------------------ public API

export class Audio {
  private engine: Engine | null = null;
  private failed = false;
  private paused = false;
  private layer = 0;
  private endT = 0;
  private sfxVol = 1;
  private musicVol = 1;
  private count = 0;
  private fam: Families = { heat: 0, crystal: 0, fabrication: 0, extraction: 0 };
  private readonly lastPlayed = new Map<SfxName, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;

  /**
   * Call on a user gesture (browsers only start audio from one). Creates the AudioContext and the
   * graph the first time; later calls resume a context the browser held back. Safe to call often.
   */
  init(): void {
    const live = this.engine;
    if (live) {
      if (!this.paused) this.resume(live.ctx);
      return;
    }
    if (this.failed) return;
    const Ctor = audioContextCtor();
    if (!Ctor) {
      this.failed = true;
      return;
    }
    let ctx: AudioContext | null = null;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
      const engine = new Engine(ctx);
      this.engine = engine;
      this.startedAt = nowMs();
      // Volumes land at once (the effect that woke audio up must not fade in); the hum fades in.
      engine.applyVolumes(this.sfxVol, this.musicVol, 0);
      engine.applyAmbience(this.layer, this.endT, FADE_IN_TAU);
      engine.applyMachines(this.count, this.fam, this.endT, MACHINE_TAU);
      const c = ctx;
      c.onstatechange = () => {
        // A context that finishes starting after setPaused(true) must not play.
        if (this.paused && c.state === 'running') void c.suspend().catch(noop);
      };
      if (this.paused) void c.suspend().catch(noop);
      else this.resume(c);
      this.timer = setInterval(() => this.tick(), TICK_S * 1000);
      engine.warm();
    } catch {
      this.engine = null;
      this.failed = true;
      if (this.timer !== null) clearInterval(this.timer);
      this.timer = null;
      try {
        if (ctx) void ctx.close().catch(noop);
      } catch {
        // nothing to close
      }
    }
  }

  /**
   * Plays an effect. `volume` scales the effect's own (already balanced) level, `pitch` is a
   * playback-rate multiplier (2 = an octave up), `pan` is -1..1. No-op before init() or while paused;
   * the same effect at most ~8 times a second.
   */
  play(name: SfxName, opts?: { volume?: number; pitch?: number; pan?: number }): void {
    const engine = this.engine;
    if (!engine || this.paused) return;
    if (!Object.prototype.hasOwnProperty.call(SFX, name)) return;
    const state = engine.ctx.state;
    if (state !== 'running' && !(state === 'suspended' && nowMs() - this.startedAt < START_GRACE_MS)) return;
    const t = nowMs();
    const last = this.lastPlayed.get(name);
    if (last !== undefined && t - last < (SFX[name].gap ?? DEFAULT_GAP) * 1000) return;
    const vol = clamp(finite(opts?.volume, 1), 0, 2);
    if (vol <= 0) return;
    this.lastPlayed.set(name, t);
    try {
      engine.playSfx(name, vol, clamp(finite(opts?.pitch, 1), 0.25, 4), clamp(finite(opts?.pan, 0), -1, 1));
    } catch {
      // a sound is never worth breaking the game over
    }
  }

  /** 0..5: crossfades the hum to that layer's (about 4 s). */
  setLayer(layer: number): void {
    const l = clamp(Math.round(finite(layer, this.layer)), 0, PROFILES.length - 1);
    if (l === this.layer) return;
    this.layer = l;
    this.withEngine((e) => e.applyAmbience(l, this.endT, LAYER_TAU));
  }

  /** Effects and music (the hum) volume, 0..1 each, on a squared (perceptual) taper. */
  setVolumes(sfx: number, music: number): void {
    this.sfxVol = clamp(finite(sfx, this.sfxVol), 0, 1);
    this.musicVol = clamp(finite(music, this.musicVol), 0, 1);
    this.withEngine((e) => e.applyVolumes(this.sfxVol, this.musicVol, 0.05));
  }

  /** Suspends all audio (tab hidden, game paused); effects played meanwhile are dropped. */
  setPaused(p: boolean): void {
    this.paused = !!p;
    const e = this.engine;
    if (!e) return;
    try {
      if (this.paused) {
        if (e.ctx.state === 'running') void e.ctx.suspend().catch(noop);
      } else this.resume(e.ctx);
    } catch {
      // ignore
    }
  }

  /**
   * The machine bed (call a few times a second): `count` working machines near the camera, and how
   * many of them are in each family. Levels saturate and the total is capped, so a big factory
   * sounds busy, not loud. The bed follows the effects volume.
   */
  machines(count: number, families: { heat: number; crystal: number; fabrication: number; extraction: number }): void {
    const n = (x: unknown): number => Math.max(0, finite(x, 0));
    this.count = n(count);
    this.fam = { heat: n(families?.heat), crystal: n(families?.crystal), fabrication: n(families?.fabrication), extraction: n(families?.extraction) };
    this.withEngine((e) => e.applyMachines(this.count, this.fam, this.endT, MACHINE_TAU));
  }

  /**
   * Progress of the ending, 0..1: the layer textures fall away, the heartbeat steadies, the Heart's
   * suspended chord resolves and the hum opens into a full, warm A major chord. It stays wherever the
   * last call left it (ending(0) restores the plain hum).
   */
  ending(t: number): void {
    const v = clamp(finite(t, 0), 0, 1);
    if (v === this.endT) return;
    this.endT = v;
    this.withEngine((e) => {
      e.applyAmbience(this.layer, v, END_TAU);
      e.applyMachines(this.count, this.fam, v, END_TAU);
    });
  }

  private resume(ctx: AudioContext): void {
    if (ctx.state === 'running' || ctx.state === 'closed') return;
    this.startedAt = nowMs();
    try {
      void ctx.resume().catch(noop);
    } catch {
      // old browsers
    }
  }

  private tick(): void {
    const e = this.engine;
    if (!e || this.paused || e.ctx.state !== 'running') return;
    try {
      e.tick(this.layer, this.endT, TICK_S);
    } catch {
      // ignore
    }
  }

  private withEngine(fn: (e: Engine) => void): void {
    const e = this.engine;
    if (!e) return;
    try {
      fn(e);
    } catch {
      // ignore
    }
  }
}

/** The game's audio. */
export const audio = new Audio();
