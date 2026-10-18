import { describe, expect, it } from "vitest";

import { opponentStrength, ratingGap, STRENGTH_GAP } from "./skill-rating";

describe("ratingGap", () => {
  it("is our Skill Rating minus the Opponent's", () => {
    expect(ratingGap({ ours: 1600, opponent: 1450 })).toBe(150);
    expect(ratingGap({ ours: 1400, opponent: 1450 })).toBe(-50);
  });

  it("is null unless both clubs were rated", () => {
    expect(ratingGap({ ours: null, opponent: 1450 })).toBeNull();
    expect(ratingGap({ ours: 1600, opponent: null })).toBeNull();
  });
});

describe("opponentStrength", () => {
  it(`counts an Opponent ${STRENGTH_GAP} or more above us as Stronger`, () => {
    expect(opponentStrength(-STRENGTH_GAP)).toBe("stronger");
    expect(opponentStrength(-400)).toBe("stronger");
  });

  it(`counts an Opponent ${STRENGTH_GAP} or more below us as Weaker`, () => {
    expect(opponentStrength(STRENGTH_GAP)).toBe("weaker");
    expect(opponentStrength(250)).toBe("weaker");
  });

  it("counts anything within the gap as Similar", () => {
    expect(opponentStrength(0)).toBe("similar");
    expect(opponentStrength(STRENGTH_GAP - 1)).toBe("similar");
    expect(opponentStrength(1 - STRENGTH_GAP)).toBe("similar");
  });

  it("is null for an unrated Match", () => {
    expect(opponentStrength(null)).toBeNull();
  });
});
