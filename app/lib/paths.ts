/** App URLs used from more than one page. */

/** A Squad Member's profile. */
export function playerPath(playerId: string): string {
  return `/players/${playerId}`;
}

/** The latest Poll's `PollState` as JSON (`app/routes/poll-state.ts`), for pages that refresh themselves. */
export const POLL_STATE_PATH = "/api/poll-state";

/**
 * A finished Season's review (CLUBS-45). Only the Discord post links here:
 * no page lists or links to Season Reviews.
 */
export function seasonReviewPath(number: number): string {
  return `/seasons/${number}/review`;
}

/** A Session's page, by its ID (its first Match's). */
export function sessionPath(sessionId: string): string {
  return `/sessions/${sessionId}`;
}
