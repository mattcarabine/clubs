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

import { type ChoiceBreakdown, choiceBreakdown } from "./choices";
import { isCountedAppearance, weQuit } from "./counted";
import { eventCount, totalOf } from "./event-sql";
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
import { type ResultDrivers, resultDrivers } from "./result-drivers";
import { isPlayedAppearanceSql, matchScope, type ScopeOptions } from "./scope";
import { type SessionStandouts, sessionStandouts } from "./session-standouts";
import { sessionPlaces } from "./sessions";
import { ratingGap } from "./skill-rating";
import {
  clubChoiceCounts,
  type SquadAppearance,
  squadAppearances,
} from "./squad";

export interface OutcomeSplitOptions {
  /** Counts each Squad Member's Main Position only, in the per-player rows alone. */
  mainPositionOnly?: boolean;
}

export interface OutcomeSplitPage extends OutcomeSplit {
  /** Why we win and why we lose (CLUBS-95); empty until the split is `ready`. */
  drivers: ResultDrivers;
  /**
   * How EA judged our passes and shots (CLUBS-100), each Squad Member in
   * their Main Position (CLUBS-101); null before any Match Events.
   */
  choices: ChoiceBreakdown | null;
  players: PlayerSplitRow[];
  /** One per Match, oldest first, matching `rollingWinPercentage`. */
  playedAt: Date[];
}

/** Everything the Analysis page shows, over the Matches a filter selects. */
export async function getOutcomeSplit(
  db: Db,
  filter: StatsFilter,
  { mainPositionOnly = false }: OutcomeSplitOptions = {},
): Promise<OutcomeSplitPage> {
  const [{ summaries, squad, split, splitMatches, withEvents }, choices] =
    await Promise.all([
      splitData(db, filter, {}, true),
      clubChoiceCounts(db, filter),
    ]);
  return {
    ...split,
    drivers: split.ready
      ? resultDrivers(splitMatches, withEvents)
      : { win: [], lose: [] },
    choices: choiceBreakdown(choices.players, choices.opponents),
    players: playerSplits(squad, mainPositionOnly, split.withWithout),
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
  /** Read Match Events too, for the result drivers. */
  events = false,
) {
  const [summaries, totals, played, kickoffs] = await Promise.all([
    listMatches(db, filter, { ...scope, order: "oldest" }),
    clubMatchTotals(db, matchScope(db, filter, scope)),
    squadAppearances(db, filter, { ...scope, withEvents: events }),
    listKickoffs(db),
  ]);
  const withEvents = played.filter(isCountedAppearance);
  // Match Events never leave here: everything else reads plain rows.
  const squad = withEvents.map(({ events: _, ...rest }) => rest);
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
      dnf: m.dnf,
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
    splitMatches,
    withEvents,
    split: outcomeSplit(splitMatches, squad),
  };
}

/**
 * A Dropped Points Match against the average Win over the default filter
 * (Competitive Matches, all time, DNFs included), whatever the page's
 * filters. Null for a Win, a DNF we quit (it never ran its course), or
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

/** One Session beside the rest, on the Session page. */
export interface SessionComparison {
  /** "Compared with your usual" (CLUBS-34); null with too few other Matches. */
  usual: UsualComparisonRow[] | null;
  /** What it did best and worst among our Sessions (CLUBS-96); null with too few. */
  standouts: SessionStandouts | null;
}

/**
 * One Session's Matches beside every Match, and every other Session, over
 * the default filter (Competitive Matches, all time, DNFs included).
 * `sessions` are every Session's Match IDs, this one's included. One query.
 */
export async function getSessionComparison(
  db: Db,
  matchIds: readonly string[],
  sessions: readonly (readonly string[])[],
): Promise<SessionComparison> {
  const totals = await clubMatchTotals(
    db,
    matchScope(db, DEFAULT_STATS_FILTER),
  );
  // A Match outside the default filter (a Friendly) has no totals here.
  const performances = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const sides = totals.get(id);
      return sides ? [performanceOf(sides)] : [];
    });
  const own = new Set(matchIds);
  return {
    usual: usualComparison(
      matchIds.map((id) => performanceOf(totals.get(id))),
      [...totals.values()].map(performanceOf),
    ),
    standouts: sessionStandouts(
      performances(matchIds),
      sessions
        .filter((ids) => !ids.some((id) => own.has(id)))
        .map(performances),
    ),
  };
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
 * 0-minute Appearances are left out. A club's totals in a Match it rage
 * quit count too, marked `quit` (`counted.ts`).
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
      withEvents: count(appearances.events),
      shotsOnTarget: totalOf(eventCount("shotsOnTarget")),
      throughBalls: totalOf(eventCount("throughBalls")),
      dribbles: totalOf(eventCount("dribblesCompleted")),
      interceptions: totalOf(eventCount("interceptions")),
      ballWon: totalOf(
        eventCount(
          "possessionWonDefensiveThird",
          "possessionWonMiddleThird",
          "possessionWonAttackingThird",
        ),
      ),
      ballLost: totalOf(
        eventCount(
          "possessionLostDefensiveThird",
          "possessionLostMiddleThird",
          "possessionLostAttackingThird",
        ),
      ),
      fouls: totalOf(eventCount("foulsConceded")),
      dnf: matches.dnf,
      result: matches.result,
    })
    .from(appearances)
    .innerJoin(matches, eq(matches.matchId, appearances.matchId))
    .where(and(where, isPlayedAppearanceSql))
    .groupBy(appearances.matchId, appearances.clubId);

  const byMatch = new Map<string, MatchTotals>();
  for (const row of rows) {
    const {
      matchId,
      ours,
      players,
      secondsPlayed,
      dnf,
      result,
      withEvents,
      shotsOnTarget,
      throughBalls,
      dribbles,
      interceptions,
      ballWon,
      ballLost,
      fouls,
      ...named
    } = row;
    const stats: ClubMatchTotals = {
      ...named,
      quit: dnf && result === (ours ? "loss" : "win"),
      detail:
        withEvents > 0
          ? {
              shotsOnTarget,
              throughBalls,
              dribbles,
              interceptions,
              ballWon,
              ballLost,
              fouls,
            }
          : null,
    };
    const entry = byMatch.get(matchId) ?? {
      secondsPlayed: 0,
      squadSize: 0,
      opponentHumans: 0,
    };
    entry.secondsPlayed = Math.max(entry.secondsPlayed, secondsPlayed ?? 0);
    if (ours) {
      entry.squadSize = players;
    } else {
      entry.opponentHumans = players;
    }
    entry[ours ? "ours" : "opponent"] = stats;
    byMatch.set(matchId, entry);
  }
  return byMatch;
}
