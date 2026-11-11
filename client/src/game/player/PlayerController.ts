import {
  BREAK_ICON,
  clockMs,
  directionFromVector,
  FEET_ANCHOR,
  findPath,
  formatClock,
  getSubject,
  isBlocked,
  MOVE_SPEED,
  moveWithCollision,
  nearestWalkable,
  seatFeetPosition,
  SLEEP_AFTER_IDLE_SEC,
  TILE,
  toTile,
  type CollisionGrid,
  type Direction,
  type SeatDef,
  type SitResultMessage,
  type TilePoint,
  type TimerPhase,
} from '@study/shared';
import { app } from '../../app';
import { bus } from '../../bus';
import type { Character } from '../character/Character';
import type { Seats } from '../world/Seats';

/** How close (pixels, feet to seat centre) a seat must be to sit with one key press. */
export const SEAT_REACH = 28;
const HINT_EVERY_MS = 3500;
const LOCAL_ID = 'local';
/** Online, how long to wait for the server to answer a sit or stand request. */
const SERVER_REPLY_MS = 1500;

interface Point {
  x: number;
  y: number;
}

/**
 * Drives the local player's character: keyboard movement with collision,
 * click-to-move along A* paths, sitting, standing and timer-driven poses.
 */
export class PlayerController {
  private path: Point[] = [];
  private pendingSeat: SeatDef | null = null;
  private seat: SeatDef | null = null;
  private standPosition: Point | null = null;
  private lastActivity = Date.now();
  private lastPhase: TimerPhase = 'idle';
  private lastHint = 0;
  /** Online: a sit request waiting for the server's answer. */
  private sitRequest: { seat: SeatDef; sentAt: number } | null = null;
  /** Online: when a stand request was sent, or 0. */
  private standRequestedAt = 0;
  private sessionsToday = app.sessions.today().sessions;
  private readonly unsubscribe: (() => void)[];

  constructor(
    private readonly character: Character,
    private readonly grid: CollisionGrid,
    private readonly seats: Seats,
  ) {
    this.unsubscribe = [
      app.sessions.changed.subscribe(() => {
        this.sessionsToday = app.sessions.today().sessions;
      }),
      app.timer.events.subscribe((event) => {
        if (event === 'breakStart' && this.seat) this.character.playOnce('stretch');
      }),
    ];
  }

  get currentSeat(): SeatDef | null {
    return this.seat;
  }

  get seated(): boolean {
    return this.seat !== null;
  }

  /** Any key press or tap counts as activity and wakes a dozing character. */
  noteInput(): void {
    this.lastActivity = Date.now();
  }

  /** The free seat within reach, if the player is standing. */
  seatInReach(): SeatDef | null {
    if (this.seat) return null;
    return this.seats.nearestFree(this.character.x, this.character.y - 3, SEAT_REACH);
  }

  /** E / Space / the HUD button: stand if seated, otherwise sit on the seat in reach. */
  interact(): void {
    if (this.seat) this.stand();
    else this.sitNearest();
  }

  sitNearest(): void {
    const seat = this.seatInReach();
    if (seat) this.walkToSeat(seat);
    else if (!this.seat) bus.emit('toast', { text: 'Walk up to a chair or bench to sit.' });
  }

  /** Standing up. Online, the server decides and answers with where to stand. */
  stand(): void {
    if (!this.seat) return;
    if (!app.net.online) {
      this.standNow(this.standPosition);
      return;
    }
    const now = Date.now();
    if (now - this.standRequestedAt < SERVER_REPLY_MS) return;
    this.standRequestedAt = now;
    app.net.sendStand();
  }

  /** The server stood the player up (or confirmed it) at this position. */
  applyStand(x: number, y: number): void {
    if (this.seat) this.standNow({ x, y });
    else this.character.setPosition(x, y);
  }

  /** The server rejected a move: snap back to where it says we are. */
  applyCorrection(x: number, y: number): void {
    if (this.seat) return;
    this.path = [];
    this.character.setPosition(x, y);
  }

  /** Applies the server's answer to a sit request. */
  applySitResult(result: SitResultMessage): void {
    const request = this.sitRequest;
    if (!request || request.seat.id !== result.seatId) return;
    this.sitRequest = null;
    if (!result.ok) {
      const why: Record<string, string> = {
        taken: 'That seat is taken.',
        far: 'Walk closer to sit there.',
        seated: 'You are already sitting.',
      };
      bus.emit('toast', { text: (result.reason && why[result.reason]) || "Can't sit there." });
      return;
    }
    this.sit(request.seat, result.x !== undefined && result.y !== undefined ? { x: result.x, y: result.y, dir: result.dir } : null);
  }

