import type { Appearance } from './character';
import type { Direction } from './constants';
import type { SessionRecord, TimerConfig, TimerEvent } from './timer';

/** Everything both sides must agree on for multiplayer. */

export const SERVER_PORT = 2567;
export const ROOM_NAME = 'world';
export const MAX_PLAYERS_PER_ROOM = 50;
/** State snapshots are broadcast at 10 Hz. */
export const PATCH_RATE_MS = 100;
/** The server advances timers and sleep state this often. */
export const SERVER_TICK_MS = 250;

/** Named servers shown on the server list. Each can open many instances. */
export const SERVER_NAMES = ['Maple', 'Birch', 'Cedar', 'Willow'] as const;

export const INVITE_CODE_LENGTH = 5;
/** Characters of an invite code (no look-alikes such as 0/O or 1/I). */
export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Movement validation
/** Fastest the server accepts, as a multiple of MOVE_SPEED (covers frame jitter). */
export const MOVE_SPEED_TOLERANCE = 1.5;
/** Largest time step the server credits to one move message, in ms. */
export const MAX_MOVE_DT_MS = 400;
/** How far from a seat tile's centre a player may be to sit, in pixels. */
export const SIT_RANGE = 40;
/** How far inside a door rectangle (plus margin, in pixels) a player must be to use it. */
export const DOOR_MARGIN = 20;

// Chat
/** Proximity chat reaches this far (pixels), within the same map. */
export const CHAT_RADIUS = 192;
export const CHAT_MAX_LENGTH = 140;
export const CHAT_COOLDOWN_MS = 800;
export const REPORT_REASON_MAX = 200;

// Voice (WebRTC mesh; the room only relays signaling, audio goes peer to peer)
/** Most people allowed in one voice call. A full mesh needs n*(n-1)/2 links, so it is capped. */
export const VOICE_MAX_PEERS = 12;
/**
 * Largest SDP/ICE payload the server relays, in characters of JSON. A video
 * SDP can reach several KB, so the server's transport allows messages of up
 * to SIGNAL_MAX_PAYLOAD bytes (Colyseus' default of 4096 is too small).
 */
export const VOICE_SIGNAL_MAX_CHARS = 12000;
/** Signaling messages a player may send per second (ICE candidates arrive in bursts). */
/** Largest single WebSocket message the game server accepts, in bytes. */
export const SIGNAL_MAX_PAYLOAD = 16384;
export const VOICE_SIGNAL_RATE = 60;

/** What a remote character is doing. The client maps these to animations. */
export const ANIM_STATES = ['idle', 'walk', 'sit', 'study', 'sleep', 'wave', 'stretch', 'drink'] as const;
export type AnimState = (typeof ANIM_STATES)[number];

/**
 * `drink` is only accepted while standing in a zone whose id starts with
 * "cafe" (ordering at the counter); `wave` works anywhere.
 */
export const EMOTES = ['wave', 'drink'] as const;
/** Zone id prefix where drinks can be ordered. */
export const DRINK_ZONE_PREFIX = 'cafe';
export type EmoteName = (typeof EMOTES)[number];

export interface ServerListEntry {
  name: string;
  /** Players across every instance of this server. */
  players: number;
  /** Capacity of one instance. */
  capacity: number;
  instances: number;
}

/** GET /api/servers */
export interface ServerListResponse {
  servers: ServerListEntry[];
}

/** POST /api/join  {server} or {inviteCode}; the response names the room to join. */
export interface JoinRequest {
  server?: string;
  inviteCode?: string;
}
export interface JoinResponse {
  roomId: string;
  server: string;
}
export interface ApiError {
  error: string;
}

/** GET /api/ice: servers for WebRTC voice. TURN entries carry short-lived credentials. */
export interface IceConfigResponse {
  iceServers: { urls: string | string[]; username?: string; credential?: string }[];
}

/** Options passed to joinById. */
export interface JoinOptions {
  name: string;
  appearance: Appearance;
  pet: string;
  /** Minutes east of UTC, e.g. 330 for India. Used for the local-time indicator. */
  tzOffsetMin: number;
}

/**
 * Synced room state: `state.players` is a map keyed by session id whose
 * values have exactly these fields. The server declares them as a Colyseus
 * schema; clients read them (through the SDK's reflection) as this type.
 */
