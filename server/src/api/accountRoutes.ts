import type { Application, Request, Response } from 'express';
import {
  MAX_IMPORT_SESSIONS,
  MAX_SESSION_MINUTES,
  SUBJECTS,
  type Appearance,
  type ApiError,
  type AuthResponse,
  type ImportResponse,
  type MeResponse,
  type SessionRecord,
} from '@study/shared';
import { createRateLimiter } from '../auth/rateLimit';
import { decoyHash, hashPassword, verifyPassword } from '../auth/password';
import { issueToken, verifyToken } from '../auth/token';
import { parseEmail, parseName, parsePassword } from '../auth/validate';
import { serverConfig } from '../config';
import { AccountsUnavailableError } from '../db/client';
import { createUser, findUserByEmail, findUserById, toAccountInfo, touchLogin, updateProfile, type ProfilePatch } from '../db/accounts';
import { importSessions, loadStats } from '../db/stats';
import { isFiniteNumber, isPlainObject } from '../rooms/text';
import { getWorld } from '../world/maps';

const WINDOW_MS = 10 * 60 * 1000;
/** Attempts per IP + email: stops password guessing against one account. */
const perAccount = createRateLimiter(10, WINDOW_MS, () => serverConfig.now());
/** A looser cap per IP: stops one machine spraying many accounts. */
const perIp = createRateLimiter(100, WINDOW_MS, () => serverConfig.now());

/** Forgets all rate-limit counters. Tests only. */
export function resetRateLimits(): void {
  perAccount.clear();
  perIp.clear();
}

function fail(res: Response, status: number, error: string): void {
  const body: ApiError = { error };
  res.status(status).json(body);
}

/** Runs an async handler; "database down" becomes a 503 and anything else a JSON 500. */
const route =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response): void => {
    handler(req, res).catch((error: unknown) => {
      if (res.headersSent) return;
      if (error instanceof AccountsUnavailableError) return fail(res, 503, 'Accounts are unavailable right now');
      console.error('[api]', error);
      fail(res, 500, 'Something went wrong on the server');
    });
  };

function bodyOf(req: Request): Record<string, unknown> {
  return isPlainObject(req.body) ? (req.body as Record<string, unknown>) : {};
}

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim();
}

/** The signed-in user's id, or null after sending a 401. */
function requireUser(req: Request, res: Response): string | null {
  const userId = verifyToken(bearer(req), serverConfig.now());
  if (!userId) {
    fail(res, 401, 'Sign in to continue');
    return null;
  }
  return userId;
}

function clampTz(value: number): number {
  return Math.min(840, Math.max(-840, Math.round(value)));
}

function readAppearance(raw: unknown): Appearance | null {
  return isPlainObject(raw) ? getWorld().sanitizeAppearance(raw as Partial<Appearance>) : null;
}

function readPet(raw: unknown): string | null {
  return typeof raw === 'string' && getWorld().petIds.includes(raw) ? raw : null;
}

/** True (and answers 429) when this attempt exceeds a limit. */
function limited(req: Request, res: Response, email: string): boolean {
  const ip = req.ip ?? 'unknown';
  if (!perIp.hit(ip) || !perAccount.hit(`${ip}|${email}`)) {
    fail(res, 429, 'Too many attempts. Please wait a few minutes and try again.');
    return true;
  }
  return false;
}

async function register(req: Request, res: Response): Promise<void> {
  const input = bodyOf(req);
  const email = parseEmail(input.email);
  if ('error' in email) return fail(res, 400, email.error);
  const password = parsePassword(input.password);
  if ('error' in password) return fail(res, 400, password.error);
  const name = parseName(input.name);
  if ('error' in name) return fail(res, 400, name.error);
  if (limited(req, res, email.email)) return;

  const world = getWorld();
  const created = await createUser({
    email: email.email,
    passwordHash: await hashPassword(password.password),
    name: name.name,
    appearance: readAppearance(input.appearance),
    pet: readPet(input.pet) ?? world.petIds[0] ?? '',
    tzOffsetMin: isFiniteNumber(input.tzOffsetMin) ? clampTz(input.tzOffsetMin) : 0,
  });
  if (created === 'exists') return fail(res, 409, 'An account with that email already exists');
  const response: AuthResponse = { token: issueToken(created.id, serverConfig.now()), account: toAccountInfo(created) };
  res.status(201).json(response);
}

