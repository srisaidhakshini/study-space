import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { MAX_PLAYERS_PER_ROOM } from '@study/shared';

// Load server/.env no matter which folder the process was started from.
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env'), quiet: true });

/** Mutable server settings. createServer() fills them in; tests lower the cap. */
export const serverConfig = {
  maxPlayers: MAX_PLAYERS_PER_ROOM,
  /**
   * The server's clock, in epoch ms. Always Date.now() except in tests, which
   * move it forward to finish a 25-minute session instantly (createServer
   * refuses a custom clock when NODE_ENV is "production").
   */
  now: (): number => Date.now(),
};

export const DEV_AUTH_SECRET = 'dev-only-change-me';

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** The secret that signs login tokens. */
export function authSecret(): string {
  return process.env.AUTH_SECRET || DEV_AUTH_SECRET;
}

/** Refuses to run in production with a missing, default or short secret; warns in development. */
export function assertAuthConfig(): void {
  const secret = authSecret();
  if (isProductionEnv()) {
    if (secret === DEV_AUTH_SECRET || secret.length < 32) {
      throw new Error('AUTH_SECRET must be set to a random string of at least 32 characters in production.');
    }
  } else if (secret === DEV_AUTH_SECRET) {
    console.warn('[auth] Using the development AUTH_SECRET. Set AUTH_SECRET in server/.env before deploying.');
  }
}
