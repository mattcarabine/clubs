/**
 * The Outcome Split (CLUBS-25): what changes between Wins and Dropped Points.
 * Pure roll-ups of Matches and Appearances into the Analysis page and the
 * profile's "Wins vs Dropped Points" panel; `outcome-split-query.ts` feeds
 * them from D1.
 *
 * Count stats are per 90 over how long each Match ran, so a rage quit at
 * 45 minutes counts as half a Match rather than skewing the averages; rates
 * (pass %, tackle %, conversion) and ratings are not adjusted. Every finding
 * is ranked on one scale: Cohen's d for the averages, Cohen's h for the
 * Win-rate gaps (`formulas.ts`).
 */
import type { Outcome, PositionGroup } from "~/lib/domain";
import { londonParts } from "~/lib/london-time";
import {
  formatCount,
  formatDecimal,
  formatPercentage,
  NO_VALUE,
} from "~/lib/number-format";
import { capitalise } from "~/lib/text";
import { isFormerSquadMember } from "~/roster";

import { isCountedAppearance, type QuitBy, quitBy } from "./counted";
import {
  average,
  effectSize,
  per90,
  percentage,
  rollingWinPercentage,
  standardScore,
  type WeightedValue,
  weightedMean,
  winPercentage,
  winRateEffectSize,
} from "./formulas";
import {
  filterByPositionGroups,
  type PositionGroupSelection,
} from "./positions";
import { type Consistency, consistency } from "./rating-context";
import {
  OPPONENT_STRENGTHS,
  type OpponentStrength,
  opponentStrength,
} from "./skill-rating";
import type { SquadAppearance } from "./squad";
import { groupBy, type PlayerTotals, summariseAppearances } from "./summaries";
import type { SplitBucket } from "./trends";

/** Each side needs this many Matches before the page, or any factor, is shown. */
export const MIN_SPLIT_MATCHES = 3;

/** Findings with fewer Matches than this on either side are marked "Small sample". */
export const SMALL_SAMPLE_MATCHES = 10;

/** The smallest Win-rate gap, in percentage points, that makes a position outlier. */
export const POSITION_OUTLIER_GAP = 25;

/** How many findings lead the page. */
export const TOP_FINDINGS = 5;

/** Wins or Dropped Points (a Match drawn or lost). */
export type OutcomeSide = "wins" | "dropped";

/**
 * "1 draw or defeat", "9 draws and defeats": how copy names Dropped Points,
 * since the glossary term reads as jargon in a sentence (CONTEXT.md).
 */
export function formatDroppedCount(count: number): string {
  return formatCount(count, "draw or defeat", "draws and defeats");
}

export function outcomeSide(outcome: Outcome): OutcomeSide {
  return outcome === "W" ? "wins" : "dropped";
}

/** One club's totals over its Appearances in one Match. */
export interface ClubMatchTotals {
  goals: number;
  shots: number;
  passesMade: number;
  passAttempts: number;
  tacklesMade: number;
  tackleAttempts: number;
  saves: number;
  redCards: number;
  ratingSum: number;
  /** Appearances with a rating. */
  ratings: number;
}

/** One Match, as the Outcome Split reads it. */
export interface SplitMatch {
  matchId: string;
  playedAt: Date;
  outcome: Outcome;
  /** Whether the Match ended early because one side quit. */
  dnf: boolean;
  /** How long the Match ran: the longest Appearance in it, on either side. */
  secondsPlayed: number;
  /** Null when a club's stats are not counted: the side that rage quit (`counted.ts`). */
  ours: ClubMatchTotals | null;
  opponent: ClubMatchTotals | null;
  /** How many Squad Members played. */
  squadSize: number;
  /** How many humans played for the Opponent (EA lists no AI players), or 0 when EA listed none. */
  opponentHumans: number;
  /** Which Session it was in: equal for Matches in the same Session. */
  session: number;
  /** 1 for the first Match in its Session. */
  sessionPlace: number;
  /** Our Skill Rating minus the Opponent's at the Match (`ratingGap`), or null when unrated. */
  ratingGap: number | null;
}

// ---------------------------------------------------------------------------
// Performance

type Club = "ours" | "opponent";

/** Both clubs, Our Club first. */
const CLUBS: readonly Club[] = ["ours", "opponent"];

interface PerformanceMetric {
  id: string;
  /** The row label: "Shots per 90". */
  label: string;
  /** The per-Match value and its weight, or null when it cannot be computed. */
  sample: (
    totals: ClubMatchTotals,
    secondsPlayed: number,
  ) => WeightedValue | null;
  format: (value: number) => string;
  /** The finding's sentence after "In draws and defeats". */
  describe: (club: Club, diff: number) => string;
  /** One Match against a typical Win, before "than in a typical Win": "6.1 fewer shots per 90". */
  compare: (club: Club, diff: number) => string;
}

const SUBJECT: Record<Club, string> = { ours: "we", opponent: "Opponents" };
const POSSESSIVE: Record<Club, string> = {
  ours: "our",
  opponent: "Opponents'",
};
/** Names one Match's stat: "Opponent pass completion". */
const OWNER: Record<Club, string> = { ours: "", opponent: "Opponent " };

/** "Pass completion" for ours, "Opponent pass completion" for theirs. */
function statName(club: Club, label: string): string {
  return capitalise(`${OWNER[club]}${label.toLowerCase()}`);
}

function perNinety(
  id: string,
  noun: string,
  /** Reads after "we" or "Opponents": "take". */
  verb: string,
  pick: (t: ClubMatchTotals) => number,
): PerformanceMetric {
  return {
    id,
    label: `${capitalise(noun)} per 90`,
    sample: (totals, seconds) => {
      const value = per90(pick(totals), seconds);
      return value === null ? null : { value, weight: seconds };
    },
    format: (value) => formatDecimal(value),
    describe: (club, diff) =>
      `${SUBJECT[club]} ${verb} ${formatDecimal(Math.abs(diff))} ${diff < 0 ? "fewer" : "more"} ${noun} per 90`,
    compare: (club, diff) =>
      `${formatDecimal(Math.abs(diff))} ${diff < 0 ? "fewer" : "more"} ${OWNER[club]}${noun} per 90`,
  };
}

function rate(
  id: string,
  label: string,
  made: (t: ClubMatchTotals) => number,
  attempts: (t: ClubMatchTotals) => number,
): PerformanceMetric {
  return {
    id,
    label,
    sample: (totals) => {
      const value = percentage(made(totals), attempts(totals));
      return value === null ? null : { value, weight: attempts(totals) };
    },
    format: formatPercentage,
    describe: (club, diff) =>
      `${POSSESSIVE[club]} ${label.toLowerCase()} is ${Math.round(Math.abs(diff))} points ${diff < 0 ? "lower" : "higher"}`,
    compare: (club, diff) =>
      `${statName(club, label)} ${Math.round(Math.abs(diff))} points ${diff < 0 ? "lower" : "higher"}`,
  };
}

