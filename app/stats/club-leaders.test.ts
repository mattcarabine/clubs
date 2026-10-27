import { describe, expect, it } from "vitest";

import {
  clubLeaders,
  type LeaderCandidate,
  MIN_RATING_GAMES,
} from "./club-leaders";

function member(
  name: string,
  career: Partial<NonNullable<LeaderCandidate["career"]>> | null = {},
  perfectRatings = 0,
): LeaderCandidate {
  return {
    playerId: name,
    name,
    career: career && {
      gamesPlayed: 50,
      goals: 0,
      assists: 0,
      manOfTheMatch: 0,
      averageRating: 7,
      ...career,
    },
    perfectRatings,
  };
}

function board(candidates: LeaderCandidate[], stat: string) {
  return clubLeaders(candidates).find((b) => b.stat === stat);
}

describe("clubLeaders", () => {
  it("names the leader and the next two, most first", () => {
    const goals = board(
      [
        member("Fourth", { goals: 10 }),
        member("Leader", { goals: 98 }),
        member("Third", { goals: 44 }),
        member("Second", { goals: 86 }),
      ],
      "goals",
    );
    expect(goals?.label).toBe("Goals");
    expect(goals?.leaders.map((l) => [l.name, l.figure])).toEqual([
      ["Leader", "98"],
      ["Second", "86"],
      ["Third", "44"],
    ]);
  });

  it("breaks a tie by name", () => {
    const assists = board(
      [member("Zed", { assists: 5 }), member("Amy", { assists: 5 })],
      "assists",
    );
    expect(assists?.leaders.map((l) => l.name)).toEqual(["Amy", "Zed"]);
  });

  it("counts an average rating only after enough games, to one decimal", () => {
    const rating = board(
      [
        member("Newcomer", {
          gamesPlayed: MIN_RATING_GAMES - 1,
          averageRating: 9.4,
        }),
        member("Regular", { gamesPlayed: MIN_RATING_GAMES, averageRating: 8 }),
      ],
      "average-rating",
    );
    expect(rating?.leaders.map((l) => [l.name, l.figure])).toEqual([
      ["Regular", "8.0"],
    ]);
  });

  it("leaves off anyone with nothing in a stat, and drops a board nobody is on", () => {
    const boards = clubLeaders([
      member("Scorer", { goals: 3 }, 1),
      member("Blank", null),
    ]);
    expect(boards.map((b) => b.stat)).toEqual([
      "goals",
      "average-rating",
      "perfect-ratings",
      "appearances",
    ]);
    expect(boards.find((b) => b.stat === "perfect-ratings")?.leaders).toEqual([
      { playerId: "Scorer", name: "Scorer", value: 1, figure: "1" },
    ]);
  });

  it("returns no boards without candidates", () => {
    expect(clubLeaders([])).toEqual([]);
  });
});
