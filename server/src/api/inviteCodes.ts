import { INVITE_ALPHABET, INVITE_CODE_LENGTH } from '@study/shared';

/** A random invite code such as "K7QMX". */
export function randomInviteCode(rand: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) code += INVITE_ALPHABET[Math.floor(rand() * INVITE_ALPHABET.length)];
  return code;
}

/** Normalises what a person typed: upper case, no spaces or dashes. */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function isValidInviteCode(code: string): boolean {
  if (code.length !== INVITE_CODE_LENGTH) return false;
  return [...code].every((c) => INVITE_ALPHABET.includes(c));
}
