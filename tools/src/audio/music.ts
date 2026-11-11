import {
  SR,
  addWrap,
  biquad,
  circular,
  decayEnv,
  finish,
  gain,
  glideBuf,
  highpass,
  lowpass,
  makeRng,
  midiHz,
  mul,
  osc,
  pick,
  range,
  reverb,
  samples,
  saturate,
  sum,
  whiteNoise,
  adsr,
  zeros,
  type Buf,
  type Rng,
} from './dsp';

// ---- Harmony -----------------------------------------------------------------

type Kind = 'maj7' | 'm7' | 'dom7' | 'six';

interface Bar {
  /** Pitch class of the chord root, 0 = C. */
  root: number;
  kind: Kind;
}

const TONES: Record<Kind, number[]> = {
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  six: [0, 4, 7, 9],
};
/** The "colour" tone that decorates each chord: the ninth, or the thirteenth over a dominant. */
const COLOUR: Record<Kind, number> = { maj7: 2, m7: 2, dom7: 9, six: 2 };

const C = 0;
const D = 2;
const E = 4;
const F = 5;
const G = 7;
const A = 9;

const bar = (root: number, kind: Kind): Bar => ({ root, kind });

const chordTones = (b: Bar): number[] => [...TONES[b.kind], COLOUR[b.kind]].map((t) => (b.root + t) % 12);

/** Upper-structure pitch classes of a rootless voicing: third, seventh, fifth, colour. */
const voicingClasses = (b: Bar): number[] => {
  const t = TONES[b.kind];
  return [t[1]!, t[3]!, t[2]!, COLOUR[b.kind]].map((x) => (b.root + x) % 12);
};

/** Picks the octave of each tone so every chord moves as little as possible from the last. */
function voiceLead(bars: Bar[]): number[][] {
  const lo = 53;
  const hi = 74;
  const result: number[][] = [];
  let previous: number[] = [60, 64, 67, 71];
  for (const b of bars) {
    const options = voicingClasses(b).map((pc) => {
      const found: number[] = [];
      for (let n = lo; n <= hi; n++) if (n % 12 === pc) found.push(n);
      return found;
    });
    let best: number[] = [];
    let bestScore = Infinity;
    const visit = (i: number, chosen: number[]): void => {
      if (i === options.length) {
        const sorted = [...chosen].sort((a, c) => a - c);
        let score = 0;
        sorted.forEach((n, k) => (score += Math.abs(n - previous[k]!)));
        score += Math.max(0, sorted[sorted.length - 1]! - sorted[0]! - 14) * 2;
        if (score < bestScore) {
          bestScore = score;
          best = sorted;
        }
        return;
      }
      for (const n of options[i]!) visit(i + 1, [...chosen, n]);
    };
    visit(0, []);
    result.push(best);
    previous = best;
  }
  return result;
}

interface MelodyNote {
  bar: number;
  beat: number;
  midi: number;
  beats: number;
}

const RHYTHMS: number[][] = [[0, 1.5], [0.5, 2], [1, 2.5, 3], [0, 2], [1.5, 3], [0, 1, 2.5], [0.5, 1.5, 3], [2, 3.5]];

/**
 * A small motif drawn from the scale: it moves mostly by step, lands on chord
 * tones on strong beats and answers itself in the second half of the cycle.
 */
