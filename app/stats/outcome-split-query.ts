/**
 * The Outcome Split queries (CLUBS-25): parallel reads, then the pure
 * roll-ups in `outcome-split.ts`. Each club's Appearances are summed per
 * Match in SQL, so the Worker handles two rows per Match rather than one per
 * Appearance. The Match page's "Why we dropped points" panel (CLUBS-27)
 * reads the same totals.
 */
import { asc, count, eq, max, or, type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import type { Db } from "~/db/client";
import { appearances, matches } from "~/db/schema";

import { DEFAULT_STATS_FILTER, type StatsFilter } from "./filter";
import { listMatches, type MatchSummary } from "./matches";
import {
  type ClubMatchTotals,
  type DroppedPointsReasons,
  droppedPointsReasons,
  type MatchPerformance,
  type OutcomeSplit,
  outcomeSplit,
  type PlayerSplitRow,
  playerSplits,
  type SplitMatch,
} from "./outcome-split";
import { ALL_POSITIONS, type PositionGroupSelection } from "./positions";
import { isShownMatch, matchScope } from "./scope";
import { type Kickoff, sessionPlaces } from "./sessions";
import { squadAppearances } from "./squad";

export interface OutcomeSplitOptions {
  /** Narrows only the per-player rows. */
  positionGroups?: PositionGroupSelection;
}

export interface OutcomeSplitPage extends OutcomeSplit {
  players: PlayerSplitRow[];
  /** One per Match, oldest first, matching `rollingWinPercentage`. */
  playedAt: Date[];
}

/** Everything the Analysis page shows, over the Matches a filter selects. */
export async function getOutcomeSplit(
  db: Db,
  filter: StatsFilter,
  { positionGroups = ALL_POSITIONS }: OutcomeSplitOptions = {},
): Promise<OutcomeSplitPage> {
  const [summaries, totals, squad, kickoffs] = await Promise.all([
    listMatches(db, filter, { order: "oldest" }),
    clubMatchTotals(db, matchScope(db, filter)),
    squadAppearances(db, filter),
    allKickoffs(db),
  ]);
  const places = sessionPlaces(kickoffs);
  const splitMatches = summaries.map((m, i): SplitMatch => {
    const sides = totals.get(m.matchId);
    // Every filtered Match is recorded, so this fallback (its own Session) never runs.
    const { session, place } = places.get(m.matchId) ?? {
      session: -1 - i,
      place: 1,
    };
    return {
      matchId: m.matchId,
      playedAt: m.playedAt,
      outcome: m.outcome,
      ...performanceOf(sides),
      squadSize: sides?.squadSize ?? 0,
      session,
      sessionPlace: place,
    };
  });
  return {
    ...outcomeSplit(splitMatches, squad),
    players: playerSplits(squad, positionGroups),
    playedAt: summaries.map((m) => m.playedAt),
  };
}

/**
 * A Dropped Points Match against the average Win over the default filter
 * (Competitive Matches, all time, DNFs included), whatever the page's
 * filters. Null for a Win, or with fewer than 3 Wins to compare against.
 */
export async function getDroppedPointsReasons(
  db: Db,
  match: Pick<MatchSummary, "matchId" | "outcome">,
): Promise<DroppedPointsReasons | null> {
  if (match.outcome === "W") return null;
  const baseline = matchScope(db, DEFAULT_STATS_FILTER);
  const [summaries, totals] = await Promise.all([
    listMatches(db, DEFAULT_STATS_FILTER),
    // The baseline's totals and this Match's, which may be outside it, in one read.
    clubMatchTotals(db, or(baseline, eq(matches.matchId, match.matchId))),
  ]);
  const wins = summaries
    .filter((m) => m.outcome === "W")
    .map((m) => performanceOf(totals.get(m.matchId)));
  return droppedPointsReasons(performanceOf(totals.get(match.matchId)), wins);
}

/** A Match's totals as the Outcome Split reads them, zero for a Match with no Appearances. */
function performanceOf(sides: MatchTotals | undefined): MatchPerformance {
  return {
    secondsPlayed: sides?.secondsPlayed ?? 0,
    ours: sides?.ours ?? NO_TOTALS,
    opponent: sides?.opponent ?? NO_TOTALS,
  };
}

const NO_TOTALS: ClubMatchTotals = {
  goals: 0,
  shots: 0,
  passesMade: 0,
  passAttempts: 0,
  tacklesMade: 0,
  tackleAttempts: 0,
  saves: 0,
  redCards: 0,
  ratingSum: 0,
  ratings: 0,
};

interface MatchTotals {
  ours?: ClubMatchTotals;
  opponent?: ClubMatchTotals;
  /** The longest Appearance on either side: how long the Match ran. */
  secondsPlayed: number;
  /** Our Club's Appearances. */
  squadSize: number;
}

function total(column: SQLiteColumn): SQL<number> {
  return sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number);
}

/** Each club's Appearance totals in every Match `where` selects, by Match ID. */
async function clubMatchTotals(
  db: Db,
  where: SQL | undefined,
): Promise<Map<string, MatchTotals>> {
  const rows = await db
    .select({
      matchId: appearances.matchId,
      ours: sql<boolean>`${appearances.clubId} <> ${matches.opponentClubId}`.mapWith(
        Boolean,
      ),
      players: count(),
      goals: total(appearances.goals),
      secondsPlayed: max(appearances.secondsPlayed),
      shots: total(appearances.shots),
      passesMade: total(appearances.passesMade),
      passAttempts: total(appearances.passAttempts),
      tacklesMade: total(appearances.tacklesMade),
      tackleAttempts: total(appearances.tackleAttempts),
      saves: total(appearances.saves),
      redCards: total(appearances.redCards),
      ratingSum: total(appearances.rating),
      ratings: count(appearances.rating),
    })
    .from(appearances)
    .innerJoin(matches, eq(matches.matchId, appearances.matchId))
    .where(where)
    .groupBy(appearances.matchId, appearances.clubId);

  const byMatch = new Map<string, MatchTotals>();
  for (const { matchId, ours, players, secondsPlayed, ...stats } of rows) {
    const entry = byMatch.get(matchId) ?? { secondsPlayed: 0, squadSize: 0 };
    entry.secondsPlayed = Math.max(entry.secondsPlayed, secondsPlayed ?? 0);
    entry[ours ? "ours" : "opponent"] = stats;
    if (ours) entry.squadSize = players;
    byMatch.set(matchId, entry);
  }
  return byMatch;
}

/** Every shown Match's kick-off, whatever the filter: Sessions span Match Types. */
async function allKickoffs(db: Db): Promise<Kickoff[]> {
  return db
    .select({ matchId: matches.matchId, playedAt: matches.playedAt })
    .from(matches)
    .where(isShownMatch)
    .orderBy(asc(matches.playedAt));
}
