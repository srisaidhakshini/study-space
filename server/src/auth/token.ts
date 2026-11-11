import { createHmac, timingSafeEqual } from 'node:crypto';
import { authSecret } from '../config';

export const TOKEN_LIFETIME_SEC = 30 * 24 * 60 * 60;

interface Payload {
  /** The user id. */
  sub: string;
  /** Expiry, epoch seconds. */
  exp: number;
}

const b64 = (data: Buffer | string): string => Buffer.from(data).toString('base64url');

function sign(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

/** A signed login token: base64url(payload) "." base64url(HMAC-SHA256). */
export function issueToken(userId: string, nowMs: number = Date.now(), secret: string = authSecret()): string {
  const payload: Payload = { sub: userId, exp: Math.floor(nowMs / 1000) + TOKEN_LIFETIME_SEC };
  const body = b64(JSON.stringify(payload));
  return `${body}.${b64(sign(body, secret))}`;
}

/** The user id inside a valid, unexpired token, or null. Constant-time signature check. */
export function verifyToken(token: unknown, nowMs: number = Date.now(), secret: string = authSecret()): string | null {
  if (typeof token !== 'string' || token.length > 600) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts as [string, string];
  const given = Buffer.from(signature, 'base64url');
  const expected = sign(body, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<Payload>;
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 <= nowMs) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
