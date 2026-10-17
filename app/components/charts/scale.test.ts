import { describe, expect, it } from "vitest";
import {
  axisLabelIndices,
  formatCompact,
  linearScale,
  niceTicks,
} from "./scale";

describe("linearScale", () => {
  it("maps the domain onto the range, including inverted ranges", () => {
    const y = linearScale([0, 10], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(5)).toBe(100);
    expect(y(10)).toBe(0);
  });

  it("collapses a zero-width domain to the range start", () => {
    expect(linearScale([3, 3], [0, 100])(3)).toBe(0);
  });
});

describe("niceTicks", () => {
  it("produces round steps that cover the data", () => {
    expect(niceTicks(0, 7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(0, 100)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(0, 0.9)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("spans negative values through zero", () => {
    expect(niceTicks(-3, 5)).toEqual([-4, -2, 0, 2, 4, 6]);
  });

  it("handles flat and empty data", () => {
    expect(niceTicks(0, 0)).toEqual([0, 1]);
    expect(niceTicks(4, 4)).toEqual([0, 1, 2, 3, 4]);
    expect(niceTicks(Number.NaN, 3)).toEqual([0]);
  });
});

describe("niceTicks with integer steps", () => {
  it("never steps by a fraction", () => {
    expect(niceTicks(1631, 1633, 4, { integer: true })).toEqual([
      1631, 1632, 1633,
    ]);
    expect(niceTicks(0, 10, 4, { integer: true })).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it("labels a count that tops out at 1 as 0 and 1, not 0.5", () => {
    expect(niceTicks(0, 1, 3, { integer: true })).toEqual([0, 1]);
  });

  it("keeps larger nice steps", () => {
    expect(niceTicks(0, 100, 4, { integer: true })).toEqual([
      0, 25, 50, 75, 100,
    ]);
  });
});

describe("axisLabelIndices", () => {
  const dates = [
    "13 Oct",
    "13 Oct",
    "13 Oct",
    "13 Oct",
    "14 Oct",
    "14 Oct",
    "14 Oct",
    "14 Oct",
    "14 Oct",
    "14 Oct",
  ];

  it("labels each run of equal labels once, where it starts", () => {
    expect(axisLabelIndices(dates, 80)).toEqual([0, 4]);
  });

  it("never draws the same label twice at the end of the axis", () => {
    const labels = [...dates.slice(0, 9), "15 Oct"];
    expect(axisLabelIndices(labels, 80)).toEqual([0, 4, 9]);
  });

  it("drops a label that would crowd the last one", () => {
    // 9 to 10 is 30px apart, too close: 9 gives way to the last label.
    const labels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
    expect(axisLabelIndices(labels, 30, 64)).toEqual([0, 3, 6, 9]);
    expect(axisLabelIndices(labels.slice(0, 9), 30, 64)).toEqual([0, 3, 8]);
  });

  it("keeps only the first label when there is no room for the last", () => {
    expect(axisLabelIndices(["a", "b"], 20)).toEqual([0]);
  });

  it("handles no labels and a single label", () => {
    expect(axisLabelIndices([], 50)).toEqual([]);
    expect(axisLabelIndices(["17 Oct"], 0)).toEqual([0]);
  });
});

describe("formatCompact", () => {
  it("compacts from a thousand up", () => {
    expect(formatCompact(950)).toBe("950");
    expect(formatCompact(1200)).toBe("1.2K");
    expect(formatCompact(3_400_000)).toBe("3.4M");
  });
});
