import { describe, expect, it } from "vitest";
import { formatCompact, linearScale, niceTicks } from "./scale";

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

describe("formatCompact", () => {
  it("compacts from a thousand up", () => {
    expect(formatCompact(950)).toBe("950");
    expect(formatCompact(1200)).toBe("1.2K");
    expect(formatCompact(3_400_000)).toBe("3.4M");
  });
});
