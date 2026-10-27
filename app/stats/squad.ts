/** Squad Member queries: Appearances, leaderboards and the Squad Member record. */
import { and, asc, eq, min } from "drizzle-orm";

import type { Db } from "~/db/client";
import { appearances, clubs, matches, players } from "~/db/schema";
import type { MatchType, Outcome } from "~/lib/domain";
import { displayName, isFormerSquadMember } from "~/roster";

import { toMatchType, toOutcome, toPositionGroup } from "./convert";
import type { StatsFilter } from "./filter";
import {
  ALL_POSITIONS,
  filterByPositionGroups,
  type PositionGroupSelection,
} from "./positions";
import { matchRatings, vsTeam } from "./rating-context";
import {
  type FormIndicator,
  formIndicator,
  type RecentChange,
  recentChanges,
} from "./recent-change";
import {
  isCountedAppearanceSql,
  isOurAppearance,
  isPlayedAppearanceSql,
  isShownMatch,
  matchScope,
  type ScopeOptions,
} from "./scope";
import {
  type AppearanceStats,
  groupBy,
  type PlayerTotals,
  summariseAppearances,
} from "./summaries";

/** One Appearance for Our Club, with its Match's context. */
export interface SquadAppearance extends AppearanceStats {
  playerId: string;
  name: string;
  matchId: string;
  matchType: MatchType;
  playedAt: Date;
  opponentClubId: string;
  opponentName: string;
  goalsFor: number;
  goalsAgainst: number;
  outcome: Outcome;
  dnf: boolean;
}

export interface SquadAppearanceOptions extends ScopeOptions {
  /** Only this Squad Member's Appearances. */
  playerId?: string;
  /**
   * Keep Appearances in DNFs we quit, for who-played views (line-ups,
   * with and without) that count the result, not the stats. Filter with
   * `isCountedAppearance` before totalling them.
   */
  includeQuitMatches?: boolean;
}

/**
 * Our Club's counted Appearances (`isCountedAppearance`) in the Matches a
 * filter selects, oldest first. The building block for anything per Squad
 * Member or per line-up.
 */
export async function squadAppearances(
  db: Db,
  filter: StatsFilter,
  {
    playerId,
    includeQuitMatches = false,
    ...scope
  }: SquadAppearanceOptions = {},
): Promise<SquadAppearance[]> {
  const rows = await db
    .select({
      appearance: appearances,
      personaName: players.personaName,
      match: matches,
      opponentName: clubs.name,
    })
    .from(appearances)
    .innerJoin(matches, eq(matches.matchId, appearances.matchId))
    .innerJoin(players, eq(players.playerId, appearances.playerId))
    .innerJoin(clubs, eq(clubs.clubId, matches.opponentClubId))
    .where(
      and(
        isOurAppearance,
        includeQuitMatches ? isPlayedAppearanceSql : isCountedAppearanceSql,
        matchScope(db, filter, scope),
        playerId ? eq(appearances.playerId, playerId) : undefined,
      ),
    )
    .orderBy(asc(matches.playedAt), asc(appearances.playerId));

  return rows.map(({ appearance, personaName, match, opponentName }) => {
    const { matchId, clubId: _, positionGroup, ...stats } = appearance;
    return {
      ...stats,
      positionGroup: toPositionGroup(positionGroup),
      name: displayName(appearance.playerId, personaName),
      matchId,
      matchType: toMatchType(match.matchType),
      playedAt: match.playedAt,
      opponentClubId: match.opponentClubId,
      opponentName: opponentName ?? match.opponentClubId,
      goalsFor: match.goalsFor,
      goalsAgainst: match.goalsAgainst,
      outcome: toOutcome(match.result),
      dnf: match.dnf,
    };
  });
}

export interface LeaderboardRow extends PlayerTotals {
  playerId: string;
  name: string;
  former: boolean;
  /** The biggest of the Squad Member's recent changes (CLUBS-37), or null. */
  recentChange: RecentChange | null;
  /** Hot or Cold form (CLUBS-40), or null for neither. */
  formIndicator: FormIndicator | null;
  /** Average rating minus their teammates' in the same Matches (CLUBS-66), or null with none rated. */
  vsTeam: number | null;
}

export interface LeaderboardOptions extends ScopeOptions {
  /** Include Former Squad Members (default: current squad only). */
  includeFormer?: boolean;
  /**
   * Count only Appearances in these Position Groups (default: All
   * Positions). Pass `filter.positionGroups` for the global selection.
   */
  positionGroups?: PositionGroupSelection;
}

