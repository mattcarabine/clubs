/** App URLs used from more than one page. */

/** A Squad Member's profile. */
export function playerPath(playerId: string): string {
  return `/players/${playerId}`;
}
