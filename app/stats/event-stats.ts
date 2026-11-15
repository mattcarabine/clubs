/**
 * Event Stats (CLUBS-85): what a Squad Member's Match Events (ADR 0009) add up
 * to. `eventTotals` sums the decoded counters over Appearances, `EVENT_STATS`
 * turns the sums into the figures pages show (per 90 minutes, or a share),
 * and three views set a figure against something:
 *
 * - `yardstickTotals`: the opposing humans in the same Position Groups, over
 *   the same minutes (the Yardstick);
 * - `teamShares`: Our Club's total in the same Matches;
 * - `resultMovers`: our Win % in the Matches they did more of it.
 *
 * There is no score of our own here, by the owner's choice: the page shows
 * the figures and the viewer judges. Pure and client-safe.
 */
import { type MatchEvents, matchEventCount } from "~/ea/events";
import type { Outcome, PositionGroup } from "~/lib/domain";
import { formatDecimal, formatPercentage } from "~/lib/number-format";

import {
  per90,
  percentage,
  winPercentage,
  winRateEffectSize,
} from "./formulas";
import { groupBy } from "./summaries";

/**
 * EA's code for a straight red card; a red without it is a second yellow.
 * The research has it only as a partial red-card sign, so it gets no name in
 * `app/ea/events.ts`; this one use was checked against production (CLUBS-85).
 */
export const STRAIGHT_RED_CODE = "96";

/** What an Appearance needs to be totalled. */
export interface EventAppearance {
  positionGroup: PositionGroup | null;
  secondsPlayed: number;
  redCards: number;
  /** Null when EA sent none; absent when the query left them out. */
  events?: MatchEvents | null;
}

/** The counts an Event Stat is worked out from. */
export const EVENT_COUNTS = [
  "goals",
  "assists",
  "secondAssists",
  "shotsOnTarget",
  "shotsOffTarget",
  "shotsInsideBox",
  "shotsOutsideBox",
  "passesCompleted",
  "passesFailed",
  "forwardPassesCompleted",
  "forwardPassesFailed",
  "sidewaysPasses",
  "backwardPasses",
  "shortPasses",
  "mediumPasses",
  "longPassesCompleted",
  "longPassesFailed",
  "throughBalls",
  "crossesCompleted",
  "crossesFailed",
  "offsidePasses",
  "dribbles",
  "defendersBeaten",
  "aerialDuelsWon",
  "foulsWon",
  "ballWonDefensiveThird",
  "ballWonMiddleThird",
  "ballWonAttackingThird",
  "ballLostDefensiveThird",
  "ballLostMiddleThird",
  "ballLostAttackingThird",
  "interceptions",
  "tacklesWon",
  "tacklesLost",
  "foulsConceded",
  "yellowCards",
  "redCards",
  "penaltiesConceded",
  "inPosition",
  "outOfPosition",
  "bestPassChoices",
  "poorPassChoices",
] as const;

export type EventCount = (typeof EVENT_COUNTS)[number];

export type EventCounts = Record<EventCount, number>;

/**
 * Yellow cards in one Appearance. EA's two yellow-card counters over-count
 * (checked on production, CLUBS-85), so: two when a red came without the
 * straight-red counter (a second yellow), otherwise one at most.
 */
export function yellowCards(appearance: EventAppearance): number {
  const { events, redCards } = appearance;
  if (!events) return 0;
  if (redCards >= 1 && !events[STRAIGHT_RED_CODE]) return 2;
  return Math.min(1, matchEventCount(events, "yellowCards"));
}

