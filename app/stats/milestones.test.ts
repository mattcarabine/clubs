import { describe, expect, it } from "vitest";

import type { Outcome } from "~/lib/domain";

import {
  type DetectionAppearance,
  type DetectionInput,
  type DetectionMatch,
  detectMilestones,
  MILESTONE_KINDS,
  milestoneHeadline,
  ordinal,
  type TotalsPoint,
  thresholdsCrossed,
} from "./milestones";

const T0 = Date.UTC(2026, 9, 17, 19, 0);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const KAB = "1001";
const LOL = "1002";

/** A Match `i` Matches in, each 20 minutes after the last (so one Session). */
function match(
  i: number,
  outcome: Outcome = "W",
  goalsFor = 2,
  goalsAgainst = 1,
): DetectionMatch {
  return {
    matchId: `m${i}`,
    playedAt: new Date(T0 + i * 20 * MINUTE),
    goalsFor,
    goalsAgainst,
    outcome,
    dnf: false,
  };
}

function appearance(
  matchId: string,
  playerId: string,
  fields: Partial<DetectionAppearance> = {},
): DetectionAppearance {
  return {
    matchId,
    playerId,
    positionGroup: "forward",
    goals: 0,
    assists: 0,
    rating: 7,
    manOfTheMatch: false,
    secondsPlayed: 5400,
    ...fields,
  };
}

function career(
  takenAt: number,
  stats: Record<string, number>,
  playerId: string | null = KAB,
  subjectKey = "Kabeeble",
): TotalsPoint {
  return { takenAt: new Date(takenAt), subjectKey, playerId, stats };
}

function input(fields: Partial<DetectionInput>): DetectionInput {
  return {
    matches: [],
    appearances: [],
    careerSnapshots: [],
    clubSnapshots: [],
    ...fields,
  };
}

const keys = (input: DetectionInput) =>
  detectMilestones(input).map((m) => m.dedupeKey);

describe("thresholdsCrossed", () => {
  const ladder = { start: [1, 10, 25, 50, 100], step: 50 };

  it("finds the landmarks above the old total, up to the new one", () => {
    expect(thresholdsCrossed(ladder, 49, 50)).toEqual([50]);
    expect(thresholdsCrossed(ladder, 50, 51)).toEqual([]);
    expect(thresholdsCrossed(ladder, 0, 10)).toEqual([1, 10]);
  });

  it("carries on every step past the listed ones", () => {
    expect(thresholdsCrossed(ladder, 140, 260)).toEqual([150, 200, 250]);
  });
});

describe("ordinal", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [11, "11th"],
    [12, "12th"],
    [22, "22nd"],
    [50, "50th"],
    [101, "101st"],
  ])("%i is %s", (n, text) => expect(ordinal(n)).toBe(text));
});

