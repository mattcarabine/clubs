/**
 * Ratings in the context of the team around them (CLUBS-66), pure and
 * client-safe. A rising tide lifts all boats: a Squad Member who rates well
 * on the nights everyone does is riding it, one who rates above the rest of
 * the line-up is lifting it.
 *
 * - Above team: a Squad Member's rating minus their teammates' average in the
 *   same Match, averaged over their Matches (the Squad table, Compare).
 * - Rating link: whether two Squad Members rise and fall together over their
 *   Shared Matches, straight up and with the rest of the line-up's night
 *   taken out (Compare).
 * - Consistency (CLUBS-74): a Squad Member's Floor, the rating they reach in
 *   4 of 5 Matches, and Spread, how far their ratings wander (Analysis,
 *   Compare, the profile).
 *
 * Only counted Appearances with a rating count (`isCountedAppearance`), so a
 * rage-quit 3.0 or our side of a Match we quit never moves either figure.
 */
import { isCountedAppearance, type QuitInput } from "./counted";
import {
  average,
  correlation,
  partialCorrelation,
  percentile,
  standardDeviation,
} from "./formulas";

/** What an Appearance needs to place its rating in its Match. */
export type RatedAppearance = QuitInput & {
  matchId: string;
  playerId: string;
  rating: number | null;
  secondsPlayed: number;
};

/** Each Match's counted ratings, by Squad Member. */
export type MatchRatings = ReadonlyMap<string, ReadonlyMap<string, number>>;

/** Two Squad Members' figures in one Match. */
type RatingPair = readonly [number, number];

/** An Appearance's rating when it counts, else null. */
function countedRating(a: RatedAppearance): number | null {
  return isCountedAppearance(a) ? a.rating : null;
}

/** Each Match's counted, rated line-up from Our Club's Appearances (any order). */
export function matchRatings(
  appearances: readonly RatedAppearance[],
): MatchRatings {
  const byMatch = new Map<string, Map<string, number>>();
  for (const a of appearances) {
    const rating = countedRating(a);
    if (rating === null) continue;
    const lineup = byMatch.get(a.matchId);
    if (lineup) lineup.set(a.playerId, rating);
    else byMatch.set(a.matchId, new Map([[a.playerId, rating]]));
  }
  return byMatch;
}

/** The average rating of a Match's line-up without `exclude`, or null when no one else was rated. */
function lineupAverage(
  lineup: ReadonlyMap<string, number>,
  exclude: readonly string[],
): number | null {
  return average(
    [...lineup].flatMap(([id, rating]) =>
      exclude.includes(id) ? [] : [rating],
    ),
  );
}

export interface AboveTeam {
  /** The Matches with a rated teammate, which the gap averages over. */
  matches: number;
  /** The average of rating minus the teammates' average; null with no such Match. */
  gap: number | null;
}

/**
 * How far a Squad Member's ratings sit above (or below) their teammates' in
 * the same Matches. `own` is the Appearances to count (e.g. after a Position
 * Group selection); `ratings` holds every teammate's.
 */
export function aboveTeam(
  own: readonly RatedAppearance[],
  ratings: MatchRatings,
): AboveTeam {
  const gaps: number[] = [];
  for (const a of own) {
    const rating = countedRating(a);
    const lineup = ratings.get(a.matchId);
    if (rating === null || !lineup) continue;
    const teammates = lineupAverage(lineup, [a.playerId]);
    if (teammates !== null) gaps.push(rating - teammates);
  }
  return { matches: gaps.length, gap: average(gaps) };
}

/** Below this many Matches, a Rating link gives no verdict. */
export const MIN_LINK_MATCHES = 8;

/** Below this many Matches, a Rating link verdict carries "Small sample". */
export const SMALL_LINK_SAMPLE = 15;

export type LinkStrength = "together" | "loose" | "independent" | "opposite";

/** Each verdict in words, for the heading of a Rating link. */
export const LINK_LABEL: Record<LinkStrength, string> = {
  together: "Rise and fall together",
  loose: "Loosely linked",
  independent: "No real link",
  opposite: "Pull opposite ways",
};

/** A correlation's verdict: together from 0.5, loose from 0.2, opposite from −0.2 down. */
export function linkStrength(r: number): LinkStrength {
  if (r >= 0.5) return "together";
  if (r >= 0.2) return "loose";
  if (r > -0.2) return "independent";
  return "opposite";
}

export interface LinkFigure {
  /** The Matches it is measured over. */
  matches: number;
  correlation: number | null;
  /** Null under `MIN_LINK_MATCHES`, or when either side never varied. */
  strength: LinkStrength | null;
}

