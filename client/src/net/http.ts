import { SERVER_PORT } from '@study/shared';

export const UNREACHABLE = "Can't reach the server. Is it running?";

/** Base URL of the game server's HTTP API and websocket. */
export function serverBase(): string {
  const configured = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (configured) return configured.replace(/\/+$/, '');
  const scheme = location.protocol === 'https:' ? 'https' : 'http';
  return `${scheme}://${location.hostname}:${SERVER_PORT}`;
}

/** Local UTC offset in minutes east of UTC (330 for India). */
export function tzOffsetMin(): number {
  return -new Date().getTimezoneOffset();
}
