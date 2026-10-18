/**
 * Snapshot and Poll queries: EA's running totals over time, and when data was
 * last refreshed. Snapshots are EA's own season or career totals, so they are
 * not narrowed by the `StatsFilter`.
 */
import { and, asc, desc, eq, max, ne } from "drizzle-orm";

import type { Db } from "~/db/client";
import { pollRuns, rawPayloads, snapshots } from "~/db/schema";
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
 * Season (with `proOverall` and `proPos`); `members/career/stats`
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

/**
 * What a page that refreshes itself needs to know about the Poll (CLUBS-46),
 * in two single-row reads.
 */
export interface PollState {
  /** When the latest Poll that reached EA finished (a partial Poll counts), or null before the first. */
  lastPoll: Date | null;
  /**
   * Changes only when a Poll stores new data: the latest Raw Payload's ID, 0
   * before the first. The Poll derives Matches, Appearances and Snapshots in
   * the batch that stores their Raw Payload, so an unchanged version means
   * the pages' data is unchanged too.
   */
  version: number;
}

export async function pollState(db: Db): Promise<PollState> {
  // Both walk the rowid from the end, so neither scans the table.
  const [[poll], [payload]] = await Promise.all([
    db
      .select({ finishedAt: pollRuns.finishedAt })
      .from(pollRuns)
      .where(ne(pollRuns.status, "failed"))
      .orderBy(desc(pollRuns.id))
      .limit(1),
    db.select({ id: max(rawPayloads.id) }).from(rawPayloads),
  ]);
  return { lastPoll: poll?.finishedAt ?? null, version: payload?.id ?? 0 };
}
