/** Opponent queries: head-to-head records. Opponents are summarised at club level only. */
import { and, desc, eq, isNotNull } from "drizzle-orm";

import type { Db } from "~/db/client";
import { clubs, matches } from "~/db/schema";

import type { StatsFilter } from "./filter";
import { type Club, listMatches } from "./matches";
import { isShownMatch, type ScopeOptions } from "./scope";
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

export interface OpponentDetail extends Club {
  /** The Opponent Rating at the latest rated Match, or null when none is rated. */
  latestRating: { skillRating: number; playedAt: Date } | null;
}

/** An Opponent, or null when Our Club has never played that club in a shown Match. Ignores the filter. */
export async function getOpponent(
  db: Db,
  clubId: string,
): Promise<OpponentDetail | null> {
  const [[club], [rated]] = await Promise.all([
    db
      .select({ clubId: clubs.clubId, name: clubs.name })
      .from(clubs)
      .innerJoin(matches, eq(matches.opponentClubId, clubs.clubId))
      .where(and(eq(clubs.clubId, clubId), isShownMatch))
      .limit(1),
    db
      .select({
        skillRating: matches.opponentSkillRating,
        playedAt: matches.playedAt,
      })
      .from(matches)
      .where(
        and(
          eq(matches.opponentClubId, clubId),
          isShownMatch,
          isNotNull(matches.opponentSkillRating),
        ),
      )
      .orderBy(desc(matches.playedAt))
      .limit(1),
  ]);
  if (!club) return null;
  return {
    clubId: club.clubId,
    name: club.name ?? club.clubId,
    latestRating:
      rated?.skillRating != null
        ? { skillRating: rated.skillRating, playedAt: rated.playedAt }
        : null,
  };
}
