/**
 * The Choice Mix (CLUBS-100): EA's verdict on each pass and shot, as shares.
 *
 * After a player passes or shoots, EA shows one of four verdicts on screen
 * and counts each in the Match Events (ADR 0009): best option taken, good
 * option taken, no good option, should have passed elsewhere. As shares of
 * their total they show how well someone chooses, however much of the ball
 * they see.
 *
 * What the verdicts cover, checked on 90 production Matches (725 players'
 * Appearances, CLUBS-100): every pass and every shot gets one, near enough
 * (their total runs about 4% over, and the extra tracks the ball lost on
 * it); a shot on target earns "best option" far more often than a pass does
 * (about 0.45 a shot against 0.06 a completed pass); a pass that goes astray
 * is "no good option" about 6 times in 10 and "should have passed elsewhere"
 * the rest, almost never good or best. So this is how they choose, not how
 * well they strike a pass: pass completion says that.
 *
 * Read a ranking with care. Forwards get fewer good or best options than
 * midfielders (26% against 30%, ours and opponents' alike), so Analysis
 * ranks each Squad Member against the opposing humans in their own position
 * (CLUBS-101). And a Squad Member's share moved by up to 6 points between
 * two halves of 40 Matches each, as much as the gaps between them.
 *
 * Pure and client-safe.
 */
import type { PositionGroup } from "~/lib/domain";

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
 * Under this many choices (about fifteen Matches' worth) a share can be five
 * points or more out either way, as much as the gaps between Squad Members,
 * so the mix is marked "Small sample" and never ranked among the rest.
 */
export const SMALL_CHOICE_SAMPLE = 300;

export interface ChoiceMix {
  /** How many choices EA judged. */
  total: number;
  /** Each verdict's share, 0 to 100. */
  shares: Record<ChoiceVerdict, number>;
  /** Good and best options together, 0 to 100. */
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

/** One side's choices in one Position Group. */
export interface PositionChoices {
  /** Null for Appearances EA gave no position. */
  positionGroup: PositionGroup | null;
  /** How many Appearances the counts come from. */
  appearances: number;
  /** When the latest of them was played, in epoch milliseconds. */
  latestAt: number;
  counts: ChoiceCounts;
}

/**
 * The Position Group most of a Squad Member's Appearances were in, a tie
 * going to the one played in most recently: the Main Position
 * (`mainPosition`, positions.ts) read off rows already grouped in SQL. Null
 * when EA gave them no position.
 */
export function mainChoicePosition(
  positions: readonly PositionChoices[],
): PositionGroup | null {
  let main: PositionChoices | null = null;
  for (const row of positions) {
    if (row.positionGroup === null) continue;
    if (
      main === null ||
      row.appearances > main.appearances ||
      (row.appearances === main.appearances && row.latestAt > main.latestAt)
    ) {
      main = row;
    }
  }
  return main?.positionGroup ?? null;
}

/**
 * Mixes in the order a page lists them (CLUBS-101): the furthest ahead of
 * their Yardstick first (`edge`), so a forward is not ranked below a
 * midfielder for playing up front; then those with no Yardstick, the most
 * good or best options first. The fewest "should have passed elsewhere"
 * breaks a tie, then the name. Small samples come after all the rest, in the
 * same order among themselves.
 */
export function rankChoices<
  T extends { name: string; mix: ChoiceMix; edge: number | null },
>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(a.mix.smallSample) - Number(b.mix.smallSample) ||
      Number(a.edge === null) - Number(b.edge === null) ||
      (b.edge ?? b.mix.goodOrBest) - (a.edge ?? a.mix.goodOrBest) ||
      a.mix.shares.poor - b.mix.shares.poor ||
      a.name.localeCompare(b.name),
  );
}

/** One Squad Member's line in the breakdown. */
export interface PlayerChoices {
  playerId: string;
  name: string;
  /** Their Main Position, the only one `mix` counts; null when EA gave them none. */
  position: PositionGroup | null;
  mix: ChoiceMix;
  /**
   * The Yardstick's: the opposing humans in that position. Null when they
   * have too few choices to be worth comparing with (a small sample).
   */
  yardstick: ChoiceMix | null;
  /**
   * Their good or best share less the Yardstick's, in whole points between
   * the two shares as a page prints them, so the ranking never disagrees with
   * the figures beside it. Null with no Yardstick.
   */
  edge: number | null;
}

/** Our Club's choices in some Matches: the team's, the opponents', and each Squad Member's. */
export interface ChoiceBreakdown {
  /** Every Squad Member's choices together, in every position. */
  club: ChoiceMix;
  /** The opposing humans' in the same Matches; null when they have too few. */
  opponents: ChoiceMix | null;
  /** Ranked (`rankChoices`); a Squad Member under `MIN_CHOICES` is left out. */
  players: PlayerChoices[];
}

/**
 * The breakdown from each side's counts per Position Group. A Squad Member's
 * line counts their Main Position alone, beside the opposing humans in it,
 * so it reads like their profile with "Main position only" on. Null when Our
 * Club has too few choices to share out, as before Match Events were stored.
 */
export function choiceBreakdown(
  players: readonly {
    playerId: string;
    name: string;
    positions: readonly PositionChoices[];
  }[],
  opponents: readonly PositionChoices[],
): ChoiceBreakdown | null {
  const allOf = (rows: readonly PositionChoices[]) =>
    sumChoiceCounts(rows.map((row) => row.counts));
  const club = choiceMix(allOf(players.flatMap((p) => p.positions)));
  if (!club) return null;
  return {
    club,
    opponents: choiceMix(allOf(opponents)),
    players: rankChoices(
      players.flatMap(({ playerId, name, positions }) => {
        const position = mainChoicePosition(positions);
        const inPosition = (rows: readonly PositionChoices[]) =>
          rows.filter((row) => row.positionGroup === position);
        // With no position at all, everything they did counts, beside nothing.
        const mix = choiceMix(
          allOf(position === null ? positions : inPosition(positions)),
        );
        if (!mix) return [];
        const theirs =
          position === null ? null : choiceMix(allOf(inPosition(opponents)));
        const yardstick = theirs && !theirs.smallSample ? theirs : null;
        return [
          {
            playerId,
            name,
            position,
            mix,
            yardstick,
            edge:
              yardstick &&
              Math.round(mix.goodOrBest) - Math.round(yardstick.goodOrBest),
          },
        ];
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
