/**
 * Reading write-ups for pages: the latest text stored per subject. Pages
 * only ever read; nothing here (or anything a route imports) calls the
 * model (docs/adr/0006).
 */
import { and, desc, eq, inArray } from "drizzle-orm";

import type { Db } from "~/db/client";
import { aiWriteups } from "~/db/schema";

/**
 * What a write-up is about. `session` is keyed by the Session's ID, `match`
 * (the Match report) and `headline` by the Match's; `club` (the State of the
 * club) by `CLUB_SUBJECT`; `season-review` (CLUBS-45) by `seasonReviewKey`.
 */
export type WriteupKind =
  | "session"
  | "match"
  | "headline"
  | "club"
  | "season-review";

/** The State of the club has one subject: Our Club. */
export const CLUB_SUBJECT = "club";

/** A Season Review's pieces: its intro, its outro and one citation per Award. */
export type SeasonReviewPiece = "intro" | "outro" | `award/${string}`;

/** The subject of one piece of Season `number`'s review: "3/intro", "3/award/golden-boot". */
export function seasonReviewKey(
  number: number,
  piece: SeasonReviewPiece,
): string {
  return `${number}/${piece}`;
}

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
