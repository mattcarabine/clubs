import { describe, expect, it } from "vitest";

import {
  type AppearanceStats,
  groupBy,
  type RecordInput,
  summariseAppearances,
  summariseMatchSides,
  summariseRecord,
} from "./summaries";

describe("summariseRecord", () => {
  const match = (
    outcome: RecordInput["outcome"],
    goalsFor: number,
    goalsAgainst: number,
    dnf = false,
  ): RecordInput => ({ outcome, goalsFor, goalsAgainst, dnf });

  it("totals W/D/L, goals, points and DNFs", () => {
    expect(
      summariseRecord([
        match("W", 3, 1),
        match("W", 3, 0, true),
        match("D", 2, 2),
        match("L", 0, 1),
      ]),
    ).toEqual({
      played: 4,
      wins: 2,
      draws: 1,
      losses: 1,
      goalsFor: 8,
      goalsAgainst: 4,
      goalDifference: 4,
      points: 7,
      winPercentage: 50,
      dnf: 1,
    });
  });

  it("is all zeros, with no win %, for no Matches", () => {
    expect(summariseRecord([])).toEqual({
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      winPercentage: null,
      dnf: 0,
    });
  });
});

describe("summariseAppearances", () => {
  const appearance = (
    overrides: Partial<AppearanceStats> = {},
  ): AppearanceStats => ({
    positionGroup: "Midfielder",
    goals: 0,
    assists: 0,
    shots: 0,
    passesMade: 0,
    passAttempts: 0,
    tacklesMade: 0,
    tackleAttempts: 0,
    rating: null,
    manOfTheMatch: false,
    redCards: 0,
    saves: 0,
    goalsConceded: 0,
    cleanSheet: false,
    secondsPlayed: 90 * 60,
    ...overrides,
  });

  it("totals stats and derives per-90 and percentages", () => {
    const totals = summariseAppearances([
      appearance({
        goals: 2,
        assists: 1,
        shots: 4,
        passesMade: 9,
        passAttempts: 10,
        tacklesMade: 1,
        tackleAttempts: 2,
        rating: 8,
        manOfTheMatch: true,
      }),
      appearance({
        goals: 1,
        shots: 2,
        passesMade: 6,
        passAttempts: 10,
        tacklesMade: 2,
        tackleAttempts: 2,
        rating: 6,
      }),
    ]);
    expect(totals).toMatchObject({
      appearances: 2,
      minutes: 180,
      goals: 3,
      assists: 1,
      goalContributions: 4,
      shots: 6,
      manOfTheMatch: 1,
      passPercentage: 75,
      tacklePercentage: 75,
      averageRating: 7,
      form: 7,
      goalsPer90: 1.5,
      assistsPer90: 0.5,
      goalContributionsPer90: 2,
      shotsPer90: 3,
    });
  });

  it("ranks a 3-goals-in-2 scorer above a 2-goals-in-5 scorer per 90", () => {
    const a = summariseAppearances([
      appearance({ goals: 2 }),
      appearance({ goals: 1 }),
    ]);
    const b = summariseAppearances([
      appearance({ goals: 2 }),
      ...Array.from({ length: 4 }, () => appearance()),
    ]);
    expect(a.goalsPer90).toBeGreaterThan(b.goalsPer90 ?? 0);
  });

  it("uses only the last 5 ratings for form", () => {
    const ratings = [4, 6, 6, 6, 6, 6];
    const totals = summariseAppearances(
      ratings.map((rating) => appearance({ rating })),
    );
    expect(totals.form).toBe(6);
    expect(totals.averageRating).toBeCloseTo(34 / 6);
  });

  it("is null, not NaN, for zero minutes, attempts and ratings", () => {
    const totals = summariseAppearances([appearance({ secondsPlayed: 0 })]);
    expect(totals).toMatchObject({
      minutes: 0,
      goalsPer90: null,
      passPercentage: null,
      tacklePercentage: null,
      averageRating: null,
      form: null,
    });
  });

  it("is empty for no Appearances", () => {
    const totals = summariseAppearances([]);
    expect(totals.appearances).toBe(0);
    expect(totals.goalsPer90).toBeNull();
    expect(totals.positionGroup).toBeNull();
  });

  it("counts clean sheets for Goalkeepers and Defenders only", () => {
    const totals = summariseAppearances([
      appearance({ positionGroup: "Goalkeeper", cleanSheet: true }),
      appearance({ positionGroup: "Defender", cleanSheet: true }),
      appearance({ positionGroup: "Forward", cleanSheet: true }),
    ]);
    expect(totals.cleanSheets).toBe(2);
  });

  it("reports the Position Group played most", () => {
    const totals = summariseAppearances([
      appearance({ positionGroup: "Forward" }),
      appearance({ positionGroup: "Defender" }),
      appearance({ positionGroup: "Defender" }),
      appearance({ positionGroup: null }),
    ]);
    expect(totals.positionGroup).toBe("Defender");
  });
});

describe("summariseMatchSides", () => {
  const appearance = (
    isOurClub: boolean,
    overrides: Partial<AppearanceStats> = {},
  ) => ({
    isOurClub,
    positionGroup: null,
    goals: 0,
    assists: 0,
    shots: 0,
    passesMade: 0,
    passAttempts: 0,
    tacklesMade: 0,
    tackleAttempts: 0,
    rating: null,
    manOfTheMatch: false,
    redCards: 0,
    saves: 0,
    goalsConceded: 0,
    cleanSheet: false,
    secondsPlayed: 90 * 60,
    ...overrides,
  });

  it("totals each club's Appearances separately", () => {
    const sides = summariseMatchSides([
      appearance(true, { shots: 3, passesMade: 8, passAttempts: 10 }),
      appearance(false, { shots: 1, tacklesMade: 4 }),
      appearance(true, { shots: 2, passesMade: 1, passAttempts: 2 }),
    ]);
    expect(sides.ours).toMatchObject({
      appearances: 2,
      shots: 5,
      passPercentage: 75,
    });
    expect(sides.theirs).toMatchObject({
      appearances: 1,
      shots: 1,
      tacklesMade: 4,
      passPercentage: null,
    });
  });

  it("leaves out a player who dropped out, so a 3.0 never drags the average", () => {
    const sides = summariseMatchSides([
      appearance(true, { rating: 8 }),
      appearance(true, { rating: 3, secondsPlayed: 0 }),
      appearance(false, { rating: 3, secondsPlayed: 0 }),
    ]);
    expect(sides.ours).toMatchObject({ appearances: 1, averageRating: 8 });
    expect(sides.theirs.appearances).toBe(0);
  });

  it("gives a side with no Appearances zero of them", () => {
    const sides = summariseMatchSides([appearance(true)]);
    expect(sides.theirs.appearances).toBe(0);
  });
});

describe("groupBy", () => {
  it("groups rows by key in input order", () => {
    const groups = groupBy([1, 2, 3, 4, 5], (n) => n % 2);
    expect([...groups.entries()]).toEqual([
      [1, [1, 3, 5]],
      [0, [2, 4]],
    ]);
  });
});