const RATING: PerformanceMetric = {
  id: "rating",
  label: "Average rating",
  sample: (totals) =>
    totals.ratings === 0
      ? null
      : { value: totals.ratingSum / totals.ratings, weight: totals.ratings },
  format: (value) => formatDecimal(value),
  describe: (club, diff) =>
    `${POSSESSIVE[club]} average rating is ${formatDecimal(Math.abs(diff))} ${diff < 0 ? "lower" : "higher"}`,
  compare: (club, diff) =>
    `${statName(club, "Average rating")} ${formatDecimal(Math.abs(diff))} ${diff < 0 ? "lower" : "higher"}`,
};

/** One club's sample of a stat in one Match, or null when it has no counted stats. */
function sampleOf(
  metric: PerformanceMetric,
  club: Club,
  match: Pick<SplitMatch, "secondsPlayed" | Club>,
): WeightedValue | null {
  const totals = match[club];
  return totals ? metric.sample(totals, match.secondsPlayed) : null;
}

/** Every performance stat, in table order. */
export const PERFORMANCE_METRICS: readonly PerformanceMetric[] = [
  perNinety("goals", "goals", "score", (t) => t.goals),
  perNinety("shots", "shots", "take", (t) => t.shots),
  rate(
    "conversion",
    "Conversion",
    (t) => t.goals,
    (t) => t.shots,
  ),
  rate(
    "pass",
    "Pass completion",
    (t) => t.passesMade,
    (t) => t.passAttempts,
  ),
  rate(
    "tackle",
    "Tackle success",
    (t) => t.tacklesMade,
    (t) => t.tackleAttempts,
  ),
  perNinety("saves", "saves", "make", (t) => t.saves),
  perNinety("red-cards", "red cards", "get", (t) => t.redCards),
  RATING,
];

/** One club's average for one stat in Wins and in Dropped Points. */
export interface SplitValues {
  wins: string;
  dropped: string;
}

/** One row of the Outcome Split table. */
export interface PerformanceRow {
  id: string;
  label: string;
  ours: SplitValues;
  opponent: SplitValues;
}

// ---------------------------------------------------------------------------
// Splits: a group of Matches against all the others

/** How often Our Club won a set of Matches. */
export interface WinRecord {
  played: number;
  wins: number;
  /** 0 to 100, or null with no Matches. */
  winPercentage: number | null;
}

export function winRecord(outcomes: readonly Outcome[]): WinRecord {
  return {
    played: outcomes.length,
    wins: outcomes.filter((o) => o === "W").length,
    winPercentage: winPercentage(outcomes),
  };
}

/** A Win record as a labelled bar for `WinRateBarChart`. */
export function winRateBucket(label: string, record: WinRecord): SplitBucket {
  const { played, wins, winPercentage } = record;
  return { label, played, wins, winPercentage: winPercentage ?? 0 };
}

/** The Matches in a group against every other Match. */
export interface GroupSplit {
  group: WinRecord;
  rest: WinRecord;
}

/** Splits Matches by whether they are in a group. */
export function splitBy<T extends { outcome: Outcome }>(
  matches: readonly T[],
  inGroup: (match: T) => boolean,
): GroupSplit {
  const group: Outcome[] = [];
  const rest: Outcome[] = [];
  for (const m of matches) (inGroup(m) ? group : rest).push(m.outcome);
  return { group: winRecord(group), rest: winRecord(rest) };
}

/** One bucket a factor sorts Matches into. */
interface BucketOption {
  id: string;
  label: string;
}

/** Buckets in the given order, skipping empty ones. */
function buckets<T extends { outcome: Outcome }>(
  matches: readonly T[],
  order: readonly BucketOption[],
  bucketOf: (match: T) => string,
): SplitBucket[] {
  const byBucket = groupBy(matches, bucketOf);
  return order.flatMap(({ id, label }) => {
    const group = byBucket.get(id);
    return group
      ? [winRateBucket(label, winRecord(group.map((m) => m.outcome)))]
      : [];
  });
}

/** Our full record over one group of Matches. */
export interface ResultGroup<Id extends string = string> extends WinRecord {
  id: Id;
  label: string;
  draws: number;
  losses: number;
}

/** Groups with enough Matches to show, and the ones hidden for having too few. */
export interface GroupedResults<G> {
  /** The groups with at least `MIN_SPLIT_MATCHES`, in the factor's order. */
  groups: G[];
  /** Groups with too few Matches to show, and how many they have. */
  hidden: { label: string; played: number }[];
}

/**
 * Matches sorted into groups in the given order; Matches `groupOf` gives no
 * group are left out, and groups under `MIN_SPLIT_MATCHES` are hidden. Each
 * group keeps its Matches for any further roll-up.
 */
function groupResults<T extends { outcome: Outcome }, Id extends string>(
  matches: readonly T[],
  order: readonly { id: Id; label: string }[],
  groupOf: (match: T) => Id | null,
): GroupedResults<ResultGroup<Id> & { matches: T[] }> {
  const byGroup = groupBy(matches, groupOf);
  const result: GroupedResults<ResultGroup<Id> & { matches: T[] }> = {
    groups: [],
    hidden: [],
  };
  for (const { id, label } of order) {
    const group = byGroup.get(id) ?? [];
    if (group.length >= MIN_SPLIT_MATCHES) {
      const outcomes = group.map((m) => m.outcome);
      result.groups.push({
        id,
        label,
        ...winRecord(outcomes),
        draws: outcomes.filter((o) => o === "D").length,
        losses: outcomes.filter((o) => o === "L").length,
        matches: group,
      });
    } else if (group.length > 0) {
      result.hidden.push({ label, played: group.length });
    }
  }
  return result;
}

/** London kick-off time bands. */
export const TIME_OF_DAY = [
  { id: "early", label: "Before 18:00" },
  { id: "18", label: "18:00–20:00" },
  { id: "20", label: "20:00–22:00" },
  { id: "late", label: "22:00 or later" },
] as const;

export function timeOfDay(playedAt: Date): (typeof TIME_OF_DAY)[number]["id"] {
  const { hour } = londonParts(playedAt);
  if (hour < 18) return "early";
  if (hour < 20) return "18";
  if (hour < 22) return "20";
  return "late";
}

/** Win % by kick-off time of day (London), earliest first, skipping empty times. */
export function splitByTimeOfDay<
  T extends { outcome: Outcome; playedAt: Date },
