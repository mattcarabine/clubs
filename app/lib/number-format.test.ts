import { describe, expect, it } from "vitest";

import {
  formatCount,
  formatDecimal,
  formatPercentage,
  formatSigned,
  NO_VALUE,
} from "./number-format";

describe("formatDecimal", () => {
  it("rounds to one decimal place", () => {
    expect(formatDecimal(7.36)).toBe("7.4");
    expect(formatDecimal(8)).toBe("8.0");
  });

  it("shows a dash when there is no value", () => {
    expect(formatDecimal(null)).toBe(NO_VALUE);
  });
});

describe("formatCount", () => {
  it("uses the singular for exactly one", () => {
    expect(formatCount(1, "Match", "Matches")).toBe("1 Match");
  });

  it("uses the plural otherwise", () => {
    expect(formatCount(0, "Match", "Matches")).toBe("0 Matches");
    expect(formatCount(6, "Match", "Matches")).toBe("6 Matches");
  });
});

describe("formatSigned", () => {
  it("prefixes positive numbers with a plus", () => {
    expect(formatSigned(5)).toBe("+5");
  });

  it("uses a true minus sign for negative numbers", () => {
    expect(formatSigned(-3)).toBe("−3");
  });

  it("leaves zero unsigned", () => {
    expect(formatSigned(0)).toBe("0");
  });
});

describe("formatPercentage", () => {
  it("rounds to a whole percentage", () => {
    expect(formatPercentage(66.666)).toBe("67%");
    expect(formatPercentage(0)).toBe("0%");
    expect(formatPercentage(100)).toBe("100%");
  });

  it("shows a dash when there is no value", () => {
    expect(formatPercentage(null)).toBe(NO_VALUE);
  });
});
