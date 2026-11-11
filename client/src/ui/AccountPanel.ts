import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@study/shared';
import { app } from '../app';
import { bus } from '../bus';
import { button, h, setChildren } from './dom';
import { openModal, type ModalHandle } from './modal';
import { errorMessage } from './netAccess';
import { coinIcon } from './pixelIcon';
import { openStatsPanel } from './StatsPanel';

type Mode = 'login' | 'register';

export interface AccountPanelOptions {
  /** Which tab to open first when signed out. */
  mode?: Mode;
  /** Runs after a successful sign-in or sign-up. */
  onDone?: () => void;
}

let open: ModalHandle | null = null;

/** Keys typed into a form field must not walk the character around. */
function keepKeys(input: HTMLInputElement): void {
  input.addEventListener('keydown', (event) => event.stopPropagation());
}

/**
 * Sign in / create account while signed out; the account menu (stats, sign
 * out) while signed in. Only one copy is open at a time.
 */
export function openAccountPanel(root: HTMLElement, options: AccountPanelOptions = {}): void {
  if (open) return;
  const close = (): void => {
    open?.close();
    open = null;
    unsubscribe();
  };
  const body = h('div', { class: 'account-body' });
  const panel = h(
    'div',
    { class: 'panel account-panel', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'account-title' } },
    h('h1', { class: 'panel-title', attrs: { id: 'account-title' } }, 'Your account'),
    body,
  );
  let mode: Mode = options.mode ?? 'login';

  const renderSignedIn = (): void => {
    const account = app.account.account;
    if (!account) return;
    setChildren(
      body,
      h('p', { class: 'account-line' }, 'Signed in as ', h('strong', {}, account.name)),
      h('p', { class: 'hint' }, account.email),
      h('p', { class: 'account-coins' }, coinIcon(3), h('strong', {}, String(app.account.coins)), ' coins'),
      h(
        'div',
        { class: 'panel-actions' },
        button('Sign out', 'btn', () => {
          close();
          app.account.logout();
          bus.emit('toast', { text: 'Signed out. You are playing as a guest.' });
        }),
        button('Stats', 'btn btn-primary', () => {
          close();
          openStatsPanel(root);
        }),
        button('Close', 'btn', close),
      ),
    );
  };

  const renderForm = (): void => {
    const registering = mode === 'register';
    let busy = false;
    let showPassword = false;

    const error = h('p', { class: 'status status-error', attrs: { role: 'alert' } });
    error.hidden = true;
    const email = h('input', {
      class: 'input',
      attrs: {
        type: 'email',
        id: 'account-email',
        maxlength: EMAIL_MAX_LENGTH,
        autocomplete: 'email',
        autocapitalize: 'none',
        spellcheck: 'false',
        required: '',
      },
    });
    const password = h('input', {
      class: 'input',
      attrs: {
        type: 'password',
        id: 'account-password',
        maxlength: PASSWORD_MAX_LENGTH,
        autocomplete: registering ? 'new-password' : 'current-password',
        required: '',
      },
    });
    const name = h('input', {
      class: 'input',
      attrs: { type: 'text', id: 'account-name', maxlength: NAME_MAX_LENGTH, autocomplete: 'nickname', spellcheck: 'false' },
    });
    name.value = app.profile.get()?.name ?? '';
    for (const input of [email, password, name]) keepKeys(input);

    const toggle = button('Show', 'btn btn-small', () => {
      showPassword = !showPassword;
      password.type = showPassword ? 'text' : 'password';
      toggle.textContent = showPassword ? 'Hide' : 'Show';
      toggle.setAttribute('aria-pressed', String(showPassword));
    }, { 'aria-pressed': 'false', 'aria-label': 'Show password' });

    const submit = button(registering ? 'Create account' : 'Sign in', 'btn btn-primary', () => void send());
    submit.type = 'submit';

    const fail = (message: string): void => {
      error.textContent = message;
      error.hidden = false;
    };

    const send = async (): Promise<void> => {
      if (busy) return;
      error.hidden = true;
      const address = email.value.trim();
      if (!address.includes('@') || address.length < 5) return fail('Enter a valid email address.');
      if (registering && password.value.length < PASSWORD_MIN_LENGTH) {
        return fail(`Choose a password of at least ${PASSWORD_MIN_LENGTH} characters.`);
      }
      if (!registering && password.value === '') return fail('Enter your password.');
      if (registering && name.value.trim() === '') return fail('Pick a display name.');
      busy = true;
      submit.disabled = true;
      submit.textContent = registering ? 'Creating…' : 'Signing in…';
      try {
        if (registering) await app.account.register(address, password.value, name.value);
        else await app.account.login(address, password.value);
      } catch (caught) {
        busy = false;
        submit.disabled = false;
        submit.textContent = registering ? 'Create account' : 'Sign in';
        fail(errorMessage(caught));
        return;
      }
      close();
      bus.emit('toast', { text: registering ? 'Account created. Your progress is now saved.' : 'Welcome back!' });
      options.onDone?.();
    };

    const tab = (target: Mode, label: string): HTMLButtonElement =>
      button(label, `btn tab${mode === target ? ' active' : ''}`, () => {
        mode = target;
        renderForm();
      }, { role: 'tab', 'aria-selected': String(mode === target) });

    const form = h(
      'form',
      { class: 'account-form', attrs: { novalidate: '' }, on: { submit: (event) => { event.preventDefault(); void send(); } } },
      h('div', { class: 'tabs', attrs: { role: 'tablist' } }, tab('login', 'Sign in'), tab('register', 'Create account')),
      h('div', { class: 'field' }, h('label', { class: 'field-label', attrs: { for: 'account-email' } }, 'Email'), email),
      h(
        'div',
        { class: 'field' },
        h('label', { class: 'field-label', attrs: { for: 'account-password' } }, 'Password'),
        h('div', { class: 'row' }, password, toggle),
        registering ? h('span', { class: 'hint' }, `At least ${PASSWORD_MIN_LENGTH} characters.`) : null,
      ),
      registering
        ? h('div', { class: 'field' }, h('label', { class: 'field-label', attrs: { for: 'account-name' } }, 'Display name'), name)
        : null,
      error,
      h(
        'p',
        { class: 'hint why' },
        'Why sign up? Keep your progress, coins and stats on every device. ',
        'Guests can play without an account, but nothing is saved.',
      ),
      h('div', { class: 'panel-actions' }, button('Cancel', 'btn', close), submit),
    );
    setChildren(body, form);
    (registering ? email : email).focus();
  };

  const render = (): void => {
    if (app.account.signedIn) renderSignedIn();
    else renderForm();
  };

  // If the sign-in changes while the panel is open (a rejected token, say), redraw it.
  let lastSignedIn = app.account.signedIn;
  const unsubscribe = app.account.changed.subscribe(() => {
    if (app.account.signedIn !== lastSignedIn) {
      lastSignedIn = app.account.signedIn;
      render();
    } else if (app.account.signedIn) {
      renderSignedIn();
    }
  });

  open = openModal(root, panel, close);
  render();
}
