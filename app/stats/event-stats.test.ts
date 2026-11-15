import { describe, expect, it } from "vitest";

import type { MatchEvents } from "~/ea/events";

import {
  EVENT_STATS,
  type EventAppearance,
  evenestThreshold,
  eventCounts,
  eventStatValues,
  eventTotals,
  giveaways,
  type MatchEventAppearance,
  playerEventProfile,
  positionTotals,
  resultMovers,
  standing,
  styleMixes,
  teamShares,
  yardstickTotals,
  yellowCards,
} from "./event-stats";

const FULL_MATCH = 90 * 60;

function appearance(
  events: MatchEvents | null,
  overrides: Partial<EventAppearance> = {},
): EventAppearance {
  return {
    positionGroup: "Midfielder",
    secondsPlayed: FULL_MATCH,
    redCards: 0,
    events,
    ...overrides,
  };
}

let nextMatch = 0;
function inMatch(
  events: MatchEvents | null,
  overrides: Partial<MatchEventAppearance> = {},
): MatchEventAppearance {
  nextMatch += 1;
  return {
    ...appearance(events),
    matchId: `m${nextMatch}`,
    playerId: "p1",
    goalsFor: 0,
    outcome: "W",
    dnf: false,
    ...overrides,
  };
}

describe("yellowCards", () => {
  it.each([
    ["no card", { "215": 10 }, 0, 0],
    ["one immediate yellow", { "95": 1 }, 0, 1],
    ["one delayed yellow", { "213": 1 }, 0, 1],
    ["EA's counters doubling up on one yellow", { "95": 2, "213": 1 }, 0, 1],
    [
      "a second yellow: a red without the straight-red counter",
      { "95": 2 },
      1,
      2,
    ],
    ["a straight red after a yellow", { "95": 1, "96": 1 }, 1, 1],
    ["a straight red alone", { "96": 1 }, 1, 0],
  ])("%s", (_, events, redCards, expected) => {
    expect(yellowCards(appearance(events, { redCards }))).toBe(expected);
  });

  it("is 0 without Match Events", () => {
    expect(yellowCards(appearance(null, { redCards: 1 }))).toBe(0);
  });
});

describe("eventCounts and eventTotals", () => {
  it("adds up the counters behind each count", () => {
    const counts = eventCounts(
      appearance({ "13": 2, "14": 1, "18": 1, "19": 3, "108": 1, "110": 2 }),
    );
    expect(counts).toMatchObject({
      shotsInsideBox: 3,
      shotsOutsideBox: 4,
      ballWonDefensiveThird: 1,
      ballWonAttackingThird: 2,
    });
  });

  it("takes red cards from EA's named stat", () => {
    expect(
      eventCounts(appearance({ "96": 1 }, { redCards: 1 }))?.redCards,
    ).toBe(1);
  });

  it("leaves out Appearances with no Match Events or no minutes", () => {
    const totals = eventTotals([
      appearance({ "217": 2 }),
      appearance(null),
      appearance({ "217": 5 }, { secondsPlayed: 0 }),
    ]);
    expect(totals).toMatchObject({ appearances: 1, seconds: FULL_MATCH });
    expect(totals.counts.shotsOnTarget).toBe(2);
  });
});

describe("EVENT_STATS", () => {
  const totals = eventTotals([
    appearance(
      {
        "214": 1,
        "11": 1,
        "115": 1,
        "217": 3,
        "218": 1,
        "30": 6,
        "31": 2,
        "32": 1,
        "34": 1,
        "111": 15,
        "219": 5,
        "0": 3,
        "1": 1,
      },
      { secondsPlayed: FULL_MATCH / 2 },
    ),
  ]);
  const values = eventStatValues(totals);

  it("scales counts to 90 minutes played", () => {
    expect(values.goalInvolvements).toBe(6);
    expect(values.shotsOnTarget).toBe(6);
  });

  it("works shares out of what was tried", () => {
    expect(values.shotAccuracy).toBe(75);
    expect(values.finishing).toBe(25);
    expect(values.forwardPassShare).toBe(80);
    expect(values.forwardPassAccuracy).toBe(75);
    expect(values.tackleSuccess).toBe(75);
    expect(values.outOfPosition).toBe(25);
  });

  it("is null where nothing was tried", () => {
    expect(values.shotsInsideBox).toBeNull();
    expect(eventStatValues(eventTotals([])).ballLost).toBeNull();
  });

  it("gives every stat a header no longer than a table can take", () => {
    for (const { header } of Object.values(EVENT_STATS)) {
      expect(header.length).toBeLessThanOrEqual(16);
    }
  });
});

