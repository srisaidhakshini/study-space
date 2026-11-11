/**
 * Basic profanity filter for chat and names.
 *
 * It is deliberately small and tame: it catches common swearing and the usual
 * tricks (leetspeak, stretched letters, spaced-out letters) while matching
 * whole words, so innocent words that merely contain a bad one ("Scunthorpe",
 * "classic") are left alone. Extend BLOCKED_WORDS to taste.
 */

/** Lower-case base forms. Inflections (-s, -ed, -ing, ...) are matched automatically. */
export const BLOCKED_WORDS: readonly string[] = [
  'fuck',
  'motherfucker',
  'shit',
  'bullshit',
  'horseshit',
  'bitch',
  'bastard',
  'asshole',
  'arsehole',
  'cunt',
  'piss',
  'slut',
  'whore',
  'wanker',
  'twat',
  'bollocks',
  'dickhead',
];

/** Words that begin with one of these are blocked whatever follows. */
const BLOCKED_STEMS: readonly string[] = ['fuck', 'shit'];

/** Innocent words that would otherwise trip a stem. */
const ALLOWED_WORDS: ReadonlySet<string> = new Set(['shiitake', 'shitake', 'shiitakes', 'shitakes', 'scunthorpe']);

const SUFFIX = '(?:s|es|ed|ing|er|ers|y|ies|in|head|face)?';

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'i',
};

/** Each letter may be stretched ("fuuuck"); the whole token must match. */
function stretchy(word: string): string {
  return [...word].map((c) => `${c}+`).join('');
}

const WORD_PATTERNS = BLOCKED_WORDS.map((w) => new RegExp(`^${stretchy(w)}${SUFFIX}$`));
const STEM_PATTERNS = BLOCKED_STEMS.map((w) => new RegExp(`^${stretchy(w)}[a-z]*$`));

/** Lower-cases, strips accents and maps leetspeak to letters. */
function normalize(token: string): string {
  const plain = token
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
  return [...plain].map((c) => LEET[c] ?? c).join('');
}

function isBadToken(token: string): boolean {
  const word = normalize(token);
  if (ALLOWED_WORDS.has(word.replace(/(.)\1+/g, '$1')) || ALLOWED_WORDS.has(word)) return false;
  return WORD_PATTERNS.some((p) => p.test(word)) || STEM_PATTERNS.some((p) => p.test(word));
}

const WORD_CHAR = '[\\p{L}\\p{N}@$|]';
/** A word: starts and ends with a word character, "!" allowed in the middle ("sh!t"). */
const TOKEN = new RegExp(`${WORD_CHAR}(?:[\\p{L}\\p{N}@$|!]*${WORD_CHAR})?`, 'gu');
/** Single characters separated by 1-2 separators: "f u c k", "f.u.c.k". */
const SPACED = /(?<![\p{L}\p{N}])(?:[\p{L}\p{N}@$!][ .\-_*]{1,2}){2,}[\p{L}\p{N}@$!](?![\p{L}\p{N}])/gu;

interface Span {
  start: number;
  end: number;
}

function findBadSpans(text: string): Span[] {
  const spans: Span[] = [];
  for (const m of text.matchAll(TOKEN)) {
    if (isBadToken(m[0])) spans.push({ start: m.index!, end: m.index! + m[0].length });
  }
  for (const m of text.matchAll(SPACED)) {
    const joined = m[0].replace(/[ .\-_*]/g, '');
    if (isBadToken(joined)) spans.push({ start: m.index!, end: m.index! + m[0].length });
  }
  return spans;
}

/** Replaces every offending word with asterisks of the same length. */
export function filterProfanity(text: string): { text: string; flagged: boolean } {
  const spans = findBadSpans(text);
  if (spans.length === 0) return { text, flagged: false };
  // Spans are UTF-16 offsets, so edit by code unit to keep them valid.
  const units = text.split('');
  for (const { start, end } of spans) for (let i = start; i < end; i++) units[i] = '*';
  return { text: units.join(''), flagged: true };
}

/** True when a display name contains no profanity (also checks it with separators removed). */
export function isNameAllowed(name: string): boolean {
  if (filterProfanity(name).flagged) return false;
  const compact = name.replace(/[^\p{L}\p{N}@$!|]/gu, '');
  return compact === '' || !isBadToken(compact);
}