>(matches: readonly T[]): SplitBucket[] {
  return buckets(matches, TIME_OF_DAY, (m) => timeOfDay(m.playedAt));
}

export const DAY_TYPES = [
  { id: "weekday", label: "Weekday" },
  { id: "weekend", label: "Weekend" },
] as const;

/** Weekday or weekend, by the London date. */
export function dayType(playedAt: Date): (typeof DAY_TYPES)[number]["id"] {
  const { weekday } = londonParts(playedAt);
  return weekday === "Sat" || weekday === "Sun" ? "weekend" : "weekday";
}

export const SESSION_PLACES = [
  { id: "1", label: "1st" },
  { id: "2", label: "2nd" },
  { id: "3", label: "3rd" },
  { id: "4", label: "4th or later" },
] as const;

export function sessionPlaceBucket(place: number): string {
  return String(Math.min(place, 4));
}

// ---------------------------------------------------------------------------
// Personnel

/** Our Club's record with and without one Squad Member. */
export interface WithWithout extends GroupSplit {
  playerId: string;
  name: string;
  former: boolean;
}

/** A Squad Member at one Position Group, against every other Match. */
export interface PositionOutlier extends GroupSplit {
  playerId: string;
  name: string;
  positionGroup: PositionGroup;
}

/** The Appearance fields personnel splits read. */
type PersonnelAppearance = Pick<
  SquadAppearance,
  "matchId" | "playerId" | "name" | "positionGroup"
>;

/** Each Squad Member's Win % with and without them, most Matches first. */
export function withAndWithout(
  matches: readonly SplitMatch[],
  appearances: readonly PersonnelAppearance[],
): WithWithout[] {
  return [...groupBy(appearances, (a) => a.playerId).entries()]
    .map(([playerId, apps]) => {
      const played = new Set(apps.map((a) => a.matchId));
      return {
        playerId,
        name: apps[apps.length - 1].name,
        former: isFormerSquadMember(playerId),
        ...splitBy(matches, (m) => played.has(m.matchId)),
      };
    })
    .sort(
      (a, b) => b.group.played - a.group.played || a.name.localeCompare(b.name),
    );
}

/**
 * "Squad Member at Position Group" against every other Match, kept only with
 * at least `MIN_SPLIT_MATCHES` on each side and a Win-rate gap of at least
 * `POSITION_OUTLIER_GAP` points. Biggest gap first.
 */
export function positionOutliers(
  matches: readonly SplitMatch[],
  appearances: readonly PersonnelAppearance[],
): PositionOutlier[] {
  const rated = appearances.filter(
    (a): a is PersonnelAppearance & { positionGroup: PositionGroup } =>
      a.positionGroup !== null,
  );
  return [...groupBy(rated, (a) => `${a.playerId}:${a.positionGroup}`).values()]
    .map((apps) => {
      const played = new Set(apps.map((a) => a.matchId));
      return {
        playerId: apps[0].playerId,
        name: apps[apps.length - 1].name,
        positionGroup: apps[0].positionGroup,
        ...splitBy(matches, (m) => played.has(m.matchId)),
      };
    })
    .filter((o) => isComparable(o) && Math.abs(gap(o)) >= POSITION_OUTLIER_GAP)
    .sort((a, b) => Math.abs(gap(b)) - Math.abs(gap(a)));
}

/** The squad sizes Matches were played with, fewest first, as buckets. */
function squadSizes(matches: readonly SplitMatch[]): BucketOption[] {
  return [...new Set(matches.map((m) => m.squadSize))]
    .sort((a, b) => a - b)
    .map((size) => ({ id: String(size), label: `${size} playing` }));
}

function squadSizeOf(match: SplitMatch): string {
  return String(match.squadSize);
}

// ---------------------------------------------------------------------------
// After a result (CLUBS-26): does a bad result lead to another?

/** Which Match counts as the one after a result. */
export const AFTER_RESULT_SCOPES = [
  { id: "any-next", label: "Any next Match" },
  { id: "same-session", label: "Same Session" },
] as const;

export type AfterResultScope = (typeof AFTER_RESULT_SCOPES)[number]["id"];

/** Our Win rate in the Match after a Win against the Match after Dropped Points. */
export interface AfterResultSplit {
  scope: AfterResultScope;
  label: string;
  afterWin: WinRecord;
  afterDropped: WinRecord;
  /** Both sides have `MIN_SPLIT_MATCHES`; otherwise the split is hidden and makes no finding. */
  comparable: boolean;
}

/**
 * Each Match (oldest first, already filtered) paired with the next one: the
 * next in the list whatever the gap, or only when it is in the same Session.
 * With only League selected, the Match after a League Match is the next
 * League Match.
 */
export function afterResult(
  matches: readonly Pick<SplitMatch, "outcome" | "session">[],
): AfterResultSplit[] {
  const pairs = matches
    .slice(1)
    .map((next, i) => ({ previous: matches[i], next }));
  return AFTER_RESULT_SCOPES.map(({ id, label }) => {
    const afterWin: Outcome[] = [];
    const afterDropped: Outcome[] = [];
    for (const { previous, next } of pairs) {
      if (id === "same-session" && previous.session !== next.session) continue;
      (previous.outcome === "W" ? afterWin : afterDropped).push(next.outcome);
    }
    const winRecords = {
      afterWin: winRecord(afterWin),
      afterDropped: winRecord(afterDropped),
    };
    return {
      scope: id,
      label,
      ...winRecords,
      comparable: isComparable({
        group: winRecords.afterDropped,
        rest: winRecords.afterWin,
      }),
    };
  });
}

/** "After a draw or defeat in the same Session we win 20% (5 Matches) vs 60% after a Win (5)". */
function afterResultFinding({
  scope,
  afterWin,
  afterDropped,
}: AfterResultSplit): RankedFinding | null {
  const when = scope === "same-session" ? " in the same Session" : "";
  const droppedCount = formatCount(afterDropped.played, "Match", "Matches");
  return winRateFinding(
    `after-${scope}`,
    "After a result",
    { group: afterDropped, rest: afterWin },
    {
      text: `After a draw or defeat${when} we win ${formatPercentage(afterDropped.winPercentage)} (${droppedCount}) vs ${formatPercentage(afterWin.winPercentage)} after a Win (${afterWin.played})`,
      counts: `${droppedCount} after a draw or defeat, ${afterWin.played} after a Win${when}`,
    },
  );
}

// ---------------------------------------------------------------------------
// Opponent strength (CLUBS-29): bad nights or tough draws?

