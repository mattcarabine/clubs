import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  coerceStats,
  matchResult,
  parseMatches,
  parseSnapshotEntries,
  toDecimal,
  toInt,
  toPositionGroup,
} from "./parse.ts";
import type { EaMatch } from "./types.ts";

const OUR_CLUB = "332191";
const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      path.resolve(import.meta.dirname, "../../fixtures/ea", name),
      "utf8",
    ),
  );
const recorded = fixture("clubs-matches-leagueMatch.json") as EaMatch[];

describe("matchResult", () => {
  it.each([
    ["1", "2", "win", false],
    ["2", "1", "loss", false],
    ["4", "4", "draw", false],
    ["16385", "10", "win", true],
    ["10", "16385", "loss", true],
  ])("maps result code %s to %s (DNF %s)", (ours, theirs, result, dnf) => {
    expect(
      matchResult({ result: ours, goals: "0" }, { result: theirs, goals: "0" }),
    ).toEqual({ result, dnf });
  });

  it.each([
    ["3", "1", "win"],
    ["0", "2", "loss"],
    ["2", "2", "draw"],
  ])(
    "derives a Friendly's result from the score %s-%s",
    (ours, theirs, result) => {
      expect(
        matchResult(
          { result: "0", wins: "0", losses: "0", ties: "0", goals: ours },
          { result: "0", goals: theirs },
        ),
      ).toEqual({ result, dnf: false });
    },
  );

  it("falls back to the score for an unknown or missing code", () => {
    expect(matchResult({ goals: "1" }, { goals: "0" })).toEqual({
      result: "win",
      dnf: false,
    });
    expect(matchResult({ result: "999", goals: "0" }, { goals: "1" })).toEqual({
      result: "loss",
      dnf: false,
    });
  });
});

describe("string coercion", () => {
  it("parses whole-number stats and treats missing or junk as 0", () => {
    expect(toInt("5613")).toBe(5613);
    expect(toInt("")).toBe(0);
    expect(toInt(undefined)).toBe(0);
    expect(toInt("n/a")).toBe(0);
  });

  it("parses ratings, keeping missing ones null rather than 0", () => {
    expect(toDecimal("7.70")).toBe(7.7);
    expect(toDecimal("")).toBeNull();
    expect(toDecimal(undefined)).toBeNull();
    expect(toDecimal("abc")).toBeNull();
  });

  it("maps pos to a Position Group, unknown to null", () => {
    expect(toPositionGroup("goalkeeper")).toBe("goalkeeper");
    expect(toPositionGroup("Forward")).toBe("forward");
    expect(toPositionGroup("striker")).toBeNull();
    expect(toPositionGroup(undefined)).toBeNull();
  });

  it("coerces numeric strings in season totals and leaves the rest", () => {
    expect(
      coerceStats({ goals: "98", ratingAve: "7.6", name: "Kabeeble", x: null }),
    ).toEqual({ goals: 98, ratingAve: 7.6, name: "Kabeeble", x: null });
  });
});

