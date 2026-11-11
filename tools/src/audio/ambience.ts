import {
  SR,
  addWrap,
  biquad,
  circular,
  decayEnv,
  finish,
  gain,
  highpass,
  lfo,
  loopSine,
  lowpass,
  makeRng,
  mul,
  pick,
  range,
  reverb,
  samples,
  smoothRandom,
  sum,
  whiteNoise,
  zeros,
  type Buf,
  type Rng,
} from './dsp';

/** Every ambience is this long, and every modulator inside it has whole cycles, so it loops seamlessly. */
const SECONDS = 14;
const N = samples(SECONDS);

// ---- Building blocks ---------------------------------------------------------

/** A sine glide from f0 to f1 over `dur`, shaped as a decaying pluck or a rounded hump. */
function glide(f0: number, f1: number, dur: number, shape: 'decay' | 'hump', curve = 1): Buf {
  const n = samples(dur);
  const out = zeros(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    phase += (f0 + (f1 - f0) * t ** curve) / SR;
    const env = shape === 'decay' ? Math.exp(-5 * t) * Math.min(1, i / 40) : Math.sin(Math.PI * t) ** 2;
    out[i] = Math.sin(2 * Math.PI * phase) * env;
  }
  return out;
}

/** A struck-metal tone: a few inharmonic partials with different decay times. */
function bell(freq: number, t60: number): Buf {
  const parts: [number, number][] = [
    [1, 1],
    [2.76, 0.45],
    [5.4, 0.2],
  ];
  const n = samples(t60);
  const out = zeros(n);
  parts.forEach(([ratio, level], index) => {
    const env = decayEnv(n, t60 / (1 + index * 0.8));
    const phase = 2 * Math.PI * freq * ratio;
    for (let i = 0; i < n; i++) out[i]! += Math.sin((phase * i) / SR) * env[i]! * level;
  });
  return out;
}

/** Scatters `count` events at random moments (wrapping at the loop end). */
function scatter(dest: Buf, rng: Rng, count: number, make: () => Buf, level: () => number): void {
  for (let i = 0; i < count; i++) addWrap(dest, make(), rng() * dest.length, level());
}

/** Filtered noise that loops seamlessly. */
function band(rng: Rng, type: 'lp' | 'hp' | 'bp', freq: number, q = 0.7): Buf {
  return circular(whiteNoise(rng, N), (d) => biquad(d, type, freq, q));
}

/** A short bird phrase: a few chirps with random pitch glides. */
function birdPhrase(rng: Rng, base: number): Buf {
  const parts: { at: number; buf: Buf }[] = [];
  let at = 0;
  const count = 2 + Math.floor(rng() * 4);
  for (let i = 0; i < count; i++) {
    const f0 = base * range(rng, 0.85, 1.25);
    const f1 = f0 * range(rng, 0.7, 1.45);
    const dur = range(rng, 0.05, 0.13);
    const tone = glide(f0, f1, dur, 'hump');
    const harm = glide(f0 * 2, f1 * 2, dur, 'hump');
    const buf = sum(tone, gain(harm, 0.25));
    parts.push({ at, buf });
    at += samples(dur + range(rng, 0.04, 0.12));
  }
  const out = zeros(at + samples(0.2));
  for (const p of parts) for (let i = 0; i < p.buf.length; i++) out[p.at + i]! += p.buf[i]!;
  return out;
}

/** A rapid trill of short pulses at one pitch. */
function trill(rng: Rng, freq: number, pulses: number): Buf {
  const gap = samples(0.045);
  const out = zeros(pulses * gap + samples(0.1));
  for (let p = 0; p < pulses; p++) {
    const pulse = glide(freq * (1 + p * 0.012), freq * (1.08 + p * 0.012), 0.035, 'hump');
    for (let i = 0; i < pulse.length; i++) out[p * gap + i]! += pulse[i]! * (0.6 + 0.4 * rng());
  }
  return out;
}

/** A sparse "distant" treatment for birds and chimes: rolled-off highs and a little space. */
function distant(x: Buf, wet = 0.25): Buf {
  return circular(x, (d) => reverb(lowpass(d, 5200), wet, 0.55));
}

