import { makeRng } from '../png';

export { makeRng };

/** Sample rate of every generated sound. Mono, 16-bit. */
export const SR = 22050;

export type Rng = () => number;
export type Buf = Float32Array;

export const samples = (seconds: number): number => Math.round(seconds * SR);
export const zeros = (n: number): Buf => new Float32Array(n);
export const fromDb = (db: number): number => 10 ** (db / 20);
export const toDb = (x: number): number => 20 * Math.log10(Math.max(x, 1e-9));
export const range = (rng: Rng, a: number, b: number): number => a + (b - a) * rng();
export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;
export const midiHz = (note: number): number => 440 * 2 ** ((note - 69) / 12);

// ---- Analysis ----------------------------------------------------------------

export function peak(x: Buf): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]!));
  return p;
}

export function rms(x: Buf): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, x.length));
}

export function dcOffset(x: Buf): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i]!;
  return s / Math.max(1, x.length);
}

// ---- Sources -----------------------------------------------------------------

/** White noise in -1..1. */
export function whiteNoise(rng: Rng, n: number): Buf {
  const out = zeros(n);
  for (let i = 0; i < n; i++) out[i] = rng() * 2 - 1;
  return out;
}

/** A sine wave whose frequency is snapped so a whole number of cycles fits `n` samples. */
export function loopSine(freq: number, n: number, phase = 0): Buf {
  const cycles = Math.max(1, Math.round((freq * n) / SR));
  const out = zeros(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin(2 * Math.PI * (cycles * (i / n) + phase));
  return out;
}

/** Slow sine modulator with a whole number of cycles over `n` samples, 0..1 when `unipolar`. */
export function lfo(n: number, cycles: number, phase = 0, unipolar = true): Buf {
  const out = zeros(n);
  for (let i = 0; i < n; i++) {
    const s = Math.sin(2 * Math.PI * (cycles * (i / n) + phase));
    out[i] = unipolar ? 0.5 + 0.5 * s : s;
  }
  return out;
}

/** A bare sine whose pitch glides from `f0` to `f1` over `dur` seconds (no envelope). */
export function glideBuf(f0: number, f1: number, dur: number, curve: 'exp' | 'lin'): Buf {
  const n = samples(dur);
  const out = zeros(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = curve === 'exp' ? f0 * (f1 / f0) ** t : f0 + (f1 - f0) * t;
    phase += f / SR;
    out[i] = Math.sin(2 * Math.PI * phase);
  }
  return out;
}

export type Shape = 'sine' | 'triangle' | 'saw' | 'pulse';

/** One oscillator sample for a phase measured in cycles. */
export function wave(shape: Shape, phase: number): number {
  const p = phase - Math.floor(phase);
  switch (shape) {
    case 'sine':
      return Math.sin(2 * Math.PI * p);
    case 'triangle':
      return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
    case 'saw':
      return 2 * p - 1;
    case 'pulse':
      return p < 0.25 ? 1 : -1;
  }
}

/** A detuned oscillator voice of `n` samples; `cents` spreads copies around the pitch. */
export function osc(shape: Shape, freq: number, n: number, cents = 0, copies = 1, phase0 = 0): Buf {
  const out = zeros(n);
  for (let c = 0; c < copies; c++) {
    const offset = copies === 1 ? 0 : (c / (copies - 1) - 0.5) * 2 * cents;
    const f = freq * 2 ** (offset / 1200);
    const inc = f / SR;
    let phase = phase0 + c * 0.37;
    for (let i = 0; i < n; i++) {
      out[i]! += wave(shape, phase) / copies;
      phase += inc;
    }
  }
  return out;
}

// ---- Envelopes ---------------------------------------------------------------

/** ADSR envelope for a note held `hold` seconds, then released over `release` seconds. */
export function adsr(hold: number, a: number, d: number, s: number, release: number): Buf {
  const n = samples(hold + release);
  const out = zeros(n);
  const holdN = samples(hold);
  const aN = Math.max(1, samples(a));
  const dN = Math.max(1, samples(d));
  for (let i = 0; i < n; i++) {
    let v: number;
    if (i < aN) v = i / aN;
    else if (i < aN + dN) v = 1 - (1 - s) * ((i - aN) / dN);
    else v = s;
    if (i >= holdN) v *= Math.max(0, 1 - (i - holdN) / Math.max(1, samples(release)));
    out[i] = v;
  }
  return out;
}

/** Exponential decay envelope (1 at the start, -60 dB after `t60` seconds) with a short click-free attack. */
export function decayEnv(n: number, t60: number, attack = 0.003): Buf {
  const out = zeros(n);
  const k = Math.log(1000) / (t60 * SR);
  const aN = Math.max(1, samples(attack));
  for (let i = 0; i < n; i++) out[i] = Math.exp(-k * i) * Math.min(1, i / aN);
  return out;
}

// ---- Filters -----------------------------------------------------------------

export function lowpass(x: Buf, cutoff: number): Buf {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
  const out = zeros(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y += a * (x[i]! - y);
    out[i] = y;
  }
  return out;
}

export function highpass(x: Buf, cutoff: number): Buf {
  const lp = lowpass(x, cutoff);
  const out = zeros(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i]! - lp[i]!;
  return out;
}

/** RBJ biquad: low-pass, high-pass or band-pass (constant peak gain). */
export function biquad(x: Buf, type: 'lp' | 'hp' | 'bp', freq: number, q = 0.7071): Buf {
  const w0 = (2 * Math.PI * Math.min(freq, SR * 0.45)) / SR;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  let b0: number;
  let b1: number;
  let b2: number;
  if (type === 'lp') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = b0;
  } else if (type === 'hp') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = b0;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const out = zeros(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!;
    const y = (b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

/**
 * Runs an effect over two back-to-back copies and keeps the second, so filter
 * state, delay lines and reverb tails wrap around the loop point seamlessly.
 */
export function circular(x: Buf, fn: (doubled: Buf) => Buf): Buf {
  const doubled = zeros(x.length * 2);
  doubled.set(x, 0);
  doubled.set(x, x.length);
  return fn(doubled).slice(x.length);
}

/** Smooth random control signal in 0..1 that changes at about `rateHz`, and loops seamlessly. */
export function smoothRandom(rng: Rng, n: number, rateHz: number): Buf {
  const noise = circular(whiteNoise(rng, n), (d) => lowpass(d, rateHz));
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    min = Math.min(min, noise[i]!);
    max = Math.max(max, noise[i]!);
  }
  const span = Math.max(1e-9, max - min);
  for (let i = 0; i < n; i++) noise[i] = (noise[i]! - min) / span;
  return noise;
}

// ---- Effects -----------------------------------------------------------------

export function feedbackDelay(x: Buf, seconds: number, feedback: number, mix: number): Buf {
  const d = Math.max(1, samples(seconds));
  const out = zeros(x.length);
  for (let i = 0; i < x.length; i++) {
    const echo = i >= d ? out[i - d]! : 0;
    out[i] = x[i]! + echo * feedback;
  }
  const result = zeros(x.length);
  for (let i = 0; i < x.length; i++) result[i] = x[i]! * (1 - mix * 0.5) + (out[i]! - x[i]!) * mix;
  return result;
}

/** Schroeder reverb: damped parallel combs into two all-pass filters. */
export function reverb(x: Buf, wet: number, size = 0.5, damp = 3500): Buf {
  const scale = SR / 44100;
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => Math.round(d * scale * (0.7 + size * 0.6)));
  const feedback = 0.72 + size * 0.2;
  const damping = 1 - Math.exp((-2 * Math.PI * damp) / SR);
  const sum = zeros(x.length);
  for (const d of combs) {
    const y = zeros(x.length);
    let lp = 0;
    for (let i = 0; i < x.length; i++) {
      const fb = i >= d ? y[i - d]! : 0;
      lp += damping * (fb - lp);
      y[i] = x[i]! + lp * feedback;
      sum[i]! += y[i]! / combs.length;
    }
  }
  let signal = sum;
  for (const d of [Math.round(225 * scale), Math.round(556 * scale)]) {
    const y = zeros(x.length);
    for (let i = 0; i < x.length; i++) {
      const delayedIn = i >= d ? signal[i - d]! : 0;
      const delayedOut = i >= d ? y[i - d]! : 0;
      y[i] = -0.5 * signal[i]! + delayedIn + 0.5 * delayedOut;
    }
    signal = y;
  }
  const out = zeros(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i]! * (1 - wet) + signal[i]! * wet * 1.4;
  return out;
}

/** Soft saturation; `drive` > 1 adds warmth. */
export function saturate(x: Buf, drive: number): Buf {
  const out = zeros(x.length);
  const norm = 1 / Math.tanh(drive);
  for (let i = 0; i < x.length; i++) out[i] = Math.tanh(x[i]! * drive) * norm;
  return out;
}

// ---- Mixing ------------------------------------------------------------------

/** Adds `src` into `dest` starting at sample `start`, wrapping past the end so tails loop. */
export function addWrap(dest: Buf, src: Buf, start: number, gain = 1): void {
  const n = dest.length;
  let at = ((Math.round(start) % n) + n) % n;
  for (let i = 0; i < src.length; i++) {
    dest[at]! += src[i]! * gain;
    at += 1;
    if (at === n) at = 0;
  }
}

/** Multiplies `x` by `by` sample by sample (a new buffer; `by` may be shorter and is then repeated). */
export function mul(x: Buf, by: Buf): Buf {
  const out = zeros(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i]! * by[i % by.length]!;
  return out;
}

export function gain(x: Buf, g: number): Buf {
  const out = zeros(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i]! * g;
  return out;
}

export function sum(...parts: Buf[]): Buf {
  const n = Math.max(...parts.map((p) => p.length));
  const out = zeros(n);
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i]! += p[i]!;
  return out;
}