/** One Appearance's counts, or null when it has no Match Events. */
export function eventCounts(appearance: EventAppearance): EventCounts | null {
  const { events } = appearance;
  if (!events) return null;
  const n = (...stats: Parameters<typeof matchEventCount>[1][]) =>
    stats.reduce((total, stat) => total + matchEventCount(events, stat), 0);
  return {
    goals: n("goals"),
    assists: n("assists"),
    secondAssists: n("secondAssists"),
    shotsOnTarget: n("shotsOnTarget"),
    shotsOffTarget: n("shotsOffTarget"),
    shotsInsideBox: n("shotsOnTargetInsideBox", "shotsOffTargetInsideBox"),
    shotsOutsideBox: n("shotsOnTargetOutsideBox", "shotsOffTargetOutsideBox"),
    passesCompleted: n("passesCompleted"),
    passesFailed: n("passesFailed"),
    forwardPassesCompleted: n("forwardPassesCompleted"),
    forwardPassesFailed: n("forwardPassesFailed"),
    sidewaysPasses: n("sidewaysPassesCompleted", "sidewaysPassesFailed"),
    backwardPasses: n("backwardPassesCompleted", "backwardPassesFailed"),
    shortPasses: n("shortPassesCompleted", "shortPassesFailed"),
    mediumPasses: n("mediumPassesCompleted", "mediumPassesFailed"),
    longPassesCompleted: n("longPassesCompleted"),
    longPassesFailed: n("longPassesFailed"),
    throughBalls: n("throughBalls"),
    crossesCompleted: n("crossesCompleted"),
    crossesFailed: n("crossesFailed"),
    offsidePasses: n("offsidePasses"),
    dribbles: n("dribblesCompleted"),
    defendersBeaten: n("defendersBeaten"),
    aerialDuelsWon: n("aerialDuelsWonAttacking", "aerialDuelsWonDefending"),
    foulsWon: n("foulsWon"),
    ballWonDefensiveThird: n("possessionWonDefensiveThird"),
    ballWonMiddleThird: n("possessionWonMiddleThird"),
    ballWonAttackingThird: n("possessionWonAttackingThird"),
    ballLostDefensiveThird: n("possessionLostDefensiveThird"),
    ballLostMiddleThird: n("possessionLostMiddleThird"),
    ballLostAttackingThird: n("possessionLostAttackingThird"),
    interceptions: n("interceptions"),
    tacklesWon: n("tacklesWon"),
    tacklesLost: n("tacklesLost"),
    foulsConceded: n("foulsConceded"),
    yellowCards: yellowCards(appearance),
    // EA's named stat stays the source for what it names (ADR 0009).
    redCards: appearance.redCards,
    penaltiesConceded: n("penaltiesConceded"),
    inPosition: n("inPosition"),
    outOfPosition: n("outOfPosition"),
    bestPassChoices: n("bestOptionTaken"),
    poorPassChoices: n("shouldHavePassedElsewhere"),
  };
}

/** Counts summed over Appearances, with the time they cover. */
export interface EventTotals {
  /** Appearances that had Match Events; the rest are left out. */
  appearances: number;
  /** Seconds played in those Appearances. */
  seconds: number;
  counts: EventCounts;
}

function emptyTotals(): EventTotals {
  return {
    appearances: 0,
    seconds: 0,
    counts: Object.fromEntries(
      EVENT_COUNTS.map((id) => [id, 0]),
    ) as EventCounts,
  };
}

/** Totals over the Appearances that have Match Events and minutes. */
export function eventTotals(
  appearances: readonly EventAppearance[],
): EventTotals {
  const totals = emptyTotals();
  for (const appearance of appearances) {
    if (appearance.secondsPlayed <= 0) continue;
    const counts = eventCounts(appearance);
    if (!counts) continue;
    totals.appearances += 1;
    totals.seconds += appearance.secondsPlayed;
    for (const id of EVENT_COUNTS) totals.counts[id] += counts[id];
  }
  return totals;
}

function addScaled(into: EventTotals, from: EventTotals, factor: number) {
  into.appearances += from.appearances * factor;
  into.seconds += from.seconds * factor;
  for (const id of EVENT_COUNTS) into.counts[id] += from.counts[id] * factor;
}

/** Counts added up, e.g. one club's in a Match; null when none of them has any. */
export function sumEventCounts(
  rows: readonly (EventCounts | null | undefined)[],
): EventCounts | null {
  const present = rows.filter((row) => row != null);
  if (present.length === 0) return null;
  const total = emptyTotals().counts;
  for (const row of present) {
    for (const id of EVENT_COUNTS) total[id] += row[id];
  }
  return total;
}

/** The parts of the game an Event Stat belongs to, in page order. */
export const EVENT_STAT_GROUPS = [
  { id: "attacking", label: "Attacking" },
  { id: "passing", label: "Passing" },
  { id: "onTheBall", label: "On the ball" },
  { id: "defending", label: "Defending" },
  { id: "discipline", label: "Discipline" },
] as const;

export type EventStatGroup = (typeof EVENT_STAT_GROUPS)[number]["id"];

/** Which way is good for us; "neither" for a figure that only describes style. */
export type Better = "high" | "low" | "neither";

export interface EventStatDefinition {
  group: EventStatGroup;
  /** The name in running lists, sentence case: "Shots on target". */
  label: string;
  /** The Squad table's header. */
  header: string;
  /** What it means, in plain words. */
  description: string;
  unit: "per90" | "percent";
  better: Better;
  value: (totals: EventTotals) => number | null;
}

