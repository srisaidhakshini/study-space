/**
 * With Postgres unreachable the server must still start and serve guests, and
 * the account endpoints must answer 503 instead of hanging or crashing.
 * This needs no database: it points DATABASE_URL at a closed port.
 * Run with `npm run test:db -w server` (or `npx tsx src/offline.test.ts`).
 */
process.env.DATABASE_URL = 'postgresql://nobody:nothing@127.0.0.1:1/none?schema=public';

import { Client } from '@colyseus/sdk';
import { C2S, FEET_ANCHOR, JOIN_ERROR, S2C, TILE, defaultAppearance, findPath, type PlayerSnapshot } from '@study/shared';

const { createServer } = await import('./createServer');
const { issueToken } = await import('./auth/token');
const { closeDb } = await import('./db/client');
const { getWorld } = await import('./world/maps');

const PORT = 20000 + Math.floor(Math.random() * 20000);
const HTTP = `http://localhost:${PORT}`;

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function until(cond: () => boolean, ms = 4000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await sleep(40);
  }
  return cond();
}

async function api(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${HTTP}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

let clockOffset = 0;
const world = getWorld();
const game = createServer({ testClock: () => Date.now() + clockOffset });
await game.listen(PORT);

try {
  const health = await api('GET', '/health');
  check('/health is still ok and reports the database as down', health.status === 200 && health.json.ok === true && health.json.db === 'down', JSON.stringify(health.json));

  const unavailable = (r: { status: number; json: Record<string, unknown> }): boolean => r.status === 503 && r.json.error === 'Accounts are unavailable right now';
  const token = issueToken('some-user-id', Date.now() + clockOffset);
  check('register answers 503 with a clear message', unavailable(await api('POST', '/api/auth/register', { email: 'a@example.test', password: 'long enough pw', name: 'A' })));
  check('login answers 503', unavailable(await api('POST', '/api/auth/login', { email: 'a@example.test', password: 'long enough pw' })));
  check('/api/me answers 503', unavailable(await api('GET', '/api/me', undefined, token)));
  check('/api/stats answers 503', unavailable(await api('GET', '/api/stats', undefined, token)));
  check('/api/profile answers 503', unavailable(await api('PUT', '/api/profile', { name: 'B' }, token)));
  check('/api/sessions/import answers 503', unavailable(await api('POST', '/api/sessions/import', { sessions: [] }, token)));
  check('bad input is still rejected before the database is needed', (await api('POST', '/api/auth/register', { email: 'nope', password: 'x', name: 'A' })).status === 400);

  // Guests do not need the database at all.
  const { json } = await api('POST', '/api/join', { server: 'Cedar' });
  const options = { name: 'Guest', appearance: defaultAppearance(world.manifest.character), pet: 'cat', tzOffsetMin: 0 };
  const guest = await new Client(`ws://localhost:${PORT}`).joinById(json.roomId as string, options);
  guest.onMessage('*', () => undefined);
  const snapshot = (): PlayerSnapshot | undefined => (guest.state as { players: Map<string, PlayerSnapshot> }).players?.get(guest.sessionId);
  check('a guest can join while the database is down', await until(() => snapshot() !== undefined));

  const refused = await new Client(`ws://localhost:${PORT}`).joinById(json.roomId as string, { ...options, token }).then(
    () => null,
    (error: { code?: number }) => error,
  );
  check('a token join is refused with the "accounts unavailable" code (not a silent guest)', refused !== null && refused.code === JOIN_ERROR.accountsUnavailable, JSON.stringify(refused));

  // A guest's whole session works: walk to a bench, sit, run a timer to the end.
  let seq = 0;
  let x = snapshot()!.x;
  let y = snapshot()!.y;
  const seat = world.maps.get('hub')!.objects.seats.filter((s) => s.facing === 'up' && s.tx >= 22).sort((a, b) => a.tx - b.tx)[0]!;
  const route = findPath(world.maps.get('hub')!.collision, { x: Math.floor(x / TILE), y: Math.floor(y / TILE) }, { x: seat.tx, y: seat.ty + 1 })!;
  for (const step of route.slice(1)) {
    const tx = step.x * TILE + TILE / 2;
    const ty = step.y * TILE + FEET_ANCHOR.y;
    for (;;) {
      const dist = Math.hypot(tx - x, ty - y);
      if (dist < 0.01) break;
      const k = Math.min(1, 30 / dist);
      x += (tx - x) * k;
      y += (ty - y) * k;
      guest.send(C2S.move, { seq: ++seq, x, y, dir: 'down', moving: true });
      await sleep(300);
    }
  }
  guest.send(C2S.sit, { seatId: seat.id });
  check('a guest can sit', await until(() => snapshot()?.seatId === seat.id));
  guest.send(C2S.timerStart, { mode: 'pomodoro', focusMin: 25, breakMin: 0, autoRepeat: false, subject: 'math' });
  check('a guest timer starts', await until(() => snapshot()?.phase === 'focus'));
  clockOffset += 26 * 60_000;
  check('a guest timer finishes and counts the session, with the database down', await until(() => snapshot()?.phase === 'idle' && snapshot()?.sessionsToday === 1));
  const stats: unknown[] = [];
  guest.onMessage(S2C.stats, (m) => stats.push(m));
  await sleep(500);
  check('guests get no stats messages', stats.length === 0);
  check('the room is still healthy afterwards', (await api('GET', '/api/servers')).status === 200);
  await guest.leave();
} finally {
  await game.shutdown();
  await closeDb();
}

console.log(failures === 0 ? '\nAll offline checks passed.' : `\n${failures} offline check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
