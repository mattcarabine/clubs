/** Match queries: lists, counts, a single Match with both line-ups, and the club record. */
import { and, asc, count, desc, eq } from "drizzle-orm";

import type { Db } from "~/db/client";
import { appearances, clubs, matches, players } from "~/db/schema";
import type { MatchKind, MatchResult } from "~/ea/parse";
import type { MatchType, Outcome, PositionGroup } from "~/lib/domain";
import { displayName } from "~/roster";

import { toMatchType, toOutcome, toPositionGroup } from "./convert";
import type { StatsFilter } from "./filter";
import { isShownMatch, matchScope, type ScopeOptions } from "./scope";
import type { Kickoff } from "./sessions";
import {
  type AppearanceStats,
  type RecordSummary,
  summariseRecord,
} from "./summaries";

export interface Club {
  clubId: string;
  /** EA's club name; falls back to the club ID when EA sent none. */
  name: string;
}

/** One Match from Our Club's point of view. */
export interface MatchSummary {
  matchId: string;
  matchType: MatchType;
  playedAt: Date;
  opponent: Club;
  goalsFor: number;
  goalsAgainst: number;
  outcome: Outcome;
  /** Flag these in the UI: EA awarded the result because a side quit. */
  dnf: boolean;
}

export interface MatchListOptions extends ScopeOptions {
  /** Newest first (the default) or oldest first, e.g. for charts. */
  order?: "newest" | "oldest";
  limit?: number;
  offset?: number;
}

const summaryColumns = {
  matchId: matches.matchId,
  matchType: matches.matchType,
  playedAt: matches.playedAt,
  opponentClubId: matches.opponentClubId,
  opponentName: clubs.name,
  goalsFor: matches.goalsFor,
  goalsAgainst: matches.goalsAgainst,
  result: matches.result,
  dnf: matches.dnf,
};

/** Matches joined to their Opponent, selecting the columns `toSummary` reads. */
function selectSummaries(db: Db) {
  return db
    .select(summaryColumns)
    .from(matches)
    .innerJoin(clubs, eq(clubs.clubId, matches.opponentClubId));
}

/** The Matches a filter selects, newest first unless `order` says otherwise. */
export async function listMatches(
  db: Db,
  filter: StatsFilter,
  { order = "newest", limit, offset, ...scope }: MatchListOptions = {},
): Promise<MatchSummary[]> {
  let query = selectSummaries(db)
    .where(matchScope(db, filter, scope))
    // Match ID breaks ties so pages never shuffle or repeat across offsets.
    .orderBy(
      ...(order === "newest"
        ? [desc(matches.playedAt), desc(matches.matchId)]
        : [asc(matches.playedAt), asc(matches.matchId)]),
    )
    .$dynamic();
  if (limit !== undefined) query = query.limit(limit);
  if (offset !== undefined) query = query.offset(offset);
  return (await query).map(toSummary);
}

/** How many Matches a filter selects, for pagination. */
export async function countMatches(
  db: Db,
  filter: StatsFilter,
  scope: ScopeOptions = {},
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(matches)
    .where(matchScope(db, filter, scope));
  return row?.total ?? 0;
}

/** The newest Match the filter selects, or null when there is none. */
export async function latestMatch(
  db: Db,
  filter: StatsFilter,
  scope: ScopeOptions = {},
): Promise<MatchSummary | null> {
  const [match] = await listMatches(db, filter, { ...scope, limit: 1 });
  return match ?? null;
}

/** Our Club's W/D/L, goals and points over the Matches a filter selects. */
export async function clubRecord(
  db: Db,
  filter: StatsFilter,
  scope: ScopeOptions = {},
): Promise<RecordSummary> {
  return summariseRecord(await listMatches(db, filter, scope));
}

/** Every shown Match's kick-off, oldest first, whatever the filter: Sessions span Match Types. */
export async function listKickoffs(db: Db): Promise<Kickoff[]> {
  return db
    .select({ matchId: matches.matchId, playedAt: matches.playedAt })
    .from(matches)
    .where(isShownMatch)
    .orderBy(asc(matches.playedAt));
}

/** One player's line in a Match, on either side. */
export interface MatchAppearance
  extends Omit<AppearanceStats, "positionGroup"> {
  playerId: string;
  /** Roster nickname for Squad Members, else EA's persona name. */
  name: string;
  clubId: string;
  isOurClub: boolean;
  positionGroup: PositionGroup | null;
}

/** Both clubs' Skill Ratings at a Match; null when it was never rated. */
export interface MatchSkillRatings {
  ours: number | null;
  opponent: number | null;
}

export interface MatchDetail extends MatchSummary {
  skillRatings: MatchSkillRatings;
  /** Our Club's Appearances, then the Opponent's. */
  appearances: MatchAppearance[];
}

/** A Match with both clubs' Appearances, or null for an unknown ID or a Friendly. Ignores the filter. */
export async function getMatch(
  db: Db,
  matchId: string,
): Promise<MatchDetail | null> {
  const [match] = await db
    .select({
      ...summaryColumns,
      ourSkillRating: matches.ourSkillRating,
      opponentSkillRating: matches.opponentSkillRating,
    })
    .from(matches)
    .innerJoin(clubs, eq(clubs.clubId, matches.opponentClubId))
    .where(and(eq(matches.matchId, matchId), isShownMatch));
  if (!match) return null;

  const rows = await db
    .select({ appearance: appearances, personaName: players.personaName })
    .from(appearances)
    .innerJoin(players, eq(players.playerId, appearances.playerId))
    .where(eq(appearances.matchId, matchId));

  const lineups = rows
    .map(({ appearance, personaName }): MatchAppearance => {
      const { matchId: _, positionGroup, ...stats } = appearance;
      const isOurClub = appearance.clubId !== match.opponentClubId;
      return {
        ...stats,
        positionGroup: toPositionGroup(positionGroup),
        isOurClub,
        name: isOurClub
          ? displayName(appearance.playerId, personaName)
          : (personaName ?? appearance.playerId),
      };
    })
    .sort((a, b) => Number(b.isOurClub) - Number(a.isOurClub));

  return {
    ...toSummary(match),
    skillRatings: {
      ours: match.ourSkillRating,
      opponent: match.opponentSkillRating,
    },
    appearances: lineups,
  };
}

interface SummaryRow {
  matchId: string;
  matchType: MatchKind;
  playedAt: Date;
  opponentClubId: string;
  opponentName: string | null;
  goalsFor: number;
  goalsAgainst: number;
  result: MatchResult;
  dnf: boolean;
}

function toSummary(row: SummaryRow): MatchSummary {
  return {
    matchId: row.matchId,
    matchType: toMatchType(row.matchType),
    playedAt: row.playedAt,
    opponent: {
      clubId: row.opponentClubId,
      name: row.opponentName ?? row.opponentClubId,
    },
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    outcome: toOutcome(row.result),
    dnf: row.dnf,
  };
}