const sumCounts = (counts: EventCounts, ids: readonly EventCount[]) =>
  ids.reduce((total, id) => total + counts[id], 0);

const sumOf = (totals: EventTotals, ids: readonly EventCount[]) =>
  sumCounts(totals.counts, ids);

/** A count per 90 minutes played. */
const rate =
  (...ids: EventCount[]) =>
  (totals: EventTotals) =>
    per90(sumOf(totals, ids), totals.seconds);

/** `part` as a percentage of `part + rest`. */
const share =
  (part: readonly EventCount[], rest: readonly EventCount[]) =>
  (totals: EventTotals) => {
    const made = sumOf(totals, part);
    return percentage(made, made + sumOf(totals, rest));
  };

const BALL_WON = [
  "ballWonDefensiveThird",
  "ballWonMiddleThird",
  "ballWonAttackingThird",
] as const;

const BALL_LOST = [
  "ballLostDefensiveThird",
  "ballLostMiddleThird",
  "ballLostAttackingThird",
] as const;

/** How often the ball was won back, anywhere on the pitch. */
export const ballWon = (counts: EventCounts) => sumCounts(counts, BALL_WON);

/** How often the ball was lost, anywhere on the pitch. */
export const ballLost = (counts: EventCounts) => sumCounts(counts, BALL_LOST);

