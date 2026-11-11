import { Client, type Room } from '@colyseus/sdk';
import {
  C2S,
  CHAT_MAX_LENGTH,
  REPORT_REASON_MAX,
  S2C,
  type ApiError,
  type BlockMessage,
  type ChatDeniedMessage,
  type ChatMessageIn,
  type ChatMessageOut,
  type CorrectMessage,
  type DoorMessage,
  type EmoteMessage,
  type EmoteName,
  type JoinOptions,
  type JoinRequest,
  type JoinResponse,
  type MoveMessage,
  type NoticeMessage,
  type PlayAnimMessage,
  type PlayerSnapshot,
  type Profile,
  type ReportMessage,
  type ServerListEntry,
  type ServerListResponse,
  type SessionMessage,
  type SessionRecord,
  type SitMessage,
  type SitResultMessage,
  type StatsMessage,
  type TeleportMessage,
  type TimerConfig,
  type TimerEvent,
  type TimerEventMessage,
  type WelcomeMessage,
} from '@study/shared';
import { bus } from '../bus';
import { Emitter } from '../state/emitter';
import { AuthRejectedError } from './errors';
import { serverBase, tzOffsetMin, UNREACHABLE } from './http';
import type { ChatLine, NetApi, NetStatus, PlayerInfo } from './types';

const WELCOME_TIMEOUT_MS = 4000;
/** Tries to reserve and enter a room before giving up (an instance may fill in between). */
const JOIN_ATTEMPTS = 3;
/** Clock differences smaller than this are latency noise, not a wrong clock. */
const SKEW_THRESHOLD_MS = 1500;

/** The room's synced state as the SDK's reflection exposes it. */
interface PlayerMap {
  forEach(callback: (player: PlayerSnapshot, key: string) => void): void;
  get(key: string): PlayerSnapshot | undefined;
}
interface RoomState {
  players?: PlayerMap;
}
type GameRoom = Room<unknown, RoomState>;

function describe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === 'string' && error ? error : 'Something went wrong while connecting.';
}

/**
 * The connection to the multiplayer server. Implements the interface the
 * HTML interface uses (NetApi) plus the lower-level hooks the game needs:
 * typed senders, message emitters and read access to the synced players.
 */
export class NetClient implements NetApi {
  readonly changed = new Emitter();
  /** Fires after every state patch from the server (about 10 times a second). */
  readonly patched = new Emitter();
  readonly teleports = new Emitter<TeleportMessage>();
  readonly corrections = new Emitter<CorrectMessage>();
  readonly sitResults = new Emitter<SitResultMessage>();
  readonly anims = new Emitter<PlayAnimMessage>();
  readonly timerEvents = new Emitter<TimerEvent>();
  readonly sessionRecords = new Emitter<SessionRecord>();
  /** Coins, today's totals and streak, pushed to signed-in players. */
  readonly stats = new Emitter<StatsMessage>();

  status: NetStatus = 'offline';
  serverName = '';
  inviteCode = '';
  selfId = '';
  welcome: WelcomeMessage | null = null;

  private room: GameRoom | null = null;
  private leaving = false;
  private readonly muted = new Set<string>();
  private readonly blocked = new Set<string>();
  private roster = '';
  private lineCount = 0;
  /** Server clock minus client clock, in ms (0 unless the clocks really disagree). */
  private skewMs = 0;
  private timerSentAt = 0;

  /** Set by app.ts once the account store exists, so this file does not depend on it. */
  auth: { token(): string | null; rejected(): void } | null = null;

  constructor(private readonly getProfile: () => Profile | null) {}

  // ---- NetApi ------------------------------------------------------------

  async fetchServers(): Promise<ServerListEntry[]> {
    const body = await this.api<ServerListResponse>('/api/servers');
    return body.servers;
  }

