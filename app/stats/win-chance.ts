/**
 * Win Chance (CLUBS-30): Our Club's chance of a Win from the rating gap (our
 * Skill Rating minus the Opponent's at the Match). Pure and client-safe;
 * `win-chance-query.ts` feeds it from D1.
 *
 * With at least `MIN_FITTED_MATCHES` rated Matches the chance comes from a
 * one-variable logistic regression of Win (draws count as Dropped Points,
 * like the Outcome Split) on the gap, fitted on request with no stored state.
 * Before that it is the Elo-style curve `1 / (1 + 10^(-gap / 400))`, labelled
 * "Estimate".
 */
import type { Outcome } from "~/lib/domain";
import { formatPercentage, formatSigned } from "~/lib/number-format";

import type { MatchSkillRatings } from "./matches";
import { ratingGap } from "./skill-rating";

/** Rated Matches needed before the curve is fitted rather than estimated. */
export const MIN_FITTED_MATCHES = 20;

/** A Win given a Win Chance below this (0 to 1) is an upset. */
export const UPSET_WIN_CHANCE = 0.35;

/** Dropped Points given a Win Chance above this (0 to 1) is a Match we should have won. */
export const SHOULD_HAVE_WON_CHANCE = 0.65;

/** An upset this far out (0 to 1) is a big one: a Win from under 20%, or Dropped Points from over 80%. */
export const BIG_UPSET_WIN_CHANCE = 0.2;
export const BIG_SHOULD_HAVE_WON_CHANCE = 0.8;

/** A Win Chance (0 to 1) at or above this makes us Favourites. */
export const FAVOURITES_CHANCE = 0.55;

/** A Win Chance (0 to 1) at or below this makes us Underdogs. */
export const UNDERDOGS_CHANCE = 0.45;

/**
 * The fit's ridge penalty on the slope (per 100 rating points). It keeps the
 * curve finite when every Win came at a bigger gap than every Dropped Points
 * Match, and barely moves it otherwise.
 */
export const FIT_RIDGE = 1;

/** The gap scale the fit works in, so its numbers stay near 1. */
const GAP_UNIT = 100;

/** The Elo curve as a logistic slope: 10^(gap / 400) = e^(gap * ln 10 / 400). */
const ELO_SLOPE = Math.LN10 / 400;

/** One rated Match: the rating gap and whether we won. */
export interface RatedResult {
  gap: number;
  outcome: Outcome;
}

/** A logistic curve of Win Chance over the rating gap. */
export interface WinChanceModel {
  /** "fitted" from our results, or the Elo "estimate" until there are enough. */
  source: "fitted" | "estimate";
  /** Log-odds of a Win at a gap of 0. */
  intercept: number;
  /** Change in log-odds per Skill Rating point of gap. */
  slope: number;
  /** The rated Matches behind it. */
  matches: number;
}

/** Our chance of a Win, 0 to 1, at a rating gap. */
export function winChance(
  { intercept, slope }: Pick<WinChanceModel, "intercept" | "slope">,
  gap: number,
): number {
  return 1 / (1 + Math.exp(-(intercept + slope * gap)));
}

/** The Elo-style curve, `1 / (1 + 10^(-gap / 400))`. */
export function eloWinChance(gap: number): number {
  return winChance({ intercept: 0, slope: ELO_SLOPE }, gap);
}

/**
 * The Win Chance curve for these rated Matches: fitted from at least
 * `MIN_FITTED_MATCHES`, otherwise the Elo estimate. A fit that cannot be made
 * (all Wins, or none) falls back to the estimate too.
 */
export function winChanceModel(
  results: readonly RatedResult[],
): WinChanceModel {
  const fit =
    results.length >= MIN_FITTED_MATCHES ? fitLogistic(results) : null;
  return fit
    ? { source: "fitted", ...fit, matches: results.length }
    : {
        source: "estimate",
        intercept: 0,
        slope: ELO_SLOPE,
        matches: results.length,
      };
}

