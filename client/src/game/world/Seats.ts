import { TILE, type SeatDef } from '@study/shared';

/** Tracks who sits where. Occupants are ids so remote players fit in later. */
export class Seats {
  private readonly occupants = new Map<string, string>();
  private readonly byTile = new Map<string, SeatDef>();

  constructor(readonly defs: readonly SeatDef[]) {
    for (const seat of defs) this.byTile.set(`${seat.tx},${seat.ty}`, seat);
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
    for (const seat of this.defs) {
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