/** A voice-like murmur: a buzz through moving vowel formants, gated in speech-like bursts. */
function murmurVoice(rng: Rng): Buf {
  const cycles = Math.round(range(rng, 115, 215) * SECONDS);
  const m1 = 2 + Math.floor(rng() * 4);
  const m2 = 7 + Math.floor(rng() * 6);
  const p1 = rng();
  const p2 = rng();
  const buzz = zeros(N);
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const phase = cycles * t + 2.5 * Math.sin(2 * Math.PI * (m1 * t + p1)) + 0.4 * Math.sin(2 * Math.PI * (m2 * t + p2));
    const p = phase - Math.floor(phase);
    buzz[i] = 2 * p - 1;
  }
  const vowels: [number, number][] = [
    [700, 1200],
    [450, 2000],
    [500, 900],
  ];
  const weights = vowels.map(() => smoothRandom(rng, N, 3.5));
  const total = vowels.map((_v, k) => {
    const [f1, f2] = vowels[k]!;
    const voiced = circular(buzz, (d) => sum(biquad(d, 'bp', f1, 3), gain(biquad(d, 'bp', f2, 4), 0.6)));
    return mul(voiced, weights[k]!);
  });
  const syllables = smoothRandom(rng, N, 4.5);
  const phrases = smoothRandom(rng, N, 0.45);
  const gate = zeros(N);
  for (let i = 0; i < N; i++) {
    const s = Math.min(1, Math.max(0, (syllables[i]! - 0.35) / 0.3));
    const p = Math.min(1, Math.max(0, (phrases[i]! - 0.5) / 0.15));
    gate[i] = s * p;
  }
  return mul(sum(...total), gate);
}

// ---- Places ------------------------------------------------------------------

/** Soft wind, distant birds and a faint leaf rustle. */
export function renderTown(): Buf {
  const rng = makeRng(101);
  const wind = mul(band(rng, 'lp', 420, 0.7), sum(gain(lfo(N, 3), 0.5), gain(smoothRandom(rng, N, 0.4), 0.5)));
  const whoosh = mul(band(rng, 'bp', 1100, 0.6), gain(smoothRandom(rng, N, 0.3), 0.5));
  const rustle = mul(band(rng, 'bp', 4200, 1.2), gain(smoothRandom(rng, N, 1.6), 0.25));
  const birds = zeros(N);
  scatter(birds, rng, 6, () => birdPhrase(rng, pick(rng, [2600, 3200, 3900])), () => range(rng, 0.1, 0.22));
  return finish(sum(gain(wind, 1.0), gain(whoosh, 0.35), gain(rustle, 0.25), distant(birds)), -24);
}

/** Very quiet room tone, a slow clock, page rustles and a soft hush. */
export function renderLibrary(): Buf {
  const rng = makeRng(202);
  const tone = sum(gain(band(rng, 'lp', 220, 0.7), 1), gain(band(rng, 'bp', 700, 0.7), 0.12));
  const hush = mul(band(rng, 'bp', 1300, 0.5), gain(smoothRandom(rng, N, 0.25), 0.12));
  const ticks = zeros(N);
  for (let s = 0; s < SECONDS; s++) {
    const pitch = s % 2 === 0 ? 1700 : 1300;
    const click = sum(
      mul(biquad(whiteNoise(rng, samples(0.05)), 'bp', pitch, 4), decayEnv(samples(0.05), 0.02)),
      gain(mul(loopSine(pitch * 0.5, samples(0.05)), decayEnv(samples(0.05), 0.03)), 0.5),
    );
    addWrap(ticks, click, s * SR, 0.9);
  }
  const pages = zeros(N);
  for (const at of [4.2, 11.3]) {
    const len = samples(0.7);
    const grains = zeros(len);
    for (let g = 0; g < 38; g++) {
      const grain = mul(biquad(whiteNoise(rng, samples(0.012)), 'bp', range(rng, 1800, 5200), 1.5), decayEnv(samples(0.012), 0.008));
      const pos = Math.floor(rng() * (len - grain.length));
      const hump = Math.sin((Math.PI * pos) / len);
      for (let i = 0; i < grain.length; i++) grains[pos + i]! += grain[i]! * hump * range(rng, 0.4, 1);
    }
    addWrap(pages, grains, at * SR, 0.9);
  }
  return finish(sum(tone, hush, gain(ticks, 0.5), pages), -31);
}

