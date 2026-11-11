import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/** Thrown when Postgres cannot be reached. The API turns it into a 503. */
export class AccountsUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Accounts are unavailable right now', { cause });
    this.name = 'AccountsUnavailableError';
  }
}

const DEFAULT_URL = 'postgresql://study:study@localhost:5432/study_space?schema=public';

let client: PrismaClient | null = null;
let warnedAt = 0;

/** The shared client. It is created on first use and connects lazily, so the server starts without a database. */
export function db(): PrismaClient {
  client ??= new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL ?? DEFAULT_URL,
      // Fail fast when the database is down instead of hanging every request.
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30_000,
      max: 10,
    }),
  });
  return client;
}

/** Closes the connection pool (tests and shutdown). */
export async function closeDb(): Promise<void> {
  const current = client;
  client = null;
  if (current) await current.$disconnect();
}

const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'EPIPE',
  '57P01',
  '57P02',
  '57P03',
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  'P1001',
  'P1002',
  'P1008',
  'P1017',
]);

const CONNECTION_MESSAGE =
  /ECONNREFUSED|connection terminated|timeout exceeded when trying to connect|reach database|connect ETIMEDOUT/i;

/** True when an error means "the database is not reachable" rather than "the query is wrong". */
export function isConnectionError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 4) return false;
  const e = error as { code?: unknown; message?: unknown; cause?: unknown; errors?: unknown; meta?: unknown };
  if (typeof e.code === 'string' && CONNECTION_CODES.has(e.code)) return true;
  if (typeof e.message === 'string' && CONNECTION_MESSAGE.test(e.message)) return true;
  if (isConnectionError(e.cause, depth + 1)) return true;
  if (e.meta && isConnectionError(e.meta, depth + 1)) return true;
  if (Array.isArray(e.errors)) return e.errors.some((inner) => isConnectionError(inner, depth + 1));
  return false;
}

/** Runs a database task, turning "cannot connect" into AccountsUnavailableError. */
export async function withDb<T>(task: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  try {
    return await task(db());
  } catch (error) {
    if (isConnectionError(error)) {
      if (Date.now() - warnedAt > 30_000) {
        warnedAt = Date.now();
        console.warn('[db] Cannot reach Postgres. Accounts are off until it is back. Start it with: docker compose up -d db');
      }
      throw new AccountsUnavailableError(error);
    }
    throw error;
  }
}

/** 'up' if a trivial query succeeds within two seconds. */
export async function dbStatus(): Promise<'up' | 'down'> {
  try {
    await Promise.race([
      db().$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    return 'up';
  } catch {
    return 'down';
  }
}
