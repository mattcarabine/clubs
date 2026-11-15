import { describe, expect, it } from "vitest";

import { opponentStrength, ratingGap, STRENGTH_GAP } from "./skill-rating";

describe("ratingGap", () => {
  it("is our Skill Rating minus the Opponent's when the Match changed neither", () => {
    expect(ratingGap({ ours: 1600, opponent: 1450, oursBefore: 1600 })).toBe(
      150,
    );
    expect(ratingGap({ ours: 1400, opponent: 1450, oursBefore: 1400 })).toBe(
      -50,
    );
  });

  it("takes the result back out of both ratings", () => {
    // A Win took us from 1580 to 1600 and them, we take it, from 1470 to 1450.
    expect(ratingGap({ ours: 1600, opponent: 1450, oursBefore: 1580 })).toBe(
      110,
    );
    // A defeat cost us 15: stored 1385 v 1465 was 1400 v 1450 at kick-off.
    expect(ratingGap({ ours: 1385, opponent: 1465, oursBefore: 1400 })).toBe(
      -50,
    );
  });

  it("is null without both ratings and ours before kick-off", () => {
    expect(
      ratingGap({ ours: null, opponent: 1450, oursBefore: null }),
    ).toBeNull();
    expect(
      ratingGap({ ours: 1600, opponent: null, oursBefore: 1600 }),
    ).toBeNull();
    expect(
      ratingGap({ ours: 1600, opponent: 1450, oursBefore: null }),
    ).toBeNull();
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
