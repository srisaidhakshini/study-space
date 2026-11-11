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
import type { VoiceTransport } from './VoiceClient';

export type VideoState = 'off' | 'joining' | 'on';

/** What the HTML interface sees of the study-desk video room. */
export interface VideoApi {
  readonly changed: Emitter;
  readonly state: VideoState;
  /** Your camera is open and unpaused. */
  readonly camOn: boolean;
  readonly supported: boolean;
  /** Your own camera stream, for the preview tile. */
  readonly localStream: MediaStream | null;
  /** Ids of people whose video is connected or connecting. */
  peerIds(): string[];
  remoteStream(id: string): MediaStream | null;
  /** True when you muted the player (their tile stays hidden). */
  isHidden(id: string): boolean;
  join(): Promise<void>;
  leave(): void;
  toggleCam(): void;
}

const DEFAULT_ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
/** Small and slow on purpose: everyone sends one copy to everyone else. */
const VIDEO_CONSTRAINTS: MediaTrackConstraints = { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 20 } };
const MAX_VIDEO_BITRATE = 250_000;
const MAX_ICE_RESTARTS = 2;

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  initiator: boolean;
  stream: MediaStream | null;
  connected: boolean;
  remoteSet: boolean;
  queued: RTCIceCandidateInit[];
  restarts: number;
}

/**
 * Camera sharing for people sitting at study desks: a full video mesh, like
 * the voice call but video only and separate from it. The server only lets
 * seated players in the same place join, and removes you when you stand up.
 */
export class VideoClient implements VideoApi {
  readonly changed = new Emitter();
  state: VideoState = 'off';
  camOn = false;
  localStream: MediaStream | null = null;

  private readonly peers = new Map<string, Peer>();
  private joining = false;
  private ice: RTCIceServer[] = DEFAULT_ICE;

  constructor(
    private readonly transport: VoiceTransport,
    private readonly isMuted: (id: string) => boolean,
    private readonly isBlocked: (id: string) => boolean,
    private readonly getIce: () => Promise<RTCIceServer[] | null>,
  ) {}

  get supported(): boolean {
    return typeof RTCPeerConnection !== 'undefined';
  }

  peerIds(): string[] {
    return [...this.peers.keys()];
  }

  remoteStream(id: string): MediaStream | null {
    return this.peers.get(id)?.stream ?? null;
  }

  isHidden(id: string): boolean {
    return this.isMuted(id) || this.isBlocked(id);
  }

  async join(): Promise<void> {
    if (this.state !== 'off' || this.joining) return;
    if (!this.supported || !navigator.mediaDevices?.getUserMedia) {
      bus.emit('toast', { text: 'The camera needs a modern browser on a secure (HTTPS) page.' });
      return;
    }
    this.joining = true;
    this.state = 'joining';
    this.changed.emit();
    const [stream, ice] = await Promise.all([this.openCamera(), this.getIce()]);
    if (ice && ice.length > 0) this.ice = ice;
    // Left (or stood up) while the permission prompt was open.
    if (!this.joining || !stream) {
      stream?.getTracks().forEach((t) => t.stop());
      this.teardown();
      return;
    }
    this.joining = false;
    this.localStream = stream;
    this.camOn = true;
    this.state = 'on';
    this.transport.send(C2S.videoJoin);
    this.changed.emit();
  }

  leave(): void {
    if (this.state === 'off' && !this.joining) return;
    if (this.state === 'on') this.transport.send(C2S.videoLeave);
    this.teardown();
  }

  toggleCam(): void {
    if (!this.localStream) return;
    this.camOn = !this.camOn;
    for (const track of this.localStream.getVideoTracks()) track.enabled = this.camOn;
    this.changed.emit();
  }

  /** The room connection is gone: end locally without messaging. */
  reset(): void {
    this.teardown();
  }

  /** Cuts the link to one person (after a block). */
  drop(id: string): void {
    this.closePeer(id);
  }

  // ---- Messages from the room --------------------------------------------

