import type { ChatDenyReason, Direction, ServerListEntry, WelcomeMessage } from '@study/shared';
import type { Emitter } from '../state/emitter';
import type { VideoApi } from '../voice/VideoClient';
import type { VoiceApi } from '../voice/types';

/**
 * The public surface of the networking layer. The game and the HTML
 * interface depend on this interface only, never on Colyseus directly.
 */
export type NetStatus = 'offline' | 'connecting' | 'online';

/** A player other than yourself, for the player list and moderation menu. */
export interface PlayerInfo {
  id: string;
  name: string;
  map: string;
  tzOffsetMin: number;
  muted: boolean;
  blocked: boolean;
}

export interface NetApi {
  readonly status: NetStatus;
  /** Fires on status, player list, mute and block changes. */
  readonly changed: Emitter;
  /** Set once online: server name and the invite code friends can use. */
  readonly serverName: string;
  readonly inviteCode: string;
  /** Your own player id, or '' when offline. */
  readonly selfId: string;
  /** The welcome message of the current connection, or null when offline. */
  readonly welcome: WelcomeMessage | null;
  /** Voice call with the others in the room. */
  readonly voice: VoiceApi;
  /** Camera sharing for people seated at study desks. */
  readonly video: VideoApi;

  /** Lists the named servers with live player counts. Throws a readable Error on failure. */
  fetchServers(): Promise<ServerListEntry[]>;
  /** Joins by server name (an instance with space is chosen or opened) or by invite code. */
  join(target: { server: string } | { inviteCode: string }): Promise<void>;
  /** Leaves the room and returns to offline (solo) mode. */
  leave(): void;

  /** Other players currently in the room, any map. */
  players(): PlayerInfo[];
  sendChat(text: string): void;
  mute(id: string): void;
  unmute(id: string): void;
  block(id: string): void;
  unblock(id: string): void;
  report(id: string, reason: string): void;
}

/** One line in the chat log. `system` lines are notices, not player speech. */
export interface ChatLine {
  id: string;
  fromId: string;
  name: string;
  text: string;
  self: boolean;
  system: boolean;
}

export type { ChatDenyReason, Direction };
