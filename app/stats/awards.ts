/**
 * Season Review Awards (CLUBS-45): each Award goes to one Squad Member by a
 * fixed rule over their Appearances in the Season, never by the model, which
 * only writes the citation. Pure, so every rule and tie-break is unit tested.
 *
 * Every tie-break ends with the name (alphabetical), then the player ID, so
 * the same Appearances always give the same winner. An Award nobody
 * qualifies for (no goals, no assists, too few Appearances) is left out.
 */
import { formatCount, formatDecimal } from "~/lib/number-format";

import { average, FORM_WINDOW } from "./formulas";
import { splitRecent } from "./recent-change";
import type { SquadAppearance } from "./squad";
import { groupBy, summariseAppearances } from "./summaries";

export const AWARD_IDS = [
  "player-of-the-season",
  "golden-boot",
  "playmaker",
  "most-improved",
  "ever-present",
  "hot-streak",
] as const;

export type AwardId = (typeof AWARD_IDS)[number];

/** How each Award is named, in the order the Season Review shows them. */
export const AWARD_TITLES: Record<AwardId, string> = {
  "player-of-the-season": "Player of the Season",
  "golden-boot": "Golden Boot",
  playmaker: "Playmaker",
  "most-improved": "Most Improved",
  "ever-present": "Ever-present",
  "hot-streak": "Hot Streak",
};

/**
 * Player of the Season needs Appearances in at least this share of the
 * Season's Matches (and never fewer than `MIN_RATED_APPEARANCES`), so one
 * great cameo can't win it.
 */
export const RATED_SHARE_OF_MATCHES = 0.25;
export const MIN_RATED_APPEARANCES = 3;

/** Most Improved compares the first half of a Squad Member's Appearances with the second; each half needs this many. */
export const MIN_IMPROVED_HALF = 3;

/** The smallest rise in average rating that counts as Most Improved. */
export const MIN_IMPROVEMENT = 0.25;

/** One Award: who won it and the numbers behind it. */
export interface Award {
  id: AwardId;
  title: string;
  playerId: string;
  name: string;
  /** The headline figure: "12", "7.8". */
  value: string;
  /** What the figure counts: "goals", "average rating". */
  unit: string;
  /** The supporting facts: "in 14 Appearances · 3 MOTM". */
  detail: string;
}

/** The Appearances one Award rule reads: a Squad Member's, oldest first. */
interface Candidate {
  playerId: string;
  name: string;
  appearances: SquadAppearance[];
}

/**
 * Every Award with a winner, in `AWARD_IDS` order. `appearances` are Our
 * Club's in the Season, oldest first; `matchCount` is the Season's Matches.
 */
export function seasonAwards(
  appearances: readonly SquadAppearance[],
  matchCount: number,
): Award[] {
  const candidates = [...groupBy(appearances, (a) => a.playerId)].map(
    ([playerId, apps]): Candidate => ({
      playerId,
      name: apps.at(-1)?.name ?? playerId,
      appearances: apps,
    }),
  );
  const rules: Record<AwardId, (c: Candidate[]) => Award | null> = {
    "player-of-the-season": (c) => playerOfTheSeason(c, matchCount),
    "golden-boot": goldenBoot,
    playmaker,
    "most-improved": mostImproved,
    "ever-present": everPresent,
    "hot-streak": hotStreak,
  };
  return AWARD_IDS.flatMap((id) => {
    const award = rules[id](candidates);
    return award ? [award] : [];
  });
}

/** The fewest Appearances Player of the Season needs in a Season of `matchCount` Matches. */
export function ratedQualifier(matchCount: number): number {
  return Math.max(
    MIN_RATED_APPEARANCES,
    Math.ceil(matchCount * RATED_SHARE_OF_MATCHES),
  );
}

/**
 * Highest average rating among Squad Members with `ratedQualifier`
 * Appearances. Ties (to two decimals): more Man of the Match awards, then
 * more Appearances.
 */
function playerOfTheSeason(
  candidates: Candidate[],
  matchCount: number,
): Award | null {
  const rows = candidates
    .filter((c) => c.appearances.length >= ratedQualifier(matchCount))
    .flatMap((c) => {
      const totals = summariseAppearances(c.appearances);
      return totals.averageRating === null
        ? []
        : [{ ...c, totals, rating: totals.averageRating }];
    });
  const winner = best(
    rows,
    (a, b) =>
      round2(b.rating) - round2(a.rating) ||
      b.totals.manOfTheMatch - a.totals.manOfTheMatch ||
      b.totals.appearances - a.totals.appearances,
  );
  return (
    winner &&
    award("player-of-the-season", winner, {
      value: formatDecimal(winner.rating),
      unit: "average rating",
      detail: [
        appearancesText(winner.totals.appearances),
        `${winner.totals.manOfTheMatch} MOTM`,
      ].join(" · "),
    })
  );
}

/** Most goals (at least one). Ties: fewer Appearances, then more assists. */
function goldenBoot(candidates: Candidate[]): Award | null {
  const rows = withTotals(candidates).filter((c) => c.totals.goals > 0);
  const winner = best(
    rows,
    (a, b) =>
      b.totals.goals - a.totals.goals ||
      a.totals.appearances - b.totals.appearances ||
      b.totals.assists - a.totals.assists,
  );
  return (
    winner &&
    award("golden-boot", winner, {
      value: String(winner.totals.goals),
      unit: winner.totals.goals === 1 ? "goal" : "goals",
      detail: appearancesText(winner.totals.appearances),
    })
  );
}