  onPeers(message: VoicePeersMessage): void {
    if (this.state !== 'on') return;
    for (const id of message.ids) {
      if (!this.peers.has(id) && !this.isBlocked(id)) void this.offerTo(id);
    }
  }

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
      if (!this.isBlocked(from)) void this.answer(from, data.sdp);
    } else if (data.kind === 'answer') {
      const p = this.peers.get(from);
      if (p?.initiator) void this.applyRemote(p, { type: 'answer', sdp: data.sdp });
    } else {
      const p = this.peers.get(from);
      if (p) void this.addCandidate(p, data.candidate);
    }
  }

  // ---- Camera ------------------------------------------------------------

  private async openCamera(): Promise<MediaStream | null> {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS, audio: false });
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      bus.emit('toast', { text: denied ? 'Camera blocked. Allow it in the browser to share video.' : 'No camera found.' });
      return null;
    }
  }

  // ---- Peer connections --------------------------------------------------

  private createPeer(id: string, initiator: boolean): Peer | null {
    if (this.peers.size >= VOICE_MAX_PEERS || !this.localStream) return null;
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const peer: Peer = { id, pc, initiator, stream: null, connected: false, remoteSet: false, queued: [], restarts: 0 };
    this.peers.set(id, peer);

    for (const track of this.localStream.getVideoTracks()) {
      const sender = pc.addTrack(track, this.localStream);
      const params = sender.getParameters();
      params.encodings = [{ ...(params.encodings?.[0] ?? {}), maxBitrate: MAX_VIDEO_BITRATE }];
      void sender.setParameters(params).catch(() => undefined);
    }
    this.preferVp8(pc);

    pc.onicecandidate = (event) => {
      this.sendSignal(id, { kind: 'candidate', candidate: event.candidate ? (event.candidate.toJSON() as Record<string, unknown>) : null });
    };
    pc.ontrack = (event) => {
      peer.stream = event.streams[0] ?? new MediaStream([event.track]);
      this.changed.emit();
    };
    pc.onconnectionstatechange = () => this.connectionChanged(peer);
    return peer;
  }

  /** Offering one codec keeps the session description small enough to relay. */
  private preferVp8(pc: RTCPeerConnection): void {
    try {
      const codecs = RTCRtpSender.getCapabilities?.('video')?.codecs;
      if (!codecs) return;
      const vp8 = codecs.filter((c) => c.mimeType.toLowerCase() === 'video/vp8');
      if (vp8.length === 0) return;
      for (const t of pc.getTransceivers()) t.setCodecPreferences(vp8);
    } catch {
      // Not supported: the full codec list still fits.
    }
  }

  private async offerTo(id: string): Promise<void> {
    const peer = this.createPeer(id, true);
    if (!peer) return;
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      this.sendSignal(id, { kind: 'offer', sdp: offer.sdp ?? '' });
    } catch (error) {
      console.warn('Video: could not create an offer', error);
    }
    this.changed.emit();
  }

  private async answer(from: string, sdp: string): Promise<void> {
    let peer = this.peers.get(from) ?? null;
    if (peer?.initiator) return;
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
      console.warn('Video: could not answer an offer', error);
    }
    this.changed.emit();
  }

  private async applyRemote(peer: Peer, description: RTCSessionDescriptionInit): Promise<void> {
    try {
      await peer.pc.setRemoteDescription(description);
      peer.remoteSet = true;
      await this.flushCandidates(peer);
    } catch (error) {
      console.warn('Video: bad answer', error);
    }
  }

  private async addCandidate(peer: Peer, candidate: Record<string, unknown> | null): Promise<void> {
    if (candidate === null) return;
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
    const was = peer.connected;
    peer.connected = state === 'connected';
    if (state === 'failed' && peer.initiator && peer.restarts < MAX_ICE_RESTARTS && this.peers.get(peer.id) === peer) {
      peer.restarts += 1;
      void this.restartIce(peer);
    }
    if (peer.connected !== was) this.changed.emit();
  }

  private async restartIce(peer: Peer): Promise<void> {
    try {
      peer.remoteSet = false;
      const offer = await peer.pc.createOffer({ iceRestart: true });
      await peer.pc.setLocalDescription(offer);
      this.sendSignal(peer.id, { kind: 'offer', sdp: offer.sdp ?? '' });
    } catch {
      // The link stays down; leaving and sitting again rebuilds it.
    }
  }

  private closePeer(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    this.changed.emit();
  }

  private sendSignal(to: string, data: VoiceSignalData): void {
    const message: VoiceSignalIn = { to, data };
    this.transport.send(C2S.videoSignal, message);
  }

  private teardown(): void {
    this.joining = false;
    for (const id of this.peerIds()) this.closePeer(id);
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.state = 'off';
    this.camOn = false;
    this.changed.emit();
  }
}
