import { matchMaker, type IRoomCache } from '@colyseus/core';
import type { Application, Request, Response } from 'express';
import {
  ROOM_NAME,
  SERVER_NAMES,
  type ApiError,
  type JoinResponse,
  type ServerListEntry,
  type ServerListResponse,
} from '@study/shared';
import { serverConfig } from '../config';
import { dbStatus } from '../db/client';
import type { RoomMeta } from '../rooms/WorldRoom';
import { iceRoute } from './ice';
import { isValidInviteCode, normalizeInviteCode, randomInviteCode } from './inviteCodes';

type RoomListing = IRoomCache<RoomMeta>;

async function listRooms(): Promise<RoomListing[]> {
  return (await matchMaker.query({ name: ROOM_NAME })) as RoomListing[];
}

const hasSpace = (room: RoomListing): boolean => !room.locked && room.clients < room.maxClients;

function fail(res: Response, status: number, error: string): void {
  const body: ApiError = { error };
  res.status(status).json(body);
}

/** Opening instances one at a time keeps a burst of joins from each opening its own. */
let createLock: Promise<unknown> = Promise.resolve();
function exclusively<T>(task: () => Promise<T>): Promise<T> {
  const run = createLock.then(task, task);
  createLock = run.catch(() => undefined);
  return run;
}

async function uniqueInviteCode(): Promise<string> {
  const taken = new Set((await listRooms()).map((r) => r.metadata?.inviteCode));
  for (let i = 0; i < 50; i++) {
    const code = randomInviteCode();
    if (!taken.has(code)) return code;
  }
  throw new Error('Could not find a free invite code');
}

/** The fullest instance that still has room (so friends cluster), or a freshly opened one. */
async function pickInstance(server: string): Promise<string> {
  return exclusively(async () => {
    const open = (await listRooms()).filter((r) => r.metadata?.server === server && hasSpace(r));
    open.sort((a, b) => b.clients - a.clients);
    if (open[0]) return open[0].roomId;
    const room = await matchMaker.createRoom(ROOM_NAME, { server, inviteCode: await uniqueInviteCode() });
    return room.roomId;
  });
}

async function listServers(_req: Request, res: Response): Promise<void> {
  const rooms = await listRooms();
  const servers: ServerListEntry[] = SERVER_NAMES.map((name) => {
    const mine = rooms.filter((r) => r.metadata?.server === name);
    return {
      name,
      players: mine.reduce((sum, r) => sum + r.clients, 0),
      capacity: serverConfig.maxPlayers,
      instances: mine.length,
    };
  });
  const body: ServerListResponse = { servers };
  res.json(body);
}

async function join(req: Request, res: Response): Promise<void> {
  const body: unknown = req.body;
  const input = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

  if (input.inviteCode !== undefined) {
    if (typeof input.inviteCode !== 'string') return fail(res, 400, 'inviteCode must be a string');
    const code = normalizeInviteCode(input.inviteCode);
    if (!isValidInviteCode(code)) return fail(res, 404, 'No server has that invite code');
    const room = (await listRooms()).find((r) => r.metadata?.inviteCode === code);
    if (!room) return fail(res, 404, 'No server has that invite code');
    if (!hasSpace(room)) return fail(res, 409, 'That server instance is full');
    const response: JoinResponse = { roomId: room.roomId, server: room.metadata?.server ?? '' };
    res.json(response);
    return;
  }

  if (typeof input.server !== 'string' || !(SERVER_NAMES as readonly string[]).includes(input.server)) {
    return fail(res, 400, `server must be one of: ${SERVER_NAMES.join(', ')}`);
  }
  const roomId = await pickInstance(input.server);
  const response: JoinResponse = { roomId, server: input.server };
  res.json(response);
}

/** Wraps an async handler so a thrown error becomes a JSON 500 instead of a hung request. */
const safe =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response): void => {
    handler(req, res).catch((error: unknown) => {
      console.error('[api]', error);
      if (!res.headersSent) fail(res, 500, 'Something went wrong on the server');
    });
  };

export function registerRoutes(app: Application): void {
  // The server is "ok" even with the database down: guests can still play.
  app.get('/health', safe(async (_req, res) => {
    res.json({ ok: true, db: await dbStatus() });
  }));
  app.get('/api/servers', safe(listServers));
  app.post('/api/join', safe(join));
  app.get('/api/ice', iceRoute);
}