/** Removes any constant offset. */
export function removeDc(x: Buf): Buf {
  const dc = dcOffset(x);
  const out = zeros(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i]! - dc;
  return out;
}

/**
 * Final loudness stage: scales to an RMS target, then soft-limits so peaks
 * stay under the ceiling. Keeps perceived loudness steady between sounds.
 */
export function finish(x: Buf, rmsDb: number, ceilingDb = -6): Buf {
  const clean = removeDc(x);
  const level = rms(clean);
  const g = level > 1e-9 ? fromDb(rmsDb) / level : 1;
  const ceiling = fromDb(ceilingDb);
  const out = zeros(clean.length);
  for (let i = 0; i < clean.length; i++) out[i] = ceiling * Math.tanh((clean[i]! * g) / ceiling);
  return out;
}

/**
 * Makes a non-periodic clip loop without a click by crossfading its last
 * `crossfadeSec` into its head. The result is that much shorter.
 */
export function makeLoopable(x: Buf, crossfadeSec: number): Buf {
  const xf = Math.min(samples(crossfadeSec), Math.floor(x.length / 3));
  const len = x.length - xf;
  const out = x.slice(0, len);
  for (let i = 0; i < xf; i++) {
    const t = (i + 0.5) / xf;
    out[i] = x[i]! * Math.sin((t * Math.PI) / 2) + x[len + i]! * Math.cos((t * Math.PI) / 2);
  }
  return out;
}

/**
 * How big the step across the loop point is compared with the sound's own
 * movement just before and after it. Near 1 is a clean loop; a click is well above 5.
 */
export function seamRatio(x: Buf, window = 1500): number {
  let local = 0;
  let count = 0;
  for (let i = 1; i < window; i++) {
    local += Math.abs(x[i]! - x[i - 1]!) + Math.abs(x[x.length - i]! - x[x.length - i - 1]!);
    count += 2;
  }
  const typical = local / count;
  return Math.abs(x[0]! - x[x.length - 1]!) / Math.max(typical, 1e-6);
}
