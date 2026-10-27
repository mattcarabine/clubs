/**
 * The club leaders the Milestones page opens with (CLUBS-51): who leads Our
 * Club in each career stat, and the next two. Pure; `club-leaders-query.ts`
 * feeds it from EA's career totals (the same numbers landmarks are read
 * from, so a "100th goal" and the Goals leader agree) and the recorded
 * Perfect ratings.
 */
import { formatDecimal } from "~/lib/number-format";

import type { EaCareerTotals } from "./ea-totals";

export type LeaderStat =
  | "goals"
  | "assists"
  | "motm"
  | "appearances"
  | "average-rating"
  | "perfect-ratings";

/** One Squad Member's career numbers, as the leaders read them. */
export interface LeaderCandidate {
  playerId: string;
  name: string;
  career: Pick<
    EaCareerTotals,
    "gamesPlayed" | "goals" | "assists" | "manOfTheMatch" | "averageRating"
  > | null;
  /** Recorded Appearances rated `PERFECT_RATING` or more. */
  perfectRatings: number;
}

export interface Leader {
  playerId: string;
  name: string;
  value: number;
  /** The value as shown: "98", "7.9". */
  figure: string;
}

export interface LeaderBoard {
  stat: LeaderStat;
  /** "Goals", "Perfect ratings". */
  label: string;
  /** The leader first, then the next two; ties share no place and go by name. */
  leaders: Leader[];
}

/** How many Squad Members each board names: the leader and the next two. */
export const LEADERS_SHOWN = 3;
/** EA career games a Squad Member needs before their average rating counts. */
export const MIN_RATING_GAMES = 10;

interface StatDefinition {
  label: string;
  value(c: LeaderCandidate): number | null;
  figure(value: number): string;
}

const STATS: Readonly<Record<LeaderStat, StatDefinition>> = {
  goals: {
    label: "Goals",
    value: (c) => c.career?.goals ?? null,
    figure: String,
  },
  assists: {
    label: "Assists",
    value: (c) => c.career?.assists ?? null,
    figure: String,
  },
  "average-rating": {
    label: "Average rating",
    value: (c) =>
      (c.career?.gamesPlayed ?? 0) >= MIN_RATING_GAMES
        ? (c.career?.averageRating ?? null)
        : null,
    figure: (value) => formatDecimal(value),
  },
  motm: {
    label: "Man of the Match",
    value: (c) => c.career?.manOfTheMatch ?? null,
    figure: String,
  },
  "perfect-ratings": {
    label: "Perfect ratings",
    value: (c) => c.perfectRatings,
    figure: String,
  },
  appearances: {
    label: "Appearances",
    value: (c) => c.career?.gamesPlayed ?? null,
    figure: String,
  },
};

/**
 * One board per stat, in display order. A Squad Member with nothing in a
 * stat (no value, or zero) is left off its board, and a board nobody is on
 * is dropped.
 */
export function clubLeaders(
  candidates: readonly LeaderCandidate[],
): LeaderBoard[] {
  return (Object.keys(STATS) as LeaderStat[]).flatMap((stat) => {
    const { label, value, figure } = STATS[stat];
    const leaders = candidates
      .flatMap(({ playerId, name, ...rest }) => {
        const v = value({ playerId, name, ...rest });
        return v !== null && v > 0
          ? [{ playerId, name, value: v, figure: figure(v) }]
          : [];
      })
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
      .slice(0, LEADERS_SHOWN);
    return leaders.length ? [{ stat, label, leaders }] : [];
  });
}