/** Every Event Stat a page can show, in the order tables and lists use. */
export const EVENT_STATS = {
  // Attacking
  goalInvolvements: {
    group: "attacking",
    label: "Goal involvements",
    header: "Inv/90",
    description:
      "Goals, assists and second assists (the pass before the assist) per 90 minutes",
    unit: "per90",
    better: "high",
    value: rate("goals", "assists", "secondAssists"),
  },
  secondAssists: {
    group: "attacking",
    label: "Second assists",
    header: "2nd A/90",
    description: "The pass before the assist, per 90 minutes",
    unit: "per90",
    better: "high",
    value: rate("secondAssists"),
  },
  shotsOnTarget: {
    group: "attacking",
    label: "Shots on target",
    header: "On tgt/90",
    description: "Shots on target per 90 minutes",
    unit: "per90",
    better: "high",
    value: rate("shotsOnTarget"),
  },
  shotAccuracy: {
    group: "attacking",
    label: "Shot accuracy",
    header: "Shot acc",
    description: "Share of shots that were on target",
    unit: "percent",
    better: "high",
    value: share(["shotsOnTarget"], ["shotsOffTarget"]),
  },
  finishing: {
    group: "attacking",
    label: "Shots scored",
    header: "Scored %",
    description: "Share of shots that went in",
    unit: "percent",
    better: "high",
    value: (totals) =>
      percentage(
        totals.counts.goals,
        totals.counts.shotsOnTarget + totals.counts.shotsOffTarget,
      ),
  },
  shotsInsideBox: {
    group: "attacking",
    label: "Shots from inside the box",
    header: "In box %",
    description: "Share of shots taken from inside the box",
    unit: "percent",
    better: "neither",
    value: share(["shotsInsideBox"], ["shotsOutsideBox"]),
  },
  aerialDuelsWon: {
    group: "attacking",
    label: "Headers won",
    header: "Headers/90",
    description: "Aerial duels won per 90 minutes",
    unit: "per90",
    better: "high",
    value: rate("aerialDuelsWon"),
  },
  // Passing
  passesCompleted: {
    group: "passing",
    label: "Passes completed",
    header: "Passes/90",
    description: "Passes completed per 90 minutes",
    unit: "per90",
    better: "high",
    value: rate("passesCompleted"),
  },
  passesFailed: {
    group: "passing",
    label: "Passes gone astray",
    header: "Astray/90",
    description: "Passes that did not reach a teammate, per 90 minutes",
    unit: "per90",
    better: "low",
    value: rate("passesFailed"),
  },
  forwardPassShare: {
    group: "passing",
    label: "Passes played forward",
    header: "Fwd %",
    description: "Share of passes played forward, not sideways or back",
    unit: "percent",
    better: "neither",
    value: share(
      ["forwardPassesCompleted", "forwardPassesFailed"],
      ["sidewaysPasses", "backwardPasses"],
    ),
  },
  forwardPassAccuracy: {
    group: "passing",
    label: "Forward passes completed",
    header: "Fwd acc",
    description: "Share of forward passes that reached a teammate",
    unit: "percent",
    better: "high",
    value: share(["forwardPassesCompleted"], ["forwardPassesFailed"]),
  },
  throughBalls: {
    group: "passing",
    label: "Through balls",
    header: "Thru/90",
    description: "Through balls that came off, per 90 minutes",
    unit: "per90",
    better: "high",
    value: rate("throughBalls"),
  },
  longPasses: {
    group: "passing",
    label: "Long passes completed",
    header: "Long/90",
    description: "Long passes completed per 90 minutes",
    unit: "per90",
    better: "high",
    value: rate("longPassesCompleted"),
  },
  crosses: {
    group: "passing",
    label: "Crosses completed",
    header: "Crosses/90",
    description: "Crosses that found a teammate, per 90 minutes",
    unit: "per90",
    better: "high",
    value: rate("crossesCompleted"),
  },
  offsidePasses: {
    group: "passing",
    label: "Passes to an offside teammate",
    header: "Offside/90",
    description: "Passes played to a teammate who was offside, per 90 minutes",
    unit: "per90",
    better: "low",
    value: rate("offsidePasses"),
  },
  bestPassChoices: {
    group: "passing",
    label: "Best pass picked",
    header: "Best pass/90",
    description:
      "Times EA judged they picked the best pass on offer, per 90 minutes",
    unit: "per90",
    better: "high",
    value: rate("bestPassChoices"),
  },
  poorPassChoices: {
    group: "passing",
    label: "Poor pass choices",
    header: "Poor pass/90",
    description:
      "Times EA judged they should have passed elsewhere, per 90 minutes",
    unit: "per90",
    better: "low",
    value: rate("poorPassChoices"),
  },
  // On the ball
  dribbles: {
    group: "onTheBall",
    label: "Dribbles",
    header: "Dribbles/90",
    description: "Dribbles completed per 90 minutes",
    unit: "per90",
    better: "high",
    value: rate("dribbles"),
  },
  defendersBeaten: {
    group: "onTheBall",
    label: "Defenders beaten",
    header: "Beaten/90",
    description: "Defenders taken on and beaten, per 90 minutes",
    unit: "per90",
    better: "high",
    value: rate("defendersBeaten"),
  },
  foulsWon: {
    group: "onTheBall",
    label: "Fouls won",
    header: "Fouls won/90",
    description: "Times they were fouled, per 90 minutes",
    unit: "per90",
    better: "high",
    value: rate("foulsWon"),
  },
  ballLost: {
    group: "onTheBall",
    label: "Ball lost",
    header: "Lost/90",
    description: "Times they lost the ball, per 90 minutes",
    unit: "per90",
    better: "low",
    value: rate(...BALL_LOST),
  },
  ballLostOwnThird: {
    group: "onTheBall",
    label: "Ball lost in our own third",
    header: "Lost own 3rd/90",
    description:
      "Times they lost the ball in our own third of the pitch, per 90 minutes",
    unit: "per90",
    better: "low",
    value: rate("ballLostDefensiveThird"),
  },
  // Defending
  ballWon: {
    group: "defending",
    label: "Ball won",
    header: "Won/90",
    description: "Times they won the ball back, per 90 minutes",
    unit: "per90",
    better: "high",
    value: rate(...BALL_WON),
  },
  ballWonHigh: {
    group: "defending",
    label: "Ball won in their third",
    header: "Won high/90",
    description:
      "Times they won the ball back in the opponent's third, per 90 minutes",
    unit: "per90",
    better: "high",
    value: rate("ballWonAttackingThird"),
  },
  interceptions: {
    group: "defending",
    label: "Interceptions",
    header: "Int/90",
    description: "Passes cut out, per 90 minutes",
    unit: "per90",
    better: "high",
    value: rate("interceptions"),
  },
  tacklesWon: {
    group: "defending",
    label: "Tackles won",
    header: "Tkl won/90",
    description: "Tackles won per 90 minutes",
    unit: "per90",
    better: "high",
    value: rate("tacklesWon"),
  },
  tackleSuccess: {
    group: "defending",
    label: "Tackles won, of those tried",
    header: "Tkl won %",
    description: "Share of tackles they went in for and won",
    unit: "percent",
    better: "high",
    value: share(["tacklesWon"], ["tacklesLost"]),
  },
  tacklesLost: {
    group: "defending",
    label: "Tackles missed",
    header: "Tkl missed/90",
    description: "Tackles they went in for and lost, per 90 minutes",
    unit: "per90",
    better: "low",
    value: rate("tacklesLost"),
  },
  // Discipline
  foulsConceded: {
    group: "discipline",
    label: "Fouls given away",
    header: "Fouls/90",
    description: "Fouls given away per 90 minutes",
    unit: "per90",
    better: "low",
    value: rate("foulsConceded"),
  },
  yellowCards: {
    group: "discipline",
    label: "Yellow cards",
    header: "Yellow/90",
    description: "Yellow cards per 90 minutes",
    unit: "per90",
    better: "low",
    value: rate("yellowCards"),
  },
  redCards: {
    group: "discipline",
    label: "Red cards",
    header: "Red/90",
    description: "Red cards per 90 minutes",
    unit: "per90",
    better: "low",
    value: rate("redCards"),
  },
  penaltiesConceded: {
    group: "discipline",
    label: "Penalties given away",
    header: "Pens/90",
    description: "Penalties given away per 90 minutes",
    unit: "per90",
    better: "low",
    value: rate("penaltiesConceded"),
  },
  outOfPosition: {
    group: "discipline",
    label: "Caught out of position",
    header: "Out of pos %",
    description:
      "Share of EA's positioning checks that found them out of position",
    unit: "percent",
    better: "low",
    value: share(["outOfPosition"], ["inPosition"]),
  },
} as const satisfies Record<string, EventStatDefinition>;

