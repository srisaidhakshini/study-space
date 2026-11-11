import { PixelCanvas } from '../png';
import { SR, type Buf } from './dsp';

const COLUMNS = 400;
const BINS = 64;
const WINDOW = 512;
const COLUMN_PX = 2;
const BIN_PX = 3;
const WAVE_PX = 48;

/** Energy at one frequency in a window (Goertzel). */
function energy(x: Buf, start: number, freq: number): number {
  const w = (2 * Math.PI * freq) / SR;
  const coeff = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < WINDOW; i++) {
    const v = x[(start + i) % x.length]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / WINDOW));
    const s0 = v + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / WINDOW;
}

const RAMP = ['#2a1b2e', '#4a2f3a', '#7a2f3f', '#b04a4a', '#d9765a', '#f0c552', '#fbe68e', '#fbf5ea'];

/** A picture of a sound: its waveform on top, and below it a time/frequency heat map (low pitch at the bottom). */
export function renderSpectrogram(x: Buf): PixelCanvas {
  const width = COLUMNS * COLUMN_PX;
  const canvas = new PixelCanvas(width, WAVE_PX + BINS * BIN_PX);
  canvas.rect(0, 0, width, canvas.height, '#2a1b2e');
  const freqs = Array.from({ length: BINS }, (_v, i) => 70 * (10500 / 70) ** (i / (BINS - 1)));
  const step = x.length / COLUMNS;

  const peaks: number[] = [];
  for (let c = 0; c < COLUMNS; c++) {
    const from = Math.floor(c * step);
    const to = Math.floor((c + 1) * step);
    let p = 0;
    for (let i = from; i < to; i++) p = Math.max(p, Math.abs(x[i]!));
    peaks.push(p);
  }
  const top = Math.max(...peaks, 1e-6);
  for (let c = 0; c < COLUMNS; c++) {
    const h = Math.max(1, Math.round((peaks[c]! / top) * (WAVE_PX / 2 - 2)));
    canvas.rect(c * COLUMN_PX, WAVE_PX / 2 - h, COLUMN_PX, h * 2, '#a9c466');
  }

  const grid: number[][] = [];
  let max = 1e-9;
  for (let c = 0; c < COLUMNS; c++) {
    const start = Math.floor(c * step);
    const column = freqs.map((f) => energy(x, start, f));
    for (const e of column) max = Math.max(max, e);
    grid.push(column);
  }
  for (let c = 0; c < COLUMNS; c++) {
    for (let b = 0; b < BINS; b++) {
      const level = Math.min(1, Math.max(0, (20 * Math.log10(Math.max(grid[c]![b]! / max, 1e-5)) + 60) / 60));
      const color = RAMP[Math.min(RAMP.length - 1, Math.floor(level * RAMP.length))]!;
      canvas.rect(c * COLUMN_PX, WAVE_PX + (BINS - 1 - b) * BIN_PX, COLUMN_PX, BIN_PX, color);
    }
  }
  return canvas;
}
