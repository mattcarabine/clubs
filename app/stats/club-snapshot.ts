/**
 * Our Club's headline totals from EA's `clubs/overallStats` Snapshots: the
 * W/D/L record, skill rating (with its history) and streaks. Pure, so a
 * loader fetches `clubSnapshots(db)` once and passes the rows in.
 */
import { type SnapshotPoint, snapshotNumber } from "./snapshots";

/** How many recent skill ratings the trend line shows. */
export const SKILL_TREND_LENGTH = 20;

export interface ClubSnapshotSummary {
  takenAt: Date;
  wins: number | null;
  draws: number | null;
  losses: number | null;
  skillRating: number | null;
  /** Change since the previous Snapshot with a different rating, or null with none. */
  skillRatingChange: number | null;
  /** Up to the last `SKILL_TREND_LENGTH` distinct ratings, oldest first. */
  skillRatingTrend: number[];
  winStreak: number | null;
  unbeatenStreak: number | null;
}

/** Summarises the latest Snapshot (with history); null before the first. */
export function summariseClubSnapshots(
  points: readonly SnapshotPoint[],
): ClubSnapshotSummary | null {
  const latest = points.at(-1);
  if (!latest) return null;
  const read = (key: string) => snapshotNumber(latest.stats, key);

  const ratings = changesOnly(
    points
      .map((p) => snapshotNumber(p.stats, "skillRating"))
      .filter((r): r is number => r !== null),
  );
  const skillRating = read("skillRating");
  const previous = ratings.at(-2);

  return {
    takenAt: latest.takenAt,
    wins: read("wins"),
    draws: read("ties"),
    losses: read("losses"),
    skillRating,
    skillRatingChange:
      skillRating !== null && previous !== undefined
        ? skillRating - previous
        : null,
    skillRatingTrend: ratings.slice(-SKILL_TREND_LENGTH),
    winStreak: read("wstreak"),
    unbeatenStreak: read("unbeatenstreak"),
  };
}

/** Drops consecutive repeats: a Snapshot can change other fields but not this one. */
function changesOnly(values: readonly number[]): number[] {
  return values.filter((value, i) => i === 0 || value !== values[i - 1]);
}
