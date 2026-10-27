/**
 * Season detection. EA's Match payloads carry no usable season ID, so a new
 * Season is inferred from the current-season leaderboard Snapshot: when its
 * `gamesPlayed` goes down, EA has reset the season totals.
 *
 * The new Season starts at its first Match, not at the Snapshot that saw the
 * reset: after a gap in Polls (e.g. EA blocking us) that Snapshot can arrive
 * days after the new Season's first Matches, often in the same Poll. Its
 * `gamesPlayed` says how many Competitive Matches the new Season has had, so
 * the start is the kick-off of the oldest of that many most recent ones.
 */
import { and, desc, eq, gt, inArray, lte, max } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Db } from "../db/client.ts";
import { matches, seasons, snapshots } from "../db/schema.ts";
import { type MatchKind, snapshotNumber } from "../ea/parse.ts";

/** The Snapshot source whose `gamesPlayed` resets with each Season. */
export const SEASON_SOURCE = "currentSeasonLeaderboard/search";

/** Season 1 began before tracking did, so it starts at the epoch. */
export const FIRST_SEASON_START = new Date(0);

/** The Match Types EA's season `gamesPlayed` counts: League and Playoff. */
const COMPETITIVE: MatchKind[] = ["league", "playoff"];

/** A Match the Poll is adding, not yet stored. */
type PolledMatch = { matchType: MatchKind; playedAt: Date };

export interface SeasonStart {
  number: number;
  startedAt: Date;
}

export interface SeasonObservation {
  /** The highest stored Season number, or 0 when none is stored yet. */
  latestSeason: number;
  /** `gamesPlayed` in the previous leaderboard Snapshot, null if there was none. */
  previousGamesPlayed: number | null;
  /** `gamesPlayed` in the leaderboard Snapshot this Poll is storing. */
  gamesPlayed: number | null;
  takenAt: Date;
  /**
   * Kick-offs of the Competitive Matches played after the previous
   * leaderboard Snapshot and by this one, stored or arriving in this Poll.
   */
  kickoffs: readonly Date[];
}

/** Whether EA reset the season totals between two leaderboard Snapshots. */
export function seasonReset(
  previousGamesPlayed: number | null,
  gamesPlayed: number | null,
): boolean {
  return (
    previousGamesPlayed !== null &&
    gamesPlayed !== null &&
    gamesPlayed < previousGamesPlayed
  );
}

/**
 * The Seasons to add for one new leaderboard Snapshot: Season 1 if none is
 * stored yet, and the next Season if `gamesPlayed` went down.
 */
export function newSeasons({
  latestSeason,
  previousGamesPlayed,
  gamesPlayed,
  takenAt,
  kickoffs,
}: SeasonObservation): SeasonStart[] {
  const added: SeasonStart[] = [];
  let latest = latestSeason;
  if (latest === 0) {
    latest = 1;
    added.push({ number: latest, startedAt: FIRST_SEASON_START });
  }
  if (seasonReset(previousGamesPlayed, gamesPlayed)) {
    added.push({
      number: latest + 1,
      startedAt: seasonStartedAt(gamesPlayed ?? 0, takenAt, kickoffs),
    });
  }
  return added;
}

/**
 * The kick-off of the new Season's first Match: the oldest of its
 * `gamesPlayed` most recent Matches. When fewer were recorded (EA lists only
 * the latest 10 per Match Type), the oldest recorded one. With none, the
 * Snapshot itself.
 */
function seasonStartedAt(
  gamesPlayed: number,
  takenAt: Date,
  kickoffs: readonly Date[],
): Date {
  const played = [...kickoffs]
    .sort((a, b) => b.getTime() - a.getTime())
    .slice(0, gamesPlayed);
  return played.at(-1) ?? takenAt;
}

/**
 * Statements adding any Season that Our Club's new leaderboard Snapshot
 * reveals. Reads only when this Poll stores a leaderboard Snapshot, and must
 * run before that Snapshot is written, so "previous" means the stored one.
 * `polledMatches` are the Matches this Poll is adding, not yet stored.
 */
export async function seasonStatements(
  db: Db,
  snapshotRows: readonly (typeof snapshots.$inferInsert)[],
  ourClubId: string,
  polledMatches: readonly PolledMatch[],
): Promise<BatchItem<"sqlite">[]> {
  const current = snapshotRows.find(
    (row) =>
      row.source === SEASON_SOURCE &&
      row.subject === "club" &&
      row.subjectKey === ourClubId,
  );
  if (!current) return [];

  const [[previous], [latest]] = await Promise.all([
    db
      .select({ stats: snapshots.stats, takenAt: snapshots.takenAt })
      .from(snapshots)
      .where(
        and(
          eq(snapshots.source, SEASON_SOURCE),
          eq(snapshots.subject, "club"),
          eq(snapshots.subjectKey, ourClubId),
        ),
      )
      .orderBy(desc(snapshots.takenAt), desc(snapshots.id))
      .limit(1),
    db.select({ number: max(seasons.number) }).from(seasons),
  ]);

  const previousGamesPlayed = previous
    ? snapshotNumber(previous.stats, "gamesPlayed")
    : null;
  const gamesPlayed = snapshotNumber(current.stats, "gamesPlayed");
  const kickoffs =
    previous && seasonReset(previousGamesPlayed, gamesPlayed)
      ? await kickoffsBetween(
          db,
          previous.takenAt,
          current.takenAt,
          polledMatches,
        )
      : [];

  const added = newSeasons({
    latestSeason: latest?.number ?? 0,
    previousGamesPlayed,
    gamesPlayed,
    takenAt: current.takenAt,
    kickoffs,
  });
  return added.length
    ? [db.insert(seasons).values(added).onConflictDoNothing()]
    : [];
}

/** Kick-offs of the Competitive Matches, stored or polled, in (since, until]. */
async function kickoffsBetween(
  db: Db,
  since: Date,
  until: Date,
  polledMatches: readonly PolledMatch[],
): Promise<Date[]> {
  const stored = await db
    .select({ playedAt: matches.playedAt })
    .from(matches)
    .where(
      and(
        inArray(matches.matchType, COMPETITIVE),
        gt(matches.playedAt, since),
        lte(matches.playedAt, until),
      ),
    );
  return [
    ...stored,
    ...polledMatches.filter(
      (match) =>
        COMPETITIVE.includes(match.matchType) &&
        match.playedAt > since &&
        match.playedAt <= until,
    ),
  ].map((match) => match.playedAt);
}
