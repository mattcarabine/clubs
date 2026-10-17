import { describe, expect, it } from "vitest";

import { FIRST_SEASON_START, newSeasons } from "./seasons.ts";

const takenAt = new Date("2026-11-01T12:00:00Z");

describe("newSeasons", () => {
  it("starts Season 1 before tracking began when none is stored", () => {
    expect(
      newSeasons({
        latestSeason: 0,
        previousGamesPlayed: null,
        gamesPlayed: 30,
        takenAt,
      }),
    ).toEqual([{ number: 1, startedAt: FIRST_SEASON_START }]);
  });

  it("adds nothing while games played rises or holds", () => {
    for (const gamesPlayed of [31, 30]) {
      expect(
        newSeasons({
          latestSeason: 1,
          previousGamesPlayed: 30,
          gamesPlayed,
          takenAt,
        }),
      ).toEqual([]);
    }
  });

  it("starts the next Season at the Snapshot where games played went down", () => {
    expect(
      newSeasons({
        latestSeason: 1,
        previousGamesPlayed: 31,
        gamesPlayed: 2,
        takenAt,
      }),
    ).toEqual([{ number: 2, startedAt: takenAt }]);
  });

  it("adds Season 1 and Season 2 when the first detected drop predates any Season", () => {
    expect(
      newSeasons({
        latestSeason: 0,
        previousGamesPlayed: 31,
        gamesPlayed: 2,
        takenAt,
      }),
    ).toEqual([
      { number: 1, startedAt: FIRST_SEASON_START },
      { number: 2, startedAt: takenAt },
    ]);
  });

  it("ignores Snapshots without games played", () => {
    expect(
      newSeasons({
        latestSeason: 1,
        previousGamesPlayed: 31,
        gamesPlayed: null,
        takenAt,
      }),
    ).toEqual([]);
  });
});
