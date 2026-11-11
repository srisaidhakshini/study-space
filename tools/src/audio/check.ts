/**
 * Renders every sound and checks it without listening:  npm run check:audio -w tools
 * Asserts no clipping, no DC offset, a click-free loop seam, a sane level and
 * length, prints a table, and writes a spectrogram per sound to tools/preview/.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_AUDIO } from './areaSounds';
import { SR, dcOffset, makeLoopable, makeRng, peak, rms, seamRatio, toDb, zeros } from './dsp';
import { renderSpectrogram } from './spectrogram';

const PREVIEW = join(resolve(dirname(fileURLToPath(import.meta.url)), '../..'), 'preview');

const problems: string[] = [];
const fail = (message: string): void => {
  problems.push(message);
};

// The seam test itself must be able to tell a click from a clean loop.
{
  const rng = makeRng(5);
  const walk = zeros(SR * 3);
  let v = 0;
  for (let i = 0; i < walk.length; i++) {
    v += (rng() - 0.5) * 0.02;
    walk[i] = v;
  }
  const raw = seamRatio(walk);
  const fixed = seamRatio(makeLoopable(walk, 0.5));
  if (!(raw > 20)) fail(`self-test: the seam detector missed a real jump (${raw.toFixed(1)}x)`);
  if (!(fixed < 5)) fail(`self-test: makeLoopable left a jump of ${fixed.toFixed(1)}x`);
}

interface Limits {
  seconds: [number, number];
  rmsDb: [number, number];
}
const AMBIENCE: Limits = { seconds: [12, 24], rmsDb: [-40, -20] };
const MUSIC: Limits = { seconds: [30, 60], rmsDb: [-30, -15] };

const started = Date.now();
const rows: string[] = [];
let totalBytes = 0;
for (const [key, render] of Object.entries(ALL_AUDIO)) {
  const t0 = Date.now();
  const x = render();
  const seconds = x.length / SR;
  const limits = key.startsWith('music_') ? MUSIC : AMBIENCE;
  const p = peak(x);
  const level = toDb(rms(x));
  const dc = dcOffset(x);
  const seam = seamRatio(x);
  const kb = Math.round((x.length * 2 + 44) / 1024);
  totalBytes += kb * 1024;

  if (p > 0.7) fail(`${key}: peak ${p.toFixed(3)} is too hot`);
  if (p < 0.05) fail(`${key}: peak ${p.toFixed(3)} is nearly silent`);
  if (Math.abs(dc) > 0.002) fail(`${key}: DC offset ${dc.toFixed(5)}`);
  if (seam > 5) fail(`${key}: loop seam is ${seam.toFixed(1)}x the local movement (a click)`);
  if (seconds < limits.seconds[0] || seconds > limits.seconds[1]) fail(`${key}: length ${seconds.toFixed(1)}s is outside ${limits.seconds.join('-')}s`);
  if (level < limits.rmsDb[0] || level > limits.rmsDb[1]) fail(`${key}: RMS ${level.toFixed(1)} dB is outside ${limits.rmsDb.join(' to ')} dB`);
  if (x.some((s) => !Number.isFinite(s))) fail(`${key}: contains NaN or Infinity`);

  renderSpectrogram(x).save(join(PREVIEW, `audio_${key}.png`));
  rows.push(
    `${key.padEnd(18)} ${seconds.toFixed(1).padStart(5)}s ${String(kb).padStart(6)} KB  peak ${toDb(p).toFixed(1).padStart(6)} dB  rms ${level.toFixed(1).padStart(6)} dB  seam ${seam.toFixed(2)}x  ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
}

console.log(rows.join('\n'));
console.log(`\n${rows.length} sounds, ${(totalBytes / 1024 / 1024).toFixed(1)} MB, ${((Date.now() - started) / 1000).toFixed(1)}s to render and analyse.`);
if (totalBytes > 12 * 1024 * 1024) fail(`total size ${(totalBytes / 1024 / 1024).toFixed(1)} MB exceeds 12 MB`);
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('All audio checks passed.');
