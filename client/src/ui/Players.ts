import { REPORT_REASON_MAX } from '@study/shared';
import { app } from '../app';
import { bus } from '../bus';
import { buddyPanel, buddyPeerAction } from '../studyTogether/BuddyPanel';
import type { PlayerInfo } from '../net/types';
import { button, h, setChildren } from './dom';
import { openModal } from './modal';
import { copyText, getNet } from './netAccess';

const localClock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });

function updateLocalTime(clock: HTMLTimeElement, offset: number, now: number): void {
  const time = new Date(now + offset * 60_000);
  const label = localClock.format(time);
  const text = `Local ${label}`;
  if (clock.textContent === text) return;
  clock.dateTime = time.toISOString().slice(11, 16);
  clock.textContent = text;
  clock.setAttribute('aria-label', `Local time ${label}`);
}

type Pending = { id: string; kind: 'block' | 'report' } | null;

function mapName(id: string): string {
  return app.manifest.maps[id]?.name ?? id;
}

/** Shows who is in the voice call with you and who is talking. */
function voiceBadge(id: string): HTMLElement | null {
  const peer = getNet()?.voice.peer(id);
  if (!peer) return null;
  if (peer.failed) return h('span', { class: 'badge badge-warn', attrs: { title: 'Could not connect audio (strict network?)' } }, 'No audio');
  if (!peer.connected) return h('span', { class: 'badge', attrs: { title: 'Connecting audio' } }, 'Connecting…');
  return h('span', { class: `badge badge-voice${peer.speaking ? ' speaking' : ''}` }, peer.speaking ? 'Speaking' : 'In call');
}

/** Lists the other players with mute, block and report actions. */
export function openPlayers(root: HTMLElement): void {
  let pending: Pending = null;
  let reportDraft = '';
  let unsubscribe: (() => void) | null = null;

  const clocks = new Map<HTMLTimeElement, number>();
  const updateClocks = (): void => {
    const now = Date.now();
    for (const [clock, offset] of clocks) updateLocalTime(clock, offset, now);
  };

  const list = h('div', { class: 'people-list' });
  const buddies = h('div');
  const inviteLine = h('div', { class: 'row wrap people-invite' });

  const reasonInput = h('input', {
    class: 'input',
    attrs: { type: 'text', maxlength: REPORT_REASON_MAX, placeholder: 'What happened?', 'aria-label': 'Report reason' },
  });
  reasonInput.addEventListener('input', () => (reportDraft = reasonInput.value));
  reasonInput.addEventListener('keydown', (event) => event.stopPropagation());

  const setPending = (next: Pending): void => {
    pending = next;
    reportDraft = '';
    reasonInput.value = '';
    render();
  };

  const confirmBlock = (player: PlayerInfo): HTMLElement =>
    h(
      'div',
      { class: 'people-form' },
      h('p', { class: 'hint' }, `Block ${player.name}? You will not see their messages and they will not see yours.`),
      h(
        'div',
        { class: 'row wrap' },
        button('Block', 'btn btn-small btn-primary', () => {
          getNet()?.block(player.id);
          setPending(null);
        }),
        button('Cancel', 'btn btn-small', () => setPending(null)),
      ),
    );

  const reportForm = (player: PlayerInfo): HTMLElement =>
    h(
      'div',
      { class: 'people-form' },
      h('p', { class: 'hint' }, `Report ${player.name} to the moderators.`),
      reasonInput,
      h(
        'div',
        { class: 'row wrap' },
        button('Send report', 'btn btn-small btn-primary', () => {
          const reason = reportDraft.trim().slice(0, REPORT_REASON_MAX);
          if (!reason) {
            reasonInput.focus();
            return;
          }
          getNet()?.report(player.id, reason);
          bus.emit('toast', { text: 'Report sent. Thank you.' });
          setPending(null);
        }),
        button('Cancel', 'btn btn-small', () => setPending(null)),
      ),
    );

  const row = (player: PlayerInfo): HTMLElement => {
    const net = getNet();
    const clock = Number.isFinite(player.tzOffsetMin)
      ? h('time', { class: 'hint', attrs: { title: `${player.name}’s local time` } })
      : null;
    if (clock) clocks.set(clock, player.tzOffsetMin);
    return h(
      'div',
      { class: 'people-row' },
      h(
        'div',
        { class: 'people-main' },
        h(
          'div',
          { class: 'people-who' },
          h('strong', { class: 'people-name' }, player.name),
          h('span', { class: 'hint' }, mapName(player.map)),
          clock,
          voiceBadge(player.id),
          player.muted ? h('span', { class: 'badge' }, 'Muted') : null,
          player.blocked ? h('span', { class: 'badge' }, 'Blocked') : null,
        ),
        h(
          'div',
          { class: 'people-buttons' },
          buddyPeerAction(player),
          button(player.muted ? 'Unmute' : 'Mute', 'btn btn-small', () =>
            player.muted ? net?.unmute(player.id) : net?.mute(player.id),
          ),
          button(player.blocked ? 'Unblock' : 'Block', 'btn btn-small', () =>
            player.blocked ? net?.unblock(player.id) : setPending({ id: player.id, kind: 'block' }),
          ),
          button('Report', 'btn btn-small', () => setPending({ id: player.id, kind: 'report' })),
        ),
      ),
      pending?.id === player.id ? (pending.kind === 'block' ? confirmBlock(player) : reportForm(player)) : null,
    );
  };

  function render(): void {
    const net = getNet();
    const players = net?.players() ?? [];
    if (pending && !players.some((p) => p.id === pending?.id)) pending = null;

    const hadFocus = document.activeElement === reasonInput;
    const code = net?.inviteCode ?? '';
    setChildren(
      inviteLine,
      code ? h('span', { class: 'hint' }, `Invite code: ${code}`) : null,
      code
        ? button('Copy', 'btn btn-small', () => {
            void copyText(code).then((ok) => bus.emit('toast', { text: ok ? `Invite code ${code} copied` : `Invite code: ${code}` }));
          })
        : null,
    );
    clocks.clear();
    setChildren(
      list,
      players.length === 0
        ? h('p', { class: 'hint' }, 'Nobody else is here yet. Share your invite code so friends can join this room.')
        : null,
      ...players.map(row),
    );
    updateClocks();
    buddies.replaceChildren(buddyPanel());
    if (hadFocus && pending?.kind === 'report') reasonInput.focus();
  }

  const modal = openModal(
    root,
    h(
      'div',
      { class: 'panel people', attrs: { role: 'dialog', 'aria-label': 'People' } },
      h('h2', { class: 'panel-title' }, 'People here'),
      inviteLine,
      list,
      buddies,
      h('div', { class: 'panel-actions' }, button('Close', 'btn', () => close())),
    ),
    () => close(),
  );

  function close(): void {
    unsubscribe?.();
    unsubscribe = null;
    modal.close();
  }

  const clockTimer = window.setInterval(updateClocks, 1000);
  const offNet = getNet()?.changed.subscribe(render);
  const offBuddies = app.net.buddiesChanged.subscribe(render);
  const offVoice = getNet()?.voice.changed.subscribe(render);
  unsubscribe = () => {
    window.clearInterval(clockTimer);
    offNet?.();
    offVoice?.();
    offBuddies();
  };
  render();
}