/** Most assists (at least one). Ties: fewer Appearances, then more goals. */
function playmaker(candidates: Candidate[]): Award | null {
  const rows = withTotals(candidates).filter((c) => c.totals.assists > 0);
  const winner = best(
    rows,
    (a, b) =>
      b.totals.assists - a.totals.assists ||
      a.totals.appearances - b.totals.appearances ||
      b.totals.goals - a.totals.goals,
  );
  return (
    winner &&
    award("playmaker", winner, {
      value: String(winner.totals.assists),
      unit: winner.totals.assists === 1 ? "assist" : "assists",
      detail: appearancesText(winner.totals.appearances),
    })
  );
}

/**
 * The biggest rise in average rating from the first half of a Squad
 * Member's Season (their earlier Appearances) to the second, the same
 * recent-against-before split as recent changes (CLUBS-37). Each half needs
 * `MIN_IMPROVED_HALF` rated Appearances and the rise `MIN_IMPROVEMENT`.
 * Ties (to two decimals): more Appearances.
 */
function mostImproved(candidates: Candidate[]): Award | null {
  const rows = candidates.flatMap((c) => {
    const rated = c.appearances.filter((a) => a.rating !== null);
    const { recent, baseline } = splitRecent(
      rated,
      Math.floor(rated.length / 2),
    );
    if (
      baseline.length < MIN_IMPROVED_HALF ||
      recent.length < MIN_IMPROVED_HALF
    )
      return [];
    const start = average(baseline.map((a) => a.rating));
    const end = average(recent.map((a) => a.rating));
    if (start === null || end === null || end - start < MIN_IMPROVEMENT)
      return [];
    return [{ ...c, start, end, rise: end - start }];
  });
  const winner = best(
    rows,
    (a, b) =>
      round2(b.rise) - round2(a.rise) ||
      b.appearances.length - a.appearances.length,
  );
  return (
    winner &&
    award("most-improved", winner, {
      value: `+${formatDecimal(winner.rise)}`,
      unit: "average rating",
      detail: `${formatDecimal(winner.start)} early in the Season, ${formatDecimal(winner.end)} by the end`,
    })
  );
}

/** Most Appearances. Ties: more minutes, then the higher average rating. */
function everPresent(candidates: Candidate[]): Award | null {
  const winner = best(
    withTotals(candidates),
    (a, b) =>
      b.totals.appearances - a.totals.appearances ||
      b.totals.minutes - a.totals.minutes ||
      (b.totals.averageRating ?? -1) - (a.totals.averageRating ?? -1),
  );
  return (
    winner &&
    award("ever-present", winner, {
      value: String(winner.totals.appearances),
      unit: winner.totals.appearances === 1 ? "Appearance" : "Appearances",
      detail: `${winner.totals.minutes.toLocaleString("en-GB")} minutes`,
    })
  );
}

/**
 * The best average rating over `FORM_WINDOW` (5) Appearances in a row, the
 * window Hot form uses (CLUBS-40). Ties (to two decimals): more goals in
 * the run, then the earlier run.
 */
function hotStreak(candidates: Candidate[]): Award | null {
  const rows = candidates.flatMap((c) => {
    const run = bestRun(c.appearances);
    return run ? [{ ...c, ...run }] : [];
  });
  const winner = best(
    rows,
    (a, b) =>
      round2(b.rating) - round2(a.rating) ||
      b.goals - a.goals ||
      a.endedAt.getTime() - b.endedAt.getTime(),
  );
  return (
    winner &&
    award("hot-streak", winner, {
      value: formatDecimal(winner.rating),
      unit: `average rating over ${FORM_WINDOW} Appearances in a row`,
      detail: `${formatCount(winner.goals, "goal", "goals")} in the run`,
    })
  );
}

interface Run {
  rating: number;
  goals: number;
  endedAt: Date;
}

/** The best `FORM_WINDOW`-Appearance run by average rating; the earliest wins a tie. */
export function bestRun(appearances: readonly SquadAppearance[]): Run | null {
  let top: Run | null = null;
  for (let end = FORM_WINDOW; end <= appearances.length; end++) {
    const window = appearances.slice(end - FORM_WINDOW, end);
    const rating = average(window.map((a) => a.rating));
    if (rating === null) continue;
    if (top === null || round2(rating) > round2(top.rating)) {
      top = {
        rating,
        goals: window.reduce((n, a) => n + a.goals, 0),
        endedAt: window[FORM_WINDOW - 1].playedAt,
      };
    }
  }
  return top;
}

function withTotals(candidates: Candidate[]) {
  return candidates.map((c) => ({
    ...c,
    totals: summariseAppearances(c.appearances),
  }));
}

/** The first row by `compare`, then by name and player ID; null when there are none. */
function best<T extends Pick<Candidate, "name" | "playerId">>(
  rows: readonly T[],
  compare: (a: T, b: T) => number,
): T | null {
  const [first] = [...rows].sort(
    (a, b) =>
      compare(a, b) ||
      a.name.localeCompare(b.name) ||
      a.playerId.localeCompare(b.playerId),
  );
  return first ?? null;
}

function award(
  id: AwardId,
  { playerId, name }: Pick<Candidate, "playerId" | "name">,
  figures: Pick<Award, "value" | "unit" | "detail">,
): Award {
  return { id, title: AWARD_TITLES[id], playerId, name, ...figures };
}

function appearancesText(count: number): string {
  return `in ${formatCount(count, "Appearance", "Appearances")}`;
}

/** Ratings compare as shown, to two decimals, so float noise never decides an Award. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
