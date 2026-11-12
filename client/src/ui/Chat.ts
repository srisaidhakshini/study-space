import { CHAT_MAX_LENGTH, type ChatDenyReason } from '@study/shared';
import { app } from '../app';
import { bus } from '../bus';
import type { ChatLine } from '../net/types';
import { button, h, setChildren } from './dom';
import { getNet, watchNet } from './netAccess';

const MAX_LINES = 60;

const DENIED: Record<ChatDenyReason, string> = {
  silent: 'Chat is off in the silent zone',
  cooldown: 'Slow down a little',
  empty: 'Type something first',
  blocked: 'Your message was not delivered',
};

/** Proximity chat: a log and an input, shown only while connected to a server. */
export function createChat(): HTMLElement {
  const lines: ChatLine[] = [];
  let silent = false;
  let unread = 0;
  let collapsed = window.matchMedia('(max-width: 720px)').matches;
  let lastStatus = '';

  const log = h('div', { class: 'chat-log', attrs: { role: 'log', 'aria-live': 'polite', 'aria-label': 'Chat messages' } });
  const input = h('input', {
    class: 'input chat-input',
    attrs: { type: 'text', maxlength: CHAT_MAX_LENGTH, autocomplete: 'off', enterkeyhint: 'send', 'aria-label': 'Chat message' },
  });
  const send = button('Send', 'btn btn-small', () => submit());
  const title = h('span', { class: 'chat-title' });
  const toggle = button('', 'btn btn-small btn-icon chat-toggle', () => setCollapsed(!collapsed));

  const root = h(
    'section',
    { class: 'chat', attrs: { 'aria-label': 'Chat' } },
    h('div', { class: 'chat-head' }, title, toggle),
    log,
    h('div', { class: 'chat-form' }, input, send),
  );
  root.hidden = true;

  const blockReason = (): string | null => {
    if (silent) return DENIED.silent;
    return null;
  };

  const renderLog = (): void => {
    const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
    setChildren(
      log,
      lines.length === 0 ? h('p', { class: 'hint chat-empty' }, 'Nearby players will see what you say.') : null,
      ...lines.map((line) =>
        h(
          'div',
          { class: `chat-line${line.self ? ' self' : ''}${line.system ? ' system' : ''}` },
          line.system ? null : h('span', { class: 'chat-name' }, `${line.name}: `),
          line.text,
        ),
      ),
    );
    if (stick) log.scrollTop = log.scrollHeight;
  };

  const renderState = (): void => {
    const net = getNet();
    const online = net?.status === 'online';
    root.hidden = !online;
    root.classList.toggle('collapsed', collapsed);
    toggle.textContent = collapsed ? '▴' : '▾';
    toggle.setAttribute('aria-label', collapsed ? 'Open chat' : 'Close chat');
    toggle.setAttribute('aria-expanded', String(!collapsed));
    title.textContent = collapsed && unread > 0 ? `Chat (${unread})` : 'Chat';

    const reason = blockReason();
    const locked = reason !== null;
    input.disabled = locked;
    send.disabled = locked;
    input.placeholder = reason ?? 'Say something nearby…';
    if (locked && document.activeElement === input) input.blur();
  };

  function setCollapsed(value: boolean): void {
    collapsed = value;
    if (!collapsed) {
      unread = 0;
      renderLog();
      log.scrollTop = log.scrollHeight;
    }
    renderState();
  }

  function submit(): void {
    const net = getNet();
    const text = input.value.trim();
    if (!net || net.status !== 'online' || !text) return;
    if (blockReason()) return;
    net.sendChat(text.slice(0, CHAT_MAX_LENGTH));
    input.value = '';
    input.focus();
  }

  input.addEventListener('keydown', (event) => {
    // Keep typing away from the game's movement keys.
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      input.blur();
    }
  });
  input.addEventListener('keyup', (event) => event.stopPropagation());
  input.addEventListener('focus', () => bus.emit('ui:lock', { locked: true }));
  input.addEventListener('blur', () => bus.emit('ui:lock', { locked: false }));

  bus.on('chat:line', (line) => {
    lines.push(line);
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
    if (collapsed && !line.self) unread += 1;
    renderLog();
    renderState();
  });
  bus.on('chat:denied', ({ reason }) => bus.emit('toast', { text: DENIED[reason] }));
  bus.on('location', ({ zone }) => {
    silent = zone?.silent === true;
    renderState();
  });
  app.timer.changed.subscribe(renderState);

  watchNet(() => {
    const status = getNet()?.status ?? 'offline';
    // A fresh connection starts with an empty log.
    if (status !== lastStatus && (status === 'connecting' || status === 'offline')) {
      lines.length = 0;
      unread = 0;
      renderLog();
    }
    lastStatus = status;
    renderState();
  });

  renderLog();
  renderState();
  return root;
}
