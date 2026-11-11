import type { Emitter } from '../state/emitter';

export type VoiceState = 'off' | 'joining' | 'on';

export interface VoicePeerInfo {
  /** The audio link is up. */
  connected: boolean;
  /** The link could not be established (strict network); a rejoin may help. */
  failed: boolean;
  speaking: boolean;
}

/** What the HTML interface sees of the voice call. */
export interface VoiceApi {
  readonly changed: Emitter;
  readonly state: VoiceState;
  /** Your microphone is open and unmuted. */
  readonly micOn: boolean;
  /** A microphone was opened (false when listen-only). */
  readonly hasMic: boolean;
  readonly selfSpeaking: boolean;
  readonly supported: boolean;
  peer(id: string): VoicePeerInfo | null;
  join(): Promise<void>;
  leave(): void;
  toggleMic(): void;
}
