import { describe, expect, it } from "vitest";

import type { Outcome, PositionGroup } from "~/lib/domain";

import {
  type ClubMatchTotals,
  dayType,
  outcomeSplit,
  POSITION_OUTLIER_GAP,
  playerOutcomeSplit,
  positionOutliers,
  type SplitMatch,
  timeOfDay,
  withAndWithout,
} from "./outcome-split";
import type { SquadAppearance } from "./squad";

const FULL = 90 * 60;

function totals(overrides: Partial<ClubMatchTotals> = {}): ClubMatchTotals {
  return {
    goals: 1,
    shots: 10,
    passesMade: 80,
    passAttempts: 100,
    tacklesMade: 5,
    tackleAttempts: 10,
    saves: 2,
    redCards: 0,
    ratingSum: 28,
    ratings: 4,
    ...overrides,
  };
}

let sequence = 0;

function match(
  outcome: Outcome,
  {
    ours,
    secondsPlayed = FULL,
    playedAt,
    ...rest
  }: Partial<Omit<SplitMatch, "ours">> & {
    ours?: Partial<ClubMatchTotals>;
  } = {},
): SplitMatch {
  sequence += 1;
  return {
    matchId: `m${sequence}`,
    playedAt: playedAt ?? new Date(Date.UTC(2026, 9, 1, 19, sequence)),
    outcome,
    secondsPlayed,
    ours: totals(ours),
    opponent: totals(),
    squadSize: 4,
    sessionPlace: 1,
    ...rest,
  };
}

const many = (n: number, make: () => SplitMatch) =>
  Array.from({ length: n }, make);

describe("outcomeSplit", () => {
  it("is not ready with fewer than 3 Wins or 3 Dropped Points", () => {
    const split = outcomeSplit(
      [...many(5, () => match("W")), match("D"), match("L")],
      [],
    );
    expect(split.ready).toBe(false);
    expect(split.record).toEqual({ wins: 5, dropped: 2 });
    expect(split.findings).toEqual([]);
  });

  it("counts draws as Dropped Points", () => {
    const split = outcomeSplit(
      [...many(3, () => match("W")), ...many(3, () => match("D"))],
      [],
    );
    expect(split.ready).toBe(true);
    expect(split.record).toEqual({ wins: 3, dropped: 3 });
  });

  it("leads with the biggest difference, with per-90 values and counts", () => {
    const wins = [11, 12, 13].map((shots) => match("W", { ours: { shots } }));
    const dropped = [8, 9, 10].map((shots) => match("L", { ours: { shots } }));
    const [top] = outcomeSplit([...wins, ...dropped], []).findings;
    expect(top).toEqual({
      id: "ours-shots",
      factor: "Performance",
      text: "In Dropped Points we take 3.0 fewer shots per 90 (9.0 vs 12.0)",
      counts: "3 Wins, 3 Dropped Points",
      smallSample: true,
    });
  });

  it("scales counts to 90 minutes by how long each Match ran", () => {
    // A DNF stopped at 45 minutes with 5 shots is 10 per 90, like the rest.
    const split = outcomeSplit(
      [
        ...many(3, () => match("W", { ours: { shots: 10 } })),
        match("W", { ours: { shots: 5 }, secondsPlayed: FULL / 2 }),
        ...many(3, () => match("L", { ours: { shots: 4 } })),
      ],
      [],
    );
    const shots = split.performance.find((row) => row.id === "shots");
    expect(shots?.ours).toEqual({ wins: "10.0", dropped: "4.0" });
  });

  it("does not scale rates, and weights them by attempts", () => {
    const split = outcomeSplit(
      [
        match("W", {
          ours: { passesMade: 9, passAttempts: 10 },
          secondsPlayed: FULL / 2,
        }),
        match("W", { ours: { passesMade: 70, passAttempts: 90 } }),
        match("W"),
        ...many(3, () => match("D")),
      ],
      [],
    );
    const pass = split.performance.find((row) => row.id === "pass");
    // (9 + 70 + 80) / (10 + 90 + 100)
    expect(pass?.ours.wins).toBe("80%");
  });

  it("drops the Small sample mark at 10 Matches a side", () => {
    const split = outcomeSplit(
      [
        ...many(10, () => match("W", { ours: { shots: 12 } })),
        ...many(10, () => match("L", { ours: { shots: 9 } })),
      ],
      [],
    );
    expect(split.findings[0].smallSample).toBe(false);
  });

  it("finds nothing when no stat differs", () => {
    const split = outcomeSplit(
      [...many(3, () => match("W")), ...many(3, () => match("L"))],
      [],
    );
    expect(split.findings).toEqual([]);
  });

  it("charts a rolling Win %", () => {
    const split = outcomeSplit(
      [match("W"), match("L"), match("W"), match("D")],
      [],
    );
    expect(split.rollingWinPercentage).toEqual([100, 50, 200 / 3, 50]);
  });
});

