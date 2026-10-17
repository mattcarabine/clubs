/** App URLs used from more than one page. */

/** A Squad Member's profile. */
export function playerPath(playerId: string): string {
  return `/players/${playerId}`;
}

/** A Session's page, by its ID (its first Match's). */
export function sessionPath(sessionId: string): string {
  return `/sessions/${sessionId}`;
}
