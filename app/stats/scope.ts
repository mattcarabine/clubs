/**
 * Turns a `StatsFilter` into SQL over the `matches` table. Every query that
 * counts Matches or Appearances goes through `matchScope`, so the filter means
 * the same thing on every page.
 */
import {
  and,
  eq,
  exists,
  gt,
  gte,
  inArray,
  lt,
  lte,
  ne,
  notExists,
  type SQL,
} from "drizzle-orm";

import type { Db } from "~/db/client";
import { appearances, matches, seasons } from "~/db/schema";

import { toMatchKind } from "./convert";
import { dateWindow, MATCH_TYPES, type StatsFilter } from "./filter";

/**
 * The Matches the app ever shows: League and Playoff. The Poll still stores
 * Friendlies (ADR 0003), so every query that ignores the filter (a single
 * Match, an Opponent, a Squad Member, Sessions) still applies this.
 */
export const isShownMatch = inArray(
  matches.matchType,
  MATCH_TYPES.map(toMatchKind),
);

/** Narrows a query beyond the global filter. */
export interface ScopeOptions {
  /** Only Matches against this Opponent. */
  opponentClubId?: string;
  /** The clock for date ranges; defaults to now. */
  now?: Date;
}

/**
 * The condition selecting the Matches a filter counts. The date range and
 * the Season are both applied, so the effective window is their intersection.
 */
export function matchScope(
  db: Db,
  filter: StatsFilter,
  { opponentClubId, now = new Date() }: ScopeOptions = {},
): SQL | undefined {
  const { start, end } = dateWindow(filter.dates, now);
  return and(
    inArray(matches.matchType, filter.matchTypes.map(toMatchKind)),
    filter.includeDnf ? undefined : eq(matches.dnf, false),
    start ? gte(matches.playedAt, start) : undefined,
    end ? lt(matches.playedAt, end) : undefined,
    opponentClubId ? eq(matches.opponentClubId, opponentClubId) : undefined,
    filter.season === undefined ? undefined : inSeason(db, filter.season),
  );
}

/**
 * Matches played in Season `number`: on or after its start, and before any
 * later Season's. Worked out per query rather than stored, so a Match
 * ingested before its Season's boundary was detected still lands in the
 * right Season. An unknown Season selects nothing.
 */
function inSeason(db: Db, number: number): SQL | undefined {
  const startedBy = (season: SQL) =>
    db
      .select({ number: seasons.number })
      .from(seasons)
      .where(and(season, lte(seasons.startedAt, matches.playedAt)));
  return and(
    exists(startedBy(eq(seasons.number, number))),
    notExists(startedBy(gt(seasons.number, number))),
  );
}

/**
 * Appearances for Our Club: the side that is not the Opponent. Needs
 * `matches` joined to `appearances`.
 */
export const isOurAppearance = ne(appearances.clubId, matches.opponentClubId);
