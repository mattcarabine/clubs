import { describe, expect, it } from "vitest";

import type { Outcome, PositionGroup } from "~/lib/domain";

import {
  type AfterResultScope,
  type AfterResultSplit,
  afterResult,
  type ClubMatchTotals,
  dayType,
  droppedPointsReasons,
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
    opponent,
    secondsPlayed = FULL,
    playedAt,
    ...rest
  }: Partial<Omit<SplitMatch, "ours" | "opponent">> & {
    ours?: Partial<ClubMatchTotals>;
    opponent?: Partial<ClubMatchTotals>;
  } = {},
): SplitMatch {
  sequence += 1;
  return {
    matchId: `m${sequence}`,
    playedAt: playedAt ?? new Date(Date.UTC(2026, 9, 1, 19, sequence)),
    outcome,
    secondsPlayed,
    ours: totals(ours),
    opponent: totals(opponent),
    squadSize: 4,
    // Each Match its own Session unless a test says otherwise.
    session: sequence,
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

/** Matches from a string like "WLWLL", oldest first, each in its own Session. */
function run(outcomes: string): SplitMatch[] {
  return [...outcomes].map((o) => match(o as Outcome));
}

/** Matches from a string like "WLWLL", all in one Session. */
function session(outcomes: string, id: number): SplitMatch[] {
  return [...outcomes].map((o) => match(o as Outcome, { session: id }));
}

describe("afterResult", () => {
  const scope = (splits: AfterResultSplit[], id: AfterResultScope) =>
    splits.find((s) => s.scope === id);

  it("pairs each Match with the next one in the list", () => {
    // W→L, L→W, W→L, L→L, L→W, W→W, W→L, L→W, W→L
    const anyNext = scope(afterResult(run("WLWLLWWLWL")), "any-next");
    expect(anyNext).toMatchObject({
      label: "Any next Match",
      afterWin: { played: 5, wins: 1, winPercentage: 20 },
      afterDropped: { played: 4, wins: 3, winPercentage: 75 },
      comparable: true,
    });
  });

  it("counts draws as Dropped Points", () => {
    const anyNext = scope(afterResult(run("DWDWDW")), "any-next");
    expect(anyNext?.afterDropped).toEqual({
      played: 3,
      wins: 3,
      winPercentage: 100,
    });
  });

  it("keeps only pairs in the same Session under Same Session", () => {
    // The L ending Session 1 and the W starting Session 2 are a pair only under Any next Match.
    const splits = afterResult([...session("WLWL", 1), ...session("WLW", 2)]);
    expect(scope(splits, "any-next")).toMatchObject({
      afterWin: { played: 3, wins: 0 },
      afterDropped: { played: 3, wins: 3 },
    });
    expect(scope(splits, "same-session")).toMatchObject({
      afterWin: { played: 3, wins: 0 },
      afterDropped: { played: 2, wins: 2 },
      comparable: false,
    });
  });

  it("is not comparable with fewer than 3 Matches on either side", () => {
    const [anyNext] = afterResult(run("WWWLLL"));
    expect(anyNext.afterWin.played).toBe(3);
    expect(anyNext.afterDropped.played).toBe(2);
    expect(anyNext.comparable).toBe(false);
  });

  it("joins the findings in plain English, ranked by Win-rate gap", () => {
    // Same Session: 5 after Dropped Points (1 won), 5 after a Win (3 won).
    const matches = [...session("WWWWLL", 1), ...session("WLLLLW", 2)];
    const { findings } = outcomeSplit(matches, []);
    const sameSession = findings.find((f) => f.id === "after-same-session");
    expect(sameSession).toEqual({
      id: "after-same-session",
      factor: "After a result",
      text: "After Dropped Points in the same Session we win 20% (5 Matches) vs 60% after a Win (5)",
      counts:
        "5 Matches after Dropped Points, 5 after a Win in the same Session",
      smallSample: true,
    });
    expect(findings.find((f) => f.id === "after-any-next")?.text).toBe(
      "After Dropped Points we win 33% (6 Matches) vs 60% after a Win (5)",
    );
  });

  it("leaves a split with fewer than 3 on either side out of the findings", () => {
    const { findings } = outcomeSplit(run("WLWLLWWLWL"), []);
    expect(findings.map((f) => f.id)).toContain("after-any-next");
    expect(findings.map((f) => f.id)).not.toContain("after-same-session");
  });
});

describe("droppedPointsReasons", () => {
  /** Three Wins with 10, 12 and 14 shots (mean 12, standard deviation 1.63) and no goals. */
  const wins = () =>
    [10, 12, 14].map((shots) => match("W", { ours: { shots, goals: 0 } }));

  it("is null with fewer than 3 Wins", () => {
    expect(droppedPointsReasons(match("L"), wins().slice(0, 2))).toBeNull();
  });

  it("leads with the stat furthest from the Wins, in standard deviations, with both values", () => {
    const reasons = droppedPointsReasons(
      match("L", { ours: { shots: 6, goals: 0 } }),
      wins(),
    );
    expect(reasons?.wins).toBe(3);
    expect(reasons?.deviations[0]).toMatchObject({
      id: "ours-shots",
      club: "ours",
      text: "6.0 fewer shots per 90 than in a typical Win (6.0 vs 12.0)",
      standardDeviations: expect.closeTo(-6 / Math.sqrt(8 / 3)),
    });
  });

  it("shows at most 3, biggest first, and names the Opponent's stats", () => {
    const reasons = droppedPointsReasons(
      match("L", {
        ours: { shots: 2, goals: 0, saves: 6 },
        opponent: { passesMade: 92, ratingSum: 32 },
      }),
      wins(),
    );
    // Every Win has the same saves, Opponent pass % and rating, so those
    // differences are infinite and rank by relative change.
    expect(reasons?.deviations.map((d) => d.text)).toEqual([
      "4.0 more saves per 90 than in a typical Win (6.0 vs 2.0)",
      "Opponent pass completion 12 points higher than in a typical Win (92% vs 80%)",
      "Opponent average rating 1.0 higher than in a typical Win (8.0 vs 7.0)",
    ]);
  });

  it("compares a DNF per 90 over how long it ran", () => {
    // 9 shots in 45 minutes is 18 per 90; every other count doubles too, so zero them.
    const none = { goals: 0, saves: 0, redCards: 0 };
    const reasons = droppedPointsReasons(
      match("L", {
        secondsPlayed: FULL / 2,
        ours: { ...none, shots: 9 },
        opponent: { ...none, shots: 0 },
      }),
      [10, 12, 14].map((shots) =>
        match("W", {
          ours: { ...none, shots },
          opponent: { ...none, shots: 0 },
        }),
      ),
    );
    expect(reasons?.deviations.map((d) => d.text)).toEqual([
      "6.0 more shots per 90 than in a typical Win (18.0 vs 12.0)",
    ]);
  });

  it("has no deviations when the Match was like every Win", () => {
    expect(
      droppedPointsReasons(
        match("D"),
        many(3, () => match("W")),
      ),
    ).toEqual({
      wins: 3,
      deviations: [],
    });
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
