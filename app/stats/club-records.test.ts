import { describe, expect, it } from "vitest";

import type { Outcome } from "~/lib/domain";

import {
  type ClubRecordId,
  clubRecords,
  longestRun,
  type RecordMatch,
} from "./club-records";

const T0 = Date.UTC(2026, 9, 17, 19, 0);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Match `i`, a day after the one before (so each its own Session). */
function match(
  i: number,
  outcome: Outcome,
  goalsFor: number,
  goalsAgainst: number,
  extra: Partial<RecordMatch> = {},
): RecordMatch {
  return {
    matchId: `m${i}`,
    playedAt: new Date(T0 + i * DAY),
    opponent: { clubId: "9", name: "Rivals FC", crestUrl: null },
    goalsFor,
    goalsAgainst,
    outcome,
    dnf: false,
    skillRatings: { ours: null, opponent: null },
    ...extra,
  };
}

const W = (i: number, extra?: Partial<RecordMatch>) =>
  match(i, "W", 2, 1, extra);
const D = (i: number) => match(i, "D", 1, 1);
const L = (i: number) => match(i, "L", 0, 1);

function record(records: ReturnType<typeof clubRecords>, id: ClubRecordId) {
  return records.find((r) => r.id === id);
}

describe("longestRun", () => {
  const isWin = (m: RecordMatch) => m.outcome === "W";

  it("finds the longest run with its first and last Match", () => {
    const run = longestRun([W(0), W(1), L(2), W(3), W(4), W(5), D(6)], isWin);
    expect(run).toMatchObject({ length: 3, ongoing: false });
    expect(run?.first.matchId).toBe("m3");
    expect(run?.last.matchId).toBe("m5");
  });

  it("keeps a record with the run that set it first", () => {
    const run = longestRun([W(0), W(1), L(2), W(3), W(4), L(5)], isWin);
    expect(run?.first.matchId).toBe("m0");
  });

  it("gives the record to a run still going once it draws level", () => {
    const run = longestRun([W(0), W(1), L(2), W(3), W(4)], isWin);
    expect(run).toMatchObject({ length: 2, ongoing: true });
    expect(run?.first.matchId).toBe("m3");
  });

  it("needs a run of two", () => {
    expect(longestRun([W(0), L(1)], isWin)).toBeNull();
  });

  it("steps over skipped Matches without ending the run", () => {
    const quit = match(1, "L", 0, 3, { dnf: true });
    const run = longestRun([W(0), quit, W(2)], isWin, (m) => m.dnf);
    expect(run).toMatchObject({ length: 2, ongoing: true });
  });
});

describe("clubRecords", () => {
  it("is empty with no Matches, whatever the Division", () => {
    expect(clubRecords([], { division: 3, reachedAt: new Date(T0) })).toEqual(
      [],
    );
  });

  it("finds the biggest win and heaviest defeat, first set first, leaving rage quits out", () => {
    const records = clubRecords(
      [
        match(0, "W", 4, 1),
        match(1, "W", 5, 2),
        match(2, "W", 3, 0, { dnf: true }),
        match(3, "W", 9, 0, { dnf: true }),
        match(4, "L", 0, 4),
      ],
      null,
    );
    expect(record(records, "biggest-win")).toMatchObject({
      figure: "4–1",
      note: "v Rivals FC",
      href: "/matches/m0",
    });
    expect(record(records, "most-goals")).toMatchObject({
      figure: "5",
      note: "5–2 v Rivals FC",
    });
    expect(record(records, "heaviest-defeat")).toMatchObject({
      figure: "0–4",
      low: true,
    });
  });

  it("counts a rage quit by its result in a run of results", () => {
    const records = clubRecords(
      [W(0), match(1, "W", 3, 0, { dnf: true }), W(2), L(3)],
      null,
    );
    expect(record(records, "win-run")).toMatchObject({
      figure: "3",
      ongoing: false,
      when: { kind: "span", from: new Date(T0), to: new Date(T0 + 2 * DAY) },
    });
  });

  it("finds clean sheets and scoring runs from the score", () => {
    const records = clubRecords(
      [match(0, "W", 1, 0), match(1, "D", 0, 0), match(2, "W", 2, 1)],
      null,
    );
    expect(record(records, "clean-sheet-run")?.figure).toBe("2");
    expect(record(records, "scoring-run")).toBeUndefined();
  });

  it("finds the most wins in one session", () => {
    const sameNight = (i: number, outcome: Outcome) =>
      match(i, outcome, 1, 0, { playedAt: new Date(T0 + i * 20 * MINUTE) });
    const records = clubRecords(
      [sameNight(0, "W"), sameNight(1, "L"), sameNight(2, "W"), W(5)],
      null,
    );
    expect(record(records, "session-wins")).toMatchObject({
      figure: "2",
      note: "wins from 3 matches",
      href: "/sessions/m0",
    });
  });

  it("finds the highest skill rating and the win over the strongest side", () => {
    const records = clubRecords(
      [
        W(0, { skillRatings: { ours: 1500, opponent: 1700 } }),
        W(1, { skillRatings: { ours: 1650, opponent: 1600 } }),
        L(2),
      ],
      null,
    );
    expect(record(records, "highest-skill-rating")).toMatchObject({
      figure: "1,650",
      href: "/matches/m1",
    });
    expect(record(records, "giant-killing")).toMatchObject({
      figure: "2–1",
      note: "v Rivals FC, rated 200 above us",
    });
  });

  it("names the highest Division", () => {
    const reachedAt = new Date(T0);
    expect(
      record(
        clubRecords([L(0)], { division: 1, reachedAt }),
        "highest-division",
      ),
    ).toMatchObject({ figure: "Elite", when: { kind: "day", at: reachedAt } });
    expect(
      record(
        clubRecords([L(0)], { division: 4, reachedAt: null }),
        "highest-division",
      ),
    ).toMatchObject({ figure: "Div 3", when: null });
  });
});
