import { describe, expect, it } from "vitest";

import type { Outcome } from "~/lib/domain";

import {
  cumulativeGoalDifference,
  type LineupAppearance,
  lineupRecords,
  resultsTimeline,
  skillRatingHistory,
  splitByKickoffHour,
  splitByWeekday,
  type TrendMatch,
} from "./trends";

const match = (
  outcome: Outcome,
  goalsFor: number,
  goalsAgainst: number,
  playedAt = new Date("2025-10-21T19:00:00Z"),
): TrendMatch => ({ outcome, goalsFor, goalsAgainst, dnf: false, playedAt });

describe("resultsTimeline", () => {
  it("runs points and goal difference after each Match", () => {
    const timeline = resultsTimeline([
      match("W", 3, 1),
      match("L", 0, 2),
      match("D", 1, 1),
    ]);
    expect(timeline.outcomes).toEqual(["W", "L", "D"]);
    expect(timeline.points).toEqual([3, 3, 4]);
    expect(timeline.goalDifference).toEqual([2, 0, 0]);
    expect(timeline.rollingGoalsFor).toEqual([3, 1.5, 4 / 3]);
    expect(timeline.rollingGoalsAgainst).toEqual([1, 1.5, 4 / 3]);
  });

  it("is empty with no Matches", () => {
    expect(resultsTimeline([]).points).toEqual([]);
  });
});

describe("cumulativeGoalDifference", () => {
  it("goes negative", () => {
    expect(
      cumulativeGoalDifference([
        { goalsFor: 0, goalsAgainst: 3 },
        { goalsFor: 1, goalsAgainst: 0 },
      ]),
    ).toEqual([-3, -2]);
  });
});

describe("London day and kick-off splits", () => {
  // BST ended on Sun 26 Oct 2025: 20:00 London is 19:00 UTC before, 20:00 after.
  const bst20 = match("W", 2, 0, new Date("2025-10-21T19:00:00Z"));
  const bst2230 = match("L", 0, 1, new Date("2025-10-21T21:30:00Z"));
  const gmt20 = match("W", 1, 0, new Date("2025-10-28T20:00:00Z"));
  const gmt2230 = match("D", 1, 1, new Date("2025-10-28T22:30:00Z"));
  // 00:30 Wednesday in London is still Tuesday in UTC during BST.
  const afterMidnight = match("W", 1, 0, new Date("2025-10-21T23:30:00Z"));

  it("buckets by London weekday, Monday first", () => {
    expect(
      splitByWeekday([bst20, bst2230, gmt20, gmt2230, afterMidnight]),
    ).toEqual([
      { label: "Tue", played: 4, wins: 2, winPercentage: 50 },
      { label: "Wed", played: 1, wins: 1, winPercentage: 100 },
    ]);
  });

  it("buckets by London kick-off hour across a BST change", () => {
    expect(
      splitByKickoffHour([gmt2230, bst20, afterMidnight, bst2230, gmt20]),
    ).toEqual([
      { label: "00:00", played: 1, wins: 1, winPercentage: 100 },
      { label: "20:00", played: 2, wins: 2, winPercentage: 100 },
      { label: "22:00", played: 2, wins: 0, winPercentage: 0 },
    ]);
  });
});

describe("lineupRecords", () => {
  const lineup = (
    matchId: string,
    playerIds: string[],
    outcome: Outcome,
    goalsFor: number,
    goalsAgainst: number,
  ): LineupAppearance[] =>
    playerIds.map((playerId) => ({
      ...match(outcome, goalsFor, goalsAgainst),
      matchId,
      playerId,
      name: `Player ${playerId}`,
    }));

  const four = ["4", "1", "3", "2"];

  it("records each exact set of Squad Members with at least 3 Matches", () => {
    const records = lineupRecords([
      ...lineup("m1", four, "W", 3, 0),
      ...lineup("m2", [...four].reverse(), "D", 1, 1),
      ...lineup("m3", four, "L", 0, 2),
      ...lineup("m4", ["1", "2", "3"], "W", 5, 0),
      ...lineup("m5", ["1", "2", "3"], "W", 5, 0),
    ]);
    expect(records).toEqual([
      {
        key: "1+2+3+4",
        names: ["Player 1", "Player 2", "Player 3", "Player 4"],
        played: 3,
        wins: 1,
        draws: 1,
        losses: 1,
        goalDifference: 1,
        winPercentage: expect.closeTo(33.33, 2),
      },
    ]);
  });

  it("takes a lower minimum", () => {
    const records = lineupRecords(lineup("m1", ["1"], "W", 1, 0), 1);
    expect(records.map((r) => r.key)).toEqual(["1"]);
  });
});

describe("skillRatingHistory", () => {
  it("keeps each change of a numeric skill rating", () => {
    const at = (iso: string) => new Date(iso);
    expect(
      skillRatingHistory([
        { takenAt: at("2026-10-01T00:00:00Z"), stats: { skillRating: 1600 } },
        { takenAt: at("2026-10-02T00:00:00Z"), stats: {} },
        { takenAt: at("2026-10-02T12:00:00Z"), stats: { skillRating: 1600 } },
        { takenAt: at("2026-10-03T00:00:00Z"), stats: { skillRating: 1632 } },
      ]),
    ).toEqual([
      { takenAt: at("2026-10-01T00:00:00Z"), skillRating: 1600 },
      { takenAt: at("2026-10-03T00:00:00Z"), skillRating: 1632 },
    ]);
  });
});
