import type { ChatDenyReason, EmoteName, ZoneDef } from '@study/shared';
import type { ChatLine } from './net/types';

/**
 * Messages between the Phaser game and the HTML interface. Persistent state
 * (profile, timer, sessions) lives in the stores on `app`; the bus only
 * carries moments and requests.
 */
export interface BusEvents {
  /** Game -> UI: every asset is loaded and `app.images` works. */
  'boot:ready': undefined;
  /** Game -> UI: the player entered a map or crossed into another zone. */
  location: { mapId: string; mapName: string; zone: ZoneDef | null };
  /** Game -> UI: whether a free seat is within reach (shows the sit hint). */
  'seat:near': { available: boolean; bed?: boolean };
  /** UI -> Game: sit on the nearest free seat. */
  'ui:sit': undefined;
  /** UI -> Audio: play the timer chime once so the alert volume can be judged. */
  'ui:alertPreview': undefined;
  /** UI -> Game: stand up (the timer service ends any running session). */
  'ui:stand': undefined;
  /** UI -> Game: play an emote on the player's character. */
  'ui:emote': { name: EmoteName };
  /** UI -> Game: a menu is open; ignore keyboard and pointer input. */
  'ui:lock': { locked: boolean };
  /** Anyone -> UI: show a short message. */
  toast: { text: string };
  /** Net -> UI: a chat line arrived (already filtered for mutes and blocks). */
  'chat:line': ChatLine;
  /** Net -> UI: the server refused your chat message. */
  'chat:denied': { reason: ChatDenyReason };
  /** Net -> Game/UI: the connection dropped unexpectedly. */
  'net:lost': { message: string };
}

type Handler<T> = (payload: T) => void;

class Bus {
  private readonly handlers = new Map<keyof BusEvents, Set<Handler<never>>>();

  /** Subscribes and returns a function that unsubscribes. */
  on<K extends keyof BusEvents>(event: K, handler: Handler<BusEvents[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof BusEvents>(event: K, ...payload: BusEvents[K] extends undefined ? [] : [BusEvents[K]]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of [...set]) (handler as Handler<BusEvents[K] | undefined>)(payload[0]);
  }
}

export const bus = new Bus();
