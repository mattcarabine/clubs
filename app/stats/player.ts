/**
 * Pure roll-ups for one Squad Member's profile (CLUBS-10): the per-Match form
 * series, the Position Group split, best Matches, and the EA build and career
 * figures read out of Snapshots. `player-profile.ts` feeds these from D1.
 */
import type { PositionGroup } from "~/lib/domain";

import {
  average,
  passPercentage,
  ROLLING_WINDOW,
  rollingAverage,
} from "./formulas";
import { type SnapshotPoint, snapshotNumber } from "./snapshots";
import type { SquadAppearance } from "./squad";
import { groupBy } from "./summaries";

/** One Appearance as a point on the profile's form charts, oldest first. */
export interface FormPoint {
  matchId: string;
  playedAt: Date;
  rating: number | null;
  /** Rolling average rating over this and up to 4 previous Appearances. */
  ratingRolling: number | null;
  goals: number;
  assists: number;
  /** 0 to 100, or null with no pass attempts. */
  passPercentage: number | null;
}

/** The form series for a Squad Member's Appearances, which must be oldest first. */
export function formSeries(
  appearances: readonly SquadAppearance[],
  window = ROLLING_WINDOW,
): FormPoint[] {
  const rolling = rollingAverage(
    appearances.map((a) => a.rating),
    window,
  );
  return appearances.map((a, i) => ({
    matchId: a.matchId,
    playedAt: a.playedAt,
    rating: a.rating,
    ratingRolling: rolling[i],
    goals: a.goals,
    assists: a.assists,
    passPercentage: passPercentage(a.passesMade, a.passAttempts),
  }));
}

export interface PositionGroupSplit {
  /** Null for Appearances where EA sent no position. */
  positionGroup: PositionGroup | null;
  appearances: number;
  averageRating: number | null;
  goalContributions: number;
}

/** Appearances, average rating and G+A for each Position Group, most Appearances first. */
export function positionGroupSplit(
  appearances: readonly SquadAppearance[],
): PositionGroupSplit[] {
  return [...groupBy(appearances, (a) => a.positionGroup).entries()]
    .map(([positionGroup, apps]) => ({
      positionGroup,
      appearances: apps.length,
      averageRating: average(apps.map((a) => a.rating)),
      goalContributions: apps.reduce((sum, a) => sum + a.goals + a.assists, 0),
    }))
    .sort((a, b) => b.appearances - a.appearances);
}

/** The highest-rated Appearances, best first; the more recent wins a tie. Unrated ones never count. */
export function bestAppearances(
  appearances: readonly SquadAppearance[],
  limit = 5,
): SquadAppearance[] {
  return appearances
    .filter((a) => a.rating !== null)
    .sort(
      (a, b) =>
        (b.rating ?? 0) - (a.rating ?? 0) ||
        b.playedAt.getTime() - a.playedAt.getTime(),
    )
    .slice(0, limit);
}

/**
 * EA's `proPos` codes: the index of each pitch position in FC's formation
 * model. Our recorded fixtures agree with `favoritePosition` (14 CM is a
 * midfielder, 25 ST a forward, 5 CB a defender).
 */
const PRO_POSITIONS = [
  "GK",
  "SW",
  "RWB",
  "RB",
  "RCB",
  "CB",
  "LCB",
  "LB",
  "LWB",
  "RDM",
  "CDM",
  "LDM",
  "RM",
  "RCM",
  "CM",
  "LCM",
  "LM",
  "RAM",
  "CAM",
  "LAM",
  "RF",
  "CF",
  "LF",
  "RW",
  "RS",
  "ST",
  "LS",
  "LW",
] as const;

/** A `proPos` code as a position abbreviation ("CM"), or null when unknown. */
export function proPositionName(code: number | null): string | null {
  return code === null ? null : (PRO_POSITIONS[code] ?? null);
}

/**
 * A Squad Member's Pro build at one Snapshot. EA's `proStyle` is left out: it
 * has no published names and is 0 for every Squad Member (CLUBS-16).
 */
export interface BuildState {
  takenAt: Date;
  overall: number | null;
  /** The pitch position, e.g. "CM". */
  position: string | null;
}

export function buildState({ takenAt, stats }: SnapshotPoint): BuildState {
  return {
    takenAt,
    overall: snapshotNumber(stats, "proOverall"),
    position: proPositionName(snapshotNumber(stats, "proPos")),
  };
}

/** A point in the build history, with the change in overall since the previous one. */
export interface BuildChange extends BuildState {
  /** Null on the first entry or when either overall is unknown. */
  overallChange: number | null;
}

/**
 * The build history from `members/stats` Snapshots (oldest first), keeping
 * only the Snapshots where overall or position changed. A new
 * Snapshot is taken whenever any season total moves, so most repeat the build.
 */
export function buildHistory(points: readonly SnapshotPoint[]): BuildChange[] {
  const changes: BuildChange[] = [];
  for (const state of points.map(buildState)) {
    const previous = changes.at(-1);
    if (
      previous &&
      previous.overall === state.overall &&
      previous.position === state.position
    ) {
      continue;
    }
    changes.push({
      ...state,
      overallChange:
        previous?.overall != null && state.overall !== null
          ? state.overall - previous.overall
          : null,
    });
  }
  return changes;
}

/** EA's all-time record for a Squad Member since the club was founded (`members/career/stats`). */
export interface CareerTotals {
  takenAt: Date;
  gamesPlayed: number | null;
  goals: number | null;
  assists: number | null;
  manOfTheMatch: number | null;
  averageRating: number | null;
}

export function careerTotals({ takenAt, stats }: SnapshotPoint): CareerTotals {
  return {
    takenAt,
    gamesPlayed: snapshotNumber(stats, "gamesPlayed"),
    goals: snapshotNumber(stats, "goals"),
    assists: snapshotNumber(stats, "assists"),
    manOfTheMatch: snapshotNumber(stats, "manOfTheMatch"),
    averageRating: snapshotNumber(stats, "ratingAve"),
  };
}
