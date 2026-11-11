import { EMAIL_MAX_LENGTH, NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, isNameAllowed } from '@study/shared';
import { cleanText } from '../rooms/text';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Lowercased, trimmed email, or an error message. */
export function parseEmail(raw: unknown): { email: string } | { error: string } {
  if (typeof raw !== 'string') return { error: 'Enter your email address' };
  const email = raw.trim().toLowerCase();
  const local = email.split('@')[0] ?? '';
  if (email.length > EMAIL_MAX_LENGTH || local.length > 64 || !EMAIL_PATTERN.test(email)) {
    return { error: 'Enter a valid email address' };
  }
  return { email };
}

export function parsePassword(raw: unknown): { password: string } | { error: string } {
  if (typeof raw !== 'string') return { error: 'Enter a password' };
  if (raw.length < PASSWORD_MIN_LENGTH) return { error: `Use at least ${PASSWORD_MIN_LENGTH} characters for your password` };
  if (raw.length > PASSWORD_MAX_LENGTH) return { error: `Use at most ${PASSWORD_MAX_LENGTH} characters for your password` };
  return { password: raw };
}

export function parseName(raw: unknown): { name: string } | { error: string } {
  const name = cleanText(raw, NAME_MAX_LENGTH);
  if (name === '') return { error: 'Choose a display name' };
  if (!isNameAllowed(name)) return { error: 'Please choose a different display name' };
  return { name };
}
