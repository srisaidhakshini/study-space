import type Phaser from 'phaser';
import {
  buddySeat,
  formatClock,
  seatFeetPosition,
  TILE,
  TREE_PLOT,
  TREE_STAGES,
  treeStage,
  type SeatDef,
} from '@study/shared';
import { app } from '../app';
import { Character } from '../game/character/Character';
import { DEPTH } from '../game/depths';
import type { LoadedMap } from '../game/world/mapLoader';
import type { Seats } from '../game/world/Seats';
import { focusGhostEnabled, studyDeskStatus } from './preferences';

export class StudyWorld {
  private readonly pairBySeat = new Map<string, SeatDef>();
  private readonly tiles: { image: Phaser.GameObjects.Image; x: number; y: number }[];
  private readonly unsubscribe: () => void;
  private ghost: Character | null = null;
  private focusStart = -1;
  private targetMs = 0;
  private status = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: LoadedMap,
    private readonly seats: Seats,
  ) {
    this.tiles = map.treeTiles.map((image) => ({ image, x: image.x, y: image.y }));
    this.unsubscribe = app.net.treeChanged.subscribe(() => this.updateTree());
    this.updateTree();
    if (map.id !== 'library') return;

    for (const seat of seats.defs) {
      const partner = buddySeat(seats.defs, seat);
      if (!partner) continue;
      this.pairBySeat.set(seat.id, partner);
      if (seat.tx > partner.tx) continue;
      const x = (seat.tx + 1) * TILE;
      const y = (seat.ty + 0.84) * TILE;
      scene.add.rectangle(x, y, 11, 2, 0x6eabc2).setDepth(DEPTH.walls + 1);
    }
  }

  update(dt: number): void {
    if (this.map.id !== 'library') return;
    const seat = app.timer.seatId;
    const partner = seat ? this.pairBySeat.get(seat) : undefined;
    const occupant = partner && this.seats.occupantOf(partner.id);
    const peer = occupant ? app.net.visiblePeer(occupant) : null;
    const phase = app.timer.state;
    const buddy = peer
      ? `Buddy · ${peer.name}${peer.phase === 'focus' ? ' · Focusing' : peer.phase === 'break' ? ' · On break' : ''}`
      : '';

    if (phase.phase !== 'focus' || !partner) {
      this.focusStart = -1;
      this.setStatus(buddy);
      return this.clearGhost();
    }
    if (this.focusStart !== phase.phaseStartedAt) {
      this.focusStart = phase.phaseStartedAt;
      const previous = [...app.sessions.all()].reverse().find((record) => Number.isFinite(record.minutes) && record.minutes > 0);
      this.targetMs = (previous?.minutes ?? 0) * 60_000;
    }
    const remaining = this.targetMs - Math.max(0, Date.now() - this.focusStart);
    if (!focusGhostEnabled() || occupant || remaining <= 0) {
      this.setStatus(buddy);
      return this.clearGhost();
    }

    if (!this.ghost) {
      const profile = app.profile.get();
      if (!profile) return;
      this.ghost = new Character(this.scene, profile.appearance, 'Focus ghost');
      const feet = seatFeetPosition(partner);
      this.ghost.setPosition(feet.x, feet.y);
      this.ghost.setFacing(partner.facing);
      this.ghost.setAction('study');
      this.ghost.setOpacity(0.45);
    }
    this.setStatus(`Focus ghost · ${formatClock(remaining)}`);
    this.ghost.update(dt);
  }

  destroy(): void {
    this.unsubscribe();
    this.setStatus('');
    this.clearGhost();
  }

  private clearGhost(): void {
    if (!this.ghost) return;
    this.ghost.destroy();
    this.ghost = null;
  }

  private setStatus(status: string): void {
    if (status === this.status) return;
    this.status = status;
    studyDeskStatus.emit(status);
  }

  private updateTree(): void {
    const { x, y, size } = TREE_PLOT;
    const center = (x + size / 2) * TILE;
    const base = (y + size) * TILE;
    const { scale } = TREE_STAGES[treeStage(app.net.treeMinutes)];
    for (const tile of this.tiles) {
      tile.image.setScale(scale).setPosition(center + (tile.x - center) * scale, base + (tile.y - base) * scale);
    }
  }
}
