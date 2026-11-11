import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';
import { Client, type Room } from '@colyseus/sdk';
import {
  BUDDIES, C2S, S2C, TILE, defaultAppearance, feetBlocked,
  type BuddyLinks, type FriendsResponse, type JoinResponse, type SitResultMessage, type TimerEventMessage,
} from '@study/shared';
import { issueToken } from '../auth/token';
import { createServer } from '../createServer';
import { areFriends } from '../db/friends';
import { closeDb, db } from '../db/client';
import { enqueue } from '../rooms/persist';
import { getWorld } from '../world/maps';

async function until<T>(read: () => T | undefined, failure: string): Promise<T> {
  for (let attempt = 0; attempt < 160; attempt++) {
    const value = read();
    if (value !== undefined) return value;
    await setTimeout(25);
  }
  assert.fail(failure);
}

test('mutual buddy requests persist and only simultaneous focus in one room waters the pair tree', { timeout: 30_000 }, async () => {
  const port = Number(process.env.BUDDY_TEST_PORT ?? 25000 + Math.floor(Math.random() * 10_000));
  const base = `http://localhost:${port}`;
  const world = getWorld();
  const initialStart = world.start;
  const suffix = randomUUID();
  const accounts: { id: string; name: string }[] = [];
  const rooms = new Set<Room>();
  const stopTimers = new Map<Room, () => Promise<void>>();
  let offset = 0;
  const now = (): number => Date.now() + offset;
  const game = createServer({ testClock: now });

  async function join(name: string, map: string, server = 'Maple') {
    const area = world.maps.get(map);
    assert.ok(area);
    const seat = [...area.seats.values()].find((item) =>
      !feetBlocked(area.collision, item.tx * TILE + 8, item.ty * TILE + 27));
    assert.ok(seat);
    world.start = { map, spawn: { id: 'test', x: seat.tx * TILE + 8, y: seat.ty * TILE + 27, facing: 'up' } };

    const user = accounts.find((account) => account.name === name);
    assert.ok(user);
    const reserve = await fetch(base + '/api/join', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ server }),
    });
    assert.equal(reserve.status, 200);
    const { roomId } = await reserve.json() as JoinResponse;
    const room = await new Client(base).joinById(roomId, {
      name, token: issueToken(user.id, now()), appearance: defaultAppearance(world.manifest.character),
    });
    rooms.add(room);
    const messages: { type: string | number; payload: unknown }[] = [];
    room.onMessage('*', (type, payload) => messages.push({ type, payload }));
    const views = () => messages.filter((m) => m.type === BUDDIES.links).map((m) => m.payload as BuddyLinks);
    const stop = async (): Promise<void> => {
      room.send(C2S.timerStop);
      await until(() => messages.find((m) => m.type === S2C.session), 'Focus did not stop');
      await enqueue(user.id, async () => undefined);
      stopTimers.delete(room);
    };
    const start = async (): Promise<void> => {
      room.send(C2S.sit, { seatId: seat.id });
      await until(() => messages.find((m) => m.type === S2C.sitResult && (m.payload as SitResultMessage).ok), 'Could not sit');
      room.send(C2S.timerStart, { mode: 'stopwatch', focusMin: 25, breakMin: 5, subject: 'general' });
      await until(() => messages.find((m) => m.type === S2C.timerEvent &&
        (m.payload as TimerEventMessage).event === 'focusStart'), 'Focus did not start');
      stopTimers.set(room, stop);
    };
    return { room, views, start, stop };
  }

  try {
    for (const name of ['BuddyAlice', 'BuddyBen', 'BuddyCasey']) {
      accounts.push(await db().user.create({
        data: { name, email: `${name.toLowerCase()}-${suffix}@example.test`, passwordHash: 'test only' },
        select: { id: true, name: true },
      }));
    }
    await game.listen(port);
    const alice = await join('BuddyAlice', 'library');
    const ben = await join('BuddyBen', 'cafe');
    const casey = await join('BuddyCasey', 'cafe', 'Birch');
    assert.equal(alice.room.roomId, ben.room.roomId);
    alice.room.send(BUDDIES.action, { kind: 'request', peerId: ben.room.sessionId });
    const incoming = await until(() => ben.views().at(-1)?.links.find((link) => link.status === 'incoming'), 'Buddy request did not arrive');
    assert.equal(incoming.name, 'BuddyAlice');

    casey.room.send(BUDDIES.action, { kind: 'accept', linkId: incoming.id });
    await ben.room.leave();
    rooms.delete(ben.room);
    const rejoined = await join('BuddyBen', 'cafe');
    await until(() => rejoined.views().at(-1)?.links.find((link) => link.id === incoming.id && link.status === 'incoming'), 'Pending request was lost across reconnect');

    const [aliceAccount, benAccount] = accounts;
    const headers = { authorization: `Bearer ${issueToken(benAccount.id, now())}`, 'content-type': 'application/json' };
    const friends = await fetch(base + '/api/friends', { headers });
    assert.equal(friends.status, 200);
    const pending = await friends.json() as FriendsResponse;
    assert.equal(pending.friends.find((friend) => friend.id === aliceAccount.id)?.status, 'incoming');
    const accept = await fetch(base + '/api/friends/respond', {
      method: 'POST', headers, body: JSON.stringify({ id: aliceAccount.id, accept: true }),
    });
    assert.equal(accept.status, 200);
    assert.equal(await areFriends(aliceAccount.id, benAccount.id), true);
    await until(() => alice.views().at(-1)?.links.find((link) => link.id === incoming.id && link.status === 'accepted'), 'Acceptance did not reach sender');
    await alice.start();
    offset += 61_000;
    await setTimeout(350);
    assert.equal(alice.views().at(-1)?.links[0].focusMinutes, 0, 'A solo focus minute watered the buddy tree');
    await rejoined.start();
    offset += 61_000;
    await until(() => alice.views().at(-1)?.links.find((link) => link.focusMinutes === 1), 'Shared focus did not water the buddy tree');
    await until(() => rejoined.views().at(-1)?.links.find((link) => link.focusMinutes === 1), 'The recipient did not get the tree update');
    assert.equal(casey.views().at(-1)?.links.length, 0, 'A non-member saw a private buddy tree');

    await rejoined.stop();
    await rejoined.room.leave();
    rooms.delete(rejoined.room);
    const elsewhere = await join('BuddyBen', 'cafe', 'Birch');
    await until(() => elsewhere.views().at(-1)?.links.find((link) => link.focusMinutes === 1), 'Tree did not survive reconnect');
    await elsewhere.start();
    offset += 61_000;
    await setTimeout(350);
    assert.equal(alice.views().at(-1)?.links[0].focusMinutes, 1, 'Separate rooms watered the buddy tree');
    assert.equal(elsewhere.views().at(-1)?.links[0].focusMinutes, 1);
    await elsewhere.stop();
    await alice.stop();
    const removed = await fetch(base + '/api/friends/' + aliceAccount.id, {
      method: 'DELETE', headers: { authorization: `Bearer ${issueToken(benAccount.id, now())}` },
    });
    assert.equal(removed.status, 200);
    await until(() => alice.views().at(-1)?.links.length === 0 ? true : undefined, 'Removing a friend did not remove their tree');
    assert.equal(await db().buddyFocus.count({ where: { pairId: incoming.id } }), 0);
  } finally {
    world.start = initialStart;
    for (const stop of stopTimers.values()) await stop().catch(() => undefined);
    await Promise.all([...rooms].map((room) => room.leave()));
    await Promise.all(accounts.map(({ id }) => enqueue(id, async () => undefined)));
    await game.shutdown();
    try {
      await db().user.deleteMany({ where: { id: { in: accounts.map((account) => account.id) } } });
    } finally {
      await closeDb();
    }
  }
});
