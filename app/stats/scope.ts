/**
 * Turns a `StatsFilter` into SQL over the `matches` table. Every query that
 * counts Matches or Appearances goes through `matchScope`, so the filter means
 * the same thing on every page.
 */
import { and, desc, eq, gte, inArray, ne, type SQL } from "drizzle-orm";

import type { Db } from "~/db/client";
import { appearances, matches } from "~/db/schema";

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
 * Appearances for Our Club: the side that is not the Opponent. Needs
 * `matches` joined to `appearances`.
 */
export const isOurAppearance = ne(appearances.clubId, matches.opponentClubId);
