import { describe, expect, it } from "vitest";

import type { Outcome } from "~/lib/domain";

import {
  billing,
  eloWinChance,
  expectation,
  fitLogistic,
  formatWinChance,
  gapBandLabel,
  gapBands,
  MIN_FITTED_MATCHES,
  matchWinChance,
  type RatedResult,
  ratedResults,
  winChance,
  winChanceModel,
  winsAgainstExpected,
} from "./win-chance";

/** `count` results at a gap, the first `wins` of them Wins and the rest losses. */
function at(gap: number, count: number, wins: number): RatedResult[] {
  return Array.from({ length: count }, (_, i) => ({
    gap,
    outcome: (i < wins ? "W" : "L") as Outcome,
  }));
}

describe("eloWinChance", () => {
  it("is 1 / (1 + 10^(-gap / 400))", () => {
    expect(eloWinChance(0)).toBeCloseTo(0.5, 10);
    expect(eloWinChance(400)).toBeCloseTo(10 / 11, 10);
    expect(eloWinChance(-400)).toBeCloseTo(1 / 11, 10);
    expect(eloWinChance(100)).toBeCloseTo(1 / (1 + 10 ** -0.25), 10);
  });
});

describe("winChanceModel", () => {
  it(`falls back to the Elo estimate under ${MIN_FITTED_MATCHES} rated Matches`, () => {
    const results = [
      ...at(-200, 5, 0),
      ...at(200, MIN_FITTED_MATCHES - 6, MIN_FITTED_MATCHES - 6),
    ];
    const model = winChanceModel(results);
    expect(model.source).toBe("estimate");
    expect(model.matches).toBe(MIN_FITTED_MATCHES - 1);
    expect(winChance(model, 150)).toBeCloseTo(eloWinChance(150), 10);
  });

  it(`fits a curve from ${MIN_FITTED_MATCHES} rated Matches`, () => {
    const model = winChanceModel([
      ...at(-200, 5, 1),
      ...at(0, 10, 5),
      ...at(200, 5, 4),
    ]);
    expect(model.source).toBe("fitted");
    expect(model.matches).toBe(20);
    expect(winChance(model, 200)).toBeGreaterThan(winChance(model, 0));
    expect(winChance(model, 0)).toBeGreaterThan(winChance(model, -200));
  });

  it("falls back to the estimate when every rated Match was a Win", () => {
    expect(winChanceModel(at(50, 25, 25)).source).toBe("estimate");
  });

  it("counts draws as Dropped Points", () => {
    const withDraws = winChanceModel([...at(-100, 10, 3), ...at(100, 10, 7)]);
    const drawn = winChanceModel([
      ...at(-100, 10, 3).map((r) =>
        r.outcome === "L" ? { ...r, outcome: "D" as const } : r,
      ),
      ...at(100, 10, 7),
    ]);
    expect(drawn).toEqual(withDraws);
  });
});

describe("fitLogistic", () => {
  it("recovers a known curve from results at its expected frequencies", () => {
    const truth = { intercept: 0.3, slope: 0.008 };
    const results = [-300, -200, -100, 0, 100, 200, 300].flatMap((gap) =>
      at(gap, 1000, Math.round(1000 * winChance(truth, gap))),
    );
    const fit = fitLogistic(results);
    expect(fit?.intercept).toBeCloseTo(truth.intercept, 2);
    expect(fit?.slope).toBeCloseTo(truth.slope, 4);
  });

  it("stays finite and rising when every Win came at a bigger gap than every loss", () => {
    const fit = fitLogistic([...at(-150, 10, 0), ...at(150, 10, 10)]);
    expect(fit).not.toBeNull();
    expect(Number.isFinite(fit?.slope)).toBe(true);
    expect(fit?.slope).toBeGreaterThan(0);
  });

  it("expects exactly as many Wins as the Matches it was fitted on", () => {
    const results = [...at(-120, 7, 2), ...at(30, 9, 5), ...at(250, 6, 5)];
    const model = winChanceModel([...results, ...results]);
    expect(winsAgainstExpected(model, results).expected).toBeCloseTo(12, 6);
  });

  it("cannot fit results that are all the same", () => {
    expect(fitLogistic(at(0, 30, 0))).toBeNull();
  });
});

describe("expectation", () => {
  it("flags a Win under 35% as an upset, and under 20% as a big one", () => {
    expect(expectation(0.34, "W")).toEqual({ kind: "upset-win", big: false });
    expect(expectation(0.2, "W")).toEqual({ kind: "upset-win", big: false });
    expect(expectation(0.19, "W")).toEqual({ kind: "upset-win", big: true });
    expect(expectation(0.35, "W")).toBeNull();
  });

  it("flags a draw or loss over 65% as one we should have won, and over 80% as a big one", () => {
    expect(expectation(0.66, "L")).toEqual({
      kind: "should-have-won",
      big: false,
    });
    expect(expectation(0.66, "D")).toEqual({
      kind: "should-have-won",
      big: false,
    });
    expect(expectation(0.8, "L")).toEqual({
      kind: "should-have-won",
      big: false,
    });
    expect(expectation(0.81, "D")).toEqual({
      kind: "should-have-won",
      big: true,
    });
    expect(expectation(0.65, "L")).toBeNull();
    expect(expectation(0.2, "L")).toBeNull();
  });
});

