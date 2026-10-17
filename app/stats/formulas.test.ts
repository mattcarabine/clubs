import { describe, expect, it } from "vitest";

import type { Outcome } from "~/lib/domain";

import {
  average,
  currentStreak,
  effectSize,
  form,
  minutesPlayed,
  oppositeOutcome,
  outcomeFromScore,
  passPercentage,
  per90,
  percentage,
  points,
  ratio,
  rollingAverage,
  rollingWinPercentage,
  standardScore,
  tacklePercentage,
  weightedMean,
  weightedVariance,
  winPercentage,
  winRateEffectSize,
} from "./formulas";

describe("rollingWinPercentage", () => {
  it("is the Win % over the last 10 Matches at each point", () => {
    const outcomes: Outcome[] = [
      ...Array<Outcome>(10).fill("W"),
      ...Array<Outcome>(5).fill("L"),
    ];
    const rolling = rollingWinPercentage(outcomes);
    expect(rolling.slice(0, 10)).toEqual(Array(10).fill(100));
    // The 15th Match: 5 Wins and 5 losses in the last 10.
    expect(rolling.at(-1)).toBe(50);
  });

  it("counts draws as not won and starts from the first Match", () => {
    expect(rollingWinPercentage(["D", "W", "L", "W"], 2)).toEqual([
      0, 50, 50, 50,
    ]);
  });
});

describe("weightedMean and weightedVariance", () => {
  it("weights each value", () => {
    const values = [
      { value: 10, weight: 1 },
      { value: 20, weight: 3 },
    ];
    expect(weightedMean(values)).toBe(17.5);
    expect(weightedVariance(values)).toBeCloseTo(18.75);
  });

  it("is null with no weight", () => {
    expect(weightedMean([])).toBeNull();
    expect(weightedVariance([{ value: 4, weight: 0 }])).toBeNull();
  });
});

describe("standardScore", () => {
  const unweighted = (values: number[]) =>
    values.map((value) => ({ value, weight: 1 }));

  it("is the distance from the mean in standard deviations, signed", () => {
    // Mean 12, population standard deviation sqrt(8/3).
    const wins = unweighted([10, 12, 14]);
    expect(standardScore(6, wins)).toBeCloseTo(-6 / Math.sqrt(8 / 3));
    expect(standardScore(14, wins)).toBeCloseTo(2 / Math.sqrt(8 / 3));
  });

  it("weights the sample", () => {
    // Weighted mean 12, variance (90 * 4 + 10 * 324) / 100 = 36.
    const sample = [
      { value: 10, weight: 90 },
      { value: 30, weight: 10 },
    ];
    expect(standardScore(18, sample)).toBeCloseTo(1);
  });

  it("is infinite for any difference from a constant sample, and 0 for none", () => {
    expect(standardScore(9, unweighted([12, 12]))).toBe(-Infinity);
    expect(standardScore(12, unweighted([12, 12]))).toBe(0);
  });

  it("is null for an empty sample", () => {
    expect(standardScore(1, [])).toBeNull();
  });
});

describe("effectSize", () => {
  const unweighted = (values: number[]) =>
    values.map((value) => ({ value, weight: 1 }));

  it("is the mean difference over the pooled spread, signed a - b", () => {
    // Means 4 and 2, each with population variance 8/3.
    const a = unweighted([2, 4, 6]);
    const b = unweighted([0, 2, 4]);
    expect(effectSize(a, b)).toBeCloseTo(2 / Math.sqrt(8 / 3));
    expect(effectSize(b, a)).toBeCloseTo(-2 / Math.sqrt(8 / 3));
  });

  it("weights values, so a short Match counts for less", () => {
    const wins = [
      { value: 10, weight: 90 },
      { value: 30, weight: 10 },
    ];
    expect(weightedMean(wins)).toBe(12);
  });

  it("is infinite for any difference between two constant samples, and 0 for none", () => {
    expect(effectSize(unweighted([9, 9]), unweighted([12, 12]))).toBe(
      -Infinity,
    );
    expect(effectSize(unweighted([5]), unweighted([5, 5]))).toBe(0);
  });

  it("is null when a side is empty", () => {
    expect(effectSize([], unweighted([1]))).toBeNull();
  });
});

describe("winRateEffectSize", () => {
  it("is Cohen's h between two Win %", () => {
    expect(winRateEffectSize(50, 50)).toBe(0);
    expect(winRateEffectSize(100, 0)).toBeCloseTo(Math.PI);
    expect(winRateEffectSize(25, 75)).toBeCloseTo(-Math.PI / 3);
  });
});

describe("ratio and percentage", () => {
  it("divides", () => {
    expect(ratio(1, 4)).toBe(0.25);
    expect(percentage(1, 4)).toBe(25);
  });

  it("is null when dividing by zero", () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(3, 0)).toBeNull();
    expect(percentage(3, 0)).toBeNull();
  });
});

