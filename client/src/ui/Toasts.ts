import { app } from '../app';
import { bus } from '../bus';
import { h } from './dom';

const VISIBLE_MS = 2500;
const MAX_VISIBLE = 3;

/** Short messages stacked above the main button. */
export function createToasts(): HTMLElement {
  const container = h('div', { class: 'toasts', attrs: { role: 'status', 'aria-live': 'polite' } });

  const show = (text: string): void => {
    const toast = h('div', { class: 'toast' }, text);
    container.appendChild(toast);
    while (container.children.length > MAX_VISIBLE) container.firstElementChild?.remove();
    window.setTimeout(() => toast.remove(), VISIBLE_MS);
  };

  bus.on('toast', ({ text }) => show(text));
  app.timer.events.subscribe((event) => {
    if (event === 'focusDone') show('Session complete! Nice work.');
    if (event === 'breakStart') show('Break time. Stretch a little.');
    if (event === 'breakDone') show('Break is over.');
  });
  return container;
}
