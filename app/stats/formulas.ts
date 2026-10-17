/**
 * Stat formulas: pure functions over plain numbers. Every page computes these
 * values through this module, never inline (CLAUDE.md "Conventions").
 *
 * A stat that cannot be computed (no minutes, no attempts, no ratings) is
 * `null`, never 0 or NaN, so tables can sort it to the bottom and render "–".
 */
import type { Outcome } from "~/lib/domain";

/** How many Appearances Form averages over. */
export const FORM_WINDOW = 5;

/** The default window for rolling-average chart lines. */
export const ROLLING_WINDOW = 5;

/** League points for each Outcome. */
export const POINTS: Record<Outcome, number> = { W: 3, D: 1, L: 0 };

/** `part / whole`, or null when `whole` is 0. */
export function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

/** `part / whole` as a percentage (0 to 100), or null when `whole` is 0. */
export function percentage(part: number, whole: number): number | null {
  const r = ratio(part, whole);
  return r === null ? null : r * 100;
}

/** Pass completion %, or null with no pass attempts. */
export function passPercentage(made: number, attempts: number): number | null {
  return percentage(made, attempts);
}

/** Tackle success %, or null with no tackle attempts. */
export function tacklePercentage(
  made: number,
  attempts: number,
): number | null {
  return percentage(made, attempts);
}

/** A total scaled to 90 minutes played, or null with no time played. */
export function per90(total: number, secondsPlayed: number): number | null {
  return secondsPlayed <= 0 ? null : (total * 90 * 60) / secondsPlayed;
}

/** The mean of the non-null values, or null when there are none. */
export function average(values: readonly (number | null)[]): number | null {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (value === null) continue;
    sum += value;
    count += 1;
  }
  return count === 0 ? null : sum / count;
}

/**
 * Form: the average rating over a Squad Member's last 5 Appearances.
 * `ratings` is oldest first; unrated Appearances still use up a slot.
 */
export function form(ratings: readonly (number | null)[]): number | null {
  return average(ratings.slice(-FORM_WINDOW));
}

/**
 * The rolling average at each point of a series (oldest first): the mean of
 * that value and up to `window - 1` before it, skipping nulls. Early points
 * average what is available, so the line starts with the first value.
 */
export function rollingAverage(
  values: readonly (number | null)[],
  window = ROLLING_WINDOW,
): (number | null)[] {
  if (window < 1) throw new RangeError("window must be at least 1");
  return values.map((_, i) =>
    average(values.slice(Math.max(0, i - window + 1), i + 1)),
  );
}

/** W/D/L from the score, for the club that scored `goalsFor`. */
export function outcomeFromScore(
  goalsFor: number,
  goalsAgainst: number,
): Outcome {
  if (goalsFor > goalsAgainst) return "W";
  if (goalsFor < goalsAgainst) return "L";
  return "D";
}

/** The same Match from the other club's point of view. */
export function oppositeOutcome(outcome: Outcome): Outcome {
  if (outcome === "W") return "L";
  if (outcome === "L") return "W";
  return "D";
}

/** League points for a run of Outcomes. */
export function points(outcomes: readonly Outcome[]): number {
  return outcomes.reduce((sum, outcome) => sum + POINTS[outcome], 0);
}

/** Running points total after each Outcome (oldest first), for charts. */
export function cumulativePoints(outcomes: readonly Outcome[]): number[] {
  let total = 0;
  return outcomes.map((outcome) => {
    total += POINTS[outcome];
    return total;
  });
}

/** Win % of a run of Outcomes, or null with no Matches. */
export function winPercentage(outcomes: readonly Outcome[]): number | null {
  return percentage(outcomes.filter((o) => o === "W").length, outcomes.length);
}

/**
 * The current streak: the latest Outcome and how many Matches in a row ended
 * that way. `outcomes` is oldest first; null with no Matches.
 */
