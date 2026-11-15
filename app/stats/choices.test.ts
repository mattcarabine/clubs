import { describe, expect, it } from "vitest";

import {
  type ChoiceCounts,
  choiceBreakdown,
  choiceMix,
  MIN_CHOICES,
  mainChoicePosition,
  type PositionChoices,
  playerChoiceProfile,
  rankChoices,
  SMALL_CHOICE_SAMPLE,
  sumChoiceCounts,
} from "./choices";

const counts = (
  best: number,
  good: number,
  none: number,
  poor: number,
): ChoiceCounts => ({
  bestChoices: best,
  goodChoices: good,
  noGoodOptions: none,
  poorChoices: poor,
});

describe("choiceMix", () => {
  it("shares the four verdicts out of their total", () => {
    const mix = choiceMix(counts(20, 60, 200, 120));
    expect(mix).toEqual({
      total: 400,
      shares: { best: 5, good: 15, none: 50, poor: 30 },
      goodOrBest: 20,
      smallSample: false,
    });
  });

  it("is null under the fewest choices worth sharing out", () => {
    expect(choiceMix(counts(0, 0, 0, 0))).toBeNull();
    expect(choiceMix(counts(1, 2, MIN_CHOICES - 4, 0))).toBeNull();
    expect(choiceMix(counts(1, 2, MIN_CHOICES - 3, 0))).not.toBeNull();
  });

  it("marks a small sample until there are enough choices", () => {
    expect(
      choiceMix(counts(0, SMALL_CHOICE_SAMPLE - 1, 0, 0))?.smallSample,
    ).toBe(true);
    expect(choiceMix(counts(0, SMALL_CHOICE_SAMPLE, 0, 0))?.smallSample).toBe(
      false,
    );
  });

  it("holds scaled counts to how many choices they really rest on", () => {
    // 40 real choices scaled up to a busy Squad Member's minutes.
    const scaled = counts(30, 90, 300, 180);
    const mix = choiceMix(scaled, 40);
    expect(mix?.total).toBe(40);
    expect(mix?.shares).toEqual({ best: 5, good: 15, none: 50, poor: 30 });
    expect(mix?.smallSample).toBe(true);
    // And scaled down: plenty of real choices behind a small share of minutes.
    expect(choiceMix(counts(0.5, 1.5, 5, 3), 400)?.smallSample).toBe(false);
    expect(choiceMix(scaled, MIN_CHOICES - 1)).toBeNull();
    expect(choiceMix(counts(0, 0, 0, 0), 400)).toBeNull();
  });
});

describe("sumChoiceCounts", () => {
  it("adds each verdict up", () => {
    expect(
      sumChoiceCounts([counts(1, 2, 3, 4), counts(10, 20, 30, 40)]),
    ).toEqual(counts(11, 22, 33, 44));
  });

  it("is all zeros for no rows", () => {
    expect(sumChoiceCounts([])).toEqual(counts(0, 0, 0, 0));
  });
});

