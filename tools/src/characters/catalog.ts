import {
  CHAR_H,
  CHAR_W,
  SHEET_COLUMNS,
  SHEET_ROWS,
  type CharacterManifest,
  type LayerVariant,
  type PaletteOption,
} from '@study/shared';
import { MARK_PRIMARY, MARK_SECONDARY, PAL, ramp, skinRamp } from '../palette';
import { accessoryLayer, type AccessoryStyle } from './accessories';
import { drawBody, drawEyes, type LayerDraw } from './body';
import { bottomLayer, shoeLayer, topLayer, type BottomStyle, type ShoeStyle, type TopStyle } from './clothes';
import { HAIR_STYLES, hairBackLayer, hairLayer } from './hair';

/** Everything needed to render the character sheets and describe them. */
export interface CharacterCatalog {
  /** Image key -> painter for that layer sheet. */
  sheets: Map<string, LayerDraw>;
  manifest: CharacterManifest;
}

const colours = (list: [string, string, string][], toRamp = ramp): PaletteOption[] =>
  list.map(([id, name, base]) => ({ id, name, ramp: toRamp(base) }));

const SKINS = colours(
  [
    ['porcelain', 'Porcelain', '#fde4cc'],
    ['peach', 'Peach', '#f7d0aa'],
    ['honey', 'Honey', '#eab98c'],
    ['amber', 'Amber', '#d19a6a'],
    ['chestnut', 'Chestnut', '#a9734e'],
    ['cocoa', 'Cocoa', '#7b5039'],
  ],
  skinRamp,
);

const HAIR_COLORS = colours([
  ['black', 'Black', '#3a3346'],
  ['brown', 'Brown', '#6b4436'],
  ['chestnut', 'Chestnut', '#9a5a3c'],
  ['blonde', 'Blonde', '#e6bd62'],
  ['ginger', 'Ginger', '#d9763a'],
  ['red', 'Red', '#b83f4c'],
  ['pink', 'Pink', '#ee97ae'],
  ['blue', 'Blue', '#5d8bc9'],
  ['lavender', 'Lavender', '#a58ad6'],
  ['silver', 'Silver', '#c9cbd8'],
]);

const EYE_COLORS = colours([
  ['brown', 'Brown', '#8a5238'],
  ['blue', 'Blue', '#4f86c6'],
  ['green', 'Green', '#5a9a5c'],
  ['amber', 'Amber', '#d99a3a'],
  ['violet', 'Violet', '#8a62c0'],
  ['rose', 'Rose', '#d0607a'],
]);

type Row<S> = [id: string, name: string, style: S, primary: string, secondary?: string];

const TOPS: Row<TopStyle>[] = [
  ['tee-coral', 'Coral tee', 'tee', PAL.coral, PAL.cream],
  ['tee-sky', 'Sky tee', 'tee', PAL.water, PAL.cream],
  ['hoodie-moss', 'Moss hoodie', 'hoodie', PAL.leafDark, PAL.cream],
  ['hoodie-plum', 'Plum hoodie', 'hoodie', PAL.plum, PAL.gold],
  ['sailor-navy', 'Navy sailor', 'sailor', '#f1ebe0', '#3a4a6e'],
  ['sailor-wine', 'Rose sailor', 'sailor', '#f1ebe0', PAL.brick],
  ['blazer-navy', 'Navy blazer', 'blazer', '#3a4a6e', PAL.brick],
  ['sweater-gold', 'Honey sweater', 'sweater', '#e0a84a', PAL.cocoa],
  ['sweater-lilac', 'Lilac sweater', 'sweater', PAL.lilac, PAL.cream],
];

const BOTTOMS: Row<BottomStyle>[] = [
  ['pants-navy', 'Navy trousers', 'pants', '#3a4a6e'],
  ['pants-charcoal', 'Charcoal trousers', 'pants', PAL.ash],
  ['pants-khaki', 'Khaki trousers', 'pants', PAL.tan],
  ['shorts-denim', 'Denim shorts', 'shorts', PAL.deep],
  ['shorts-olive', 'Olive shorts', 'shorts', '#7a8450'],
  ['skirt-navy', 'Navy skirt', 'skirt', '#3a4a6e'],
  ['skirt-wine', 'Wine skirt', 'skirt', PAL.wine],
];

