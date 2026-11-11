import type { Application, Request, Response } from 'express';
import { EMAIL_MAX_LENGTH, type FriendsResponse } from '@study/shared';
import { createRateLimiter } from '../auth/rateLimit';
import { serverConfig } from '../config';
import { findFriendTarget, listFriends, removeFriendship, requestFriend, respondToRequest } from '../db/friends';
import { homeBus } from '../homes/events';
import { bodyOf, fail, requireUser, route } from './accountRoutes';

const WINDOW_MS = 10 * 60 * 1000;
/** Friend requests per account: stops one account from sweeping through names. */
const requests = createRateLimiter(30, WINDOW_MS, () => serverConfig.now());

/** Forgets the request counters. Tests only. */
export function resetFriendLimits(): void {
  requests.clear();
}

async function respondWithList(res: Response, userId: string, status = 200): Promise<void> {
  const body: FriendsResponse = { friends: await listFriends(userId) };
  res.status(status).json(body);
}

async function list(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  await respondWithList(res, userId);
}

async function request(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  const text = bodyOf(req).nameOrEmail;
  if (typeof text !== 'string' || text.trim() === '' || text.length > EMAIL_MAX_LENGTH) return fail(res, 400, 'Enter a display name or an email address');
  if (!requests.hit(userId)) return fail(res, 429, 'Too many requests. Please wait a few minutes and try again.');

  const target = await findFriendTarget(text);
  if (target.kind === 'none') return fail(res, 404, 'No one found with that name or email');
  if (target.kind === 'ambiguous') return fail(res, 409, 'Several people use that name. Add them by email instead.');
  if (target.id === userId) return fail(res, 400, 'That is you');

  const result = await requestFriend(userId, target.id);
  if (result === 'already-friends') return fail(res, 409, 'You are already friends');
  if (result === 'already-sent') return fail(res, 409, 'You already sent a request to them');
  // Two people adding each other become friends straight away.
  if (result === 'accepted') homeBus.emit('friendship', userId, target.id);
  await respondWithList(res, userId);
}

async function respond(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  const input = bodyOf(req);
  if (typeof input.id !== 'string' || input.id === '' || typeof input.accept !== 'boolean') return fail(res, 400, 'Say whose request and whether to accept it');
  if (!(await respondToRequest(userId, input.id, input.accept))) return fail(res, 404, 'There is no such friend request');
  if (input.accept) homeBus.emit('friendship', userId, input.id);
  await respondWithList(res, userId);
}

async function remove(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  const other = req.params.id;
  if (typeof other !== 'string' || other === '') return fail(res, 400, 'Say who');
  const { removed, wasFriends } = await removeFriendship(userId, other);
  if (!removed) return fail(res, 404, 'You are not friends and have no request with them');
  // Visitors who were allowed in only as friends are shown out.
  if (wasFriends) homeBus.emit('friendship', userId, other);
  await respondWithList(res, userId);
}

export function registerFriendRoutes(app: Application): void {
  app.get('/api/friends', route(list));
  app.post('/api/friends/request', route(request));
  app.post('/api/friends/respond', route(respond));
  app.delete('/api/friends/:id', route(remove));
}
