import { INVITE_CODE_LENGTH, type ServerListEntry } from '@study/shared';
import { button, h, setChildren } from './dom';
import { openModal, type ModalHandle } from './modal';
import { errorMessage, getNet } from './netAccess';

export interface ServerListOptions {
  /** Runs after the player is in a server or chose to play solo. */
  onEntered(): void;
  /** Shown at the top, e.g. why the connection was lost. */
  message?: string;
  /** False on the first screen: there is no world behind it to go back to. */
  closable: boolean;
}

const REFRESH_MS = 5000;

interface Active {
  setMessage(message: string | null): void;
}

let active: Active | null = null;

/** Cleans an invite code as typed: uppercase letters and digits only. */
function cleanCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, INVITE_CODE_LENGTH);
}

function serverRow(entry: ServerListEntry, onJoin: () => void, disabled: boolean): HTMLElement {
  const percent = Math.min(100, Math.round((entry.players / Math.max(1, entry.capacity)) * 100));
  return h(
    'div',
    { class: 'server-row' },
    h(
      'div',
      { class: 'server-info' },
      h(
        'div',
        { class: 'server-name' },
        h('strong', {}, entry.name),
        entry.instances > 1 ? h('span', { class: 'hint' }, `${entry.instances} rooms`) : null,
      ),
      h(
        'div',
        { class: 'bar-line' },
        h(
          'div',
          {
            class: 'bar',
            attrs: {
              role: 'progressbar',
              'aria-label': `${entry.name} players`,
              'aria-valuemin': 0,
              'aria-valuemax': entry.capacity,
              'aria-valuenow': entry.players,
            },
          },
          h('div', { class: 'bar-fill', attrs: { style: `width:${percent}%` } }),
        ),
        h('span', { class: 'bar-count' }, `${entry.players} / ${entry.capacity}`),
      ),
    ),
    button('Join', 'btn btn-primary', onJoin, { disabled, 'aria-label': `Join ${entry.name}` }),
  );
}

/** Opens the "Choose a server" screen. Opening it again just updates the message. */
export function openServerList(root: HTMLElement, options: ServerListOptions): void {
  if (active) {
    active.setMessage(options.message ?? null);
    return;
  }

  let entries: ServerListEntry[] | null = null;
  let loadError: string | null = null;
  let joining: string | null = null;
  let joinError: string | null = null;
  let message: string | null = options.message ?? null;
  let fetchToken = 0;
  let closed = false;

  const notice = h('p', { class: 'notice', attrs: { role: 'alert' } });
  const listEl = h('div', { class: 'server-rows', attrs: { 'aria-live': 'polite' } });
  const statusEl = h('p', { class: 'status', attrs: { role: 'status' } });
  const codeInput = h('input', {
    class: 'input invite-input',
    attrs: {
      type: 'text',
      maxlength: INVITE_CODE_LENGTH,
      placeholder: 'ABCDE',
      autocomplete: 'off',
      autocapitalize: 'characters',
      spellcheck: false,
      'aria-label': 'Invite code',
    },
  });
  const codeJoin = button('Join', 'btn', () => enterByCode());
  const refreshBtn = button('Refresh', 'btn', () => void load());
  const soloBtn = button('Play solo (offline)', 'btn', () => playSolo());
  const closeBtn = options.closable ? button('Close', 'btn', () => closeIfIdle()) : null;

  const syncBusy = (): void => {
    const busy = joining !== null;
    refreshBtn.disabled = busy;
    soloBtn.disabled = busy;
    codeInput.disabled = busy;
    codeJoin.disabled = busy || cleanCode(codeInput.value).length !== INVITE_CODE_LENGTH;
    if (closeBtn) closeBtn.disabled = busy;
    statusEl.className = joinError ? 'status status-error' : 'status';
    statusEl.textContent = joining ? `Connecting to ${joining}…` : (joinError ?? '');
    statusEl.hidden = !joining && !joinError;
    renderList();
  };

  const renderNotice = (): void => {
    notice.textContent = message ?? '';
    notice.hidden = !message;
  };

  function renderList(): void {
    if (!entries) {
      if (loadError) {
        setChildren(
          listEl,
          h('p', { class: 'status status-error' }, loadError),
          button('Retry', 'btn', () => void load(), { disabled: joining !== null }),
        );
      } else {
        setChildren(listEl, h('p', { class: 'hint' }, 'Looking for servers…'));
      }
      return;
    }
    setChildren(
      listEl,
      ...entries.map((entry) => serverRow(entry, () => void enter({ server: entry.name }, entry.name), joining !== null)),
      loadError ? h('p', { class: 'hint' }, `Could not refresh: ${loadError}`) : null,
    );
  }

  async function load(): Promise<void> {
    const net = getNet();
    if (!net) {
      loadError = 'Networking is not available.';
      renderList();
      return;
    }
    const token = ++fetchToken;
    try {
      const list = await net.fetchServers();
      if (closed || token !== fetchToken) return;
      entries = list;
      loadError = null;
    } catch (error) {
      if (closed || token !== fetchToken) return;
      loadError = errorMessage(error);
    }
    renderList();
  }

  async function enter(target: { server: string } | { inviteCode: string }, label: string): Promise<void> {
    const net = getNet();
    if (!net || joining) return;
    joining = label;
    joinError = null;
    syncBusy();
    try {
      if (net.status !== 'offline') net.leave();
      await net.join(target);
    } catch (error) {
      joining = null;
      joinError = errorMessage(error);
      syncBusy();
      return;
    }
    close();
    options.onEntered();
  }

  function enterByCode(): void {
    const code = cleanCode(codeInput.value);
    if (code.length === INVITE_CODE_LENGTH) void enter({ inviteCode: code }, `invite ${code}`);
  }

  function playSolo(): void {
    if (joining) return;
    const net = getNet();
    if (net && net.status !== 'offline') net.leave();
    close();
    options.onEntered();
  }

  let modal: ModalHandle | null = null;
  let timer = 0;

  function close(): void {
    if (closed) return;
    closed = true;
    window.clearInterval(timer);
    modal?.close();
    active = null;
  }

  function closeIfIdle(): void {
    if (!joining) close();
  }

  codeInput.addEventListener('input', () => {
    const cleaned = cleanCode(codeInput.value);
    if (cleaned !== codeInput.value) codeInput.value = cleaned;
    joinError = null;
    syncBusy();
  });
  codeInput.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      enterByCode();
    }
  });

  const panel = h(
    'div',
    { class: 'panel server-list', attrs: { role: 'dialog', 'aria-label': 'Choose a server' } },
    h('h2', { class: 'panel-title' }, 'Choose a server'),
    notice,
    listEl,
    h(
      'div',
      { class: 'field invite-field' },
      h('label', { class: 'field-label', attrs: { for: 'invite-code' } }, 'Have an invite code?'),
      h('div', { class: 'row' }, codeInput, codeJoin),
    ),
    statusEl,
    h('div', { class: 'panel-actions' }, refreshBtn, soloBtn, closeBtn),
  );
  codeInput.id = 'invite-code';

  active = {
    setMessage(next): void {
      message = next;
      renderNotice();
    },
  };

  modal = openModal(root, panel, options.closable ? closeIfIdle : null);
  renderNotice();
  syncBusy();
  void load();
  timer = window.setInterval(() => {
    if (!joining && !document.hidden) void load();
  }, REFRESH_MS);
}
