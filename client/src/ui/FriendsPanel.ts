import { NAME_MAX_LENGTH, type FriendEntry, type Visibility } from '@study/shared';
import { app } from '../app';
import { bus } from '../bus';
import { openAccountPanel } from './AccountPanel';
import { button, h, setChildren } from './dom';
import { openModal, type ModalHandle } from './modal';
import { errorMessage, getNet } from './netAccess';
import { lockIcon, openDoorIcon } from './pixelIcon';

let open: ModalHandle | null = null;

/** Typing in a field must not walk the character around. */
function keepKeys(input: HTMLInputElement): void {
  input.addEventListener('keydown', (event) => event.stopPropagation());
}

const NOT_ONLINE = 'Join a server and sign in to visit homes.';

function visibilityBadge(visibility: Visibility | null): HTMLElement {
  if (visibility === null) return h('span', { class: 'friend-home friend-home-none', attrs: { title: 'No home yet' } }, 'No home yet');
  const label = visibility === 'open' ? 'Open home' : visibility === 'friends' ? 'Friends-only home' : 'Private home';
  return h(
    'span',
    { class: 'friend-home', attrs: { title: label } },
    visibility === 'open' ? openDoorIcon(2) : lockIcon(2),
    h('span', { class: 'friend-home-label' }, visibility === 'open' ? 'Open' : visibility === 'friends' ? 'Friends' : 'Private'),
  );
}

/**
 * The Friends window: requests waiting for you, your friends (with a Visit
 * button for homes you may enter), requests you sent, and an Add friend box.
 * Guests are asked to sign in. Only one copy is open at a time.
 */