function appearance(
  matchId: string,
  playerId: string,
  positionGroup: PositionGroup | null = "Forward",
): Pick<SquadAppearance, "matchId" | "playerId" | "name" | "positionGroup"> {
  return { matchId, playerId, name: `Player ${playerId}`, positionGroup };
}

describe("withAndWithout", () => {
  it("gives a Squad Member who plays only in Wins 100% with and 0% without", () => {
    const wins = many(3, () => match("W"));
    const dropped = many(4, () => match("L"));
    const [row] = withAndWithout(
      [...wins, ...dropped],
      wins.map((m) => appearance(m.matchId, "a")),
    );
    expect(row.group).toEqual({ played: 3, wins: 3, winPercentage: 100 });
    expect(row.rest).toEqual({ played: 4, wins: 0, winPercentage: 0 });
  });
});

describe("positionOutliers", () => {
  it("appears with 3 Matches a side and a big enough gap", () => {
    const asForward = [match("W"), match("W"), match("L")]; // 67%
    const others = [match("L"), match("L"), match("W")]; // 33%
    const apps = [
      ...asForward.map((m) => appearance(m.matchId, "a", "Forward")),
      ...others.map((m) => appearance(m.matchId, "a", "Midfielder")),
    ];
    const outliers = positionOutliers([...asForward, ...others], apps);
    expect(outliers.map((o) => `${o.name} at ${o.positionGroup}`)).toEqual([
      "Player a at Forward",
      "Player a at Midfielder",
    ]);
    expect(POSITION_OUTLIER_GAP).toBe(25);
  });

  it("does not appear under the gap or with fewer than 3 Matches a side", () => {
    const asForward = [match("W"), match("L"), match("L"), match("W")]; // 50%
    const others = [match("L"), match("W"), match("L")]; // 33%: a 17-point gap
    const apps = asForward.map((m) => appearance(m.matchId, "a"));
    expect(positionOutliers([...asForward, ...others], apps)).toEqual([]);

    const two = [match("W"), match("W")];
    const rest = many(3, () => match("L"));
    expect(
      positionOutliers(
        [...two, ...rest],
        two.map((m) => appearance(m.matchId, "a")),
      ),
    ).toEqual([]);
  });
});

describe("London buckets", () => {
  it("uses London wall-clock time either side of a BST change", () => {
    expect(timeOfDay(new Date("2025-10-21T19:30:00Z"))).toBe("20"); // 20:30 BST
    expect(timeOfDay(new Date("2025-10-28T19:30:00Z"))).toBe("18"); // 19:30 GMT
    expect(timeOfDay(new Date("2025-10-28T22:00:00Z"))).toBe("late");
    expect(timeOfDay(new Date("2025-10-28T16:59:00Z"))).toBe("early");
  });

  it("puts a Friday 23:30 UTC kick-off in BST on Saturday", () => {
    expect(dayType(new Date("2025-10-24T23:30:00Z"))).toBe("weekend");
    expect(dayType(new Date("2025-10-31T23:30:00Z"))).toBe("weekday");
  });
});

describe("playerOutcomeSplit", () => {
  const app = (
    outcome: Outcome,
    positionGroup: PositionGroup,
    goals: number,
    secondsPlayed = FULL,
  ) =>
    ({
      matchId: `${outcome}${goals}${positionGroup}`,
      outcome,
      positionGroup,
      goals,
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
      secondsPlayed,
    }) as SquadAppearance;

  it("splits a Squad Member's per-90s and Win % by Position Group", () => {
    const split = playerOutcomeSplit(
      [
        app("W", "Forward", 2),
        app("W", "Forward", 1, FULL / 2),
        app("D", "Forward", 0),
        app("L", "Midfielder", 0),
      ],
      [],
    );
    expect(split.wins.goalsPer90).toBe(2);
    expect(split.dropped.appearances).toBe(2);
    expect(split.byPositionGroup).toEqual([
      {
        positionGroup: "Forward",
        played: 3,
        wins: 2,
        winPercentage: expect.closeTo(200 / 3),
      },
      { positionGroup: "Midfielder", played: 1, wins: 0, winPercentage: 0 },
    ]);
  });

  it("follows the Position Group selection", () => {
    const split = playerOutcomeSplit(
      [app("W", "Forward", 2), app("L", "Midfielder", 0)],
      ["Midfielder"],
    );
    expect(split.wins.appearances).toBe(0);
    expect(split.byPositionGroup.map((r) => r.positionGroup)).toEqual([
      "Midfielder",
    ]);
  });
});
