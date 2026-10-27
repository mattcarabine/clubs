import { describe, expect, it } from "vitest";

import {
  type LinkStrength,
  linkReading,
  linkStrength,
  MIN_LINK_MATCHES,
  matchRatings,
  type RatedAppearance,
  ratingLink,
  vsTeam,
} from "./rating-context";

function rated(
  matchId: string,
  playerId: string,
  rating: number | null,
  overrides: Partial<RatedAppearance> = {},
): RatedAppearance {
  return {
    matchId,
    playerId,
    rating,
    secondsPlayed: 5400,
    dnf: false,
    outcome: "W",
    ...overrides,
  };
}

/** One Match's line-up: a rating per player ID. */
function lineup(matchId: string, ratings: Record<string, number>) {
  return Object.entries(ratings).map(([id, r]) => rated(matchId, id, r));
}

describe("vsTeam", () => {
  it("averages rating minus the teammates' average in each Match", () => {
    const all = [
      ...lineup("m1", { a: 8, b: 6, c: 7 }), // a +1.5
      ...lineup("m2", { a: 6, b: 7 }), // a −1
    ];
    const own = all.filter((x) => x.playerId === "a");
    expect(vsTeam(own, matchRatings(all))).toEqual({ matches: 2, gap: 0.25 });
  });

  it("skips a Match with no rated teammate", () => {
    const all = [...lineup("m1", { a: 8 }), rated("m1", "b", null)];
    expect(vsTeam(all.slice(0, 1), matchRatings(all))).toEqual({
      matches: 0,
      gap: null,
    });
  });

  it("never counts a rage quit or a Match we quit", () => {
    const all = [
      ...lineup("m1", { a: 7, b: 7 }),
      // b dropped out: 0 minutes and EA's 3.0.
      rated("m1", "c", 3, { secondsPlayed: 0 }),
      // We quit m2: nothing of ours counts.
      rated("m2", "a", 9, { dnf: true, outcome: "L" }),
      rated("m2", "b", 4, { dnf: true, outcome: "L" }),
    ];
    const own = all.filter((x) => x.playerId === "a");
    expect(vsTeam(own, matchRatings(all))).toEqual({ matches: 1, gap: 0 });
  });
});

describe("linkStrength", () => {
  it("names each band", () => {
    expect([0.8, 0.5, 0.3, 0, -0.19, -0.2, -0.9].map(linkStrength)).toEqual([
      "together",
      "together",
      "loose",
      "independent",
      "independent",
      "opposite",
      "opposite",
    ]);
  });
});

describe("ratingLink", () => {
  /** Ten Matches where a and b swing with c, the rest of the team. */
  const tide = [6, 8, 6.5, 7.5, 5.5, 8.5, 7, 6, 8, 7].flatMap((c, i) =>
    lineup(`m${i}`, { a: c + 0.1 * (i % 3), b: c - 0.1 * (i % 2), c }),
  );

  it("reads a strong straight link that fades beyond the team", () => {
    const link = ratingLink("a", "b", matchRatings(tide));
    expect(link.straight.matches).toBe(10);
    expect(link.straight.strength).toBe("together");
    expect(link.straight.correlation).toBeGreaterThan(0.9);
    expect(link.beyondTeam.matches).toBe(10);
    expect(Math.abs(link.beyondTeam.correlation ?? 0)).toBeLessThan(
      link.straight.correlation ?? 0,
    );
  });

  it("reads two who only share the team's nights as unlinked beyond it", () => {
    const nights = [8, 8, 8, 8, 6, 6, 6, 6];
    const wobbleA = [1, -1, 1, -1, 1, -1, 1, -1];
    const wobbleB = [1, 1, -1, -1, 1, 1, -1, -1];
    const link = ratingLink(
      "a",
      "b",
      matchRatings(
        nights.flatMap((c, i) =>
          lineup(`m${i}`, { a: c + wobbleA[i], b: c + wobbleB[i], c }),
        ),
      ),
    );
    expect(link.straight.strength).toBe("together");
    expect(link.beyondTeam.correlation).toBeCloseTo(0);
    expect(link.beyondTeam.strength).toBe("independent");
  });

  it("counts how often one was below average when the other was", () => {
    // a averages 7: below it in m1, m2; b averages 7: below it in m1, m3, m4.
    const link = ratingLink(
      "a",
      "b",
      matchRatings([
        ...lineup("m1", { a: 6, b: 6 }),
        ...lineup("m2", { a: 6, b: 8 }),
        ...lineup("m3", { a: 8, b: 6.5 }),
        ...lineup("m4", { a: 8, b: 6.5 }),
        ...lineup("m5", { a: 7, b: 8 }),
      ]),
    );
    expect(link.aBelow).toEqual({ below: 2, alsoBelow: 1 });
    expect(link.bBelow).toEqual({ below: 3, alsoBelow: 1 });
  });

  it("gives no verdict under the minimum", () => {
    const few = tide.filter(
      (x) => Number(x.matchId.slice(1)) < MIN_LINK_MATCHES - 1,
    );
    const link = ratingLink("a", "b", matchRatings(few));
    expect(link.straight.matches).toBe(MIN_LINK_MATCHES - 1);
    expect(link.straight.correlation).not.toBeNull();
    expect(link.straight.strength).toBeNull();
  });

  it("only uses Shared Matches and needs a third player beyond the team", () => {
    const ratings = matchRatings([
      ...lineup("m1", { a: 7, b: 6 }),
      ...lineup("m2", { a: 8, b: 7 }),
      ...lineup("m3", { a: 9 }),
    ]);
    const link = ratingLink("a", "b", ratings);
    expect(link.straight.matches).toBe(2);
    expect(link.beyondTeam).toEqual({
      matches: 0,
      correlation: null,
      strength: null,
    });
  });
});

describe("linkReading", () => {
  const figure = (strength: LinkStrength | null) => ({
    matches: 10,
    correlation: 0,
    strength,
  });
  const read = (a: LinkStrength | null, b: LinkStrength | null) =>
    linkReading({ straight: figure(a), beyondTeam: figure(b) });

  it("says whether it is them or the team", () => {
    expect(read("together", "independent")).toMatch(/^Mostly the team/);
    expect(read("together", "opposite")).toMatch(/^Mostly the team/);
    expect(read("loose", "loose")).toMatch(/^Not just the team/);
  });

  it("says when their nights don't line up, or pull apart", () => {
    expect(read("independent", null)).toMatch(/don't line up/);
    expect(read("opposite", "together")).toMatch(/other's bad one/);
  });

  it("says nothing without a verdict", () => {
    expect(read(null, "together")).toBeNull();
    expect(read("together", null)).toBeNull();
  });
});
