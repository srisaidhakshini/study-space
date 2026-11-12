import { clockMs, DRINK_ZONE_PREFIX, formatClock, getSubject, type TimerState, type ZoneDef } from '@study/shared';
import { app } from '../app';
import { bus } from '../bus';
import { button, h, setChildren } from './dom';
import { copyText, getNet, watchNet } from './netAccess';
import { visibilityHint, visibilityLabel } from './homeText';
import { coinIcon, friendsIcon, houseIcon, lockIcon, openDoorIcon } from './pixelIcon';
import { speakerIcon } from './speakerIcon';

export interface HudActions {
  studyTools: HTMLElement;
  openAccount(): void;
  openStats(): void;
  openActivity(): void;
  openCreator(): void;
  openTimerPanel(): void;
  openServers(): void;
  openPlayers(): void;
  openDrinkMenu(): void;
  openSettings(): void;
  openFriends(): void;
}

function phaseLabel(state: TimerState): string {
  if (state.phase === 'break') return 'Break';
  const subject = getSubject(state.config?.subject ?? '').label;
  return state.config?.mode === 'stopwatch' ? `Stopwatch · ${subject}` : `Focus · ${subject}`;
}

function cycleLabel(state: TimerState): string {
  if (state.config?.mode === 'stopwatch') return 'Counting up';
  const done = state.cycle === 1 ? '1 session done' : `${state.cycle} sessions done`;
  return state.phase === 'focus' ? `Session ${state.cycle + 1}` : done;
}

