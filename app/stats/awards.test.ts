import { describe, expect, it } from "vitest";

import {
  AWARD_IDS,
  type AwardId,
  bestRun,
  MIN_IMPROVEMENT,
  ratedQualifier,
  seasonAwards,
} from "./awards";
import type { SquadAppearance } from "./squad";

const FULL = 90 * 60;
let clock = Date.UTC(2026, 9, 1, 19);

function app(
  playerId: string,
  overrides: Partial<SquadAppearance> = {},
): SquadAppearance {
  clock += 3_600_000;
  return {
    playerId,
    name: playerId,
    matchId: `m${clock}`,
    matchType: "League",
    playedAt: new Date(clock),
    opponentClubId: "1",
    opponentName: "Kebab Over6pack",
    goalsFor: 2,
    goalsAgainst: 1,
    outcome: "W",
    dnf: false,
    positionGroup: "Midfielder",
    goals: 0,
    assists: 0,
    shots: 1,
    passesMade: 30,
    passAttempts: 40,
    tacklesMade: 2,
    tackleAttempts: 4,
    rating: 7,
    manOfTheMatch: false,
    redCards: 0,
    saves: 0,
    goalsConceded: 1,
    cleanSheet: false,
    secondsPlayed: FULL,
    ...overrides,
  };
}

function apps(
  playerId: string,
  count: number,
  build: (i: number) => Partial<SquadAppearance> = () => ({}),
): SquadAppearance[] {
  return Array.from({ length: count }, (_, i) => app(playerId, build(i)));
}

function winners(appearances: SquadAppearance[], matchCount = 10) {
  return Object.fromEntries(
    seasonAwards(appearances, matchCount).map((a) => [a.id, a.name]),
  ) as Partial<Record<AwardId, string>>;
}

describe("seasonAwards", () => {
  it("lists every Award with a winner in the fixed order", () => {
    const all = [
      ...apps("Kab", 10, (i) => ({
        goals: 1,
        assists: 1,
        rating: i < 5 ? 6 : 8.5,
      })),
    ];
    expect(seasonAwards(all, 10).map((a) => a.id)).toEqual(AWARD_IDS);
  });

  it("gives nothing for a Season without Appearances", () => {
    expect(seasonAwards([], 0)).toEqual([]);
  });
});

describe("Golden Boot", () => {
  it("goes to the most goals, with the figures", () => {
    const [boot] = seasonAwards(
      [
        ...apps("A", 4, () => ({ goals: 2 })),
        ...apps("B", 4, () => ({ goals: 1 })),
      ],
      4,
    ).filter((a) => a.id === "golden-boot");
    expect(boot).toMatchObject({
      name: "A",
      value: "8",
      unit: "goals",
      detail: "in 4 Appearances",
    });
  });

  it("breaks a tie on fewer Appearances, then more assists, then name", () => {
    expect(
      winners([
        ...apps("Zed", 2, () => ({ goals: 2 })),
        ...apps("Amy", 4, () => ({ goals: 1 })),
      ])["golden-boot"],
    ).toBe("Zed");
    expect(
      winners([
        ...apps("Amy", 2, () => ({ goals: 1 })),
        ...apps("Zed", 2, () => ({ goals: 1, assists: 1 })),
      ])["golden-boot"],
    ).toBe("Zed");
    expect(
      winners([
        ...apps("Zed", 2, () => ({ goals: 1 })),
        ...apps("Amy", 2, () => ({ goals: 1 })),
      ])["golden-boot"],
    ).toBe("Amy");
  });

  it("is not awarded when nobody scored", () => {
    expect(winners(apps("A", 3))["golden-boot"]).toBeUndefined();
  });
});

