/**
 * Milestones (CLUBS-36): what counts, and how each is detected. Pure, so the
 * rules are unit tested; `app/milestones/record.ts` feeds it from D1 after
 * each Poll, and pages read the stored rows (`milestones-query.ts`).
 *
 * Three sources:
 * - **Landmarks** (50th goal, 100th Win) come from EA's career totals in
 *   Snapshots: a crossing is found between two Snapshots and pinned to the
 *   Match that took the total over, walking the Matches between them in
 *   kick-off order. A threshold passed before the first Snapshot is never
 *   reported, and a crossing the recorded Matches cannot account for is
 *   skipped rather than guessed.
 * - **Feats** (a hat-trick, a Perfect rating) come from one Appearance.
 * - **Counts** (a 5th Perfect rating) come from the recorded Appearances,
 *   for what EA's totals don't count, so they read "since records began".
 * - **Records** (biggest Win, biggest defeat) are judged on the recorded
 *   Matches only, so they read "since records began". A scoreline record
 *   leaves Rage Quits out: EA awards or cuts short their score (CLUBS-63).
 * - **Streaks** (longest unbeaten run, scored in 4 in a row, CLUBS-63) are
 *   records too: the club's runs of results, counting a Rage Quit by its
 *   result, and each Squad Member's own best runs over their counted
 *   Appearances. One fires once per run, on the Match that beats the old best.
 *
 * No Goalkeeper Milestones: the AI keeps goal, never a Squad Member.
 */

import type { MilestoneSubject } from "~/db/schema";
import type { PositionGroup as StoredPositionGroup } from "~/ea/parse";
import type { Outcome } from "~/lib/domain";
import { formatDecimal } from "~/lib/number-format";

import { isCountedAppearance } from "./counted";
import { sessionIdsByMatch } from "./sessions";

export type { MilestoneSubject };

/** Career landmarks, from EA's totals in Snapshots. */
export type PlayerLandmarkKind = "goals" | "assists" | "appearances" | "motm";
export type ClubLandmarkKind = "club-wins" | "club-matches";
/** Counts of feats by a Squad Member, from the recorded Appearances. */
export type PlayerCountKind = "perfect-ratings";
/** One-Match feats by a Squad Member. */
export type FeatKind =
  | "hat-trick"
  | "goal-involvements"
  | "perfect-rating"
  | "first-goal-in-position";
/** Club records, since records began. */
export type RecordKind =
  | "record-win-margin"
  | "record-defeat-margin"
  | "record-goals"
  | "record-session-wins";
/** The club's longest runs of results, since records began. */
export type ClubStreakKind =
  | "record-win-run"
  | "record-unbeaten-run"
  | "record-winless-run";
/** A Squad Member's own longest runs, since records began. */
export type PlayerStreakKind = "scoring-run" | "assist-run" | "motm-run";

export type MilestoneKind =
  | PlayerLandmarkKind
  | ClubLandmarkKind
  | PlayerCountKind
  | FeatKind
  | RecordKind
  | ClubStreakKind
  | PlayerStreakKind;

export type MilestoneCategory = "landmark" | "feat" | "streak" | "record";

/** Categories that only count recorded Matches, so read "since records began". */
export function isSinceRecordsBegan(category: MilestoneCategory): boolean {
  return category === "streak" || category === "record";
}

/** A rising run of thresholds: each listed value, then every `step` after the last. */
export interface Ladder {
  start: readonly number[];
  step: number;
}

/** The figures a headline or sentence is built from. */
export interface MilestoneFigures {
  value: number;
  threshold: number | null;
  positionGroup: StoredPositionGroup | null;
}

interface KindDefinition {
  subject: MilestoneSubject;
  category: MilestoneCategory;
  /** The badge on the feed, e.g. "Landmark". */
  badge: string;
  /** What comes after the name in the headline: "50th goal". */
  title(m: MilestoneFigures): string;
  /** The big figure beside the headline: "50", "9.4", "+5". */
  figure(m: MilestoneFigures): string;
  /** The plain sentence shown until (or unless) a written comment arrives. */
  sentence(name: string, m: MilestoneFigures): string;
}

