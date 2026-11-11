import pixelify400 from '@fontsource/pixelify-sans/files/pixelify-sans-latin-400-normal.woff2?url';
import pixelify600 from '@fontsource/pixelify-sans/files/pixelify-sans-latin-600-normal.woff2?url';
import pressStart from '@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2?url';
import { UI_FONT } from './config';

/** Digits and the symbols that appear in clocks and counts. */
const NUMBER_RANGE = 'U+0030-0039, U+003A, U+002F, U+0025';

/**
 * Registers one font family for the whole game. Letters come from Pixelify
 * Sans, but numbers, colons and slashes come from Press Start 2P, whose
 * digits are blocky and cannot be confused (Pixelify's 5 and 3 look like 8).
 * Because the families share a name, every HTML label and Phaser text picks
 * the right face per character with no per-element markup.
 */
export async function loadFonts(): Promise<void> {
  const css = `
    @font-face { font-family: "${UI_FONT}"; font-weight: 400; src: url(${pixelify400}) format("woff2"); }
    @font-face { font-family: "${UI_FONT}"; font-weight: 600; src: url(${pixelify600}) format("woff2"); }
    @font-face {
      font-family: "${UI_FONT}"; font-weight: 400; size-adjust: 72%;
      unicode-range: ${NUMBER_RANGE}; src: url(${pressStart}) format("woff2");
    }
    @font-face {
      font-family: "${UI_FONT}"; font-weight: 600; size-adjust: 72%;
      unicode-range: ${NUMBER_RANGE}; src: url(${pressStart}) format("woff2");
    }`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  await Promise.all([
    document.fonts.load(`16px "${UI_FONT}"`, 'Abc'),
    document.fonts.load(`600 16px "${UI_FONT}"`, 'Abc'),
    document.fonts.load(`16px "${UI_FONT}"`, '0123456789:/%'),
    document.fonts.load(`600 16px "${UI_FONT}"`, '0123456789:/%'),
  ]);
}
