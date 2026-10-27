import { describe, expect, it } from "vitest";

import { FIRST_SEASON_START, newSeasons } from "./seasons.ts";

const takenAt = new Date("2026-11-01T12:00:00Z");

/** Kick-offs the given number of hours before the Snapshot. */
const hoursBefore = (...hours: number[]) =>
  hours.map((h) => new Date(takenAt.getTime() - h * 3_600_000));

describe("newSeasons", () => {
  it("starts Season 1 before tracking began when none is stored", () => {
    expect(
      newSeasons({
        latestSeason: 0,
        previousGamesPlayed: null,
        gamesPlayed: 30,
        takenAt,
        kickoffs: [],
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
          kickoffs: hoursBefore(1),
        }),
      ).toEqual([]);
    }
  });

  it("starts the next Season at the Snapshot when it has no Matches yet", () => {
    expect(
      newSeasons({
        latestSeason: 1,
        previousGamesPlayed: 31,
        gamesPlayed: 0,
        takenAt,
        kickoffs: hoursBefore(2),
      }),
    ).toEqual([{ number: 2, startedAt: takenAt }]);
  });

  it("starts the next Season at the oldest of its games-played Matches", () => {
    // Three Matches since the last Snapshot; EA counts two in the new Season,
    // so the one 96 hours back finished the old Season.
    expect(
      newSeasons({
        latestSeason: 1,
        previousGamesPlayed: 31,
        gamesPlayed: 2,
        takenAt,
        kickoffs: hoursBefore(1, 96, 72),
      }),
    ).toEqual([{ number: 2, startedAt: hoursBefore(72)[0] }]);
  });

  it("starts at the oldest recorded Match when EA counts more than were recorded", () => {
    expect(
      newSeasons({
        latestSeason: 1,
        previousGamesPlayed: 126,
        gamesPlayed: 12,
        takenAt,
        kickoffs: hoursBefore(3, 100, 50),
      }),
    ).toEqual([{ number: 2, startedAt: hoursBefore(100)[0] }]);
  });

  it("adds Season 1 and Season 2 when the first detected drop predates any Season", () => {
    expect(
      newSeasons({
        latestSeason: 0,
        previousGamesPlayed: 31,
        gamesPlayed: 2,
        takenAt,
        kickoffs: [],
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
        kickoffs: hoursBefore(1),
      }),
    ).toEqual([]);
  });
});
