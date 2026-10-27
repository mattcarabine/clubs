/**
 * The club leaders the Milestones page opens with (CLUBS-51): who leads Our
 * Club in each stat, and the next two. Pure; `club-leaders-query.ts` feeds
 * it from EA's career totals (the same numbers landmarks are read from, so a
 * "100th goal" and the Goals leader agree) and Our Club's counted recorded
 * Appearances. Two groups: the honours, and graft and discipline (tackles,
 * passes, shots, red cards). EA sends no yellow cards.
 */
import { formatDecimal } from "~/lib/number-format";

import type { EaCareerTotals } from "./ea-totals";

export type LeaderStat =
  | "goals"
  | "assists"
  | "motm"
  | "appearances"
  | "average-rating"
  | "perfect-ratings"
  | "tackles"
  | "passes"
  | "shots"
  | "red-cards";

/** The honours lead the page; graft and discipline follow. */
export type LeaderGroup = "honours" | "graft";

/** Totals from Our Club's counted recorded Appearances. */
export interface RecordedTotals {
  /** Appearances rated `PERFECT_RATING` or more. */
  perfectRatings: number;
  tackles: number;
  passes: number;
  shots: number;
  redCards: number;
}

/** One Squad Member's career numbers, as the leaders read them. */
export interface LeaderCandidate {
  playerId: string;
  name: string;
  career: Pick<
    EaCareerTotals,
    "gamesPlayed" | "goals" | "assists" | "manOfTheMatch" | "averageRating"
  > | null;
  recorded: RecordedTotals | null;
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
  group: LeaderGroup;
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
  group: LeaderGroup;
  label: string;
  value(c: LeaderCandidate): number | null;
  figure(value: number): string;
}

const STATS: Readonly<Record<LeaderStat, StatDefinition>> = {
  goals: {
    group: "honours",
    label: "Goals",
    value: (c) => c.career?.goals ?? null,
    figure: String,
  },
  assists: {
    group: "honours",
    label: "Assists",
    value: (c) => c.career?.assists ?? null,
    figure: String,
  },
  "average-rating": {
    group: "honours",
    label: "Average rating",
    value: (c) =>
      (c.career?.gamesPlayed ?? 0) >= MIN_RATING_GAMES
        ? (c.career?.averageRating ?? null)
        : null,
    figure: (value) => formatDecimal(value),
  },
  motm: {
    group: "honours",
    label: "Man of the Match",
    value: (c) => c.career?.manOfTheMatch ?? null,
    figure: String,
  },
  "perfect-ratings": {
    group: "honours",
    label: "Perfect ratings",
    value: (c) => c.recorded?.perfectRatings ?? null,
    figure: String,
  },
  appearances: {
    group: "honours",
    label: "Appearances",
    value: (c) => c.career?.gamesPlayed ?? null,
    figure: String,
  },
  tackles: {
    group: "graft",
    label: "Tackles",
    value: (c) => c.recorded?.tackles ?? null,
    figure: String,
  },
  passes: {
    group: "graft",
    label: "Passes",
    value: (c) => c.recorded?.passes ?? null,
    figure: String,
  },
  shots: {
    group: "graft",
    label: "Shots",
    value: (c) => c.recorded?.shots ?? null,
    figure: String,
  },
  "red-cards": {
    group: "graft",
    label: "Red cards",
    value: (c) => c.recorded?.redCards ?? null,
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
    const { group, label, value, figure } = STATS[stat];
    const leaders = candidates
      .flatMap(({ playerId, name, ...rest }) => {
        const v = value({ playerId, name, ...rest });
        return v !== null && v > 0
          ? [{ playerId, name, value: v, figure: figure(v) }]
          : [];
      })
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
      .slice(0, LEADERS_SHOWN);
    return leaders.length ? [{ stat, group, label, leaders }] : [];
  });
}
