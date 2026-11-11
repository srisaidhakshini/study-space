/**
 * End-to-end smoke test: starts the server in-process on a random port and
 * drives it with real SDK clients. Run with `npm run test -w server`.
 *
 * Capacity is set to 2 per instance for the whole run so the cap and the
 * "open a new instance when full" behaviour can be tested with few clients.
 */
import { Client, type Room } from '@colyseus/sdk';
import {
  C2S,
  FEET_ANCHOR,
  S2C,
  TILE,
  defaultAppearance,
  filterProfanity,
  findPath,
  type ChatMessageOut,
  type Direction,
  type JoinOptions,
  type JoinResponse,
  type PlayerSnapshot,
  type ServerListResponse,
  type SitResultMessage,
  type TeleportMessage,
  type VoicePeerMessage,
  type VoicePeersMessage,
  type VoiceSignalOut,
  type WelcomeMessage,
} from '@study/shared';
import { createHmac } from 'node:crypto';
import { iceConfig } from './api/ice';
import { createServer } from './createServer';
import { getWorld } from './world/maps';

const PORT = 20000 + Math.floor(Math.random() * 20000);
const HTTP = `http://localhost:${PORT}`;
const CAPACITY = 2;

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function until(cond: () => boolean, ms = 3000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await sleep(25);
  }
  return cond();
}

async function post(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${HTTP}/api/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

interface Player {
  room: Room;
  id: string;
  roomId: string;
  welcome: WelcomeMessage;
  log: { type: string | number; message: unknown }[];
  seq: number;
  x: number;
  y: number;
  snapshot(id?: string): PlayerSnapshot | undefined;
  messages<T>(type: string): T[];
  move(x: number, y: number, dir?: Direction, moving?: boolean): void;
  walk(x: number, y: number): Promise<void>;
  walkToTile(map: string, tx: number, ty: number): Promise<void>;
}

const world = getWorld();

async function join(server: string, name: string): Promise<Player> {
  const { status, json } = await post({ server });
  if (status !== 200) throw new Error(`join ${server} failed: ${JSON.stringify(json)}`);
  return enter((json as unknown as JoinResponse).roomId, name);
}

async function enter(roomId: string, name: string): Promise<Player> {
  const options: JoinOptions = {
    name,
    appearance: defaultAppearance(world.manifest.character),
    pet: 'cat',
    tzOffsetMin: 330,
  };
  const room = await new Client(`ws://localhost:${PORT}`).joinById(roomId, options);
  const log: Player['log'] = [];
  room.onMessage('*', (type, message) => log.push({ type, message }));
  // The welcome message arrives right after joining; wait for it.
  await until(() => log.some((m) => m.type === S2C.welcome));
  const welcome = log.find((m) => m.type === S2C.welcome)!.message as WelcomeMessage;
  const p: Player = {
    room,
    id: welcome.id,
    roomId,
    welcome,
    log,
    seq: 0,
    x: welcome.x,
    y: welcome.y,
    snapshot: (id = welcome.id) => (room.state as { players: Map<string, PlayerSnapshot> }).players?.get(id),
    messages: <T>(type: string) => log.filter((m) => m.type === type).map((m) => m.message as T),
    move(x, y, dir = 'down', moving = true) {
      p.seq += 1;
      room.send(C2S.move, { seq: p.seq, x, y, dir, moving });
    },
    async walk(x, y) {
      // Hops of at most 30px every 300ms stay inside the speed allowance.
      for (;;) {
        const dx = x - p.x;
        const dy = y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.01) break;
        const k = Math.min(1, 30 / dist);
        p.x += dx * k;
        p.y += dy * k;
        p.move(p.x, p.y, 'down', true);
        await sleep(300);
      }
    },
    async walkToTile(map, tx, ty) {
      // Route with the shared A*, then walk the tile centres (feet sit 11px down the tile).
      const grid = world.maps.get(map)!.collision;
      const route = findPath(grid, { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) }, { x: tx, y: ty });
      if (!route) throw new Error(`no path to ${map} tile ${tx},${ty}`);
      for (const step of route.slice(1)) await p.walk(step.x * TILE + TILE / 2, step.y * TILE + FEET_ANCHOR.y);
    },
  };
  return p;
}

