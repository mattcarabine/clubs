/** Squad Member queries: Appearances, leaderboards and the Squad Member record. */
import {
  and,
  asc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  max,
  min,
  not,
  sql,
} from "drizzle-orm";

import type { Db } from "~/db/client";
import { appearances, clubs, matches, players } from "~/db/schema";
import type { MatchEvents } from "~/ea/events";
import type { MatchType, Outcome } from "~/lib/domain";
import { displayName, isFormerSquadMember } from "~/roster";

import type { ChoiceCounts } from "./choices";
import { toMatchType, toOutcome, toPositionGroup } from "./convert";
import { eventCount, totalOf } from "./event-sql";
import {
  type EventAppearance,
  type EventStatValues,
  eventStatsOf,
} from "./event-stats";
import type { StatsFilter } from "./filter";
import { inMainPosition } from "./positions";
import { aboveTeam, matchRatings } from "./rating-context";
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
  /**
   * The Appearance's Match Events, only with `withEvents`; null when EA sent
   * none. Work figures out from them in the loader: the map itself is too
   * big to send to the browser.
   */
  events?: MatchEvents | null;
}

export interface SquadAppearanceOptions extends ScopeOptions {
  /** Only this Squad Member's Appearances. */
  playerId?: string;
  /**
   * Read each Appearance's Match Events too, for Event Stats (CLUBS-85):
   * everyone's, or only these Squad Members' (the rest get null).
   */
  withEvents?: boolean | readonly string[];
}

/** Every Appearance column but the Match Events, which are read only on request. */
const { events: eventsColumn, ...appearanceColumns } =
  getTableColumns(appearances);

/**
 * Our Club's counted Appearances (`isCountedAppearance`) in the Matches a
 * filter selects, oldest first. The building block for anything per Squad
 * Member or per line-up.
 */
function eventsSelection(withEvents: boolean | readonly string[]) {
  if (withEvents === true) return eventsColumn;
  if (withEvents === false || withEvents.length === 0) return sql<null>`null`;
  return sql`case when ${inArray(appearances.playerId, [...withEvents])} then ${appearances.events} end`.mapWith(
    eventsColumn,
  );
}

