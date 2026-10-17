/**
 * The Outcome Split query (CLUBS-25): four parallel reads, then the pure
 * roll-ups in `outcome-split.ts`. Each club's Appearances are summed per
 * Match in SQL, so the Worker handles two rows per Match rather than one per
 * Appearance.
 */
import { asc, count, eq, max, type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import type { Db } from "~/db/client";
import { appearances, matches } from "~/db/schema";

import type { StatsFilter } from "./filter";
import { listMatches } from "./matches";
import {
  type ClubMatchTotals,
  type OutcomeSplit,
  outcomeSplit,
  type PlayerSplitRow,
  playerSplits,
  type SplitMatch,
} from "./outcome-split";
import { ALL_POSITIONS, type PositionGroupSelection } from "./positions";
import { matchScope } from "./scope";
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
    clubMatchTotals(db, filter),
    squadAppearances(db, filter),
    allKickoffs(db),
  ]);
  const places = sessionPlaces(kickoffs);
  const splitMatches = summaries.map((m): SplitMatch => {
    const sides = totals.get(m.matchId);
    return {
      matchId: m.matchId,
      playedAt: m.playedAt,
      outcome: m.outcome,
      secondsPlayed: sides?.secondsPlayed ?? 0,
      ours: sides?.ours ?? NO_TOTALS,
      opponent: sides?.opponent ?? NO_TOTALS,
      squadSize: sides?.squadSize ?? 0,
      sessionPlace: places.get(m.matchId) ?? 1,
    };
  });
  return {
    ...outcomeSplit(splitMatches, squad),
    players: playerSplits(squad, positionGroups),
    playedAt: summaries.map((m) => m.playedAt),
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

/** Each club's Appearance totals in every filtered Match, by Match ID. */
async function clubMatchTotals(
  db: Db,
  filter: StatsFilter,
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
    .where(matchScope(db, filter))
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

/** Every recorded Match's kick-off, whatever the filter: Sessions span Match Types. */
async function allKickoffs(db: Db): Promise<Kickoff[]> {
  return db
    .select({ matchId: matches.matchId, playedAt: matches.playedAt })
    .from(matches)
    .orderBy(asc(matches.playedAt));
}
