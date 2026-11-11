import {
  MAX_SESSION_MINUTES,
  RECENT_SESSIONS_SHOWN,
  STATS_DAYS,
  STREAK_MIN_MINUTES,
  coinsForMinutes,
  computeStreaks,
  dayKeyAt,
  shiftDay,
  type DayStat,
  type SessionRecord,
  type StatsMessage,
  type StatsResponse,
} from '@study/shared';
import type { PrismaClient } from '../generated/prisma/client';
import { withDb } from './client';

interface DayRow {
  day: string;
  minutes: number;
  sessions: number;
}

/** Minutes and completed sessions per local day, where the day is that of each session's end. */
async function dayRows(prisma: PrismaClient, userId: string, tzOffsetMin: number): Promise<DayRow[]> {
  return prisma.$queryRaw<DayRow[]>`
    SELECT to_char("endedAt" + make_interval(mins => ${tzOffsetMin}::int), 'YYYY-MM-DD') AS day,
           SUM("minutes")::int AS minutes,
           (COUNT(*) FILTER (WHERE "completed"))::int AS sessions
    FROM "StudySession"
    WHERE "userId" = ${userId}
    GROUP BY 1`;
}

/** Everything the stats page shows. `tzOffsetMin` is minutes east of UTC. */
export function loadStats(userId: string, tzOffsetMin: number, now: number): Promise<StatsResponse> {
  return withDb(async (prisma) => {
    const [rows, user, subjects, recent] = await Promise.all([
      dayRows(prisma, userId, tzOffsetMin),
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } }),
      prisma.studySession.groupBy({
        by: ['subject'],
        where: { userId },
        _sum: { minutes: true },
        orderBy: { _sum: { minutes: 'desc' } },
        take: 8,
      }),
      prisma.studySession.findMany({
        where: { userId },
        orderBy: { endedAt: 'desc' },
        take: RECENT_SESSIONS_SHOWN,
        select: { subject: true, startedAt: true, minutes: true, completed: true },
      }),
    ]);

    const byDay = new Map(rows.map((r) => [r.day, r]));
    const today = dayKeyAt(now, tzOffsetMin);
    const stat = (day: string): DayStat => ({ day, minutes: byDay.get(day)?.minutes ?? 0, sessions: byDay.get(day)?.sessions ?? 0 });
    const days: DayStat[] = [];
    for (let i = STATS_DAYS - 1; i >= 0; i--) days.push(stat(shiftDay(today, -i)));

    return {
      today: stat(today),
      days,
      streak: computeStreaks(
        rows.filter((r) => r.minutes >= STREAK_MIN_MINUTES).map((r) => r.day),
        today,
      ),
      totalMinutes: rows.reduce((sum, r) => sum + r.minutes, 0),
      totalSessions: rows.reduce((sum, r) => sum + r.sessions, 0),
      coins: user.coins,
      subjects: subjects.map((s) => ({ subject: s.subject, minutes: s._sum.minutes ?? 0 })),
      recent: recent.map((r) => ({
        subject: r.subject,
        startedAt: r.startedAt.getTime(),
        minutes: r.minutes,
        completed: r.completed,
      })),
    };
  });
}

/** The compact numbers pushed to the player's client after each session. */
export async function loadStatsMessage(userId: string, tzOffsetMin: number, now: number): Promise<StatsMessage> {
  const stats = await loadStats(userId, tzOffsetMin, now);
  return {
    coins: stats.coins,
    todayMinutes: stats.today.minutes,
    todaySessions: stats.today.sessions,
    streak: stats.streak,
  };
}

/**
 * Saves a session recorded by the room's timer and pays its coins, all in one
 * transaction so the user's balance always equals the sum of the ledger.
 * Returns false when the same session was already saved (a retry).
 */
export function recordServerSession(userId: string, record: SessionRecord): Promise<boolean> {
  const minutes = Math.min(Math.max(0, Math.floor(record.minutes)), MAX_SESSION_MINUTES);
  if (minutes < 1) return Promise.resolve(false);
  const startedAt = new Date(record.startedAt);
  return withDb((prisma) =>
    prisma.$transaction(async (tx) => {
      const created = await tx.studySession.createMany({
        data: [
          {
            userId,
            subject: record.subject,
            mode: record.mode,
            startedAt,
            endedAt: new Date(record.endedAt),
            minutes,
            completed: record.completed,
            source: 'server',
          },
        ],
        skipDuplicates: true,
      });
      if (created.count === 0) return false;
      const session = await tx.studySession.findUniqueOrThrow({
        where: { userId_startedAt: { userId, startedAt } },
        select: { id: true },
      });
      const coins = coinsForMinutes(minutes);
      await tx.coinTransaction.create({ data: { userId, amount: coins, reason: 'focus', sessionId: session.id } });
      await tx.user.update({ where: { id: userId }, data: { coins: { increment: coins } } });
      return true;
    }),
  );
}

/** Saves history from a guest device. Duplicates are skipped and no coins are paid. */
export function importSessions(userId: string, records: readonly SessionRecord[]): Promise<number> {
  if (records.length === 0) return Promise.resolve(0);
  return withDb(async (prisma) => {
    const result = await prisma.studySession.createMany({
      data: records.map((r) => ({
        userId,
        subject: r.subject,
        mode: r.mode,
        startedAt: new Date(r.startedAt),
        endedAt: new Date(r.endedAt),
        minutes: r.minutes,
        completed: r.completed,
        source: 'import',
      })),
      skipDuplicates: true,
    });
    return result.count;
  });
}