/** The Outcome Split highlights each strength group shows, in table order: one club's stat each. */
export const STRENGTH_HIGHLIGHTS = [
  { id: "goals", label: "Goals per 90", club: "ours", metric: "goals" },
  {
    id: "conceded",
    label: "Conceded per 90",
    club: "opponent",
    metric: "goals",
  },
  { id: "shots", label: "Shots per 90", club: "ours", metric: "shots" },
  { id: "pass", label: "Pass completion", club: "ours", metric: "pass" },
  { id: "rating", label: "Average rating", club: "ours", metric: "rating" },
] as const satisfies readonly {
  id: string;
  label: string;
  club: Club;
  metric: string;
}[];

export type StrengthHighlightId = (typeof STRENGTH_HIGHLIGHTS)[number]["id"];

/** Our record against one strength of Opponent, with its Outcome Split highlights. */
export interface StrengthGroup extends ResultGroup<OpponentStrength> {
  /** Formatted averages over the group's Matches, by highlight. */
  highlights: Record<StrengthHighlightId, string>;
}

export interface ByStrength extends GroupedResults<StrengthGroup> {
  /** Matches left out because either club's Skill Rating is missing. */
  unrated: number;
}

/** Our rated Matches grouped by the Opponent's strength; groups under `MIN_SPLIT_MATCHES` are hidden. */
export function byOpponentStrength(matches: readonly SplitMatch[]): ByStrength {
  const rated = matches.filter((m) => m.ratingGap !== null);
  const { groups, hidden } = groupResults(rated, OPPONENT_STRENGTHS, (m) =>
    opponentStrength(m.ratingGap),
  );
  return {
    groups: groups.map(({ matches, ...group }) => ({
      ...group,
      highlights: strengthHighlights(matches),
    })),
    hidden,
    unrated: matches.length - rated.length,
  };
}

function strengthHighlights(
  matches: readonly SplitMatch[],
): Record<StrengthHighlightId, string> {
  return Object.fromEntries(
    STRENGTH_HIGHLIGHTS.map(({ id, club, metric }) => [
      id,
      clubAverage(metricById(metric), club, matches),
    ]),
  ) as Record<StrengthHighlightId, string>;
}

function metricById(id: string): PerformanceMetric {
  const metric = PERFORMANCE_METRICS.find((m) => m.id === id);
  if (!metric) throw new Error(`Unknown performance metric ${id}`);
  return metric;
}

/** One club's formatted average for a stat over some Matches, weighted like the Outcome Split. */
function clubAverage(
  metric: PerformanceMetric,
  club: Club,
  matches: readonly SplitMatch[],
): string {
  const mean = weightedMean(
    withoutNulls(matches.map((m) => sampleOf(metric, club, m))),
  );
  return mean === null ? NO_VALUE : metric.format(mean);
}

/** "Against Stronger Opponents we win 20% (5) vs 70% against Weaker (6)": the two most different groups shown. */
function strengthFinding({ groups }: ByStrength): RankedFinding | null {
  if (groups.length < 2) return null;
  const strongest = groups[0];
  const weakest = groups[groups.length - 1];
  return winRateFinding(
    "strength",
    "Opponent strength",
    { group: strongest, rest: weakest },
    {
      text: `Against ${strongest.label} Opponents we win ${formatPercentage(strongest.winPercentage)} (${strongest.played}) vs ${formatPercentage(weakest.winPercentage)} against ${weakest.label} (${weakest.played})`,
      counts: `${formatCount(strongest.played, "Match", "Matches")} against ${strongest.label} Opponents, ${weakest.played} against ${weakest.label}`,
    },
  );
}

// ---------------------------------------------------------------------------
// Opponent humans (CLUBS-49): how many people were we up against?

/** The Opponent's humans in bands, up to a full side of 11. */
export const HUMAN_BANDS = [
  { id: "1-3", label: "1–3 humans", from: 1, to: 3 },
  { id: "4-6", label: "4–6 humans", from: 4, to: 6 },
  { id: "7-9", label: "7–9 humans", from: 7, to: 9 },
  { id: "10-11", label: "10–11 humans", from: 10, to: 11 },
] as const;

export type HumanBand = (typeof HUMAN_BANDS)[number]["id"];

/** The band an Opponent's humans fall in, or null with none recorded. */
export function humanBand(humans: number): HumanBand | null {
  return (
    HUMAN_BANDS.find((b) => humans >= b.from && humans <= b.to)?.id ?? null
  );
}

/** A gap of this many humans or more, either way, is "much" fewer or more; under it, "slightly". */
export const MUCH_HUMANS_GAP = 3;

/** The Opponent's humans against our Squad Members playing, fewest first. */
export const HUMANS_AGAINST_OURS = [
  {
    id: "much-fewer",
    label: "Much fewer",
    phrase: `at least ${MUCH_HUMANS_GAP} fewer humans than us`,
  },
  {
    id: "slightly-fewer",
    label: "Slightly fewer",
    phrase: `1–${MUCH_HUMANS_GAP - 1} fewer humans than us`,
  },
  { id: "same", label: "Same", phrase: "as many humans as us" },
  {
    id: "slightly-more",
    label: "Slightly more",
    phrase: `1–${MUCH_HUMANS_GAP - 1} more humans than us`,
  },
  {
    id: "much-more",
    label: "Much more",
    phrase: `at least ${MUCH_HUMANS_GAP} more humans than us`,
  },
] as const;

export type HumansAgainstOurs = (typeof HUMANS_AGAINST_OURS)[number]["id"];

/** How the Opponent's humans compared with ours, or null when either side is unknown. */
export function humansAgainstOurs({
  opponentHumans,
  squadSize,
}: Pick<SplitMatch, "opponentHumans" | "squadSize">): HumansAgainstOurs | null {
  if (opponentHumans === 0 || squadSize === 0) return null;
  const gap = opponentHumans - squadSize;
  if (gap === 0) return "same";
  const size = Math.abs(gap) >= MUCH_HUMANS_GAP ? "much" : "slightly";
  return `${size}-${gap < 0 ? "fewer" : "more"}`;
}

/** "4 humans": the label of an exact count. */
export function humansLabel(humans: number): string {
  return formatCount(humans, "human", "humans");
}

/** Our record against one number of Opponent humans, with how often either side quit. */
export interface HumansGroup<Id extends string = string>
  extends ResultGroup<Id> {
  /** DNFs we quit (DNF losses). */
  weQuit: number;
  /** 0 to 100 of the group's Matches. */
  weQuitPercentage: number;
  /** DNFs the Opponent quit (DNF Wins). */
  theyQuit: number;
  theyQuitPercentage: number;
}

