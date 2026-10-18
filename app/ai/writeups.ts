/**
 * Reading write-ups for pages: the latest text stored per subject. Pages
 * only ever read; nothing here (or anything a route imports) calls the
 * model (docs/adr/0006).
 */
import { and, desc, eq, inArray } from "drizzle-orm";

import type { Db } from "~/db/client";
import { aiJobs, aiWriteups } from "~/db/schema";

/**
 * What a write-up is about. `session` is keyed by the Session's ID, `match`
 * (the Match report) and `headline` by the Match's; `club` (the State of the
 * club) by `CLUB_SUBJECT`; `coaching` (a Squad Member's coaching notes,
 * CLUBS-44) by the player ID, its job by the week; a `milestone` comment by
 * the Milestone's ID.
 */
export type WriteupKind =
  | "session"
  | "match"
  | "headline"
  | "club"
  | "coaching"
  | "milestone";

/** The State of the club has one subject: Our Club. */
export const CLUB_SUBJECT = "club";

export interface Writeup {
  text: string;
  writtenAt: Date;
}

/** The latest write-up for one subject, or null before one is written. */
export async function latestWriteup(
  db: Db,
  kind: WriteupKind,
  subjectKey: string,
): Promise<Writeup | null> {
  const [row] = await db
    .select({ text: aiWriteups.text, writtenAt: aiWriteups.createdAt })
    .from(aiWriteups)
    .where(
      and(eq(aiWriteups.kind, kind), eq(aiWriteups.subjectKey, subjectKey)),
    )
    .orderBy(desc(aiWriteups.id))
    .limit(1);
  return row ?? null;
}

/** Every subject with at least one write-up of this kind. One query. */
export async function writtenSubjects(
  db: Db,
  kind: WriteupKind,
): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ subjectKey: aiWriteups.subjectKey })
    .from(aiWriteups)
    .where(eq(aiWriteups.kind, kind));
  return new Set(rows.map((row) => row.subjectKey));
}

/**
 * The latest write-up for each of several subjects (at most 90, for D1's
 * bound-parameter cap), keyed by subject. One query.
 */
export async function latestWriteups(
  db: Db,
  kind: WriteupKind,
  subjectKeys: readonly string[],
): Promise<Map<string, Writeup>> {
  if (subjectKeys.length === 0) return new Map();
  const rows = await db
    .select({
      subjectKey: aiWriteups.subjectKey,
      text: aiWriteups.text,
      writtenAt: aiWriteups.createdAt,
    })
    .from(aiWriteups)
    .where(
      and(
        eq(aiWriteups.kind, kind),
        inArray(aiWriteups.subjectKey, [...subjectKeys]),
      ),
    )
    .orderBy(desc(aiWriteups.id));
  const latest = new Map<string, Writeup>();
  for (const { subjectKey, text, writtenAt } of rows) {
    if (!latest.has(subjectKey)) latest.set(subjectKey, { text, writtenAt });
  }
  return latest;
}

/** A write-up with the subject of the job that wrote it, e.g. a coaching note's week. */
export interface JobWriteup extends Writeup {
  jobSubjectKey: string;
}

/**
 * One subject's write-ups, newest first, one per job subject (the latest
 * written for each), at most `limit`. A coaching note rewritten for its
 * week appears once. One indexed query.
 */
export async function writeupHistory(
  db: Db,
  kind: WriteupKind,
  subjectKey: string,
  limit: number,
): Promise<JobWriteup[]> {
  const rows = await db
    .select({
      text: aiWriteups.text,
      writtenAt: aiWriteups.createdAt,
      jobSubjectKey: aiJobs.subjectKey,
    })
    .from(aiWriteups)
    .innerJoin(aiJobs, eq(aiJobs.id, aiWriteups.jobId))
    .where(
      and(eq(aiWriteups.kind, kind), eq(aiWriteups.subjectKey, subjectKey)),
    )
    .orderBy(desc(aiWriteups.id))
    // Rewrites are rare, so twice the limit leaves room for them.
    .limit(limit * 2);
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      if (seen.has(row.jobSubjectKey)) return false;
      seen.add(row.jobSubjectKey);
      return true;
    })
    .slice(0, limit);
}
