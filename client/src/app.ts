import type { AssetManifest } from '@study/shared';
import { createNet } from './net';
import { tzOffsetMin } from './net/http';
import { bindHomes } from './net/homesApi';
import { ActivityTracker } from './state/activity';
import { AccountStore } from './state/account';
import { FriendsStore } from './state/friends';
import { HomeStore } from './state/homes';
import { ProfileStore } from './state/profile';
import { SessionStore } from './state/sessions';
import { SettingsStore } from './state/settings';
import { TimerService } from './state/timerService';

const profile = new ProfileStore();
const sessions = new SessionStore();
const net = createNet(() => profile.get());
const account = new AccountStore(profile, sessions, net);
const homes = new HomeStore();
bindHomes(net, homes);
const friends = new FriendsStore(account, net);

/**
 * Shared application state. `manifest` is set by main.ts before anything else
 * runs; `images` starts returning sheets once the game emits 'boot:ready'.
 */
const timer = new TimerService(sessions, net, () => !account.signedIn);
const activity = new ActivityTracker(net, timer, tzOffsetMin);
activity.start();

export const app = {
  manifest: null as unknown as AssetManifest,
  /** Looks up a loaded image or sheet by its manifest key. */
  images: ((): CanvasImageSource | null => null) as (key: string) => CanvasImageSource | null,
  profile,
  sessions,
  /** Networking: implements NetApi, plus the hooks the game and the timer use. */
  net,
  /** Sign-in, coins and server-side stats. Guests have none of it. */
  account,
  /** The home you are in, your furniture, the street, and edit mode. */
  homes,
  /** Friends and friend requests (signed-in players). */
  friends,
  /** Sound and sky preferences, saved on this device. */
  settings: new SettingsStore(),
  timer,
  /** Time in the app, in calls, studying and with friends (this device). */
  activity,
};
