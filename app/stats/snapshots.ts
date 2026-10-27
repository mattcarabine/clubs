/**
 * Snapshot and Poll queries: EA's running totals over time, and when data was
 * last refreshed. Snapshots are EA's own season or career totals, so they are
 * not narrowed by the `StatsFilter`.
 */
import { and, asc, desc, eq, max, ne } from "drizzle-orm";

import type { Db } from "~/db/client";
import { matches, pollRuns, rawPayloads, snapshots } from "~/db/schema";
import type { SnapshotEndpoint } from "~/ea/parse";
import { isShownMatch } from "./scope";

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
 * in three reads of a row or two each, however much data there is.
 */
export interface PollState {
  /** When the latest Poll that reached EA finished (a partial Poll counts), or null before the first. */
  lastPoll: Date | null;
  /**
   * Opaque; it changes when a Poll changes what the home page shows. The Poll
   * derives Matches, Appearances and Snapshots in the batch that stores their
   * Raw Payload, so the latest Raw Payload's ID covers those. A Skill Rating
   * can land in a Poll that stores no payload (EA's ratings response hashed
   * as the last one did), so the latest Match's two Skill Ratings are part of
   * it too. A backfilled rating on an older Match does not move it.
   */
  version: string;
}

export async function pollState(db: Db): Promise<PollState> {
  // Each walks a rowid or index from the newest row, so none scans a table.
  const [[poll], [payload], [latest]] = await Promise.all([
    db
      .select({ finishedAt: pollRuns.finishedAt })
      .from(pollRuns)
      .where(ne(pollRuns.status, "failed"))
      .orderBy(desc(pollRuns.id))
      .limit(1),
    db.select({ id: max(rawPayloads.id) }).from(rawPayloads),
    db
      .select({
        ours: matches.ourSkillRating,
        theirs: matches.opponentSkillRating,
      })
      .from(matches)
      .where(isShownMatch)
      .orderBy(desc(matches.playedAt))
      .limit(1),
  ]);
  return {
    lastPoll: poll?.finishedAt ?? null,
    version: [payload?.id ?? 0, latest?.ours ?? "", latest?.theirs ?? ""].join(
      ".",
    ),
  };
}
