/**
 * The Seasons the Poll has detected (`app/poll/seasons.ts`), for the
 * FilterBar's Season picker. Not filtered: Seasons frame the filter.
 */
import { asc } from "drizzle-orm";

import type { Db } from "~/db/client";
import { seasons } from "~/db/schema";

export interface Season {
  number: number;
  /** Season 1 starts at the epoch: it began before tracking did. */
  startedAt: Date;
}

/** Every known Season, oldest first; the last one is the current Season. */
export async function listSeasons(db: Db): Promise<Season[]> {
  return db
    .select({ number: seasons.number, startedAt: seasons.startedAt })
    .from(seasons)
    .orderBy(asc(seasons.number));
}

/**
 * The Seasons that have ended, newest first: every Season but the current
 * one, each ending where the next starts (CLUBS-45's Season Reviews).
 */
export function finishedSeasons(
  known: readonly Season[],
): (Season & { endedAt: Date })[] {
  return known
    .slice(0, -1)
    .map((season, i) => ({ ...season, endedAt: known[i + 1].startedAt }))
    .reverse();
}