export function currentStreak(
  outcomes: readonly Outcome[],
): { outcome: Outcome; length: number } | null {
  const latest = outcomes.at(-1);
  if (!latest) return null;
  let length = 0;
  for (let i = outcomes.length - 1; i >= 0 && outcomes[i] === latest; i--) {
    length += 1;
  }
  return { outcome: latest, length };
}

/** Minutes played, rounded down, from EA's seconds. */
export function minutesPlayed(secondsPlayed: number): number {
  return Math.floor(secondsPlayed / 60);
}

/** The window for the rolling Win % line on the Analysis page. */
export const ROLLING_WIN_WINDOW = 10;

/**
 * Win % over the last `window` Matches at each point of a run of Outcomes
 * (oldest first). Early points cover what is available, so the line starts
 * at the first Match.
 */
export function rollingWinPercentage(
  outcomes: readonly Outcome[],
  window = ROLLING_WIN_WINDOW,
): number[] {
  return rollingAverage(
    outcomes.map((o) => (o === "W" ? 100 : 0)),
    window,
  ).map((value) => value ?? 0);
}

/** One per-Match value and how much it counts, e.g. a per-90 weighted by how long the Match ran. */
export interface WeightedValue {
  value: number;
  weight: number;
}

/**
 * The weighted mean, or null with no weight. Per-90s weighted by seconds
 * played average to the total scaled by the total time, so a short DNF
 * counts only for as long as it ran.
 */
export function weightedMean(values: readonly WeightedValue[]): number | null {
  let sum = 0;
  let weight = 0;
  for (const v of values) {
    sum += v.value * v.weight;
    weight += v.weight;
  }
  return weight > 0 ? sum / weight : null;
}

/** The weighted (population) variance about the weighted mean, or null with no weight. */
export function weightedVariance(
  values: readonly WeightedValue[],
): number | null {
  const mean = weightedMean(values);
  if (mean === null) return null;
  return weightedMean(
    values.map((v) => ({ value: (v.value - mean) ** 2, weight: v.weight })),
  );
}

/**
 * Effect size (Cohen's d): how far apart two samples' weighted means are, in
 * units of their pooled spread, signed `a - b`. Each side's variance is
 * pooled by how many values it has. Null when either side has no weight.
 * When neither side varies at all, any difference is infinite (and none is
 * 0), so it still ranks first.
 */
export function effectSize(
  a: readonly WeightedValue[],
  b: readonly WeightedValue[],
): number | null {
  const meanA = weightedMean(a);
  const meanB = weightedMean(b);
  const varA = weightedVariance(a);
  const varB = weightedVariance(b);
  if (meanA === null || meanB === null || varA === null || varB === null) {
    return null;
  }
  const diff = meanA - meanB;
  const spread = Math.sqrt(
    (a.length * varA + b.length * varB) / (a.length + b.length),
  );
  if (spread === 0) return diff === 0 ? 0 : Math.sign(diff) * Infinity;
  return diff / spread;
}

/**
 * How many (weighted) standard deviations `value` lies from a sample's
 * weighted mean, signed `value - mean`: e.g. one Match's shots per 90 against
 * every Win. Null with no weight. Like `effectSize`, any difference from a
 * sample that never varies is infinite, and none is 0.
 */
export function standardScore(
  value: number,
  sample: readonly WeightedValue[],
): number | null {
  const mean = weightedMean(sample);
  const variance = weightedVariance(sample);
  if (mean === null || variance === null) return null;
  const diff = value - mean;
  if (variance === 0) return diff === 0 ? 0 : Math.sign(diff) * Infinity;
  return diff / Math.sqrt(variance);
}

/**
 * The effect size of a gap between two Win % (Cohen's h, signed `a - b`), so
 * a Win-rate gap ranks on the same scale as `effectSize`. Takes 0 to 100.
 */
export function winRateEffectSize(a: number, b: number): number {
  const arcsine = (p: number) => 2 * Math.asin(Math.sqrt(p / 100));
  return arcsine(a) - arcsine(b);
}
