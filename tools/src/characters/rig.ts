import { PixelCanvas, tracePolyline, type Pt } from '../png';
import type { ArmPose, LegPose, Pose } from './poses';

/** 'side' faces left; the right-facing row is a mirror image. */
export type View = 'down' | 'side' | 'up';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where every body part sits for one frame. All layers draw from this. */
export interface Rig {
  view: View;
  pose: Pose;
  /** Top-left of the head box (HEAD_SIZE square). */
  head: Pt;
  torso: Box;
  /** Far leg first. */
  legs: Box[];
  /** Horizontal upper legs, only when seated in the side view. */
  thighs: Box[];
  shoes: Box[];
  /** Pixel centres along each arm from shoulder to hand; far arm first. */
  arms: Pt[][];
  /** Top-left of the cup when one is held. */
  cup: Pt | null;
}

export const HEAD_SIZE = 20;
const HEAD_X = 6;
const HEAD_Y = 9;
const TORSO_Y = 29;
const LEG_Y = 39;

type ArmTable = Record<ArmPose, [number, number][]>;

/** Offsets from the shoulder for the screen-right arm, front view. */
const ARMS_FRONT: ArmTable = {
  rest: [[0, 0], [0, 6]],
  swingF: [[0, 0], [0, 5]],
  swingB: [[0, 0], [0, 7]],
  desk: [[0, 0], [-1, 3], [-4, 5]],
  deskA: [[0, 0], [-1, 3], [-5, 5]],
  deskB: [[0, 0], [-1, 3], [-3, 4]],
  page: [[0, 0], [1, 3], [3, 4]],
  upLow: [[0, 0], [3, -3]],
  upHigh: [[0, 0], [3, -4], [4, -10]],
  upFull: [[0, 0], [2, -5], [3, -12]],
  waveA: [[0, 0], [3, -2], [5, -9]],
  waveB: [[0, 0], [3, -2], [3, -10]],
  cupLow: [[0, 0], [-1, 3], [-4, 4]],
  cupMouth: [[0, 0], [-1, 2], [-5, -2]],
};

/** Seen from behind, arms reaching forward are foreshortened. */
const ARMS_BACK: ArmTable = {
  ...ARMS_FRONT,
  desk: [[0, 0], [0, 3], [-1, 4]],
  deskA: [[0, 0], [0, 3], [-1, 5]],
  deskB: [[0, 0], [0, 3], [-1, 3]],
  page: [[0, 0], [1, 2], [2, 3]],
  cupLow: [[0, 0], [0, 3], [-1, 4]],
  cupMouth: [[0, 0], [0, 2], [-1, 1]],
};

/** Near arm in the side view; negative x is forward (facing left). */
const ARMS_SIDE: ArmTable = {
  rest: [[0, 0], [0, 6]],
  swingF: [[0, 0], [-2, 5]],
  swingB: [[0, 0], [2, 5]],
  desk: [[0, 0], [-1, 3], [-5, 4]],
  deskA: [[0, 0], [-1, 3], [-6, 4]],
  deskB: [[0, 0], [-1, 3], [-4, 3]],
  page: [[0, 0], [-2, 2], [-6, 2]],
  upLow: [[0, 0], [-4, -2]],
  upHigh: [[0, 0], [-5, -3], [-8, -9]],
  upFull: [[0, 0], [-5, -4], [-9, -11]],
  waveA: [[0, 0], [-5, -2], [-8, -8]],
  waveB: [[0, 0], [-5, -2], [-10, -6]],
  cupLow: [[0, 0], [-1, 3], [-5, 3]],
  cupMouth: [[0, 0], [-2, 3], [-6, -2]],
};

function arm(table: ArmTable, pose: ArmPose, sx: number, sy: number, mirror: boolean): Pt[] {
  return tracePolyline(table[pose].map(([dx, dy]) => ({ x: sx + (mirror ? -dx : dx), y: sy + dy })));
}

function frontLeg(x: number, pose: LegPose, seated: boolean): { leg: Box; shoe: Box } {
  const short = seated || pose === 'a';
  const h = short ? 2 : 4;
  return {
    leg: { x, y: LEG_Y, w: 4, h },
    shoe: { x: x === 11 ? 10 : 17, y: LEG_Y + h, w: 5, h: 3 },
  };
}

