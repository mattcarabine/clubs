/**
 * The club leaders' data (CLUBS-51): EA's career totals and the recorded
 * Perfect ratings for every current Squad Member, in two parallel reads.
 * Like Milestones, they ignore the `StatsFilter`.
 */
import { and, count, eq, gte } from "drizzle-orm";

import type { Db } from "~/db/client";
import { appearances, matches, players } from "~/db/schema";
import { displayName, isFormerSquadMember } from "~/roster";

import { clubLeaders, type LeaderBoard } from "./club-leaders";
import { eaMemberTotals } from "./ea-totals";
import { PERFECT_RATING } from "./milestones";
import { isOurAppearance, isShownMatch } from "./scope";

export async function getClubLeaders(db: Db): Promise<LeaderBoard[]> {
  const [members, perfect] = await Promise.all([
    eaMemberTotals(db),
    db
      .select({
        playerId: appearances.playerId,
        personaName: players.personaName,
        perfectRatings: count(),
      })
      .from(appearances)
      .innerJoin(matches, eq(matches.matchId, appearances.matchId))
      .innerJoin(players, eq(players.playerId, appearances.playerId))
      .where(
        and(
          isShownMatch,
          isOurAppearance,
          gte(appearances.rating, PERFECT_RATING),
        ),
      )
      .groupBy(appearances.playerId),
  ]);
  const perfectBy = new Map(perfect.map((p) => [p.playerId, p]));
  const candidates = members.map(({ playerId, name, career }) => ({
    playerId,
    name,
    career,
    perfectRatings: perfectBy.get(playerId)?.perfectRatings ?? 0,
  }));
  // A Perfect rating with no EA totals yet still counts.
  for (const { playerId, personaName, perfectRatings } of perfect) {
    if (isFormerSquadMember(playerId)) continue;
    if (candidates.some((c) => c.playerId === playerId)) continue;
    candidates.push({
      playerId,
      name: displayName(playerId, personaName),
      career: null,
      perfectRatings,
    });
  }
  return clubLeaders(candidates);
}
