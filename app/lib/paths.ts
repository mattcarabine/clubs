/** App URLs used from more than one page. */

/** A Squad Member's profile. */
export function playerPath(playerId: string): string {
  return `/players/${playerId}`;
}

/** The latest Poll's `PollState` as JSON (`app/routes/poll-state.ts`), for pages that refresh themselves. */
export const POLL_STATE_PATH = "/api/poll-state";
