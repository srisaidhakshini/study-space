import {
  getSubject,
  STATS_DAYS,
  STREAK_MIN_MINUTES,
  type DayStat,
  type SessionSummary,
  type StatsResponse,
  type SubjectStat,
} from '@study/shared';
import { app } from '../app';
import { tzOffsetMin } from '../net/http';
import { localStats } from '../state/localStats';
import { openAccountPanel } from './AccountPanel';
import { button, h, setChildren } from './dom';
import { openModal, type ModalHandle } from './modal';
import { errorMessage } from './netAccess';
import { coinIcon, flameIcon } from './pixelIcon';
import { subjectIcon } from './subjectIcon';

let open: ModalHandle | null = null;

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "Mon 3 Nov" for a YYYY-MM-DD key (the key is already the player's local day). */
function dayLabel(day: string, long = true): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString([], {
    timeZone: 'UTC',
    weekday: 'short',
    ...(long ? { day: 'numeric', month: 'short' } : {}),
  });
}

function card(label: string, value: Node | string, note?: string): HTMLElement {
  return h(
    'div',
    { class: 'stat-card' },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-value' }, value),
    note ? h('span', { class: 'hint' }, note) : null,
  );
}

function chart(days: DayStat[], todayKey: string): HTMLElement {
  const peak = Math.max(30, ...days.map((d) => d.minutes));
  const bars = days.map((d) => {
    const percent = d.minutes === 0 ? 0 : Math.max(6, Math.round((d.minutes / peak) * 100));
    return h(
      'div',
      { class: `chart-col${d.day === todayKey ? ' today' : ''}`, attrs: { title: `${dayLabel(d.day)}: ${formatMinutes(d.minutes)}` } },
      h('div', { class: 'chart-plot' }, h('div', { class: 'chart-bar', attrs: { style: `height:${percent}%` } })),
      h('span', { class: 'chart-tick' }, d.day.slice(8)),
    );
  });
  const total = days.reduce((sum, d) => sum + d.minutes, 0);
  const table = h(
    'table',
    { class: 'stat-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Day'), h('th', {}, 'Minutes'), h('th', {}, 'Sessions'))),
    h(
      'tbody',
      {},
      ...[...days].reverse().map((d) => h('tr', {}, h('td', {}, dayLabel(d.day)), h('td', {}, String(d.minutes)), h('td', {}, String(d.sessions)))),
    ),
  );
  return h(
    'section',
    { class: 'stat-section' },
    h('h2', { class: 'stat-heading' }, `Last ${STATS_DAYS} days`),
    h(
      'div',
      { class: 'chart', attrs: { role: 'img', 'aria-label': `Focus minutes per day over the last ${STATS_DAYS} days, ${total} minutes in total.` } },
      ...bars,
    ),
    h('details', { class: 'chart-details' }, h('summary', {}, 'Show as a table'), table),
  );
}

function subjects(list: SubjectStat[]): HTMLElement {
  const peak = Math.max(1, ...list.map((s) => s.minutes));
  return h(
    'section',
    { class: 'stat-section' },
    h('h2', { class: 'stat-heading' }, 'By subject'),
    list.length === 0
      ? h('p', { class: 'hint' }, 'Finish a session to see where your time goes.')
      : h(
          'ul',
          { class: 'subject-list' },
          ...list.map((s) => {
            const subject = getSubject(s.subject);
            return h(
              'li',
              { class: 'subject-row' },
              subjectIcon(subject),
              h('span', { class: 'subject-name' }, subject.label),
              h('span', { class: 'subject-bar' }, h('span', { class: 'subject-fill', attrs: { style: `width:${Math.round((s.minutes / peak) * 100)}%` } })),
              h('span', { class: 'subject-min' }, formatMinutes(s.minutes)),
            );
          }),
        ),
  );
}

function recent(list: SessionSummary[]): HTMLElement {
  return h(
    'section',
    { class: 'stat-section' },
    h('h2', { class: 'stat-heading' }, 'Recent sessions'),
    list.length === 0
      ? h('p', { class: 'hint' }, 'No sessions yet. Sit at a desk and start a timer.')
      : h(
          'ul',
          { class: 'recent-list' },
          ...list.map((s) =>
            h(
              'li',
              { class: 'recent-row' },
              h('span', { class: 'recent-main' }, h('strong', {}, getSubject(s.subject).label), ` · ${formatMinutes(s.minutes)}`),
              h(
                'span',
                { class: 'hint' },
                new Date(s.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                s.completed ? null : ' · ended early',
              ),
            ),
          ),
        ),
  );
}

function render(stats: StatsResponse, signedIn: boolean, root: HTMLElement, close: () => void): HTMLElement[] {
  const todayKey = stats.today.day;
  const streakNote = stats.streak.current > 0 ? `Best: ${stats.streak.longest}` : `Study ${STREAK_MIN_MINUTES}+ min to start one`;
  const out: HTMLElement[] = [
    h(
      'div',
      { class: 'stat-cards' },
      card('Today', `${stats.today.sessions} · ${formatMinutes(stats.today.minutes)}`, 'sessions · focus time'),
      card('Streak', h('span', { class: 'with-icon' }, flameIcon(2), `${stats.streak.current} ${stats.streak.current === 1 ? 'day' : 'days'}`), streakNote),
      signedIn ? card('Coins', h('span', { class: 'with-icon' }, coinIcon(2), String(stats.coins)), 'earned by studying') : null,
      card('All time', formatMinutes(stats.totalMinutes), `${stats.totalSessions} ${stats.totalSessions === 1 ? 'session' : 'sessions'} completed`),
    ) as HTMLElement,
    chart(stats.days, todayKey),
    subjects(stats.subjects),
    recent(stats.recent),
  ];
  if (!signedIn) {
    out.push(
      h(
        'div',
        { class: 'stat-cta' },
        h('p', { class: 'hint' }, 'This is saved on this device only. Sign up to keep it on every device.'),
        button('Sign up', 'btn btn-primary', () => {
          close();
          openAccountPanel(root, { mode: 'register' });
        }),
      ),
    );
  }
  return out;
}

/** The personal stats page: from the server when signed in, from this device otherwise. */
export function openStatsPanel(root: HTMLElement): void {
  if (open) return;
  const close = (): void => {
    open?.close();
    open = null;
  };
  const content = h('div', { class: 'stats-body', attrs: { 'aria-live': 'polite' } });
  const panel = h(
    'div',
    { class: 'panel stats-panel', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'stats-title' } },
    h('h1', { class: 'panel-title', attrs: { id: 'stats-title' } }, 'Your study stats'),
    content,
    h('div', { class: 'panel-actions' }, button('Close', 'btn', close)),
  );

  const load = async (): Promise<void> => {
    if (!app.account.signedIn) {
      setChildren(content, ...render(localStats(app.sessions.all(), tzOffsetMin()), false, root, close));
      return;
    }
    setChildren(content, h('p', { class: 'hint' }, 'Loading your stats…'));
    try {
      const stats = await app.account.fetchStats();
      if (open) setChildren(content, ...render(stats, true, root, close));
    } catch (error) {
      if (!open) return;
      setChildren(
        content,
        h('p', { class: 'status status-error', attrs: { role: 'alert' } }, errorMessage(error)),
        // A sign-in that expired mid-request has already been cleared: show the guest view instead.
        button('Retry', 'btn', () => void load()),
      );
    }
  };

  open = openModal(root, panel, close);
  void load();
}