/** Warm murmur of voices, cup clinks and an occasional espresso hiss. */
export function renderCafe(): Buf {
  const rng = makeRng(303);
  const voices = sum(...Array.from({ length: 6 }, () => murmurVoice(rng)));
  const room = circular(voices, (d) => reverb(lowpass(d, 2800), 0.3, 0.45));
  const clinks = zeros(N);
  scatter(
    clinks,
    rng,
    5,
    () => sum(bell(range(rng, 2900, 3500), 0.18), gain(bell(range(rng, 4600, 5400), 0.1), 0.5)),
    () => range(rng, 0.05, 0.12),
  );
  const hissLen = samples(1.8);
  const hiss = mul(biquad(whiteNoise(rng, hissLen), 'hp', 4500, 0.7), lfo(hissLen, 1, -0.25));
  const gurgle = mul(biquad(whiteNoise(rng, hissLen), 'bp', 260, 3), lfo(hissLen, 1, -0.25));
  const machine = zeros(N);
  addWrap(machine, sum(gain(hiss, 0.5), gain(gurgle, 0.6)), 9.5 * SR, 0.12);
  const bed = band(rng, 'lp', 300, 0.7);
  return finish(sum(gain(room, 1), gain(distant(clinks, 0.35), 1), machine, gain(bed, 0.03)), -24);
}

/** A fridge hum, a kettle simmering and the odd cupboard tick. */
export function renderKitchen(): Buf {
  const rng = makeRng(404);
  const hum = sum(loopSine(100, N), gain(loopSine(200, N, 0.1), 0.5), gain(loopSine(300, N, 0.3), 0.18));
  const humWobble = mul(hum, sum(gain(lfo(N, 2), 0.15), gain(zeros(N).fill(1), 0.85)));
  const swell = smoothRandom(rng, N, 0.2);
  const simmer = mul(band(rng, 'bp', 3800, 0.9), gain(swell, 0.6));
  const bubbles = zeros(N);
  for (let i = 0; i < 280; i++) {
    const at = Math.floor(rng() * N);
    if (rng() > 0.3 + swell[at]! * 0.7) continue;
    const f = range(rng, 260, 760);
    addWrap(bubbles, glide(f, f * range(rng, 1.3, 2), range(rng, 0.02, 0.045), 'decay'), at, range(rng, 0.2, 0.55));
  }
  const knocks = zeros(N);
  for (const at of [5.1, 12.4]) {
    const len = samples(0.12);
    const knock = sum(
      mul(loopSine(180, len), decayEnv(len, 0.07)),
      gain(mul(biquad(whiteNoise(rng, len), 'bp', 900, 2), decayEnv(len, 0.02)), 0.6),
    );
    addWrap(knocks, knock, at * SR, 0.6);
  }
  return finish(sum(gain(humWobble, 0.4), gain(simmer, 0.35), gain(bubbles, 0.35), knocks), -24);
}

