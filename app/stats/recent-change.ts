/**
 * Recent changes (CLUBS-37): how a Squad Member's last `RECENT_WINDOW`
 * Appearances compare with every Appearance before them (the baseline),
 * within whatever filter and Position Groups picked the Appearances.
 *
 * Every stat ranks on one scale, like the Analysis findings
 * (`outcome-split.ts`): Cohen's d for averages, per 90 over the minutes
 * played; Cohen's h for the rates of Appearances (Win %, MOTM %). Only
 * changes with enough Appearances on both sides and an effect of at least
 * `MIN_RECENT_EFFECT` are reported.
 *
 * Hot and Cold form (CLUBS-40) use the same split: the average rating over
 * the last `FORM_WINDOW` Appearances against every one before.
 *
 * Pure and client-safe, shared by the profile, the Squad table, Compare and
 * Matchday.
 */
import type { FormStatus, Outcome } from "~/lib/domain";
import {
  formatCount,
  formatDecimal,
  formatPercentage,
} from "~/lib/number-format";
import { capitalise } from "~/lib/text";

import {
  average,
  effectSize,
  FORM_WINDOW,
  per90,
  percentage,
  ROLLING_WINDOW,
  rollingAverage,
  type WeightedValue,
  weightedMean,
  winRateEffectSize,
} from "./formulas";
import type { AppearanceStats } from "./summaries";

/** How many of the latest Appearances make up the recent window. */
export const RECENT_WINDOW = 10;

/** Each side needs this many Appearances before any change is reported. */
export const MIN_RECENT_APPEARANCES = 5;

/** The smallest effect size (|d| or |h|) worth reporting: a large effect. */
export const MIN_RECENT_EFFECT = 0.8;

/** Changes over fewer baseline Appearances than this are marked "Small sample". */
export const SMALL_BASELINE_APPEARANCES = 10;

/** How many changes each direction shows at most. */
export const TOP_RECENT_CHANGES = 3;

/** How many Appearances a change's sparkline covers. */
export const RECENT_TREND_POINTS = 2 * RECENT_WINDOW;

/** One Appearance as recent changes read it, oldest first. */
export type RecentAppearance = AppearanceStats & { outcome: Outcome };

/**
 * The latest `window` items and everything before them. With `window` or
 * fewer items, all of them are recent and the baseline is empty.
 */
export function splitRecent<T>(
  items: readonly T[],
  window: number,
): { recent: T[]; baseline: T[] } {
  const cut = Math.max(0, items.length - window);
  return { recent: items.slice(cut), baseline: items.slice(0, cut) };
}

/** Up for an improvement, down for a drop-off: every stat here is better higher. */
export type ChangeDirection = "up" | "down";

/** One stat's clear change between the baseline and the recent window. */
export interface RecentChange {
  id: string;
  /** The stat's short name: "Pass %". */
  label: string;
  direction: ChangeDirection;
  /** "Kabeeble's pass % is up 20 points over the last 10 Appearances (90% vs 70%)". */
  text: string;
  /** "10 recent Appearances, 12 before". */
  counts: string;
  /** Fewer than `SMALL_BASELINE_APPEARANCES` baseline Appearances. */
  smallSample: boolean;
  /** The stat's rolling average over the last `RECENT_TREND_POINTS` Appearances, oldest first. */
  trend: number[];
}

export interface RecentChanges {
  /** Appearances in the recent window. */
  recentCount: number;
  /** Appearances before it. */
  baselineCount: number;
  /** Whether both sides have `MIN_RECENT_APPEARANCES`; otherwise no changes are reported. */
  ready: boolean;
  /** Biggest effect first, at most `TOP_RECENT_CHANGES`. */
  improving: RecentChange[];
  dropping: RecentChange[];
  /** The single biggest change either way, for the Squad table; null when there is none. */
  biggest: RecentChange | null;
}

interface RecentStat {
  id: string;
  label: string;
  /** Names it mid-sentence: "shots per 90". */
  noun: string;
  plural: boolean;
  /** Averages rank by Cohen's d; the rates of Appearances by Cohen's h. */
  scale: "d" | "h";
  /** One Appearance's value and weight, or null when it has none. */
  sample: (a: RecentAppearance) => WeightedValue | null;
  format: (value: number) => string;
  /** The size of a gap: "20 points", "1.40". */
  formatGap: (gap: number) => string;
}