/** A Squad Member's career landmark: the Snapshot field and each Appearance's share. */
interface PlayerLandmark {
  field: string;
  ladder: Ladder;
  contribution(a: DetectionAppearance): number;
}

export const PLAYER_LANDMARKS: Readonly<
  Record<PlayerLandmarkKind, PlayerLandmark>
> = {
  goals: {
    field: "goals",
    ladder: { start: [1, 10, 25, 50, 100], step: 50 },
    contribution: (a) => a.goals,
  },
  assists: {
    field: "assists",
    ladder: { start: [1, 10, 25, 50, 100], step: 50 },
    contribution: (a) => a.assists,
  },
  appearances: {
    field: "gamesPlayed",
    ladder: { start: [1, 10, 25, 50, 100], step: 50 },
    contribution: () => 1,
  },
  motm: {
    field: "manOfTheMatch",
    ladder: { start: [1, 5, 10, 25], step: 25 },
    contribution: (a) => (a.manOfTheMatch ? 1 : 0),
  },
};

interface ClubLandmark {
  field: string;
  ladder: Ladder;
  contribution(m: DetectionMatch): number;
}

export const CLUB_LANDMARKS: Readonly<Record<ClubLandmarkKind, ClubLandmark>> =
  {
    "club-wins": {
      field: "wins",
      ladder: { start: [50], step: 50 },
      contribution: (m) => (m.outcome === "W" ? 1 : 0),
    },
    "club-matches": {
      field: "gamesPlayed",
      ladder: { start: [100], step: 50 },
      contribution: () => 1,
    },
  };

/**
 * A Squad Member's count of a feat, from the recorded Appearances: which
 * Appearances add one, and the counts worth a Milestone. The first is the
 * feat itself, so a ladder starts above 1.
 */
interface PlayerCount {
  counts(a: DetectionAppearance): boolean;
  ladder: Ladder;
}

/** A hat-trick: this many goals in one Match. */
export const HAT_TRICK_GOALS = 3;
/** Goals plus assists in one Match that make a feat (when not already a hat-trick). */
export const GOAL_INVOLVEMENTS = 4;
/** EA's top Match rating: a Perfect rating, the only rating that is a feat. */
export const PERFECT_RATING = 10;

export const PLAYER_COUNTS: Readonly<Record<PlayerCountKind, PlayerCount>> = {
  "perfect-ratings": {
    counts: (a) => isPerfectRating(a.rating),
    ladder: { start: [3, 5, 10, 25], step: 25 },
  },
};

export function isPerfectRating(rating: number | null): rating is number {
  return rating !== null && rating >= PERFECT_RATING;
}

/**
 * Earlier recorded Appearances a Squad Member needs before a first goal in a
 * Position Group counts, so the first few Matches recorded don't all read as
 * firsts.
 */
export const MIN_PLAYER_HISTORY = 5;
/** Earlier recorded Matches needed before a club record counts. */
export const MIN_RECORD_HISTORY = 5;
/** The shortest club run of results, or Session Wins, worth a record. */
export const MIN_RECORD_RUN = 2;

/** Which of the club's Matches keep each run going. */
export const CLUB_STREAKS: Readonly<
  Record<ClubStreakKind, (outcome: Outcome) => boolean>
> = {
  "record-win-run": (o) => o === "W",
  "record-unbeaten-run": (o) => o !== "L",
  "record-winless-run": (o) => o !== "W",
};

/** A Squad Member's run: which Appearances keep it going, and the shortest worth a Milestone. */
interface PlayerStreak {
  keeps(a: DetectionAppearance): boolean;
  minimum: number;
}

export const PLAYER_STREAKS: Readonly<Record<PlayerStreakKind, PlayerStreak>> =
  {
    "scoring-run": { keeps: (a) => a.goals > 0, minimum: 3 },
    "assist-run": { keeps: (a) => a.assists > 0, minimum: 3 },
    "motm-run": { keeps: (a) => a.manOfTheMatch, minimum: 2 },
  };

const LABEL_NOUN: Record<PlayerLandmarkKind, [string, string]> = {
  goals: ["goal", "goals"],
  assists: ["assist", "assists"],
  appearances: ["Appearance", "Appearances"],
  motm: ["Man of the Match", "Man of the Match awards"],
};

