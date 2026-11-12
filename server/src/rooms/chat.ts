import {
  CHAT_COOLDOWN_MS,
  CHAT_MAX_LENGTH,
  CHAT_RADIUS,
  S2C,
  filterProfanity,
  zoneAt,
  type ChatDenyReason,
  type ChatMessageOut,
} from '@study/shared';
import type { ServerMap } from '../world/maps';
import type { PlayerSession } from './session';
import { cleanText } from './text';

/** Finds the map for a runtime map id (places, street pages and homes). */
export type MapLookup = (mapId: string) => ServerMap | undefined;

/** Why a message may not be sent right now, or null if it may. */
function denial(sender: PlayerSession, text: string, resolve: MapLookup, now: number): ChatDenyReason | null {
  if (text === '') return 'empty';
  const map = resolve(sender.player.map);
  const zone = map ? zoneAt(map.objects.zones, sender.x, sender.y) : null;
  if (zone?.silent) return 'silent';
  if (now - sender.lastChatAt < CHAT_COOLDOWN_MS) return 'cooldown';
  return null;
}

/**
 * Applies the chat rules and delivers a message. Proximity chat: only players
 * on the same map within CHAT_RADIUS hear it, and nobody who has blocked the
 * sender (or been blocked by them). Returns the reason when refused.
 */
export function sendChat(
  sender: PlayerSession,
  rawText: unknown,
  sessions: ReadonlyMap<string, PlayerSession>,
  resolve: MapLookup,
  now: number,
): ChatDenyReason | null {
  const cleaned = cleanText(rawText, CHAT_MAX_LENGTH);
  const reason = denial(sender, cleaned, resolve, now);
  if (reason) return reason;

  sender.lastChatAt = now;
  const message: ChatMessageOut = {
    fromId: sender.id,
    name: sender.player.name,
    text: filterProfanity(cleaned).text,
  };
  sender.client.send(S2C.chat, message);

  for (const other of sessions.values()) {
    if (other === sender || other.player.map !== sender.player.map) continue;
    if (other.blocked.has(sender.id) || sender.blocked.has(other.id)) continue;
    if (Math.hypot(other.x - sender.x, other.y - sender.y) > CHAT_RADIUS) continue;
    other.client.send(S2C.chat, message);
  }
  return null;
}
