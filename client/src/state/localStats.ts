import {
  computeStreaks,
  dayKeyAt,
  shiftDay,
  RECENT_SESSIONS_SHOWN,
  STATS_DAYS,
  STREAK_MIN_MINUTES,
  type DayStat,
  type SessionRecord,
  type StatsResponse,
  type SubjectStat,
} from '@study/shared';

/**
 * The same numbers as GET /api/stats, computed from this device's own history.
 * Used by guests, and by the stats page when nobody is signed in.
 */
export function localStats(records: readonly SessionRecord[], tzOffsetMin: number, now = Date.now()): StatsResponse {
  const byDay = new Map<string, DayStat>();
  const bySubject = new Map<string, number>();
  let totalMinutes = 0;
  let totalSessions = 0;

  for (const record of records) {
    const day = dayKeyAt(record.endedAt, tzOffsetMin);
    const stat = byDay.get(day) ?? { day, minutes: 0, sessions: 0 };
    stat.minutes += record.minutes;
    if (record.completed) stat.sessions += 1;
    byDay.set(day, stat);
    bySubject.set(record.subject, (bySubject.get(record.subject) ?? 0) + record.minutes);
    totalMinutes += record.minutes;
    if (record.completed) totalSessions += 1;
  }

  const todayKey = dayKeyAt(now, tzOffsetMin);
  const days: DayStat[] = [];
  for (let i = STATS_DAYS - 1; i >= 0; i--) {
    const day = shiftDay(todayKey, -i);
    days.push(byDay.get(day) ?? { day, minutes: 0, sessions: 0 });
  }
  const qualifying = [...byDay.values()].filter((d) => d.minutes >= STREAK_MIN_MINUTES).map((d) => d.day);
  const subjects: SubjectStat[] = [...bySubject]
    .map(([subject, minutes]) => ({ subject, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
  const recent = [...records]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, RECENT_SESSIONS_SHOWN)
    .map((r) => ({ subject: r.subject, startedAt: r.startedAt, minutes: r.minutes, completed: r.completed }));

  return {
    today: byDay.get(todayKey) ?? { day: todayKey, minutes: 0, sessions: 0 },
    days,
    streak: computeStreaks(qualifying, todayKey),
    totalMinutes,
    totalSessions,
    coins: 0,
    subjects,
    recent,
  };
}
