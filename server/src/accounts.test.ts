/**
 * Accounts and persistence tests. They need Postgres (`docker compose up -d db`
 * and `npm run db:migrate -w server`). Every test user has a unique
 * "@example.test" email and is deleted at the end; nothing else is touched.
 * Run with `npm run test:db -w server`.
 */
import { Client, type Room } from '@colyseus/sdk';
import {
  C2S,
  FEET_ANCHOR,
  JOIN_ERROR,
  PASSWORD_MIN_LENGTH,
  S2C,
  TILE,
  computeStreaks,
  dayKeyAt,
  defaultAppearance,
  findPath,
  shiftDay,
  type AuthResponse,
  type ImportResponse,
  type MeResponse,
  type PlayerSnapshot,
  type StatsMessage,
  type StatsResponse,
} from '@study/shared';
import { resetRateLimits } from './api/accountRoutes';
import { issueToken, TOKEN_LIFETIME_SEC } from './auth/token';
import { closeDb, db } from './db/client';
import { createServer } from './createServer';
import { getWorld } from './world/maps';

const PORT = 20000 + Math.floor(Math.random() * 20000);
const HTTP = `http://localhost:${PORT}`;
const RUN = Math.random().toString(36).slice(2, 8);

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function until(cond: () => boolean | Promise<boolean>, ms = 4000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return true;
    await sleep(40);
  }
  return cond();
}

let emailCounter = 0;
const newEmail = (): string => `t-${RUN}-${++emailCounter}@example.test`;
const PASSWORD = 'correct horse battery';

interface Reply<T = Record<string, unknown>> {
  status: number;
  json: T;
}

async function api<T = Record<string, unknown>>(method: string, path: string, body?: unknown, token?: string): Promise<Reply<T>> {
  const res = await fetch(`${HTTP}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as T };
}

async function register(name = 'Tester', extra: Record<string, unknown> = {}): Promise<{ email: string; auth: AuthResponse }> {
  const email = newEmail();
  const { status, json } = await api<AuthResponse>('POST', '/api/auth/register', { email, password: PASSWORD, name, ...extra });
  if (status !== 201) throw new Error(`register failed: ${status} ${JSON.stringify(json)}`);
  return { email, auth: json };
}

const world = getWorld();

interface Player {
  room: Room;
  id: string;
  x: number;
  y: number;
  log: { type: string | number; message: unknown }[];
  left: number | null;
  snapshot(): PlayerSnapshot | undefined;
  messages<T>(type: string): T[];
  walkToTile(map: string, tx: number, ty: number): Promise<void>;
}

/** Joins an instance of "Maple" (the fullest one with room, so repeat joins share it). */
async function join(token?: string, options: Record<string, unknown> = {}): Promise<Player> {
  const res = await api<{ roomId: string }>('POST', '/api/join', { server: 'Maple' });
  const room = await new Client(`ws://localhost:${PORT}`).joinById(res.json.roomId, {
    name: 'Hacker',
    appearance: defaultAppearance(world.manifest.character),
    pet: 'cat',
    tzOffsetMin: 0,
    ...(token ? { token } : {}),
    ...options,
  });
  const log: Player['log'] = [];
  room.onMessage('*', (type, message) => log.push({ type, message }));
  const p: Player = {
    room,
    id: room.sessionId,
    x: 0,
    y: 0,
    log,
    left: null,
    snapshot: () => (room.state as { players: Map<string, PlayerSnapshot> }).players?.get(room.sessionId),
    messages: <T>(type: string) => log.filter((m) => m.type === type).map((m) => m.message as T),
    async walkToTile(map, tx, ty) {
      const grid = world.maps.get(map)!.collision;
      const route = findPath(grid, { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) }, { x: tx, y: ty });
      if (!route) throw new Error(`no path to ${map} ${tx},${ty}`);
      for (const step of route.slice(1)) {
        const targetX = step.x * TILE + TILE / 2;
        const targetY = step.y * TILE + FEET_ANCHOR.y;
        for (;;) {
          const dist = Math.hypot(targetX - p.x, targetY - p.y);
          if (dist < 0.01) break;
          const k = Math.min(1, 30 / dist);
          p.x += (targetX - p.x) * k;
          p.y += (targetY - p.y) * k;
          room.send(C2S.move, { seq: ++seq, x: p.x, y: p.y, dir: 'down', moving: true });
          await sleep(300);
        }
      }
    },
  };
  room.onLeave((code) => (p.left = code));
  await until(() => p.snapshot() !== undefined && log.some((m) => m.type === S2C.welcome));
  const welcome = log.find((m) => m.type === S2C.welcome)!.message as { x: number; y: number };
  p.x = welcome.x;
  p.y = welcome.y;
  return p;
}
let seq = 0;

