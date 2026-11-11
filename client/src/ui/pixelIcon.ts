import { h } from './dom';

const INK = '#2a1b2e';

/** Draws character rows as a pixel-art canvas with a one-pixel dark outline. */
function draw(rows: string[], legend: Record<string, string>, scale: number, label: string): HTMLCanvasElement {
  const w = rows[0]!.length;
  const rowsCount = rows.length;
  const canvas = h('canvas', {
    class: 'pixel-icon',
    attrs: { width: (w + 2) * scale, height: (rowsCount + 2) * scale, role: 'img', 'aria-label': label },
  });
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const filled = (x: number, y: number): boolean => x >= 0 && y >= 0 && y < rowsCount && x < w && legend[rows[y]![x]!] !== undefined;
  for (let y = -1; y <= rowsCount; y++) {
    for (let x = -1; x <= w; x++) {
      const color = filled(x, y) ? legend[rows[y]![x]!] : filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1) ? INK : null;
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect((x + 1) * scale, (y + 1) * scale, scale, scale);
    }
  }
  return canvas;
}

/** A gold focus coin. */
export function coinIcon(scale = 2): HTMLCanvasElement {
  return draw(
    ['.yyyyyy.', 'yYYyyyyo', 'yYyccyyo', 'yYycyyyo', 'yYyccyyo', 'yyyycyyo', 'yyyyyyoo', '.oooooo.'],
    { y: '#f0c552', Y: '#fbe68e', o: '#d99a3a', c: '#d99a3a' },
    scale,
    'Coins',
  );
}

/** A small flame for streaks. */
export function flameIcon(scale = 2): HTMLCanvasElement {
  return draw(
    ['...r....', '...rr...', '..rrr...', '.rrorr..', '.rooorr.', 'rrooyorr', 'rooyyoor', 'rooyyoor', '.rooyoo.', '..rrrr..'],
    { r: '#d9765a', o: '#eda67a', y: '#f0c552' },
    scale,
    'Streak',
  );
}
