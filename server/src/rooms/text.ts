/**
 * Cleans text typed by a player: removes control and invisible formatting
 * characters, collapses whitespace and trims. Never trust client text.
 */
export function cleanText(input: unknown, maxLength: number): string {
  if (typeof input !== 'string') return '';
  return input
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
