import { clockMs, DRINK_ZONE_PREFIX, formatClock, getSubject, type TimerState } from '@study/shared';
import { app } from '../app';
import { bus } from '../bus';
import { button, h, setChildren } from './dom';
import { copyText, getNet, watchNet } from './netAccess';

export interface HudActions {
  openCreator(): void;
  openTimerPanel(): void;
  openServers(): void;
  openPlayers(): void;
  openDrinkMenu(): void;
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
  const today = h('div', { class: 'chip today', attrs: { title: 'Completed sessions and focus minutes today' } });
  const connection = h('button', { class: 'chip chip-button connection', attrs: { type: 'button' } });
  const peopleBtn = button('People', 'btn btn-small', actions.openPlayers, { title: 'See who is here' });
  const voiceGroup = h('div', { class: 'voice-group' });
  const drinkBtn = button('Order a drink', 'btn btn-small', actions.openDrinkMenu, { title: 'Order a drink at the counter' });
  drinkBtn.hidden = true;
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
  let confirmingStand = false;

  const renderToday = (): void => {
    const totals = app.sessions.today();
    setChildren(today, `★ ${totals.sessions} · ${totals.minutes} min`);
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
          ? button('Sit here', 'btn btn-primary btn-big', () => bus.emit('ui:sit'))
          : button('Sit down to start a timer', 'btn btn-big', () => undefined, { disabled: true }),
      );
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

  const hud = h(
    'div',
    { class: 'hud' },
    h(
      'div',
      { class: 'hud-top' },
      h('div', { class: 'hud-left' }, location, connection),
      h(
        'div',
        { class: 'hud-actions' },
        today,
        voiceGroup,
        drinkBtn,
        peopleBtn,
        button('Servers', 'btn btn-small', actions.openServers, { title: 'Choose a server' }),
        button('Wave', 'btn btn-small', () => bus.emit('ui:emote', { name: 'wave' }), { title: 'Wave hello' }),
        button('Character', 'btn btn-small', actions.openCreator, { title: 'Edit your character' }),
      ),
    ),
    dock,
  );
  hud.hidden = true;

  bus.on('location', ({ mapName, zone }) => {
    hud.hidden = false;
    drinkBtn.hidden = !zone?.id.startsWith(DRINK_ZONE_PREFIX);
    setChildren(
      location,
      h('span', { class: 'location-map' }, mapName),
      zone && zone.name !== mapName ? h('span', { class: 'location-zone' }, zone.name) : null,
      zone?.silent ? h('span', { class: 'badge', attrs: { title: 'Chat is off here' } }, 'Silent zone') : null,
    );
  });
  bus.on('seat:near', ({ available }) => {
    if (seatNear === available) return;
    seatNear = available;
    if (!app.timer.seated) renderDock();
  });
  app.timer.changed.subscribe(() => {
    if (app.timer.state.phase !== 'focus') confirmingStand = false;
    renderDock();
  });
  app.sessions.changed.subscribe(renderToday);
  window.setInterval(updateClock, 250);

  watchNet(() => {
    renderConnection();
    renderVoice();
  });
  getNet()?.voice.changed.subscribe(renderVoice);
  renderToday();
  renderDock();
  return hud;
}