function playerLandmark(kind: PlayerLandmarkKind): KindDefinition {
  const [singular, plural] = LABEL_NOUN[kind];
  return {
    subject: "player",
    category: "landmark",
    badge: "Landmark",
    title: ({ value }) =>
      value === 1 ? `First ${singular}` : `${ordinal(value)} ${singular}`,
    figure: ({ value }) => String(value),
    sentence: (name, { value }) =>
      value === 1
        ? `${name} has their first ${singular} for A Bloo Bloo.`
        : `${name} reached ${value} ${plural} for A Bloo Bloo.`,
  };
}

/** A Squad Member's best run: "Scored in 4 in a row", "Man of the Match 2 in a row". */
function playerStreak(title: string, verb: string): KindDefinition {
  return {
    subject: "player",
    category: "streak",
    badge: "Streak",
    title: ({ value }) => `${title} ${value} in a row`,
    figure: ({ value }) => String(value),
    sentence: (name, { value }) =>
      `${name} ${verb} ${value} Matches in a row, their best run ${SINCE_RECORDS}.`,
  };
}

const POSITION_NAME: Record<StoredPositionGroup, string> = {
  goalkeeper: "Goalkeeper",
  defender: "Defender",
  midfielder: "Midfielder",
  forward: "Forward",
};

const SINCE_RECORDS = "since records began";

export const MILESTONE_KINDS: Readonly<Record<MilestoneKind, KindDefinition>> =
  {
    goals: playerLandmark("goals"),
    assists: playerLandmark("assists"),
    appearances: playerLandmark("appearances"),
    motm: playerLandmark("motm"),
    "perfect-ratings": {
      subject: "player",
      category: "landmark",
      badge: "Landmark",
      title: ({ value }) => `${ordinal(value)} Perfect rating`,
      figure: ({ value }) => String(value),
      sentence: (name, { value }) =>
        `${name} has ${value} Perfect ratings for A Bloo Bloo ${SINCE_RECORDS}.`,
    },
    "club-wins": {
      subject: "club",
      category: "landmark",
      badge: "Landmark",
      title: ({ value }) => `${ordinal(value)} Win`,
      figure: ({ value }) => String(value),
      sentence: (name, { value }) => `${name} reached ${value} Wins.`,
    },
    "club-matches": {
      subject: "club",
      category: "landmark",
      badge: "Landmark",
      title: ({ value }) => `${ordinal(value)} Match`,
      figure: ({ value }) => String(value),
      sentence: (name, { value }) =>
        `${name} played their ${ordinal(value)} Match.`,
    },
    "hat-trick": {
      subject: "player",
      category: "feat",
      badge: "Hat-trick",
      title: ({ value }) =>
        value > HAT_TRICK_GOALS ? `${value} goals in a Match` : "Hat-trick",
      figure: ({ value }) => String(value),
      sentence: (name, { value }) =>
        `${name} scored ${value} goals in one Match.`,
    },
    "goal-involvements": {
      subject: "player",
      category: "feat",
      badge: "Feat",
      title: ({ value }) => `${value} goal involvements`,
      figure: ({ value }) => String(value),
      sentence: (name, { value }) =>
        `${name} scored or assisted ${value} goals in one Match.`,
    },
    "perfect-rating": {
      subject: "player",
      category: "feat",
      badge: "Perfect rating",
      title: () => "Perfect rating",
      figure: ({ value }) => formatDecimal(value),
      sentence: (name, { value }) =>
        `${name} was rated a perfect ${formatDecimal(value)} for this Match.`,
    },
    "first-goal-in-position": {
      subject: "player",
      category: "feat",
      badge: "First",
      title: ({ positionGroup }) =>
        `First goal as a ${positionName(positionGroup)}`,
      figure: ({ value }) => String(value),
      sentence: (name, { positionGroup }) =>
        `${name} scored their first goal as a ${positionName(positionGroup)} ${SINCE_RECORDS}.`,
    },
    "record-win-margin": {
      subject: "club",
      category: "record",
      badge: "Record",
      title: ({ value }) => `Record Win, by ${value} goals`,
      figure: ({ value }) => `+${value}`,
      sentence: (name, { value, threshold }) =>
        `${name}'s biggest Win ${SINCE_RECORDS}: by ${value} goals, beating ${threshold}.`,
    },
    "record-defeat-margin": {
      subject: "club",
      category: "record",
      badge: "Record",
      title: ({ value }) => `Record defeat, by ${value} goals`,
      figure: ({ value }) => `−${value}`,
      sentence: (name, { value, threshold }) =>
        `${name}'s heaviest defeat ${SINCE_RECORDS}: by ${value} goals, beyond the old worst of ${threshold}.`,
    },
    "record-win-run": {
      subject: "club",
      category: "streak",
      badge: "Streak",
      title: ({ value }) => `Record run of ${value} Wins`,
      figure: ({ value }) => String(value),
      sentence: (name, { value, threshold }) =>
        `${name} won ${value} Matches in a row, the longest run ${SINCE_RECORDS} (the old best was ${threshold}).`,
    },
    "record-unbeaten-run": {
      subject: "club",
      category: "streak",
      badge: "Streak",
      title: ({ value }) => `Record unbeaten run of ${value}`,
      figure: ({ value }) => String(value),
      sentence: (name, { value, threshold }) =>
        `${name} went ${value} Matches unbeaten, the longest run ${SINCE_RECORDS} (the old best was ${threshold}).`,
    },
    "record-winless-run": {
      subject: "club",
      category: "streak",
      badge: "Streak",
      title: ({ value }) => `Record winless run of ${value}`,
      figure: ({ value }) => String(value),
      sentence: (name, { value, threshold }) =>
        `${name} went ${value} Matches without a Win, the longest run ${SINCE_RECORDS} (the old worst was ${threshold}).`,
    },
    "scoring-run": playerStreak("Scored in", "scored in"),
    "assist-run": playerStreak("Assisted in", "assisted in"),
    "motm-run": playerStreak("Man of the Match", "was Man of the Match"),
    "record-goals": {
      subject: "club",
      category: "record",
      badge: "Record",
      title: ({ value }) => `Record ${value} goals in a Match`,
      figure: ({ value }) => String(value),
      sentence: (name, { value, threshold }) =>
        `${name} scored ${value} goals in one Match, the most ${SINCE_RECORDS} (the old best was ${threshold}).`,
    },
    "record-session-wins": {
      subject: "club",
      category: "record",
      badge: "Record",
      title: ({ value }) => `Record ${value} Wins in a Session`,
      figure: ({ value }) => String(value),
      sentence: (name, { value, threshold }) =>
        `${name} won ${value} Matches in one Session, the most ${SINCE_RECORDS} (the old best was ${threshold}).`,
    },
  };