export interface ByOpponentHumans {
  /** By the exact count, fewest first. */
  exact: GroupedResults<HumansGroup>;
  /** By `HUMAN_BANDS`. */
  bands: GroupedResults<HumansGroup<HumanBand>>;
  /** By `HUMANS_AGAINST_OURS`. */
  againstOurs: GroupedResults<HumansGroup<HumansAgainstOurs>>;
  /** Matches left out because EA listed none of the Opponent's players. */
  unknown: number;
}

/** Our Matches grouped by the Opponent's humans; groups under `MIN_SPLIT_MATCHES` are hidden. */
export function byOpponentHumans(
  matches: readonly SplitMatch[],
): ByOpponentHumans {
  const known = matches.filter((m) => m.opponentHumans > 0);
  const counts = [...new Set(known.map((m) => m.opponentHumans))]
    .sort((a, b) => a - b)
    .map((n) => ({ id: String(n), label: humansLabel(n) }));
  return {
    exact: withQuits(
      groupResults(known, counts, (m) => String(m.opponentHumans)),
    ),
    bands: withQuits(
      groupResults(known, HUMAN_BANDS, (m) => humanBand(m.opponentHumans)),
    ),
    againstOurs: withQuits(
      groupResults(known, HUMANS_AGAINST_OURS, humansAgainstOurs),
    ),
    unknown: matches.length - known.length,
  };
}

/** Each group's DNFs by the side that quit, in place of its Matches. */
function withQuits<Id extends string>({
  groups,
  hidden,
}: GroupedResults<ResultGroup<Id> & { matches: SplitMatch[] }>): GroupedResults<
  HumansGroup<Id>
> {
  return {
    groups: groups.map(({ matches, ...group }) => {
      const quits = matches.map(quitBy);
      const weQuit = quits.filter((q) => q === "us").length;
      const theyQuit = quits.filter((q) => q === "opponent").length;
      return {
        ...group,
        weQuit,
        weQuitPercentage: percentage(weQuit, group.played) ?? 0,
        theyQuit,
        theyQuitPercentage: percentage(theyQuit, group.played) ?? 0,
      };
    }),
    hidden,
  };
}