/**
 * Maximum-likelihood logistic regression of Win on the gap, by Newton's
 * method with `FIT_RIDGE` on the slope. Null when every result is the same,
 * which has no finite fit, or when it fails to converge.
 */
export function fitLogistic(
  results: readonly RatedResult[],
): Pick<WinChanceModel, "intercept" | "slope"> | null {
  const wins = results.filter((r) => r.outcome === "W").length;
  if (wins === 0 || wins === results.length) return null;
  const points = results.map((r) => ({
    x: r.gap / GAP_UNIT,
    y: r.outcome === "W" ? 1 : 0,
  }));
  let b0 = 0;
  let b1 = 0;
  for (let iteration = 0; iteration < 50; iteration++) {
    let g0 = 0;
    let g1 = -FIT_RIDGE * b1;
    let h00 = 0;
    let h01 = 0;
    let h11 = FIT_RIDGE;
    for (const { x, y } of points) {
      const p = winChance({ intercept: b0, slope: b1 }, x);
      const w = p * (1 - p);
      g0 += y - p;
      g1 += (y - p) * x;
      h00 += w;
      h01 += w * x;
      h11 += w * x * x;
    }
    const det = h00 * h11 - h01 * h01;
    if (!(det > 0)) return null;
    const d0 = (h11 * g0 - h01 * g1) / det;
    const d1 = (h00 * g1 - h01 * g0) / det;
    b0 += d0;
    b1 += d1;
    if (Math.abs(d0) < 1e-10 && Math.abs(d1) < 1e-10) {
      return { intercept: b0, slope: b1 / GAP_UNIT };
    }
  }
  return null;
}

/**
 * An Upset: a Win we were unlikely to get, or Dropped Points we were expected
 * to win, and whether it was a big one.
 */
export interface Expectation {
  kind: "upset-win" | "should-have-won";
  big: boolean;
}

export function expectation(
  chance: number,
  outcome: Outcome,
): Expectation | null {
  if (outcome === "W") {
    return chance < UPSET_WIN_CHANCE
      ? { kind: "upset-win", big: chance < BIG_UPSET_WIN_CHANCE }
      : null;
  }
  return chance > SHOULD_HAVE_WON_CHANCE
    ? { kind: "should-have-won", big: chance > BIG_SHOULD_HAVE_WON_CHANCE }
    : null;
}

/** How a Win Chance billed us before kick-off. */
export type Billing = "favourites" | "toss-up" | "underdogs";

/** Judged on the whole percentage shown, so "55%" is never a toss-up. */
export function billing(chance: number): Billing {
  const shown = Math.round(chance * 100) / 100;
  if (shown >= FAVOURITES_CHANCE) return "favourites";
  if (shown <= UNDERDOGS_CHANCE) return "underdogs";
  return "toss-up";
}

/** Wins against the Wins the curve expected: the sum of each Match's Win Chance. */
export interface WinsAgainstExpected {
  played: number;
  wins: number;
  expected: number;
}

export function winsAgainstExpected(
  model: WinChanceModel,
  results: readonly RatedResult[],
): WinsAgainstExpected {
  return {
    played: results.length,
    wins: results.filter((r) => r.outcome === "W").length,
    expected: results.reduce((sum, r) => sum + winChance(model, r.gap), 0),
  };
}

/** How wide each calibration band is, in percentage points of Win Chance. */
export const CALIBRATION_BAND = 10;

/** The Matches given a Win Chance in one band, and how many we won. */
export interface CalibrationBand {
  /** Inclusive lower bound, 0 to 100. */
  from: number;
  /** Exclusive upper bound, except the top band, which includes 100. */
  to: number;
  played: number;
  wins: number;
}

