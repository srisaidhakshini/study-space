import { TILE, type SeatDef } from '@study/shared';

/** Tracks who sits where. Occupants are ids so remote players fit in later. */
export class Seats {
  private readonly occupants = new Map<string, string>();
  private readonly byTile = new Map<string, SeatDef>();
  private current: readonly SeatDef[];

  constructor(defs: readonly SeatDef[]) {
    this.current = defs;
    this.index();
  }

  /** The seats of the map right now. */
  get defs(): readonly SeatDef[] {
    return this.current;
  }

  /**
   * Swaps the seat list (a home's furniture changed). Who sits where is kept
   * by seat id, so people on seats that still exist stay seated.
   */
  replace(defs: readonly SeatDef[]): void {
    this.current = defs;
    this.index();
  }

  /** True if a seat with this id exists now. */
  has(seatId: string): boolean {
    return this.current.some((s) => s.id === seatId);
  }

  private index(): void {
    this.byTile.clear();
    for (const seat of this.current) this.byTile.set(`${seat.tx},${seat.ty}`, seat);
  }

  at(tx: number, ty: number): SeatDef | null {
    return this.byTile.get(`${tx},${ty}`) ?? null;
  }

  isFree(seatId: string): boolean {
    return !this.occupants.has(seatId);
  }

  occupantOf(seatId: string): string | null {
    return this.occupants.get(seatId) ?? null;
  }

  occupy(seatId: string, occupantId: string): void {
    this.occupants.set(seatId, occupantId);
  }

  vacate(seatId: string): void {
    this.occupants.delete(seatId);
  }

  /** The closest unoccupied seat whose tile centre is within maxDistance pixels. */
  nearestFree(x: number, y: number, maxDistance: number): SeatDef | null {
    let best: SeatDef | null = null;
    let bestDistance = maxDistance;
    for (const seat of this.current) {
      if (!this.isFree(seat.id)) continue;
      const distance = Math.hypot(seat.tx * TILE + TILE / 2 - x, seat.ty * TILE + TILE / 2 - y);
      if (distance <= bestDistance) {
        best = seat;
        bestDistance = distance;
      }
    }
    return best;
  }
}