describe("passPercentage", () => {
  it("is passes made over attempts", () => {
    expect(passPercentage(17, 20)).toBe(85);
    expect(passPercentage(0, 5)).toBe(0);
  });

  it("is null with no attempts", () => {
    expect(passPercentage(0, 0)).toBeNull();
  });
});

describe("tacklePercentage", () => {
  it("is tackles made over attempts", () => {
    expect(tacklePercentage(3, 4)).toBe(75);
  });

  it("is null with no attempts", () => {
    expect(tacklePercentage(0, 0)).toBeNull();
  });
});

describe("per90", () => {
  it("scales a total to 90 minutes", () => {
    expect(per90(1, 90 * 60)).toBe(1);
    expect(per90(1, 45 * 60)).toBe(2);
    expect(per90(3, 180 * 60)).toBe(1.5);
  });

  it("is zero when nothing happened in the minutes played", () => {
    expect(per90(0, 90 * 60)).toBe(0);
  });

  it("is null with zero minutes played", () => {
    expect(per90(0, 0)).toBeNull();
    expect(per90(2, 0)).toBeNull();
  });

  it("is null for negative time", () => {
    expect(per90(1, -60)).toBeNull();
  });
});

describe("minutesPlayed", () => {
  it("rounds seconds down to whole minutes", () => {
    expect(minutesPlayed(0)).toBe(0);
    expect(minutesPlayed(59)).toBe(0);
    expect(minutesPlayed(5430)).toBe(90);
  });
});

describe("average", () => {
  it("averages and skips nulls", () => {
    expect(average([6, 8])).toBe(7);
    expect(average([6, null, 8])).toBe(7);
  });

  it("is null with no values", () => {
    expect(average([])).toBeNull();
    expect(average([null, null])).toBeNull();
  });
});

describe("form", () => {
  it("averages the last 5 ratings", () => {
    expect(form([1, 1, 6, 7, 8, 9, 10])).toBe(8);
  });

  it("averages what there is with fewer than 5 Appearances", () => {
    expect(form([6, 8])).toBe(7);
  });

  it("lets an unrated Appearance use up a slot", () => {
    expect(form([1, 7, 7, 7, 7, null])).toBe(7);
  });

  it("is null with no Appearances or no ratings", () => {
    expect(form([])).toBeNull();
    expect(form([null, null])).toBeNull();
  });
});

describe("rollingAverage", () => {
  it("averages each point with up to 4 before it", () => {
    const values = [5, 6, 7, 8, 9, 10];
    expect(rollingAverage(values)).toEqual([5, 5.5, 6, 6.5, 7, 8]);
  });

  it("ends on the average of the last 5", () => {
    const values = [6.1, 7.4, 8.0, 5.5, 9.2, 7.0];
    expect(rollingAverage(values).at(-1)).toBeCloseTo(
      (7.4 + 8.0 + 5.5 + 9.2 + 7.0) / 5,
    );
  });

  it("takes a window size", () => {
    expect(rollingAverage([2, 4, 6], 2)).toEqual([2, 3, 5]);
  });

  it("skips nulls and is null where the window has no values", () => {
    expect(rollingAverage([null, 4, null], 2)).toEqual([null, 4, 4]);
  });

  it("returns an empty series for no values", () => {
    expect(rollingAverage([])).toEqual([]);
  });

  it("rejects a window below 1", () => {
    expect(() => rollingAverage([1], 0)).toThrow(RangeError);
  });
});

describe("outcomeFromScore", () => {
  it("is from the point of view of the club scoring goalsFor", () => {
    expect(outcomeFromScore(3, 1)).toBe("W");
    expect(outcomeFromScore(1, 3)).toBe("L");
    expect(outcomeFromScore(2, 2)).toBe("D");
    expect(outcomeFromScore(0, 0)).toBe("D");
  });
});

describe("oppositeOutcome", () => {
  it("flips to the other club's point of view", () => {
    expect(oppositeOutcome("W")).toBe("L");
    expect(oppositeOutcome("L")).toBe("W");
    expect(oppositeOutcome("D")).toBe("D");
  });
});

describe("points", () => {
  it("gives 3 for a win, 1 for a draw and 0 for a loss", () => {
    expect(points(["W", "D", "L", "W"])).toBe(7);
  });

  it("is 0 with no Matches", () => {
    expect(points([])).toBe(0);
  });
});

describe("winPercentage", () => {
  it("is wins over Matches played", () => {
    expect(winPercentage(["W", "D", "L", "W"])).toBe(50);
  });

  it("is null with no Matches", () => {
    expect(winPercentage([])).toBeNull();
  });
});

describe("currentStreak", () => {
  it("counts the latest run of one Outcome", () => {
    expect(currentStreak(["L", "W", "W", "W"])).toEqual({
      outcome: "W",
      length: 3,
    });
    expect(currentStreak(["W", "D"])).toEqual({ outcome: "D", length: 1 });
  });

  it("is null with no Matches", () => {
    expect(currentStreak([])).toBeNull();
  });
});
