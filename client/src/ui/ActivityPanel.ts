import { app } from '../app';
import { button, h, setChildren } from './dom';
import { openModal, type ModalHandle } from './modal';

let open: ModalHandle | null = null;

function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return seconds >= 10 ? '<1 min' : '0 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function table(title: string, days: number): HTMLElement {
  const t = app.activity.total(days);
  const row = (label: string, seconds: number): HTMLElement =>
    h('tr', {}, h('td', {}, label), h('td', { class: 'activity-value' }, duration(seconds)));
  return h(
    'section',
    { class: 'stat-section' },
    h('h2', { class: 'stat-heading' }, title),
    h(
      'table',
      { class: 'stat-table' },
      h(
        'tbody',
        {},
        row('In the app', t.app),
        row('In voice or video calls', t.call),
        row('Studying (focus timer)', t.focus),
        row('In a room with friends', t.withFriends),
        row('Studying with friends', t.focusWithFriends),
      ),
    ),
  );
}

function friends(): HTMLElement {
  const list = app.activity.friendsRanked().slice(0, 8);
  return h(
    'section',
    { class: 'stat-section' },
    h('h2', { class: 'stat-heading' }, 'Friends'),
    list.length === 0
      ? h('p', { class: 'hint' }, 'Spend a few minutes in the same room as a friend and they will show up here.')
      : h(
          'ul',
          { class: 'recent-list' },
          ...list.map((f) =>
            h(
              'li',
              { class: 'recent-row' },
              h('span', { class: 'recent-main' }, h('strong', {}, f.name)),
              h('span', { class: 'hint' }, `${duration(f.focus)} studying together · ${duration(f.together)} in the same room`),
            ),
          ),
        ),
  );
}

/** Time in the app, in calls, studying and with friends. Counted on this device only. */
export function openActivityPanel(root: HTMLElement): void {
  if (open) return;
  const close = (): void => {
    off();
    open?.close();
    open = null;
  };
  const content = h('div', { class: 'stats-body', attrs: { 'aria-live': 'off' } });
  const render = (): void => setChildren(content, table('Today', 1), table('Last 7 days', 7), friends(), h('p', { class: 'hint' }, 'Counted on this device while the app is open. Friends count when you are in the same room.'));
  // Re-render about every 10 s so the numbers move while the panel is open.
  const off = ((): (() => void) => {
    const id = window.setInterval(render, 10_000);
    return () => window.clearInterval(id);
  })();
  render();
  const panel = h(
    'div',
    { class: 'panel stats-panel', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'activity-title' } },
    h('h1', { class: 'panel-title', attrs: { id: 'activity-title' } }, 'Your time'),
    content,
    h('div', { class: 'panel-actions' }, button('Close', 'btn', close)),
  );
  open = openModal(root, panel, close);
}
