/**
 * Season detection. EA's Match payloads carry no usable season ID, so a new
 * Season is inferred from the current-season leaderboard Snapshot: when its
 * `gamesPlayed` goes down, EA has reset the season totals, and the new Season
 * starts at that Snapshot.
 */
import { and, desc, eq, max } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Db } from "../db/client.ts";
import { seasons, snapshots } from "../db/schema.ts";
import { snapshotNumber } from "../ea/parse.ts";

/** The Snapshot source whose `gamesPlayed` resets with each Season. */
export const SEASON_SOURCE = "currentSeasonLeaderboard/search";

/** Season 1 began before tracking did, so it starts at the epoch. */
export const FIRST_SEASON_START = new Date(0);

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
}: SeasonObservation): SeasonStart[] {
  const added: SeasonStart[] = [];
  let latest = latestSeason;
  if (latest === 0) {
    latest = 1;
    added.push({ number: latest, startedAt: FIRST_SEASON_START });
  }
  if (
    previousGamesPlayed !== null &&
    gamesPlayed !== null &&
    gamesPlayed < previousGamesPlayed
  ) {
    added.push({ number: latest + 1, startedAt: takenAt });
  }
  return added;
}

/**
 * Statements adding any Season that Our Club's new leaderboard Snapshot
 * reveals. Reads only when this Poll stores a leaderboard Snapshot, and must
 * run before that Snapshot is written, so "previous" means the stored one.
 */
export async function seasonStatements(
  db: Db,
  snapshotRows: readonly (typeof snapshots.$inferInsert)[],
  ourClubId: string,
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
      .select({ stats: snapshots.stats })
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

  const added = newSeasons({
    latestSeason: latest?.number ?? 0,
    previousGamesPlayed: previous
      ? snapshotNumber(previous.stats, "gamesPlayed")
      : null,
    gamesPlayed: snapshotNumber(current.stats, "gamesPlayed"),
    takenAt: current.takenAt,
  });
  return added.length
    ? [db.insert(seasons).values(added).onConflictDoNothing()]
    : [];
}
