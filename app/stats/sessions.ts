/**
 * Sessions (CONTEXT.md): runs of Matches with no more than 45 minutes
 * between consecutive kick-offs. A Match's Session is worked out over every
 * shown Match, whatever the filter, so leaving out Playoffs never makes the
 * League Match after one "1st", and never splits a Session in two.
 */
import type { PlayerTotals } from "./summaries";

/** The longest gap between kick-offs that keeps two Matches in one Session. */
export const SESSION_GAP_MINUTES = 45;

/** A Session's last kick-off at most this long ago makes it "Tonight's Session". */
export const TONIGHT_HOURS = 6;

export interface Kickoff {
  matchId: string;
  playedAt: Date;
}

/** One Session's Matches, oldest first. */
export interface SessionGroup {
  /** The first Match's ID: stable, since new Matches join the end of the latest Session. */
  id: string;
  matchIds: string[];
  /** The first kick-off. */
  start: Date;
  /** The last kick-off. */
  end: Date;
}

/** Where a Match sits among the Sessions. */
export interface SessionPlace {
  /** Which Session, counting from 0 for the earliest: equal for Matches in the same Session. */
  session: number;
  /** Its place in that Session, 1 for the first. */
  place: number;
}

/** Every Session, oldest first. The kick-offs can come in any order. */
export function groupSessions(
  kickoffs: readonly Kickoff[],
  gapMinutes = SESSION_GAP_MINUTES,
): SessionGroup[] {
  const sorted = [...kickoffs].sort(
    (a, b) => a.playedAt.getTime() - b.playedAt.getTime(),
  );
  const sessions: SessionGroup[] = [];
  for (const { matchId, playedAt } of sorted) {
    const current = sessions.at(-1);
    if (
      current &&
      playedAt.getTime() - current.end.getTime() <= gapMinutes * 60_000
    ) {
      current.matchIds.push(matchId);
      current.end = playedAt;
    } else {
      sessions.push({
        id: matchId,
        matchIds: [matchId],
        start: playedAt,
        end: playedAt,
      });
    }
  }
  return sessions;
}

/** Each Match's Session ID, by Match ID. The kick-offs can come in any order. */
export function sessionIdsByMatch(
  kickoffs: readonly Kickoff[],
  gapMinutes = SESSION_GAP_MINUTES,
): Map<string, string> {
  const ids = new Map<string, string>();
  for (const { id, matchIds } of groupSessions(kickoffs, gapMinutes)) {
    for (const matchId of matchIds) ids.set(matchId, id);
  }
  return ids;
}

/** Each Match's Session and place in it, by Match ID. The kick-offs can come in any order. */
export function sessionPlaces(
  kickoffs: readonly Kickoff[],
  gapMinutes = SESSION_GAP_MINUTES,
): Map<string, SessionPlace> {
  const places = new Map<string, SessionPlace>();
  groupSessions(kickoffs, gapMinutes).forEach(({ matchIds }, session) => {
    matchIds.forEach((matchId, i) => {
      places.set(matchId, { session, place: i + 1 });
    });
  });
  return places;
}

/** Whether a Session is still tonight's: its last kick-off was at most `TONIGHT_HOURS` ago. */
export function isTonight(
  session: Pick<SessionGroup, "end">,
  now: Date = new Date(),
): boolean {
  return now.getTime() - session.end.getTime() <= TONIGHT_HOURS * 3_600_000;
}

/**
 * Whether a Session has ended: more than `SESSION_GAP_MINUTES` have passed
 * since its last kick-off, so no further Match can join it. Anything that
 * acts once a Session is over (its recap, a Discord post) asks this.
 */
export function isSessionOver(
  session: Pick<SessionGroup, "end">,
  now: Date = new Date(),
): boolean {
  return now.getTime() - session.end.getTime() > SESSION_GAP_MINUTES * 60_000;
}

/**
 * Splits Sessions (given as their Match counts, in page order) into pages of
 * at least `pageSize` Matches, the last page excepted, without ever splitting
 * a Session. Each page is a `[start, end)` range of Session indexes.
 */
export function pageSessions(
  matchCounts: readonly number[],
  pageSize: number,
): Array<[number, number]> {
  const pages: Array<[number, number]> = [];
  let start = 0;
  let matches = 0;
  matchCounts.forEach((count, i) => {
    matches += count;
    if (matches >= pageSize) {
      pages.push([start, i + 1]);
      start = i + 1;
      matches = 0;
    }
  });
  if (start < matchCounts.length) pages.push([start, matchCounts.length]);
  return pages;
}

/** A Squad Member's totals, named, as a Session leaderboard row. */
export type PerformerTotals = Pick<
  PlayerTotals,
  "appearances" | "goals" | "assists" | "averageRating" | "manOfTheMatch"
> & { name: string };

/**
 * The Session's top performer: most Man of the Match awards, then goals
 * plus assists, goals and average rating. Null when nobody played.
 */
export function sessionTopPerformer<T extends PerformerTotals>(
  rows: readonly T[],
): T | null {
  const ranked = rows
    .filter((r) => r.appearances > 0)
    .sort(
      (a, b) =>
        b.manOfTheMatch - a.manOfTheMatch ||
        b.goals + b.assists - (a.goals + a.assists) ||
        b.goals - a.goals ||
        (b.averageRating ?? -1) - (a.averageRating ?? -1) ||
        a.name.localeCompare(b.name),
    );
  return ranked[0] ?? null;
}