function linkFigure(matches: number, r: number | null): LinkFigure {
  return {
    matches,
    correlation: r,
    strength: r === null || matches < MIN_LINK_MATCHES ? null : linkStrength(r),
  };
}

/** Of the Matches one side played below their own average, how many the other did too. */
export interface BelowPar {
  below: number;
  alsoBelow: number;
}

export interface RatingLink {
  /** Straight up: both ratings over every Shared Match where both were rated. */
  straight: LinkFigure;
  /**
   * Beyond the team: their correlation with the rest of the line-up's
   * average (neither of the two) held fixed, over the Shared Matches with a
   * third rated teammate. Two who only rise and fall with the team read
   * weaker here.
   */
  beyondTeam: LinkFigure;
  /** A's below-average Matches (against A's average in these Matches), and B's in them. */
  aBelow: BelowPar;
  /** The same the other way round. */
  bBelow: BelowPar;
}

/** Whether Squad Members `a` and `b` rate well and badly in the same Matches. */
export function ratingLink(
  a: string,
  b: string,
  ratings: MatchRatings,
): RatingLink {
  const straight: RatingPair[] = [];
  const beyondTeam: [number, number, number][] = [];
  for (const lineup of ratings.values()) {
    const ratingA = lineup.get(a);
    const ratingB = lineup.get(b);
    if (ratingA === undefined || ratingB === undefined) continue;
    straight.push([ratingA, ratingB]);
    const rest = lineupAverage(lineup, [a, b]);
    if (rest !== null) beyondTeam.push([ratingA, ratingB, rest]);
  }
  return {
    straight: linkFigure(straight.length, correlation(straight)),
    beyondTeam: linkFigure(beyondTeam.length, partialCorrelation(beyondTeam)),
    aBelow: belowPar(straight),
    bBelow: belowPar(straight.map(([x, y]) => [y, x] as const)),
  };
}

function belowPar(pairs: readonly RatingPair[]): BelowPar {
  const meanX = average(pairs.map(([x]) => x));
  const meanY = average(pairs.map(([, y]) => y));
  if (meanX === null || meanY === null) return { below: 0, alsoBelow: 0 };
  const below = pairs.filter(([x]) => x < meanX);
  return {
    below: below.length,
    alsoBelow: below.filter(([, y]) => y < meanY).length,
  };
}

/**
 * What a Rating link says in a sentence: whether two Squad Members' nights
 * line up, and whether that is them or the whole team. Null without a
 * verdict.
 */
export function linkReading({
  straight,
  beyondTeam,
}: Pick<RatingLink, "straight" | "beyondTeam">): string | null {
  switch (straight.strength) {
    case null:
      return null;
    case "independent":
      return "Their good and bad nights don't line up.";
    case "opposite":
      return "One's good night tends to be the other's bad one.";
  }
  switch (beyondTeam.strength) {
    case null:
      return null;
    case "together":
    case "loose":
      return "Not just the team: they still move together once the rest of the line-up's night is taken out.";
    default:
      return "Mostly the team: take out the rest of the line-up's night and the link fades.";
  }
}

/** Below this many rated Appearances, a Squad Member has no Floor or Spread. */
export const MIN_CONSISTENCY_APPEARANCES = 5;

/** Below this many, Floor and Spread carry "Small sample". */
export const SMALL_CONSISTENCY_SAMPLE = 10;

/** The share of Matches a Floor is reached or beaten in: 4 of 5. */
export const FLOOR_SHARE = 0.8;

/** How consistently good a Squad Member is (CLUBS-74). */
export interface Consistency {
  /** Counted, rated Appearances. */
  matches: number;
  /** The rating they reach or beat in 4 of 5 Matches; high is consistently good. */
  floor: number | null;
  /** The standard deviation of their ratings; low is steady. */
  spread: number | null;
  /** Under `SMALL_CONSISTENCY_SAMPLE`, with figures. */
  smallSample: boolean;
}

/** Floor and Spread over a Squad Member's counted, rated Appearances. */
export function consistency(
  appearances: readonly RatedAppearance[],
): Consistency {
  const ratings = appearances.flatMap((a) => {
    const rating = countedRating(a);
    return rating === null ? [] : [rating];
  });
  const enough = ratings.length >= MIN_CONSISTENCY_APPEARANCES;
  return {
    matches: ratings.length,
    floor: enough ? percentile(ratings, 1 - FLOOR_SHARE) : null,
    spread: enough ? standardDeviation(ratings) : null,
    smallSample: enough && ratings.length < SMALL_CONSISTENCY_SAMPLE,
  };
}
