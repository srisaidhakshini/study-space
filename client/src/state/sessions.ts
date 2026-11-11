import { localDayKey, type SessionRecord } from '@study/shared';
import { Emitter, loadJson, saveJson } from './emitter';

const KEY = 'study-space/sessions';
const MAX_KEPT = 500;

export interface DayTotals {
  /** Completed focus sessions. */
  sessions: number;
  /** Minutes of focus, including sessions ended early. */
  minutes: number;
}

/** Local study history. Phase 3 moves this to the server database. */
export class SessionStore {
  readonly changed = new Emitter();
  private records: SessionRecord[] = loadJson<SessionRecord[]>(KEY) ?? [];

  add(record: SessionRecord): void {
    this.records.push(record);
    if (this.records.length > MAX_KEPT) this.records = this.records.slice(-MAX_KEPT);
    saveJson(KEY, this.records);
    this.changed.emit();
  }

  all(): readonly SessionRecord[] {
    return this.records;
  }

  today(now = Date.now()): DayTotals {
    const key = localDayKey(now);
    const totals: DayTotals = { sessions: 0, minutes: 0 };
    for (const r of this.records) {
      if (localDayKey(r.endedAt) !== key) continue;
      totals.minutes += r.minutes;
      if (r.completed) totals.sessions += 1;
    }
    return totals;
  }
}
