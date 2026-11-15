/**
 * The Choice Mix (CLUBS-100): EA's verdict on each pass and shot, as shares.
 *
 * After a player passes or shoots, EA shows one of four verdicts on screen
 * and counts each in the Match Events (ADR 0009): best option taken, good
 * option taken, no good option, should have passed elsewhere. As shares of
 * their total they show how well someone chooses, however much of the ball
 * they see.
 *
 * What the verdicts cover, checked on the recorded Matches (CLUBS-100):
 * every pass and every shot gets one; a shot on target earns "best option"
 * far more often than a pass does (about 0.6 a shot against 0.04 a pass);
 * nearly every pass that goes astray lands in "no good option"; "good
 * option" comes only from completed passes. So this is how they choose, not
 * how well they strike a pass: pass completion says that.
 *
 * Pure and client-safe.
 */
import type { EventCounts } from "./event-stats";

/** EA's four verdicts, best first: the order every bar and table uses. */
export const CHOICE_VERDICTS = [
  { id: "best", count: "bestChoices", label: "Best option" },
  { id: "good", count: "goodChoices", label: "Good option" },
  { id: "none", count: "noGoodOptions", label: "No good option" },
  {
    id: "poor",
    count: "poorChoices",
    label: "Should have passed elsewhere",
  },
] as const satisfies readonly {
  id: string;
  count: keyof EventCounts;
  label: string;
}[];

export type ChoiceVerdict = (typeof CHOICE_VERDICTS)[number]["id"];

/** The four counts a Choice Mix is worked out from. */
export type ChoiceCounts = Pick<
  EventCounts,
  (typeof CHOICE_VERDICTS)[number]["count"]
>;

/** Fewer choices than this (about one Match's worth) are not shared out at all. */
export const MIN_CHOICES = 20;

/**
 * Under this many choices (about five Matches' worth) a share can be several
 * points out either way, so the mix is marked "Small sample" and never ranked
 * among the rest.
 */
export const SMALL_CHOICE_SAMPLE = 100;

export interface ChoiceMix {
  /** How many choices EA judged. */
  total: number;
  /** Each verdict's share, 0 to 100. */
  shares: Record<ChoiceVerdict, number>;
  /** Good and best options together, 0 to 100: what a ranking goes by. */
  goodOrBest: number;
  /** Fewer than `SMALL_CHOICE_SAMPLE` choices. */
  smallSample: boolean;
}

/** How many choices some counts hold. */
export function choiceTotal(counts: ChoiceCounts): number {
  return CHOICE_VERDICTS.reduce(
    (sum, verdict) => sum + counts[verdict.count],
    0,
  );
}

/**
 * The Choice Mix of some counts; null under `MIN_CHOICES` choices. `judged`
 * is how many choices the counts really rest on, when they have been scaled
 * (a Yardstick's are, to the Squad Member's minutes): it is what the mix is
 * held to, and its `total`.
 */
export function choiceMix(
  counts: ChoiceCounts,
  judged = choiceTotal(counts),
): ChoiceMix | null {
  const sum = choiceTotal(counts);
  if (judged < MIN_CHOICES || sum <= 0) return null;
  const shares = Object.fromEntries(
    CHOICE_VERDICTS.map(({ id, count }) => [id, (counts[count] / sum) * 100]),
  ) as Record<ChoiceVerdict, number>;
  return {
    total: judged,
    shares,
    goodOrBest: shares.best + shares.good,
    smallSample: judged < SMALL_CHOICE_SAMPLE,
  };
}

/** Counts added together, e.g. every Squad Member's into Our Club's. */
export function sumChoiceCounts(rows: readonly ChoiceCounts[]): ChoiceCounts {
  const total: ChoiceCounts = {
    bestChoices: 0,
    goodChoices: 0,
    noGoodOptions: 0,
    poorChoices: 0,
  };
  for (const row of rows) {
    for (const { count } of CHOICE_VERDICTS) total[count] += row[count];
  }
  return total;
}

/**
 * Mixes in the order a page lists them: the most good or best options first,
 * the fewest "should have passed elsewhere" breaking a tie, then the name.
 * Small samples come after all the rest, in the same order among themselves.
 */
export function rankChoices<T extends { name: string; mix: ChoiceMix }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(a.mix.smallSample) - Number(b.mix.smallSample) ||
      b.mix.goodOrBest - a.mix.goodOrBest ||
      a.mix.shares.poor - b.mix.shares.poor ||
      a.name.localeCompare(b.name),
  );
}

/** One Squad Member's line in the breakdown. */
export interface PlayerChoices {
  playerId: string;
  name: string;
  mix: ChoiceMix;
}

/** Our Club's choices in some Matches: the team's, the opponents', and each Squad Member's. */
export interface ChoiceBreakdown {
  /** Every Squad Member's choices together. */
  club: ChoiceMix;
  /** The opposing humans' in the same Matches; null when they have too few. */
  opponents: ChoiceMix | null;
  /** Ranked (`rankChoices`); a Squad Member under `MIN_CHOICES` is left out. */
  players: PlayerChoices[];
}

/**
 * The breakdown from each Squad Member's counts and the opponents' total.
 * Null when Our Club has too few choices to share out, as before Match
 * Events were stored.
 */
export function choiceBreakdown(
  players: readonly { playerId: string; name: string; counts: ChoiceCounts }[],
  opponents: ChoiceCounts | null,
): ChoiceBreakdown | null {
  const club = choiceMix(sumChoiceCounts(players.map((p) => p.counts)));
  if (!club) return null;
  return {
    club,
    opponents: opponents && choiceMix(opponents),
    players: rankChoices(
      players.flatMap(({ playerId, name, counts }) => {
        const mix = choiceMix(counts);
        return mix ? [{ playerId, name, mix }] : [];
      }),
    ),
  };
}

/** A Squad Member's Choice Mix on their profile, beside what it is set against. */
export interface PlayerChoiceProfile {
  own: ChoiceMix;
  /** The Yardstick's: the opposing humans in the same Position Groups. */
  yardstick: ChoiceMix | null;
  /** Our Club's in the Matches they played, theirs included. */
  team: ChoiceMix | null;
}

/**
 * `PlayerChoiceProfile` from each side's counts; null when the Squad Member
 * has too few. The Yardstick's counts are scaled to their minutes, so it
 * comes with how many choices the opposing humans really made (`judged`).
 */
export function playerChoiceProfile(
  own: ChoiceCounts,
  yardstick: { counts: ChoiceCounts; judged: number } | null,
  team: ChoiceCounts | null,
): PlayerChoiceProfile | null {
  const mix = choiceMix(own);
  if (!mix) return null;
  return {
    own: mix,
    yardstick: yardstick && choiceMix(yardstick.counts, yardstick.judged),
    team: team && choiceMix(team),
  };
}
