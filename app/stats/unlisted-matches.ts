/**
 * Matches EA counted but never listed (CLUBS-90). Our Club's `gamesPlayed`
 * in `clubs/overallStats` sometimes rises for a game that never appears in
 * `clubs/matches`: it moved the Skill Rating, but there is no Match to
 * record. They are found by comparing how far `gamesPlayed` rose between
 * two Snapshots with the Matches recorded between them.
 */
import { MAX_MATCHES_PER_TYPE } from "~/ea/endpoints";
import { snapshotNumber } from "~/ea/parse";
import { londonDateKey } from "~/lib/london-time";

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
 * Match EA lists a Poll after counting it is not reported. Nor is one in a
 * gap with `MAX_MATCHES_PER_TYPE` Matches or more, which EA's short list
 * could explain.
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
  const start = points[0].takenAt.getTime();
  let next = times.findIndex((t) => t > start);
  if (next === -1) next = times.length;

  // Each gap between two Snapshots: the Matches recorded in it, how far
  // `gamesPlayed` rose, and how many games that leaves unaccounted for.
  const gaps = points.slice(1).map((point, i) => {
    const before = next;
    while (next < times.length && times[next] <= point.takenAt.getTime()) {
      next++;
    }
    const listed = next - before;
    const rise = point.gamesPlayed - points[i].gamesPlayed;
    return {
      listed,
      rise,
      // EA lists only its latest few Matches, so a gap that fills the list
      // may be one we missed ourselves (the Poll was down), not EA's doing.
      excess:
        listed >= MAX_MATCHES_PER_TYPE
          ? Math.min(0, rise - listed)
          : rise - listed,
    };
  });
  // The running shortfall after each gap, then the part of it that is never
  // made up later.
  let shortfall = 0;
  const settled = gaps.map((gap) => {
    shortfall += gap.excess;
    return shortfall;
  });
  for (let i = settled.length - 1, lasting = settled[i]; i >= 0; i--) {
    lasting = Math.min(lasting, settled[i]);
    settled[i] = Math.max(0, lasting);
  }

  const found: UnlistedMatches[] = [];
  settled.forEach((total, i) => {
    const count = total - (settled[i - 1] ?? 0);
    if (count <= 0) return;
    const [from, to] = [points[i], points[i + 1]];
    // The change is theirs alone only when the gap holds nothing else.
    const alone = gaps[i].listed === 0 && gaps[i].rise === count;
    found.push({
      seenAt: to.takenAt,
      count,
      ratingChange:
        alone && from.rating !== null && to.rating !== null
          ? to.rating - from.rating
          : null,
    });
  });
  return found;
}

export interface UnlistedDay {
  /** When the day's first was seen: show its London day. */
  day: Date;
  count: number;
  /** How the Skill Rating moved over them, or null unless it is theirs alone. */
  ratingChange: number | null;
}

/** `unlistedMatches` added up per London day, oldest first. */
export function unlistedByDay(
  found: readonly UnlistedMatches[],
): UnlistedDay[] {
  const days: UnlistedDay[] = [];
  for (const { seenAt, count, ratingChange } of found) {
    const last = days.at(-1);
    if (!last || londonDateKey(last.day) !== londonDateKey(seenAt)) {
      days.push({ day: seenAt, count, ratingChange });
      continue;
    }
    last.count += count;
    last.ratingChange =
      last.ratingChange === null || ratingChange === null
        ? null
        : last.ratingChange + ratingChange;
  }
  return days;
}
