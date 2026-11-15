import { describe, expect, it } from "vitest";

import {
  type ChoiceCounts,
  choiceBreakdown,
  choiceMix,
  MIN_CHOICES,
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
    const mix = choiceMix(counts(10, 30, 100, 60));
    expect(mix).toEqual({
      total: 200,
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
  const row = (name: string, c: ChoiceCounts) => {
    const mix = choiceMix(c);
    if (!mix) throw new Error("too few choices");
    return { name, mix };
  };

  it("puts the most good or best options first, whatever the volume", () => {
    const ranked = rankChoices([
      row("Busy", counts(20, 80, 500, 400)),
      row("Tidy", counts(10, 30, 40, 20)),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["Tidy", "Busy"]);
  });

  it("breaks a tie on the fewest poor choices, then the name", () => {
    const ranked = rankChoices([
      row("Careless", counts(10, 30, 20, 40)),
      row("Beta", counts(10, 30, 40, 20)),
      row("Alpha", counts(10, 30, 40, 20)),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["Alpha", "Beta", "Careless"]);
  });

  it("lists small samples after everyone else", () => {
    const ranked = rankChoices([
      row("One match", counts(10, 10, 5, 0)),
      row("Regular", counts(10, 20, 100, 70)),
      row("Two matches", counts(4, 6, 20, 10)),
    ]);
    expect(ranked.map((r) => r.name)).toEqual([
      "Regular",
      "One match",
      "Two matches",
    ]);
  });
});

describe("choiceBreakdown", () => {
  const players = [
    { playerId: "a", name: "Ada", counts: counts(10, 30, 100, 60) },
    { playerId: "b", name: "Bo", counts: counts(30, 50, 80, 40) },
    { playerId: "c", name: "Cy", counts: counts(1, 1, 1, 1) },
  ];

  it("adds every Squad Member into Our Club's mix and ranks the rest", () => {
    const breakdown = choiceBreakdown(players, counts(20, 40, 100, 40));
    expect(breakdown?.club.total).toBe(404);
    expect(breakdown?.opponents?.goodOrBest).toBe(30);
    // Cy has too few choices to list, but still counts in the club's.
    expect(breakdown?.players.map((p) => p.name)).toEqual(["Bo", "Ada"]);
  });

  it("has no opponents' mix without their counts", () => {
    expect(choiceBreakdown(players, null)?.opponents).toBeNull();
    expect(choiceBreakdown(players, counts(1, 0, 0, 0))?.opponents).toBeNull();
  });

  it("is null when Our Club has too few choices", () => {
    expect(choiceBreakdown([], null)).toBeNull();
    expect(choiceBreakdown([players[2]], counts(20, 40, 100, 40))).toBeNull();
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
