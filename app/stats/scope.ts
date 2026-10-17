/**
 * Turns a `StatsFilter` into SQL over the `matches` table. Every query that
 * counts Matches or Appearances goes through `matchScope`, so the filter means
 * the same thing on every page.
 */
import {
  and,
  desc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  lte,
  ne,
  notExists,
  type SQL,
} from "drizzle-orm";

import type { Db } from "~/db/client";
import { appearances, matches, seasons } from "~/db/schema";

import { toMatchKind } from "./convert";
import type { StatsFilter } from "./filter";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 30;
const RECENT_MATCHES = 10;

/** Narrows a query beyond the global filter. */
export interface ScopeOptions {
  /** Only Matches against this Opponent. */
  opponentClubId?: string;
  /** The clock for date ranges; defaults to now. */
  now?: Date;
}

/**
 * The condition selecting the Matches a filter counts. "Last 10" is the
 * latest 10 Matches that pass every other condition (including
 * `opponentClubId`), so a head-to-head page shows its own last 10.
 */
export function matchScope(
  db: Db,
  filter: StatsFilter,
  { opponentClubId, now = new Date() }: ScopeOptions = {},
): SQL | undefined {
  const base = and(
    inArray(matches.matchType, filter.matchTypes.map(toMatchKind)),
    filter.includeDnf ? undefined : eq(matches.dnf, false),
    filter.range === "30d"
      ? gte(matches.playedAt, new Date(now.getTime() - RECENT_DAYS * DAY_MS))
      : undefined,
    opponentClubId ? eq(matches.opponentClubId, opponentClubId) : undefined,
    filter.season === undefined ? undefined : inSeason(db, filter.season),
  );
  if (filter.range !== "last10") return base;
  return inArray(
    matches.matchId,
    db
      .select({ matchId: matches.matchId })
      .from(matches)
      .where(base)
      .orderBy(desc(matches.playedAt), desc(matches.matchId))
      .limit(RECENT_MATCHES),
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