/** A hub bench seat near the start, so tests can sit without a long walk. */
async function sitOnBench(p: Player, nth = 0): Promise<void> {
  const hub = world.maps.get('hub')!;
  const seat = hub.objects.seats.filter((s) => s.facing === 'up' && s.tx >= 22).sort((a, b) => a.tx - b.tx)[nth]!;
  await p.walkToTile('hub', seat.tx, seat.ty + 1);
  p.room.send(C2S.sit, { seatId: seat.id });
  if (!(await until(() => p.snapshot()?.seatId === seat.id))) throw new Error('could not sit on the hub bench');
}

const timerConfig = (subject = 'math', focusMin = 25) => ({ mode: 'pomodoro', focusMin, breakMin: 0, autoRepeat: false, subject });

let clockOffset = 0;
const MIN = 60_000;

/** Epoch ms of a UTC time `daysAgo` days before today. */
function utc(daysAgo: number, hour: number, minute = 0): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo, hour, minute);
}

function imported(endedAt: number, minutes: number, subject = 'math', completed = true) {
  return { subject, mode: 'pomodoro', startedAt: endedAt - minutes * MIN, endedAt, minutes, completed };
}

async function main(): Promise<void> {
  const prisma = db();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    console.error('Cannot reach Postgres. Start it with "docker compose up -d db" and run "npm run db:migrate -w server".');
    process.exit(1);
  }

  const game = createServer({ testClock: () => Date.now() + clockOffset });
  await game.listen(PORT);
  const players: Player[] = [];

  try {
    // ---- shared unit test: streaks ---------------------------------------------
    {
      const today = '2026-03-10';
      const run = (days: string[]) => computeStreaks(days, today);
      check('(unit) streak counts consecutive days ending today', run(['2026-03-08', '2026-03-09', '2026-03-10']).current === 3);
      check('(unit) a streak survives until the end of tomorrow', run(['2026-03-08', '2026-03-09']).current === 2);
      check('(unit) a missed day resets the current streak', run(['2026-03-07', '2026-03-08']).current === 0);
      check('(unit) longest streak is tracked separately', run(['2026-01-01', '2026-01-02', '2026-01-03', '2026-03-10']).longest === 3);
      check('(unit) shiftDay crosses month ends', shiftDay('2026-03-01', -1) === '2026-02-28' && shiftDay('2026-12-31', 1) === '2027-01-01');
      check('(unit) dayKeyAt applies the offset', dayKeyAt(Date.UTC(2026, 0, 10, 22, 30), 330) === '2026-01-11' && dayKeyAt(Date.UTC(2026, 0, 10, 22, 30), 0) === '2026-01-10');
    }

    // ---- register, login, me ------------------------------------------------------
    resetRateLimits();
    const first = await register('Aoi', { appearance: defaultAppearance(world.manifest.character), pet: 'bunny' });
    check('register returns a token and the account', first.auth.token.length > 20 && first.auth.account.email === first.email && first.auth.account.name === 'Aoi');
    check('register keeps the look and pet', first.auth.account.pet === 'bunny' && first.auth.account.appearance !== null && first.auth.account.coins === 0);

    const login = await api<AuthResponse>('POST', '/api/auth/login', { email: first.email.toUpperCase(), password: PASSWORD });
    check('login works (email is case-insensitive)', login.status === 200 && login.json.account.id === first.auth.account.id);
    const me = await api<MeResponse>('GET', '/api/me', undefined, login.json.token);
    check('GET /api/me returns the same account', me.status === 200 && me.json.account.id === first.auth.account.id);

    const dup = await api('POST', '/api/auth/register', { email: first.email.toUpperCase(), password: PASSWORD, name: 'Other' });
    check('a duplicate email is a 409', dup.status === 409);
    check('a bad email is a 400', (await api('POST', '/api/auth/register', { email: 'nope', password: PASSWORD, name: 'X' })).status === 400);
    check('a short password is a 400', (await api('POST', '/api/auth/register', { email: newEmail(), password: 'x'.repeat(PASSWORD_MIN_LENGTH - 1), name: 'X' })).status === 400);
    check('a blank name is a 400', (await api('POST', '/api/auth/register', { email: newEmail(), password: PASSWORD, name: '   ' })).status === 400);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: first.email } });
    check('the password is stored as a salted scrypt hash, never in plain text', stored.passwordHash.startsWith('scrypt$') && !stored.passwordHash.includes(PASSWORD));

    // ---- wrong credentials ----------------------------------------------------------
    const wrongPassword = await api('POST', '/api/auth/login', { email: first.email, password: 'not the password' });
    const unknownEmail = await api('POST', '/api/auth/login', { email: newEmail(), password: PASSWORD });
    check('a wrong password is a 401', wrongPassword.status === 401);
    check('wrong password and unknown email give the same answer', unknownEmail.status === 401 && JSON.stringify(unknownEmail.json) === JSON.stringify(wrongPassword.json));

    // ---- tokens -------------------------------------------------------------------------
    const tampered = `${first.auth.token.slice(0, -2)}${first.auth.token.endsWith('AA') ? 'BB' : 'AA'}`;
    check('a tampered token is rejected', (await api('GET', '/api/me', undefined, tampered)).status === 401);
    const swapped = (() => {
      const [, sig] = first.auth.token.split('.');
      const other = issueToken('someone-else').split('.')[0];
      return `${other}.${sig}`;
    })();
    check('a token with a swapped payload is rejected', (await api('GET', '/api/me', undefined, swapped)).status === 401);
    const expired = issueToken(first.auth.account.id, Date.now() - (TOKEN_LIFETIME_SEC + 60) * 1000);
    check('an expired token is rejected', (await api('GET', '/api/me', undefined, expired)).status === 401);
    check('a missing token is a 401', (await api('GET', '/api/me')).status === 401);
    check('stats and import also need a token', (await api('GET', '/api/stats')).status === 401 && (await api('POST', '/api/sessions/import', { sessions: [] })).status === 401);

    // ---- rate limiting --------------------------------------------------------------------
    resetRateLimits();
    const victim = newEmail();
    let last = 0;
    for (let i = 0; i < 10; i++) last = (await api('POST', '/api/auth/login', { email: victim, password: `guess ${i} guess` })).status;
    const blocked = await api('POST', '/api/auth/login', { email: victim, password: 'guess 11 guess' });
    check('ten wrong attempts are answered normally', last === 401);
    check('the eleventh attempt is rate limited (429)', blocked.status === 429);
    resetRateLimits();

    // ---- profile ------------------------------------------------------------------------------
    const look = { ...defaultAppearance(world.manifest.character), hair: world.manifest.character.hairStyles[2]!.id };
    const updated = await api<MeResponse>('PUT', '/api/profile', { name: 'Aoi Two', appearance: look, pet: 'shiba' }, first.auth.token);
    check('PUT /api/profile updates the account', updated.status === 200 && updated.json.account.name === 'Aoi Two' && updated.json.account.pet === 'shiba');
    const again = await api<MeResponse>('GET', '/api/me', undefined, first.auth.token);
    check('the profile persists', again.json.account.name === 'Aoi Two' && again.json.account.appearance?.hair === look.hair);
    check('an unknown pet is a 400', (await api('PUT', '/api/profile', { pet: 'dragon' }, first.auth.token)).status === 400);
    const junkLook = await api<MeResponse>('PUT', '/api/profile', { appearance: { hair: 'nonexistent', skin: 5 } }, first.auth.token);
    check('an invalid look is repaired, not stored raw', junkLook.status === 200 && junkLook.json.account.appearance?.hair === defaultAppearance(world.manifest.character).hair);
    await api('PUT', '/api/profile', { appearance: look }, first.auth.token);

    // ---- joining with a token --------------------------------------------------------------------
    const bad = await join('not.a.token').then(() => null, (e: { code?: number }) => e);
    check('joining with an invalid token is refused with a clear code', bad !== null && (bad as { code?: number }).code === JOIN_ERROR.invalidToken, JSON.stringify(bad));
    const staleJoin = await join(expired).then(() => null, (e: { code?: number }) => e);
    check('joining with an expired token is refused (no silent guest)', staleJoin !== null && (staleJoin as { code?: number }).code === JOIN_ERROR.invalidToken);

    const a = await join(first.auth.token, { name: 'Hacker', pet: 'cat', appearance: defaultAppearance(world.manifest.character) });
    players.push(a);
    check('a token join uses the saved name, look and pet, not the client options', a.snapshot()?.name === 'Aoi Two' && a.snapshot()?.pet === 'shiba' && (JSON.parse(a.snapshot()!.appearance) as { hair: string }).hair === look.hair);
    check('an account join receives a stats message', await until(() => a.messages<StatsMessage>(S2C.stats).length > 0));
    check('the join stats start at zero', a.messages<StatsMessage>(S2C.stats)[0]?.coins === 0 && a.messages<StatsMessage>(S2C.stats)[0]?.todayMinutes === 0);

    // The same account joining again replaces the older connection.
    const a2 = await join(first.auth.token);
    players.push(a2);
    check('joining again kicks the older connection', await until(() => a.left === JOIN_ERROR.signedInElsewhere), `left=${a.left}`);
    check('the older connection is told why', a.messages<{ text: string }>(S2C.notice).some((n) => n.text.includes('somewhere else')));
    check('the newer connection stays', a2.left === null && a2.snapshot() !== undefined);

    // ---- the real timer path saves a session once and pays coins ----------------------------------
    await sitOnBench(a2);
    a2.room.send(C2S.timerStart, timerConfig('math', 25));
    check('the server timer starts', await until(() => a2.snapshot()?.phase === 'focus'));
    clockOffset += 26 * MIN;
    check('the focus phase finishes on the server clock', await until(() => a2.snapshot()?.phase === 'idle'));
    const afterFirst = await until(() => a2.messages<StatsMessage>(S2C.stats).some((s) => s.coins === 25));
    check('a stats message reports the 25 coins earned', afterFirst);
    await sleep(800);
    const sessions1 = await prisma.studySession.findMany({ where: { userId: first.auth.account.id } });
    check('the session was saved exactly once', sessions1.length === 1 && sessions1[0]!.minutes === 25 && sessions1[0]!.completed && sessions1[0]!.source === 'server' && sessions1[0]!.subject === 'math');
    const user1 = await prisma.user.findUniqueOrThrow({ where: { id: first.auth.account.id } });
    check('coins were paid: 1 per minute', user1.coins === 25);
    check('the player count of sessions today is synced', await until(() => a2.snapshot()?.sessionsToday === 1));

    // Stopping early credits the whole minutes done.
    a2.room.send(C2S.timerStart, timerConfig('coding', 50));
    await until(() => a2.snapshot()?.phase === 'focus');
    clockOffset += 12 * MIN + 20_000;
    a2.room.send(C2S.timerStop);
    check('ending early saves only the minutes done', await until(async () => (await prisma.studySession.count({ where: { userId: first.auth.account.id } })) === 2));
    const user2 = await prisma.user.findUniqueOrThrow({ where: { id: first.auth.account.id } });
    check('early-end coins match the minutes (25 + 12)', user2.coins === 37, `coins=${user2.coins}`);
    const ledger = await prisma.coinTransaction.aggregate({ where: { userId: first.auth.account.id }, _sum: { amount: true }, _count: true });
    check('the ledger sum equals User.coins', ledger._sum.amount === user2.coins && ledger._count === 2);
    const early = await prisma.studySession.findFirstOrThrow({ where: { userId: first.auth.account.id, subject: 'coding' } });
    check('an early-ended session is saved as not completed', early.minutes === 12 && !early.completed);

    // ---- stats endpoint ---------------------------------------------------------------------------------
    const statsOwn = await api<StatsResponse>('GET', '/api/stats?tz=0', undefined, first.auth.token);
    check('stats totals include both saved sessions', statsOwn.status === 200 && statsOwn.json.totalMinutes === 37 && statsOwn.json.totalSessions === 1 && statsOwn.json.coins === 37);
    check('stats list subjects by minutes and recent sessions newest first', statsOwn.json.subjects[0]?.subject === 'math' && statsOwn.json.recent[0]?.subject === 'coding');

    const hist = await register('Historian');
    const histSessions = [
      imported(utc(1, 0, 10), 20), // just after midnight yesterday ...
      imported(utc(2, 23, 50), 20), // ... and just before midnight the day before: a streak across a day boundary
      imported(utc(3, 12), 30),
      imported(utc(4, 12), 5), // too short to count towards a streak
      imported(utc(5, 12), 30),
      imported(utc(7, 12), 30),
      imported(utc(8, 12), 30),
      imported(utc(9, 12), 30),
      imported(utc(10, 12), 30),
    ];
    const imp = await api<ImportResponse>('POST', '/api/sessions/import', { sessions: histSessions }, hist.auth.token);
    check('import saves the history', imp.status === 200 && imp.json.imported === histSessions.length);
    const impAgain = await api<ImportResponse>('POST', '/api/sessions/import', { sessions: histSessions }, hist.auth.token);
    check('importing the same history again adds nothing (dedupe)', impAgain.status === 200 && impAgain.json.imported === 0);
    check('imported sessions pay no coins', (await api<MeResponse>('GET', '/api/me', undefined, hist.auth.token)).json.account.coins === 0 && (await prisma.coinTransaction.count({ where: { userId: hist.auth.account.id } })) === 0);

    const hs = (await api<StatsResponse>('GET', '/api/stats?tz=0', undefined, hist.auth.token)).json;
    const todayKey = dayKeyAt(Date.now(), 0);
    check('stats return 14 zero-filled days, oldest first, ending today', hs.days.length === 14 && hs.days[13]!.day === todayKey && hs.days[0]!.day === shiftDay(todayKey, -13));
    check('the short 5 minute day shows its minutes', hs.days.find((d) => d.day === shiftDay(todayKey, -4))?.minutes === 5);
    check('the streak runs across the midnight boundary and stops at the short day', hs.streak.current === 3, JSON.stringify(hs.streak));
    check('the longest streak is found', hs.streak.longest === 4, JSON.stringify(hs.streak));
    check('totals add up', hs.totalMinutes === 20 + 20 + 30 + 5 + 30 + 30 * 4 && hs.totalSessions === histSessions.length);

    // A time zone moves late-evening UTC sessions onto the next local day.
    const zone = await register('Zoned');
    await api('POST', '/api/sessions/import', { sessions: [imported(utc(6, 22, 30), 20)] }, zone.auth.token);
    const utcView = (await api<StatsResponse>('GET', '/api/stats?tz=0', undefined, zone.auth.token)).json;
    const istView = (await api<StatsResponse>('GET', '/api/stats?tz=330', undefined, zone.auth.token)).json;
    const endedAt = utc(6, 22, 30);
    check('in UTC the session lands on its UTC day', utcView.days.find((d) => d.day === dayKeyAt(endedAt, 0))?.minutes === 20);
    check('at UTC+5:30 it lands on the next local day', istView.days.find((d) => d.day === dayKeyAt(endedAt, 330))?.minutes === 20 && istView.days.find((d) => d.day === dayKeyAt(endedAt, 0))?.minutes === 0 && dayKeyAt(endedAt, 330) !== dayKeyAt(endedAt, 0));

    // ---- import validation ----------------------------------------------------------------------------------
    const t = hist.auth.token;
    check('importing a future session is a 400', (await api('POST', '/api/sessions/import', { sessions: [imported(Date.now() + clockOffset + 10 * MIN, 20)] }, t)).status === 400);
    check('importing a session longer than its own time span is a 400', (await api('POST', '/api/sessions/import', { sessions: [{ ...imported(utc(20, 12), 20), minutes: 500 }] }, t)).status === 400);
    check('importing too many sessions is a 400', (await api('POST', '/api/sessions/import', { sessions: Array.from({ length: 501 }, (_, i) => imported(utc(30, 12) - i * 100 * MIN, 20)) }, t)).status === 400);
    check('importing a malformed record is a 400', (await api('POST', '/api/sessions/import', { sessions: [{ minutes: 'lots' }] }, t)).status === 400);
    const oddSubject = await api<ImportResponse>('POST', '/api/sessions/import', { sessions: [imported(utc(40, 12), 20, 'underwater-basket')] }, t);
    const odd = await prisma.studySession.findFirst({ where: { userId: hist.auth.account.id, endedAt: new Date(utc(40, 12)) } });
    check('an unknown subject is stored as "general"', oddSubject.status === 200 && odd?.subject === 'general');

    // ---- guests write nothing ----------------------------------------------------------------------------------
    const before = { sessions: await prisma.studySession.count(), ledger: await prisma.coinTransaction.count(), users: await prisma.user.count() };
    const guest = await join();
    players.push(guest);
    check('a guest join gets no stats message', !(await until(() => guest.messages(S2C.stats).length > 0, 600)));
    await sitOnBench(guest, 1);
    guest.room.send(C2S.timerStart, timerConfig('art', 25));
    await until(() => guest.snapshot()?.phase === 'focus');
    clockOffset += 26 * MIN;
    check('the guest session still finishes on the server', await until(() => guest.snapshot()?.phase === 'idle'));
    await sleep(800);
    const afterGuest = { sessions: await prisma.studySession.count(), ledger: await prisma.coinTransaction.count(), users: await prisma.user.count() };
    check('a guest session writes nothing to the database', JSON.stringify(before) === JSON.stringify(afterGuest), `${JSON.stringify(before)} vs ${JSON.stringify(afterGuest)}`);
    check('the guest still saw their session counted locally', guest.snapshot()?.sessionsToday === 1);

    // ---- invariant across every account made in this run --------------------------------------------------------
    const mine = await prisma.user.findMany({ where: { email: { startsWith: `t-${RUN}-` } }, select: { id: true, coins: true } });
    let invariant = true;
    for (const u of mine) {
      const sum = (await prisma.coinTransaction.aggregate({ where: { userId: u.id }, _sum: { amount: true } }))._sum.amount ?? 0;
      if (sum !== u.coins) invariant = false;
    }
    check('User.coins equals the ledger sum for every test account', invariant);
  } finally {
    for (const p of players) await p.room.leave().catch(() => undefined);
    await prisma.user.deleteMany({ where: { email: { startsWith: `t-${RUN}-`, endsWith: '@example.test' } } });
    await game.shutdown();
    await closeDb();
  }

  console.log(failures === 0 ? '\nAll account checks passed.' : `\n${failures} account check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
