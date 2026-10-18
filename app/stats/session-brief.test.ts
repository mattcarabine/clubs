import { describe, expect, it } from "vitest";

import { playerBaseline, RECENT_BASELINE_DAYS } from "./session-brief";
import type { AppearanceStats } from "./summaries";

const DAY = 86_400_000;
const SESSION_START = Date.UTC(2026, 9, 18, 19);

function appearance(daysBefore: number, rating: number | null) {
  const stats: AppearanceStats = {
    positionGroup: "Forward",
    goals: 1,
    assists: 0,
    shots: 3,
    passesMade: 10,
    passAttempts: 12,
    tacklesMade: 1,
    tackleAttempts: 2,
    rating,
    manOfTheMatch: false,
    redCards: 0,
    saves: 0,
    goalsConceded: 0,
    cleanSheet: false,
    secondsPlayed: 5400,
  };
  return { ...stats, playedAt: new Date(SESSION_START - daysBefore * DAY) };
}

describe("playerBaseline", () => {
  const player = { playerId: "p1", name: "Kabeeble" };

  it("sets every earlier Appearance beside the last 30 days'", () => {
    const baseline = playerBaseline(
      player,
      [
        appearance(RECENT_BASELINE_DAYS + 5, 9.1),
        appearance(10, 7),
        appearance(2, 8),
      ],
      SESSION_START,
    );
    expect(baseline.allTime?.appearances).toBe(3);
    expect(baseline.recent?.appearances).toBe(2);
    expect(baseline.recent?.averageRating).toBe(7.5);
    expect(baseline.bestRating).toBe(9.1);
    expect(baseline.bestRecentRating).toBe(8);
  });

  it("has nothing to compare for a debut", () => {
    expect(playerBaseline(player, [], SESSION_START)).toEqual({
      ...player,
      allTime: null,
      recent: null,
      bestRating: null,
      bestRecentRating: null,
    });
  });

  it("ignores unrated Appearances for the best rating", () => {
    const baseline = playerBaseline(
      player,
      [appearance(1, null)],
      SESSION_START,
    );
    expect(baseline.allTime?.appearances).toBe(1);
    expect(baseline.bestRating).toBeNull();
  });
});