describe("rankChoices", () => {
  const row = (name: string, c: ChoiceCounts, edge: number | null = null) => {
    const mix = choiceMix(c);
    if (!mix) throw new Error("too few choices");
    return { name, mix, edge };
  };

  it("puts the furthest ahead of their Yardstick first, whatever their share", () => {
    const ranked = rankChoices([
      row("Midfielder", counts(40, 120, 160, 80), -2),
      row("Forward", counts(40, 80, 200, 80), 4),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["Forward", "Midfielder"]);
  });

  it("lists those with no Yardstick after the rest, the most good or best options first", () => {
    const ranked = rankChoices([
      row("Busy", counts(20, 80, 500, 400)),
      row("Tidy", counts(40, 120, 160, 80)),
      row("Trailing", counts(40, 120, 160, 80), -10),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["Trailing", "Tidy", "Busy"]);
  });

  it("breaks a tie on the fewest poor choices, then the name", () => {
    const ranked = rankChoices([
      row("Careless", counts(100, 300, 200, 400), 1),
      row("Beta", counts(100, 300, 400, 200), 1),
      row("Alpha", counts(100, 300, 400, 200), 1),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["Alpha", "Beta", "Careless"]);
  });

  it("lists small samples after everyone else", () => {
    const ranked = rankChoices([
      row("One match", counts(10, 10, 5, 0), 50),
      row("Regular", counts(15, 30, 150, 105), -15),
      row("Two matches", counts(4, 6, 20, 10), -5),
    ]);
    expect(ranked.map((r) => r.name)).toEqual([
      "Regular",
      "One match",
      "Two matches",
    ]);
  });
});

describe("mainChoicePosition", () => {
  const position = (
    positionGroup: PositionChoices["positionGroup"],
    appearances: number,
    latestAt = 0,
  ): PositionChoices => ({
    positionGroup,
    appearances,
    latestAt,
    counts: counts(0, 0, 0, 0),
  });

  it("is the Position Group with the most Appearances", () => {
    expect(
      mainChoicePosition([position("Midfielder", 3), position("Forward", 9)]),
    ).toBe("Forward");
  });

  it("gives a tie to the one played in most recently", () => {
    expect(
      mainChoicePosition([
        position("Midfielder", 4, 200),
        position("Forward", 4, 100),
      ]),
    ).toBe("Midfielder");
  });

  it("never counts Appearances with no position, and is null with nothing else", () => {
    expect(
      mainChoicePosition([position(null, 9), position("Defender", 1)]),
    ).toBe("Defender");
    expect(mainChoicePosition([position(null, 9)])).toBeNull();
    expect(mainChoicePosition([])).toBeNull();
  });
});

describe("choiceBreakdown", () => {
  const position = (
    positionGroup: PositionChoices["positionGroup"],
    c: ChoiceCounts,
    appearances = 10,
  ): PositionChoices => ({
    positionGroup,
    appearances,
    latestAt: 0,
    counts: c,
  });

  const players = [
    {
      playerId: "a",
      name: "Ada",
      // A forward who has filled in at midfield twice.
      positions: [
        position("Forward", counts(40, 80, 200, 80)),
        position("Midfielder", counts(0, 10, 20, 10), 2),
      ],
    },
    {
      playerId: "b",
      name: "Bo",
      positions: [position("Midfielder", counts(30, 90, 200, 80))],
    },
    {
      playerId: "c",
      name: "Cy",
      positions: [position("Defender", counts(1, 1, 1, 1), 1)],
    },
  ];
  // Opposing forwards take a good or best option 25% of the time, midfielders 35%.
  const opponents = [
    position("Forward", counts(40, 60, 220, 80)),
    position("Midfielder", counts(40, 100, 180, 80)),
  ];

  it("adds every Squad Member in every position into Our Club's mix", () => {
    const breakdown = choiceBreakdown(players, opponents);
    expect(breakdown?.club.total).toBe(844);
    expect(breakdown?.opponents).toMatchObject({ total: 800, goodOrBest: 30 });
  });

  it("sets each Squad Member's Main Position against the opposing humans in it", () => {
    const breakdown = choiceBreakdown(players, opponents);
    // Ada's 30% is 5 points up on opposing forwards; Bo's 30% is 5 down on
    // opposing midfielders. Cy has too few choices to list.
    expect(breakdown?.players).toMatchObject([
      {
        name: "Ada",
        position: "Forward",
        mix: { total: 400, goodOrBest: 30 },
        yardstick: { goodOrBest: 25 },
        edge: 5,
      },
      {
        name: "Bo",
        position: "Midfielder",
        mix: { total: 400, goodOrBest: 30 },
        yardstick: { goodOrBest: 35 },
        edge: -5,
      },
    ]);
  });

  it("compares with nothing when the opponents in that position are a small sample", () => {
    const breakdown = choiceBreakdown(players, [
      position("Forward", counts(10, 15, 55, 20)),
      opponents[1],
    ]);
    // Bo is compared and so comes first; Ada's share stands alone.
    expect(breakdown?.players).toMatchObject([
      { name: "Bo", edge: -5 },
      { name: "Ada", yardstick: null, edge: null },
    ]);
  });

  it("measures the gap in whole points between the shares as printed", () => {
    // 30.4% beside 29.6%: both print as 30%, so they are level.
    const breakdown = choiceBreakdown(
      [
        {
          playerId: "e",
          name: "Ed",
          positions: [position("Forward", counts(104, 200, 500, 196))],
        },
      ],
      [position("Forward", counts(96, 200, 500, 204))],
    );
    expect(breakdown?.players[0].edge).toBe(0);
  });

  it("counts everything a Squad Member with no position did, beside nothing", () => {
    const breakdown = choiceBreakdown(
      [
        {
          playerId: "d",
          name: "Di",
          positions: [position(null, counts(40, 80, 200, 80))],
        },
      ],
      opponents,
    );
    expect(breakdown?.players).toMatchObject([
      { name: "Di", position: null, mix: { total: 400 }, edge: null },
    ]);
  });

  it("has no opponents' mix when they have too few choices", () => {
    expect(choiceBreakdown(players, [])?.opponents).toBeNull();
    expect(
      choiceBreakdown(players, [position("Forward", counts(1, 0, 0, 0))])
        ?.opponents,
    ).toBeNull();
  });

  it("is null when Our Club has too few choices", () => {
    expect(choiceBreakdown([], opponents)).toBeNull();
    expect(choiceBreakdown([players[2]], opponents)).toBeNull();
  });
});

describe("playerChoiceProfile", () => {
  it("sets a Squad Member's mix beside the Yardstick's and the team's", () => {
    const profile = playerChoiceProfile(
      counts(10, 30, 100, 60),
      { counts: counts(5, 20, 50, 25), judged: 60 },
      counts(40, 80, 180, 100),
    );
    expect(profile?.own.goodOrBest).toBe(20);
    expect(profile?.yardstick?.goodOrBest).toBe(25);
    expect(profile?.yardstick?.smallSample).toBe(true);
    expect(profile?.team?.goodOrBest).toBe(30);
  });

  it("is null when the Squad Member has too few choices", () => {
    expect(
      playerChoiceProfile(
        counts(1, 1, 1, 1),
        { counts: counts(5, 20, 50, 25), judged: 100 },
        null,
      ),
    ).toBeNull();
  });

  it("leaves out a side with too few", () => {
    const own = counts(10, 30, 100, 60);
    expect(playerChoiceProfile(own, null, null)).toMatchObject({
      yardstick: null,
      team: null,
    });
    // A Yardstick resting on a handful of real choices, however it scales.
    expect(
      playerChoiceProfile(own, { counts: own, judged: 5 }, counts(1, 1, 1, 1)),
    ).toMatchObject({ yardstick: null, team: null });
  });
});
