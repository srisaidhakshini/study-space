import type { HomeFailure, HomeResultMessage, Visibility } from '@study/shared';

/** Every reason a home or shop request can be refused, as text a player can act on. */
export type HomeReason = NonNullable<HomeResultMessage['reason']>;

/** A Record over the whole union, so adding a failure to the shared types breaks the build until it is worded. */
export const HOME_FAILURE_TEXT: Record<HomeReason, string> = {
  'not-signed-in': 'Sign in to have a home.',
  'not-owner': 'Only the owner can change this home.',
  'not-in-home': 'You need to be in your home to do that.',
  stale: 'The room just changed. Try that again.',
  'unknown-item': "That item isn't in the catalog.",
  'bad-rotation': "That can't be turned that way.",
  'out-of-room': "That doesn't fit inside the room.",
  'not-on-wall': 'That goes on the floor, not the wall.',
  'not-on-floor': 'That hangs on the back wall.',
  overlap: "Something is already there.",
  'blocks-door': 'Keep the doorway clear.',
  'blocks-room': "That would block the way to a seat. Leave a path.",
  'not-owned': "You don't have enough of that. Buy more in the shop.",
  'not-enough-coins': 'Not enough focus coins yet. Keep studying!',
  'too-many-items': 'The room is full of furniture. Remove something first.',
  'bad-index': 'That item is no longer there.',
  'already-max-tier': 'Your home is already the biggest size.',
  invalid: "That didn't work. Please try again.",
  unavailable: 'Homes are unavailable right now. Try again in a moment.',
  private: 'That home is private.',
  'friends-only': "Only the owner's friends can visit.",
  'no-such-home': 'No one lives there yet.',
};

const FALLBACK = "That didn't work. Please try again.";

export function homeFailureText(reason: string | undefined): string {
  if (!reason) return FALLBACK;
  return (HOME_FAILURE_TEXT as Record<string, string>)[reason] ?? FALLBACK;
}

/** The failures a player can meet in edit mode, in the order the type lists them (used by the checks). */
export const ALL_HOME_REASONS = Object.keys(HOME_FAILURE_TEXT) as HomeReason[];

export function visibilityLabel(visibility: Visibility): string {
  switch (visibility) {
    case 'private':
      return 'Private';
    case 'friends':
      return 'Friends only';
    default:
      return 'Open';
  }
}

export function visibilityHint(visibility: Visibility): string {
  switch (visibility) {
    case 'private':
      return 'Only you can come in.';
    case 'friends':
      return 'You and your friends can come in.';
    default:
      return 'Anyone can visit.';
  }
}

/** Keeps the type import used (the union is the source of truth for the Record above). */
export type { HomeFailure };
