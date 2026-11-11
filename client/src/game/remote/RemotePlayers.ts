import type Phaser from 'phaser';
import {
  BREAK_ICON,
  clockMs,
  formatClock,
  getSubject,
  sanitizeAppearance,
  type Appearance,
  type PlayAnimMessage,
  type PlayerSnapshot,
  type TimerState,
} from '@study/shared';
import { app } from '../../app';
import { Character, type CharacterAction } from '../character/Character';
import { Pet } from '../character/Pet';
import type { OverlayScene } from '../scenes/OverlayScene';
import type { Seats } from '../world/Seats';

/** Remote characters are drawn this far in the past so there is always a sample to blend toward. */
const RENDER_DELAY_MS = 150;
/** A jump larger than this between two samples is a teleport, not a walk. */
const SNAP_DISTANCE = 64;
/** An anim state change and a playAnim message within this window count as one gesture. */
const GESTURE_DEDUPE_MS = 500;
const MAX_SAMPLES = 12;

interface Sample {
  t: number;
  x: number;
  y: number;
}

interface Remote {
  snap: PlayerSnapshot;
  character: Character;
  pet: Pet | null;
  petId: string;
  samples: Sample[];
  appearanceJson: string;
  seatId: string;
  lastAnim: string;
  gestureAt: number;
}

const GESTURES = new Set(['wave', 'stretch', 'drink']);

function parseAppearance(json: string): Appearance {
  let raw: Partial<Appearance> | null = null;
  try {
    raw = JSON.parse(json) as Partial<Appearance>;
  } catch {
    raw = null;
  }
  return sanitizeAppearance(app.manifest.character, raw);
}

/**
 * The other players on the current map: one Character each, moved smoothly
 * between the 10 Hz snapshots the server sends.
 */