/** Each band, and each gap against our numbers, against the rest of the Matches with the Opponent's humans known. */
function humanFindings(matches: readonly SplitMatch[]): RankedFinding[] {
  const known = matches.filter((m) => m.opponentHumans > 0);
  return [
    ...bucketFindings(
      "Opponent humans",
      "humans",
      known,
      HUMAN_BANDS,
      (m) => humanBand(m.opponentHumans) ?? "",
      ({ label }) => ({
        group: `against Opponents with ${label}`,
        rest: "otherwise",
        counts: [`against ${label}`, "otherwise"],
      }),
    ),
    ...bucketFindings(
      "Opponent humans",
      "humans-against-ours",
      known,
      HUMANS_AGAINST_OURS,
      (m) => humansAgainstOurs(m) ?? "",
      ({ phrase }) => ({
        group: `against Opponents with ${phrase}`,
        rest: "otherwise",
        counts: [`against ${phrase}`, "otherwise"],
      }),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Findings

export type Factor =
  | "Performance"
  | "Personnel"
  | "Circumstances"
  | "After a result"
  | "Opponent strength"
  | "Opponent humans";

/** One plain-English difference between Wins and Dropped Points. */
export interface Finding {
  id: string;
  factor: Factor;
  text: string;
  /** The Matches behind it: "12 Wins, 9 draws and defeats". */
  counts: string;
  /** Either side has fewer than `SMALL_SAMPLE_MATCHES` Matches. */
  smallSample: boolean;
}

interface RankedFinding extends Finding {
  /** |Cohen's d| or |Cohen's h|: one scale for every factor. */
  strength: number;
}

/** Both sides have enough Matches to say anything. */
function isComparable({ group, rest }: GroupSplit): boolean {
  return group.played >= MIN_SPLIT_MATCHES && rest.played >= MIN_SPLIT_MATCHES;
}

/** Group Win % minus the rest's, in points. */
function gap({ group, rest }: GroupSplit): number {
  return (group.winPercentage ?? 0) - (rest.winPercentage ?? 0);
}

/** Group Win % minus the rest's, in points, or null until both sides have `MIN_SPLIT_MATCHES`. */
export function winRateGap(split: GroupSplit): number | null {
  return isComparable(split) ? gap(split) : null;
}

function isSmall(a: number, b: number): boolean {
  return Math.min(a, b) < SMALL_SAMPLE_MATCHES;
}

/** How a split's finding names its group and the rest. */
interface SplitWords {
  /** Follows "of Matches": "with Star Striker". */
  group: string;
  rest: string;
  /** Follow each side's count: ["with", "without"]. */
  counts: [string, string];
}

/** A Win-rate split as a finding ranked by Cohen's h, or null when either side is too small. */
function winRateFinding(
  id: string,
  factor: Factor,
  split: GroupSplit,
  { text, counts }: Pick<Finding, "text" | "counts">,
): RankedFinding | null {
  if (!isComparable(split)) return null;
  const { group, rest } = split;
  return {
    id,
    factor,
    text,
    counts,
    smallSample: isSmall(group.played, rest.played),
    strength: Math.abs(
      winRateEffectSize(group.winPercentage ?? 0, rest.winPercentage ?? 0),
    ),
  };
}

/** A group against the rest as a finding, or null when either side is too small. */
function splitFinding(
  id: string,
  factor: Factor,
  split: GroupSplit,
  words: SplitWords,
): RankedFinding | null {
  const { group, rest } = split;
  return winRateFinding(id, factor, split, {
    text: `We win ${formatPercentage(group.winPercentage)} of Matches ${words.group}, against ${formatPercentage(rest.winPercentage)} ${words.rest}`,
    counts: `${formatCount(group.played, "Match", "Matches")} ${words.counts[0]}, ${rest.played} ${words.counts[1]}`,
  });
}

/** Each bucket against the rest; a two-bucket factor gives one finding, not its mirror. */
function bucketFindings<B extends BucketOption>(
  factor: Factor,
  idPrefix: string,
  matches: readonly SplitMatch[],
  order: readonly B[],
  bucketOf: (m: SplitMatch) => string,
  words: (bucket: B) => SplitWords,
): RankedFinding[] {
  const options = order.length === 2 ? order.slice(1) : order;
  return withoutNulls(
    options.map((bucket) =>
      splitFinding(
        `${idPrefix}-${bucket.id}`,
        factor,
        splitBy(matches, (m) => bucketOf(m) === bucket.id),
        words(bucket),
      ),
    ),
  );
}

function withoutNulls<T>(items: readonly (T | null)[]): T[] {
  return items.filter((item): item is T => item !== null);
}

// ---------------------------------------------------------------------------
// The whole Outcome Split

export interface OutcomeSplit {
  record: { wins: number; dropped: number };
  /** Matches each side rage quit: its performance stats leave them out. */
  rageQuits: Record<QuitBy, number>;
  /** Whether both sides have `MIN_SPLIT_MATCHES`; otherwise only `record` is meaningful. */
  ready: boolean;
  findings: Finding[];
  performance: PerformanceRow[];
  withWithout: WithWithout[];
  bySquadSize: SplitBucket[];
  positionOutliers: PositionOutlier[];
  byTimeOfDay: SplitBucket[];
  byDayType: SplitBucket[];
  bySessionPlace: SplitBucket[];
  /** Win % after a Win against after Dropped Points, one per `AFTER_RESULT_SCOPES`. */
  afterResult: AfterResultSplit[];
  /** Rated Matches by the Opponent's strength (CLUBS-29). */
  byStrength: ByStrength;
  /** Matches by the Opponent's humans (CLUBS-49). */
  byHumans: ByOpponentHumans;
  /** Win % over the last `ROLLING_WIN_WINDOW` Matches at each Match, oldest first. */
  rollingWinPercentage: number[];
}

/**
 * The Outcome Split of Our Club's Matches (oldest first) and Appearances.
 * The Appearances are every Squad Member's in those Matches: personnel
 * splits are about who played, so a Position Group selection never narrows
 * them.
 */
export function outcomeSplit(
  matches: readonly SplitMatch[],
  appearances: readonly PersonnelAppearance[],
): OutcomeSplit {
  const outcomes = matches.map((m) => m.outcome);
  const wins = outcomes.filter((o) => o === "W").length;
  const record = { wins, dropped: outcomes.length - wins };
  const ready = Math.min(record.wins, record.dropped) >= MIN_SPLIT_MATCHES;

  const performance = PERFORMANCE_METRICS.flatMap((metric) =>
    CLUBS.map((club) => performanceSplit(metric, club, matches)),
  );
  const withWithoutRows = withAndWithout(matches, appearances);
  const outliers = positionOutliers(matches, appearances);
  const sizes = squadSizes(matches);
  const afterResultSplits = afterResult(matches);
  const strength = byOpponentStrength(matches);
  // A Squad Member who only ever plays one Position Group would say the same
  // thing twice: once with and without them, once as an outlier.
  const withCounts = new Set(
    withWithoutRows.map((row) => `${row.playerId}:${row.group.played}`),
  );

  const findings: RankedFinding[] = ready
    ? [
        ...withoutNulls(performance.map((p) => p.finding)),
        ...withoutNulls(
          withWithoutRows.map((row) =>
            splitFinding(`with-${row.playerId}`, "Personnel", row, {
              group: `with ${row.name}`,
              rest: "without",
              counts: ["with", "without"],
            }),
          ),
        ),
        ...bucketFindings(
          "Personnel",
          "squad",
          matches,
          sizes,
          squadSizeOf,
          ({ id }) => {
            const squad = formatCount(
              Number(id),
              "Squad Member",
              "Squad Members",
            );
            return {
              group: `with ${squad} playing`,
              rest: "otherwise",
              counts: [`with ${squad}`, "otherwise"],
            };
          },
        ),
        ...withoutNulls(
          outliers
            .filter((o) => !withCounts.has(`${o.playerId}:${o.group.played}`))
            .map((o) =>
              splitFinding(
                `outlier-${o.playerId}-${o.positionGroup}`,
                "Personnel",
                o,
                {
                  group: `with ${o.name} at ${o.positionGroup}`,
                  rest: "otherwise",
                  counts: ["with", "otherwise"],
                },
              ),
            ),
        ),
        ...bucketFindings(
          "Circumstances",
          "time",
          matches,
          TIME_OF_DAY,
          (m) => timeOfDay(m.playedAt),
          ({ label }) => ({
            group: `kicking off ${lowerFirst(label)}`,
            rest: "at other times",
            counts: ["then", "at other times"],
          }),
        ),
        ...bucketFindings(
          "Circumstances",
          "day",
          matches,
          DAY_TYPES,
          (m) => dayType(m.playedAt),
          () => ({
            group: "at weekends",
            rest: "on weekdays",
            counts: ["at weekends", "on weekdays"],
          }),
        ),
        ...bucketFindings(
          "Circumstances",
          "session",
          matches,
          SESSION_PLACES,
          (m) => sessionPlaceBucket(m.sessionPlace),
          ({ label }) => ({
            group: `played ${label} in a Session`,
            rest: "otherwise",
            counts: [label, "otherwise"],
          }),
        ),
        ...withoutNulls(afterResultSplits.map(afterResultFinding)),
        ...withoutNulls([strengthFinding(strength)]),
        ...humanFindings(matches),
      ]
    : [];

  return {
    record,
    rageQuits: {
      us: matches.filter((m) => quitBy(m) === "us").length,
      opponent: matches.filter((m) => quitBy(m) === "opponent").length,
    },
    ready,
    findings: findings
      .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))
      .slice(0, TOP_FINDINGS)
      .map(({ strength: _, ...finding }) => finding),
    performance: PERFORMANCE_METRICS.map((metric, i) => ({
      id: metric.id,
      label: metric.label,
      ours: performance[i * 2].values,
      opponent: performance[i * 2 + 1].values,
    })),
    withWithout: withWithoutRows,
    bySquadSize: buckets(matches, sizes, squadSizeOf),
    positionOutliers: outliers,
    byTimeOfDay: splitByTimeOfDay(matches),
    byDayType: buckets(matches, DAY_TYPES, (m) => dayType(m.playedAt)),
    bySessionPlace: buckets(matches, SESSION_PLACES, (m) =>
      sessionPlaceBucket(m.sessionPlace),
    ),
    afterResult: afterResultSplits,
    byStrength: strength,
    byHumans: byOpponentHumans(matches),
    rollingWinPercentage: rollingWinPercentage(outcomes),
  };
}

/** One club's stat in Wins and Dropped Points, and its finding when both sides are big enough. */
function performanceSplit(
  metric: PerformanceMetric,
  club: Club,
  matches: readonly SplitMatch[],
): { values: SplitValues; finding: RankedFinding | null } {
  const samples: Record<OutcomeSide, WeightedValue[]> = {
    wins: [],
    dropped: [],
  };
  for (const m of matches) {
    const sample = sampleOf(metric, club, m);
    if (sample) samples[outcomeSide(m.outcome)].push(sample);
  }
  const wins = weightedMean(samples.wins);
  const dropped = weightedMean(samples.dropped);
  const format = (v: number | null) =>
    v === null ? NO_VALUE : metric.format(v);
  const values = { wins: format(wins), dropped: format(dropped) };

  const n = { wins: samples.wins.length, dropped: samples.dropped.length };
  const effect = effectSize(samples.dropped, samples.wins);
  if (
    wins === null ||
    dropped === null ||
    effect === null ||
    // A gap too small to show ("7.7 vs 7.7") says nothing in words either.
    values.wins === values.dropped ||
    Math.min(n.wins, n.dropped) < MIN_SPLIT_MATCHES
  ) {
    return { values, finding: null };
  }
  return {
    values,
    finding: {
      id: `${club}-${metric.id}`,
      factor: "Performance",
      text: `In draws and defeats ${metric.describe(club, dropped - wins)} than in Wins (${values.dropped} vs ${values.wins})`,
      counts: `${formatCount(n.wins, "Win", "Wins")}, ${formatDroppedCount(n.dropped)}`,
      smallSample: isSmall(n.wins, n.dropped),
      strength: Math.abs(effect),
    },
  };
}

// ---------------------------------------------------------------------------
// Why we dropped points (CLUBS-27): one Match against a typical Win

/** How many deviations the Match page shows. */
export const TOP_DEVIATIONS = 3;

/** One Match's performance, as the Outcome Split reads it. */
export type MatchPerformance = Pick<
  SplitMatch,
  "secondsPlayed" | "ours" | "opponent"
>;

/** One stat where a Match differed from a typical Win, or from every Match (`matchAngle`). */
export interface Deviation {
  id: string;
  club: Club;
  /** "6.1 fewer shots per 90 than in a typical Win (5.9 vs 12.0)", or "than usual" for an angle. */
  text: string;
  /** Standard deviations of the stat across the baseline, signed; infinite when it never varies. */
  standardDeviations: number;
}

/** A Dropped Points Match against the average Win. */
export interface DroppedPointsReasons {
  /** How many Wins it is compared against. */
  wins: number;
  /** The biggest deviations, biggest first; empty when nothing differed. */
  deviations: Deviation[];
}

/**
 * The `TOP_DEVIATIONS` stats in which a Match differed most from the Wins,
 * measured in standard deviations of each stat across the Wins (both clubs,
 * per 90 over how long each Match ran, as in the Outcome Split). Null with
 * fewer than `MIN_SPLIT_MATCHES` Wins.
 */
export function droppedPointsReasons(
  match: MatchPerformance,
  wins: readonly MatchPerformance[],
): DroppedPointsReasons | null {
  if (wins.length < MIN_SPLIT_MATCHES) return null;
  const candidates = withoutNulls(
    PERFORMANCE_METRICS.flatMap((metric) =>
      CLUBS.map((club) =>
        deviationFrom(metric, club, match, wins, "in a typical Win"),
      ),
    ),
  );
  return {
    wins: wins.length,
    deviations: biggestFirst(candidates)
      .slice(0, TOP_DEVIATIONS)
      .map((c) => c.deviation),
  };
}

/**
 * A Match's angle (CLUBS-48): the one stat, either club's, in which it
 * differed most from every other Match given, e.g. "4.0 more Opponent shots
 * per 90 than usual (19.0 vs 15.0)". Write-ups lead with it so reports don't
 * all follow the same pattern. Null with fewer than `MIN_SPLIT_MATCHES`
 * others or when nothing differed.
 */
export function matchAngle(
  match: MatchPerformance,
  others: readonly MatchPerformance[],
): Deviation | null {
  const candidates = withoutNulls(
    PERFORMANCE_METRICS.flatMap((metric) =>
      CLUBS.map((club) => deviationFrom(metric, club, match, others, "usual")),
    ),
  );
  return biggestFirst(candidates)[0]?.deviation ?? null;
}

type Candidate = { deviation: Deviation; relativeChange: number };

/** Biggest deviation first; a baseline that never varies makes every difference infinite, so the bigger relative change leads. */
function biggestFirst(candidates: Candidate[]): Candidate[] {
  return candidates.sort(
    (a, b) =>
      Math.abs(b.deviation.standardDeviations) -
        Math.abs(a.deviation.standardDeviations) ||
      b.relativeChange - a.relativeChange,
  );
}

/** One stat of `match` against the same stat across `baseline`, described as "than <against>". */
function deviationFrom(
  metric: PerformanceMetric,
  club: Club,
  match: MatchPerformance,
  baseline: readonly MatchPerformance[],
  against: string,
): Candidate | null {
  const sample = sampleOf(metric, club, match);
  const baseSamples = withoutNulls(
    baseline.map((w) => sampleOf(metric, club, w)),
  );
  if (!sample || baseSamples.length < MIN_SPLIT_MATCHES) return null;
  const typical = weightedMean(baseSamples);
  const score = standardScore(sample.value, baseSamples);
  // A score of 0 is no difference at all.
  if (typical === null || !score) return null;
  const shown = metric.format(sample.value);
  const typicalShown = metric.format(typical);
  // A gap too small to show ("7.7 vs 7.7") says nothing in words either.
  if (shown === typicalShown) return null;
  const diff = sample.value - typical;
  return {
    deviation: {
      id: `${club}-${metric.id}`,
      club,
      text: `${metric.compare(club, diff)} than ${against} (${shown} vs ${typicalShown})`,
      standardDeviations: score,
    },
    relativeChange: typical === 0 ? Infinity : Math.abs(diff / typical),
  };
}

// ---------------------------------------------------------------------------
// Compared with your usual (CLUBS-34): one Session against every Match

/** The stats a Session is compared on, as `[club, metric id]`, in order. */
const USUAL_STATS: ReadonlyArray<readonly [Club, string]> = [
  ["ours", "goals"],
  ["opponent", "goals"],
  ["ours", "shots"],
  ["ours", "pass"],
  ["ours", "tackle"],
  ["ours", "rating"],
];

/** One stat over a set of Matches beside Our Club's usual. */
export interface UsualComparisonRow {
  id: string;
  /** "Goals per 90", "Opponent goals per 90". */
  label: string;
  /** Over the set, e.g. one Session's Matches. */
  value: string;
  /** Over every Match. */
  usual: string;
}

/**
 * A set of Matches (one Session's) beside the average over every Match
 * (`usual`, which includes the set), with the Outcome Split's per-90 and
 * rate formulas. Null until `MIN_SPLIT_MATCHES` Matches fall outside the
 * set, since a usual made mostly of the set itself says nothing.
 */
export function usualComparison(
  set: readonly MatchPerformance[],
  usual: readonly MatchPerformance[],
): UsualComparisonRow[] | null {
  if (usual.length - set.length < MIN_SPLIT_MATCHES) return null;
  return USUAL_STATS.flatMap(([club, id]) => {
    const metric = PERFORMANCE_METRICS.find((m) => m.id === id);
    if (!metric) return [];
    const mean = (from: readonly MatchPerformance[]) => {
      const value = weightedMean(
        withoutNulls(from.map((m) => sampleOf(metric, club, m))),
      );
      return value === null ? NO_VALUE : metric.format(value);
    };
    return [
      {
        id: `${club}-${id}`,
        label: statName(club, metric.label),
        value: mean(set),
        usual: mean(usual),
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// One Squad Member

/** A Squad Member's record at one Position Group. */
export interface PositionGroupWinRecord extends WinRecord {
  /** Null for Appearances where EA sent no position. */
  positionGroup: PositionGroup | null;
}

/** A Squad Member's stats in Wins against Dropped Points. */
export interface PlayerOutcomeSplit {
  wins: PlayerTotals;
  dropped: PlayerTotals;
  /** Win % by Position Group, most Appearances first. */
  byPositionGroup: PositionGroupWinRecord[];
}

/**
 * One Squad Member's Outcome Split over their Appearances (oldest first), in
 * the selected Position Groups. Per-90s use their own minutes. Shared by the
 * Analysis page's per-player table and the profile's panel.
 */
export function playerOutcomeSplit(
  appearances: readonly SquadAppearance[],
  positionGroups: PositionGroupSelection,
): PlayerOutcomeSplit {
  const selected = filterByPositionGroups(appearances, positionGroups);
  return {
    wins: summariseAppearances(
      selected.filter((a) => outcomeSide(a.outcome) === "wins"),
    ),
    dropped: summariseAppearances(
      selected.filter((a) => outcomeSide(a.outcome) === "dropped"),
    ),
    byPositionGroup: [...groupBy(selected, (a) => a.positionGroup).entries()]
      .map(([positionGroup, apps]) => ({
        positionGroup,
        ...winRecord(apps.map((a) => a.outcome)),
      }))
      .sort((a, b) => b.played - a.played),
  };
}

/**
 * A Squad Member's Swing (CLUBS-70): Our Club's record when they rated at or
 * above their own average against when they rated below it. A big gap means
 * results follow how they play; a small one beside a high rating means their
 * rating does not move the result. EA rates winners higher, so most gaps are
 * positive: compare Squad Members with each other.
 */
export interface Swing {
  /** Our record in the Matches they rated at or above their own average. */
  above: WinRecord;
  /** Our record in the Matches they rated below it. */
  below: WinRecord;
  /** `above` minus `below` Win %, in points; null under `MIN_SPLIT_MATCHES` on either side. */
  gap: number | null;
  /** Either side under `SMALL_SAMPLE_MATCHES`. */
  smallSample: boolean;
}

/** A Squad Member's Swing over their counted, rated Appearances (in the Position Groups wanted). */
export function swing(appearances: readonly SquadAppearance[]): Swing {
  const rated = appearances.flatMap((a) =>
    a.rating !== null && isCountedAppearance(a)
      ? [{ rating: a.rating, outcome: a.outcome }]
      : [],
  );
  const mean = average(rated.map((a) => a.rating)) ?? 0;
  const record = (keep: (rating: number) => boolean) =>
    winRecord(rated.filter((a) => keep(a.rating)).map((a) => a.outcome));
  const above = record((r) => r >= mean);
  const below = record((r) => r < mean);
  const gap = winRateGap({ group: above, rest: below });
  return {
    above,
    below,
    gap,
    smallSample: gap !== null && isSmall(above.played, below.played),
  };
}

/** Swing and consistency, the two ways a Squad Member's ratings tell (CLUBS-70, CLUBS-74). */
export function playerRatingProfile(appearances: readonly SquadAppearance[]): {
  swing: Swing;
  consistency: Consistency;
} {
  return { swing: swing(appearances), consistency: consistency(appearances) };
}

/** A row of the Analysis page's per-player table. */
export interface PlayerSplitRow extends PlayerOutcomeSplit {
  playerId: string;
  name: string;
  former: boolean;
  /** Their Swing in the selected Position Groups (CLUBS-70). */
  swing: Swing;
  /** Their Floor and Spread in the same Appearances (CLUBS-74). */
  consistency: Consistency;
}

/**
 * Every Squad Member with an Appearance in the selected Position Groups,
 * most Appearances first.
 */
export function playerSplits(
  appearances: readonly SquadAppearance[],
  positionGroups: PositionGroupSelection,
): PlayerSplitRow[] {
  return [...groupBy(appearances, (a) => a.playerId).entries()]
    .map(([playerId, apps]) => ({
      playerId,
      name: apps[apps.length - 1].name,
      former: isFormerSquadMember(playerId),
      ...playerOutcomeSplit(apps, positionGroups),
      ...playerRatingProfile(filterByPositionGroups(apps, positionGroups)),
    }))
    .filter((row) => totalAppearances(row) > 0)
    .sort(
      (a, b) =>
        totalAppearances(b) - totalAppearances(a) ||
        a.name.localeCompare(b.name),
    );
}

function totalAppearances({ wins, dropped }: PlayerOutcomeSplit): number {
  return wins.appearances + dropped.appearances;
}

/** One stat in a Squad Member's Outcome Split, as the profile panel and the per-player table show it. */
export interface PlayerSplitStat {
  id: string;
  label: string;
  /** A column header's prefix: "G/90". */
  short: string;
  value: (totals: PlayerTotals) => number | null;
  format: (value: number | null) => string;
}

function perNinetyFormat(value: number | null): string {
  return formatDecimal(value, 2);
}

/** The stats both views set side by side, in order. */
export const PLAYER_SPLIT_STATS: readonly PlayerSplitStat[] = [
  {
    id: "apps",
    label: "Appearances",
    short: "Played",
    value: (t) => t.appearances,
    format: (v) => String(v ?? 0),
  },
  {
    id: "rating",
    label: "Average rating",
    short: "Rating",
    value: (t) => t.averageRating,
    format: (v) => formatDecimal(v),
  },
  {
    id: "goals",
    label: "Goals per 90",
    short: "G/90",
    value: (t) => t.goalsPer90,
    format: perNinetyFormat,
  },
  {
    id: "assists",
    label: "Assists per 90",
    short: "A/90",
    value: (t) => t.assistsPer90,
    format: perNinetyFormat,
  },
  {
    id: "shots",
    label: "Shots per 90",
    short: "Shots/90",
    value: (t) => t.shotsPer90,
    format: perNinetyFormat,
  },
  {
    id: "pass",
    label: "Pass completion",
    short: "Pass %",
    value: (t) => t.passPercentage,
    format: formatPercentage,
  },
  {
    id: "tackle",
    label: "Tackle success",
    short: "Tackle %",
    value: (t) => t.tacklePercentage,
    format: formatPercentage,
  },
];

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
