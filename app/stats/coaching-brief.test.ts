import { describe, expect, it } from "vitest";

import { coachingWeek } from "~/lib/coaching-week";

import { coachingBriefs } from "./coaching-brief";
import type { SquadAppearance } from "./squad";

let sequence = 0;

function appearance(
  playedAt: string,
  overrides: Partial<SquadAppearance> = {},
): SquadAppearance {
  sequence += 1;
  return {
    playerId: "1",
    name: "Kabeeble",
    matchId: `m${sequence}`,
    matchType: "League",
    playedAt: new Date(playedAt),
    opponentClubId: "2",
    opponentName: "Opponent FC",
    goalsFor: 2,
    goalsAgainst: 1,
    outcome: "W",
    dnf: false,
    positionGroup: "Midfielder",
    goals: 0,
    assists: 0,
    shots: 0,
    passesMade: 0,
    passAttempts: 0,
    tacklesMade: 0,
    tackleAttempts: 0,
    rating: 7,
    manOfTheMatch: false,
    redCards: 0,
    saves: 0,
    goalsConceded: 0,
    cleanSheet: false,
    secondsPlayed: 5400,
    ...overrides,
  };
}

// Mon 12 Oct 2026 00:00 BST (11 Oct 23:00 UTC) to Mon 19 Oct 00:00 BST.
const WEEK = coachingWeek("2026-10-12");

describe("coachingBriefs", () => {
  it("covers only Squad Members who played in the week, by name", () => {
    const briefs = coachingBriefs(
      [
        appearance("2026-10-05T19:00:00Z", { playerId: "3", name: "Zed" }),
        appearance("2026-10-14T19:00:00Z", { playerId: "2", name: "Trevor" }),
        appearance("2026-10-15T19:00:00Z"),
      ],
      WEEK,
    );
    expect(briefs.map((b) => b.name)).toEqual(["Kabeeble", "Trevor"]);
  });

  it("uses London week edges: 23:30 UTC on Sunday 11 Oct is in, 23:30 UTC on Sunday 18 Oct is not", () => {
    const briefs = coachingBriefs(
      [
        appearance("2026-10-11T22:30:00Z", { goals: 1 }),
        appearance("2026-10-11T23:30:00Z", { goals: 2 }),
        appearance("2026-10-18T22:30:00Z", { goals: 3 }),
        appearance("2026-10-18T23:30:00Z", { goals: 4 }),
      ],
      WEEK,
    );
    const [brief] = briefs;
    expect(brief.week.map((a) => a.goals)).toEqual([2, 3]);
    expect(brief.weekTotals.goals).toBe(5);
    // Nothing after the week counts, so the brief never drifts.
    expect(brief.allTime.goals).toBe(6);
  });

  it("splits all-time stats by Position Group, most Appearances first, and names the copy with nameFor", () => {
    const briefs = coachingBriefs(
      [
        appearance("2026-10-01T19:00:00Z", { positionGroup: "Forward" }),
        appearance("2026-10-13T19:00:00Z", { positionGroup: "Midfielder" }),
        appearance("2026-10-14T19:00:00Z", { positionGroup: "Midfielder" }),
      ],
      WEEK,
      (name) => name.toUpperCase(),
    );
    const [brief] = briefs;
    expect(brief.name).toBe("KABEEBLE");
    expect(
      brief.byPositionGroup.map((p) => [p.positionGroup, p.appearances]),
    ).toEqual([
      ["Midfielder", 2],
      ["Forward", 1],
    ]);
    expect(brief.outcomeSplit.wins.appearances).toBe(3);
  });
});