export class RemotePlayers {
  private readonly remotes = new Map<string, Remote>();
  private readonly focusSeats = new Set<string>();
  private readonly unsubscribe: (() => void)[];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly overlay: OverlayScene,
    private readonly seats: Seats,
    private readonly mapId: string,
  ) {
    this.unsubscribe = [
      app.net.patched.subscribe(() => this.reconcile()),
      app.net.anims.subscribe((message) => this.gesture(message)),
    ];
    this.reconcile();
  }

  /** The character that represents a player, for chat bubbles. */
  sourceFor(id: string): Character | null {
    return this.remotes.get(id)?.character ?? null;
  }

  /** True when a remote player is in a focus session at this seat (lights its lamp). */
  isFocusingAt(seatId: string): boolean {
    return this.focusSeats.has(seatId);
  }

  update(deltaMs: number): void {
    const now = performance.now();
    this.focusSeats.clear();
    for (const [id, remote] of this.remotes) {
      const snap = remote.snap;
      const pos = this.position(remote, now - RENDER_DELAY_MS);
      remote.character.setPosition(pos.x, pos.y);
      remote.character.setFacing(snap.dir);
      this.applyLook(remote);
      this.applyActivity(id, remote);
      remote.character.update(deltaMs);
      remote.pet?.update(deltaMs, remote.character.x, remote.character.y);
      if (snap.phase === 'focus' && snap.seatId) this.focusSeats.add(snap.seatId);
    }
  }

  destroy(): void {
    for (const off of this.unsubscribe) off();
    for (const id of [...this.remotes.keys()]) this.remove(id);
  }

  /** Creates, updates and removes characters to match the players on this map. */
  private reconcile(): void {
    const present = new Set<string>();
    const now = performance.now();
    for (const snap of app.net.peers()) {
      if (snap.map !== this.mapId) continue;
      present.add(snap.id);
      let remote = this.remotes.get(snap.id);
      if (!remote) remote = this.add(snap, now);
      remote.snap = snap;
      const last = remote.samples[remote.samples.length - 1];
      if (!last || last.x !== snap.x || last.y !== snap.y) {
        remote.samples.push({ t: now, x: snap.x, y: snap.y });
        if (remote.samples.length > MAX_SAMPLES) remote.samples.shift();
      }
      this.syncSeat(remote);
    }
    for (const id of [...this.remotes.keys()]) if (!present.has(id)) this.remove(id);
  }

  private add(snap: PlayerSnapshot, now: number): Remote {
    const character = new Character(this.scene, parseAppearance(snap.appearance), snap.name);
    character.setPosition(snap.x, snap.y);
    character.setFacing(snap.dir);
    this.overlay.track(character);
    const remote: Remote = {
      snap,
      character,
      pet: null,
      petId: '',
      samples: [{ t: now, x: snap.x, y: snap.y }],
      appearanceJson: snap.appearance,
      seatId: '',
      lastAnim: snap.anim,
      gestureAt: 0,
    };
    this.remotes.set(snap.id, remote);
    return remote;
  }

  private remove(id: string): void {
    const remote = this.remotes.get(id);
    if (!remote) return;
    if (remote.seatId) this.seats.vacate(remote.seatId);
    this.overlay.untrack(remote.character);
    remote.character.destroy();
    remote.pet?.destroy();
    this.remotes.delete(id);
  }

  private syncSeat(remote: Remote): void {
    const seatId = remote.snap.seatId;
    if (seatId === remote.seatId) return;
    if (remote.seatId) this.seats.vacate(remote.seatId);
    if (seatId) this.seats.occupy(seatId, remote.snap.id);
    remote.seatId = seatId;
  }

  /** Blends between the two samples around `renderTime`. */
  private position(remote: Remote, renderTime: number): { x: number; y: number } {
    const samples = remote.samples;
    while (samples.length > 2 && samples[1]!.t <= renderTime) samples.shift();
    const a = samples[0]!;
    const b = samples[1];
    if (!b || renderTime >= b.t) return b ?? a;
    if (renderTime <= a.t || Math.hypot(b.x - a.x, b.y - a.y) > SNAP_DISTANCE) return renderTime <= a.t ? a : b;
    const k = (renderTime - a.t) / (b.t - a.t);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }

  /** Name, look and pet follow the synced fields. */
  private applyLook(remote: Remote): void {
    const snap = remote.snap;
    remote.character.name = snap.name;
    if (snap.appearance !== remote.appearanceJson) {
      remote.appearanceJson = snap.appearance;
      remote.character.setAppearance(parseAppearance(snap.appearance));
    }
    if (snap.pet !== remote.petId) {
      remote.petId = snap.pet;
      remote.pet?.destroy();
      remote.pet = null;
      const sheet = app.manifest.pets.find((p) => p.id === snap.pet)?.sheet;
      if (sheet && this.scene.textures.exists(sheet)) {
        remote.pet = new Pet(this.scene, sheet, remote.character.x, remote.character.y);
      }
    }
  }

  /** Pose, thought bubble and the nameplate's second line. */
  private applyActivity(_id: string, remote: Remote): void {
    const snap = remote.snap;
    const c = remote.character;
    const now = performance.now();

    if (snap.anim !== remote.lastAnim) {
      remote.lastAnim = snap.anim;
      if (GESTURES.has(snap.anim) && now - remote.gestureAt > GESTURE_DEDUPE_MS) {
        remote.gestureAt = now;
        c.playOnce(snap.anim as PlayAnimMessage['anim']);
      }
    }

    const seated = snap.seatId !== '';
    let action: CharacterAction;
    if (snap.phase === 'focus' && seated) action = 'study';
    else if (snap.anim === 'walk') action = 'walk';
    else if (snap.anim === 'sleep') action = 'sleep';
    else if (seated || snap.anim === 'sit' || snap.anim === 'study') action = 'sit';
    else action = 'idle';
    c.setAction(action);

    const state: TimerState = {
      phase: snap.phase,
      config: null,
      phaseStartedAt: app.net.toLocalTime(snap.phaseStartedAt),
      phaseEndsAt: snap.phaseEndsAt > 0 ? app.net.toLocalTime(snap.phaseEndsAt) : null,
      cycle: snap.cycle,
    };
    const stars = snap.sessionsToday > 0 ? `  ★${snap.sessionsToday}` : '';
    if (snap.phase === 'focus') {
      const subject = getSubject(snap.subject);
      c.setBubble(subject.icon);
      c.statusText = `${subject.label} · ${formatClock(clockMs(state, Date.now()))}${stars}`;
    } else if (snap.phase === 'break') {
      c.setBubble(BREAK_ICON);
      c.statusText = `On break · ${formatClock(clockMs(state, Date.now()))}${stars}`;
    } else {
      c.setBubble(null);
      c.statusText = null;
    }
  }

  private gesture(message: PlayAnimMessage): void {
    const remote = this.remotes.get(message.id);
    if (!remote) return;
    remote.gestureAt = performance.now();
    remote.character.playOnce(message.anim);
  }
}
