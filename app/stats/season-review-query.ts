/**
 * `getSeasonReview(db, number)` (CLUBS-45): a finished Season's review in
 * four queries (the Seasons, then its Matches, Our Club's Appearances in
 * them and EA's last leaderboard Snapshot before the reset, in parallel),
 * then the pure `season-review.ts`. Not filtered: a review covers every
 * Competitive Match in the Season.
 */
import { and, desc, eq, lt } from "drizzle-orm";

import type { Db } from "~/db/client";
import { snapshots } from "~/db/schema";
import { SEASON_SOURCE } from "~/poll/seasons";

import { DEFAULT_STATS_FILTER } from "./filter";
import { listMatches } from "./matches";
import {
  type FinishedSeason,
  type SeasonReview,
  seasonReview,
} from "./season-review";
import { finishedSeasons, listSeasons } from "./seasons";
import type { SnapshotPoint } from "./snapshots";
import { squadAppearances } from "./squad";

/** Every finished Season, newest first. One query. */
export async function listFinishedSeasons(db: Db): Promise<FinishedSeason[]> {
  return finishedSeasons(await listSeasons(db));
}

/** The review of Season `number`, or null while it is running, unknown or had no recorded Matches. */
export async function getSeasonReview(
  db: Db,
  number: number,
): Promise<SeasonReview | null> {
  const season = (await listFinishedSeasons(db)).find(
    (s) => s.number === number,
  );
  if (!season) return null;
  const filter = { ...DEFAULT_STATS_FILTER, season: number };
  const [matches, appearances, finalSnapshot] = await Promise.all([
    listMatches(db, filter, { order: "oldest" }),
    squadAppearances(db, filter),
    leaderboardSnapshotBefore(db, season.endedAt),
  ]);
  return seasonReview({ season, matches, appearances, finalSnapshot });
}

/** Our Club's last current-season leaderboard Snapshot taken before `end`. */
async function leaderboardSnapshotBefore(
  db: Db,
  end: Date,
): Promise<SnapshotPoint | null> {
  const [row] = await db
    .select({ takenAt: snapshots.takenAt, stats: snapshots.stats })
    .from(snapshots)
    .where(
      and(
        eq(snapshots.source, SEASON_SOURCE),
        eq(snapshots.subject, "club"),
        lt(snapshots.takenAt, end),
      ),
    )
    .orderBy(desc(snapshots.takenAt), desc(snapshots.id))
    .limit(1);
  return row ?? null;
}
