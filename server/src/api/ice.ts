import { createHmac } from 'node:crypto';
import type { Request, Response } from 'express';
import type { IceConfigResponse } from '@study/shared';

const STUN_URLS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];
/** TURN credentials last this long. A call that outlives them keeps working; only new links need fresh ones. */
const TURN_TTL_SECONDS = 12 * 60 * 60;

/**
 * ICE servers for voice. STUN always. When TURN_HOST and TURN_SECRET are set
 * (a coturn relay using `use-auth-secret`), also a relay with credentials that
 * expire, so the secret never reaches the browser and strangers cannot keep
 * using the relay.
 */
export function iceConfig(env: NodeJS.ProcessEnv = process.env, now = Date.now()): IceConfigResponse {
  const iceServers: IceConfigResponse['iceServers'] = [{ urls: STUN_URLS }];
  const host = env.TURN_HOST?.trim();
  const secret = env.TURN_SECRET?.trim();
  if (host && secret) {
    const port = env.TURN_PORT?.trim() || '3478';
    const username = `${Math.floor(now / 1000) + TURN_TTL_SECONDS}:study`;
    const credential = createHmac('sha1', secret).update(username).digest('base64');
    iceServers.push({
      urls: [`turn:${host}:${port}?transport=udp`, `turn:${host}:${port}?transport=tcp`],
      username,
      credential,
    });
  }
  return { iceServers };
}

export function iceRoute(_req: Request, res: Response): void {
  res.set('Cache-Control', 'no-store').json(iceConfig());
}
