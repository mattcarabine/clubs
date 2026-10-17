import { describe, expect, it } from "vitest";

import { eaCareerTotals, eaCleanSheets, eaSeasonTotals } from "./ea-totals";
import type { SnapshotPoint } from "./snapshots";

const TAKEN_AT = new Date(Date.UTC(2026, 9, 1));

function snapshot(stats: Record<string, unknown>): SnapshotPoint {
  return { takenAt: TAKEN_AT, stats };
}

/** Kabeeble's recorded `members/stats` entry, as the Poll stores it (numbers coerced). */
const KABEEBLE_SEASON = {
  name: "Kabeeble",
  gamesPlayed: 112,
  winRate: 49,
  goals: 98,
  assists: 65,
  cleanSheetsDef: 0,
  cleanSheetsGK: 0,
  shotSuccessRate: 31,
  passesMade: 1267,
  passSuccessRate: 74,
  ratingAve: 7.6,
  tacklesMade: 60,
  tackleSuccessRate: 25,
  proStyle: 0,
  manOfTheMatch: 16,
  redCards: 0,
  favoritePosition: "midfielder",
};

describe("eaCareerTotals", () => {
  it("reads EA's all-time totals from a members/career/stats Snapshot", () => {
    expect(
      eaCareerTotals(
        snapshot({
          gamesPlayed: 80,
          goals: 41,
          assists: 22,
          manOfTheMatch: 9,
          ratingAve: 7.6,
          favoritePosition: "forward",
        }),
      ),
    ).toEqual({
      takenAt: TAKEN_AT,
      gamesPlayed: 80,
      goals: 41,
      assists: 22,
      manOfTheMatch: 9,
      averageRating: 7.6,
      favouritePosition: "Forward",
    });
  });

  it("gives null for fields EA left out or sent as text", () => {
    const career = eaCareerTotals(snapshot({ goals: "lots" }));
    expect(career.goals).toBeNull();
    expect(career.gamesPlayed).toBeNull();
    expect(career.favouritePosition).toBeNull();
  });
});

describe("eaSeasonTotals", () => {
  it("reads every meaningful members/stats field, rates as 0 to 100", () => {
    expect(eaSeasonTotals(snapshot(KABEEBLE_SEASON))).toEqual({
      takenAt: TAKEN_AT,
      gamesPlayed: 112,
      winRate: 49,
      goals: 98,
      assists: 65,
      shotSuccessRate: 31,
      passesMade: 1267,
      passSuccessRate: 74,
      tacklesMade: 60,
      tackleSuccessRate: 25,
      cleanSheetsGoalkeeper: 0,
      cleanSheetsDefender: 0,
      manOfTheMatch: 16,
      redCards: 0,
      averageRating: 7.6,
      favouritePosition: "Midfielder",
    });
  });
});

describe("eaCleanSheets", () => {
  const season = (favoritePosition: string) =>
    eaSeasonTotals(
      snapshot({ cleanSheetsGK: 7, cleanSheetsDef: 3, favoritePosition }),
    );

  it("counts a keeper's clean sheets in goal", () => {
    expect(eaCleanSheets(season("goalkeeper"))).toBe(7);
  });

  it("counts anyone else's as a Defender", () => {
    expect(eaCleanSheets(season("defender"))).toBe(3);
    expect(eaCleanSheets(season("forward"))).toBe(3);
  });
});
