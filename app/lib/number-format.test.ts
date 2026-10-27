import { describe, expect, it } from "vitest";

import {
  formatCount,
  formatDecimal,
  formatOptional,
  formatPercentage,
  formatPointsGap,
  formatSigned,
  formatThousands,
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

  it("takes other precisions, e.g. 2 for a per-90", () => {
    expect(formatDecimal(0.675, 2)).toBe("0.68");
    expect(formatDecimal(1, 2)).toBe("1.00");
  });
});

describe("formatOptional", () => {
  it("shows a count as is, and a dash when EA sent none", () => {
    expect(formatOptional(112)).toBe("112");
    expect(formatOptional(0)).toBe("0");
    expect(formatOptional(null)).toBe(NO_VALUE);
  });
});

describe("formatThousands", () => {
  it("separates thousands, and shows a dash when EA sent none", () => {
    expect(formatThousands(1267)).toBe("1,267");
    expect(formatThousands(0)).toBe("0");
    expect(formatThousands(null)).toBe(NO_VALUE);
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

describe("formatPointsGap", () => {
  it("rounds a gap to signed whole points", () => {
    expect(formatPointsGap(12.4)).toBe("+12 pts");
    expect(formatPointsGap(-40)).toBe("−40 pts");
    expect(formatPointsGap(null)).toBe(NO_VALUE);
  });
});