/** The always-visible interface: location, quick actions and the timer dock. */
export function createHud(actions: HudActions): HTMLElement {
  const location = h('div', { class: 'chip location' });
  const today = h('button', {
    class: 'chip chip-button today',
    attrs: { type: 'button', title: 'Sessions and focus minutes today. Click for your stats.' },
  });
  today.addEventListener('click', (event) => {
    if (event.detail > 0) today.blur();
    actions.openStats();
  });
  const coins = h('div', { class: 'chip coins', attrs: { title: 'Focus coins, earned by studying' } });
  coins.hidden = true;
  const accountChip = h('button', { class: 'chip chip-button account-chip', attrs: { type: 'button' } });
  accountChip.addEventListener('click', (event) => {
    if (event.detail > 0) accountChip.blur();
    actions.openAccount();
  });
  const connection = h('button', { class: 'chip chip-button connection', attrs: { type: 'button' } });
  const peopleBtn = button('People', 'btn btn-small', actions.openPlayers, { title: 'See who is here' });
  const settingsBtn = button('', 'btn btn-small btn-settings', actions.openSettings, { title: 'Settings (M mutes)', 'aria-label': 'Settings' });
  const renderSettingsButton = (): void => {
    setChildren(settingsBtn, speakerIcon(app.settings.get().muted, 2), h('span', { class: 'btn-label' }, 'Settings'));
  };
  renderSettingsButton();
  app.settings.changed.subscribe(renderSettingsButton);
  const voiceGroup = h('div', { class: 'voice-group' });
  const drinkBtn = button('Order a drink', 'btn btn-small', actions.openDrinkMenu, { title: 'Order a drink at the counter' });
  drinkBtn.hidden = true;
  const homeBtn = button('Home', 'btn btn-small', () => {
    const id = app.account.account?.id;
    if (id) app.homes.visit(id);
  }, { title: 'Go to your home' });
  const friendsBtn = button('', 'btn btn-small btn-friends', actions.openFriends, { title: 'Friends', 'aria-label': 'Friends' });
  const editHomeBtn = button('Edit home', 'btn btn-small', () => app.homes.setEditing(!app.homes.editing), {
    title: 'Move furniture and decorate your home',
    'aria-pressed': 'false',
  });
  editHomeBtn.hidden = true;
  const dock = h('div', { class: 'dock' });
  const clock = h('div', { class: 'clock', attrs: { role: 'timer' } });

  const renderConnection = (): void => {
    const net = getNet();
    const status = net?.status ?? 'offline';
    peopleBtn.hidden = status !== 'online';
    connection.className = `chip chip-button connection connection-${status}`;
    if (!net || status === 'offline') {
      setChildren(connection, h('span', { class: 'dot' }), 'Solo');
      connection.title = 'Not connected. Open Servers to play with others.';
    } else if (status === 'connecting') {
      setChildren(connection, h('span', { class: 'dot' }), 'Connecting…');
      connection.title = 'Connecting to the server';
    } else {
      const count = net.players().length + 1;
      setChildren(connection, h('span', { class: 'dot' }), `${net.serverName} · ${count} online`);
      connection.title = `Invite code: ${net.inviteCode} (click to copy)`;
      peopleBtn.textContent = `People (${count})`;
    }
  };

  const renderVoice = (): void => {
    const net = getNet();
    const voice = net?.voice;
    voiceGroup.hidden = !net || net.status !== 'online' || !voice?.supported;
    if (!voice || voiceGroup.hidden) return;
    if (voice.state === 'off') {
      setChildren(voiceGroup, button('Join voice', 'btn btn-small', () => void voice.join(), { title: 'Talk with everyone in this room' }));
    } else if (voice.state === 'joining') {
      setChildren(voiceGroup, button('Joining…', 'btn btn-small', () => undefined, { disabled: true }));
    } else {
      const mic = button(
        voice.micOn ? 'Mic on' : voice.hasMic ? 'Mic muted' : 'Listening',
        `btn btn-small mic${voice.micOn ? ' mic-on' : ''}${voice.selfSpeaking ? ' mic-speaking' : ''}`,
        () => voice.toggleMic(),
        {
          title: voice.hasMic ? (voice.micOn ? 'Mute your microphone' : 'Unmute your microphone') : 'Allow the microphone to talk',
          'aria-pressed': String(voice.micOn),
        },
      );
      setChildren(voiceGroup, mic, button('Leave voice', 'btn btn-small', () => voice.leave(), { title: 'Leave the voice call' }));
    }
  };

  connection.addEventListener('click', (event) => {
    if (event.detail > 0) connection.blur();
    const net = getNet();
    if (!net || net.status !== 'online' || !net.inviteCode) {
      actions.openServers();
      return;
    }
    const code = net.inviteCode;
    void copyText(code).then((ok) => bus.emit('toast', { text: ok ? `Invite code ${code} copied` : `Invite code: ${code}` }));
  });

  let seatNear = false;
  let bedNear = false;
  let confirmingStand = false;

  const renderToday = (): void => {
    // Signed in and in a room: the server's numbers. Otherwise this device's own.
    const live = app.account.signedIn && getNet()?.status === 'online' ? app.account.live : null;
    const totals = live ? { sessions: live.todaySessions, minutes: live.todayMinutes } : app.sessions.today();
    setChildren(today, `★ ${totals.sessions} · ${totals.minutes} min`);
  };

  const renderAccount = (): void => {
    const account = app.account.account;
    if (app.account.signedIn && account) {
      setChildren(accountChip, h('span', { class: 'dot' }), account.name);
      accountChip.title = `Signed in as ${account.email}. Click for your account.`;
      accountChip.className = 'chip chip-button account-chip account-in';
      coins.hidden = false;
      setChildren(coins, coinIcon(2), String(app.account.coins));
    } else {
      setChildren(accountChip, h('span', { class: 'dot' }), 'Guest · Sign in');
      accountChip.title = 'Sign in to keep your progress, coins and stats';
      accountChip.className = 'chip chip-button account-chip';
      coins.hidden = true;
    }
    renderToday();
  };

  const updateClock = (): void => {
    const state = app.timer.state;
    if (state.phase !== 'idle') setChildren(clock, formatClock(clockMs(state, Date.now())));
  };

  const standUp = (): void => {
    confirmingStand = false;
    bus.emit('ui:stand');
  };
  const askStandUp = (): void => {
    if (app.timer.state.phase === 'focus') {
      confirmingStand = true;
      renderDock();
    } else {
      standUp();
    }
  };

  const renderDock = (): void => {
    const state = app.timer.state;
    dock.className = `dock dock-${state.phase}${confirmingStand ? ' dock-confirm' : ''}`;

    if (!app.timer.seated) {
      confirmingStand = false;
      setChildren(
        dock,
        seatNear
          ? button(bedNear ? 'Sleep here' : 'Sit here', 'btn btn-primary btn-big', () => bus.emit('ui:sit'))
          : button('Sit down to start a timer', 'btn btn-big', () => undefined, { disabled: true }),
      );
      return;
    }

    if (app.timer.sleeping) {
      setChildren(dock, h('span', { class: 'chip' }, 'Sleeping'), button('Get up', 'btn btn-small', standUp));
      return;
    }

    if (state.phase === 'idle') {
      confirmingStand = false;
      setChildren(
        dock,
        button('Start timer', 'btn btn-primary btn-big', actions.openTimerPanel),
        button('Stand up', 'btn btn-small', standUp),
      );
      return;
    }

    if (confirmingStand) {
      setChildren(
        dock,
        h('p', { class: 'confirm-text' }, 'Stand up and end this session? Only the minutes you finished are recorded.'),
        h(
          'div',
          { class: 'row' },
          button('Keep studying', 'btn btn-primary', () => {
            confirmingStand = false;
            renderDock();
          }),
          button('Stand up', 'btn', standUp),
        ),
      );
      return;
    }

    updateClock();
    setChildren(
      dock,
      h('div', { class: 'dock-info' }, h('div', { class: 'phase' }, phaseLabel(state)), h('div', { class: 'cycle' }, cycleLabel(state))),
      clock,
      h(
        'div',
        { class: 'row' },
        button('End session', 'btn btn-small', () => app.timer.stop()),
        button('Stand up', 'btn btn-small', askStandUp),
      ),
    );
  };

  // Everything that is not needed all the time lives in the Menu.
  const menuBtn = button('Menu', 'btn btn-small btn-menu', () => setMenu(menuPanel.hidden), {
    title: 'More: stats, home, friends, servers, character, settings',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
  });
  const menuPanel = h(
    'div',
    { class: 'hud-menu', attrs: { role: 'menu' } },
    today,
    coins,
    button('Your time', 'btn btn-small', actions.openActivity, { title: 'Time in the app, in calls, studying and with friends' }),
    homeBtn,
    editHomeBtn,
    friendsBtn,
    button('Servers', 'btn btn-small', actions.openServers, { title: 'Choose a server' }),
    button('Character', 'btn btn-small', actions.openCreator, { title: 'Edit your character' }),
    settingsBtn,
  );
  menuPanel.hidden = true;
  const menuWrap = h('div', { class: 'hud-menu-wrap' }, menuBtn, menuPanel);
  const setMenu = (open: boolean): void => {
    menuPanel.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.classList.toggle('active', open);
  };
  // Choosing anything, clicking elsewhere or pressing Escape closes the menu.
  menuPanel.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('button')) setMenu(false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!menuPanel.hidden && !menuWrap.contains(event.target as Node)) setMenu(false);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !menuPanel.hidden) setMenu(false);
  });

  const hud = h(
    'div',
    { class: 'hud' },
    h(
      'div',
      { class: 'hud-top' },
      h('div', { class: 'hud-left' }, location, connection, accountChip),
      h(
        'div',
        { class: 'hud-actions' },
        voiceGroup,
        drinkBtn,
        peopleBtn,
        actions.studyTools,
        button('Wave', 'btn btn-small', () => bus.emit('ui:emote', { name: 'wave' }), { title: 'Wave hello' }),
        menuWrap,
      ),
    ),
    dock,
  );
  hud.hidden = true;

  let lastLocation: { mapName: string; zone: ZoneDef | null } | null = null;
  const renderLocation = (): void => {
    const home = app.homes.info;
    const street = app.homes.street;
    if (home) {
      // Standing in a home: whose it is and who may visit. Visitors see this chip only.
      setChildren(
        location,
        houseIcon(2),
        h('span', { class: 'location-map' }, home.mine ? 'Your home' : `${home.ownerName}'s home`),
        h(
          'span',
          { class: 'badge badge-visibility', attrs: { title: visibilityHint(home.visibility) } },
          home.visibility === 'open' ? openDoorIcon(1) : lockIcon(1),
          visibilityLabel(home.visibility),
        ),
      );
      return;
    }
    if (street) {
      setChildren(location, h('span', { class: 'location-map' }, 'Residential Street'), h('span', { class: 'location-zone' }, `page ${street.page}`));
      return;
    }
    if (!lastLocation) return;
    const { mapName, zone } = lastLocation;
    setChildren(
      location,
      h('span', { class: 'location-map' }, mapName),
      zone && zone.name !== mapName ? h('span', { class: 'location-zone' }, zone.name) : null,
      zone?.silent ? h('span', { class: 'badge', attrs: { title: 'Chat is off here' } }, 'Silent zone') : null,
    );
  };

  const renderHomeControls = (): void => {
    const ready = getNet()?.status === 'online' && app.account.signedIn;
    homeBtn.disabled = !ready;
    homeBtn.title = ready ? 'Go to your home' : 'Join a server and sign in to visit homes';
    const editing = app.homes.editing;
    editHomeBtn.hidden = !(ready && app.homes.info?.mine);
    editHomeBtn.textContent = editing ? 'Stop editing' : 'Edit home';
    editHomeBtn.classList.toggle('active', editing);
    editHomeBtn.setAttribute('aria-pressed', String(editing));
    const waiting = app.account.signedIn ? app.friends.incomingCount : 0;
    setChildren(
      friendsBtn,
      friendsIcon(2),
      h('span', { class: 'btn-label' }, 'Friends'),
      waiting > 0 ? h('span', { class: 'dot-badge', attrs: { 'aria-hidden': 'true' } }, String(waiting)) : null,
    );
    menuBtn.classList.toggle('has-badge', waiting > 0);
    friendsBtn.title = waiting > 0 ? `Friends (${waiting} request${waiting === 1 ? '' : 's'} waiting)` : 'Friends';
    friendsBtn.setAttribute('aria-label', waiting > 0 ? `Friends, ${waiting} request${waiting === 1 ? '' : 's'} waiting` : 'Friends');
  };

  bus.on('location', ({ mapName, zone }) => {
    hud.hidden = false;
    drinkBtn.hidden = !zone?.id.startsWith(DRINK_ZONE_PREFIX);
    lastLocation = { mapName, zone };
    renderLocation();
  });
  app.homes.changed.subscribe(() => {
    renderLocation();
    renderHomeControls();
  });
  app.friends.changed.subscribe(renderHomeControls);
  bus.on('seat:near', ({ available, bed = false }) => {
    if (seatNear === available && bedNear === bed) return;
    seatNear = available;
    bedNear = bed;
    if (!app.timer.seated) renderDock();
  });
  app.timer.changed.subscribe(() => {
    if (app.timer.state.phase !== 'focus') confirmingStand = false;
    renderDock();
  });
  app.sessions.changed.subscribe(renderToday);
  app.account.changed.subscribe(renderAccount);
  app.account.changed.subscribe(renderHomeControls);
  app.account.coinsEarned.subscribe(() => {
    coins.classList.remove('pulse');
    void coins.offsetWidth; // restart the animation if it is already running
    coins.classList.add('pulse');
    window.setTimeout(() => coins.classList.remove('pulse'), 900);
  });
  window.setInterval(updateClock, 250);

  watchNet(() => {
    renderConnection();
    renderToday();
    renderVoice();
    renderHomeControls();
  });
  getNet()?.voice.changed.subscribe(renderVoice);
  renderAccount();
  renderToday();
  renderHomeControls();
  renderDock();
  return hud;
}
