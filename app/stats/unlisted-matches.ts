/**
 * Matches EA counted but never listed (CLUBS-90). Our Club's `gamesPlayed`
 * in `clubs/overallStats` sometimes rises for a game that never appears in
 * `clubs/matches`: it moved the Skill Rating, but there is no Match to
 * record. They are found by comparing how far `gamesPlayed` rose between
 * two Snapshots with the Matches recorded between them.
 */
import { snapshotNumber } from "~/ea/parse";

import type { Kickoff } from "./sessions";
import type { SnapshotPoint } from "./snapshots";

export interface UnlistedMatches {
  /** The Snapshot that first counted them. */
  seenAt: Date;
  count: number;
  /**
   * How the Skill Rating moved over them, or null when a listed Match shares
   * the gap between the two Snapshots (the change is not theirs alone) or EA
   * sent no rating.
   */
  ratingChange: number | null;
}

/**
 * The games `gamesPlayed` counts beyond the Matches recorded, oldest first.
 * `snapshots` are Our Club's `clubs/overallStats`, oldest first; `kickoffs`
 * every League and Playoff Match (`gamesPlayed` counts both, never
 * Friendlies). Only games counted after the first Snapshot can be found.
 *
 * A shortfall only counts once it has lasted to the latest Snapshot, so a
 * Match EA lists a Poll after counting it is not reported.
 */
export function unlistedMatches(
  snapshots: readonly SnapshotPoint[],
  kickoffs: readonly Kickoff[],
): UnlistedMatches[] {
  const points = snapshots.flatMap(({ takenAt, stats }) => {
    const gamesPlayed = snapshotNumber(stats, "gamesPlayed");
    return gamesPlayed === null
      ? []
      : [
          {
            takenAt,
            gamesPlayed,
            rating: snapshotNumber(stats, "skillRating"),
          },
        ];
  });
  if (points.length < 2) return [];

  const times = kickoffs.map((k) => k.playedAt.getTime()).sort((a, b) => a - b);
  const first = points[0];
  let next = times.findIndex((t) => t > first.takenAt.getTime());
  if (next === -1) next = times.length;
  const start = next;

  // After each Snapshot: the Matches recorded in the gap before it, and how
  // many games EA has counted beyond the Matches recorded since the first.
  const steps = points.slice(1).map((point) => {
    const before = next;
    while (next < times.length && times[next] <= point.takenAt.getTime()) {
      next++;
    }
    return {
      listed: next - before,
      shortfall: point.gamesPlayed - first.gamesPlayed - (next - start),
    };
  });
  // The shortfall that is never made up later.
  let lasting = Number.POSITIVE_INFINITY;
  const settled = steps
    .map((step) => step.shortfall)
    .reverse()
    .map((shortfall) => {
      lasting = Math.min(lasting, shortfall);
      return Math.max(0, lasting);
    })
    .reverse();

  const found: UnlistedMatches[] = [];
  settled.forEach((total, i) => {
    const count = total - (settled[i - 1] ?? 0);
    if (count <= 0) return;
    const [from, to] = [points[i], points[i + 1]];
    found.push({
      seenAt: to.takenAt,
      count,
      ratingChange:
        steps[i].listed === 0 && from.rating !== null && to.rating !== null
          ? to.rating - from.rating
          : null,
    });
  });
  return found;
}