/** Layered birdsong, a light breeze, crickets and a drifting bee. */
export function renderGarden(): Buf {
  const rng = makeRng(505);
  const birds = zeros(N);
  scatter(birds, rng, 8, () => birdPhrase(rng, pick(rng, [2400, 2900, 3500, 4200])), () => range(rng, 0.12, 0.25));
  scatter(birds, rng, 3, () => trill(rng, pick(rng, [3000, 3600]), 6 + Math.floor(rng() * 8)), () => range(rng, 0.1, 0.18));
  const breeze = mul(band(rng, 'bp', 700, 0.5), sum(gain(lfo(N, 2), 0.4), gain(smoothRandom(rng, N, 0.35), 0.6)));
  const crickets = zeros(N);
  for (let g = 0; g < 32; g++) {
    const burst = zeros(samples(0.16));
    for (let p = 0; p < 3; p++) {
      const pulse = mul(loopSine(4700 + (g % 3) * 90, samples(0.022)), decayEnv(samples(0.022), 0.018));
      for (let i = 0; i < pulse.length; i++) burst[p * samples(0.04) + i]! += pulse[i]!;
    }
    addWrap(crickets, burst, (g / 32) * N + rng() * 2000, 0.03 + 0.02 * rng());
  }
  const beeEnv = sum(gain(smoothRandom(rng, N, 0.2), 0.6), gain(lfo(N, 1), 0.4)).map((v) => v * v) as Buf;
  const bee = mul(lowpass(beeBuzz(), 700), beeEnv);
  return finish(sum(distant(birds, 0.2), gain(breeze, 0.4), crickets, gain(bee, 0.07)), -24);
}

/** A buzzing saw near 190 Hz with a wobble, periodic over the loop. */
function beeBuzz(): Buf {
  const cycles = Math.round(190 * SECONDS);
  const out = zeros(N);
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const phase = cycles * t + 0.6 * Math.sin(2 * Math.PI * 3 * t);
    out[i] = 2 * (phase - Math.floor(phase)) - 1;
  }
  return out;
}

/** Gentle flowing water: modulated noise bands and small bubbles. */
export function renderRiver(): Buf {
  const rng = makeRng(606);
  const bands: [number, number, number][] = [
    [380, 0.5, 1],
    [900, 0.7, 0.7],
    [1900, 0.8, 0.5],
    [3600, 1.0, 0.3],
  ];
  const flow = sum(
    ...bands.map(([freq, q, level], i) => mul(band(rng, 'bp', freq, q), gain(smoothRandom(rng, N, 0.9 + i * 0.7), 0.7)).map((v) => v * level) as Buf),
  );
  const bubbles = zeros(N);
  for (let i = 0; i < 160; i++) {
    const f = range(rng, 700, 2300);
    addWrap(bubbles, glide(f, f * range(rng, 1.4, 2.2), range(rng, 0.02, 0.05), 'decay'), rng() * N, range(rng, 0.05, 0.2));
  }
  return finish(sum(flow, bubbles, gain(band(rng, 'lp', 160, 0.7), 0.4)), -24);
}

/** A soft magical shimmer: a detuned pad with tremolo and sparkling chimes. */
export function renderPortal(): Buf {
  const rng = makeRng(707);
  const notes = [110, 164.8, 220, 277.2, 329.6];
  const pad = sum(
    ...notes.map((f, i) => {
      const tone = sum(loopSine(f, N, i * 0.13), gain(loopSine(f * 1.004, N, i * 0.31), 0.7));
      return mul(tone, sum(gain(lfo(N, 2 + (i % 3), i * 0.21), 0.5), gain(zeros(N).fill(1), 0.5)));
    }),
  );
  const shimmer = mul(band(rng, 'hp', 5000, 0.7), gain(smoothRandom(rng, N, 0.6), 0.15));
  const chimes = zeros(N);
  const scale = [880, 1108.7, 1318.5, 1480, 1760, 2217];
  scatter(chimes, rng, 6, () => bell(pick(rng, scale), 2.4), () => range(rng, 0.08, 0.16));
  const mixed = circular(sum(gain(pad, 0.14), shimmer, chimes), (d) => reverb(d, 0.4, 0.7));
  return finish(mixed, -25);
}

