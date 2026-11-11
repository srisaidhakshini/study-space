import {
  C2S,
  VOICE_MAX_PEERS,
  type VoicePeersMessage,
  type VoicePeerMessage,
  type VoiceSignalData,
  type VoiceSignalIn,
  type VoiceSignalOut,
} from '@study/shared';
import { bus } from '../bus';
import { Emitter } from '../state/emitter';
import type { VoiceApi, VoicePeerInfo, VoiceState } from './types';

/** What the voice client needs from the connection: a way to send room messages. */
export interface VoiceTransport {
  send(type: string, payload?: unknown): void;
}

/** Used when the server cannot be asked. Strict NATs need the TURN relay the server hands out. */
const DEFAULT_ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
/** Level meter polling, and the loudness (0..1 RMS) that counts as talking. */
const METER_INTERVAL_MS = 120;
const SPEAK_ON = 0.03;
const SPEAK_OFF = 0.015;
/** How long to keep showing "speaking" after the level drops, so the dot does not flicker. */
const SPEAK_HOLD_MS = 300;
const MAX_ICE_RESTARTS = 2;


/** Reads loudness from a stream so the interface can show who is talking. */
class Meter {
  private readonly source: MediaStreamAudioSourceNode;
  private readonly analyser: AnalyserNode;
  private readonly samples: Uint8Array<ArrayBuffer>;
  private loudUntil = 0;
  speaking = false;

  constructor(context: AudioContext, stream: MediaStream) {
    this.source = context.createMediaStreamSource(stream);
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 512;
    this.samples = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    this.source.connect(this.analyser);
  }

  /** Samples the level now. Returns true if `speaking` changed. */
  poll(now: number, active: boolean): boolean {
    let next = false;
    if (active) {
      this.analyser.getByteTimeDomainData(this.samples);
      let sum = 0;
      for (const v of this.samples) {
        const d = (v - 128) / 128;
        sum += d * d;
      }
      const rms = Math.sqrt(sum / this.samples.length);
      if (rms >= (this.speaking ? SPEAK_OFF : SPEAK_ON)) this.loudUntil = now + SPEAK_HOLD_MS;
      next = now < this.loudUntil;
    }
    const changed = next !== this.speaking;
    this.speaking = next;
    return changed;
  }

  close(): void {
    this.source.disconnect();
    this.analyser.disconnect();
  }
}

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  /** True when we sent the offer (we joined after them). Only the initiator restarts ICE. */
  initiator: boolean;
  audio: HTMLAudioElement;
  meter: Meter | null;
  connected: boolean;
  failed: boolean;
  remoteSet: boolean;
  queued: RTCIceCandidateInit[];
  restarts: number;
}

/**
 * Voice call over WebRTC, as a full mesh: one audio link to every other
 * person in the call. Fine for a study room of a handful of people (the room
 * allows up to 50, but only VOICE_MAX_PEERS can share a call). The game server
 * relays signaling only; the audio goes directly between browsers.
 *
 * Whoever joins offers to everyone already in the call, so the two ends never
 * negotiate at the same time.
 */
export class VoiceClient implements VoiceApi {
  readonly changed = new Emitter();
  state: VoiceState = 'off';
  micOn = false;
  hasMic = false;
  selfSpeaking = false;

  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private selfMeter: Meter | null = null;
  private meterTimer = 0;
  private readonly peers = new Map<string, Peer>();
  private joining = false;

  constructor(
    private readonly transport: VoiceTransport,
    /** True when you muted this player (their link stays up, you just do not hear them). */
    private readonly isMuted: (id: string) => boolean,
    /** True when you blocked this player (no link at all). */
    private readonly isBlocked: (id: string) => boolean,
    /** STUN/TURN servers from the game server, or null to use the built-in defaults. */
    private readonly getIce: () => Promise<RTCIceServer[] | null>,
  ) {}

  private ice: RTCIceServer[] = DEFAULT_ICE;

  private silenced(id: string): boolean {
    return this.isMuted(id) || this.isBlocked(id);
  }

  // ---- VoiceApi ----------------------------------------------------------

  get supported(): boolean {
    return typeof RTCPeerConnection !== 'undefined';
  }

  peer(id: string): VoicePeerInfo | null {
    const p = this.peers.get(id);
    if (!p) return null;
    return { connected: p.connected, failed: p.failed, speaking: p.meter?.speaking ?? false };
  }

  /** Ids of everyone you are in a call with, or trying to connect to. */
  peerIds(): string[] {
    return [...this.peers.keys()];
  }