describe("parseMatches", () => {
  it("parses the recorded league Matches from Our Club's point of view", () => {
    const matches = parseMatches(recorded, "leagueMatch", OUR_CLUB);
    expect(matches).toHaveLength(10);
    expect(matches[0]).toMatchObject({
      matchId: "102110579600275",
      matchType: "league",
      playedAt: new Date(1792014896 * 1000),
      opponentClubId: "356611",
      goalsFor: 4,
      goalsAgainst: 1,
      result: "win",
      dnf: false,
      clubs: [
        { clubId: OUR_CLUB, name: "A Bloo Bloo" },
        { clubId: "356611", name: "Bunch of bums" },
      ],
    });
    // Appearances for both clubs: 4 of ours, 3 of theirs.
    expect(matches[0].appearances).toHaveLength(7);
    expect(matches[0].appearances[0]).toEqual({
      playerId: "256171605",
      clubId: OUR_CLUB,
      personaName: "Kabeeble",
      positionGroup: "midfielder",
      goals: 0,
      assists: 0,
      shots: 2,
      passesMade: 23,
      passAttempts: 25,
      tacklesMade: 0,
      tackleAttempts: 2,
      rating: 7.7,
      manOfTheMatch: false,
      redCards: 0,
      saves: 0,
      goalsConceded: 1,
      cleanSheet: false,
      secondsPlayed: 5613,
    });
  });

  it("reads DNF wins and losses from the recorded codes", () => {
    const byId = new Map(
      parseMatches(recorded, "leagueMatch", OUR_CLUB).map((m) => [
        m.matchId,
        m,
      ]),
    );
    expect(byId.get("102088235890467")).toMatchObject({
      result: "win",
      dnf: true,
    });
    expect(byId.get("102092415130284")).toMatchObject({
      result: "loss",
      dnf: true,
    });
  });

  it("does not parse match_event_aggregate_* counters", () => {
    const [match] = parseMatches(recorded, "leagueMatch", OUR_CLUB);
    expect(JSON.stringify(match)).not.toContain("match_event_aggregate");
  });

  it("tolerates missing fields", () => {
    const [match] = parseMatches(
      [
        {
          matchId: "1",
          timestamp: 1792014896,
          clubs: { [OUR_CLUB]: {}, "9": {} },
          players: { [OUR_CLUB]: { "42": {} } },
        },
      ],
      "friendlyMatch",
      OUR_CLUB,
    );
    expect(match).toMatchObject({
      matchType: "friendly",
      goalsFor: 0,
      goalsAgainst: 0,
      result: "draw",
      // JS orders integer-like keys numerically, so "9" comes first.
      clubs: [
        { clubId: "9", name: null },
        { clubId: OUR_CLUB, name: null },
      ],
    });
    expect(match.appearances[0]).toMatchObject({
      playerId: "42",
      personaName: null,
      positionGroup: null,
      rating: null,
      goals: 0,
    });
  });

  it("skips entries it cannot attribute and non-array responses", () => {
    const valid = recorded[0];
    expect(
      parseMatches(
        [
          null,
          { ...valid, matchId: "" },
          { ...valid, clubs: { "1": {}, "2": {} } },
          valid,
        ],
        "leagueMatch",
        OUR_CLUB,
      ),
    ).toHaveLength(1);
    expect(parseMatches({ error: "x" }, "leagueMatch", OUR_CLUB)).toEqual([]);
  });
});

describe("parseSnapshotEntries", () => {
  it("keeps one entry per member, keyed by persona name", () => {
    const entries = parseSnapshotEntries(
      "members/stats",
      fixture("members-stats.json"),
      OUR_CLUB,
    );
    expect(entries.map((e) => e.subjectKey)).toEqual([
      "Kabeeble",
      "Loltown95",
      "tinbs_irl",
      "JONTEeu",
      "IGrav97",
    ]);
    expect(entries[0]).toMatchObject({
      subject: "member",
      stats: { goals: 98, gamesPlayed: 112 },
    });
  });

  it("keeps only Our Club from club endpoints, without kit details", () => {
    const [entry, ...rest] = parseSnapshotEntries(
      "currentSeasonLeaderboard/search",
      [
        { clubId: "1", wins: "1" },
        ...(fixture("currentSeasonLeaderboard-search.json") as unknown[]),
      ],
      OUR_CLUB,
    );
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      subject: "club",
      subjectKey: OUR_CLUB,
      stats: { wins: 55, points: 44, clubName: "A Bloo Bloo" },
    });
    expect(entry.stats).not.toHaveProperty("clubInfo");
  });

  it("returns nothing for unexpected shapes", () => {
    expect(parseSnapshotEntries("members/stats", [], OUR_CLUB)).toEqual([]);
    expect(parseSnapshotEntries("clubs/overallStats", {}, OUR_CLUB)).toEqual(
      [],
    );
  });
});
