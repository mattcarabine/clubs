/**
 * Milestone detection on write (CLUBS-36), run by the scheduled handler
 * right after the Poll stores its data and before write-ups, so a Milestone's
 * comment can be queued in the same run. Never throws: a failure is logged,
 * and the next Poll that changes data detects again.
 *
 * Detection is idempotent: each Milestone has a unique dedupe key, so
 * rerunning it stores nothing twice. While no Milestone is stored (the
 * release, or a fresh database) it backfills: every Match and Snapshot
 * already in D1, oldest first. After that it runs only on Polls that stored
 * new Matches or Snapshots, over the latest few Snapshots and Matches.
 */
import type { BatchItem } from "drizzle-orm/batch";

import { bulkInsert } from "~/db/bulk";
import { type Db, getDb } from "~/db/client";
import { milestones } from "~/db/schema";
import { errorMessage } from "~/lib/text";
import { type DetectedMilestone, detectMilestones } from "~/stats/milestones";
import { milestoneDetectionInput } from "~/stats/milestones-query";
import { sessionIdsByMatch } from "~/stats/sessions";

/**
 * Snapshots per source a Poll reads: enough to cover a few Polls whose
 * detection failed, without reading the whole history each time.
 */
export const SNAPSHOT_WINDOW = 6;
/** A Poll stores Milestones only for the latest this-many Matches. */
export const RECENT_MATCHES = 30;
/** Rows per insert statement, to keep each well under D1's statement size. */
const INSERT_CHUNK = 100;

export interface MilestoneRun {
  backfill: boolean;
  detected: number;
}

/**
 * Detects and stores Milestones. `pollChanged` says whether this Poll stored
 * new Matches or Snapshots; without it only a pending backfill runs.
 */
export async function recordMilestones(
  db: Db,
  now: Date,
  pollChanged: boolean,
): Promise<MilestoneRun | null> {
  const [stored] = await db
    .select({ id: milestones.id })
    .from(milestones)
    .limit(1);
  const backfill = stored === undefined;
  if (!backfill && !pollChanged) return null;

  const input = await milestoneDetectionInput(db, {
    snapshotWindow: backfill ? undefined : SNAPSHOT_WINDOW,
  });
  const recent = new Set(
    input.matches.slice(-RECENT_MATCHES).map((m) => m.matchId),
  );
  const detected = detectMilestones(input).filter(
    (m) => backfill || recent.has(m.matchId),
  );
  if (detected.length === 0) return { backfill, detected: 0 };

  const sessionOf = sessionIdsByMatch(input.matches);
  const rows = detected.map((m) => toRow(m, now, sessionOf));
  const statements: BatchItem<"sqlite">[] = [];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    statements.push(
      bulkInsert(
        db,
        milestones,
        rows.slice(i, i + INSERT_CHUNK),
      ).onConflictDoNothing({ target: milestones.dedupeKey }),
    );
  }
  const [first, ...rest] = statements;
  await db.batch([first, ...rest]);
  return { backfill, detected: detected.length };
}

/**
 * A row to insert. Milestones detected together in one Session share a batch
 * key, so one write-up call comments on all of them; already-stored ones are
 * skipped by the insert, so keep their own.
 */
function toRow(
  m: DetectedMilestone,
  now: Date,
  sessionOf: Map<string, string>,
): typeof milestones.$inferInsert {
  return {
    kind: m.kind,
    subject: m.subject,
    playerId: m.playerId,
    value: m.value,
    threshold: m.threshold,
    positionGroup: m.positionGroup,
    matchId: m.matchId,
    achievedAt: m.achievedAt,
    detectedAt: now,
    batchKey: `${now.getTime()}:${sessionOf.get(m.matchId) ?? m.matchId}`,
    dedupeKey: m.dedupeKey,
  };
}

export async function runMilestones(
  env: Env,
  pollChanged: boolean,
  now: Date,
): Promise<void> {
  try {
    const run = await recordMilestones(getDb(env.DB), now, pollChanged);
    if (run) console.log(JSON.stringify({ event: "milestones", ...run }));
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "milestones",
        status: "failed",
        error: errorMessage(error),
      }),
    );
  }
}