/**
 * Kinds no longer detected (CLUBS-52: only a Perfect rating is a rating
 * feat). A migration deletes their rows, and queries never show any left.
 */
export const RETIRED_MILESTONE_KINDS = [
  "rating",
  "personal-best-rating",
] as const;

/** "Loltown95 — 50th goal". */
export function milestoneHeadline(
  kind: MilestoneKind,
  name: string,
  figures: MilestoneFigures,
): string {
  return `${name} — ${MILESTONE_KINDS[kind].title(figures)}`;
}

/** "1st", "2nd", "3rd", "11th", "50th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** The thresholds on a ladder above `from`, up to and including `to`. */
export function thresholdsCrossed(
  ladder: Ladder,
  from: number,
  to: number,
): number[] {
  const crossed: number[] = [];
  const last = ladder.start.at(-1) ?? 0;
  for (const t of ladder.start) if (t > from && t <= to) crossed.push(t);
  for (let t = last + ladder.step; t <= to; t += ladder.step) {
    if (t > from) crossed.push(t);
  }
  return crossed;
}

// --- Detection --------------------------------------------------------------

/** A shown (League or Playoff) Match. */
export interface DetectionMatch {
  matchId: string;
  playedAt: Date;
  goalsFor: number;
  goalsAgainst: number;
  outcome: Outcome;
  dnf: boolean;
}

/**
 * One of Our Club's Appearances in a shown Match, uncounted ones included:
 * landmarks follow EA's totals, which count them, but feats skip them.
 */
