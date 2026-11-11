import { BREAK_ICON, SUBJECTS } from '@study/shared';
import { PAL, withAlpha } from './palette';
import { PixelCanvas } from './png';

const ICON = 10;

const LEGEND: Record<string, string> = {
  k: PAL.ink,
  w: PAL.cream,
  r: PAL.coral,
  b: PAL.water,
  g: PAL.leaf,
  y: PAL.gold,
  p: PAL.plum,
  s: PAL.slate,
};

/** Subject icons, in the order of SUBJECTS, followed by the break cup. */
const ICONS: Record<string, string[]> = {
  general: [
    '.......kk.',
    '......kyyk',
    '.....kyyk.',
    '....kyyk..',
    '...kyyk...',
    '..kyyk....',
    '.kwyk.....',
    '.kwk......',
    '.kk.......',
  ],
  math: [
    '..........',
    '..r.......',
    '.rrr..bbb.',
    '..r.......',
    '..........',
    '..........',
    '.g.g..yyy.',
    '..g.......',
    '.g.g..yyy.',
  ],
  science: [
    '...kkkk...',
    '....kk....',
    '....kk....',
    '....kk....',
    '...kggk...',
    '..kggggk..',
    '.kggwgggk.',
    '.kggggggk.',
    '.kkkkkkkk.',
  ],
  languages: [
    '..........',
    '....rr....',
    '...r..r...',
    '...r..r...',
    '..rrrrrr..',
    '..r....r..',
    '..r....r..',
    '..........',
    '.bbbbbbbb.',
  ],
  history: [
    '.kkkkkkkk.',
    '..kyyyyk..',
    '...kyyk...',
    '....kk....',
    '....kk....',
    '...k..k...',
    '..k.yy.k..',
    '..kyyyyk..',
    '.kkkkkkkk.',
  ],
  art: [
    '...kkkkk..',
    '..kwwwwwk.',
    '.kwrwwbwwk',
    '.kwwwwwwwk',
    '.kwgwwkkwk',
    '.kwwwwkkwk',
    '..kwywwwk.',
    '...kkkkk..',
  ],
  coding: [
    '..........',
    '.....k....',
    '..k..k.k..',
    '.k...k..k.',
    'k...k....k',
    '.k..k...k.',
    '..k.k..k..',
    '....k.....',
  ],
  reading: [
    '..........',
    '.kkk..kkk.',
    'kwwwkkwwwk',
    'kwwwkkwwwk',
    'kwwwkkwwwk',
    'kwwwkkwwwk',
    'kkkkkkkkkk',
    '.bbbbbbbb.',
  ],
  music: [
    '....kkkkk.',
    '....k...k.',
    '....k...k.',
    '....k...k.',
    '....k...k.',
    '..ppk.ppk.',
    '.pppk.ppk.',
    '.ppp..pp..',
  ],
  break: [
    '..s...s...',
    '...s...s..',
    '..s...s...',
    '..........',
    '.kkkkkkk..',
    '.kwwwwwkk.',
    '.kwwwwwk.k',
    '.kwwwwwkk.',
    '..kkkkk...',
  ],
};

export function renderSubjectIcons(): PixelCanvas {
  const sheet = new PixelCanvas(ICON * (BREAK_ICON + 1), ICON);
  for (const subject of SUBJECTS) {
    const rows = ICONS[subject.id];
    if (!rows) throw new Error(`No icon drawn for subject "${subject.id}"`);
    sheet.pattern(subject.icon * ICON, 0, rows, LEGEND);
  }
  sheet.pattern(BREAK_ICON * ICON, 0, ICONS.break!, LEGEND);
  return sheet;
}

/** Soft drop shadow placed under every character. */
export function renderShadow(): PixelCanvas {
  const c = new PixelCanvas(18, 7);
  c.ellipse(8.5, 3, 8.5, 3, withAlpha(PAL.ink, 0.28));
  return c;
}

/** Footstep dust: four 8x8 frames, growing and fading. */
export function renderDust(): PixelCanvas {
  const c = new PixelCanvas(32, 8);
  for (let i = 0; i < 4; i++) {
    const color = withAlpha(PAL.fog, 0.85 - i * 0.2);
    c.ellipse(i * 8 + 3.5, 5 - i * 0.5, 1 + i * 0.7, 1 + i * 0.5, color);
  }
  return c;
}

/** Thought bubble that holds a subject icon. */
export function renderBubble(): PixelCanvas {
  const c = new PixelCanvas(18, 19);
  c.roundRect(1, 1, 16, 12, [2, 1], [2, 1], PAL.cream);
  c.rect(4, 14, 2, 2, PAL.cream);
  c.set(3, 17, PAL.cream);
  c.outline(PAL.ink);
  return c;
}

const LAMP_ROWS = [
  '................',
  '................',
  '................',
  '.....kkkkkk.....',
  '....kggggggk....',
  '...kgGGGGGGgk...',
  '...kggggggggk...',
  '...kkkkkkkkkk...',
  '....yyykkyyy....',
  '.......kb.......',
  '.......kb.......',
  '.......kb.......',
  '.......kb.......',
  '.....kkbbkk.....',
  '.....kbbbbk.....',
  '.....kkkkkk.....',
];

/** Desk lamp: frame 0 is off, frame 1 is lit. */
export function renderLamp(): PixelCanvas {
  const c = new PixelCanvas(32, 16);
  c.pattern(0, 0, LAMP_ROWS, { k: PAL.ink, g: PAL.pine, G: PAL.leafDark, b: PAL.amber });
  c.pattern(16, 0, LAMP_ROWS, { k: PAL.ink, g: PAL.leaf, G: PAL.glow, b: PAL.gold, y: PAL.glow });
  return c;
}

/** Warm radial light, drawn with additive blending under lit lamps. */
export function renderGlow(): PixelCanvas {
  const size = 64;
  const c = new PixelCanvas(size, size);
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
      if (d >= 1) continue;
      c.set(x, y, withAlpha(PAL.glow, (1 - d) ** 2 * 0.6));
    }
  }
  return c;
}

/** Bouncing arrow shown over the seat you can sit on. */
export function renderMarker(): PixelCanvas {
  const c = new PixelCanvas(9, 6);
  c.pattern(0, 0, ['kkkkkkkkk', 'kyyyyyyyk', '.kyyyyyk.', '..kyyyk..', '...kyk...', '....k....'], {
    k: PAL.ink,
    y: PAL.gold,
  });
  return c;
}

/** The "z" that drifts up from a sleeping character. */
export function renderZzz(): PixelCanvas {
  const c = new PixelCanvas(7, 7);
  c.pattern(1, 1, ['wwwww', '...w.', '..w..', '.w...', 'wwwww'], { w: PAL.cream });
  c.outline(PAL.ink);
  return c;
}
