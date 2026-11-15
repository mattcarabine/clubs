import { describe, expect, it } from "vitest";

import { unlistedMatches } from "./unlisted-matches";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 30, 20, minute));
const snapshot = (minute: number, gamesPlayed: number, skillRating = 1700) => ({
  takenAt: at(minute),
  stats: { gamesPlayed, skillRating },
});
const match = (minute: number) => ({
  matchId: `m${minute}`,
  playedAt: at(minute),
});

describe("unlistedMatches", () => {
  it("finds nothing while every counted game is a recorded Match", () => {
    expect(
      unlistedMatches(
        [snapshot(0, 150), snapshot(20, 151), snapshot(40, 153)],
        [match(15), match(30), match(38)],
      ),
    ).toEqual([]);
  });

  it("finds a game counted with no Match, and how the rating moved", () => {
    expect(
      unlistedMatches(
        [
          snapshot(0, 150, 1708),
          snapshot(20, 151, 1708),
          snapshot(35, 152, 1735),
          snapshot(40, 153, 1739),
        ],
        [match(15)],
      ),
    ).toEqual([
      { seenAt: at(35), count: 1, ratingChange: 27 },
      { seenAt: at(40), count: 1, ratingChange: 4 },
    ]);
  });

  it("leaves the rating change out when a listed Match shares the gap", () => {
    expect(
      unlistedMatches(
        [snapshot(0, 150, 1700), snapshot(30, 152, 1730)],
        [match(15)],
      ),
    ).toEqual([{ seenAt: at(30), count: 1, ratingChange: null }]);
  });

  it("ignores a Match EA lists after counting it", () => {
    expect(
      unlistedMatches(
        [snapshot(0, 150), snapshot(20, 151), snapshot(25, 151)],
        [match(22)],
      ),
    ).toEqual([]);
  });

  it("ignores Matches recorded without the count rising", () => {
    expect(
      unlistedMatches(
        [snapshot(0, 150), snapshot(20, 150), snapshot(40, 151, 1720)],
        [match(15)],
      ),
    ).toEqual([]);
  });

  it("ignores Matches from before the first Snapshot and Snapshots without a count", () => {
    expect(
      unlistedMatches(
        [snapshot(10, 150), { takenAt: at(15), stats: {} }, snapshot(20, 150)],
        [match(5)],
      ),
    ).toEqual([]);
  });
});