function sideLeg(pose: LegPose): { leg: Box; shoe: Box } {
  const dx = pose === 'a' ? -2 : pose === 'b' ? 2 : 0;
  const h = pose === 'b' ? 3 : 4;
  return {
    leg: { x: 14 + dx, y: LEG_Y, w: 4, h },
    shoe: { x: 13 + dx, y: LEG_Y + h, w: 5, h: 3 },
  };
}

export function buildRig(view: View, pose: Pose): Rig {
  const bob = pose.bob;
  const sleeping = pose.headDy >= 3;
  const head: Pt = {
    x: HEAD_X - (view === 'side' && sleeping ? 2 : 0),
    y: HEAD_Y + bob + pose.headDy,
  };
  const torsoY = TORSO_Y + bob;
  const torsoH = LEG_Y - torsoY;
  const shoulderY = torsoY + 2;

  if (view === 'side') {
    const torso: Box = { x: 12, y: torsoY, w: 8, h: torsoH };
    const near = arm(ARMS_SIDE, pose.armR, 15, shoulderY, false);
    const hand = near[near.length - 1]!;
    const cup = pose.cup ? { x: hand.x - 2, y: hand.y - 3 } : null;
    if (pose.seated) {
      return {
        view,
        pose,
        head,
        torso,
        legs: [{ x: 9, y: LEG_Y, w: 4, h: 4 }],
        thighs: [{ x: 9, y: 35, w: 9, h: 4 }],
        shoes: [{ x: 8, y: 43, w: 5, h: 3 }],
        arms: [near],
        cup,
      };
    }
    const far = sideLeg(pose.legL);
    const nearLeg = sideLeg(pose.legR);
    return {
      view,
      pose,
      head,
      torso,
      legs: [far.leg, nearLeg.leg],
      thighs: [],
      shoes: [far.shoe, nearLeg.shoe],
      arms: [near],
      cup,
    };
  }

  const table = view === 'up' ? ARMS_BACK : ARMS_FRONT;
  const left = frontLeg(11, pose.legL, pose.seated);
  const right = frontLeg(17, pose.legR, pose.seated);
  const armLeft = arm(table, pose.armL, 9, shoulderY, true);
  const armRight = arm(table, pose.armR, 22, shoulderY, false);
  const hand = armRight[armRight.length - 1]!;
  return {
    view,
    pose,
    head,
    torso: { x: 11, y: torsoY, w: 10, h: torsoH },
    legs: [left.leg, right.leg],
    thighs: [],
    shoes: [left.shoe, right.shoe],
    arms: [armLeft, armRight],
    cup: pose.cup && view === 'down' ? { x: hand.x - 2, y: hand.y - 3 } : null,
  };
}

/** Fills (or erases, with null) the rounded head silhouette. */
export function headShape(c: PixelCanvas, rig: Rig, color: string | null): void {
  c.roundRect(rig.head.x, rig.head.y, HEAD_SIZE, HEAD_SIZE, [4, 2, 1], [5, 3, 1], color);
}

/** Stamps a 3x3 brush along part of an arm. */
export function strokeArm(c: PixelCanvas, pts: Pt[], from: number, to: number, color: string): void {
  for (let i = Math.max(0, from); i < Math.min(pts.length, to); i++) {
    const p = pts[i]!;
    c.rect(p.x - 1, p.y - 1, 3, 3, color);
  }
}

/**
 * Darkens the underside of shapes: any pixel of ramp tone i that has nothing
 * below it steps to tone i+1. Gives each layer a soft drop shade for free.
 */
export function shadeUndersides(c: PixelCanvas, ...ramps: readonly (readonly string[])[]): void {
  const changes: { x: number; y: number; color: string }[] = [];
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const color = c.get(x, y);
      if (!color || c.alpha(x, y + 1) !== 0) continue;
      for (const ramp of ramps) {
        const i = ramp.indexOf(color);
        if (i >= 0 && i < ramp.length - 1) changes.push({ x, y, color: ramp[i + 1]! });
      }
    }
  }
  for (const ch of changes) c.set(ch.x, ch.y, ch.color);
}