export type EventStatId = keyof typeof EVENT_STATS;

export const EVENT_STAT_IDS = Object.keys(EVENT_STATS) as EventStatId[];

/** Every Event Stat's value; null where it cannot be worked out. */
export type EventStatValues = Record<EventStatId, number | null>;

export function eventStatValues(totals: EventTotals): EventStatValues {
  return Object.fromEntries(
    EVENT_STAT_IDS.map((id) => [id, EVENT_STATS[id].value(totals)]),
  ) as EventStatValues;
}

/** Event Stats over some Appearances; null when none of them has Match Events. */
export function eventStatsOf(
  appearances: readonly EventAppearance[],
): EventStatValues | null {
  const totals = eventTotals(appearances);
  return totals.appearances === 0 ? null : eventStatValues(totals);
}

/** An Event Stat's value as text: "61%", "2.35" per 90, or "14.7" from 10 up. */
export function formatEventStat(id: EventStatId, value: number | null): string {
  if (EVENT_STATS[id].unit === "percent") return formatPercentage(value);
  return formatDecimal(value, value !== null && value >= 10 ? 1 : 2);
}

/** The Event Stats of one group, in order. */
export function eventStatsIn(group: EventStatGroup): EventStatId[] {
  return EVENT_STAT_IDS.filter((id) => EVENT_STATS[id].group === group);
}

/**
 * Influence (CLUBS-85): the Event Stats that most plainly push a result our
 * way, and the ones that most plainly cost us. Shown side by side, never
 * added up.
 */
export const INFLUENCE = {
  adds: [
    "goalInvolvements",
    "shotsOnTarget",
    "throughBalls",
    "defendersBeaten",
    "ballWon",
    "interceptions",
    "tacklesWon",
    "foulsWon",
  ],
  costs: [
    "ballLost",
    "ballLostOwnThird",
    "passesFailed",
    "poorPassChoices",
    "tacklesLost",
    "foulsConceded",
    "yellowCards",
    "outOfPosition",
  ],
} as const satisfies Record<string, readonly EventStatId[]>;

/** How a figure sits against another: better or worse for us, or level. */
export type Standing = "better" | "worse" | "level";

/** A gap smaller than this share of the larger figure counts as level. */
export const LEVEL_MARGIN = 0.1;

/** Where `value` stands against `against` for a stat; null when it only describes style. */
export function standing(
  better: Better,
  value: number | null,
  against: number | null,
): Standing | null {
  if (better === "neither" || value === null || against === null) return null;
  const scale = Math.max(Math.abs(value), Math.abs(against));
  if (scale === 0 || Math.abs(value - against) / scale < LEVEL_MARGIN) {
    return "level";
  }
  return value > against === (better === "high") ? "better" : "worse";
}

/** Each Position Group's totals, for the Yardstick. */
export type PositionTotals = ReadonlyMap<PositionGroup, EventTotals>;

/** Totals per Position Group; Appearances with no position are left out. */
export function positionTotals(
  appearances: readonly EventAppearance[],
): Map<PositionGroup, EventTotals> {
  const totals = new Map<PositionGroup, EventTotals>();
  for (const [group, rows] of groupBy(appearances, (a) => a.positionGroup)) {
    if (group !== null) totals.set(group, eventTotals(rows));
  }
  return totals;
}

