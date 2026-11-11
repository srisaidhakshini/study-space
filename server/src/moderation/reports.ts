import { REPORT_REASON_MAX } from '@study/shared';

export interface Report {
  at: number;
  server: string;
  roomId: string;
  reporterId: string;
  reporterName: string;
  targetId: string;
  targetName: string;
  reason: string;
}

const KEEP = 200;
const reports: Report[] = [];

/** Logs a player report and keeps the most recent ones in memory. */
export function addReport(report: Report): void {
  const entry = { ...report, reason: report.reason.slice(0, REPORT_REASON_MAX) };
  reports.push(entry);
  if (reports.length > KEEP) reports.splice(0, reports.length - KEEP);
  console.log(`[report] ${JSON.stringify(entry)}`);
}

export function recentReports(): readonly Report[] {
  return reports;
}
