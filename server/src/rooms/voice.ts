import {
  S2C,
  VOICE_MAX_PEERS,
  VOICE_SIGNAL_MAX_CHARS,
  VOICE_SIGNAL_RATE,
  type NoticeMessage,
  type VoicePeerMessage,
  type VoicePeersMessage,
  type VoiceSignalData,
  type VoiceSignalOut,
} from '@study/shared';
import type { PlayerSession } from './session';
import { isPlainObject } from './text';

/** Cheap structural check of a relayed WebRTC payload. The browsers on each end do the real parsing. */
function parseSignal(raw: unknown): { to: string; data: VoiceSignalData } | null {
  if (!isPlainObject(raw) || typeof raw.to !== 'string' || !isPlainObject(raw.data)) return null;
  const data = raw.data;
  let ok = false;
  if (data.kind === 'offer' || data.kind === 'answer') ok = typeof data.sdp === 'string';
  else if (data.kind === 'candidate') ok = data.candidate === null || isPlainObject(data.candidate);
  if (!ok) return null;
  let size = 0;
  try {
    size = JSON.stringify(data).length;
  } catch {
    return null;
  }
  return size <= VOICE_SIGNAL_MAX_CHARS ? { to: raw.to, data: data as unknown as VoiceSignalData } : null;
}

/**
 * Voice call membership and signaling for one room. Audio never passes
 * through the server: members open a peer-to-peer link to each other and only
 * their session descriptions and ICE candidates are relayed here.
 *
 * Whoever joins is told who is already in the call and sends each of them an
 * offer, so the two ends never both offer at once.
 */
export interface HubChannel {
  /** S2C message names for this hub. */
  peers: string;
  joined: string;
  left: string;
  signal: string;
  /** Who may join, and the notice for everyone else. Defaults to anyone. */
  canJoin?: (who: PlayerSession) => boolean;
  denied?: string;
  /** Whether two members may be linked at all (besides not blocking each other). Defaults to yes. */
  together?: (a: PlayerSession, b: PlayerSession) => boolean;
  /** Noun for the "call is full" notice. */
  label?: string;
}

export const VOICE_CHANNEL: HubChannel = {
  peers: S2C.voicePeers,
  joined: S2C.voicePeerJoined,
  left: S2C.voicePeerLeft,
  signal: S2C.voiceSignal,
};

/** Video is only for people sitting at a study seat, and only between people in the same place. */
export const VIDEO_CHANNEL: HubChannel = {
  peers: S2C.videoPeers,
  joined: S2C.videoPeerJoined,
  left: S2C.videoPeerLeft,
  signal: S2C.videoSignal,
  canJoin: (who) => who.seatKey !== null,
  denied: 'Sit down at a study desk to start your camera.',
  together: (a, b) => a.player.map === b.player.map,
  label: 'video room',
};

export class VoiceHub {
  private readonly members = new Set<string>();
  /** Per-member signaling allowance: {tokens, last refill time}. */
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private readonly sessions: ReadonlyMap<string, PlayerSession>,
    private readonly channel: HubChannel = VOICE_CHANNEL,
  ) {}

  has(id: string): boolean {
    return this.members.has(id);
  }

  join(who: PlayerSession): void {
    if (this.members.has(who.id)) return;
    if (this.channel.canJoin && !this.channel.canJoin(who)) {
      const notice: NoticeMessage = { text: this.channel.denied ?? 'You cannot join this call.' };
      who.client.send(S2C.notice, notice);
      return;
    }
    if (this.members.size >= VOICE_MAX_PEERS) {
      const notice: NoticeMessage = { text: `The ${this.channel.label ?? 'voice call'} is full (${VOICE_MAX_PEERS} people).` };
      who.client.send(S2C.notice, notice);
      return;
    }
    const existing: string[] = [];
    for (const id of this.members) {
      const other = this.sessions.get(id);
      if (other && !this.apart(who, other)) existing.push(id);
    }
    this.members.add(who.id);
    const peers: VoicePeersMessage = { ids: existing };
    who.client.send(this.channel.peers, peers);
    const joined: VoicePeerMessage = { id: who.id };
    for (const id of existing) this.sessions.get(id)?.client.send(this.channel.joined, joined);
  }

  leave(id: string): void {
    if (!this.members.delete(id)) return;
    this.buckets.delete(id);
    const left: VoicePeerMessage = { id };
    for (const other of this.members) this.sessions.get(other)?.client.send(this.channel.left, left);
  }

  /** The two players may not be linked: they block each other (either way) or the channel keeps them apart. */
  private apart(a: PlayerSession, b: PlayerSession): boolean {
    if (this.channel.together && !this.channel.together(a, b)) return true;
    return a.blocked.has(b.id) || b.blocked.has(a.id);
  }

  private allow(id: string, now: number): boolean {
    const bucket = this.buckets.get(id) ?? { tokens: VOICE_SIGNAL_RATE, at: now };
    bucket.tokens = Math.min(VOICE_SIGNAL_RATE, bucket.tokens + ((now - bucket.at) / 1000) * VOICE_SIGNAL_RATE);
    bucket.at = now;
    this.buckets.set(id, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  signal(from: PlayerSession, raw: unknown, now: number): void {
    if (!this.members.has(from.id) || !this.allow(from.id, now)) return;
    const message = parseSignal(raw);
    if (!message || message.to === from.id || !this.members.has(message.to)) return;
    const target = this.sessions.get(message.to);
    if (!target || this.apart(from, target)) return;
    const out: VoiceSignalOut = { from: from.id, data: message.data };
    target.client.send(this.channel.signal, out);
  }
}