/**
 * The Yardstick for a set of Appearances: what the opposing humans in the
 * same Position Groups did (every opponent in `opponents`, usually all in
 * the filtered Matches), over the same minutes. Each group's opponents are
 * scaled to the time these Appearances spent in it, so any Event Stat of the
 * result reads like the Squad Member's own. Null when no opponent played in
 * any of the groups.
 */
export function yardstickTotals(
  appearances: readonly EventAppearance[],
  opponents: PositionTotals,
): EventTotals | null {
  const yardstick = emptyTotals();
  for (const [group, own] of positionTotals(appearances)) {
    const theirs = opponents.get(group);
    if (!theirs || theirs.seconds === 0 || own.seconds === 0) continue;
    addScaled(yardstick, theirs, own.seconds / theirs.seconds);
  }
  return yardstick.seconds === 0 ? null : yardstick;
}

/** An Appearance in a Match, for anything that needs the Match too. */
export interface MatchEventAppearance extends EventAppearance {
  matchId: string;
  playerId: string;
  goalsFor: number;
  outcome: Outcome;
  dnf: boolean;
}

/** A Squad Member's part of Our Club's total in the Matches they played. */
export interface TeamShare {
  id: "goals" | "shotsOnTarget" | "ballWon" | "ballLost";
  /** 0 to 100. */
  share: number;
  /** Their count and the team's. */
  own: number;
  team: number;
  better: Better;
}

export interface TeamShares {
  shares: TeamShare[];
  /**
   * The share an equal split of the humans' minutes would give them (0 to
   * 100), or null with no minutes. It fits every share but goals, where one
   * goal can be shared by its scorer and both passers and the AI scores too.
   */
  evenShare: number | null;
}

/**
 * How much of what Our Club did came from one Squad Member, over the Matches
 * of `own` (their Appearances). `team` is every teammate's Appearance,
 * theirs included. Goals are our goals they scored or set up (second assists
 * count), against the Match scores, so goals by the AI count in the total; a
 * rage quit's score is EA's award, so those Matches are left out of that one.
 * A share with nothing to share out is left out.
 */
export function teamShares(
  own: readonly MatchEventAppearance[],
  team: readonly MatchEventAppearance[],
): TeamShares {
  const counted = own.filter((a) => a.events && a.secondsPlayed > 0);
  const matchIds = new Set(counted.map((a) => a.matchId));
  const teammates = team.filter((a) => matchIds.has(a.matchId));
  const mine = eventTotals(counted);
  const ours = eventTotals(teammates);

  const played = counted.filter((a) => !a.dnf);
  const involved = sumOf(eventTotals(played), [
    "goals",
    "assists",
    "secondAssists",
  ]);
  const scored = played.reduce((total, a) => total + a.goalsFor, 0);

  const candidates: Omit<TeamShare, "share">[] = [
    {
      id: "goals",
      // EA's counters can run a goal ahead of the score; never show over 100%.
      own: Math.min(involved, scored),
      team: scored,
      better: "high",
    },
    {
      id: "shotsOnTarget",
      own: mine.counts.shotsOnTarget,
      team: ours.counts.shotsOnTarget,
      better: "high",
    },
    {
      id: "ballWon",
      own: sumOf(mine, BALL_WON),
      team: sumOf(ours, BALL_WON),
      better: "high",
    },
    {
      id: "ballLost",
      own: sumOf(mine, BALL_LOST),
      team: sumOf(ours, BALL_LOST),
      better: "low",
    },
  ];
  return {
    shares: candidates.flatMap((c) => {
      const value = percentage(c.own, c.team);
      return value === null ? [] : [{ ...c, share: value }];
    }),
    evenShare: percentage(mine.seconds, ours.seconds),
  };
}

/** What a Result Mover counts in one Match, and how the page names it. */
interface MoverDefinition {
  counts: readonly EventCount[];
  /** After "3 or more": "shots on target". */
  plural: string;
}

