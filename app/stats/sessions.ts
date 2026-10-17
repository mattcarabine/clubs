/**
 * Sessions (CONTEXT.md): runs of Matches with no more than 45 minutes
 * between consecutive kick-offs. A Match's Session is worked out over every
 * recorded Match, whatever the filter, so hiding Friendlies never makes the
 * League Match after one "1st".
 */

/** The longest gap between kick-offs that keeps two Matches in one Session. */
export const SESSION_GAP_MINUTES = 45;

export interface Kickoff {
  matchId: string;
  playedAt: Date;
}

/** Where a Match sits among the Sessions. */
export interface SessionPlace {
  /** Which Session, counting from 0 for the earliest: equal for Matches in the same Session. */
  session: number;
  /** Its place in that Session, 1 for the first. */
  place: number;
}

/** Each Match's Session and place in it, by Match ID. The kick-offs can come in any order. */
export function sessionPlaces(
  kickoffs: readonly Kickoff[],
  gapMinutes = SESSION_GAP_MINUTES,
): Map<string, SessionPlace> {
  const sorted = [...kickoffs].sort(
    (a, b) => a.playedAt.getTime() - b.playedAt.getTime(),
  );
  const places = new Map<string, SessionPlace>();
  let session = -1;
  let place = 0;
  let previousKickoff = -Infinity;
  for (const { matchId, playedAt } of sorted) {
    if (playedAt.getTime() - previousKickoff <= gapMinutes * 60_000) {
      place += 1;
    } else {
      session += 1;
      place = 1;
    }
    places.set(matchId, { session, place });
    previousKickoff = playedAt.getTime();
  }
  return places;
}
