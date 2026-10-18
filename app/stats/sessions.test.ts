import { describe, expect, it } from "vitest";

import {
  groupSessions,
  isTonight,
  type PerformerTotals,
  pageSessions,
  SESSION_GAP_MINUTES,
  sessionPlaces,
  sessionTopPerformer,
} from "./sessions";

const at = (time: string) => new Date(`2026-10-17T${time}:00Z`);
const HOUR = 3_600_000;

describe("sessionPlaces", () => {
  it("keeps Matches up to 45 minutes apart in one Session and starts a new one after", () => {
    const places = sessionPlaces([
      { matchId: "a", playedAt: at("19:00") },
      { matchId: "b", playedAt: at("19:30") }, // 30 minutes: same Session
      { matchId: "c", playedAt: at("20:15") }, // exactly 45: same Session
      { matchId: "d", playedAt: at("21:15") }, // 60 minutes: a new Session
      { matchId: "e", playedAt: at("21:45") },
    ]);
    expect(Object.fromEntries(places)).toEqual({
      a: { session: 0, place: 1 },
      b: { session: 0, place: 2 },
      c: { session: 0, place: 3 },
      d: { session: 1, place: 1 },
      e: { session: 1, place: 2 },
    });
  });

  it("sorts the kick-offs first", () => {
    const places = sessionPlaces([
      { matchId: "late", playedAt: at("20:00") },
      { matchId: "early", playedAt: at("19:30") },
    ]);
    expect(places.get("early")).toEqual({ session: 0, place: 1 });
    expect(places.get("late")).toEqual({ session: 0, place: 2 });
  });

  it("uses a 45-minute gap", () => {
    expect(SESSION_GAP_MINUTES).toBe(45);
  });
});

describe("groupSessions", () => {
  it("groups kick-offs into Sessions, oldest first, each named by its first Match", () => {
    const sessions = groupSessions([
      { matchId: "d", playedAt: at("21:15") },
      { matchId: "a", playedAt: at("19:00") },
      { matchId: "b", playedAt: at("19:30") },
      { matchId: "c", playedAt: at("20:15") },
    ]);
    expect(sessions).toEqual([
      {
        id: "a",
        matchIds: ["a", "b", "c"],
        start: at("19:00"),
        end: at("20:15"),
      },
      { id: "d", matchIds: ["d"], start: at("21:15"), end: at("21:15") },
    ]);
  });

  it("has no Sessions without Matches", () => {
    expect(groupSessions([])).toEqual([]);
  });
});

describe("isTonight", () => {
  const session = { end: at("21:00") };
  const hoursLater = (hours: number) =>
    new Date(at("21:00").getTime() + hours * HOUR);

  it("is tonight's Session up to 6 hours after its last kick-off", () => {
    expect(isTonight(session, hoursLater(0.5))).toBe(true);
    expect(isTonight(session, hoursLater(6))).toBe(true);
  });

  it("is the last Session after that", () => {
    expect(isTonight(session, hoursLater(6.001))).toBe(false);
  });
});

describe("pageSessions", () => {
  it("fills each page with whole Sessions until it holds the page size", () => {
    // 3 + 2 reaches 5; 4 + 1 does too; 2 is the last, short page.
    expect(pageSessions([3, 2, 4, 1, 2], 5)).toEqual([
      [0, 2],
      [2, 4],
      [4, 5],
    ]);
  });

  it("never splits a Session bigger than a page", () => {
    expect(pageSessions([12, 1], 5)).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it("has no pages without Sessions", () => {
    expect(pageSessions([], 20)).toEqual([]);
  });
});

describe("sessionTopPerformer", () => {
  const row = (
    name: string,
    overrides: Partial<PerformerTotals> = {},
  ): PerformerTotals => ({
    name,
    appearances: 3,
    goals: 0,
    assists: 0,
    averageRating: 7,
    manOfTheMatch: 0,
    ...overrides,
  });
  const top = (rows: PerformerTotals[]) => sessionTopPerformer(rows)?.name;

  it("ranks Man of the Match awards first", () => {
    expect(
      top([row("Scorer", { goals: 4 }), row("Motm", { manOfTheMatch: 1 })]),
    ).toBe("Motm");
  });

  it("then goals plus assists, then goals", () => {
    expect(
      top([row("Creator", { assists: 3 }), row("Scorer", { goals: 2 })]),
    ).toBe("Creator");
    expect(
      top([row("Creator", { assists: 2 }), row("Scorer", { goals: 2 })]),
    ).toBe("Scorer");
  });

  it("then average rating, unrated last", () => {
    expect(
      top([
        row("Unrated", { averageRating: null }),
        row("Steady", { averageRating: 7.1 }),
        row("Star", { averageRating: 8.4 }),
      ]),
    ).toBe("Star");
  });

  it("is null when nobody played", () => {
    expect(sessionTopPerformer([])).toBeNull();
    expect(
      sessionTopPerformer([row("Benched", { appearances: 0 })]),
    ).toBeNull();
  });
});