/** The counts tried as Result Movers: Influence's, as whole numbers per Match. */
export const RESULT_MOVERS = {
  goalInvolvements: {
    counts: ["goals", "assists", "secondAssists"],
    plural: "goal involvements",
  },
  shotsOnTarget: { counts: ["shotsOnTarget"], plural: "shots on target" },
  throughBalls: { counts: ["throughBalls"], plural: "through balls" },
  defendersBeaten: { counts: ["defendersBeaten"], plural: "defenders beaten" },
  ballWon: { counts: BALL_WON, plural: "times winning the ball back" },
  interceptions: { counts: ["interceptions"], plural: "interceptions" },
  tacklesWon: { counts: ["tacklesWon"], plural: "tackles won" },
  ballLost: { counts: BALL_LOST, plural: "times losing the ball" },
  passesFailed: { counts: ["passesFailed"], plural: "passes gone astray" },
  poorPassChoices: {
    counts: ["poorPassChoices"],
    plural: "poor pass choices",
  },
  tacklesLost: { counts: ["tacklesLost"], plural: "tackles missed" },
  foulsConceded: { counts: ["foulsConceded"], plural: "fouls given away" },
} as const satisfies Record<string, MoverDefinition>;

export type ResultMoverId = keyof typeof RESULT_MOVERS;

/** Each side of a Result Mover needs this many Matches. */
export const MIN_MOVER_MATCHES = 5;

/** Either side under this many Matches is marked "Small sample". */
export const SMALL_MOVER_SAMPLE = 10;

/** The smallest Win % gap, in points, worth showing. */
export const MIN_MOVER_GAP = 10;

/** How many Result Movers show each way. */
export const TOP_MOVERS = 3;

export interface MoverSide {
  played: number;
  wins: number;
  /** 0 to 100. */
  winPercentage: number;
}

export interface ResultMover {
  id: ResultMoverId;
  /** "3 or more shots on target". */
  label: string;
  /** The count that splits their Matches: `threshold` or more against fewer. */
  threshold: number;
  more: MoverSide;
  fewer: MoverSide;
  /** `more` minus `fewer`, in points of Win %. */
  gap: number;
  smallSample: boolean;
}

export interface ResultMovers {
  /** We won more often when they did more of it; biggest gap first. */
  up: ResultMover[];
  /** We won less often when they did more of it; biggest gap first. */
  down: ResultMover[];
  /** The Matches read: theirs with Match Events, rage quits left out. */
  matches: number;
}

/**
 * Result Movers (CLUBS-85): for each count, a Squad Member's Matches split at
 * the count that divides them most evenly ("3 or more" against fewer), and
 * our Win % on each side. A pattern in the Matches so far, not proof: the
 * page says so. Rage quits are left out, since a Match cut short has fewer of
 * everything. Ranked by the size of the gap (Cohen's h).
 */
export function resultMovers(
  appearances: readonly MatchEventAppearance[],
): ResultMovers {
  const rows = appearances.flatMap((a) => {
    if (a.dnf || a.secondsPlayed <= 0) return [];
    const counts = eventCounts(a);
    return counts ? [{ counts, outcome: a.outcome }] : [];
  });
  const ranked: (ResultMover & { strength: number })[] = [];
  for (const id of Object.keys(RESULT_MOVERS) as ResultMoverId[]) {
    const definition: MoverDefinition = RESULT_MOVERS[id];
    const matches = rows.map(({ counts, outcome }) => ({
      count: definition.counts.reduce((total, c) => total + counts[c], 0),
      outcome,
    }));
    const threshold = evenestThreshold(matches.map((m) => m.count));
    if (threshold === null) continue;
    const more = moverSide(matches.filter((m) => m.count >= threshold));
    const fewer = moverSide(matches.filter((m) => m.count < threshold));
    if (!more || !fewer) continue;
    if (Math.min(more.played, fewer.played) < MIN_MOVER_MATCHES) continue;
    const gap = more.winPercentage - fewer.winPercentage;
    if (Math.abs(gap) < MIN_MOVER_GAP) continue;
    ranked.push({
      id,
      label: `${threshold} or more ${definition.plural}`,
      threshold,
      more,
      fewer,
      gap,
      smallSample: Math.min(more.played, fewer.played) < SMALL_MOVER_SAMPLE,
      strength: Math.abs(
        winRateEffectSize(more.winPercentage, fewer.winPercentage),
      ),
    });
  }
  ranked.sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id));
  const top = (keep: (mover: ResultMover) => boolean) =>
    ranked
      .filter(keep)
      .slice(0, TOP_MOVERS)
      .map(({ strength: _, ...mover }) => mover);
  return {
    up: top((m) => m.gap > 0),
    down: top((m) => m.gap < 0),
    matches: rows.length,
  };
}

