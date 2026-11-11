import { ANIMATIONS, SHEET_COLUMNS } from '@study/shared';

export type ArmPose =
  | 'rest'
  | 'swingF'
  | 'swingB'
  | 'desk'
  | 'deskA'
  | 'deskB'
  | 'page'
  | 'upLow'
  | 'upHigh'
  | 'upFull'
  | 'waveA'
  | 'waveB'
  | 'cupLow'
  | 'cupMouth';

/** 'a' is the lifted (front views) or forward (side view) leg; 'b' its partner. */
export type LegPose = 'stand' | 'a' | 'b';

export interface Pose {
  /** Head and torso offset in pixels; positive is down. */
  bob: number;
  /** Extra head offset on top of the bob (nodding, sleeping). */
  headDy: number;
  seated: boolean;
  legL: LegPose;
  legR: LegPose;
  /** Screen-left arm in the front view. */
  armL: ArmPose;
  /** Screen-right arm in the front view; the near arm in the side view. */
  armR: ArmPose;
  eyesClosed: boolean;
  cup: boolean;
}

const BASE: Pose = {
  bob: 0,
  headDy: 0,
  seated: false,
  legL: 'stand',
  legR: 'stand',
  armL: 'rest',
  armR: 'rest',
  eyesClosed: false,
  cup: false,
};

const pose = (over: Partial<Pose>): Pose => ({ ...BASE, ...over });
const seated = (over: Partial<Pose>): Pose => pose({ seated: true, ...over });

const BY_ANIMATION: Record<keyof typeof ANIMATIONS, Pose[]> = {
  idle: [pose({}), pose({ bob: 1 })],
  walk: [
    pose({ legL: 'a', legR: 'b', armL: 'swingB', armR: 'swingF' }),
    pose({ bob: 1 }),
    pose({ legL: 'b', legR: 'a', armL: 'swingF', armR: 'swingB' }),
    pose({ bob: 1 }),
  ],
  sit: [seated({})],
  study: [
    seated({ headDy: 1, armL: 'desk', armR: 'deskA' }),
    seated({ headDy: 1, armL: 'desk', armR: 'desk' }),
    seated({ headDy: 1, armL: 'desk', armR: 'deskB' }),
  ],
  pageturn: [seated({ headDy: 1, armL: 'page', armR: 'desk' })],
  sleep: [
    seated({ headDy: 4, armL: 'desk', armR: 'desk', eyesClosed: true }),
    seated({ headDy: 5, armL: 'desk', armR: 'desk', eyesClosed: true }),
  ],
  drink: [
    pose({ armR: 'cupLow', cup: true }),
    pose({ armR: 'cupMouth', cup: true }),
    pose({ armR: 'cupMouth', cup: true, headDy: -1, eyesClosed: true }),
  ],
  wave: [pose({ armR: 'waveA' }), pose({ armR: 'waveB' })],
  stretch: [
    pose({ armL: 'upLow', armR: 'upLow' }),
    pose({ armL: 'upHigh', armR: 'upHigh', eyesClosed: true }),
    pose({ armL: 'upFull', armR: 'upFull', eyesClosed: true, bob: -1 }),
  ],
};

/** One pose per sheet column, in the order laid out by ANIMATIONS. */
export function buildColumnPoses(): Pose[] {
  const columns: Pose[] = new Array<Pose>(SHEET_COLUMNS).fill(BASE);
  for (const [name, def] of Object.entries(ANIMATIONS)) {
    const poses = BY_ANIMATION[name as keyof typeof ANIMATIONS];
    if (poses.length !== def.frames) {
      throw new Error(`Animation "${name}" needs ${def.frames} poses but has ${poses.length}`);
    }
    poses.forEach((p, i) => {
      columns[def.start + i] = p;
    });
  }
  return columns;
}
