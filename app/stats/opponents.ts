/** Opponent queries: head-to-head records. Opponents are summarised at club level only. */
import { eq } from "drizzle-orm";

import type { Db } from "~/db/client";
import { clubs, matches } from "~/db/schema";

import type { StatsFilter } from "./filter";
import { type Club, listMatches } from "./matches";
import type { ScopeOptions } from "./scope";
import { groupBy, type RecordSummary, summariseRecord } from "./summaries";

export interface OpponentRecord extends Club {
  /** Our Club's record against this Opponent. */
  record: RecordSummary;
  lastMet: Date;
}

/** One row per Opponent met in the filtered Matches, most played first, then most recently met. */
export async function opponentRecords(
  db: Db,
  filter: StatsFilter,
  scope: Omit<ScopeOptions, "opponentClubId"> = {},
): Promise<OpponentRecord[]> {
  // Newest first, so each group's first Match is the last meeting.
  const byOpponent = groupBy(
    await listMatches(db, filter, scope),
    (m) => m.opponent.clubId,
  );
  return [...byOpponent.values()]
    .map((games) => ({
      ...games[0].opponent,
      record: summariseRecord(games),
      lastMet: games[0].playedAt,
    }))
    .sort(
      (a, b) =>
        b.record.played - a.record.played ||
        b.lastMet.getTime() - a.lastMet.getTime(),
    );
}

/** An Opponent, or null when Our Club has never played that club. Ignores the filter. */
export async function getOpponent(
  db: Db,
  clubId: string,
): Promise<Club | null> {
  const [row] = await db
    .select({ clubId: clubs.clubId, name: clubs.name })
    .from(clubs)
    .innerJoin(matches, eq(matches.opponentClubId, clubs.clubId))
    .where(eq(clubs.clubId, clubId))
    .limit(1);
  return row ? { clubId: row.clubId, name: row.name ?? row.clubId } : null;
}