export interface DetectionAppearance {
  matchId: string;
  playerId: string;
  positionGroup: StoredPositionGroup | null;
  goals: number;
  assists: number;
  rating: number | null;
  manOfTheMatch: boolean;
  secondsPlayed: number;
}

/** One subject's row in a totals Snapshot. */
export interface TotalsPoint {
  takenAt: Date;
  /** Persona name for a Squad Member, club ID for Our Club. */
  subjectKey: string;
  /** The Squad Member's ID, when known. */
  playerId: string | null;
  stats: Record<string, unknown>;
}

export interface DetectionInput {
  /** Every shown Match, oldest first. */
  matches: readonly DetectionMatch[];
  /** Our Club's Appearances in those Matches. */
  appearances: readonly DetectionAppearance[];
  /** `members/career/stats` rows, oldest first. */
  careerSnapshots: readonly TotalsPoint[];
  /** Our Club's `clubs/overallStats` rows, oldest first. */
  clubSnapshots: readonly TotalsPoint[];
}

export interface DetectedMilestone extends MilestoneFigures {
  kind: MilestoneKind;
  subject: MilestoneSubject;
  playerId: string | null;
  matchId: string;
  achievedAt: Date;
  /** Unique per Milestone: detecting it again never stores it twice. */
  dedupeKey: string;
}

/**
 * Every Milestone the data implies, in kick-off order. The same input always
 * gives the same Milestones and keys, so detection can be rerun safely.
 */
export function detectMilestones(input: DetectionInput): DetectedMilestone[] {
  const matchById = new Map(input.matches.map((m) => [m.matchId, m]));
  const appearanceOf = new Map(
    input.appearances.map((a) => [`${a.matchId}:${a.playerId}`, a]),
  );
  const isGoalkeeper = (m: DetectedMilestone) =>
    m.playerId !== null &&
    appearanceOf.get(`${m.matchId}:${m.playerId}`)?.positionGroup ===
      "goalkeeper";
  const unique = new Map<string, DetectedMilestone>();
  for (const m of [
    ...detectPlayerLandmarks(input, matchById),
    ...detectClubLandmarks(input),
    ...detectFeats(input),
    ...detectPlayerStreaks(input),
    ...detectRecords(input.matches),
  ]) {
    if (!isGoalkeeper(m) && !unique.has(m.dedupeKey))
      unique.set(m.dedupeKey, m);
  }
  return [...unique.values()].sort(
    (a, b) =>
      a.achievedAt.getTime() - b.achievedAt.getTime() ||
      a.dedupeKey.localeCompare(b.dedupeKey),
  );
}

/** Consecutive pairs of each subject's Snapshots, oldest first. */
function snapshotPairs(
  points: readonly TotalsPoint[],
): [TotalsPoint, TotalsPoint][] {
  const bySubject = new Map<string, TotalsPoint[]>();
  for (const point of points) {
    const series = bySubject.get(point.subjectKey) ?? [];
    series.push(point);
    bySubject.set(point.subjectKey, series);
  }
  return [...bySubject.values()].flatMap((series) =>
    series
      .slice(1)
      .map((curr, i): [TotalsPoint, TotalsPoint] => [series[i], curr]),
  );
}

