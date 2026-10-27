/**
 * Pure roll-ups of query rows: a club's record over a set of Matches, and a
 * Squad Member's totals over a set of Appearances. Queries return rows; these
 * turn rows into the numbers pages show, through `formulas.ts`.
 */
import type { Outcome, PositionGroup } from "~/lib/domain";

import { isPlayedAppearance } from "./counted";
import {
  average,
  form,
  minutesPlayed,
  passPercentage,
  per90,
  points,
  tacklePercentage,
  winPercentage,
} from "./formulas";

/** The fields of a Match a record needs, from Our Club's point of view. */
export interface RecordInput {
  outcome: Outcome;
  goalsFor: number;
  goalsAgainst: number;
  dnf: boolean;
}

export interface RecordSummary {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** 0 to 100, or null with no Matches. */
  winPercentage: number | null;
  /** How many of `played` were DNF. */
  dnf: number;
}

export function summariseRecord(
  matches: readonly RecordInput[],
): RecordSummary {
  const outcomes = matches.map((m) => m.outcome);
  const count = (outcome: Outcome) =>
    outcomes.filter((o) => o === outcome).length;
  const goalsFor = sum(matches, (m) => m.goalsFor);
  const goalsAgainst = sum(matches, (m) => m.goalsAgainst);
  return {
    played: matches.length,
    wins: count("W"),
    draws: count("D"),
    losses: count("L"),
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    points: points(outcomes),
    winPercentage: winPercentage(outcomes),
    dnf: matches.filter((m) => m.dnf).length,
  };
}

/** One Appearance's stats, as stored. */
export interface AppearanceStats {
  positionGroup: PositionGroup | null;
  goals: number;
  assists: number;
  shots: number;
  passesMade: number;
  passAttempts: number;
  tacklesMade: number;
  tackleAttempts: number;
  /** Null when EA sent no rating. */
  rating: number | null;
  manOfTheMatch: boolean;
  redCards: number;
  saves: number;
  goalsConceded: number;
  cleanSheet: boolean;
  secondsPlayed: number;
}

export interface PlayerTotals {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  goalContributions: number;
  shots: number;
  passesMade: number;
  passAttempts: number;
  tacklesMade: number;
  tackleAttempts: number;
  manOfTheMatch: number;
  redCards: number;
  saves: number;
  /** Clean sheets in Appearances as Goalkeeper or Defender only. */
  cleanSheets: number;
  /** 0 to 100, or null with no attempts. */
  passPercentage: number | null;
  tacklePercentage: number | null;
  averageRating: number | null;
  /** Average rating over the last 5 Appearances. */
  form: number | null;
  goalsPer90: number | null;
  assistsPer90: number | null;
  goalContributionsPer90: number | null;
  shotsPer90: number | null;
  /** The Position Group played most often (the latest wins a tie). */
  positionGroup: PositionGroup | null;
}

/** Totals over a Squad Member's Appearances, which must be oldest first. */
export function summariseAppearances(
  appearances: readonly AppearanceStats[],
): PlayerTotals {
  const total = (pick: (a: AppearanceStats) => number) =>
    sum(appearances, pick);
  const seconds = total((a) => a.secondsPlayed);
  const goals = total((a) => a.goals);
  const assists = total((a) => a.assists);
  const shots = total((a) => a.shots);
  const passesMade = total((a) => a.passesMade);
  const passAttempts = total((a) => a.passAttempts);
  const tacklesMade = total((a) => a.tacklesMade);
  const tackleAttempts = total((a) => a.tackleAttempts);
  const ratings = appearances.map((a) => a.rating);
  return {
    appearances: appearances.length,
    minutes: minutesPlayed(seconds),
    goals,
    assists,
    goalContributions: goals + assists,
    shots,
    passesMade,
    passAttempts,
    tacklesMade,
    tackleAttempts,
    manOfTheMatch: appearances.filter((a) => a.manOfTheMatch).length,
    redCards: total((a) => a.redCards),
    saves: total((a) => a.saves),
    cleanSheets: appearances.filter(
      (a) =>
        a.cleanSheet &&
        (a.positionGroup === "Goalkeeper" || a.positionGroup === "Defender"),
    ).length,
    passPercentage: passPercentage(passesMade, passAttempts),
    tacklePercentage: tacklePercentage(tacklesMade, tackleAttempts),
    averageRating: average(ratings),
    form: form(ratings),
    goalsPer90: per90(goals, seconds),
    assistsPer90: per90(assists, seconds),
    goalContributionsPer90: per90(goals + assists, seconds),
    shotsPer90: per90(shots, seconds),
    positionGroup: mostFrequent(appearances.map((a) => a.positionGroup)),
  };
}

/** Both clubs' totals in one Match. */
export interface MatchSides {
  ours: PlayerTotals;
  theirs: PlayerTotals;
}

/** Splits a Match's Appearances by club and totals each side, leaving out any with no minutes (`counted.ts`). */
export function summariseMatchSides(
  appearances: readonly (AppearanceStats & { isOurClub: boolean })[],
): MatchSides {
  const played = appearances.filter(isPlayedAppearance);
  return {
    ours: summariseAppearances(played.filter((a) => a.isOurClub)),
    theirs: summariseAppearances(played.filter((a) => !a.isOurClub)),
  };
}

/** Groups rows by key, keeping each group in input order. */
export function groupBy<T, K>(
  rows: readonly T[],
  key: (row: T) => K,
): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const group = groups.get(k);
    if (group) group.push(row);
    else groups.set(k, [row]);
  }
  return groups;
}

function sum<T>(rows: readonly T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

function mostFrequent<T>(values: readonly (T | null)[]): T | null {
  const counts = new Map<T, number>();
  let best: T | null = null;
  let bestCount = 0;
  for (const value of values) {
    if (value === null) continue;
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count >= bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}