  async join(target: { server: string } | { inviteCode: string }): Promise<void> {
    const profile = this.getProfile();
    if (!profile) throw new Error('Create your character before joining a server.');
    this.leave();
    this.setStatus('connecting');
    const token = this.auth?.token() ?? null;
    try {
      const request: JoinRequest = 'server' in target ? { server: target.server } : { inviteCode: target.inviteCode.trim().toUpperCase() };
      const options: JoinOptions = {
        name: profile.name,
        appearance: profile.appearance,
        pet: profile.pet,
        tzOffsetMin: tzOffsetMin(),
        ...(token ? { token } : {}),
      };
      // The API names a room but does not hold a seat, so an instance can
      // fill before we get in. Ask again (it picks or opens another one).
      let room: GameRoom | null = null;
      let reservation: JoinResponse | null = null;
      for (let attempt = 1; !room; attempt++) {
        reservation = await this.api<JoinResponse>('/api/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        });
        try {
          room = (await new Client(serverBase()).joinById(reservation.roomId, options)) as GameRoom;
        } catch (error) {
          if (this.isNetworkFailure(error)) throw new Error(UNREACHABLE);
          if (token && this.isAuthFailure(error)) {
            this.auth?.rejected();
            throw new AuthRejectedError();
          }
          if (attempt >= JOIN_ATTEMPTS) throw new Error(describe(error));
        }
      }
      await this.attach(room, reservation!.server);
    } catch (error) {
      this.dropRoom();
      this.setStatus('offline');
      throw error instanceof Error ? error : new Error(describe(error));
    }
  }

  leave(): void {
    const room = this.room;
    if (!room) return;
    this.leaving = true;
    this.dropRoom();
    void room.leave().catch(() => undefined);
    this.setStatus('offline');
  }

  players(): PlayerInfo[] {
    const out: PlayerInfo[] = [];
    this.eachPeer((p) => out.push({ id: p.id, name: p.name, map: p.map, muted: this.muted.has(p.id), blocked: this.blocked.has(p.id) }));
    return out;
  }

  sendChat(text: string): void {
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LENGTH);
    if (!clean) return;
    this.send<ChatMessageIn>(C2S.chat, { text: clean });
  }

  mute(id: string): void {
    this.muted.add(id);
    this.changed.emit();
  }

  unmute(id: string): void {
    this.muted.delete(id);
    this.changed.emit();
  }

  block(id: string): void {
    this.blocked.add(id);
    this.send<BlockMessage>(C2S.block, { targetId: id });
    this.changed.emit();
  }

  unblock(id: string): void {
    this.blocked.delete(id);
    this.send<BlockMessage>(C2S.unblock, { targetId: id });
    this.changed.emit();
  }

  report(id: string, reason: string): void {
    this.send<ReportMessage>(C2S.report, { targetId: id, reason: reason.trim().slice(0, REPORT_REASON_MAX) });
    bus.emit('toast', { text: 'Report sent. Thank you.' });
  }

  // ---- Game-facing API ---------------------------------------------------

  get online(): boolean {
    return this.status === 'online';
  }

  /** Your own synced state, or null when offline. */
  self(): PlayerSnapshot | null {
    return this.room?.state?.players?.get(this.selfId) ?? null;
  }

  /** Everyone else in the room (all maps). The objects update in place as patches arrive. */
  peers(): PlayerSnapshot[] {
    const out: PlayerSnapshot[] = [];
    this.eachPeer((p) => out.push(p));
    return out;
  }

  /** Converts a server timestamp to this computer's clock. */
  toLocalTime(serverMs: number): number {
    return serverMs - this.skewMs;
  }

  sendMove(message: MoveMessage): void {
    this.send(C2S.move, message);
  }
  sendDoor(doorId: string): void {
    this.send<DoorMessage>(C2S.door, { doorId });
  }
  sendSit(seatId: string): void {
    this.send<SitMessage>(C2S.sit, { seatId });
  }
  sendStand(): void {
    this.send(C2S.stand);
  }
  sendTimerStart(config: TimerConfig): void {
    this.timerSentAt = Date.now();
    this.send(C2S.timerStart, config);
  }
  sendTimerStop(): void {
    this.send(C2S.timerStop);
  }
  sendEmote(name: EmoteName): void {
    this.send<EmoteMessage>(C2S.emote, { name });
  }

  // ---- Internals ---------------------------------------------------------

  private setStatus(status: NetStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.changed.emit();
  }

  private send<T>(type: string, payload?: T): void {
    if (this.status !== 'online' || !this.room) return;
    this.room.send(type, payload);
  }

  private eachPeer(callback: (player: PlayerSnapshot) => void): void {
    this.room?.state?.players?.forEach((player, key) => {
      if (key !== this.selfId) callback(player);
    });
  }

  private isNetworkFailure(error: unknown): boolean {
    if (error instanceof TypeError) return true;
    const message = describe(error).toLowerCase();
    return message.includes('failed to fetch') || message.includes('network') || message.includes('econnrefused');
  }