  /** Forgets a pending server request that never got an answer. */
  private expireRequests(): void {
    const now = Date.now();
    if (this.sitRequest && now - this.sitRequest.sentAt > SERVER_REPLY_MS) {
      this.sitRequest = null;
      bus.emit('toast', { text: "Can't sit there right now." });
    }
    // The server did not stand us up: stand locally so the player is never stuck.
    if (this.seat && this.standRequestedAt > 0 && now - this.standRequestedAt > SERVER_REPLY_MS) {
      this.standRequestedAt = 0;
      this.standNow(this.standPosition);
    }
  }

  private standNow(position: Point | null): void {
    const seat = this.seat;
    if (!seat) return;
    this.standRequestedAt = 0;
    this.seats.vacate(seat.id);
    this.seat = null;
    this.character.cancelOneShot();
    this.character.setAction('idle');
    this.character.setBubble(null);
    if (position) this.character.setPosition(position.x, position.y);
    this.standPosition = null;
    app.timer.setSeat(null);
  }

  wave(): void {
    if (this.seat || this.path.length > 0) return;
    this.character.setAction('idle');
    this.character.playOnce('wave');
    if (app.net.online) app.net.sendEmote('wave');
  }

  /** Orders a drink at the cafe: the character sips from a cup. Standing only. */
  drink(): void {
    if (this.seat || this.path.length > 0) return;
    this.character.setAction('idle');
    this.character.setFacing('down'); // the cup is only visible from the front
    this.character.playOnce('drink');
    if (app.net.online) app.net.sendEmote('drink');
  }

  /** Click or tap on the world at a pixel position. */
  moveTo(worldX: number, worldY: number): void {
    if (this.seat && !this.leaveSeatForMovement()) return;
    const target: TilePoint = { x: toTile(worldX), y: toTile(worldY) };
    const seat = this.seats.at(target.x, target.y);
    if (seat) {
      if (this.seats.isFree(seat.id)) this.walkToSeat(seat);
      else bus.emit('toast', { text: 'That seat is taken.' });
      return;
    }
    const goal = nearestWalkable(this.grid, target);
    const tiles = goal ? findPath(this.grid, this.currentTile(), goal) : null;
    if (!tiles) return;
    this.pendingSeat = null;
    this.followTiles(tiles);
  }

  /** Call every frame. `axisX`/`axisY` are the held movement keys (-1, 0 or 1). */
  update(deltaMs: number, axisX: number, axisY: number): void {
    this.expireRequests();
    if (this.sitRequest) {
      // Waiting for the server: stay put.
      this.character.setAction('idle');
      return;
    }
    if (this.seat) {
      if ((axisX !== 0 || axisY !== 0) && this.leaveSeatForMovement()) return;
      this.updateSeated();
      return;
    }
    this.character.statusText = null;
    const step = (MOVE_SPEED * deltaMs) / 1000;
    if (axisX !== 0 || axisY !== 0) {
      this.path = [];
      this.pendingSeat = null;
      this.walkFree(step, axisX, axisY);
    } else if (this.path.length > 0) {
      this.walkPath(step);
    } else if (this.character.currentAction === 'walk') {
      this.character.setAction('idle');
    }
  }

  dispose(): void {
    for (const off of this.unsubscribe) off();
    if (this.seat) {
      this.seats.vacate(this.seat.id);
      this.seat = null;
      app.timer.setSeat(null);
    }
  }

  private currentTile(): TilePoint {
    const tile = { x: toTile(this.character.x), y: toTile(this.character.y - 3) };
    return isBlocked(this.grid, tile.x, tile.y) ? (nearestWalkable(this.grid, tile) ?? tile) : tile;
  }

  /**
   * Standing up by moving is only allowed with no session running, so a
   * stray key press cannot end a focus block. Returns true if the player stood.
   */
  private leaveSeatForMovement(): boolean {
    if (app.timer.state.phase === 'idle') {
      this.stand();
      return true;
    }
    const now = Date.now();
    if (now - this.lastHint > HINT_EVERY_MS) {
      this.lastHint = now;
      bus.emit('toast', { text: 'Session running. Press E or Stand up to end it.' });
    }
    return false;
  }