function perNinety(
  id: string,
  noun: string,
  pick: (a: RecentAppearance) => number,
): RecentStat {
  return {
    id,
    label: capitalise(noun),
    noun,
    plural: true,
    scale: "d",
    sample: (a) => {
      const value = per90(pick(a), a.secondsPlayed);
      return value === null ? null : { value, weight: a.secondsPlayed };
    },
    format: (value) => formatDecimal(value, 2),
    formatGap: (gap) => formatDecimal(gap, 2),
  };
}

function successRate(
  id: string,
  label: string,
  made: (a: RecentAppearance) => number,
  attempts: (a: RecentAppearance) => number,
): RecentStat {
  return {
    id,
    label,
    noun: label.toLowerCase(),
    plural: false,
    scale: "d",
    sample: (a) => {
      const value = percentage(made(a), attempts(a));
      return value === null ? null : { value, weight: attempts(a) };
    },
    format: formatPercentage,
    formatGap: points,
  };
}

/** The share of Appearances where `happened`, as 100 or 0 each. */
function appearanceRate(
  id: string,
  label: string,
  noun: string,
  happened: (a: RecentAppearance) => boolean,
): RecentStat {
  return {
    id,
    label,
    noun,
    plural: false,
    scale: "h",
    sample: (a) => ({ value: happened(a) ? 100 : 0, weight: 1 }),
    format: formatPercentage,
    formatGap: points,
  };
}

/** Every stat compared, in the order ties are listed. */
export const RECENT_STATS: readonly RecentStat[] = [
  {
    id: "rating",
    label: "Rating",
    noun: "average rating",
    plural: false,
    scale: "d",
    sample: (a) => (a.rating === null ? null : { value: a.rating, weight: 1 }),
    format: (value) => formatDecimal(value),
    formatGap: (gap) => formatDecimal(gap),
  },
  perNinety("goals", "goals per 90", (a) => a.goals),
  perNinety("assists", "assists per 90", (a) => a.assists),
  perNinety("shots", "shots per 90", (a) => a.shots),
  perNinety("passes", "passes per 90", (a) => a.passesMade),
  perNinety("tackles", "tackles per 90", (a) => a.tacklesMade),
  successRate(
    "pass",
    "Pass %",
    (a) => a.passesMade,
    (a) => a.passAttempts,
  ),
  successRate(
    "tackle",
    "Tackle %",
    (a) => a.tacklesMade,
    (a) => a.tackleAttempts,
  ),
  successRate(
    "conversion",
    "Conversion",
    (a) => a.goals,
    (a) => a.shots,
  ),
  appearanceRate(
    "win",
    "Win %",
    "Win % when playing",
    (a) => a.outcome === "W",
  ),
  appearanceRate(
    "motm",
    "MOTM %",
    "Man of the Match rate",
    (a) => a.manOfTheMatch,
  ),
];

/**
 * A Squad Member's clear changes: their last `RECENT_WINDOW` Appearances
 * (oldest first, already filtered) against every one before, biggest effect
 * first in each direction. `name` is used in the copy, which is third person.
 */
export function recentChanges(
  appearances: readonly RecentAppearance[],
  name: string,
): RecentChanges {
  const { recent, baseline } = splitRecent(appearances, RECENT_WINDOW);
  const ready =
    recent.length >= MIN_RECENT_APPEARANCES &&
    baseline.length >= MIN_RECENT_APPEARANCES;
  const ranked = ready
    ? RECENT_STATS.flatMap((stat) => {
        const change = statChange(stat, appearances, recent, baseline, name);
        return change ? [change] : [];
      }).sort((a, b) => b.strength - a.strength)
    : [];
  const unranked = ({ strength: _, ...change }: RankedChange): RecentChange =>
    change;
  const top = (direction: ChangeDirection) =>
    ranked
      .filter((c) => c.direction === direction)
      .slice(0, TOP_RECENT_CHANGES)
      .map(unranked);
  return {
    recentCount: recent.length,
    baselineCount: baseline.length,
    ready,
    improving: top("up"),
    dropping: top("down"),
    biggest: ranked[0] ? unranked(ranked[0]) : null,
  };
}

interface RankedChange extends RecentChange {
  strength: number;
}