describe("standing", () => {
  it("reads the gap the way that is good for us", () => {
    expect(standing("high", 2.5, 2)).toBe("better");
    expect(standing("high", 2, 2.5)).toBe("worse");
    expect(standing("low", 2, 2.5)).toBe("better");
    expect(standing("low", 2.5, 2)).toBe("worse");
  });

  it("says much better or worse once one is half as much again as the other", () => {
    expect(standing("high", 3, 2)).toBe("muchBetter");
    expect(standing("high", 2, 3)).toBe("muchWorse");
    expect(standing("low", 3, 6)).toBe("muchBetter");
    expect(standing("low", 1, 0)).toBe("muchWorse");
    expect(standing("high", 2.9, 2)).toBe("better");
  });

  it("calls a gap under a tenth level", () => {
    expect(standing("high", 2.05, 2)).toBe("level");
    expect(standing("low", 0, 0)).toBe("level");
  });

  it("has nothing to say about style, or without both figures", () => {
    expect(standing("neither", 3, 2)).toBeNull();
    expect(standing("high", null, 2)).toBeNull();
    expect(standing("high", 3, null)).toBeNull();
  });
});

describe("yardstickTotals", () => {
  const opponents = positionTotals([
    appearance({ "6": 4 }, { positionGroup: "Midfielder" }),
    appearance({ "6": 2 }, { positionGroup: "Midfielder" }),
    appearance({ "6": 9 }, { positionGroup: "Defender" }),
    appearance({ "6": 50 }, { positionGroup: null }),
  ]);

  it("is the opposing humans in the same Position Group, over the same minutes", () => {
    const own = [appearance({ "6": 1 }, { secondsPlayed: FULL_MATCH / 2 })];
    const yardstick = yardstickTotals(own, opponents);
    expect(yardstick?.seconds).toBe(FULL_MATCH / 2);
    // Opposing midfielders: 6 interceptions in 180 minutes, so 3 per 90.
    expect(yardstick && EVENT_STATS.interceptions.value(yardstick)).toBe(3);
  });

  it("weights each Position Group by the time played in it", () => {
    const own = [
      appearance({}, { positionGroup: "Midfielder" }),
      appearance({}, { positionGroup: "Defender" }),
    ];
    const yardstick = yardstickTotals(own, opponents);
    // Half the time against 3 per 90, half against 9.
    expect(yardstick && EVENT_STATS.interceptions.value(yardstick)).toBe(6);
  });

  it("is null when no opponent played in their Position Group", () => {
    const own = [appearance({}, { positionGroup: "Forward" })];
    expect(yardstickTotals(own, opponents)).toBeNull();
  });
});

describe("teamShares", () => {
  it("sets a Squad Member's counts against the team's in the Matches they played", () => {
    const own = [
      inMatch(
        { "214": 1, "115": 1, "217": 3, "109": 2, "106": 1 },
        {
          matchId: "a",
          goalsFor: 4,
        },
      ),
    ];
    const team = [
      ...own,
      inMatch(
        { "217": 1, "109": 2, "106": 3 },
        { matchId: "a", playerId: "p2" },
      ),
      // Another Match they did not play in never counts.
      inMatch({ "217": 9 }, { matchId: "b", playerId: "p2" }),
    ];
    const { shares, evenShare } = teamShares(own, team);
    expect(evenShare).toBe(50);
    expect(shares).toEqual([
      { id: "goals", own: 2, team: 4, share: 50, better: "high" },
      { id: "shotsOnTarget", own: 3, team: 4, share: 75, better: "high" },
      { id: "ballWon", own: 2, team: 4, share: 50, better: "high" },
      { id: "ballLost", own: 1, team: 4, share: 25, better: "low" },
    ]);
  });

  it("counts a rage quit's real score in the goals share", () => {
    const own = [
      inMatch({ "214": 1 }, { matchId: "a", goalsFor: 2 }),
      inMatch({ "214": 1 }, { matchId: "b", goalsFor: 3, dnf: true }),
    ];
    const goals = teamShares(own, own).shares.find((s) => s.id === "goals");
    expect(goals).toMatchObject({ own: 2, team: 5, share: 40 });
  });

  it("leaves out a share with nothing to share out", () => {
    const own = [inMatch({ "215": 5 })];
    expect(teamShares(own, own).shares).toEqual([]);
  });
});

describe("evenestThreshold", () => {
  it("splits the values as evenly as it can, at 1 or more", () => {
    expect(evenestThreshold([0, 0, 1, 2, 3, 5])).toBe(2);
    expect(evenestThreshold([1, 2, 3, 4, 5, 6])).toBe(4);
    expect(evenestThreshold([0, 0, 0, 0, 3])).toBe(3);
  });

  it("is null when nothing splits them", () => {
    expect(evenestThreshold([2, 2, 2])).toBeNull();
    expect(evenestThreshold([0, 0])).toBeNull();
    expect(evenestThreshold([])).toBeNull();
  });
});