async function main(): Promise<void> {
  const game = createServer({ maxPlayers: CAPACITY });
  await game.listen(PORT);
  const opened: Player[] = [];
  const track = (p: Player): Player => {
    opened.push(p);
    return p;
  };

  try {
    // (a) server list
    const list = (await (await fetch(`${HTTP}/api/servers`)).json()) as ServerListResponse;
    check('(a) /api/servers lists 4 named servers', list.servers.length === 4 && list.servers.every((s) => s.capacity === CAPACITY));

    // (j) ICE servers for voice
    const ice = (await (await fetch(`${HTTP}/api/ice`)).json()) as { iceServers: { urls: string | string[]; username?: string }[] };
    check('(j) /api/ice gives STUN and no TURN when none is configured', ice.iceServers.length === 1 && ice.iceServers[0]?.username === undefined);
    const turn = iceConfig({ TURN_HOST: 'turn.example.com', TURN_SECRET: 's3cret' } as NodeJS.ProcessEnv, 1_000_000_000_000).iceServers[1];
    const expectedName = `${1_000_000_000 + 12 * 3600}:study`;
    check(
      '(j) TURN credentials are an expiring HMAC of the shared secret',
      turn?.username === expectedName && (turn as { credential?: string }).credential === createHmac('sha1', 's3cret').update(expectedName).digest('base64'),
    );

    // (b) two clients, same server, see each other
    const a = track(await join('Maple', 'Alice'));
    const b = track(await join('Maple', 'Bob'));
    check('(b) both clients joined the same instance', a.roomId === b.roomId);
    check('(b) each sees both players in state', await until(() => a.snapshot(b.id) !== undefined && b.snapshot(a.id) !== undefined));
    check('(b) names and hub spawn are set by the server', a.snapshot()?.name === 'Alice' && a.snapshot()?.map === world.start.map);
    check('(b) invite code was issued', /^[A-Z2-9]{5}$/.test(a.welcome.inviteCode) && a.welcome.inviteCode === b.welcome.inviteCode);

    // (c) an impossible move is corrected and not applied
    const startX = a.x;
    a.move(startX + 300, a.y);
    check('(c) a move far beyond walking speed is corrected', await until(() => a.messages(S2C.correct).length > 0));
    await sleep(200);
    check('(c) the rejected move did not reach other players', Math.abs((b.snapshot(a.id)?.x ?? 0) - startX) < 1);

    // (d) a legal step is accepted
    a.x = startX + 5;
    a.move(a.x, a.y, 'right', true);
    check('(d) a legal move is accepted and synced', await until(() => Math.abs((b.snapshot(a.id)?.x ?? 0) - (startX + 5)) < 0.5));
    check('(d) the mover shows a walking animation', b.snapshot(a.id)?.anim === 'walk');
    a.move(a.x, a.y, 'right', false);

    // (g) proximity chat, profanity mask, cooldown, block
    a.room.send(C2S.chat, { text: 'hello there' });
    check('(g) nearby player receives chat', await until(() => b.messages<ChatMessageOut>(S2C.chat).some((m) => m.text === 'hello there' && m.name === 'Alice')));
    await sleep(900);
    a.room.send(C2S.chat, { text: 'what the f.u.c.k and sh1t' });
    check(
      '(g) profanity is masked',
      await until(() => b.messages<ChatMessageOut>(S2C.chat).some((m) => m.text === 'what the ******* and ****')),
      JSON.stringify(b.messages<ChatMessageOut>(S2C.chat).map((m) => m.text)),
    );
    a.room.send(C2S.chat, { text: 'too fast' });
    check('(g) chat inside the cooldown is denied', await until(() => a.messages<{ reason: string }>(S2C.chatDenied).some((m) => m.reason === 'cooldown')));
    // (i) voice signaling: join, relay offer/answer/candidate, membership and block rules, leave
    const offer = { to: a.id, data: { kind: 'offer', sdp: 'v=0 test' } };
    b.room.send(C2S.voiceSignal, offer);
    await sleep(300);
    check('(i) signals from someone not in the call are dropped', a.messages(S2C.voiceSignal).length === 0);
    a.room.send(C2S.voiceJoin);
    check('(i) the first voice member is told the call is empty', await until(() => a.messages<VoicePeersMessage>(S2C.voicePeers).some((m) => m.ids.length === 0)));
    b.room.send(C2S.voiceJoin);
    check('(i) a joiner is told who is already in the call', await until(() => b.messages<VoicePeersMessage>(S2C.voicePeers).some((m) => m.ids.includes(a.id))));
    check('(i) existing members hear about the joiner', await until(() => a.messages<VoicePeerMessage>(S2C.voicePeerJoined).some((m) => m.id === b.id)));
    b.room.send(C2S.voiceSignal, offer);
    check(
      '(i) an offer is relayed with the sender id',
      await until(() => a.messages<VoiceSignalOut>(S2C.voiceSignal).some((m) => m.from === b.id && m.data.kind === 'offer')),
    );
    a.room.send(C2S.voiceSignal, { to: b.id, data: { kind: 'answer', sdp: 'v=0 answer' } });
    a.room.send(C2S.voiceSignal, { to: b.id, data: { kind: 'candidate', candidate: { candidate: 'x', sdpMid: '0' } } });
    check('(i) answers and ICE candidates are relayed', await until(() => b.messages<VoiceSignalOut>(S2C.voiceSignal).length === 2));
    a.room.send(C2S.voiceSignal, { to: b.id, data: { kind: 'offer', sdp: 'x'.repeat(3_800) } });
    a.room.send(C2S.voiceSignal, { to: b.id, data: { kind: 'bogus' } });
    a.room.send(C2S.voiceSignal, { to: 'nobody', data: { kind: 'offer', sdp: 'v=0' } });
    await sleep(300);
    check('(i) oversized, malformed and misaddressed signals are dropped', b.messages(S2C.voiceSignal).length === 2);
    b.room.send(C2S.block, { targetId: a.id });
    await sleep(300);
    a.room.send(C2S.voiceSignal, { to: b.id, data: { kind: 'offer', sdp: 'v=0 blocked' } });
    b.room.send(C2S.voiceSignal, { to: a.id, data: { kind: 'offer', sdp: 'v=0 blocked' } });
    await sleep(300);
    check('(i) nothing is relayed between blocked players', b.messages(S2C.voiceSignal).length === 2 && a.messages(S2C.voiceSignal).length === 1);
    a.room.send(C2S.voiceLeave);
    b.room.send(C2S.voiceLeave);
    b.room.send(C2S.unblock, { targetId: a.id });
    await sleep(300);
    a.room.send(C2S.voiceJoin);
    b.room.send(C2S.voiceJoin);
    await until(() => b.messages<VoicePeersMessage>(S2C.voicePeers).length === 2);
    a.room.send(C2S.voiceLeave);
    check('(i) leaving the call notifies the others', await until(() => b.messages<VoicePeerMessage>(S2C.voicePeerLeft).some((m) => m.id === a.id)));
    b.room.send(C2S.voiceLeave);

    b.room.send(C2S.block, { targetId: a.id });
    await sleep(900);
    const before = b.messages(S2C.chat).length;
    a.room.send(C2S.chat, { text: 'can you hear me' });
    await sleep(400);
    check('(g) a blocked sender is not delivered', b.messages(S2C.chat).length === before);
    check('(g) filterProfanity leaves innocent words alone', filterProfanity('Scunthorpe classic assistant shiitake').flagged === false);

    // (e) doors
    a.room.send(C2S.door, { doorId: 'to-library' });
    await sleep(300);
    check('(e) a door used from far away is rejected', a.messages(S2C.teleport).length === 0 && a.snapshot()?.map === 'hub');
    const door = world.maps.get('hub')!.doors.get('to-library')!;
    await a.walkToTile('hub', Math.floor((door.rect.x + door.rect.width / 2) / TILE), Math.floor((door.rect.y + door.rect.height + 10) / TILE));
    a.room.send(C2S.door, { doorId: 'to-library' });
    const toLibrary = await until(() => a.messages<TeleportMessage>(S2C.teleport).some((t) => t.map === 'library' && t.reason === 'door'));
    check('(e) walking to the library door and using it teleports into the library', toLibrary);
    if (toLibrary) {
      const t = a.messages<TeleportMessage>(S2C.teleport).find((m) => m.map === 'library')!;
      a.x = t.x;
      a.y = t.y;
    }
    check('(e) the synced map changes', await until(() => a.snapshot()?.map === 'library'));

    // (f) sitting
    a.room.send(C2S.sit, { seatId: 'seat-1' });
    check('(f) sitting on a far seat is rejected', await until(() => a.messages<SitResultMessage>(S2C.sitResult).some((r) => !r.ok && r.reason === 'far')));
    a.room.send(C2S.sit, { seatId: 'nonexistent' });
    check('(f) an unknown seat is rejected', await until(() => a.messages<SitResultMessage>(S2C.sitResult).some((r) => !r.ok && r.reason === 'unknown')));
    // A near-side chair (faces up): stand on the floor tile below it, then sit.
    const library = world.maps.get('library')!;
    const seat = library.objects.seats.filter((s) => s.facing === 'up').sort((p, q) => Math.hypot(p.tx * TILE - a.x, p.ty * TILE - a.y) - Math.hypot(q.tx * TILE - a.x, q.ty * TILE - a.y))[0]!;
    await a.walkToTile('library', seat.tx, seat.ty + 1);
    a.room.send(C2S.sit, { seatId: seat.id });
    check('(f) sitting on a nearby free seat works', await until(() => a.messages<SitResultMessage>(S2C.sitResult).some((r) => r.ok && r.seatId === seat.id)));
    check('(f) the seat is recorded in synced state', await until(() => a.snapshot()?.seatId === seat.id && a.snapshot()?.anim === 'sit'));

    // timers and the silent zone
    a.room.send(C2S.chat, { text: 'psst' });
    check('(f) chat is denied in the silent library', await until(() => a.messages<{ reason: string }>(S2C.chatDenied).some((m) => m.reason === 'silent')));
    a.room.send(C2S.timerStart, { mode: 'pomodoro', focusMin: 25, breakMin: 5, autoRepeat: false, subject: 'math' });
    check(
      '(f) the server starts the timer and syncs it',
      await until(() => a.snapshot()?.phase === 'focus' && (a.snapshot()?.phaseEndsAt ?? 0) > Date.now() && a.snapshot()?.subject === 'math'),
    );
    check('(f) a focusing player shows the study animation', await until(() => a.snapshot()?.anim === 'study'));
    a.room.send(C2S.timerStop, {});
    check('(f) stopping returns the timer to idle', await until(() => a.snapshot()?.phase === 'idle'));
    a.room.send(C2S.stand, {});
    check('(f) standing up teleports back and frees the seat', await until(() => a.messages<TeleportMessage>(S2C.teleport).some((t) => t.reason === 'stand') && a.snapshot()?.seatId === ''));
    check('(f) a timer cannot start while standing', (a.room.send(C2S.timerStart, { mode: 'pomodoro', focusMin: 25, breakMin: 5, autoRepeat: false, subject: 'math' }), await sleep(300), a.snapshot()?.phase === 'idle'));

    // (h) the instance cap and invite codes
    const full = await post({ server: 'Maple' });
    check('(h) a full instance is never returned', (full.json as unknown as JoinResponse).roomId !== a.roomId);
    const c = track(await enter((full.json as unknown as JoinResponse).roomId, 'Cara'));
    const d = track(await join('Maple', 'Dan'));
    check('(h) the next player is placed in the fullest instance with space', d.roomId === c.roomId);
    const e = track(await join('Maple', 'Eli'));
    check('(h) a third instance opens when the second fills', e.roomId !== a.roomId && e.roomId !== c.roomId);
    const after = (await (await fetch(`${HTTP}/api/servers`)).json()) as ServerListResponse;
    const maple = after.servers.find((s) => s.name === 'Maple')!;
    check('(h) the server list sums players across instances', maple.players === 5 && maple.instances === 3, JSON.stringify(maple));

    const byCodeFull = await post({ inviteCode: a.welcome.inviteCode });
    check('(h) an invite code for a full instance is refused (409)', byCodeFull.status === 409);
    const byCode = await post({ inviteCode: `${e.welcome.inviteCode.slice(0, 2)}-${e.welcome.inviteCode.slice(2).toLowerCase()}` });
    check('(h) an invite code finds its exact instance', byCode.status === 200 && (byCode.json as unknown as JoinResponse).roomId === e.roomId);
    check('(h) an unknown invite code is a 404', (await post({ inviteCode: 'ZZZZZ' })).status === 404);
    check('(h) a bad request is a 400 with an error', (await post({ server: 'Nowhere' })).status === 400 && (await post('x')).status === 400);
  } finally {
    for (const p of opened) await p.room.leave().catch(() => undefined);
    await game.shutdown().catch(() => undefined);
  }
}

main()
  .catch((error: unknown) => {
    failures += 1;
    console.log('FAIL  unexpected error', error);
  })
  .finally(() => {
    console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
  });
