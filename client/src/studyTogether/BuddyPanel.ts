import { TREE_STAGES, treeStage, type BuddyAction, type BuddyLink } from '@study/shared';
import { app } from '../app';
import type { PlayerInfo } from '../net/types';
import { button, h } from '../ui/dom';
import './buddyPanel.css';

const BUDDY_TREE_STAGES = ['🌱', '🌿', '🌳', '🌸'];

export function buddyPeerAction(player: PlayerInfo): HTMLElement | null {
  if (!app.account.signedIn || !app.net.buddyCandidates.has(player.id) || player.blocked) return null;
  const existing = app.net.buddies.links.find((link) => app.net.buddies.online[link.id] === player.id);
  if (existing) {
    const label = { accepted: 'Friend', incoming: 'Request received', outgoing: 'Request sent' }[existing.status];
    return h('span', { class: 'badge' }, label);
  }
  return button('Add friend', 'btn btn-small', () => app.net.sendBuddyAction({ kind: 'request', peerId: player.id }), {
    'aria-label': `Request ${player.name} as a friend`,
  });
}

function action(kind: Exclude<BuddyAction['kind'], 'request'>, link: BuddyLink): HTMLButtonElement {
  const labels = { accept: 'Accept', decline: 'Decline', cancel: 'Cancel request', remove: 'Remove friend' };
  return button(labels[kind], 'btn btn-small', () => {
    if (kind === 'remove' && !window.confirm(`Remove ${link.name} as a friend? Your shared buddy tree will be deleted.`)) return;
    app.net.sendBuddyAction({ kind, linkId: link.id });
  }, { 'aria-label': `${labels[kind]} · ${link.name}` });
}

function buddyRow(link: BuddyLink): HTMLElement {
  if (link.status === 'incoming') {
    return h('div', { class: 'buddy-row' },
      h('p', {}, `${link.name} sent you a friend request.`),
      h('div', { class: 'row wrap' }, action('accept', link), action('decline', link)),
    );
  }
  if (link.status === 'outgoing') {
    return h('div', { class: 'buddy-row' },
      h('p', {}, `Waiting for ${link.name} to accept.`),
      action('cancel', link),
    );
  }
  const stage = treeStage(link.focusMinutes);
  const next = TREE_STAGES[stage + 1];
  const online = app.net.buddies.online[link.id];
  return h('article', { class: 'buddy-row buddy-tree' },
    h('div', { class: 'buddy-tree-icon', attrs: { 'aria-hidden': true } }, BUDDY_TREE_STAGES[stage]),
    h('div', { class: 'buddy-tree-details' },
      h('strong', {}, link.name),
      online ? h('span', { class: 'badge' }, 'In this room') : null,
      h('p', {}, `${TREE_STAGES[stage].label} · ${link.focusMinutes.toLocaleString()} minutes together`),
      next ? h('progress', { attrs: { value: link.focusMinutes, max: next.minutes, 'aria-label': `Tree growth with ${link.name}` } }) : null,
      action('remove', link),
    ),
  );
}

export function buddyPanel(): HTMLElement {
  const links = app.net.buddies.links;
  const ordered = [...links].sort((a, b) => {
    const order = { incoming: 0, outgoing: 1, accepted: 2 };
    return order[a.status] - order[b.status] || a.name.localeCompare(b.name);
  });
  return h('section', { class: 'people-buddies' },
    h('h3', {}, 'Friends and buddy trees'),
    !app.account.signedIn
      ? h('p', { class: 'hint' }, 'Sign in to send friend requests and grow private trees together.')
      : h('p', { class: 'hint' }, 'Your accepted friends can visit a friends-only home. A buddy tree grows while you both focus in the same room.'),
    ...ordered.map(buddyRow),
  );
}