describe("billing", () => {
  it("bills us Favourites from 55% and Underdogs to 45%, a toss-up between", () => {
    expect(billing(0.55)).toBe("favourites");
    expect(billing(0.9)).toBe("favourites");
    expect(billing(0.546)).toBe("favourites");
    expect(billing(0.544)).toBe("toss-up");
    expect(billing(0.5)).toBe("toss-up");
    expect(billing(0.457)).toBe("toss-up");
    expect(billing(0.452)).toBe("underdogs");
    expect(billing(0.45)).toBe("underdogs");
    expect(billing(0.1)).toBe("underdogs");
  });
});

describe("winsAgainstExpected", () => {
  it("sums each Match's Win Chance", () => {
    const model = winChanceModel([]);
    const results: RatedResult[] = [
      { gap: 0, outcome: "W" },
      { gap: 0, outcome: "L" },
      { gap: 400, outcome: "W" },
      { gap: -400, outcome: "D" },
    ];
    expect(winsAgainstExpected(model, results)).toEqual({
      played: 4,
      wins: 2,
      expected: expect.closeTo(2, 10),
    });
  });
});

describe("gapBands", () => {
  it("groups Matches into 100-point bands of gap, ends open past ±300, with each outcome and the Wins expected", () => {
    const model = winChanceModel([]);
    const results: RatedResult[] = [
      { gap: 150, outcome: "W" },
      { gap: -100, outcome: "D" },
      { gap: -1, outcome: "L" },
      { gap: 100, outcome: "L" },
      { gap: 0, outcome: "W" },
      { gap: -301, outcome: "L" },
      { gap: -700, outcome: "W" },
      { gap: 300, outcome: "W" },
      { gap: 900, outcome: "D" },
    ];
    const bands = gapBands(model, results);
    expect(bands.map((b) => [b.from, b.to])).toEqual([
      [null, -300],
      [-100, 0],
      [0, 100],
      [100, 200],
      [300, null],
    ]);
    expect(bands[0]).toMatchObject({ played: 2, wins: 1, draws: 0, losses: 1 });
    expect(bands[1]).toMatchObject({ played: 2, wins: 0, draws: 1, losses: 1 });
    expect(bands[3]).toMatchObject({ played: 2, wins: 1, draws: 0, losses: 1 });
    expect(bands[3].expectedWins).toBeCloseTo(
      eloWinChance(150) + eloWinChance(100),
      10,
    );
    expect(bands[4]).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0 });
  });

  it("has no bands without rated Matches", () => {
    expect(gapBands(winChanceModel([]), [])).toEqual([]);
  });
});

describe("gapBandLabel", () => {
  it("names closed and open bands with signed gaps", () => {
    expect(gapBandLabel({ from: -100, to: 0 })).toBe("−100 to 0");
    expect(gapBandLabel({ from: 100, to: 200 })).toBe("+100 to +200");
    expect(gapBandLabel({ from: null, to: -300 })).toBe("Under −300");
    expect(gapBandLabel({ from: 300, to: null })).toBe("+300 and over");
  });
});

describe("ratedResults", () => {
  it("keeps Matches with both Skill Ratings as gaps and leaves the rest out", () => {
    expect(
      ratedResults([
        { skillRatings: { ours: 1600, opponent: 1450 }, outcome: "W" },
        { skillRatings: { ours: null, opponent: 1450 }, outcome: "L" },
        { skillRatings: { ours: 1600, opponent: null }, outcome: "D" },
      ]),
    ).toEqual([{ gap: 150, outcome: "W" }]);
  });
});

describe("matchWinChance", () => {
  const estimate = winChanceModel([]);

  it("gives a rated Match its chance, source and flag", () => {
    expect(
      matchWinChance(estimate, {
        skillRatings: { ours: 1300, opponent: 1600 },
        outcome: "W",
      }),
    ).toEqual({
      chance: eloWinChance(-300),
      source: "estimate",
      expectation: { kind: "upset-win", big: true },
    });
  });

  it("is null for an unrated Match", () => {
    expect(
      matchWinChance(estimate, {
        skillRatings: { ours: 1300, opponent: null },
        outcome: "W",
      }),
    ).toBeNull();
  });
});

describe("formatWinChance", () => {
  it("is a whole percentage", () => {
    expect(formatWinChance(0.6234)).toBe("62%");
  });
});