function melody(bars: Bar[], rng: Rng, scale: number[], lo: number, hi: number, rests: number[]): MelodyNote[] {
  const pitches: number[] = [];
  for (let n = lo; n <= hi; n++) if (scale.includes(n % 12)) pitches.push(n);
  let index = Math.floor(pitches.length / 2);
  const rhythmFor = [pick(rng, RHYTHMS), pick(rng, RHYTHMS)];
  const notes: MelodyNote[] = [];
  bars.forEach((b, barIndex) => {
    if (rests.includes(barIndex)) return;
    const cell = rhythmFor[barIndex % 2]!;
    const tones = chordTones(b);
    cell.forEach((beat, k) => {
      index = Math.min(pitches.length - 1, Math.max(0, index + pick(rng, [-2, -1, -1, 0, 1, 1, 2])));
      if (beat % 1 === 0 && !tones.includes(pitches[index]! % 12)) {
        for (let reach = 1; reach < 5; reach++) {
          const up = pitches[index + reach];
          const down = pitches[index - reach];
          if (down !== undefined && tones.includes(down % 12)) {
            index -= reach;
            break;
          }
          if (up !== undefined && tones.includes(up % 12)) {
            index += reach;
            break;
          }
        }
      }
      const next = cell[k + 1] ?? 4;
      notes.push({ bar: barIndex, beat, midi: pitches[index]!, beats: Math.min(next - beat, 1.75) });
    });
  });
  return notes;
}

// ---- Instruments -------------------------------------------------------------

/** A Rhodes-style electric piano: FM with a bell-like attack that mellows quickly. */
function ePiano(freq: number, hold: number, vel: number): Buf {
  const n = samples(Math.min(hold + 0.7, 3.4));
  const out = zeros(n);
  const bright = 0.9 + 1.8 * vel;
  const decay = 3.2 * (1 + freq / 1500);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const phase = 2 * Math.PI * freq * t;
    const index = bright * Math.exp(-t * 7) + 0.3;
    const env = (1 - Math.exp(-t / 0.004)) * Math.exp(-t * decay) * Math.min(1, Math.max(0, 1 - (t - hold) / 0.35));
    out[i] = Math.sin(phase + index * Math.sin(phase)) * env * vel;
  }
  return out;
}

/** A soft FM bell. */
function bellNote(freq: number, vel: number): Buf {
  const n = samples(2.8);
  const out = zeros(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const phase = 2 * Math.PI * freq * t;
    const env = (1 - Math.exp(-t / 0.003)) * Math.exp(-t * 1.7);
    out[i] = Math.sin(phase + 1.6 * Math.exp(-t * 4) * Math.sin(phase * 3.5)) * env * vel;
  }
  return out;
}

/** A warm detuned pad that swells in and fades out. */
function padNote(freq: number, hold: number, vel: number): Buf {
  const n = samples(hold + 1.4);
  const tone = lowpass(osc('saw', freq, n, 9, 3), 1000);
  return mul(gain(tone, vel), adsr(hold, 0.9, 0.5, 0.85, 1.4));
}

/** A plucked-string note (Karplus-Strong) with a gently rolled-off tone. */
function pluck(rng: Rng, freq: number, vel: number): Buf {
  const n = samples(1.7);
  const out = zeros(n);
  const lag = SR / freq - 0.45;
  const d0 = Math.floor(lag);
  const frac = lag - d0;
  const burst = lowpass(whiteNoise(rng, d0 + 2), 3200);
  for (let i = 0; i < d0 + 2; i++) out[i] = burst[i]! * vel * 1.6;
  let smooth = 0;
  for (let i = d0 + 2; i < n; i++) {
    const read = out[i - d0]! * (1 - frac) + out[i - d0 - 1]! * frac;
    smooth += 0.72 * (read - smooth);
    out[i] = smooth * 0.9985;
  }
  const fade = Math.min(n, samples(0.08));
  for (let i = 0; i < fade; i++) out[n - 1 - i]! *= i / fade;
  return lowpass(out, 3600);
}

/** A round bass note: a sine with a touch of second harmonic and a short pluck. */
function bassNote(freq: number, hold: number, vel: number): Buf {
  const n = samples(hold + 0.15);
  const tone = sum(osc('sine', freq, n), gain(osc('sine', freq * 2, n), 0.3));
  const env = decayEnv(n, 0.8);
  for (let i = samples(hold); i < n; i++) env[i]! *= Math.max(0, 1 - (i - samples(hold)) / samples(0.15));
  return mul(gain(tone, vel), env);
}

