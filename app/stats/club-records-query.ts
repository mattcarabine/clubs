/**
 * The club records' data (CLUBS-77): every Competitive Match, oldest first,
 * and the best Division in Our Club's current-season leaderboard Snapshots,
 * in two parallel reads. Like Milestones, they ignore the `StatsFilter`.
 */
import { and, eq, sql } from "drizzle-orm";

import type { Db } from "~/db/client";
import { snapshots } from "~/db/schema";
import { SEASON_SOURCE } from "~/poll/seasons";

import {
  type ClubRecord,
  clubRecords,
  type DivisionHigh,
} from "./club-records";
import { toDivisionNumber } from "./divisions";
import { DEFAULT_STATS_FILTER } from "./filter";
import { listMatches } from "./matches";

export async function getClubRecords(db: Db): Promise<ClubRecord[]> {
  const [matches, divisionHigh] = await Promise.all([
    listMatches(db, DEFAULT_STATS_FILTER, { order: "oldest" }),
    bestDivision(db),
  ]);
  return clubRecords(matches, divisionHigh);
}

/**
 * The best (lowest-numbered) `currentDivision` the leaderboard has shown and
 * when it first did, or EA's own `bestDivision` when that is better, with no
 * date. Aggregated in SQL, so it never reads every Snapshot's JSON back.
 */
async function bestDivision(db: Db): Promise<DivisionHigh | null> {
  const field = (name: string) =>
    sql<number | null>`min(json_extract(${snapshots.stats}, ${`$.${name}`}))`;
  const [row] = await db
    .select({
      current: field("currentDivision"),
      best: field("bestDivision"),
    })
    .from(snapshots)
    .where(
      and(eq(snapshots.subject, "club"), eq(snapshots.source, SEASON_SOURCE)),
    );
  const current = toDivisionNumber(row?.current ?? null);
  const best = toDivisionNumber(row?.best ?? null);
  if (best !== null && (current === null || best < current)) {
    return { division: best, reachedAt: null };
  }
  if (current === null) return null;
  const [reached] = await db
    .select({ takenAt: sql<number>`min(${snapshots.takenAt})` })
    .from(snapshots)
    .where(
      and(
        eq(snapshots.subject, "club"),
        eq(snapshots.source, SEASON_SOURCE),
        sql`json_extract(${snapshots.stats}, '$.currentDivision') = ${current}`,
      ),
    );
  return {
    division: current,
    reachedAt: reached?.takenAt ? new Date(reached.takenAt) : null,
  };
}