  /** The server refuses a bad or expired token with an auth-flavoured error. */
  private isAuthFailure(error: unknown): boolean {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === 401 || code === 4401) return true;
    return /token|expired|sign[- ]?in|log[- ]?in|unauthori[sz]ed|auth/i.test(describe(error));
  }

  private async api<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(serverBase() + path, init);
    } catch {
      throw new Error(UNREACHABLE);
    }
    this.readServerClock(response);
    const body = (await response.json().catch(() => null)) as (T & Partial<ApiError>) | null;
    if (!response.ok) throw new Error(body?.error ?? `The server answered with an error (${response.status}).`);
    if (!body) throw new Error('The server sent an unreadable answer.');
    return body;
  }

  /** The Date header gives a coarse server clock when the server exposes it. */
  private readServerClock(response: Response): void {
    const header = response.headers.get('date');
    const server = header ? Date.parse(header) : NaN;
    if (Number.isNaN(server)) return;
    // Date has 1 s resolution, so only a clearly wrong clock is corrected.
    this.setSkew(server + 500 - Date.now());
  }

  private setSkew(diff: number): void {
    this.skewMs = Math.abs(diff) >= SKEW_THRESHOLD_MS ? diff : 0;
  }

  private dropRoom(): void {
    const room = this.room;
    this.room = null;
    this.welcome = null;
    this.selfId = '';
    this.serverName = '';
    this.inviteCode = '';
    this.roster = '';
    this.muted.clear();
    this.blocked.clear();
    if (room) room.removeAllListeners();
  }

  private async attach(room: GameRoom, serverName: string): Promise<void> {
    this.room = room;
    this.leaving = false;
    // A dropped connection ends the session; the game continues solo.
    room.reconnection.enabled = false;

    const welcome = new Promise<WelcomeMessage>((resolve) => room.onMessage(S2C.welcome, (m: WelcomeMessage) => resolve(m)));
    room.onMessage(S2C.teleport, (m: TeleportMessage) => this.teleports.emit(m));
    room.onMessage(S2C.correct, (m: CorrectMessage) => this.corrections.emit(m));
    room.onMessage(S2C.sitResult, (m: SitResultMessage) => this.sitResults.emit(m));
    room.onMessage(S2C.playAnim, (m: PlayAnimMessage) => this.anims.emit(m));
    room.onMessage(S2C.timerEvent, (m: TimerEventMessage) => this.timerEvents.emit(m.event));
    room.onMessage(S2C.session, (m: SessionMessage) => this.sessionRecords.emit(m.record));
    room.onMessage(S2C.stats, (m: StatsMessage) => this.stats.emit(m));
    room.onMessage(S2C.notice, (m: NoticeMessage) => bus.emit('toast', { text: m.text }));
    room.onMessage(S2C.chatDenied, (m: ChatDeniedMessage) => bus.emit('chat:denied', { reason: m.reason }));
    room.onMessage(S2C.chat, (m: ChatMessageOut) => this.receiveChat(m));
    room.onStateChange(() => this.statePatched());
    room.onLeave((code, reason) => this.roomLeft(room, code, reason));
    room.onError((code, message) => console.warn(`Room error ${code}: ${message ?? ''}`));

    const greeting = await Promise.race([
      welcome,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), WELCOME_TIMEOUT_MS)),
    ]);
    const self = room.state?.players?.get(room.sessionId);
    const result: WelcomeMessage | null =
      greeting ??
      (self ? { id: room.sessionId, server: serverName, inviteCode: '', map: self.map, x: self.x, y: self.y, dir: self.dir } : null);
    if (!result) throw new Error('The server did not finish the handshake. Try again.');

    this.selfId = room.sessionId;
    this.welcome = result;
    this.serverName = result.server || serverName;
    this.inviteCode = result.inviteCode;
    this.roster = this.rosterKey();
    this.setStatus('online');
  }

  private statePatched(): void {
    this.patched.emit();
    const roster = this.rosterKey();
    if (roster !== this.roster) {
      this.roster = roster;
      this.changed.emit();
    }
  }

  /** A string that changes when someone joins, leaves, renames or changes map. */
  private rosterKey(): string {
    const parts: string[] = [];
    this.eachPeer((p) => parts.push(`${p.id}:${p.name}:${p.map}`));
    return parts.sort().join('|');
  }

  private receiveChat(message: ChatMessageOut): void {
    if (this.muted.has(message.fromId) || this.blocked.has(message.fromId)) return;
    const line: ChatLine = {
      id: String(++this.lineCount),
      fromId: message.fromId,
      name: message.name,
      text: message.text,
      self: message.fromId === this.selfId,
      system: false,
    };
    bus.emit('chat:line', line);
  }

  private roomLeft(room: GameRoom, code: number, reason?: string): void {
    if (this.room !== room) return; // already replaced or left on purpose
    const wasLeaving = this.leaving;
    this.dropRoom();
    this.setStatus('offline');
    if (wasLeaving) return;
    const message = reason ? `Disconnected: ${reason}` : `Connection lost (${code}). Continuing solo.`;
    bus.emit('net:lost', { message });
    bus.emit('toast', { text: message });
  }

  /** Called by the timer service when a server timer first appears, to measure clock skew. */
  noteTimerStarted(serverStartedAt: number): void {
    if (!this.timerSentAt) return;
    const sentAt = this.timerSentAt;
    this.timerSentAt = 0;
    // The server stamped the start about when we sent the message, give or take latency.
    if (Date.now() - sentAt < 1500) this.setSkew(serverStartedAt - sentAt);
  }
}
