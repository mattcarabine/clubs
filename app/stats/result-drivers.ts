/**
 * Result drivers (CLUBS-95): Analysis's "Why we win" and "Why we lose". The
 * Outcome Split's stats that differ most between Wins and Dropped Points,
 * sorted into what goes right in Wins and what goes wrong in Dropped
 * Points, each with the Squad Member whose own figure moves most the same
 * way. A pattern in the Matches so far, not proof: the page says so. Pure.
 */
import { isFormerSquadMember } from "~/roster";

import { ballLost, ballWon, eventCounts } from "./event-stats";
import { effectSize, type WeightedValue, weightedMean } from "./formulas";
import {
  type ClubMatchTotals,
  DETAIL_METRICS,
  LEVEL_EFFECT,
  MIN_SPLIT_MATCHES,
  type OutcomeSide,
  outcomeSide,
  PERFORMANCE_METRICS,
  type PerformanceMetric,
  SMALL_SAMPLE_MATCHES,
  type SplitMatch,
} from "./outcome-split";
import type { SquadAppearance } from "./squad";
import { groupBy } from "./summaries";

/** How many drivers each panel shows. */
export const TOP_DRIVERS = 3;

type Club = "ours" | "opponent";
const CLUBS: readonly Club[] = ["ours", "opponent"];

/**
 * The stats that can be a reason for a result, and whether more of one is
 * good for the club doing it. Goals, saves and ratings are left out: they
 * are the result, or follow from it.
 */
export const DRIVER_STATS: Record<string, "higher" | "lower"> = {
  shots: "higher",
  conversion: "higher",
  pass: "higher",
  tackle: "higher",
  "red-cards": "lower",
  "shots-on-target": "higher",
  "through-balls": "higher",
  dribbles: "higher",
  interceptions: "higher",
  "ball-won": "higher",
  "ball-lost": "lower",
  fouls: "lower",
};

/** The Squad Member whose own figure moves most the way the team's does. */
export interface DriverPlayer {
  playerId: string;
  name: string;
  former: boolean;
  wins: string;
  dropped: string;
  smallSample: boolean;
}

/** One reason we win, or one reason we lose. */
export interface ResultDriver {
  /** "ours-ball-lost". */
  id: string;
  club: Club;
  /** The stat, for a tag: "Ball lost per 90". */
  label: string;
  /** "In draws and defeats we lose the ball 3.2 more times per 90 than in wins". */
  text: string;
  wins: string;
  dropped: string;
  /** Either side has fewer than `SMALL_SAMPLE_MATCHES` Matches. */
  smallSample: boolean;
  /** Only for Our Club's own stats, and only when someone stands out. */
  player: DriverPlayer | null;
}

export interface ResultDrivers {
  /** What we do more of, or the Opponent gets wrong, in Wins; biggest first. */
  win: ResultDriver[];
  /** What we get wrong, or the Opponent does more of, in Dropped Points; biggest first. */
  lose: ResultDriver[];
}

/** One stat's samples in Wins and Dropped Points, read off. */
interface Split {
  wins: number;
  dropped: number;
  text: Record<OutcomeSide, string>;
  /** Cohen's d of Dropped Points against Wins: positive when higher in Dropped Points. */
  effect: number;
  smallSample: boolean;
}

/** Null unless both sides have `MIN_SPLIT_MATCHES` and show a different figure. */
function splitOf(
  metric: PerformanceMetric,
  samples: Record<OutcomeSide, WeightedValue[]>,
): Split | null {
  const wins = weightedMean(samples.wins);
  const dropped = weightedMean(samples.dropped);
  const effect = effectSize(samples.dropped, samples.wins);
  const fewest = Math.min(samples.wins.length, samples.dropped.length);
  if (
    wins === null ||
    dropped === null ||
    effect === null ||
    fewest < MIN_SPLIT_MATCHES
  ) {
    return null;
  }
  const text = { wins: metric.format(wins), dropped: metric.format(dropped) };
  if (text.wins === text.dropped) return null;
  return {
    wins,
    dropped,
    text,
    effect,
    smallSample: fewest < SMALL_SAMPLE_MATCHES,
  };
}

const emptySamples = (): Record<OutcomeSide, WeightedValue[]> => ({
  wins: [],
  dropped: [],
});

