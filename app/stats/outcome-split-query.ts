/**
 * The Outcome Split queries (CLUBS-25): parallel reads, then the pure
 * roll-ups in `outcome-split.ts`. Each club's Appearances are summed per
 * Match in SQL, so the Worker handles two rows per Match rather than one per
 * Appearance. The Match page's "Why we dropped points" panel (CLUBS-27)
 * reads the same totals.
 */
import { and, count, eq, max, or, type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import type { Db } from "~/db/client";
import { appearances, matches } from "~/db/schema";

import { toOutcome } from "./convert";
import { isCountedAppearance, weQuit } from "./counted";
import { DEFAULT_STATS_FILTER, type StatsFilter } from "./filter";
import { listKickoffs, listMatches, type MatchSummary } from "./matches";
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
  type UsualComparisonRow,
  usualComparison,
} from "./outcome-split";
import { ALL_POSITIONS, type PositionGroupSelection } from "./positions";
import { isPlayedAppearanceSql, matchScope, type ScopeOptions } from "./scope";
import { sessionPlaces } from "./sessions";
import { ratingGap } from "./skill-rating";
import { type SquadAppearance, squadAppearances } from "./squad";

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
  const { summaries, squad, split } = await splitData(db, filter);
  return {
    ...split,
    players: playerSplits(squad, positionGroups),
    playedAt: summaries.map((m) => m.playedAt),
  };
}

/**
 * Our Club as it stood at `end`: every Competitive Match up to then (the
 * default filter), its Outcome Split, and each Match's performance. Write-ups
 * read it, so what they are given never changes once the moment has passed
 * (docs/adr/0006).
 */
export interface AnalysisAsOf {
  /** Oldest first. */
  matches: MatchSummary[];
  /** Our Club's counted Appearances in them (`isCountedAppearance`), oldest first. */
  squad: SquadAppearance[];
  split: OutcomeSplit;
  /** A Match's totals, both clubs, as the Outcome Split reads them. */
  performance(matchId: string): MatchPerformance;
}

/** `AnalysisAsOf` at `end`, in four parallel queries. */
export async function getAnalysisAsOf(
  db: Db,
  end: Date,
): Promise<AnalysisAsOf> {
  const { summaries, totals, squad, split } = await splitData(
    db,
    DEFAULT_STATS_FILTER,
    { playedBetween: { start: new Date(0), end } },
  );
  return {
    matches: summaries,
    squad,
    split,
    performance: (matchId) => performanceOf(totals.get(matchId)),
  };
}

/** The Outcome Split and what it was worked out from, over the Matches `filter` and `scope` select. */
async function splitData(
  db: Db,
  filter: StatsFilter,
  scope: ScopeOptions = {},
) {
  const [summaries, totals, played, kickoffs] = await Promise.all([
    listMatches(db, filter, { ...scope, order: "oldest" }),
    clubMatchTotals(db, matchScope(db, filter, scope)),
    // Personnel splits are about who played, so they keep the DNFs we quit.
    squadAppearances(db, filter, { ...scope, includeQuitMatches: true }),
    listKickoffs(db),
  ]);
  const squad = played.filter(isCountedAppearance);
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
      opponentHumans: sides?.opponentHumans ?? 0,
      session,
      sessionPlace: place,
      ratingGap: ratingGap(m.skillRatings),
    };
  });
  return {
    summaries,
    totals,
    squad,
    split: outcomeSplit(splitMatches, played),
  };
}

/**
 * A Dropped Points Match against the average Win over the default filter
 * (Competitive Matches, all time, DNFs included), whatever the page's
 * filters. Null for a Win, a DNF we quit (EA kept none of our stats), or
 * with fewer than 3 Wins to compare against.
 */
export async function getDroppedPointsReasons(
  db: Db,
  match: Pick<MatchSummary, "matchId" | "outcome" | "dnf">,
): Promise<DroppedPointsReasons | null> {
  if (match.outcome === "W" || weQuit(match)) return null;
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

/**
 * One Session's Matches beside every Match over the default filter
 * (Competitive Matches, all time, DNFs included): "Compared with your
 * usual" on the Session page (CLUBS-34). One query.
 */
export async function getUsualComparison(
  db: Db,
  matchIds: readonly string[],
): Promise<UsualComparisonRow[] | null> {
  const totals = await clubMatchTotals(
    db,
    matchScope(db, DEFAULT_STATS_FILTER),
  );
  return usualComparison(
    matchIds.map((id) => performanceOf(totals.get(id))),
    [...totals.values()].map(performanceOf),
  );
}

/** A Match's totals as the Outcome Split reads them: null for a club with no counted stats. */
function performanceOf(sides: MatchTotals | undefined): MatchPerformance {
  return {
    secondsPlayed: sides?.secondsPlayed ?? 0,
    ours: sides?.ours ?? null,
    opponent: sides?.opponent ?? null,
  };
}

interface MatchTotals {
  ours?: ClubMatchTotals;
  opponent?: ClubMatchTotals;
  /** The longest Appearance on either side: how long the Match ran. */
  secondsPlayed: number;
  /** Our Club's Appearances with minutes, a DNF we quit's included. */
  squadSize: number;
  /** The Opponent's Appearances with minutes: its humans, since EA lists no AI players. */
  opponentHumans: number;
}

function total(column: SQLiteColumn): SQL<number> {
  return sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number);
}

/**
 * Each club's Appearance totals in every Match `where` selects, by Match ID.
 * 0-minute Appearances are left out, and so are our totals in a DNF we quit
 * (`counted.ts`), though they still count towards the squad size.
 */
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
      dnf: matches.dnf,
      result: matches.result,
    })
    .from(appearances)
    .innerJoin(matches, eq(matches.matchId, appearances.matchId))
    .where(and(where, isPlayedAppearanceSql))
    .groupBy(appearances.matchId, appearances.clubId);

  const byMatch = new Map<string, MatchTotals>();
  for (const row of rows) {
    const { matchId, ours, players, secondsPlayed, dnf, result, ...stats } =
      row;
    const entry = byMatch.get(matchId) ?? {
      secondsPlayed: 0,
      squadSize: 0,
      opponentHumans: 0,
    };
    entry.secondsPlayed = Math.max(entry.secondsPlayed, secondsPlayed ?? 0);
    if (!ours) {
      entry.opponent = stats;
      entry.opponentHumans = players;
    } else {
      entry.squadSize = players;
      if (!weQuit({ dnf, outcome: toOutcome(result) })) entry.ours = stats;
    }
    byMatch.set(matchId, entry);
  }
  return byMatch;
}
