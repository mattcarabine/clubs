import { describe, expect, it } from "vitest";

import type { Outcome } from "~/lib/domain";

import type { ClubMatchTotals, SplitMatch } from "./outcome-split";
import { resultDrivers } from "./result-drivers";
import type { SquadAppearance } from "./squad";

const FULL = 90 * 60;

const TOTALS: ClubMatchTotals = {
  goals: 1,
  shots: 10,
  passesMade: 80,
  passAttempts: 100,
  tacklesMade: 5,
  tackleAttempts: 10,
  saves: 2,
  redCards: 0,
  ratingSum: 28,
  ratings: 4,
};

let sequence = 0;

function match(
  outcome: Outcome,
  ours: Partial<ClubMatchTotals> = {},
  opponent: Partial<ClubMatchTotals> = {},
): SplitMatch {
  sequence += 1;
  return {
    matchId: `m${sequence}`,
    playedAt: new Date(Date.UTC(2026, 9, 1, 19, sequence)),
    outcome,
    dnf: false,
    secondsPlayed: FULL,
    ours: { ...TOTALS, ...ours },
    opponent: { ...TOTALS, ...opponent },
    squadSize: 4,
    opponentHumans: 4,
    droppedOut: [],
    session: sequence,
    sessionPlace: 1,
    ratingGap: null,
  };
}

/** Shots that vary a little, so the stat has a spread to measure against. */
const around = (shots: number) => [shots - 1, shots, shots + 1];

function appearance(
  playerId: string,
  outcome: Outcome,
  shots: number,
): SquadAppearance {
  return {
    playerId,
    name: `Player ${playerId}`,
    outcome,
    goals: 0,
    shots,
    passesMade: 0,
    passAttempts: 0,
    tacklesMade: 0,
    tackleAttempts: 0,
    saves: 0,
    redCards: 0,
    rating: 7,
    secondsPlayed: FULL,
  } as SquadAppearance;
}

describe("resultDrivers", () => {
  it("puts what we do more of in Wins under why we win", () => {
    const { win, lose } = resultDrivers(
      [
        ...around(12).map((shots) => match("W", { shots })),
        ...around(6).map((shots) => match("L", { shots })),
      ],
      [],
    );
    expect(lose).toEqual([]);
    expect(win.map((d) => d.id)).toContain("ours-shots");
    const shots = win.find((d) => d.id === "ours-shots");
    expect(shots).toMatchObject({
      label: "Shots per 90",
      text: "In wins we take 6.0 more shots per 90 than in draws and defeats",
      wins: "12.0",
      dropped: "6.0",
      smallSample: true,
      player: null,
    });
  });

  it("puts what the Opponent does more of in Dropped Points under why we lose", () => {
    const { win, lose } = resultDrivers(
      [
        ...around(6).map((shots) => match("W", {}, { shots })),
        ...around(12).map((shots) => match("D", {}, { shots })),
      ],
      [],
    );
    expect(win).toEqual([]);
    expect(lose[0]).toMatchObject({
      id: "opponent-shots",
      text: "In draws and defeats opponents take 6.0 more shots per 90 than in wins",
    });
  });

  it("leaves out a good thing we do less of when we win, and the result itself", () => {
    const { win, lose } = resultDrivers(
      [
        ...around(6).map((shots) => match("W", { shots, goals: 3 })),
        ...around(12).map((shots) => match("L", { shots, goals: 0 })),
      ],
      [],
    );
    const ids = [...win, ...lose].map((d) => d.id);
    expect(ids).not.toContain("ours-shots");
    expect(ids).not.toContain("ours-goals");
  });

  it("names the Squad Member whose own figure moves most the same way", () => {
    const matches = [
      ...around(12).map((shots) => match("W", { shots })),
      ...around(6).map((shots) => match("L", { shots })),
    ];
    const apps = [
      // Steady either way.
      ...around(3).map((shots) => appearance("1", "W", shots)),
      ...around(3).map((shots) => appearance("1", "L", shots)),
      // All the difference is theirs.
      ...around(9).map((shots) => appearance("2", "W", shots)),
      ...around(3).map((shots) => appearance("2", "L", shots)),
    ];
    const shots = resultDrivers(matches, apps).win.find(
      (d) => d.id === "ours-shots",
    );
    expect(shots?.player).toMatchObject({
      playerId: "2",
      name: "Player 2",
      wins: "9.0",
      dropped: "3.0",
    });
  });

  it("finds nothing with fewer than 3 Matches a side", () => {
    expect(
      resultDrivers(
        [
          ...around(12).map((shots) => match("W", { shots })),
          match("L", { shots: 2 }),
        ],
        [],
      ),
    ).toEqual({ win: [], lose: [] });
  });
});