/** An upright-bass note: triangle body plus a fingered click. */
function uprightNote(rng: Rng, freq: number, hold: number, vel: number): Buf {
  const n = samples(hold + 0.2);
  const body = lowpass(sum(osc('triangle', freq, n), gain(osc('sine', freq * 2, n), 0.25)), 650);
  const env = decayEnv(n, 0.55);
  for (let i = samples(hold); i < n; i++) env[i]! *= Math.max(0, 1 - (i - samples(hold)) / samples(0.2));
  const click = mul(biquad(whiteNoise(rng, n), 'bp', 1400, 2), decayEnv(n, 0.012));
  return gain(sum(mul(body, env), gain(click, 0.25)), vel);
}

const kick = (vel: number): Buf => mul(gain(glideBuf(115, 46, 0.3, 'exp'), vel), decayEnv(samples(0.3), 0.22));
const hat = (rng: Rng, vel: number): Buf =>
  mul(gain(highpass(biquad(whiteNoise(rng, samples(0.07)), 'hp', 6500, 0.7), 5000), vel), decayEnv(samples(0.07), 0.05));
const rim = (rng: Rng, vel: number): Buf =>
  gain(
    sum(
      mul(biquad(whiteNoise(rng, samples(0.05)), 'bp', 1900, 3), decayEnv(samples(0.05), 0.03)),
      gain(mul(osc('sine', 480, samples(0.05)), decayEnv(samples(0.05), 0.035)), 0.5),
    ),
    vel,
  );
const brush = (rng: Rng, vel: number): Buf => {
  const n = samples(0.28);
  const shush = mul(biquad(whiteNoise(rng, n), 'bp', 3400, 0.8), adsr(0.02, 0.025, 0.1, 0.3, 0.14));
  const thump = mul(osc('sine', 190, n), decayEnv(n, 0.08));
  return gain(sum(shush, gain(thump, 0.25)), vel);
};

// ---- Track assembly ----------------------------------------------------------

interface Track {
  bpm: number;
  /** Where the off-beat eighth falls inside its beat: 0.5 is straight, 0.66 is a full triplet swing. */
  swing: number;
  /** The chord of every bar of the loop, in order. */
  bars: Bar[];
  /** Length in bars of one chord cycle; melodies are generated per distinct cycle. */
  cycle: number;
  seed: number;
}

class Mixer {
  readonly out: Buf;
  readonly beatSec: number;
  constructor(
    readonly rng: Rng,
    readonly track: Track,
  ) {
    this.beatSec = 60 / track.bpm;
    this.out = zeros(samples(track.bars.length * 4 * this.beatSec));
  }

  /** Beat position with swing applied to off-beat eighths. */
  swung(beat: number): number {
    const frac = beat - Math.floor(beat);
    return Math.abs(frac - 0.5) < 0.05 ? beat + (this.track.swing - 0.5) : beat;
  }

  /** Adds a sound at a bar and beat, with a little human timing drift. */
  put(buf: Buf, barIndex: number, beat: number, level: number, drift = 0.006): void {
    const seconds = (barIndex * 4 + this.swung(beat)) * this.beatSec + (this.rng() - 0.5) * 2 * drift;
    addWrap(this.out, buf, seconds * SR, level);
  }

  /** Vinyl crackle and hiss, then the shared tone shaping with reverb that wraps around the loop. */
  master(rmsDb: number, crackle: number, cutoff: number, wet: number): Buf {
    const n = this.out.length;
    const pops = zeros(n);
    for (let i = 0; i < n * (14 / SR); i++) {
      const len = samples(range(this.rng, 0.0008, 0.003));
      const pop = decayEnv(len, 0.002);
      addWrap(pops, pop, this.rng() * n, this.rng() ** 3 * crackle * (this.rng() < 0.5 ? 1 : -1));
    }
    const hiss = gain(lowpass(whiteNoise(this.rng, n), 5500), crackle * 0.12);
    const shaped = circular(this.out, (d) => reverb(lowpass(highpass(d, 55), cutoff), wet, 0.55, 3000));
    const warm = saturate(sum(shaped, pops, hiss), 1.35);
    return finish(warm, rmsDb, -4);
  }
}