describe("resultMovers", () => {
  const matches = (
    count: number,
    events: MatchEvents,
    outcome: MatchEventAppearance["outcome"],
  ) => Array.from({ length: count }, () => inMatch(events, { outcome }));

  it("finds what goes with winning, and with dropping points", () => {
    const {
      up,
      down,
      matches: read,
    } = resultMovers([
      // Wins come with 3 interceptions and no stray passes.
      ...matches(6, { "6": 3 }, "W"),
      ...matches(6, { "6": 0, "216": 4 }, "L"),
      ...matches(1, { "6": 3, "216": 4 }, "D"),
    ]);
    expect(read).toBe(13);
    expect(up).toEqual([
      {
        id: "interceptions",
        label: "3 or more interceptions",
        threshold: 3,
        more: { played: 7, wins: 6, winPercentage: (6 / 7) * 100 },
        fewer: { played: 6, wins: 0, winPercentage: 0 },
        gap: (6 / 7) * 100,
        smallSample: true,
      },
    ]);
    expect(down.map((m) => m.id)).toEqual(["passesFailed"]);
    expect(down[0].gap).toBeCloseTo(-100);
  });

  it("needs enough Matches on both sides", () => {
    const { up, down } = resultMovers([
      ...matches(4, { "6": 3 }, "W"),
      ...matches(8, { "6": 0 }, "L"),
    ]);
    expect([...up, ...down]).toEqual([]);
  });

  it("leaves rage quits out", () => {
    const quit = Array.from({ length: 6 }, () =>
      inMatch({ "6": 3 }, { outcome: "W", dnf: true }),
    );
    const { matches: read, up } = resultMovers([
      ...quit,
      ...matches(6, { "6": 0 }, "L"),
    ]);
    expect(read).toBe(6);
    expect(up).toEqual([]);
  });
});

describe("styleMixes", () => {
  it("shares out passes, shots and where the ball is won and lost", () => {
    const mixes = styleMixes(
      eventTotals([
        appearance({ "30": 3, "31": 1, "34": 2, "32": 2, "13": 1 }),
      ]),
    );
    expect(mixes).toEqual([
      {
        id: "passDirection",
        total: 8,
        parts: [
          { label: "Forward", share: 50 },
          { label: "Sideways", share: 25 },
          { label: "Backward", share: 25 },
        ],
      },
      {
        id: "shots",
        total: 1,
        parts: [
          { label: "Inside the box", share: 100 },
          { label: "Outside the box", share: 0 },
        ],
      },
    ]);
  });
});

describe("giveaways", () => {
  // 16 of 20 short passes, 5 of 10 long, 1 of 2 crosses; 6 failed forward, 2 sideways.
  const own = eventTotals([
    appearance({
      "24": 16,
      "25": 4,
      "28": 5,
      "29": 5,
      "36": 1,
      "37": 1,
      "31": 6,
      "35": 2,
    }),
  ]);
  const theirs = eventTotals([
    appearance({ "24": 18, "25": 2, "28": 2, "29": 8 }),
  ]);

  it("shares out the failed passes by kind and by direction", () => {
    const found = giveaways(own, null);
    expect(found?.byLength).toEqual({
      total: 10,
      parts: [
        { label: "Short passes", share: 40 },
        { label: "Medium passes", share: 0 },
        { label: "Long passes", share: 50 },
        { label: "Crosses", share: 10 },
      ],
    });
    expect(found?.byDirection).toEqual({
      total: 8,
      parts: [
        { label: "Forward", share: 75 },
        { label: "Sideways", share: 25 },
        { label: "Backward", share: 0 },
      ],
    });
  });

  it("sets each kind tried often enough beside the Yardstick", () => {
    expect(giveaways(own, theirs)?.passTypes).toEqual([
      {
        id: "short",
        label: "Short passes",
        attempted: 20,
        failed: 4,
        value: 80,
        yardstick: 90,
        standing: "worse",
      },
      {
        id: "long",
        label: "Long passes",
        attempted: 10,
        failed: 5,
        value: 50,
        yardstick: 20,
        standing: "muchBetter",
      },
    ]);
  });

  it("is null with no passes to speak of", () => {
    expect(giveaways(eventTotals([appearance({ "6": 1 })]), null)).toBeNull();
  });
});

describe("playerEventProfile", () => {
  it("is null without Match Events", () => {
    expect(playerEventProfile([inMatch(null)], [], new Map())).toBeNull();
  });

  it("puts each Event Stat beside its Yardstick", () => {
    const own = [inMatch({ "6": 4 })];
    const opponents = positionTotals([appearance({ "6": 2 })]);
    const profile = playerEventProfile(own, own, opponents);
    expect(profile?.appearances).toBe(1);
    expect(profile?.lines.interceptions).toEqual({
      id: "interceptions",
      value: 4,
      yardstick: 2,
      standing: "muchBetter",
    });
  });
});