export interface PlayerSnapshot {
  id: string;
  name: string;
  /** JSON of an Appearance. */
  appearance: string;
  pet: string;
  /** Minutes east of UTC, for the local-time indicator. */
  tz: number;
  map: string;
  /** Feet position in pixels. */
  x: number;
  y: number;
  dir: Direction;
  anim: AnimState;
  /** Occupied seat id, or ''. */
  seatId: string;
  phase: 'idle' | 'focus' | 'break';
  mode: 'pomodoro' | 'stopwatch';
  subject: string;
  /** Epoch ms; 0 while idle. */
  phaseStartedAt: number;
  /** Epoch ms; 0 for no end (idle or stopwatch). */
  phaseEndsAt: number;
  cycle: number;
  /** Focus sessions completed today (server local day). */
  sessionsToday: number;
}

// ---- Client -> server messages -------------------------------------------

export const C2S = {
  move: 'move',
  door: 'door',
  sit: 'sit',
  stand: 'stand',
  timerStart: 'timerStart',
  timerStop: 'timerStop',
  chat: 'chat',
  emote: 'emote',
  report: 'report',
  block: 'block',
  unblock: 'unblock',
  voiceJoin: 'voiceJoin',
  voiceLeave: 'voiceLeave',
  voiceSignal: 'voiceSignal',
  videoJoin: 'videoJoin',
  videoLeave: 'videoLeave',
  videoSignal: 'videoSignal',
} as const;

/** A WebRTC session description or ICE candidate for one peer (relayed untouched). */
export type VoiceSignalData =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'candidate'; candidate: Record<string, unknown> | null };
export interface VoiceSignalIn {
  /** Session id of the peer this is for. */
  to: string;
  data: VoiceSignalData;
}

/** The player's own predicted position; the server validates it. */
export interface MoveMessage {
  seq: number;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
}
export interface DoorMessage {
  doorId: string;
}
export interface SitMessage {
  seatId: string;
}
export type TimerStartMessage = TimerConfig;
export interface ChatMessageIn {
  text: string;
}
export interface EmoteMessage {
  name: EmoteName;
}
export interface ReportMessage {
  targetId: string;
  reason: string;
}
export interface BlockMessage {
  targetId: string;
}

// ---- Server -> client messages -------------------------------------------

export const S2C = {
  welcome: 'welcome',
  teleport: 'teleport',
  correct: 'correct',
  sitResult: 'sitResult',
  timerEvent: 'timerEvent',
  session: 'session',
  chat: 'chat',
  chatDenied: 'chatDenied',
  playAnim: 'playAnim',
  notice: 'notice',
  voicePeers: 'voicePeers',
  voicePeerJoined: 'voicePeerJoined',
  voicePeerLeft: 'voicePeerLeft',
  voiceSignal: 'voiceSignal',
  videoPeers: 'videoPeers',
  videoPeerJoined: 'videoPeerJoined',
  videoPeerLeft: 'videoPeerLeft',
  videoSignal: 'videoSignal',
} as const;

/** Sent to someone who joins voice: who is already in the call. The joiner then sends each an offer. */
export interface VoicePeersMessage {
  ids: string[];
}
/** Someone else joined or left the call (they will send you an offer after joining). */
export interface VoicePeerMessage {
  id: string;
}
export interface VoiceSignalOut {
  from: string;
  data: VoiceSignalData;
}

export interface WelcomeMessage {
  /** The player's own id (their session id). */
  id: string;
  server: string;
  /** Share this so friends can join the same instance. */
  inviteCode: string;
  map: string;
  x: number;
  y: number;
  dir: Direction;
}
/** The server moved the player (door, standing up, rejected move). */
export interface TeleportMessage {
  map: string;
  x: number;
  y: number;
  dir: Direction;
  reason: 'door' | 'stand' | 'spawn';
}
/** A move was rejected; snap back to this position. */
export interface CorrectMessage {
  seq: number;
  x: number;
  y: number;
}
export interface SitResultMessage {
  seatId: string;
  ok: boolean;
  reason?: 'taken' | 'far' | 'unknown' | 'seated';
  /** Final feet position and facing when ok. */
  x?: number;
  y?: number;
  dir?: Direction;
}
export interface TimerEventMessage {
  event: TimerEvent;
}
export interface SessionMessage {
  record: SessionRecord;
}
export interface ChatMessageOut {
  fromId: string;
  name: string;
  text: string;
}
export type ChatDenyReason = 'silent' | 'focus' | 'cooldown' | 'empty' | 'blocked';
export interface ChatDeniedMessage {
  reason: ChatDenyReason;
}
export interface PlayAnimMessage {
  id: string;
  anim: Extract<AnimState, 'wave' | 'stretch' | 'drink'>;
}
export interface NoticeMessage {
  text: string;
}
