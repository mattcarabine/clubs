import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  MATCH_EVENT_CODES,
  MATCH_EVENT_STATS,
  matchEventCount,
  parseMatchEvents,
} from "./events.ts";
import type { EaMatch } from "./types.ts";

const recorded = JSON.parse(
  readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../fixtures/ea/clubs-matches-leagueMatch.json",
    ),
    "utf8",
  ),
) as EaMatch[];

describe("parseMatchEvents", () => {
  it("sums the pairs across the four fields", () => {
    expect(
      parseMatchEvents({
        match_event_aggregate_0: "217:5,24:12",
        match_event_aggregate_1: "97:7,217:1",
        match_event_aggregate_2: "",
        match_event_aggregate_3: "",
      }),
    ).toEqual({ "217": 6, "24": 12, "97": 7 });
  });

  it("is null when EA sent no events", () => {
    expect(parseMatchEvents({})).toBeNull();
    expect(
      parseMatchEvents({
        match_event_aggregate_0: "",
        match_event_aggregate_1: "",
      }),
    ).toBeNull();
  });

  it("skips malformed pairs and keeps the rest", () => {
    expect(
      parseMatchEvents({
        match_event_aggregate_0: "abc:1,12:,12:x,:4,13:2,,-1:3,14:1.5, 6:3 ",
      }),
    ).toEqual({ "13": 2, "6": 3 });
  });

  it("keeps code 0 (tackles won) and drops leading zeros", () => {
    expect(parseMatchEvents({ match_event_aggregate_0: "0:2,007:1" })).toEqual({
      "0": 2,
      "7": 1,
    });
  });
});

describe("matchEventCount", () => {
  it("adds the codes that make up a stat", () => {
    const events = { "95": 1, "213": 1, "217": 4 };
    expect(matchEventCount(events, "yellowCards")).toBe(2);
    expect(matchEventCount(events, "shotsOnTarget")).toBe(4);
    expect(matchEventCount(events, "interceptions")).toBe(0);
    expect(matchEventCount(null, "yellowCards")).toBe(0);
  });

  it("uses each code for one stat only", () => {
    const codes = MATCH_EVENT_STATS.flatMap((stat) => MATCH_EVENT_CODES[stat]);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("the recorded Matches", () => {
  const rows = recorded.flatMap((match) =>
    Object.values(match.players).flatMap((players) => Object.values(players)),
  );
  // A player who quit has their named stats zeroed but keeps their events.
  const stayed = rows.filter(
    (row) => row.userResult === "0" && row.secondsPlayed !== "0",
  );

  it("goals and assists in the events equal EA's named stats", () => {
    expect(stayed.length).toBeGreaterThan(60);
    for (const row of stayed) {
      const events = parseMatchEvents(row);
      expect(matchEventCount(events, "goals")).toBe(Number(row.goals));
      expect(matchEventCount(events, "assists")).toBe(Number(row.assists));
    }
  });

  it("shots on and off target add up to shots, give or take one row", () => {
    const equal = stayed.filter((row) => {
      const events = parseMatchEvents(row);
      return (
        matchEventCount(events, "shotsOnTarget") +
          matchEventCount(events, "shotsOffTarget") ===
        Number(row.shots)
      );
    });
    expect(equal.length).toBeGreaterThanOrEqual(stayed.length - 1);
  });
});
