import { describe, expect, it } from "vitest";

import {
  bestAppearances,
  buildHistory,
  buildState,
  careerTotals,
  formSeries,
  positionGroupSplit,
  proPositionName,
} from "./player";
import type { SnapshotPoint } from "./snapshots";
import type { SquadAppearance } from "./squad";

let sequence = 0;

function appearance(overrides: Partial<SquadAppearance> = {}): SquadAppearance {
  sequence += 1;
  return {
    playerId: "1",
    name: "Kabeeble",
    matchId: `m${sequence}`,
    matchType: "League",
    playedAt: new Date(Date.UTC(2026, 9, 1, 20, sequence)),
    opponentClubId: "2",
    opponentName: "Opponent FC",
    goalsFor: 2,
    goalsAgainst: 1,
    outcome: "W",
    dnf: false,
    positionGroup: "Midfielder",
    goals: 0,
    assists: 0,
    shots: 0,
    passesMade: 0,
    passAttempts: 0,
    tacklesMade: 0,
    tackleAttempts: 0,
    rating: 7,
    manOfTheMatch: false,
    redCards: 0,
    saves: 0,
    goalsConceded: 0,
    cleanSheet: false,
    secondsPlayed: 5400,
    ...overrides,
  };
}

function snapshot(day: number, stats: Record<string, unknown>): SnapshotPoint {
  return { takenAt: new Date(Date.UTC(2026, 9, day)), stats };
}

describe("formSeries", () => {
  it("gives one point per Appearance with a 5-Match rolling rating", () => {
    const ratings = [6, 7, 8, 9, 7.5, 8.5];
    const series = formSeries(ratings.map((rating) => appearance({ rating })));
    expect(series).toHaveLength(6);
    expect(series.map((p) => p.rating)).toEqual(ratings);
    expect(series[0].ratingRolling).toBe(6);
    expect(series[5].ratingRolling).toBeCloseTo(8);
  });

  it("carries goals, assists and pass % per Appearance", () => {
    const [point] = formSeries([
      appearance({ goals: 2, assists: 1, passesMade: 9, passAttempts: 12 }),
    ]);
    expect(point).toMatchObject({ goals: 2, assists: 1, passPercentage: 75 });
  });

  it("leaves pass % null with no pass attempts", () => {
    const [point] = formSeries([appearance({ passAttempts: 0 })]);
    expect(point.passPercentage).toBeNull();
  });
});

describe("positionGroupSplit", () => {
  it("totals Appearances, average rating and G+A per Position Group", () => {
    const split = positionGroupSplit([
      appearance({ positionGroup: "Forward", rating: 8, goals: 2 }),
      appearance({ positionGroup: "Midfielder", rating: 6, assists: 1 }),
      appearance({ positionGroup: "Forward", rating: 7, assists: 1 }),
      appearance({ positionGroup: null, rating: null }),
    ]);
    expect(split).toEqual([
      {
        positionGroup: "Forward",
        appearances: 2,
        averageRating: 7.5,
        goalContributions: 3,
      },
      {
        positionGroup: "Midfielder",
        appearances: 1,
        averageRating: 6,
        goalContributions: 1,
      },
      {
        positionGroup: null,
        appearances: 1,
        averageRating: null,
        goalContributions: 0,
      },
    ]);
  });
});

describe("bestAppearances", () => {
  it("returns the top-rated Appearances, the latest first on a tie, skipping unrated", () => {
    const apps = [
      appearance({ rating: 9 }),
      appearance({ rating: null }),
      appearance({ rating: 6 }),
      appearance({ rating: 9 }),
      appearance({ rating: 7 }),
    ];
    expect(bestAppearances(apps, 3).map((a) => a.matchId)).toEqual([
      apps[3].matchId,
      apps[0].matchId,
      apps[4].matchId,
    ]);
  });
});

describe("proPositionName", () => {
  it("maps EA's proPos codes to positions", () => {
    expect(proPositionName(0)).toBe("GK");
    expect(proPositionName(5)).toBe("CB");
    expect(proPositionName(14)).toBe("CM");
    expect(proPositionName(25)).toBe("ST");
  });

  it("returns null for missing or unknown codes", () => {
    expect(proPositionName(null)).toBeNull();
    expect(proPositionName(99)).toBeNull();
  });
});

describe("buildState", () => {
  it("reads overall and position from a members/stats Snapshot", () => {
    expect(
      buildState(snapshot(1, { proOverall: 78, proStyle: 2, proPos: 25 })),
    ).toEqual({
      takenAt: new Date(Date.UTC(2026, 9, 1)),
      overall: 78,
      position: "ST",
    });
  });

  it("leaves fields EA did not send as null", () => {
    expect(buildState(snapshot(1, {}))).toMatchObject({
      overall: null,
      position: null,
    });
  });
});

describe("buildHistory", () => {
  it("keeps only the Snapshots where the build changed, with the overall change", () => {
    const history = buildHistory([
      snapshot(1, { proOverall: 78, proStyle: 0, proPos: 14 }),
      snapshot(2, { proOverall: 78, proStyle: 0, proPos: 14, goals: 3 }),
      snapshot(3, { proOverall: 80, proStyle: 0, proPos: 14 }),
      snapshot(4, { proOverall: 80, proStyle: 0, proPos: 25 }),
    ]);
    expect(
      history.map((h) => [h.takenAt.getUTCDate(), h.overall, h.overallChange]),
    ).toEqual([
      [1, 78, null],
      [3, 80, 2],
      [4, 80, 0],
    ]);
    expect(history[2].position).toBe("ST");
  });

  it("is empty with no Snapshots", () => {
    expect(buildHistory([])).toEqual([]);
  });
});

describe("careerTotals", () => {
  it("reads EA's all-time totals from a members/career/stats Snapshot", () => {
    expect(
      careerTotals(
        snapshot(1, {
          gamesPlayed: 80,
          goals: 41,
          assists: 22,
          manOfTheMatch: 9,
          ratingAve: 7.6,
        }),
      ),
    ).toEqual({
      takenAt: new Date(Date.UTC(2026, 9, 1)),
      gamesPlayed: 80,
      goals: 41,
      assists: 22,
      manOfTheMatch: 9,
      averageRating: 7.6,
    });
  });
});
