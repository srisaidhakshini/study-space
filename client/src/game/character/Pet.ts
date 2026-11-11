import type Phaser from 'phaser';
import { directionFromVector, MOVE_SPEED, PET_FRAME, type Direction } from '@study/shared';
import { ensurePetAnimations, petAnimKey } from './textures';

/** How far behind its owner the pet walks, measured along the owner's trail. */
const FOLLOW_DISTANCE = 18;
const TRAIL_STEP = 2;
const SPEED = MOVE_SPEED * 1.15;

interface Point {
  x: number;
  y: number;
}

/**
 * A small companion that retraces its owner's footsteps, so it always stays
 * on ground the owner could walk on.
 */
export class Pet {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly trail: Point[] = [];
  private facing: Direction = 'down';
  private moving = false;
  private x: number;
  private y: number;

  constructor(
    scene: Phaser.Scene,
    private readonly sheet: string,
    x: number,
    y: number,
  ) {
    ensurePetAnimations(scene, sheet);
    this.x = x + 10;
    this.y = y + 2;
    this.sprite = scene.add.sprite(this.x, this.y, sheet, 0).setOrigin(0.5, (PET_FRAME - 1) / PET_FRAME);
    this.trail.push({ x: this.x, y: this.y });
    this.play();
  }

  /** Call every frame with the owner's feet position. */
  update(deltaMs: number, ownerX: number, ownerY: number): void {
    const newest = this.trail[this.trail.length - 1]!;
    if (Math.hypot(ownerX - newest.x, ownerY - newest.y) >= TRAIL_STEP) {
      this.trail.push({ x: ownerX, y: ownerY });
    }

    const target = this.followPoint(ownerX, ownerY);
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.hypot(dx, dy);
    const step = (SPEED * deltaMs) / 1000;
    const wasMoving = this.moving;
    const oldFacing = this.facing;

    if (distance > 1) {
      const travel = Math.min(step, distance);
      this.x += (dx / distance) * travel;
      this.y += (dy / distance) * travel;
      this.facing = directionFromVector(dx, dy, this.facing);
      this.moving = true;
    } else {
      this.moving = false;
    }
    if (wasMoving !== this.moving || oldFacing !== this.facing) this.play();
    this.sprite.setPosition(this.x, this.y).setDepth(this.y);
  }

  /** Jumps next to the owner, forgetting the trail (after a teleport). */
  warp(x: number, y: number): void {
    this.trail.length = 0;
    this.x = x + 10;
    this.y = y + 2;
    this.trail.push({ x: this.x, y: this.y });
    this.sprite.setPosition(this.x, this.y).setDepth(this.y);
  }

  destroy(): void {
    this.sprite.destroy();
  }

  /** The trail point FOLLOW_DISTANCE behind the owner; older points are dropped. */
  private followPoint(ownerX: number, ownerY: number): Point {
    let travelled = 0;
    let previous: Point = { x: ownerX, y: ownerY };
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const point = this.trail[i]!;
      travelled += Math.hypot(previous.x - point.x, previous.y - point.y);
      if (travelled >= FOLLOW_DISTANCE) {
        if (i > 0) this.trail.splice(0, i);
        return point;
      }
      previous = point;
    }
    return this.trail[0]!;
  }

  private play(): void {
    this.sprite.play(petAnimKey(this.sheet, this.moving ? 'walk' : 'idle', this.facing), true);
  }
}
