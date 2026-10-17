/**
 * Sessions (CONTEXT.md): runs of Matches with no more than 45 minutes
 * between consecutive kick-offs. A Match's place in its Session is worked out
 * over every recorded Match, whatever the filter, so hiding Friendlies never
 * makes the League Match after one "1st".
 */

/** The longest gap between kick-offs that keeps two Matches in one Session. */
export const SESSION_GAP_MINUTES = 45;

export interface Kickoff {
  matchId: string;
  playedAt: Date;
}

/**
 * Each Match's place in its Session (1 for the first), by Match ID. The
 * kick-offs can come in any order.
 */
export function sessionPlaces(
  kickoffs: readonly Kickoff[],
  gapMinutes = SESSION_GAP_MINUTES,
): Map<string, number> {
  const sorted = [...kickoffs].sort(
    (a, b) => a.playedAt.getTime() - b.playedAt.getTime(),
  );
  const places = new Map<string, number>();
  let place = 0;
  let previousKickoff = -Infinity;
  for (const { matchId, playedAt } of sorted) {
    const gap = playedAt.getTime() - previousKickoff;
    place = gap <= gapMinutes * 60_000 ? place + 1 : 1;
    places.set(matchId, place);
    previousKickoff = playedAt.getTime();
  }
  return places;
}
