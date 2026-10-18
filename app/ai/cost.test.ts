import { describe, expect, it } from "vitest";

import { MODEL_PRICES } from "./config";
import { estimateCost } from "./cost";

describe("estimateCost", () => {
  it("prices each kind of token at its own rate, per million", () => {
    const cost = estimateCost(
      {
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        cacheReadTokens: 1_000_000,
        cacheWriteTokens: 200_000,
      },
      MODEL_PRICES["claude-opus-5-5"],
    );
    // $4 input + $2 output + $0.20 cache reads + $1 cache writes.
    expect(cost).toBeCloseTo(7.2);
  });

  it("is null for a model with no price on file", () => {
    const usage = {
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    expect(estimateCost(usage, undefined)).toBeNull();
  });
});
