/**
 * Snapshot and Poll queries: EA's running totals over time, and when data was
 * last refreshed. Snapshots are EA's own season or career totals, so they are
 * not narrowed by the `StatsFilter`.
 */
import { and, asc, desc, eq, ne } from "drizzle-orm";

import type { Db } from "~/db/client";
import { pollRuns, snapshots } from "~/db/schema";
import type { SnapshotEndpoint } from "~/ea/parse";

export interface SnapshotPoint {
  takenAt: Date;
  /** EA's fields as sent, numeric strings already numbers. Read them with `snapshotNumber`. */
  stats: Record<string, unknown>;
}

/** Our Club's totals over time (e.g. `skillRating`), oldest first. */
export async function clubSnapshots(
  db: Db,
  source: SnapshotEndpoint = "clubs/overallStats",
): Promise<SnapshotPoint[]> {
  return db
    .select({ takenAt: snapshots.takenAt, stats: snapshots.stats })
    .from(snapshots)
    .where(and(eq(snapshots.subject, "club"), eq(snapshots.source, source)))
    .orderBy(asc(snapshots.takenAt));
}

/**
 * A Squad Member's totals over time, oldest first. `members/stats` is the
 * Season (with `proOverall`, `proStyle`, `proPos`); `members/career/stats`
 * is EA's all-time record since the club was founded.
 */
export async function memberSnapshots(
  db: Db,
  playerId: string,
  source: SnapshotEndpoint = "members/stats",
): Promise<SnapshotPoint[]> {
  return db
    .select({ takenAt: snapshots.takenAt, stats: snapshots.stats })
    .from(snapshots)
    .where(
      and(
        eq(snapshots.subject, "member"),
        eq(snapshots.source, source),
        eq(snapshots.playerId, playerId),
      ),
    )
    .orderBy(asc(snapshots.takenAt));
}

// Lives with the Snapshot parser so the Poll (which runs under Node) can use it too.
export { snapshotNumber } from "~/ea/parse";

/** When the latest Poll that reached EA finished (a partial Poll counts), or null before the first. */
export async function lastSuccessfulPoll(db: Db): Promise<Date | null> {
  const [row] = await db
    .select({ finishedAt: pollRuns.finishedAt })
    .from(pollRuns)
    .where(ne(pollRuns.status, "failed"))
    .orderBy(desc(pollRuns.finishedAt))
    .limit(1);
  return row?.finishedAt ?? null;
}