describe("career landmarks", () => {
  const matches = [match(0), match(1)];
  const before = T0 - MINUTE;
  const after = T0 + DAY;

  it("pins a crossing to the Match where the stat took the total over", () => {
    const found = detectMilestones(
      input({
        matches,
        appearances: [
          appearance("m0", KAB, { goals: 1 }),
          appearance("m1", KAB, { goals: 1 }),
        ],
        careerSnapshots: [
          career(before, { goals: 48, gamesPlayed: 10 }),
          career(after, { goals: 50, gamesPlayed: 12 }),
        ],
      }),
    );
    expect(found).toMatchObject([
      {
        kind: "goals",
        playerId: KAB,
        value: 50,
        threshold: 50,
        matchId: "m1",
        dedupeKey: `player:${KAB}:goals:50`,
      },
    ]);
  });

  it("never invents a threshold passed before the first Snapshot", () => {
    expect(
      keys(
        input({
          matches,
          appearances: [appearance("m0", KAB, { goals: 1 })],
          careerSnapshots: [career(after, { goals: 52, gamesPlayed: 12 })],
        }),
      ),
    ).toEqual([]);
  });

  it("skips a crossing the recorded Matches don't add up to", () => {
    expect(
      keys(
        input({
          matches,
          // Only one recorded goal for a rise of two.
          appearances: [
            appearance("m0", KAB, { goals: 1 }),
            appearance("m1", KAB),
          ],
          careerSnapshots: [
            career(before, { goals: 48, gamesPlayed: 10 }),
            career(after, { goals: 50, gamesPlayed: 12 }),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("covers only as many of their latest Matches as EA's games rose by", () => {
    // m0 was already in the first Snapshot (a late payload); only m1 is new.
    const found = detectMilestones(
      input({
        matches,
        appearances: [
          appearance("m0", KAB, { goals: 2 }),
          appearance("m1", KAB, { goals: 1, manOfTheMatch: true }),
        ],
        careerSnapshots: [
          career(T0 + 30 * MINUTE, {
            goals: 99,
            gamesPlayed: 99,
            manOfTheMatch: 4,
          }),
          career(after, { goals: 100, gamesPlayed: 100, manOfTheMatch: 5 }),
        ],
      }),
    );
    expect(found.map((m) => [m.kind, m.value, m.matchId])).toEqual([
      ["appearances", 100, "m1"],
      ["goals", 100, "m1"],
      ["motm", 5, "m1"],
    ]);
  });

  it("needs the Squad Member's ID on the newer Snapshot", () => {
    expect(
      keys(
        input({
          matches,
          appearances: [appearance("m1", KAB, { goals: 1 })],
          careerSnapshots: [
            career(before, { goals: 49, gamesPlayed: 10 }, null),
            career(after, { goals: 50, gamesPlayed: 11 }, null),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("pairs Snapshots per Squad Member", () => {
    const found = detectMilestones(
      input({
        matches,
        appearances: [
          appearance("m1", KAB, { goals: 1 }),
          appearance("m1", LOL, { assists: 1 }),
        ],
        careerSnapshots: [
          career(before, { goals: 49, gamesPlayed: 10 }),
          career(before, { assists: 24, gamesPlayed: 10 }, LOL, "Loltown95"),
          career(after, { goals: 50, gamesPlayed: 11 }),
          career(after, { assists: 25, gamesPlayed: 11 }, LOL, "Loltown95"),
        ],
      }),
    );
    expect(found.map((m) => [m.playerId, m.kind, m.value])).toEqual([
      [KAB, "goals", 50],
      [LOL, "assists", 25],
    ]);
  });
});

describe("club landmarks", () => {
  it("pins the 100th Win to the Win that reached it", () => {
    const matches = [match(0, "L", 0, 1), match(1, "W")];
    const found = detectMilestones(
      input({
        matches,
        clubSnapshots: [
          {
            takenAt: new Date(T0 - MINUTE),
            subjectKey: "332191",
            playerId: null,
            stats: { wins: 99, gamesPlayed: 148 },
          },
          {
            takenAt: new Date(T0 + DAY),
            subjectKey: "332191",
            playerId: null,
            stats: { wins: 100, gamesPlayed: 150 },
          },
        ],
      }),
    );
    expect(found.map((m) => [m.kind, m.value, m.matchId])).toEqual([
      ["club-matches", 150, "m1"],
      ["club-wins", 100, "m1"],
    ]);
  });
});

describe("feats", () => {
  it("finds a hat-trick, or 4+ goal involvements when it is not one", () => {
    const found = detectMilestones(
      input({
        matches: [match(0)],
        appearances: [
          appearance("m0", KAB, { goals: 3, assists: 1 }),
          appearance("m0", LOL, { goals: 2, assists: 2 }),
        ],
      }),
    );
    expect(found.map((m) => [m.playerId, m.kind, m.value])).toEqual([
      [KAB, "hat-trick", 3],
      [LOL, "goal-involvements", 4],
    ]);
  });

  it("finds a 9.0 rating, or a personal best once there is a history to beat", () => {
    const matches = [0, 1, 2, 3, 4, 5, 6].map((i) => match(i * 10));
    const ratings = [8.1, 9.0, 7.0, 7.2, 6.8, 9.4, 9.1];
    const found = detectMilestones(
      input({
        matches,
        appearances: matches.map((m, i) =>
          appearance(m.matchId, KAB, { rating: ratings[i] }),
        ),
      }),
    );
    expect(found.map((m) => [m.kind, m.value, m.threshold])).toEqual([
      ["rating", 9.0, null],
      ["personal-best-rating", 9.4, 9.0],
      ["rating", 9.1, null],
    ]);
  });

  it("finds a first goal in a Position Group away from the usual one", () => {
    const matches = [0, 1, 2, 3, 4, 5, 6].map((i) => match(i * 10));
    const found = detectMilestones(
      input({
        matches,
        appearances: matches.map((m, i) =>
          appearance(m.matchId, KAB, {
            positionGroup: i < 5 ? "midfielder" : "forward",
            goals: i === 2 || i >= 5 ? 1 : 0,
          }),
        ),
      }),
    );
    expect(found.map((m) => [m.kind, m.matchId, m.positionGroup])).toEqual([
      ["first-goal-in-position", "m50", "forward"],
    ]);
  });

  it("skips 0-minute Appearances and our side of a DNF we quit (CLUBS-48)", () => {
    const quit = { ...match(10, "L", 0, 3), dnf: true };
    const won = { ...match(20, "W", 3, 0), dnf: true };
    const found = detectMilestones(
      input({
        matches: [match(0), quit, won],
        appearances: [
          appearance("m0", KAB, { rating: 3, secondsPlayed: 0, goals: 3 }),
          appearance("m10", KAB, { goals: 3, rating: 9.5 }),
          appearance("m20", KAB, { goals: 3 }),
        ],
      }),
    );
    // Only the DNF the Opponent quit counts.
    expect(found.map((m) => [m.kind, m.matchId])).toEqual([
      ["hat-trick", "m20"],
    ]);
  });

  it("never reports a Goalkeeper's Milestones", () => {
    expect(
      keys(
        input({
          matches: [match(0)],
          appearances: [
            appearance("m0", KAB, { positionGroup: "goalkeeper", goals: 3 }),
          ],
        }),
      ),
    ).toEqual([]);
  });
});

describe("club records", () => {
  /** Six Matches a day apart (six Sessions), then `rest`. */
  function history(rest: [Outcome, number, number][]): DetectionMatch[] {
    const opening: [Outcome, number, number][] = [
      ["W", 3, 1],
      ["W", 2, 0],
      ["L", 0, 1],
      ["D", 1, 1],
      ["W", 4, 2],
      ["L", 1, 2],
    ];
    return [...opening, ...rest].map(([outcome, gf, ga], i) => ({
      ...match(0, outcome, gf, ga),
      matchId: `m${i}`,
      playedAt: new Date(T0 + i * DAY),
    }));
  }

  it("needs a few earlier Matches before anything is a record", () => {
    expect(keys(input({ matches: history([]).slice(0, 5) }))).toEqual([]);
  });

  it("finds a new biggest Win margin and most goals", () => {
    const found = detectMilestones(input({ matches: history([["W", 6, 1]]) }));
    expect(found.map((m) => [m.kind, m.value, m.threshold])).toEqual([
      ["record-goals", 6, 4],
      ["record-win-margin", 5, 2],
    ]);
  });

  it("records a run once, on the Match that beats the old best", () => {
    const found = detectMilestones(
      input({
        matches: history([
          ["W", 1, 0],
          ["W", 1, 0],
          ["W", 1, 0],
          ["W", 1, 0],
        ]),
      }),
    );
    expect(
      found
        .filter(
          (m) =>
            m.kind === "record-win-run" || m.kind === "record-unbeaten-run",
        )
        .map((m) => [m.kind, m.value, m.threshold, m.matchId]),
    ).toEqual([
      ["record-unbeaten-run", 3, 2, "m8"],
      ["record-win-run", 3, 2, "m8"],
    ]);
  });

  it("puts a record only on a Match that set it, never a later loss", () => {
    // The Session's two Wins come before records count; its loss after.
    const matches = history([]).slice(0, 3);
    const session = (["W", "W", "L"] as Outcome[]).map((outcome, i) => ({
      ...match(i, outcome, outcome === "W" ? 1 : 0, outcome === "W" ? 0 : 1),
      matchId: `s${i}`,
      playedAt: new Date(T0 + 10 * DAY + i * 20 * MINUTE),
    }));
    expect(keys(input({ matches: [...matches, ...session] }))).toEqual([]);
  });

  it("records the best Session by Wins once", () => {
    const matches = [
      ...history([]),
      // One Session of three Wins, 20 minutes apart.
      ...[0, 1, 2].map((i) => ({
        ...match(i, "W" as Outcome, 1, 0),
        matchId: `s${i}`,
        playedAt: new Date(T0 + 10 * DAY + i * 20 * MINUTE),
      })),
    ];
    expect(
      detectMilestones(input({ matches }))
        .filter((m) => m.kind === "record-session-wins")
        .map((m) => [m.value, m.threshold, m.matchId, m.dedupeKey]),
    ).toEqual([[2, 1, "s1", "club:record-session-wins:s0"]]);
  });
});

describe("detection", () => {
  it("gives the same Milestones every run", () => {
    const data = input({
      matches: [match(0)],
      appearances: [appearance("m0", KAB, { goals: 3 })],
    });
    expect(detectMilestones(data)).toEqual(detectMilestones(data));
  });
});

describe("headlines and sentences", () => {
  const figures = { value: 50, threshold: 50, positionGroup: null };

  it("names who and what", () => {
    expect(milestoneHeadline("goals", "Loltown95", figures)).toBe(
      "Loltown95 — 50th goal",
    );
    expect(
      milestoneHeadline("goals", "Loltown95", { ...figures, value: 1 }),
    ).toBe("Loltown95 — First goal");
    expect(
      milestoneHeadline("first-goal-in-position", "Kabeeble", {
        value: 1,
        threshold: null,
        positionGroup: "forward",
      }),
    ).toBe("Kabeeble — First goal as a Forward");
  });

  it("labels records as since records began", () => {
    expect(
      MILESTONE_KINDS["record-win-margin"].sentence("A Bloo Bloo", {
        value: 5,
        threshold: 3,
        positionGroup: null,
      }),
    ).toContain("since records began");
  });
});