/** Plays a drum pattern: positions are in beats within the bar. */
function drums(m: Mixer, pattern: { kick: number[]; rim: number[]; brush: number[]; hat: number[] }, bars: number, fillBar = -1): void {
  for (let b = 0; b < bars; b++) {
    for (const p of pattern.kick) m.put(kick(range(m.rng, 0.5, 0.7)), b, p, 1);
    if (b === fillBar) m.put(kick(0.45), b, 3.5, 1);
    for (const p of pattern.rim) m.put(rim(m.rng, range(m.rng, 0.35, 0.55)), b, p, 1);
    for (const p of pattern.brush) m.put(brush(m.rng, range(m.rng, 0.3, 0.45)), b, p, 1);
    for (const p of pattern.hat) m.put(hat(m.rng, p % 1 === 0.5 ? range(m.rng, 0.12, 0.22) : range(m.rng, 0.22, 0.34)), b, p, 1);
  }
}

const EIGHTHS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
const QUARTERS = [0, 1, 2, 3];

/** The notes of a chord as frequencies, with a small strum between them. */
function strum(m: Mixer, notes: number[], barIndex: number, beat: number, hold: number, level: number): void {
  notes.forEach((n, i) => m.put(ePiano(midiHz(n), hold, range(m.rng, 0.35, 0.5)), barIndex, beat + i * 0.012, level, 0.003));
}

function bassMidi(root: number): number {
  let n = 36 + root;
  if (n < 38) n += 12;
  return n;
}

// ---- The three tracks --------------------------------------------------------

const cycleA = (kinds: [number, Kind][]): Bar[] => kinds.map(([r, k]) => bar(r, k));

/** Warm electric-piano chords over a soft bass and brushed drums, 72 BPM with a light swing. */
export function renderLofiDay(): Buf {
  const A1 = cycleA([[C, 'maj7'], [A, 'm7'], [D, 'm7'], [G, 'dom7']]);
  const B1 = cycleA([[F, 'maj7'], [E, 'm7'], [D, 'm7'], [G, 'dom7']]);
  const track: Track = { bpm: 72, swing: 0.6, bars: [...A1, ...A1, ...B1], cycle: 4, seed: 11 };
  const rng = makeRng(track.seed);
  const m = new Mixer(rng, track);
  const voicings = voiceLead(track.bars);
  const scale = [0, 2, 4, 7, 9, 11];

  track.bars.forEach((b, i) => {
    strum(m, voicings[i]!, i, 0, 1.7, 0.5);
    strum(m, voicings[i]!.slice(1), i, 2.5, 1.2, 0.3);
    const root = bassMidi(b.root);
    m.put(bassNote(midiHz(root), 1.6, 0.8), i, 0, 0.55);
    m.put(bassNote(midiHz(root + (i % 2 ? 12 : 7)), 1.0, 0.7), i, 2.5, 0.45);
  });
  const motifs = [melody(A1, makeRng(31), scale, 72, 86, [3]), melody(B1, makeRng(32), scale, 72, 86, [2, 3])];
  [0, 1, 2].forEach((cycle) => {
    const motif = motifs[cycle === 2 ? 1 : 0]!;
    for (const note of motif) m.put(ePiano(midiHz(note.midi), note.beats * m.beatSec, 0.5), cycle * 4 + note.bar, note.beat, 0.34);
  });
  drums(m, { kick: [0, 2.5], rim: [1, 3], brush: [], hat: EIGHTHS }, 12, 11);
  return m.master(-20, 0.05, 4600, 0.2);
}