describe("Playmaker", () => {
  it("goes to the most assists; ties go to fewer Appearances, then more goals", () => {
    expect(
      winners([
        ...apps("A", 3, () => ({ assists: 1 })),
        ...apps("B", 2, () => ({ assists: 2 })),
      ]).playmaker,
    ).toBe("B");
    expect(
      winners([
        ...apps("A", 2, () => ({ assists: 1 })),
        ...apps("B", 3, (i) => ({ assists: i < 2 ? 1 : 0 })),
      ]).playmaker,
    ).toBe("A");
    expect(
      winners([
        ...apps("A", 2, () => ({ assists: 1 })),
        ...apps("B", 2, () => ({ assists: 1, goals: 1 })),
      ]).playmaker,
    ).toBe("B");
  });
});

describe("Player of the Season", () => {
  it("needs a quarter of the Season's Matches, and never fewer than 3", () => {
    expect(ratedQualifier(4)).toBe(3);
    expect(ratedQualifier(20)).toBe(5);
    expect(ratedQualifier(21)).toBe(6);
  });

  it("goes to the best average rating among those who qualify", () => {
    const award = seasonAwards(
      [
        ...apps("Cameo", 2, () => ({ rating: 9.9 })),
        ...apps("Kab", 5, () => ({ rating: 8 })),
        ...apps("Trev", 5, () => ({ rating: 7 })),
      ],
      12,
    ).find((a) => a.id === "player-of-the-season");
    expect(award).toMatchObject({
      name: "Kab",
      value: "8.0",
      unit: "average rating",
      detail: "in 5 Appearances · 0 MOTM",
    });
  });

  it("breaks a tie on rating with more MOTM, then more Appearances", () => {
    expect(
      winners([
        ...apps("A", 4, () => ({ rating: 8 })),
        ...apps("B", 4, (i) => ({ rating: 8, manOfTheMatch: i === 0 })),
      ])["player-of-the-season"],
    ).toBe("B");
    expect(
      winners([
        ...apps("A", 4, () => ({ rating: 8 })),
        ...apps("B", 5, () => ({ rating: 8 })),
      ])["player-of-the-season"],
    ).toBe("B");
  });
});

describe("Most Improved", () => {
  it("goes to the biggest rise from the first half of the Season to the second", () => {
    const award = seasonAwards(
      [
        ...apps("Riser", 6, (i) => ({ rating: i < 3 ? 6 : 7.5 })),
        ...apps("Steady", 6, (i) => ({ rating: i < 3 ? 7 : 7.5 })),
      ],
      6,
    ).find((a) => a.id === "most-improved");
    expect(award).toMatchObject({
      name: "Riser",
      value: "+1.5",
      detail: "6.0 early in the Season, 7.5 by the end",
    });
  });

  it(`needs 3 rated Appearances a half and a rise of at least ${MIN_IMPROVEMENT}`, () => {
    expect(
      winners(apps("Short", 5, (i) => ({ rating: i < 2 ? 5 : 9 })))[
        "most-improved"
      ],
    ).toBeUndefined();
    expect(
      winners(apps("Flat", 6, (i) => ({ rating: i < 3 ? 7 : 7.2 })))[
        "most-improved"
      ],
    ).toBeUndefined();
  });
});

describe("Ever-present", () => {
  it("goes to the most Appearances; ties go to more minutes", () => {
    expect(winners([...apps("A", 3), ...apps("B", 4)])["ever-present"]).toBe(
      "B",
    );
    expect(
      winners([
        ...apps("A", 3),
        ...apps("B", 3, () => ({ secondsPlayed: FULL / 2 })),
      ])["ever-present"],
    ).toBe("A");
  });
});

describe("Hot Streak", () => {
  it("finds the best 5 Appearances in a row", () => {
    const run = bestRun(
      [6, 9, 9, 9, 9, 9, 6].map((rating, i) =>
        app("A", { rating, goals: i === 1 ? 2 : 0 }),
      ),
    );
    expect(run?.rating).toBe(9);
    expect(run?.goals).toBe(2);
  });

  it("needs 5 Appearances, and ties go to more goals in the run", () => {
    expect(bestRun(apps("A", 4))).toBeNull();
    expect(
      winners([
        ...apps("A", 5, () => ({ rating: 8 })),
        ...apps("B", 5, () => ({ rating: 8, goals: 1 })),
      ])["hot-streak"],
    ).toBe("B");
  });
});
