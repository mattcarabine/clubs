/**
 * Team trends (CLUBS-13): pure roll-ups of Matches and Appearances into the
 * series the Trends page charts. Day and kick-off buckets are Europe/London
 * wall-clock time, so a Match at 20:00 lands in the 20:00 bucket either side
 * of a BST change.
 */
import type { Outcome } from "~/lib/domain";
import { londonParts, WEEKDAYS } from "~/lib/london-time";

import { cumulativePoints, rollingAverage } from "./formulas";
import { type SnapshotPoint, snapshotNumber } from "./snapshots";
import { groupBy, type RecordInput, summariseRecord } from "./summaries";

/** The Match fields the trends need, oldest first. */
export interface TrendMatch extends RecordInput {
  playedAt: Date;
}

/** Running totals after each Match, for the results timeline. */
export interface ResultsTimeline {
  outcomes: Outcome[];
  points: number[];
  goalDifference: number[];
  /** Goals per Match averaged over the last `ROLLING_WINDOW` Matches. */
  rollingGoalsFor: (number | null)[];
  rollingGoalsAgainst: (number | null)[];
}

export function resultsTimeline(
  matches: readonly TrendMatch[],
): ResultsTimeline {
  const outcomes = matches.map((m) => m.outcome);
  return {
    outcomes,
    points: cumulativePoints(outcomes),
    goalDifference: cumulativeGoalDifference(matches),
    rollingGoalsFor: rollingAverage(matches.map((m) => m.goalsFor)),
    rollingGoalsAgainst: rollingAverage(matches.map((m) => m.goalsAgainst)),
  };
}

/** Running goal difference after each Match (oldest first). */
export function cumulativeGoalDifference(
  matches: readonly Pick<RecordInput, "goalsFor" | "goalsAgainst">[],
): number[] {
  let total = 0;
  return matches.map((m) => {
    total += m.goalsFor - m.goalsAgainst;
    return total;
  });
}

/** Our Club's record in one day-of-week or kick-off-hour bucket. */
export interface SplitBucket {
  /** "Tue" or "20:00". */
  label: string;
  played: number;
  wins: number;
  /** 0 to 100. */
  winPercentage: number;
}

/** Win % by London day of the week, Monday first, skipping days with no Matches. */
export function splitByWeekday(matches: readonly TrendMatch[]): SplitBucket[] {
  const byDay = groupBy(matches, (m) => londonParts(m.playedAt).weekday);
  return WEEKDAYS.flatMap((day) => {
    const bucket = byDay.get(day);
    return bucket ? [toBucket(day, bucket)] : [];
  });
}

/** Win % by London kick-off hour ("20:00" covers 20:00 to 20:59), earliest first. */
export function splitByKickoffHour(
  matches: readonly TrendMatch[],
): SplitBucket[] {
  const byHour = groupBy(matches, (m) => londonParts(m.playedAt).hour);
  return [...byHour.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, bucket]) =>
      toBucket(`${String(hour).padStart(2, "0")}:00`, bucket),
    );
}

function toBucket(label: string, matches: readonly TrendMatch[]): SplitBucket {
  const { played, wins, winPercentage } = summariseRecord(matches);
  return { label, played, wins, winPercentage: winPercentage ?? 0 };
}

/** The fields of an Appearance for Our Club that line-ups need. */
export interface LineupAppearance extends TrendMatch {
  matchId: string;
  playerId: string;
  name: string;
}

/** One set of Squad Members who played together, and how they got on. */
export interface LineupRecord {
  /** The sorted player IDs, joined: stable across name changes. */
  key: string;
  /** Names in alphabetical order. */
  names: string[];
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalDifference: number;
  winPercentage: number | null;
}

/** Line-ups need this many Matches together before they are shown. */
export const MIN_LINEUP_MATCHES = 3;

/**
 * Groups Our Club's Appearances by Match, then Matches by the exact set of
 * Squad Members who played, keeping sets with at least `minMatches` Matches.
 * Most Matches first, then best win %.
 */
export function lineupRecords(
  appearances: readonly LineupAppearance[],
  minMatches = MIN_LINEUP_MATCHES,
): LineupRecord[] {
  const lineups = [...groupBy(appearances, (a) => a.matchId).values()].map(
    (apps) => {
      const players = [...apps].sort((a, b) =>
        a.playerId.localeCompare(b.playerId),
      );
      return {
        key: players.map((p) => p.playerId).join("+"),
        names: players.map((p) => p.name),
        match: apps[0],
      };
    },
  );

  return [...groupBy(lineups, (l) => l.key).entries()]
    .filter(([, matches]) => matches.length >= minMatches)
    .map(([key, matches]): LineupRecord => {
      const record = summariseRecord(matches.map((l) => l.match));
      return {
        key,
        // The latest Match carries each Squad Member's current name.
        names: [...matches[matches.length - 1].names].sort((a, b) =>
          a.localeCompare(b),
        ),
        played: record.played,
        wins: record.wins,
        draws: record.draws,
        losses: record.losses,
        goalDifference: record.goalDifference,
        winPercentage: record.winPercentage,
      };
    })
    .sort(
      (a, b) =>
        b.played - a.played ||
        (b.winPercentage ?? 0) - (a.winPercentage ?? 0) ||
        a.key.localeCompare(b.key),
    );
}

/** One club Snapshot's skill rating. */
export interface SkillRatingPoint {
  takenAt: Date;
  skillRating: number;
}

/**
 * EA's club skill rating each time it changed, oldest first. Snapshots that
 * repeat the previous rating (other totals changed) are dropped, so the chart
 * has one point per change rather than one per Poll.
 */
export function skillRatingHistory(
  snapshots: readonly SnapshotPoint[],
): SkillRatingPoint[] {
  const history: SkillRatingPoint[] = [];
  for (const { takenAt, stats } of snapshots) {
    const skillRating = snapshotNumber(stats, "skillRating");
    if (skillRating === null || skillRating === history.at(-1)?.skillRating) {
      continue;
    }
    history.push({ takenAt, skillRating });
  }
  return history;
}