function stat(point: TotalsPoint, field: string): number | null {
  const value = point.stats[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Walks the Matches a Snapshot pair covers, in kick-off order from the older
 * total, and pins each threshold crossed to the Match that reached it. None
 * when the Matches don't add up to the change in the total, since the
 * crossing then can't be pinned with confidence.
 */
function attribute<T>(
  items: readonly T[],
  contribution: (item: T) => number,
  from: number,
  to: number,
  ladder: Ladder,
): { item: T; threshold: number }[] {
  const thresholds = thresholdsCrossed(ladder, from, to);
  if (thresholds.length === 0) return [];
  const shares = items.map(contribution);
  if (shares.reduce((sum, n) => sum + n, 0) !== to - from) return [];
  const found: { item: T; threshold: number }[] = [];
  let total = from;
  items.forEach((item, i) => {
    const before = total;
    total += shares[i];
    for (const t of thresholds) {
      if (before < t && t <= total) found.push({ item, threshold: t });
    }
  });
  return found;
}

/**
 * The last `count` of these, kicked off at or before `takenAt`: the Matches a
 * rise of `count` games in EA's total covers. Null when fewer are recorded.
 */
function coveredBy<T extends { playedAt: Date }>(
  items: readonly T[],
  takenAt: Date,
  count: number,
): T[] | null {
  const before = items.filter((i) => i.playedAt <= takenAt);
  return before.length >= count ? before.slice(before.length - count) : null;
}

function detectPlayerLandmarks(
  { appearances, careerSnapshots }: DetectionInput,
  matchById: Map<string, DetectionMatch>,
): DetectedMilestone[] {
  const byPlayer = new Map<
    string,
    (DetectionAppearance & { playedAt: Date })[]
  >();
  for (const a of appearances) {
    const match = matchById.get(a.matchId);
    if (!match) continue;
    const list = byPlayer.get(a.playerId) ?? [];
    list.push({ ...a, playedAt: match.playedAt });
    byPlayer.set(a.playerId, list);
  }
  for (const list of byPlayer.values()) {
    list.sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
  }

  const found: DetectedMilestone[] = [];
  for (const [prev, curr] of snapshotPairs(careerSnapshots)) {
    const { playerId } = curr;
    if (!playerId) continue;
    const gamesBefore = stat(prev, "gamesPlayed");
    const gamesAfter = stat(curr, "gamesPlayed");
    if (gamesBefore === null || gamesAfter === null) continue;
    const covered = coveredBy(
      byPlayer.get(playerId) ?? [],
      curr.takenAt,
      gamesAfter - gamesBefore,
    );
    if (!covered?.length) continue;
    for (const [kind, landmark] of Object.entries(PLAYER_LANDMARKS)) {
      const from = stat(prev, landmark.field);
      const to = stat(curr, landmark.field);
      if (from === null || to === null) continue;
      for (const { item, threshold } of attribute(
        covered,
        landmark.contribution,
        from,
        to,
        landmark.ladder,
      )) {
        found.push({
          kind: kind as PlayerLandmarkKind,
          subject: "player",
          playerId,
          value: threshold,
          threshold,
          positionGroup: null,
          matchId: item.matchId,
          achievedAt: item.playedAt,
          dedupeKey: `player:${playerId}:${kind}:${threshold}`,
        });
      }
    }
  }
  return found;
}

function detectClubLandmarks({
  matches,
  clubSnapshots,
}: DetectionInput): DetectedMilestone[] {
  const found: DetectedMilestone[] = [];
  for (const [prev, curr] of snapshotPairs(clubSnapshots)) {
    const gamesBefore = stat(prev, "gamesPlayed");
    const gamesAfter = stat(curr, "gamesPlayed");
    if (gamesBefore === null || gamesAfter === null) continue;
    const covered = coveredBy(matches, curr.takenAt, gamesAfter - gamesBefore);
    if (!covered?.length) continue;
    for (const [kind, landmark] of Object.entries(CLUB_LANDMARKS)) {
      const from = stat(prev, landmark.field);
      const to = stat(curr, landmark.field);
      if (from === null || to === null) continue;
      for (const { item, threshold } of attribute(
        covered,
        landmark.contribution,
        from,
        to,
        landmark.ladder,
      )) {
        found.push({
          kind: kind as ClubLandmarkKind,
          subject: "club",
          playerId: null,
          value: threshold,
          threshold,
          positionGroup: null,
          matchId: item.matchId,
          achievedAt: item.playedAt,
          dedupeKey: `club:${kind}:${threshold}`,
        });
      }
    }
  }
  return found;
}

/** What is known of a Squad Member before a Match. */
interface PlayerHistory {
  appearances: number;
  counts: Map<PlayerCountKind, number>;
  appearancesByGroup: Map<StoredPositionGroup, number>;
  scoredIn: Set<StoredPositionGroup>;
}

function appearancesByMatch(
  appearances: readonly DetectionAppearance[],
): Map<string, DetectionAppearance[]> {
  const byMatch = new Map<string, DetectionAppearance[]>();
  for (const a of appearances) {
    const list = byMatch.get(a.matchId) ?? [];
    list.push(a);
    byMatch.set(a.matchId, list);
  }
  return byMatch;
}

function detectFeats({
  matches,
  appearances,
}: DetectionInput): DetectedMilestone[] {
  const byMatch = appearancesByMatch(appearances);
  const histories = new Map<string, PlayerHistory>();
  const found: DetectedMilestone[] = [];

  for (const match of matches) {
    for (const a of byMatch.get(match.matchId) ?? []) {
      // A 0-minute Appearance or our side of a DNF we quit is no feat, and no history.
      if (!isCountedAppearance({ ...a, ...match })) continue;
      const history = histories.get(a.playerId) ?? {
        appearances: 0,
        counts: new Map(),
        appearancesByGroup: new Map(),
        scoredIn: new Set(),
      };
      const feat = (
        kind: FeatKind | PlayerCountKind,
        value: number,
        extra: Partial<DetectedMilestone> = {},
        key = match.matchId,
      ) =>
        found.push({
          kind,
          subject: "player",
          playerId: a.playerId,
          value,
          threshold: null,
          positionGroup: null,
          matchId: match.matchId,
          achievedAt: match.playedAt,
          dedupeKey: `player:${a.playerId}:${kind}:${key}`,
          ...extra,
        });

      if (a.goals >= HAT_TRICK_GOALS) feat("hat-trick", a.goals);
      else if (a.goals + a.assists >= GOAL_INVOLVEMENTS) {
        feat("goal-involvements", a.goals + a.assists);
      }

      if (isPerfectRating(a.rating)) {
        feat("perfect-rating", a.rating);
      }

      for (const [kind, { counts, ladder }] of Object.entries(PLAYER_COUNTS)) {
        if (!counts(a)) continue;
        const before = history.counts.get(kind as PlayerCountKind) ?? 0;
        history.counts.set(kind as PlayerCountKind, before + 1);
        for (const t of thresholdsCrossed(ladder, before, before + 1)) {
          feat(kind as PlayerCountKind, t, { threshold: t }, String(t));
        }
      }

      const group = a.positionGroup;
      if (
        group &&
        a.goals > 0 &&
        !history.scoredIn.has(group) &&
        history.appearances >= MIN_PLAYER_HISTORY &&
        group !== usualGroup(history)
      ) {
        feat(
          "first-goal-in-position",
          a.goals,
          { positionGroup: group },
          group,
        );
      }

      history.appearances++;
      if (group) {
        history.appearancesByGroup.set(
          group,
          (history.appearancesByGroup.get(group) ?? 0) + 1,
        );
        if (a.goals > 0) history.scoredIn.add(group);
      }
      histories.set(a.playerId, history);
    }
  }
  return found;
}

/** The Position Group a Squad Member has played most so far. */
function usualGroup(history: PlayerHistory): StoredPositionGroup | null {
  let usual: StoredPositionGroup | null = null;
  let most = 0;
  for (const [group, count] of history.appearancesByGroup) {
    if (count > most) [usual, most] = [group, count];
  }
  return usual;
}

/** The current run of Matches that `keeps` going, against the longest before it. */
class RunTracker<T extends { matchId: string }> {
  /** The longest run before the current one began. */
  bestBefore = 0;
  length = 0;
  /** The Match the current run began in. */
  startId = "";
  private best = 0;

  constructor(
    private readonly keeps: (item: T) => boolean,
    private readonly minimum: number,
  ) {}

  /**
   * Adds the next Match. True once per run: on the Match that takes it past
   * the old best (and to at least `minimum`).
   */
  add(item: T): boolean {
    if (!this.keeps(item)) {
      this.length = 0;
      return false;
    }
    if (this.length === 0) {
      this.startId = item.matchId;
      this.bestBefore = this.best;
    }
    this.length++;
    this.best = Math.max(this.best, this.length);
    return this.length === Math.max(this.bestBefore + 1, this.minimum);
  }
}

/**
 * Each Squad Member's own best runs, over their counted Appearances: one
 * that isn't counted (0 minutes, or a Match we quit) neither extends nor
 * ends a run, and nor does a Match they missed.
 */
function detectPlayerStreaks({
  matches,
  appearances,
}: DetectionInput): DetectedMilestone[] {
  const byMatch = appearancesByMatch(appearances);
  const runs = new Map<
    string,
    [PlayerStreakKind, RunTracker<DetectionAppearance>][]
  >();
  const found: DetectedMilestone[] = [];
  for (const match of matches) {
    for (const a of byMatch.get(match.matchId) ?? []) {
      if (!isCountedAppearance({ ...a, ...match })) continue;
      let theirs = runs.get(a.playerId);
      if (!theirs) {
        theirs = Object.entries(PLAYER_STREAKS).map(
          ([kind, { keeps, minimum }]) => [
            kind as PlayerStreakKind,
            new RunTracker(keeps, minimum),
          ],
        );
        runs.set(a.playerId, theirs);
      }
      for (const [kind, run] of theirs) {
        if (!run.add(a)) continue;
        found.push({
          kind,
          subject: "player",
          playerId: a.playerId,
          value: run.length,
          threshold: run.bestBefore,
          positionGroup: null,
          matchId: match.matchId,
          achievedAt: match.playedAt,
          dedupeKey: `player:${a.playerId}:${kind}:${run.startId}`,
        });
      }
    }
  }
  return found;
}

function detectRecords(
  matches: readonly DetectionMatch[],
): DetectedMilestone[] {
  const found: DetectedMilestone[] = [];
  const record = (
    kind: RecordKind | ClubStreakKind,
    match: DetectionMatch,
    value: number,
    previous: number,
    key: string,
  ) =>
    found.push({
      kind,
      subject: "club",
      playerId: null,
      value,
      threshold: previous,
      positionGroup: null,
      matchId: match.matchId,
      achievedAt: match.playedAt,
      dedupeKey: `club:${kind}:${key}`,
    });

  const sessionOf = sessionIdsByMatch(matches);

  let bestMargin = 0;
  let worstMargin = 0;
  let bestGoals = 0;
  const runs = Object.entries(CLUB_STREAKS).map(
    ([kind, keeps]) =>
      [
        kind as ClubStreakKind,
        new RunTracker<DetectionMatch>((m) => keeps(m.outcome), MIN_RECORD_RUN),
      ] as const,
  );
  let session = { id: "", wins: 0, recorded: false };
  let bestSessionWins = 0;

  matches.forEach((match, earlier) => {
    const counts = earlier >= MIN_RECORD_HISTORY;
    const margin = match.goalsFor - match.goalsAgainst;
    const isWin = match.outcome === "W";

    // A Rage Quit's score is awarded or cut short, so it sets no scoreline record.
    if (!match.dnf) {
      const isLoss = match.outcome === "L";
      if (counts && isWin && margin > bestMargin) {
        record("record-win-margin", match, margin, bestMargin, match.matchId);
      }
      if (counts && isLoss && -margin > worstMargin) {
        record(
          "record-defeat-margin",
          match,
          -margin,
          worstMargin,
          match.matchId,
        );
      }
      if (counts && match.goalsFor > bestGoals) {
        record("record-goals", match, match.goalsFor, bestGoals, match.matchId);
      }
      if (isWin) bestMargin = Math.max(bestMargin, margin);
      if (isLoss) worstMargin = Math.max(worstMargin, -margin);
      bestGoals = Math.max(bestGoals, match.goalsFor);
    }

    for (const [kind, run] of runs) {
      if (run.add(match) && counts) {
        record(kind, match, run.length, run.bestBefore, run.startId);
      }
    }

    const sessionId = sessionOf.get(match.matchId) ?? match.matchId;
    if (sessionId !== session.id) {
      bestSessionWins = Math.max(bestSessionWins, session.wins);
      session = { id: sessionId, wins: 0, recorded: false };
    }
    if (isWin) session.wins++;
    if (
      counts &&
      isWin &&
      !session.recorded &&
      session.wins > bestSessionWins &&
      session.wins >= MIN_RECORD_RUN
    ) {
      session.recorded = true;
      record(
        "record-session-wins",
        match,
        session.wins,
        bestSessionWins,
        sessionId,
      );
    }
  });
  return found;
}

function positionName(group: StoredPositionGroup | null): string {
  return group ? POSITION_NAME[group] : "new position";
}
