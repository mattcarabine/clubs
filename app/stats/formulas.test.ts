import { describe, expect, it } from "vitest";

import {
  average,
  cumulativePoints,
  currentStreak,
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
  tacklePercentage,
  winPercentage,
} from "./formulas";

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

  it("accumulates oldest first", () => {
    expect(cumulativePoints(["W", "L", "D"])).toEqual([3, 3, 4]);
    expect(cumulativePoints([])).toEqual([]);
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
