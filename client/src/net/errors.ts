/**
 * Thrown when the server refuses a join because the stored sign-in is no longer
 * valid. The token has already been cleared, so the next join is a guest join.
 */
export class AuthRejectedError extends Error {
  constructor(message = 'Your sign-in has expired. Sign in again, or play as a guest.') {
    super(message);
    this.name = 'AuthRejectedError';
  }
}
