import type { SeatDef } from './mapSchema';

export const STUDY_TOGETHER = {
  tree: 'sharedTreeProgress',
  boardAction: 'questionBoardAction',
  board: 'questionBoardSnapshot',
} as const;

export const TREE_PLOT = { x: 15, y: 7, size: 6 } as const;
export const TREE_STAGES = [
  { minutes: 0, label: 'Sapling', scale: 0.25 },
  { minutes: 60, label: 'Young tree', scale: 0.5 },
  { minutes: 300, label: 'Growing tree', scale: 0.75 },
  { minutes: 1200, label: 'Blossoming tree', scale: 1 },
] as const;

export function treeStage(minutes: number): number {
  let stage = 0;
  for (let i = 1; i < TREE_STAGES.length; i++) {
    if (minutes >= TREE_STAGES[i].minutes) stage = i;
  }
  return stage;
}

export function hasQuestionBoard(map: string): boolean {
  return map === 'library' || map === 'cafe' || map === 'garden';
}

export const QUESTION_LIMIT = 240;

export interface BoardPost {
  id: string;
  authorId: string;
  author: string;
  text: string;
  own: boolean;
}

export interface BoardQuestion extends BoardPost {
  answers: BoardPost[];
}

export interface QuestionBoardSnapshot {
  map: string;
  questions: BoardQuestion[];
  notice?: string;
  posted?: true;
}

export type BoardAction =
  | { kind: 'read' | 'close' }
  | { kind: 'ask'; text: string }
  | { kind: 'answer'; questionId: string; text: string }
  | { kind: 'remove'; questionId: string; answerId?: string }
  | { kind: 'report'; questionId: string; answerId?: string };

/** Pairs the two seats in each half of a library desk row. */
export function buddySeat(seats: readonly SeatDef[], seat: SeatDef): SeatDef | undefined {
  const left = [3, 5, 9, 11, 17, 19, 23, 25];
  const x = left.includes(seat.tx) ? seat.tx + 1 : seat.tx - 1;
  if (!left.includes(Math.min(x, seat.tx))) return undefined;
  return seats.find((candidate) => candidate.tx === x && candidate.ty === seat.ty && candidate.facing === seat.facing);
}

export const BUDDIES = {
  action: 'buddyAction',
  links: 'buddyLinks',
  candidates: 'buddyCandidates',
} as const;

export type BuddyAction =
  | { kind: 'request'; peerId: string }
  | { kind: 'accept' | 'decline' | 'cancel' | 'remove'; linkId: string };

export interface BuddyLink {
  id: string;
  name: string;
  status: 'incoming' | 'outgoing' | 'accepted';
  focusMinutes: number;
}

export interface BuddyLinks {
  links: BuddyLink[];
  /** Room session ids paired with opaque links. */
  online: Record<string, string>;
}
