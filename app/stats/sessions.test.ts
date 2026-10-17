import { describe, expect, it } from "vitest";

import { SESSION_GAP_MINUTES, sessionPlaces } from "./sessions";

const at = (time: string) => new Date(`2026-10-17T${time}:00Z`);

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
      a: 1,
      b: 2,
      c: 3,
      d: 1,
      e: 2,
    });
  });

  it("sorts the kick-offs first", () => {
    const places = sessionPlaces([
      { matchId: "late", playedAt: at("20:00") },
      { matchId: "early", playedAt: at("19:30") },
    ]);
    expect(places.get("early")).toBe(1);
    expect(places.get("late")).toBe(2);
  });

  it("uses a 45-minute gap", () => {
    expect(SESSION_GAP_MINUTES).toBe(45);
  });
});
