import { describe, expect, it } from "vitest";

import { formatPercent, formatSigned } from "./number-format";

describe("formatSigned", () => {
  it("signs positive and negative values with typographic marks", () => {
    expect(formatSigned(3)).toBe("+3");
    expect(formatSigned(-2)).toBe("−2");
    expect(formatSigned(0)).toBe("0");
  });
});

describe("formatPercent", () => {
  it("rounds to a whole percent", () => {
    expect(formatPercent(66.666)).toBe("67%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("shows a dash for no value", () => {
    expect(formatPercent(null)).toBe("–");
  });
});