function statChange(
  stat: RecentStat,
  all: readonly RecentAppearance[],
  recentApps: readonly RecentAppearance[],
  baselineApps: readonly RecentAppearance[],
  name: string,
): RankedChange | null {
  const recentSamples = samples(stat, recentApps);
  const baselineSamples = samples(stat, baselineApps);
  if (
    recentSamples.length < MIN_RECENT_APPEARANCES ||
    baselineSamples.length < MIN_RECENT_APPEARANCES
  ) {
    return null;
  }
  const recent = weightedMean(recentSamples);
  const baseline = weightedMean(baselineSamples);
  if (recent === null || baseline === null) return null;
  const effect =
    stat.scale === "h"
      ? winRateEffectSize(recent, baseline)
      : effectSize(recentSamples, baselineSamples);
  const values = {
    recent: stat.format(recent),
    baseline: stat.format(baseline),
  };
  if (
    effect === null ||
    Math.abs(effect) < MIN_RECENT_EFFECT ||
    // A gap too small to show ("81% vs 81%") says nothing in words either.
    values.recent === values.baseline
  ) {
    return null;
  }
  const direction: ChangeDirection = recent > baseline ? "up" : "down";
  return {
    id: stat.id,
    label: stat.label,
    direction,
    text: `${possessive(name)} ${stat.noun} ${stat.plural ? "are" : "is"} ${direction} ${stat.formatGap(Math.abs(recent - baseline))} over the last ${formatCount(recentApps.length, "Appearance", "Appearances")} (${values.recent} vs ${values.baseline})`,
    counts: `${formatCount(recentApps.length, "recent Appearance", "recent Appearances")}, ${baselineApps.length} before`,
    smallSample: baselineApps.length < SMALL_BASELINE_APPEARANCES,
    trend: trend(stat, all),
    strength: Math.abs(effect),
  };
}

function samples(
  stat: RecentStat,
  apps: readonly RecentAppearance[],
): WeightedValue[] {
  return apps.flatMap((a) => {
    const sample = stat.sample(a);
    return sample ? [sample] : [];
  });
}

/** The stat's rolling `ROLLING_WINDOW`-Appearance average, over the last `RECENT_TREND_POINTS`. */
function trend(stat: RecentStat, apps: readonly RecentAppearance[]): number[] {
  const values = apps.map((a) => stat.sample(a)?.value ?? null);
  return rollingAverage(values, ROLLING_WINDOW)
    .slice(-RECENT_TREND_POINTS)
    .flatMap((v) => (v === null ? [] : [Math.round(v * 100) / 100]));
}

/** "20 points" for a gap between two percentages. */
function points(gap: number): string {
  return formatCount(Math.round(gap), "point", "points");
}

/** "Kabeeble's", "James's". */
function possessive(name: string): string {
  return `${name}'s`;
}

// ---------------------------------------------------------------------------
// Hot and Cold form (CLUBS-40)

/** How far the last `FORM_WINDOW` ratings must average above (Hot) or below (Cold) the usual. */
export const HOT_COLD_GAP = 0.5;

/** Hot or Cold needs this many Appearances before the last `FORM_WINDOW`. */
export const MIN_FORM_BASELINE = 10;

/** A Squad Member in Hot or Cold form, with the two averages behind it. */
export interface FormIndicator {
  status: FormStatus;
  /** Average rating over the last `FORM_WINDOW` Appearances. */
  recent: number;
  /** Average rating over every Appearance before them. */
  usual: number;
  /** "Last 5: 8.1 avg vs 7.3 usual". */
  text: string;
}

/**
 * Hot or Cold form over a Squad Member's Appearances (oldest first, already
 * filtered), or null: too few baseline Appearances, no ratings, or a gap
 * under `HOT_COLD_GAP`.
 */
export function formIndicator(
  appearances: readonly Pick<AppearanceStats, "rating">[],
): FormIndicator | null {
  const { recent, baseline } = splitRecent(appearances, FORM_WINDOW);
  if (baseline.length < MIN_FORM_BASELINE) return null;
  const recentAverage = average(recent.map((a) => a.rating));
  const usual = average(baseline.map((a) => a.rating));
  if (recentAverage === null || usual === null) return null;
  const status = formStatus(recentAverage - usual);
  if (status === null) return null;
  return {
    status,
    recent: recentAverage,
    usual,
    text: `Last ${recent.length}: ${formatDecimal(recentAverage)} avg vs ${formatDecimal(usual)} usual`,
  };
}

/** Floating-point slack, so a gap of exactly `HOT_COLD_GAP` counts. */
const EPSILON = 1e-9;

function formStatus(gap: number): FormStatus | null {
  if (gap >= HOT_COLD_GAP - EPSILON) return "hot";
  if (gap <= -HOT_COLD_GAP + EPSILON) return "cold";
  return null;
}