function moverSide(matches: readonly { outcome: Outcome }[]): MoverSide | null {
  const outcomes = matches.map((m) => m.outcome);
  const win = winPercentage(outcomes);
  if (win === null) return null;
  return {
    played: outcomes.length,
    wins: outcomes.filter((o) => o === "W").length,
    winPercentage: win,
  };
}

/**
 * The count (1 or more) that splits the values most evenly into "that many
 * or more" and "fewer"; the lower count wins a tie. Null when every value is
 * the same, so nothing splits them.
 */
export function evenestThreshold(values: readonly number[]): number | null {
  let best: { threshold: number; imbalance: number } | null = null;
  for (const threshold of [...new Set(values)].sort((a, b) => a - b)) {
    if (threshold < 1) continue;
    const more = values.filter((v) => v >= threshold).length;
    const imbalance = Math.abs(2 * more - values.length);
    if (more === values.length) continue;
    if (!best || imbalance < best.imbalance) best = { threshold, imbalance };
  }
  return best ? best.threshold : null;
}

/** Where a Squad Member wins and loses the ball, and how they pass and shoot: shares of 100. */
export interface StyleMix {
  id: "passDirection" | "passLength" | "ballWon" | "ballLost" | "shots";
  /** How many things the shares divide. */
  total: number;
  parts: { label: string; share: number }[];
}

/** The style mixes with anything to divide, in page order. */
export function styleMixes(totals: EventTotals): StyleMix[] {
  const { counts } = totals;
  const mix = (
    id: StyleMix["id"],
    parts: readonly (readonly [string, number])[],
  ): StyleMix[] => {
    const total = parts.reduce((sum, [, count]) => sum + count, 0);
    if (total === 0) return [];
    return [
      {
        id,
        total,
        parts: parts.map(([label, count]) => ({
          label,
          share: (count / total) * 100,
        })),
      },
    ];
  };
  return [
    ...mix("passDirection", [
      ["Forward", counts.forwardPassesCompleted + counts.forwardPassesFailed],
      ["Sideways", counts.sidewaysPasses],
      ["Backward", counts.backwardPasses],
    ]),
    ...mix("passLength", [
      ["Short", counts.shortPasses],
      ["Medium", counts.mediumPasses],
      ["Long", counts.longPassesCompleted + counts.longPassesFailed],
    ]),
    ...mix("shots", [
      ["Inside the box", counts.shotsInsideBox],
      ["Outside the box", counts.shotsOutsideBox],
    ]),
    ...mix("ballWon", [
      ["Our third", counts.ballWonDefensiveThird],
      ["Middle third", counts.ballWonMiddleThird],
      ["Their third", counts.ballWonAttackingThird],
    ]),
    ...mix("ballLost", [
      ["Our third", counts.ballLostDefensiveThird],
      ["Middle third", counts.ballLostMiddleThird],
      ["Their third", counts.ballLostAttackingThird],
    ]),
  ];
}

/** One Event Stat beside its Yardstick. */
export interface EventStatLine {
  id: EventStatId;
  value: number | null;
  /** The same figure for the opposing humans in the same Position Groups, or null. */
  yardstick: number | null;
  standing: Standing | null;
}

/** Everything a profile shows from one Squad Member's Match Events. */
export interface PlayerEventProfile {
  /** The Appearances with Match Events that everything here is worked out from. */
  appearances: number;
  lines: Record<EventStatId, EventStatLine>;
  teamShares: TeamShares;
  movers: ResultMovers;
  mixes: StyleMix[];
}

/**
 * A Squad Member's Event Stats with their Yardstick, team shares, Result
 * Movers and style mixes, or null when none of `own` has Match Events.
 */
export function playerEventProfile(
  own: readonly MatchEventAppearance[],
  team: readonly MatchEventAppearance[],
  opponents: PositionTotals,
): PlayerEventProfile | null {
  const totals = eventTotals(own);
  if (totals.appearances === 0) return null;
  const against = yardstickTotals(own, opponents);
  const lines = Object.fromEntries(
    EVENT_STAT_IDS.map((id): [EventStatId, EventStatLine] => {
      const definition: EventStatDefinition = EVENT_STATS[id];
      const value = definition.value(totals);
      const yardstick = against ? definition.value(against) : null;
      return [
        id,
        {
          id,
          value,
          yardstick,
          standing: standing(definition.better, value, yardstick),
        },
      ];
    }),
  ) as Record<EventStatId, EventStatLine>;
  return {
    appearances: totals.appearances,
    lines,
    teamShares: teamShares(own, team),
    movers: resultMovers(own),
    mixes: styleMixes(totals),
  };
}
