import { describe, expect, it } from "vitest";

import type { Outcome } from "~/lib/domain";

import type { MatchSummary } from "./matches";
import {
  bestSession,
  divisionJourney,
  type FinishedSeason,
  MIN_RIVAL_RESULTS,
  moreCompleteEaRecord,
  rivals,
  seasonReview,
  whenWePlay,
  widestMargin,
} from "./season-review";
import { finishedSeasons } from "./seasons";
import { summariseRecord } from "./summaries";

const SEASON_2: FinishedSeason = {
  number: 2,
  startedAt: new Date("2026-10-01T00:00:00Z"),
  endedAt: new Date("2026-11-12T00:00:00Z"),
};

let id = 0;

/** A Match at a London wall-clock time in October (BST, UTC+1). */
function match(
  outcome: Outcome,
  [goalsFor, goalsAgainst]: [number, number],
  overrides: Partial<MatchSummary> & { at?: string } = {},
): MatchSummary {
  const { at = "2026-10-02T20:30", ...rest } = overrides;
  id++;
  return {
    matchId: `m${id}`,
    matchType: "League",
    playedAt: new Date(`${at}:00+01:00`),
    opponent: { clubId: "1", name: "Kebab Over6pack", crestUrl: null },
    goalsFor,
    goalsAgainst,
    outcome,
    dnf: false,
    skillRatings: { ours: null, opponent: null },
    ...rest,
  };
}

function snapshot(stats: Record<string, number>) {
  return { takenAt: new Date("2026-11-11T22:00:00Z"), stats };
}

describe("finishedSeasons", () => {
  it("ends each Season where the next starts, newest first, leaving out the current one", () => {
    const s1 = { number: 1, startedAt: new Date(0) };
    const s2 = { number: 2, startedAt: SEASON_2.startedAt };
    const s3 = { number: 3, startedAt: SEASON_2.endedAt };
    expect(finishedSeasons([s1, s2, s3])).toEqual([
      { ...s2, endedAt: s3.startedAt },
      { ...s1, endedAt: s2.startedAt },
    ]);
    expect(finishedSeasons([s1])).toEqual([]);
  });
});

describe("seasonReview", () => {
  it("is null for a Season with no recorded Matches", () => {
    expect(
      seasonReview({
        season: SEASON_2,
        matches: [],
        appearances: [],
        finalSnapshot: null,
      }),
    ).toBeNull();
  });

  it("covers Season 1 since records began, at its first recorded Match", () => {
    const first = match("W", [2, 0], { at: "2026-10-17T20:00" });
    const review = seasonReview({
      season: { ...SEASON_2, number: 1, startedAt: new Date(0) },
      matches: [first, match("L", [0, 1], { at: "2026-10-17T20:30" })],
      appearances: [],
      finalSnapshot: null,
    });
    expect(review?.partial).toBe(true);
    expect(review?.coveredFrom).toEqual(first.playedAt);
    expect(review?.record).toMatchObject({ played: 2, wins: 1, losses: 1 });
  });

  it("covers a detected Season from its start", () => {
    const review = seasonReview({
      season: SEASON_2,
      matches: [match("W", [1, 0])],
      appearances: [],
      finalSnapshot: null,
    });
    expect(review?.partial).toBe(false);
    expect(review?.coveredFrom).toEqual(SEASON_2.startedAt);
  });
});

describe("moreCompleteEaRecord", () => {
  const recorded = summariseRecord([match("W", [3, 1]), match("D", [1, 1])]);
  const ea = {
    gamesPlayed: 30,
    wins: 18,
    ties: 4,
    losses: 8,
    goals: 70,
    goalsAgainst: 40,
  };

  it("reads EA's final totals when they cover more Matches than we recorded", () => {
    expect(moreCompleteEaRecord(snapshot(ea), recorded)).toEqual({
      played: 30,
      wins: 18,
      draws: 4,
      losses: 8,
      goalsFor: 70,
      goalsAgainst: 40,
    });
  });

  it("is null when we recorded every Match, a field is missing, or there is no Snapshot", () => {
    expect(
      moreCompleteEaRecord(snapshot({ ...ea, gamesPlayed: 2 }), recorded),
    ).toBeNull();
    const { goals: _, ...partial } = ea;
    expect(moreCompleteEaRecord(snapshot(partial), recorded)).toBeNull();
    expect(moreCompleteEaRecord(null, recorded)).toBeNull();
  });
});

describe("divisionJourney", () => {
  it("prefers EA's Promotions, Relegations and best Division", () => {
    expect(
      divisionJourney(
        SEASON_2,
        [],
        snapshot({ promotions: 3, relegations: 1, bestDivision: 3 }),
      ),
    ).toEqual({
      promotions: 3,
      relegations: 1,
      bestDivision: 3,
      promotionSeries: [],
    });
  });

  it("replays Campaigns for the Promotion Series and as a fallback", () => {
    // Division 5's Points Target is reached in a few League Wins, then the
    // Promotion Series is won.
    const wins = Array.from({ length: 12 }, (_, i) =>
      match("W", [2, 0], {
        at: `2026-10-${String(3 + i).padStart(2, "0")}T20:00`,
      }),
    );
    const journey = divisionJourney(SEASON_2, wins, null);
    expect(journey?.promotions).toBeGreaterThan(0);
    expect(journey?.bestDivision).toBeLessThan(6);
    expect(journey?.promotionSeries[0]).toMatchObject({
      division: 6,
      promoted: true,
    });
  });

  it("is null with neither a Snapshot nor a tracked Campaign", () => {
    const season1 = { ...SEASON_2, number: 1, startedAt: new Date(0) };
    expect(divisionJourney(season1, [match("W", [1, 0])], null)).toBeNull();
  });
});