export function openFriendsPanel(root: HTMLElement): void {
  if (open) return;
  const stopWatching = app.friends.watchWhileOpen();
  const close = (): void => {
    open?.close();
    open = null;
    stopWatching();
    unsubscribe();
    unsubscribeAccount();
  };

  const lists = h('div', { class: 'friends-lists' });
  const body = h('div', { class: 'friends-body' });
  const panel = h(
    'div',
    { class: 'panel friends-panel', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'friends-title' } },
    h('h1', { class: 'panel-title', attrs: { id: 'friends-title' } }, 'Friends'),
    body,
    h('div', { class: 'panel-actions' }, button('Close', 'btn', close)),
  );

  // ---- Add friend (built once so typing survives list refreshes) ----------------
  const addError = h('p', { class: 'status status-error', attrs: { role: 'alert' } });
  addError.hidden = true;
  const addOk = h('p', { class: 'status', attrs: { role: 'status' } });
  addOk.hidden = true;
  const addInput = h('input', {
    class: 'input',
    attrs: {
      type: 'text',
      id: 'friend-add',
      maxlength: 254,
      placeholder: `Name (up to ${NAME_MAX_LENGTH} letters) or email`,
      autocomplete: 'off',
      autocapitalize: 'none',
      spellcheck: 'false',
      'aria-label': 'Friend name or email',
    },
  });
  keepKeys(addInput);
  let adding = false;
  const addButton = button('Add', 'btn btn-primary', () => void sendRequest());
  addButton.type = 'submit';
  const sendRequest = async (): Promise<void> => {
    if (adding) return;
    addError.hidden = true;
    addOk.hidden = true;
    const text = addInput.value.trim();
    if (text === '') {
      addError.textContent = 'Type a name or an email address.';
      addError.hidden = false;
      return;
    }
    adding = true;
    addButton.disabled = true;
    try {
      await app.friends.request(text);
      addInput.value = '';
      addOk.textContent = 'Request sent!';
      addOk.hidden = false;
    } catch (caught) {
      addError.textContent = errorMessage(caught);
      addError.hidden = false;
    } finally {
      adding = false;
      addButton.disabled = false;
    }
  };
  const addForm = h(
    'form',
    { class: 'friend-add', attrs: { novalidate: '' }, on: { submit: (event) => { event.preventDefault(); void sendRequest(); } } },
    h('label', { class: 'field-label', attrs: { for: 'friend-add' } }, 'Add friend'),
    h('div', { class: 'row' }, addInput, addButton),
    addError,
    addOk,
  );

  // ---- Lists ------------------------------------------------------------------------
  let confirmRemove: string | null = null;
  const busy = new Set<string>();
  const run = async (id: string, action: () => Promise<void>): Promise<void> => {
    if (busy.has(id)) return;
    busy.add(id);
    renderLists();
    try {
      await action();
    } catch (caught) {
      bus.emit('toast', { text: errorMessage(caught) });
    } finally {
      busy.delete(id);
      renderLists();
    }
  };

  const row = (friend: FriendEntry, ...actions: Node[]): HTMLElement =>
    h('li', { class: 'friend-row' }, h('span', { class: 'friend-name' }, friend.name), ...actions);

  const visitButton = (friend: FriendEntry): HTMLButtonElement => {
    const online = getNet()?.status === 'online' && app.account.signedIn;
    const theirs = friend.homeVisibility;
    let why = '';
    if (!online) why = NOT_ONLINE;
    else if (theirs === null) why = `${friend.name} doesn't have a home yet.`;
    else if (theirs === 'private') why = `${friend.name}'s home is private.`;
    const btn = button('Visit', 'btn btn-small btn-primary', () => {
      if (app.homes.visit(friend.id)) close();
    }, { title: why || `Visit ${friend.name}'s home`, 'aria-label': `Visit ${friend.name}'s home` });
    btn.disabled = why !== '' || busy.has(friend.id);
    return btn;
  };

  const renderLists = (): void => {
    const store = app.friends;
    const incoming = store.incoming;
    const accepted = store.accepted;
    const outgoing = store.outgoing;
    const sections: (HTMLElement | null)[] = [];

    if (store.error) {
      sections.push(
        h(
          'div',
          { class: 'friends-error' },
          h('p', { class: 'status status-error', attrs: { role: 'alert' } }, store.error),
          button('Retry', 'btn btn-small', () => void store.refresh()),
        ),
      );
    }

    sections.push(
      incoming.length > 0
        ? h(
            'section',
            { class: 'friends-section', attrs: { 'aria-label': 'Friend requests' } },
            h('h2', { class: 'stat-heading' }, `Requests (${incoming.length})`),
            h(
              'ul',
              { class: 'friend-list' },
              ...incoming.map((f) =>
                row(
                  f,
                  h(
                    'span',
                    { class: 'friend-buttons' },
                    button('Accept', 'btn btn-small btn-primary', () => void run(f.id, () => app.friends.respond(f.id, true)), {
                      'aria-label': `Accept ${f.name}`,
                      disabled: busy.has(f.id),
                    }),
                    button('Decline', 'btn btn-small', () => void run(f.id, () => app.friends.respond(f.id, false)), {
                      'aria-label': `Decline ${f.name}`,
                      disabled: busy.has(f.id),
                    }),
                  ),
                ),
              ),
            ),
          )
        : null,
    );

    sections.push(
      h(
        'section',
        { class: 'friends-section', attrs: { 'aria-label': 'Your friends' } },
        h('h2', { class: 'stat-heading' }, `Friends (${accepted.length})`),
        accepted.length === 0
          ? h('p', { class: 'hint' }, store.loading ? 'Loading…' : 'No friends yet. Add someone by name or email below.')
          : h(
              'ul',
              { class: 'friend-list' },
              ...accepted.map((f) =>
                confirmRemove === f.id
                  ? row(
                      f,
                      h(
                        'span',
                        { class: 'friend-buttons' },
                        h('span', { class: 'hint' }, 'Remove?'),
                        button('Yes', 'btn btn-small', () => {
                          confirmRemove = null;
                          void run(f.id, () => app.friends.remove(f.id));
                        }, { 'aria-label': `Yes, remove ${f.name}` }),
                        button('No', 'btn btn-small', () => {
                          confirmRemove = null;
                          renderLists();
                        }, { 'aria-label': 'Keep this friend' }),
                      ),
                    )
                  : row(
                      f,
                      visibilityBadge(f.homeVisibility),
                      h(
                        'span',
                        { class: 'friend-buttons' },
                        visitButton(f),
                        button('Remove', 'btn btn-small', () => {
                          confirmRemove = f.id;
                          renderLists();
                        }, { 'aria-label': `Remove ${f.name} from friends` }),
                      ),
                    ),
              ),
            ),
      ),
    );

    sections.push(
      outgoing.length > 0
        ? h(
            'section',
            { class: 'friends-section', attrs: { 'aria-label': 'Requests you sent' } },
            h('h2', { class: 'stat-heading' }, `Sent requests (${outgoing.length})`),
            h(
              'ul',
              { class: 'friend-list' },
              ...outgoing.map((f) =>
                row(
                  f,
                  h('span', { class: 'hint' }, 'Waiting'),
                  h(
                    'span',
                    { class: 'friend-buttons' },
                    button('Cancel', 'btn btn-small', () => void run(f.id, () => app.friends.remove(f.id)), {
                      'aria-label': `Cancel request to ${f.name}`,
                      disabled: busy.has(f.id),
                    }),
                  ),
                ),
              ),
            ),
          )
        : null,
    );
    setChildren(lists, ...sections);
  };

  // ---- Whole panel -------------------------------------------------------------------
  let showingGuest: boolean | null = null;
  const render = (): void => {
    if (!app.account.signedIn) {
      if (showingGuest !== true) {
        showingGuest = true;
        setChildren(
          body,
          h('p', { class: 'account-line' }, 'Sign in to add friends.'),
          h('p', { class: 'hint' }, 'Friends can visit your home and you can visit theirs. Guests play without friends or a home.'),
          h(
            'div',
            { class: 'panel-actions' },
            button('Sign in', 'btn btn-primary', () => {
              close();
              openAccountPanel(root);
            }),
          ),
        );
      }
      return;
    }
    if (showingGuest !== false) {
      showingGuest = false;
      setChildren(body, addForm, lists);
    }
    renderLists();
  };

  const unsubscribe = app.friends.changed.subscribe(renderLists);
  const unsubscribeAccount = app.account.changed.subscribe(render);

  open = openModal(root, panel, close);
  render();
  if (app.account.signedIn) addInput.focus();
}