  private walkToSeat(seat: SeatDef): void {
    const start = this.currentTile();
    let best: TilePoint[] | null = null;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const tiles = findPath(this.grid, start, { x: seat.tx + dx, y: seat.ty + dy });
      if (tiles && (!best || tiles.length < best.length)) best = tiles;
    }
    if (!best) {
      bus.emit('toast', { text: "Can't reach that seat." });
      return;
    }
    this.pendingSeat = seat;
    if (best.length === 1) {
      this.path = [];
      this.arrive();
    } else {
      this.followTiles(best);
    }
  }

  private followTiles(tiles: TilePoint[]): void {
    // The first tile is where we already stand; skip it unless the next step
    // is diagonal, where cutting across could clip a corner.
    const first = tiles[0];
    const second = tiles[1];
    const skipFirst = first && second && (first.x === second.x || first.y === second.y);
    this.path = (skipFirst ? tiles.slice(1) : tiles).map((t) => ({
      x: t.x * TILE + FEET_ANCHOR.x,
      y: t.y * TILE + FEET_ANCHOR.y,
    }));
  }

  private walkFree(step: number, axisX: number, axisY: number): void {
    const length = Math.hypot(axisX, axisY);
    const c = this.character;
    const next = moveWithCollision(this.grid, c.x, c.y, (axisX / length) * step, (axisY / length) * step);
    c.cancelOneShot();
    c.setFacing(directionFromVector(axisX, axisY, c.facing));
    c.setAction(next.x !== c.x || next.y !== c.y ? 'walk' : 'idle');
    c.setPosition(next.x, next.y);
  }

  private walkPath(step: number): void {
    const c = this.character;
    c.cancelOneShot();
    let remaining = step;
    let { x, y } = c;
    while (remaining > 0 && this.path.length > 0) {
      const target = this.path[0]!;
      const dx = target.x - x;
      const dy = target.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance <= remaining) {
        x = target.x;
        y = target.y;
        remaining -= distance;
        this.path.shift();
      } else {
        x += (dx / distance) * remaining;
        y += (dy / distance) * remaining;
        c.setFacing(directionFromVector(dx, dy, c.facing));
        remaining = 0;
      }
    }
    c.setAction('walk');
    c.setPosition(x, y);
    if (this.path.length === 0) this.arrive();
  }

  private arrive(): void {
    const seat = this.pendingSeat;
    this.pendingSeat = null;
    this.character.setAction('idle');
    if (!seat) return;
    if (!this.seats.isFree(seat.id)) {
      bus.emit('toast', { text: 'That seat is taken.' });
      return;
    }
    if (app.net.online) {
      // The server checks the seat is free and in reach, then tells us.
      this.sitRequest = { seat, sentAt: Date.now() };
      app.net.sendSit(seat.id);
      return;
    }
    this.sit(seat, null);
  }

  private sit(seat: SeatDef, at: { x: number; y: number; dir?: Direction } | null): void {
    const c = this.character;
    this.standPosition = { x: c.x, y: c.y };
    this.seats.occupy(seat.id, LOCAL_ID);
    this.seat = seat;
    const feet = at ?? seatFeetPosition(seat);
    c.cancelOneShot();
    c.setFacing(at?.dir ?? seat.facing);
    c.setAction('sit');
    c.setPosition(feet.x, feet.y);
    this.lastActivity = Date.now();
    this.lastPhase = 'idle';
    app.timer.setSeat(seat.id);
  }

  /** Picks the seated pose, bubble and nameplate text from the timer. */
  private updateSeated(): void {
    const c = this.character;
    const now = Date.now();
    const state = app.timer.state;
    if (state.phase !== this.lastPhase) {
      this.lastPhase = state.phase;
      this.lastActivity = now;
    }

    if (state.phase === 'focus' && state.config) {
      const subject = getSubject(state.config.subject);
      const today = app.net.online ? (app.net.self()?.sessionsToday ?? 0) : this.sessionsToday;
      const stars = today > 0 ? `  ★${today}` : '';
      c.setAction('study');
      c.setBubble(subject.icon);
      c.statusText = `${subject.label} · ${formatClock(clockMs(state, now))}${stars}`;
    } else if (state.phase === 'break') {
      c.setAction('sit');
      c.setBubble(BREAK_ICON);
      c.statusText = `On break · ${formatClock(clockMs(state, now))}`;
    } else {
      const dozing = now - this.lastActivity > SLEEP_AFTER_IDLE_SEC * 1000;
      c.setAction(dozing ? 'sleep' : 'sit');
      c.setBubble(null);
      c.statusText = null;
    }
  }
}