/**
 * One row per Squad Member with totals over the filtered Matches, most
 * Appearances first. With `positionGroups`, everyone who played in those
 * Matches keeps a row, and the totals count only their Appearances in those
 * Position Groups, so a Squad Member with none has 0 Appearances.
 */
export async function squadLeaderboard(
  db: Db,
  filter: StatsFilter,
  {
    includeFormer = false,
    positionGroups = ALL_POSITIONS,
    ...scope
  }: LeaderboardOptions = {},
): Promise<LeaderboardRow[]> {
  return leaderboardRows(await squadAppearances(db, filter, scope), {
    includeFormer,
    positionGroups,
  });
}

/** `squadLeaderboard`'s rows from Appearances already fetched (oldest first), e.g. one Session's. */
export function leaderboardRows(
  appearances: readonly SquadAppearance[],
  {
    includeFormer = false,
    positionGroups = ALL_POSITIONS,
  }: Pick<LeaderboardOptions, "includeFormer" | "positionGroups"> = {},
): LeaderboardRow[] {
  const byPlayer = groupBy(appearances, (a) => a.playerId);
  const ratings = matchRatings(appearances);
  return [...byPlayer.entries()]
    .map(([playerId, apps]) => {
      const name = apps[apps.length - 1].name;
      const selected = filterByPositionGroups(apps, positionGroups);
      return {
        playerId,
        name,
        former: isFormerSquadMember(playerId),
        ...summariseAppearances(selected),
        recentChange: recentChanges(selected, name).biggest,
        formIndicator: formIndicator(selected),
        vsTeam: vsTeam(selected, ratings).gap,
      };
    })
    .filter((row) => includeFormer || !row.former)
    .sort(
      (a, b) => b.appearances - a.appearances || a.name.localeCompare(b.name),
    );
}

/** A current Squad Member in Hot or Cold form. */
export interface SquadFormRow {
  playerId: string;
  name: string;
  formIndicator: FormIndicator;
}

/**
 * The current Squad Members in Hot or Cold form (CLUBS-40) among Squad table
 * rows, biggest gap first, for the Squad page's Form watch strip.
 */
export function formWatch(rows: readonly LeaderboardRow[]): SquadFormRow[] {
  const watch: SquadFormRow[] = [];
  for (const { playerId, name, former, formIndicator } of rows) {
    if (former || !formIndicator) continue;
    watch.push({ playerId, name, formIndicator });
  }
  return watch.sort(
    (a, b) => formGap(b.formIndicator) - formGap(a.formIndicator),
  );
}

function formGap({ recent, usual }: FormIndicator): number {
  return Math.abs(recent - usual);
}

export interface SquadMember {
  playerId: string;
  name: string;
  /** EA's latest persona name, which can differ from a Roster nickname. */
  personaName: string | null;
  former: boolean;
  /** When we first recorded an Appearance for Our Club: "Tracking since". */
  trackedSince: Date;
}

/** A Squad Member, or null when the ID has never appeared for Our Club in a shown Match. */
export async function getSquadMember(
  db: Db,
  playerId: string,
): Promise<SquadMember | null> {
  const [row] = await db
    .select({
      personaName: players.personaName,
      trackedSince: min(matches.playedAt),
    })
    .from(players)
    .innerJoin(appearances, eq(appearances.playerId, players.playerId))
    .innerJoin(matches, eq(matches.matchId, appearances.matchId))
    .where(and(eq(players.playerId, playerId), isOurAppearance, isShownMatch))
    .groupBy(players.playerId);
  if (!row?.trackedSince) return null;
  return {
    playerId,
    name: displayName(playerId, row.personaName),
    personaName: row.personaName,
    former: isFormerSquadMember(playerId),
    trackedSince: row.trackedSince,
  };
}

/** A Squad Member to pick from, e.g. in Compare's player switchers. */
export interface SquadMemberOption {
  playerId: string;
  name: string;
  former: boolean;
}

/**
 * Every Squad Member who has ever made an Appearance for Our Club, Former
 * ones included, by name. Not filtered: a picker offers the whole Squad.
 */
export async function listSquadMembers(db: Db): Promise<SquadMemberOption[]> {
  const rows = await db
    .selectDistinct({
      playerId: players.playerId,
      personaName: players.personaName,
    })
    .from(players)
    .innerJoin(appearances, eq(appearances.playerId, players.playerId))
    .innerJoin(matches, eq(matches.matchId, appearances.matchId))
    .where(and(isOurAppearance, isShownMatch));
  return rows
    .map(({ playerId, personaName }) => ({
      playerId,
      name: displayName(playerId, personaName),
      former: isFormerSquadMember(playerId),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