/** Every band with a Match in it, lowest chance first. */
export function calibration(
  model: WinChanceModel,
  results: readonly RatedResult[],
): CalibrationBand[] {
  const bands = new Map<number, CalibrationBand>();
  for (const r of results) {
    const percent = winChance(model, r.gap) * 100;
    const from = Math.min(
      100 - CALIBRATION_BAND,
      Math.floor(percent / CALIBRATION_BAND) * CALIBRATION_BAND,
    );
    const band = bands.get(from) ?? {
      from,
      to: from + CALIBRATION_BAND,
      played: 0,
      wins: 0,
    };
    band.played += 1;
    if (r.outcome === "W") band.wins += 1;
    bands.set(from, band);
  }
  return [...bands.values()].sort((a, b) => a.from - b.from);
}

/** How wide each rating gap band is, in Skill Rating points. */
export const GAP_BAND = 100;

/** Gaps beyond this either way share an open-ended band ("Under −300", "+300 and over"). */
export const GAP_BAND_REACH = 300;

/** The Matches at one band of rating gap: how each ended, and the Wins the curve expected. */
export interface GapBand {
  /** Inclusive lower bound, or null for the open band below `-GAP_BAND_REACH`. */
  from: number | null;
  /** Exclusive upper bound, or null for the open band from `GAP_BAND_REACH`. */
  to: number | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** The sum of the Matches' Win Chances. */
  expectedWins: number;
}

/** Every band with a Match in it, biggest underdog first. */
export function gapBands(
  model: WinChanceModel,
  results: readonly RatedResult[],
): GapBand[] {
  const bands = new Map<number, GapBand>();
  for (const r of results) {
    const start = Math.min(
      GAP_BAND_REACH,
      Math.max(
        -GAP_BAND_REACH - GAP_BAND,
        Math.floor(r.gap / GAP_BAND) * GAP_BAND,
      ),
    );
    const band = bands.get(start) ?? {
      from: start < -GAP_BAND_REACH ? null : start,
      to: start >= GAP_BAND_REACH ? null : start + GAP_BAND,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      expectedWins: 0,
    };
    band.played += 1;
    if (r.outcome === "W") band.wins += 1;
    else if (r.outcome === "D") band.draws += 1;
    else band.losses += 1;
    band.expectedWins += winChance(model, r.gap);
    bands.set(start, band);
  }
  return [...bands.entries()].sort(([a], [b]) => a - b).map(([, band]) => band);
}

/** A band's gaps in words: "−100 to 0", "Under −300", "+300 and over". */
export function gapBandLabel({
  from,
  to,
}: Pick<GapBand, "from" | "to">): string {
  if (from === null) return `Under ${formatSigned(to ?? 0)}`;
  if (to === null) return `${formatSigned(from)} and over`;
  return `${formatSigned(from)} to ${formatSigned(to)}`;
}

/** The rated Matches among these, as the curve reads them; unrated ones are left out. */
export function ratedResults(
  matches: readonly { skillRatings: MatchSkillRatings; outcome: Outcome }[],
): RatedResult[] {
  return matches.flatMap(({ skillRatings, outcome }) => {
    const gap = ratingGap(skillRatings);
    return gap === null ? [] : [{ gap, outcome }];
  });
}

/** One Match's Win Chance before kick-off, and whether its result went against it. */
export interface MatchWinChance {
  /** 0 to 1. */
  chance: number;
  source: WinChanceModel["source"];
  expectation: Expectation | null;
}

/** Null for a Match without both Skill Ratings. */
export function matchWinChance(
  model: WinChanceModel,
  match: { skillRatings: MatchSkillRatings; outcome: Outcome },
): MatchWinChance | null {
  const gap = ratingGap(match.skillRatings);
  if (gap === null) return null;
  const chance = winChance(model, gap);
  return {
    chance,
    source: model.source,
    expectation: expectation(chance, match.outcome),
  };
}

/** A Win Chance (0 to 1) as a whole percentage: "62%". */
export function formatWinChance(chance: number): string {
  return formatPercentage(chance * 100);
}
