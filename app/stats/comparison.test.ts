import { describe, expect, it } from "vitest";

import {
  compareSides,
  isSmallSample,
  resolveComparisonPlayers,
  sharedMatchIds,
} from "./comparison";
import { ALL_POSITIONS, type PositionGroupSelection } from "./positions";
import type { SquadAppearance } from "./squad";

function appearance(
  matchId: string,
  overrides: Partial<SquadAppearance> = {},
): SquadAppearance {
  return {
    playerId: "1",
    name: "Kabeeble",
    matchId,
    matchType: "League",
    playedAt: new Date(Date.UTC(2026, 9, 1, 20, Number(matchId.slice(1)))),
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

/** A in m1..m5 (3 as Midfielder, then 2 as Forward, losing m5); B in m3..m6, all as Forward. */
const A = [
  appearance("m1"),
  appearance("m2"),
  appearance("m3"),
  appearance("m4", { positionGroup: "Forward", goals: 2 }),
  appearance("m5", {
    positionGroup: "Forward",
    outcome: "L",
    goalsFor: 0,
    goalsAgainst: 1,
  }),
];
const B = ["m3", "m4", "m5", "m6"].map((id) =>
  appearance(id, { playerId: "2", positionGroup: "Forward" }),
);

function inputs(
  posA: PositionGroupSelection = ALL_POSITIONS,
  posB: PositionGroupSelection = ALL_POSITIONS,
) {
  return [
    { appearances: A, positionGroups: posA },
    { appearances: B, positionGroups: posB },
  ];
}

describe("sharedMatchIds", () => {
  it("is the Matches both made an Appearance in", () => {
    expect([...sharedMatchIds(A, B)]).toEqual(["m3", "m4", "m5"]);
    expect(sharedMatchIds(A, [])).toEqual(new Set());
  });
});

describe("compareSides", () => {
  it("counts every Match each played under All matches", () => {
    const {
      sides: [a, b],
      shared,
    } = compareSides(inputs(), "all");
    expect(a.totals.appearances).toBe(5);
    expect(a.record).toMatchObject({ played: 5, wins: 4, losses: 1 });
    expect(a.form).toHaveLength(5);
    expect(b.totals.appearances).toBe(4);
    expect(shared).toBeNull();
  });

  it("narrows both sides to the Shared Matches under Played together", () => {
    const {
      sides: [a, b],
      shared,
    } = compareSides(inputs(), "together");
    expect(a.totals.appearances).toBe(3);
    expect(b.totals.appearances).toBe(3);
    expect(a.form.map((p) => p.matchId)).toEqual(["m3", "m4", "m5"]);
    expect(shared).toMatchObject({
      played: 3,
      wins: 2,
      losses: 1,
      goalDifference: 1,
    });
  });

  it("counts each side's own Position Groups", () => {
    const {
      sides: [a, b],
    } = compareSides(inputs(["Midfielder"], ["Forward"]), "all");
    expect(a.totals.appearances).toBe(3);
    expect(b.totals.appearances).toBe(4);
  });

  it("counts each side's Position Groups within the Shared Matches", () => {
    const {
      sides: [a, b],
      shared,
    } = compareSides(inputs(["Forward"], ["Forward"]), "together");
    expect(a.totals.appearances).toBe(2);
    expect(a.totals.goals).toBe(2);
    expect(b.totals.appearances).toBe(3);
    // A Shared Match counts whatever position either played in it.
    expect(shared?.played).toBe(3);
  });

  it("has no Shared Matches with only one side", () => {
    const {
      sides: [a],
      shared,
    } = compareSides(inputs().slice(0, 1), "together");
    expect(a.totals.appearances).toBe(5);
    expect(shared).toBeNull();
  });
});

describe("resolveComparisonPlayers", () => {
  const members = [
    { playerId: "1", name: "Kabeeble", former: false },
    { playerId: "2", name: "Loltown95", former: true },
  ];
  const ids = (requested: string[]) =>
    resolveComparisonPlayers(requested, members).map((m) => m.playerId);

  it("keeps known Squad Members in order", () => {
    expect(ids(["2", "1"])).toEqual(["2", "1"]);
  });

  it("drops an unknown ID", () => {
    expect(ids(["404", "1"])).toEqual(["1"]);
  });
});

describe("compareSides with a DNF we quit (CLUBS-48)", () => {
  it("leaves its stats out of the totals but counts its result in the record", () => {
    const quit = appearance("m9", {
      outcome: "L",
      dnf: true,
      goalsFor: 0,
      goalsAgainst: 3,
      rating: 3,
    });
    const [side] = compareSides(
      [
        {
          appearances: [appearance("m1"), quit],
          positionGroups: ALL_POSITIONS,
        },
      ],
      "all",
    ).sides;
    expect(side.totals.appearances).toBe(1);
    expect(side.totals.averageRating).toBe(7);
    expect(side.form).toHaveLength(1);
    expect(side.record).toMatchObject({ played: 2, wins: 1, losses: 1 });
  });
});

describe("isSmallSample", () => {
  it("flags one or two Matches, not none or three", () => {
    expect([0, 1, 2, 3].map(isSmallSample)).toEqual([false, true, true, false]);
  });
});