/** Slow minor chords on a pad with sparse bells, 64 BPM. */
export function renderLofiNight(): Buf {
  const A1 = cycleA([[A, 'm7'], [F, 'maj7'], [C, 'maj7'], [G, 'six']]);
  const B1 = cycleA([[A, 'm7'], [D, 'm7'], [F, 'maj7'], [E, 'dom7']]);
  const track: Track = { bpm: 64, swing: 0.56, bars: [...A1, ...A1, ...B1], cycle: 4, seed: 22 };
  const rng = makeRng(track.seed);
  const m = new Mixer(rng, track);
  const voicings = voiceLead(track.bars);
  const scale = [9, 11, 0, 2, 4, 5, 7].map((p) => p % 12);

  track.bars.forEach((b, i) => {
    for (const n of voicings[i]!) m.put(padNote(midiHz(n), 3.6, 0.5), i, 0, 0.16, 0);
    m.put(bassNote(midiHz(bassMidi(b.root)), 3.4, 0.8), i, 0, 0.5, 0.004);
    if (i % 2 === 0) strum(m, voicings[i]!.slice(0, 3), i, 1, 2.2, 0.2);
  });
  const motifs = [melody(A1, makeRng(41), scale, 76, 93, [1, 3]), melody(B1, makeRng(42), scale, 76, 93, [1, 3])];
  [0, 1, 2].forEach((cycle) => {
    const motif = motifs[cycle === 2 ? 1 : 0]!;
    for (const note of motif) m.put(bellNote(midiHz(note.midi), 0.45), cycle * 4 + note.bar, note.beat, 0.2);
  });
  drums(m, { kick: [0], rim: [], brush: [2], hat: QUARTERS }, 12);
  return m.master(-22, 0.045, 3800, 0.32);
}

/** A bossa-flavoured loop: plucked guitar, upright bass and a swung hat, 80 BPM. */
export function renderLofiCafe(): Buf {
  const A1 = cycleA([[D, 'm7'], [G, 'dom7'], [C, 'maj7'], [A, 'dom7']]);
  const B1 = cycleA([[D, 'm7'], [G, 'dom7'], [E, 'm7'], [A, 'dom7']]);
  const track: Track = { bpm: 80, swing: 0.64, bars: [...A1, ...A1, ...B1, ...A1], cycle: 4, seed: 33 };
  const rng = makeRng(track.seed);
  const m = new Mixer(rng, track);
  const voicings = voiceLead(track.bars);
  const scale = [0, 2, 4, 5, 7, 9, 11];
  const picking: [number, number][] = [[0.5, 0], [1, 1], [1.5, 2], [2.5, 3], [3, 2], [3.5, 1]];

  track.bars.forEach((b, i) => {
    const root = bassMidi(b.root);
    m.put(uprightNote(rng, midiHz(root), 1.3, 0.85), i, 0, 0.6);
    m.put(uprightNote(rng, midiHz(root + 7), 1.2, 0.75), i, 2, 0.5);
    const v = voicings[i]!;
    for (const [beat, which] of picking) m.put(pluck(rng, midiHz(v[which]! + 12), range(rng, 0.35, 0.55)), i, beat, 0.32);
  });
  const motifs = [melody(A1, makeRng(51), scale, 74, 88, [1, 3]), melody(B1, makeRng(52), scale, 74, 88, [1, 2])];
  [0, 1, 2, 3].forEach((cycle) => {
    const motif = motifs[cycle === 2 ? 1 : 0]!;
    for (const note of motif) m.put(ePiano(midiHz(note.midi), note.beats * m.beatSec, 0.45), cycle * 4 + note.bar, note.beat, 0.26);
  });
  drums(m, { kick: [0, 2], rim: [1, 3], brush: [], hat: EIGHTHS }, 16, 15);
  return m.master(-20, 0.05, 4800, 0.18);
}

export const MUSIC = {
  music_lofi_day: renderLofiDay,
  music_lofi_night: renderLofiNight,
  music_lofi_cafe: renderLofiCafe,
} as const;