  async join(): Promise<void> {
    if (this.state !== 'off' || this.joining) return;
    if (!this.supported) {
      bus.emit('toast', { text: "This browser can't do voice calls." });
      return;
    }
    this.joining = true;
    this.state = 'joining';
    this.changed.emit();

    // The click that got us here is what allows audio to start playing.
    this.context = new AudioContext();
    void this.context.resume().catch(() => undefined);
    const [, ice] = await Promise.all([this.openMic(), this.getIce()]);
    if (ice && ice.length > 0) this.ice = ice;

    // The room may have been left while the permission prompt was open.
    if (!this.joining) {
      this.teardown();
      return;
    }
    this.joining = false;
    this.state = 'on';
    this.micOn = this.stream !== null;
    this.startMeter();
    this.transport.send(C2S.voiceJoin);
    this.changed.emit();
  }

  leave(): void {
    if (this.state === 'off' && !this.joining) return;
    if (this.state === 'on') this.transport.send(C2S.voiceLeave);
    this.teardown();
  }

  toggleMic(): void {
    if (!this.stream) {
      // Listen-only because the mic could not be opened; try asking again.
      if (this.state === 'on') void this.retryMic();
      return;
    }
    this.micOn = !this.micOn;
    for (const track of this.stream.getAudioTracks()) track.enabled = this.micOn;
    if (!this.micOn) this.selfSpeaking = false;
    this.changed.emit();
  }

  /** Applies mute/block changes to the audio that is playing. */
  refreshSilenced(): void {
    for (const p of this.peers.values()) p.audio.muted = this.silenced(p.id);
    this.changed.emit();
  }

  /** Cuts the link to one person (after a block). The server stops relaying for them too. */
  drop(id: string): void {
    if (this.peers.has(id)) this.closePeer(id);
  }

  // ---- Messages from the room --------------------------------------------

  /** The server told us who is in the call: offer to each of them. */
  onPeers(message: VoicePeersMessage): void {
    if (this.state !== 'on') return;
    for (const id of message.ids) {
      if (!this.peers.has(id) && !this.isBlocked(id)) void this.offerTo(id);
    }
  }

  /** Someone joined; they will send us an offer, so there is nothing to do but be ready. */
  onPeerJoined(_message: VoicePeerMessage): void {
    this.changed.emit();
  }

  onPeerLeft(message: VoicePeerMessage): void {
    this.closePeer(message.id);
  }

  onSignal(message: VoiceSignalOut): void {
    if (this.state !== 'on') return;
    const { from, data } = message;
    if (data.kind === 'offer') {
      if (this.isBlocked(from)) return;
      void this.answer(from, data.sdp);
    } else if (data.kind === 'answer') {
      const p = this.peers.get(from);
      if (p?.initiator) void this.applyRemote(p, { type: 'answer', sdp: data.sdp });
    } else {
      const p = this.peers.get(from);
      if (p) void this.addCandidate(p, data.candidate);
    }
  }

  /** The room connection is gone: end the call locally without messaging. */
  reset(): void {
    this.teardown();
  }

  // ---- Microphone --------------------------------------------------------