/** One Appearance as a club's totals, so a metric reads a player as it reads a team. */
function appearanceTotals(a: SquadAppearance): ClubMatchTotals {
  const counts = eventCounts(a);
  return {
    goals: a.goals,
    shots: a.shots,
    passesMade: a.passesMade,
    passAttempts: a.passAttempts,
    tacklesMade: a.tacklesMade,
    tackleAttempts: a.tackleAttempts,
    saves: a.saves,
    redCards: a.redCards,
    ratingSum: a.rating ?? 0,
    ratings: a.rating === null ? 0 : 1,
    detail: counts && {
      shotsOnTarget: counts.shotsOnTarget,
      throughBalls: counts.throughBalls,
      dribbles: counts.dribbles,
      interceptions: counts.interceptions,
      ballWon: ballWon(counts),
      ballLost: ballLost(counts),
      fouls: counts.foulsConceded,
    },
  };
}

/**
 * The Squad Member whose own split of `metric` is biggest in the team's
 * direction (`sign` of the team's effect), or null when no one's is clear.
 */
function standoutPlayer(
  metric: PerformanceMetric,
  sign: number,
  byPlayer: ReadonlyMap<string, readonly SquadAppearance[]>,
): DriverPlayer | null {
  let best: (DriverPlayer & { strength: number }) | null = null;
  for (const [playerId, own] of byPlayer) {
    const samples = emptySamples();
    for (const a of own) {
      const sample = metric.sample(appearanceTotals(a), a.secondsPlayed);
      if (sample) samples[outcomeSide(a.outcome)].push(sample);
    }
    const split = splitOf(metric, samples);
    if (!split || Math.sign(split.effect) !== sign) continue;
    const strength = Math.abs(split.effect);
    if (strength < LEVEL_EFFECT || (best && strength <= best.strength)) {
      continue;
    }
    best = {
      playerId,
      name: own[own.length - 1].name,
      former: isFormerSquadMember(playerId),
      ...split.text,
      smallSample: split.smallSample,
      strength,
    };
  }
  if (!best) return null;
  const { strength: _, ...player } = best;
  return player;
}

/**
 * Why we win and why we lose over these Matches. `appearances` are Our
 * Club's counted Appearances in them, read with their Match Events.
 */
export function resultDrivers(
  matches: readonly SplitMatch[],
  appearances: readonly SquadAppearance[],
): ResultDrivers {
  const byPlayer = groupBy(appearances, (a) => a.playerId);
  const ranked: {
    side: keyof ResultDrivers;
    strength: number;
    driver: ResultDriver;
  }[] = [];
  for (const metric of [...PERFORMANCE_METRICS, ...DETAIL_METRICS]) {
    const better = DRIVER_STATS[metric.id];
    if (!better) continue;
    for (const club of CLUBS) {
      const samples = emptySamples();
      for (const m of matches) {
        const totals = m[club];
        const sample = totals && metric.sample(totals, m.secondsPlayed);
        if (sample) samples[outcomeSide(m.outcome)].push(sample);
      }
      const split = splitOf(metric, samples);
      if (!split || Math.abs(split.effect) < LEVEL_EFFECT) continue;
      // More of it is good for us when we do a good thing, or they do a bad one.
      const goodForUs = (club === "ours") === (better === "higher");
      const higherInWins = split.wins > split.dropped;
      // A good thing we do less of when we win explains neither result.
      if (goodForUs !== higherInWins) continue;
      const side = goodForUs ? "win" : "lose";
      ranked.push({
        side,
        strength: Math.abs(split.effect),
        driver: {
          id: `${club}-${metric.id}`,
          club,
          label: metric.label,
          text:
            side === "win"
              ? `In wins ${metric.describe(club, split.wins - split.dropped)} than in draws and defeats`
              : `In draws and defeats ${metric.describe(club, split.dropped - split.wins)} than in wins`,
          ...split.text,
          smallSample: split.smallSample,
          player:
            club === "ours"
              ? standoutPlayer(metric, Math.sign(split.effect), byPlayer)
              : null,
        },
      });
    }
  }
  const top = (side: keyof ResultDrivers) =>
    ranked
      .filter((r) => r.side === side)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, TOP_DRIVERS)
      .map((r) => r.driver);
  return { win: top("win"), lose: top("lose") };
}