describe("widestMargin", () => {
  it("picks the biggest Win, ties to more goals, then the earlier Match, ignoring DNFs", () => {
    const fourNil = match("W", [4, 0], { at: "2026-10-03T20:00" });
    const fiveOne = match("W", [5, 1], { at: "2026-10-04T20:00" });
    const dnf = match("W", [3, 0], { dnf: true });
    expect(widestMargin([fourNil, fiveOne, dnf], "W")).toBe(fiveOne);
    const again = match("W", [5, 1], { at: "2026-10-05T20:00" });
    expect(widestMargin([again, fiveOne], "W")).toBe(fiveOne);
    expect(widestMargin([match("W", [9, 0], { dnf: true })], "W")).toBeNull();
  });

  it("picks the heaviest defeat by margin, ties to more conceded", () => {
    const zeroThree = match("L", [0, 3]);
    const twoFive = match("L", [2, 5]);
    expect(widestMargin([zeroThree, twoFive], "L")).toBe(twoFive);
    expect(widestMargin([match("W", [1, 0])], "L")).toBeNull();
  });
});

describe("bestSession", () => {
  it("is the Session with the most Wins, ties to fewer Dropped Points", () => {
    const night1 = [
      match("W", [2, 0], { at: "2026-10-03T20:00" }),
      match("W", [2, 0], { at: "2026-10-03T20:30" }),
      match("L", [0, 1], { at: "2026-10-03T21:00" }),
    ];
    const night2 = [
      match("W", [1, 0], { at: "2026-10-04T20:00" }),
      match("W", [1, 0], { at: "2026-10-04T20:30" }),
    ];
    const best = bestSession([...night1, ...night2]);
    expect(best?.id).toBe(night2[0].matchId);
    expect(best?.record).toMatchObject({ wins: 2, losses: 0 });
  });

  it("is null without a Win", () => {
    expect(bestSession([match("L", [0, 1])])).toBeNull();
  });
});

describe("whenWePlay", () => {
  it("needs 3 Matches", () => {
    expect(whenWePlay([match("W", [1, 0]), match("W", [1, 0])])).toBeNull();
  });

  it("finds the busiest night and kick-off band, and the best and worst slots", () => {
    // Fridays at 20:xx (2, 9, 16 Oct): three Wins. Saturdays at 18:xx: three losses.
    const fridays = ["02", "09", "16"].map((d) =>
      match("W", [1, 0], { at: `2026-10-${d}T20:30` }),
    );
    const saturdays = ["03", "10", "17"].map((d) =>
      match("L", [0, 1], { at: `2026-10-${d}T18:30` }),
    );
    const sunday = match("W", [1, 0], { at: "2026-10-04T18:30" });
    const result = whenWePlay([...fridays, ...saturdays, sunday]);
    // Friday and Saturday both have 3; Friday's Win % breaks the tie.
    expect(result?.busiestNight).toMatchObject({ label: "Fri", played: 3 });
    expect(result?.busiestTime).toMatchObject({
      label: "18:00–20:00",
      played: 4,
    });
    expect(result?.best).toMatchObject({
      label: "Fri 20:00–22:00",
      winPercentage: 100,
    });
    expect(result?.worst).toMatchObject({
      label: "Sat 18:00–20:00",
      winPercentage: 0,
    });
  });

  it("shows no best or worst slot when only one slot has 3 Matches", () => {
    const result = whenWePlay(
      ["02", "09", "16"].map((d) =>
        match("W", [1, 0], { at: `2026-10-${d}T20:30` }),
      ),
    );
    expect(result?.best).toBeNull();
    expect(result?.worst).toBeNull();
  });
});

describe("rivals", () => {
  const sparrows = { clubId: "2", name: "Sparrows", crestUrl: null };
  const robins = { clubId: "3", name: "Robins", crestUrl: null };

  it(`needs ${MIN_RIVAL_RESULTS} Dropped Points for a Nemesis and ${MIN_RIVAL_RESULTS} Wins for a favourite`, () => {
    const { nemesis, favourite } = rivals([
      match("L", [0, 1], { opponent: sparrows }),
      match("W", [1, 0], { opponent: robins }),
    ]);
    expect(nemesis).toBeNull();
    expect(favourite).toBeNull();
  });

  it("names the Nemesis and favourite Opponent, ties to more losses and more goals", () => {
    const { nemesis, favourite } = rivals([
      match("D", [1, 1], { opponent: sparrows }),
      match("D", [1, 1], { opponent: sparrows }),
      match("L", [0, 1], { opponent: robins }),
      match("D", [1, 1], { opponent: robins }),
      match("W", [1, 0], { opponent: sparrows }),
      match("W", [1, 0], { opponent: sparrows }),
      match("W", [5, 0], { opponent: robins }),
      match("W", [5, 0], { opponent: robins }),
    ]);
    expect(nemesis).toMatchObject({ name: "Robins", droppedPoints: 2 });
    expect(favourite).toMatchObject({ name: "Robins", wins: 2 });
  });
});
