import { describe, expect, it } from "vitest";

import { summariseClubSnapshots } from "./club-snapshot";

function point(minute: number, stats: Record<string, unknown>) {
  return { takenAt: new Date(Date.UTC(2026, 9, 17, 12, minute)), stats };
}

describe("summariseClubSnapshots", () => {
  it("is null before the first Snapshot", () => {
    expect(summariseClubSnapshots([])).toBeNull();
  });

  it("reads the latest record and streaks", () => {
    const summary = summariseClubSnapshots([
      point(0, { wins: 1, ties: 0, losses: 0, wstreak: 1 }),
      point(5, {
        wins: 55,
        ties: 18,
        losses: 39,
        wstreak: 2,
        unbeatenstreak: 3,
        skillRating: 1632,
      }),
    ]);
    expect(summary).toMatchObject({
      takenAt: new Date(Date.UTC(2026, 9, 17, 12, 5)),
      wins: 55,
      draws: 18,
      losses: 39,
      winStreak: 2,
      unbeatenStreak: 3,
      skillRating: 1632,
    });
  });

  it("tracks skill rating changes, ignoring repeats", () => {
    const summary = summariseClubSnapshots([
      point(0, { skillRating: 1600 }),
      point(5, { skillRating: 1620 }),
      point(10, { skillRating: 1620, wins: 3 }),
      point(15, { skillRating: 1608 }),
    ]);
    expect(summary?.skillRatingTrend).toEqual([1600, 1620, 1608]);
    expect(summary?.skillRatingChange).toBe(-12);
  });

  it("has no change with a single rating, and nulls for missing fields", () => {
    const summary = summariseClubSnapshots([point(0, { skillRating: "n/a" })]);
    expect(summary).toMatchObject({
      skillRating: null,
      skillRatingChange: null,
      skillRatingTrend: [],
      wins: null,
      winStreak: null,
    });
  });
});
