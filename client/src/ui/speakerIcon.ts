import { h } from './dom';

const INK = '#2a1b2e';
const BODY = '#f5e3b5';
const WAVE = '#d9765a';

const SPEAKER = ['..oo...', '.oBo...', 'oBBo...', 'oBBo...', 'oBBo...', '.oBo...', '..oo...'];
const ON_WAVES = ['.....w..', '......w.', '.....w.w', '.....w.w', '.....w.w', '......w.', '.....w..'];
const OFF_CROSS = ['.......', '..x.x..', '...x...', '...x...', '...x...', '..x.x..', '.......'];

/** A tiny pixel speaker: sound waves when on, a cross when muted. */
export function speakerIcon(muted: boolean, scale = 2): HTMLCanvasElement {
  const width = 8;
  const canvas = h('canvas', {
    class: 'pixel-icon',
    attrs: { width: width * scale, height: SPEAKER.length * scale, 'aria-hidden': 'true' },
  });
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const paint = (rows: string[], colors: Record<string, string>): void => {
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const color = colors[ch];
        if (!color) return;
        ctx.fillStyle = color;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      });
    });
  };
  paint(SPEAKER, { o: INK, B: BODY });
  if (muted) paint(OFF_CROSS.map((r) => r.padEnd(width, '.')), { x: '#b04a4a' });
  else paint(ON_WAVES, { w: WAVE });
  return canvas;
}
