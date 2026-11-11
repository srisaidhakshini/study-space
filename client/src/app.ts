import type { AssetManifest } from '@study/shared';
import { createNet } from './net';
import { ProfileStore } from './state/profile';
import { SessionStore } from './state/sessions';
import { TimerService } from './state/timerService';

const profile = new ProfileStore();
const sessions = new SessionStore();
const net = createNet(() => profile.get());

/**
 * Shared application state. `manifest` is set by main.ts before anything else
 * runs; `images` starts returning sheets once the game emits 'boot:ready'.
 */
export const app = {
  manifest: null as unknown as AssetManifest,
  /** Looks up a loaded image or sheet by its manifest key. */
  images: ((): CanvasImageSource | null => null) as (key: string) => CanvasImageSource | null,
  profile,
  sessions,
  /** Networking: implements NetApi, plus the hooks the game and the timer use. */
  net,
  timer: new TimerService(sessions, net),
};