export async function squadAppearances(
  db: Db,
  filter: StatsFilter,
  { playerId, withEvents = false, ...scope }: SquadAppearanceOptions = {},
): Promise<SquadAppearance[]> {
  const rows = await db
    .select({
      appearance: appearanceColumns,
      events: eventsSelection(withEvents),
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
        isCountedAppearanceSql,
        matchScope(db, filter, scope),
        playerId ? eq(appearances.playerId, playerId) : undefined,
      ),
    )
    .orderBy(asc(matches.playedAt), asc(appearances.playerId));

  return rows.map(
    ({ appearance, events, personaName, match, opponentName }) => {
      const { matchId, clubId: _, positionGroup, ...stats } = appearance;
      return {
        ...stats,
        ...(withEvents ? { events } : {}),
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
    },
  );
}

/**
 * The opposing humans' Appearances with Match Events in the Matches a filter
 * selects, for the Yardstick (`positionTotals`). Whoever played counts, on
 * either side of a rage quit: EA zeroes a quitter's named stats, never their
 * Match Events.
 */
export async function opponentEventAppearances(
  db: Db,
  filter: StatsFilter,
  scope: ScopeOptions = {},
): Promise<EventAppearance[]> {
  const rows = await db
    .select({
      positionGroup: appearances.positionGroup,
      secondsPlayed: appearances.secondsPlayed,
      redCards: appearances.redCards,
      events: appearances.events,
    })
    .from(appearances)
    .innerJoin(matches, eq(matches.matchId, appearances.matchId))
    .where(
      and(
        not(isOurAppearance),
        isPlayedAppearanceSql,
        isNotNull(appearances.events),
        matchScope(db, filter, scope),
      ),
    );
  return rows.map((row) => ({
    ...row,
    positionGroup: toPositionGroup(row.positionGroup),
  }));
}

/** Both clubs' choices in some Matches, before they are shared out (`choiceBreakdown`). */
export interface ClubChoiceCounts {
  /** One per Squad Member with Match Events in those Matches. */
  players: { playerId: string; name: string; counts: ChoiceCounts }[];
  /** The opposing humans' together; null when none of them has Match Events. */
  opponents: ChoiceCounts | null;
}

/**
 * Each Squad Member's choices (CLUBS-100) and the opposing humans' in the
 * Matches a filter selects, summed in SQL so the Worker never parses a Match
 * Events map for them. Whoever played counts, on either side of a rage quit:
 * EA zeroes a quitter's named stats, never their Match Events.
 */
export async function clubChoiceCounts(
  db: Db,
  filter: StatsFilter,
  scope: ScopeOptions = {},
): Promise<ClubChoiceCounts> {
  // One group per Squad Member, and one for every opposing human together.
  const squadMember = sql<
    string | null
  >`case when ${isOurAppearance} then ${appearances.playerId} end`;
  const rows = await db
    .select({
      playerId: squadMember,
      personaName: max(players.personaName),
      bestChoices: totalOf(eventCount("bestOptionTaken")),
      goodChoices: totalOf(eventCount("goodOptionTaken")),
      noGoodOptions: totalOf(eventCount("noGoodOption")),
      poorChoices: totalOf(eventCount("shouldHavePassedElsewhere")),
    })
    .from(appearances)
    .innerJoin(matches, eq(matches.matchId, appearances.matchId))
    .leftJoin(players, eq(players.playerId, appearances.playerId))
    .where(
      and(
        isPlayedAppearanceSql,
        isNotNull(appearances.events),
        matchScope(db, filter, scope),
      ),
    )
    .groupBy(squadMember);
  const result: ClubChoiceCounts = { players: [], opponents: null };
  for (const { playerId, personaName, ...counts } of rows) {
    if (playerId === null) result.opponents = counts;
    else {
      result.players.push({
        playerId,
        name: displayName(playerId, personaName),
        counts,
      });
    }
  }
  return result;
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
  aboveTeam: number | null;
  /** Their Event Stats (CLUBS-85), or null when no Appearance carried Match Events. */
  eventStats: EventStatValues | null;
}

export interface LeaderboardOptions extends ScopeOptions {
  /** Include Former Squad Members (default: current squad only). */
  includeFormer?: boolean;
  /**
   * Count only each Squad Member's Appearances in their Main Position
   * (default: every Appearance). Pass `filter.mainPositionOnly`.
   */
  mainPositionOnly?: boolean;
  /**
   * Read Match Events and give each row its `eventStats` (default: null).
   * Only for a page that shows them: parsing every map costs CPU.
   */
  eventStats?: boolean;
}

/**
 * One row per Squad Member with totals over the filtered Matches, most
 * Appearances first. With `mainPositionOnly`, the totals count only each
 * Squad Member's Appearances in their Main Position.
 */
export async function squadLeaderboard(
  db: Db,
  filter: StatsFilter,
  {
    includeFormer = false,
    mainPositionOnly = false,
    eventStats = false,
    ...scope
  }: LeaderboardOptions = {},
): Promise<LeaderboardRow[]> {
  const appearances = await squadAppearances(db, filter, {
    ...scope,
    withEvents: eventStats,
  });
  return leaderboardRows(appearances, {
    includeFormer,
    mainPositionOnly,
  });
}

/** `squadLeaderboard`'s rows from Appearances already fetched (oldest first), e.g. one Session's. */
export function leaderboardRows(
  appearances: readonly SquadAppearance[],
  {
    includeFormer = false,
    mainPositionOnly = false,
  }: Pick<LeaderboardOptions, "includeFormer" | "mainPositionOnly"> = {},
): LeaderboardRow[] {
  const byPlayer = groupBy(appearances, (a) => a.playerId);
  const ratings = matchRatings(appearances);
  return [...byPlayer.entries()]
    .map(([playerId, apps]) => {
      const name = apps[apps.length - 1].name;
      const selected = inMainPosition(apps, mainPositionOnly);
      return {
        playerId,
        name,
        former: isFormerSquadMember(playerId),
        ...summariseAppearances(selected),
        recentChange: recentChanges(selected, name).biggest,
        formIndicator: formIndicator(selected),
        aboveTeam: aboveTeam(selected, ratings).gap,
        eventStats: eventStatsOf(selected),
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
