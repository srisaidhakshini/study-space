import './homes.css';
import { createStudyTools } from '../studyTogether/StudyTools';
import { openActivityPanel } from './ActivityPanel';
import { openAccountPanel } from './AccountPanel';
import { createChat } from './Chat';
import { openCreator } from './Creator';
import { h } from './dom';
import { openFriendsPanel } from './FriendsPanel';
import { createHomePanel } from './HomePanel';
import { watchHomeResults } from './homeToasts';
import { createHud } from './Hud';
import { createJoystick } from './Joystick';
import { openPlayers } from './Players';
import { openServerList } from './ServerList';
import { openSettingsPanel } from './SettingsPanel';
import { openStatsPanel } from './StatsPanel';
import { openDrinkMenu } from './DrinkMenu';
import { openTimerPanel } from './TimerPanel';
import { createToasts } from './Toasts';
import { createVideoDock } from './VideoDock';

export interface ServerListOpenOptions {
  /** Shown at the top of the screen, e.g. "Connection lost". */
  message?: string;
  /** False when there is no world behind the screen yet. Defaults to true. */
  closable?: boolean;
}

export interface UiHandle {
  /** Opens the character creator; `onDone` runs after the player saves. */
  openCreator(onDone?: () => void): void;
  /**
   * Opens the server list. `onEntered` runs once the player is in a server or
   * chose solo play; the HUD's Servers button reuses the latest one.
   */
  openServerList(onEntered: () => void, options?: ServerListOpenOptions): void;
}

/** Builds the HTML interface inside `root` (the layer above the game canvas). */
export function mountUi(root: HTMLElement): UiHandle {
  let entered: () => void = () => undefined;

  const showServerList = (options: ServerListOpenOptions = {}): void =>
    openServerList(root, {
      onEntered: entered,
      onAccount: (accountOptions) => openAccountPanel(root, accountOptions),
      closable: options.closable ?? true,
      ...(options.message ? { message: options.message } : {}),
    });

  const hud = createHud({
    studyTools: createStudyTools(root),
    openAccount: () => openAccountPanel(root),
    openStats: () => openStatsPanel(root),
    openActivity: () => openActivityPanel(root),
    openCreator: () => openCreator(root),
    openTimerPanel: () => openTimerPanel(root),
    openDrinkMenu: () => openDrinkMenu(root),
    openSettings: () => openSettingsPanel(root),
    openFriends: () => openFriendsPanel(root),
    openServers: () => showServerList(),
    openPlayers: () => openPlayers(root),
  });
  watchHomeResults();
  root.append(hud, createJoystick(), createVideoDock(), createChat(), createHomePanel(), h('div', { class: 'toast-layer' }, createToasts()));
  return {
    openCreator: (onDone) => openCreator(root, onDone),
    openServerList(onEntered, options = {}): void {
      entered = onEntered;
      showServerList(options);
    },
  };
}