  private async openMic(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      bus.emit('toast', { text: 'The microphone needs a secure (HTTPS) page. Joined listen-only.' });
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.hasMic = true;
    } catch (error) {
      this.stream = null;
      this.hasMic = false;
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      bus.emit('toast', {
        text: denied ? 'Microphone blocked. Joined listen-only; allow it in the browser to talk.' : 'No microphone found. Joined listen-only.',
      });
    }
  }

  /**
   * Listen-only listeners who later allow the mic: rebuild every link so each
   * one negotiates sending (cheap with a handful of people).
   */
  private async retryMic(): Promise<void> {
    await this.openMic();
    if (!this.stream || this.state !== 'on') return;
    this.micOn = true;
    for (const id of this.peerIds()) this.closePeer(id);
    this.transport.send(C2S.voiceLeave);
    this.transport.send(C2S.voiceJoin);
    this.selfMeter?.close();
    this.selfMeter = this.context ? new Meter(this.context, this.stream) : null;
    this.changed.emit();
  }

  // ---- Peer connections --------------------------------------------------

  private createPeer(id: string, initiator: boolean): Peer | null {
    if (this.peers.size >= VOICE_MAX_PEERS) return null;
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.muted = this.silenced(id);
    const peer: Peer = { id, pc, initiator, audio, meter: null, connected: false, failed: false, remoteSet: false, queued: [], restarts: 0 };
    this.peers.set(id, peer);

    if (this.stream) {
      for (const track of this.stream.getAudioTracks()) pc.addTrack(track, this.stream);
    } else {
      pc.addTransceiver('audio', { direction: 'recvonly' });
    }

    pc.onicecandidate = (event) => {
      this.sendSignal(id, { kind: 'candidate', candidate: event.candidate ? (event.candidate.toJSON() as Record<string, unknown>) : null });
    };
    pc.ontrack = (event) => {
      const remote = event.streams[0] ?? new MediaStream([event.track]);
      audio.srcObject = remote;
      void audio.play().catch(() => undefined);
      peer.meter?.close();
      peer.meter = this.context ? new Meter(this.context, remote) : null;
    };
    pc.onconnectionstatechange = () => this.connectionChanged(peer);
    return peer;
  }

  private async offerTo(id: string): Promise<void> {
    const peer = this.createPeer(id, true);
    if (!peer) return;
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.sendSignal(id, { kind: 'offer', sdp: offer.sdp ?? '' });
    } catch (error) {
      console.warn('Voice: could not create an offer', error);
      this.markFailed(peer);
    }
    this.changed.emit();
  }

  private async answer(from: string, sdp: string): Promise<void> {
    // A repeated offer means the initiator restarted ICE on a link we already have.
    let peer = this.peers.get(from) ?? null;
    if (peer?.initiator) return; // we offered to them; they must answer, never offer back
    if (!peer) peer = this.createPeer(from, false);
    if (!peer) return;
    try {
      await peer.pc.setRemoteDescription({ type: 'offer', sdp });
      peer.remoteSet = true;
      await this.flushCandidates(peer);
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      this.sendSignal(from, { kind: 'answer', sdp: answer.sdp ?? '' });
    } catch (error) {
      console.warn('Voice: could not answer an offer', error);
      this.markFailed(peer);
    }
    this.changed.emit();
  }

  private async applyRemote(peer: Peer, description: RTCSessionDescriptionInit): Promise<void> {
    try {
      await peer.pc.setRemoteDescription(description);
      peer.remoteSet = true;
      await this.flushCandidates(peer);
    } catch (error) {
      console.warn('Voice: bad answer', error);
      this.markFailed(peer);
    }
  }

  private async addCandidate(peer: Peer, candidate: Record<string, unknown> | null): Promise<void> {
    if (candidate === null) return; // end-of-candidates marker
    const init = candidate as RTCIceCandidateInit;
    if (!peer.remoteSet) {
      peer.queued.push(init);
      return;
    }
    await peer.pc.addIceCandidate(init).catch(() => undefined);
  }

  private async flushCandidates(peer: Peer): Promise<void> {
    const queued = peer.queued;
    peer.queued = [];
    for (const init of queued) await peer.pc.addIceCandidate(init).catch(() => undefined);
  }

  private connectionChanged(peer: Peer): void {
    const state = peer.pc.connectionState;
    const wasConnected = peer.connected;
    peer.connected = state === 'connected';
    if (state === 'connected') peer.failed = false;
    if (state === 'failed') {
      // Network change or blocked path: the side that offered tries a fresh ICE round.
      if (peer.initiator && peer.restarts < MAX_ICE_RESTARTS && this.peers.get(peer.id) === peer) {
        peer.restarts += 1;
        void this.restartIce(peer);
      } else {
        this.markFailed(peer);
      }
    }
    if (peer.connected !== wasConnected || state === 'failed') this.changed.emit();
  }

  private async restartIce(peer: Peer): Promise<void> {
    try {
      peer.remoteSet = false;
      const offer = await peer.pc.createOffer({ iceRestart: true });
      await peer.pc.setLocalDescription(offer);
      this.sendSignal(peer.id, { kind: 'offer', sdp: offer.sdp ?? '' });
    } catch {
      this.markFailed(peer);
    }
  }

  private markFailed(peer: Peer): void {
    peer.failed = true;
    peer.connected = false;
    this.changed.emit();
  }

  private closePeer(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    peer.meter?.close();
    peer.audio.srcObject = null;
    this.changed.emit();
  }

  private sendSignal(to: string, data: VoiceSignalData): void {
    const message: VoiceSignalIn = { to, data };
    this.transport.send(C2S.voiceSignal, message);
  }

  // ---- Level meters ------------------------------------------------------

  private startMeter(): void {
    if (this.context && this.stream) this.selfMeter = new Meter(this.context, this.stream);
    window.clearInterval(this.meterTimer);
    this.meterTimer = window.setInterval(() => this.pollMeters(), METER_INTERVAL_MS);
  }

  private pollMeters(): void {
    const now = performance.now();
    let changed = false;
    if (this.selfMeter) {
      const was = this.selfSpeaking;
      this.selfMeter.poll(now, this.micOn);
      this.selfSpeaking = this.selfMeter.speaking;
      changed = was !== this.selfSpeaking;
    }
    for (const p of this.peers.values()) {
      if (p.meter?.poll(now, !p.audio.muted)) changed = true;
    }
    if (changed) this.changed.emit();
  }

  // ---- Teardown ----------------------------------------------------------

  private teardown(): void {
    this.joining = false;
    window.clearInterval(this.meterTimer);
    this.meterTimer = 0;
    for (const id of this.peerIds()) this.closePeer(id);
    this.selfMeter?.close();
    this.selfMeter = null;
    if (this.stream) for (const track of this.stream.getTracks()) track.stop();
    this.stream = null;
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.state = 'off';
    this.micOn = false;
    this.hasMic = false;
    this.selfSpeaking = false;
    this.changed.emit();
  }
}