async function login(req: Request, res: Response): Promise<void> {
  const input = bodyOf(req);
  const email = parseEmail(input.email);
  const password = typeof input.password === 'string' && input.password.length <= 1024 ? input.password : '';
  // The same answer for "no such email" and "wrong password".
  const wrong = (): void => fail(res, 401, 'Wrong email or password');
  if ('error' in email) return wrong();
  if (limited(req, res, email.email)) return;

  const user = await findUserByEmail(email.email);
  const ok = await verifyPassword(password, user?.passwordHash ?? (await decoyHash()));
  if (!user || !ok) return wrong();

  perAccount.reset(`${req.ip ?? 'unknown'}|${email.email}`);
  const tz = isFiniteNumber(input.tzOffsetMin) ? clampTz(input.tzOffsetMin) : undefined;
  await touchLogin(user.id, tz);
  const response: AuthResponse = { token: issueToken(user.id, serverConfig.now()), account: toAccountInfo(user) };
  res.json(response);
}

async function me(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  const user = await findUserById(userId);
  if (!user) return fail(res, 401, 'Sign in to continue');
  const response: MeResponse = { account: toAccountInfo(user) };
  res.json(response);
}

async function profile(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  const input = bodyOf(req);
  const patch: ProfilePatch = {};
  if (input.name !== undefined) {
    const name = parseName(input.name);
    if ('error' in name) return fail(res, 400, name.error);
    patch.name = name.name;
  }
  if (input.appearance !== undefined) {
    const appearance = readAppearance(input.appearance);
    if (!appearance) return fail(res, 400, 'appearance must be an object');
    patch.appearance = appearance;
  }
  if (input.pet !== undefined) {
    const pet = readPet(input.pet);
    if (pet === null) return fail(res, 400, 'Unknown pet');
    patch.pet = pet;
  }
  if (!(await findUserById(userId))) return fail(res, 401, 'Sign in to continue');
  const user = await updateProfile(userId, patch);
  const response: MeResponse = { account: toAccountInfo(user) };
  res.json(response);
}

async function stats(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  const user = await findUserById(userId);
  if (!user) return fail(res, 401, 'Sign in to continue');
  const asked = Number(req.query.tz);
  const tz = typeof req.query.tz === 'string' && req.query.tz !== '' && Number.isFinite(asked) ? clampTz(asked) : user.tzOffsetMin;
  res.json(await loadStats(userId, tz, serverConfig.now()));
}

/** Reads one imported record, or returns why it is not acceptable. */
function readImported(raw: unknown, now: number): SessionRecord | string {
  if (!isPlainObject(raw)) return 'not an object';
  const { startedAt, endedAt, minutes } = raw;
  if (!isFiniteNumber(startedAt) || !isFiniteNumber(endedAt) || !isFiniteNumber(minutes)) return 'numbers are required';
  if (startedAt >= endedAt) return 'startedAt must be before endedAt';
  if (endedAt > now + 60_000) return 'endedAt is in the future';
  if (startedAt < 946_684_800_000) return 'startedAt is too old';
  const whole = Math.floor(minutes);
  if (whole < 1 || whole > MAX_SESSION_MINUTES) return `minutes must be 1 to ${MAX_SESSION_MINUTES}`;
  if (whole > (endedAt - startedAt) / 60_000 + 1) return 'minutes is longer than the session';
  return {
    subject: SUBJECTS.some((s) => s.id === raw.subject) ? (raw.subject as string) : 'general',
    mode: raw.mode === 'stopwatch' ? 'stopwatch' : 'pomodoro',
    startedAt: Math.floor(startedAt),
    endedAt: Math.floor(endedAt),
    minutes: whole,
    completed: raw.completed === true,
  };
}

async function importHistory(req: Request, res: Response): Promise<void> {
  const userId = requireUser(req, res);
  if (!userId) return;
  const list = bodyOf(req).sessions;
  if (!Array.isArray(list)) return fail(res, 400, 'sessions must be a list');
  if (list.length > MAX_IMPORT_SESSIONS) return fail(res, 400, `At most ${MAX_IMPORT_SESSIONS} sessions can be imported`);
  const now = serverConfig.now();
  const records: SessionRecord[] = [];
  for (const [index, raw] of list.entries()) {
    const record = readImported(raw, now);
    if (typeof record === 'string') return fail(res, 400, `Session ${index + 1}: ${record}`);
    records.push(record);
  }
  if (!(await findUserById(userId))) return fail(res, 401, 'Sign in to continue');
  const response: ImportResponse = { imported: await importSessions(userId, records) };
  res.json(response);
}

export function registerAccountRoutes(app: Application): void {
  app.post('/api/auth/register', route(register));
  app.post('/api/auth/login', route(login));
  app.get('/api/me', route(me));
  app.put('/api/profile', route(profile));
  app.get('/api/stats', route(stats));
  app.post('/api/sessions/import', route(importHistory));
}
