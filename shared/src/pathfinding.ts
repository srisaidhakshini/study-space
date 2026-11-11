import { isBlocked, type CollisionGrid } from './collision';

export interface TilePoint {
  x: number;
  y: number;
}

const SQRT2 = Math.SQRT2;

const NEIGHBOURS: readonly { dx: number; dy: number; cost: number }[] = [
  { dx: 1, dy: 0, cost: 1 },
  { dx: -1, dy: 0, cost: 1 },
  { dx: 0, dy: 1, cost: 1 },
  { dx: 0, dy: -1, cost: 1 },
  { dx: 1, dy: 1, cost: SQRT2 },
  { dx: 1, dy: -1, cost: SQRT2 },
  { dx: -1, dy: 1, cost: SQRT2 },
  { dx: -1, dy: -1, cost: SQRT2 },
];

/** Octile distance: the exact cost of an unobstructed 8-direction path. */
function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
}

/** Minimal binary heap keyed by a score array. */
class OpenSet {
  private items: number[] = [];
  constructor(private readonly score: Float32Array) {}

  get size(): number {
    return this.items.length;
  }

  push(node: number): void {
    const items = this.items;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.score[items[parent]!]! <= this.score[items[i]!]!) break;
      [items[parent], items[i]] = [items[i]!, items[parent]!];
      i = parent;
    }
  }

  pop(): number {
    const items = this.items;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < items.length && this.score[items[l]!]! < this.score[items[best]!]!) best = l;
        if (r < items.length && this.score[items[r]!]! < this.score[items[best]!]!) best = r;
        if (best === i) break;
        [items[best], items[i]] = [items[i]!, items[best]!];
        i = best;
      }
    }
    return top;
  }
}

/**
 * A* over the collision grid with 8-direction movement. Diagonal steps are
 * only allowed when both orthogonal neighbours are free, so paths never cut
 * corners. Returns the tiles from start to goal inclusive, or null.
 */
export function findPath(grid: CollisionGrid, start: TilePoint, goal: TilePoint): TilePoint[] | null {
  if (isBlocked(grid, start.x, start.y) || isBlocked(grid, goal.x, goal.y)) return null;
  const { width, height } = grid;
  const size = width * height;
  const startNode = start.y * width + start.x;
  const goalNode = goal.y * width + goal.x;
  if (startNode === goalNode) return [{ ...start }];

  const g = new Float32Array(size).fill(Infinity);
  const f = new Float32Array(size).fill(Infinity);
  const cameFrom = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const open = new OpenSet(f);

  g[startNode] = 0;
  f[startNode] = heuristic(start.x, start.y, goal.x, goal.y);
  open.push(startNode);

  while (open.size > 0) {
    const current = open.pop();
    if (current === goalNode) return rebuild(cameFrom, current, width);
    if (closed[current]) continue;
    closed[current] = 1;
    const cx = current % width;
    const cy = (current - cx) / width;

    for (const n of NEIGHBOURS) {
      const nx = cx + n.dx;
      const ny = cy + n.dy;
      if (isBlocked(grid, nx, ny)) continue;
      if (n.dx !== 0 && n.dy !== 0 && (isBlocked(grid, cx + n.dx, cy) || isBlocked(grid, cx, cy + n.dy))) continue;
      const node = ny * width + nx;
      if (closed[node]) continue;
      const tentative = g[current]! + n.cost;
      if (tentative < g[node]!) {
        g[node] = tentative;
        f[node] = tentative + heuristic(nx, ny, goal.x, goal.y);
        cameFrom[node] = current;
        open.push(node);
      }
    }
  }
  return null;
}

function rebuild(cameFrom: Int32Array, end: number, width: number): TilePoint[] {
  const path: TilePoint[] = [];
  let node = end;
  while (node !== -1) {
    const x = node % width;
    path.push({ x, y: (node - x) / width });
    node = cameFrom[node]!;
  }
  return path.reverse();
}

/** The closest walkable tile to a target, searching outward up to maxRadius. */
export function nearestWalkable(grid: CollisionGrid, target: TilePoint, maxRadius = 3): TilePoint | null {
  if (!isBlocked(grid, target.x, target.y)) return { ...target };
  let best: TilePoint | null = null;
  let bestDist = Infinity;
  for (let dy = -maxRadius; dy <= maxRadius; dy++) {
    for (let dx = -maxRadius; dx <= maxRadius; dx++) {
      const x = target.x + dx;
      const y = target.y + dy;
      if (isBlocked(grid, x, y)) continue;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = { x, y };
      }
    }
  }
  return best;
}