/** High wind, far-off chimes and a faint windmill creak. */
export function renderSky(): Buf {
  const rng = makeRng(808);
  const wind = sum(
    mul(band(rng, 'bp', 1500, 0.8), sum(gain(lfo(N, 2), 0.5), gain(smoothRandom(rng, N, 0.3), 0.5))),
    gain(mul(band(rng, 'bp', 3200, 1), gain(smoothRandom(rng, N, 0.5), 0.5)), 0.4),
  );
  const chimes = zeros(N);
  const set = [1568, 1976, 2349, 2637, 3136];
  for (const start of [3.2, 10.6]) {
    for (let k = 0; k < 4; k++) addWrap(chimes, bell(pick(rng, set), 1.3), (start + k * range(rng, 0.1, 0.3)) * SR, range(rng, 0.1, 0.18));
  }
  const blade = lfo(N, 8).map((v) => v ** 8) as Buf;
  const creakCarrier = mul(band(rng, 'bp', 680, 6), gain(blade, 1));
  const creak = sum(creakCarrier, gain(mul(loopSine(70, N), gain(blade, 0.3)), 0.4));
  return finish(sum(wind, circular(chimes, (d) => reverb(lowpass(d, 6500), 0.3, 0.6)), gain(creak, 0.12)), -24);
}

/** Deep muffled rumble, slow rising bubbles and a rare low whale-like sweep. */
export function renderDome(): Buf {
  const rng = makeRng(909);
  const rumble = sum(gain(band(rng, 'lp', 110, 0.7), 1), gain(loopSine(45, N), 0.3), gain(mul(loopSine(62, N), lfo(N, 3)), 0.2));
  const bubbles = zeros(N);
  for (let column = 0; column < 7; column++) {
    const start = rng() * N;
    const count = 3 + Math.floor(rng() * 4);
    for (let b = 0; b < count; b++) {
      const f = range(rng, 350, 700) * (1 + b * 0.12);
      addWrap(bubbles, glide(f, f * 1.7, range(rng, 0.05, 0.09), 'decay'), start + b * range(rng, 0.25, 0.5) * SR, range(rng, 0.1, 0.22));
    }
  }
  const whaleLen = samples(4.5);
  const whale = zeros(whaleLen);
  let phase = 0;
  for (let i = 0; i < whaleLen; i++) {
    const t = i / whaleLen;
    const f = 190 - 95 * t + 8 * Math.sin(2 * Math.PI * 4 * t);
    phase += f / SR;
    whale[i] = (Math.sin(2 * Math.PI * phase) + 0.3 * Math.sin(4 * Math.PI * phase)) * Math.sin(Math.PI * t) ** 2;
  }
  const calls = zeros(N);
  addWrap(calls, whale, 6.5 * SR, 0.35);
  const softBubbles = circular(bubbles, (d) => lowpass(d, 1600));
  const muffled = circular(sum(rumble, gain(softBubbles, 0.7), calls), (d) => reverb(lowpass(d, 700), 0.35, 0.7, 1800));
  return finish(muffled, -23);
}

/** A steady, non-tonal rain bed with a patter of drops and a few close plinks. */
export function renderRain(): Buf {
  const rng = makeRng(1001);
  const bed = sum(
    mul(band(rng, 'bp', 3400, 0.35), gain(smoothRandom(rng, N, 2.5), 0.15)),
    gain(highpass(band(rng, 'lp', 8800, 0.7), 600), 0.6),
    gain(band(rng, 'lp', 900, 0.7), 0.3),
  );
  const patter = zeros(N);
  for (let i = 0; i < SECONDS * 140; i++) {
    const len = samples(0.012);
    const drop = mul(biquad(whiteNoise(rng, len), 'bp', range(rng, 1500, 6000), 2.5), decayEnv(len, 0.01));
    addWrap(patter, drop, rng() * N, range(rng, 0.1, 0.5));
  }
  const plinks = zeros(N);
  for (let i = 0; i < 7; i++) {
    const f = range(rng, 1200, 2600);
    addWrap(plinks, glide(f * 1.3, f, range(rng, 0.03, 0.06), 'decay'), rng() * N, range(rng, 0.08, 0.16));
  }
  return finish(sum(bed, patter, plinks), -24);
}

export const AMBIENCE = {
  amb_town: renderTown,
  amb_library: renderLibrary,
  amb_cafe: renderCafe,
  amb_kitchen: renderKitchen,
  amb_garden: renderGarden,
  amb_river: renderRiver,
  amb_portal: renderPortal,
  amb_sky: renderSky,
  amb_dome: renderDome,
  amb_rain: renderRain,
} as const;