const SHOES: Row<ShoeStyle>[] = [
  ['sneaker-white', 'White sneakers', 'sneaker', '#d8cfc8'],
  ['sneaker-red', 'Red sneakers', 'sneaker', PAL.brick],
  ['sneaker-black', 'Black sneakers', 'sneaker', '#4a4452'],
  ['boot-brown', 'Brown loafers', 'boot', PAL.bark],
  ['boot-black', 'Black boots', 'boot', '#3d3644'],
];

const ACCESSORIES: Row<AccessoryStyle>[] = [
  ['glasses', 'Glasses', 'glasses', PAL.cocoa],
  ['headphones', 'Headphones', 'headphones', PAL.coral],
  ['catears', 'Cat ears', 'catears', PAL.ash],
  ['bow', 'Ribbon bow', 'bow', PAL.brick],
  ['beanie', 'Beanie', 'beanie', PAL.deep, PAL.cream],
  ['scarf', 'Scarf', 'scarf', PAL.brick, PAL.cream],
];

function variants<S extends string>(
  sheets: Map<string, LayerDraw>,
  prefix: string,
  rows: Row<S>[],
  painter: (style: S) => LayerDraw,
): LayerVariant[] {
  return rows.map(([id, name, style, primary, secondary]) => {
    const sheet = `${prefix}_${style}`;
    if (!sheets.has(sheet)) sheets.set(sheet, painter(style));
    return {
      id,
      name,
      sheet,
      palette: { primary: ramp(primary), ...(secondary ? { secondary: ramp(secondary) } : {}) },
    };
  });
}

export function buildCharacterCatalog(): CharacterCatalog {
  const sheets = new Map<string, LayerDraw>();
  sheets.set('char_body', drawBody);
  sheets.set('char_eyes', drawEyes);

  const hairStyles: LayerVariant[] = HAIR_STYLES.map((style) => {
    const sheet = `char_hair_${style.id}`;
    sheets.set(sheet, hairLayer(style));
    const back = hairBackLayer(style);
    const backSheet = `char_hairback_${style.id}`;
    if (back) sheets.set(backSheet, back);
    return { id: style.id, name: style.name, sheet, ...(back ? { backSheet } : {}) };
  });

  const accessories = variants(sheets, 'char_acc', ACCESSORIES, accessoryLayer).map((v) =>
    v.id === 'catears' ? { id: v.id, name: v.name, sheet: v.sheet, inherit: 'hairColor' as const } : v,
  );

  const manifest: CharacterManifest = {
    frameWidth: CHAR_W,
    frameHeight: CHAR_H,
    columns: SHEET_COLUMNS,
    rows: SHEET_ROWS,
    outline: PAL.ink,
    markers: { primary: MARK_PRIMARY, secondary: MARK_SECONDARY },
    bodySheet: 'char_body',
    eyesSheet: 'char_eyes',
    skins: SKINS,
    hairStyles,
    hairColors: HAIR_COLORS,
    eyeColors: EYE_COLORS,
    tops: variants(sheets, 'char_top', TOPS, topLayer),
    bottoms: variants(sheets, 'char_bottom', BOTTOMS, bottomLayer),
    shoes: variants(sheets, 'char_shoes', SHOES, shoeLayer),
    accessories: [{ id: 'none', name: 'None', sheet: null }, ...accessories],
    outfits: [
      { id: 'casual', name: 'Weekend casual', top: 'tee-coral', bottom: 'shorts-denim', shoes: 'sneaker-white' },
      { id: 'sailor', name: 'Sailor uniform', top: 'sailor-navy', bottom: 'skirt-navy', shoes: 'boot-brown' },
      { id: 'blazer', name: 'Academy blazer', top: 'blazer-navy', bottom: 'pants-charcoal', shoes: 'boot-black' },
      { id: 'cozy', name: 'Cozy hoodie', top: 'hoodie-moss', bottom: 'pants-khaki', shoes: 'sneaker-white' },
      { id: 'nightowl', name: 'Night owl', top: 'hoodie-plum', bottom: 'pants-navy', shoes: 'sneaker-black' },
      { id: 'honey', name: 'Honey sweater', top: 'sweater-gold', bottom: 'skirt-wine', shoes: 'boot-brown' },
      { id: 'breeze', name: 'Sea breeze', top: 'tee-sky', bottom: 'pants-navy', shoes: 'sneaker-red' },
      { id: 'rose', name: 'Rose sailor', top: 'sailor-wine', bottom: 'skirt-wine', shoes: 'sneaker-white' },
      { id: 'lilac', name: 'Lilac study', top: 'sweater-lilac', bottom: 'pants-charcoal', shoes: 'boot-black' },
    ],
  };
  return { sheets, manifest };
}
