/**
 * The club leaders' data (CLUBS-51): EA's career totals and Our Club's
 * counted recorded Appearances, summed per current Squad Member, in two
 * parallel reads. Like Milestones, they ignore the `StatsFilter`.
 */
import { type AnyColumn, and, eq, sql } from "drizzle-orm";

import type { Db } from "~/db/client";
import { appearances, matches, players } from "~/db/schema";
import { displayName, isFormerSquadMember } from "~/roster";

import {
  clubLeaders,
  type LeaderBoard,
  type LeaderCandidate,
} from "./club-leaders";
import { eaMemberTotals } from "./ea-totals";
import { PERFECT_RATING } from "./milestones";
import { isCountedAppearanceSql, isOurAppearance, isShownMatch } from "./scope";

const total = (column: AnyColumn) =>
  sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number);

export async function getClubLeaders(db: Db): Promise<LeaderBoard[]> {
  const [members, recorded] = await Promise.all([
    eaMemberTotals(db),
    db
      .select({
        playerId: appearances.playerId,
        personaName: players.personaName,
        perfectRatings:
          sql<number>`sum(case when ${appearances.rating} >= ${PERFECT_RATING} then 1 else 0 end)`.mapWith(
            Number,
          ),
        tackles: total(appearances.tacklesMade),
        passes: total(appearances.passesMade),
        shots: total(appearances.shots),
        redCards: total(appearances.redCards),
      })
      .from(appearances)
      .innerJoin(matches, eq(matches.matchId, appearances.matchId))
      .innerJoin(players, eq(players.playerId, appearances.playerId))
      .where(and(isShownMatch, isOurAppearance, isCountedAppearanceSql))
      .groupBy(appearances.playerId),
  ]);
  const candidates = new Map<string, LeaderCandidate>(
    members.map(({ playerId, name, career }) => [
      playerId,
      { playerId, name, career, recorded: null },
    ]),
  );
  for (const { playerId, personaName, ...totals } of recorded) {
    if (isFormerSquadMember(playerId)) continue;
    const candidate = candidates.get(playerId) ?? {
      playerId,
      name: displayName(playerId, personaName),
      career: null,
      recorded: null,
    };
    candidates.set(playerId, { ...candidate, recorded: totals });
  }
  return clubLeaders([...candidates.values()]);
}
