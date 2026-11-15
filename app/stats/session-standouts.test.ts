import { describe, expect, it } from "vitest";

import type { ClubMatchTotals, MatchPerformance } from "./outcome-split";
import { sessionStandouts } from "./session-standouts";

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

function match(
  ours: Partial<ClubMatchTotals> = {},
  opponent: Partial<ClubMatchTotals> = {},
): MatchPerformance {
  return {
    secondsPlayed: 90 * 60,
    ours: { ...TOTALS, ...ours },
    opponent: { ...TOTALS, ...opponent },
  };
}

/** A Session of two Matches with these shots for us. */
const shooting = (shots: number) => [match({ shots }), match({ shots })];

describe("sessionStandouts", () => {
  const others = [6, 8, 10, 12].map(shooting);

  it("names a stat in which the Session is our best", () => {
    const standouts = sessionStandouts(shooting(14), others);
    expect(standouts?.sessions).toBe(5);
    expect(standouts?.well[0]).toEqual({
      id: "ours-shots",
      label: "Shots per 90",
      value: "14.0",
      usual: "9.0",
      rank: 1,
      standing: "Best of 5 sessions",
    });
    // The same goals from more shots: our worst conversion.
    expect(standouts?.badly.map((s) => s.id)).toEqual(["ours-conversion"]);
  });

  it("reads the Opponent's stats the other way round", () => {
    const quiet = [match({}, { shots: 2 }), match({}, { shots: 2 })];
    const standouts = sessionStandouts(quiet, others);
    expect(standouts?.well).toContainEqual(
      expect.objectContaining({
        id: "opponent-shots",
        label: "Opponent shots per 90",
        standing: "Best of 5 sessions",
      }),
    );
  });

  it("names a stat in which the Session is our worst, and nothing in between", () => {
    expect(sessionStandouts(shooting(2), others)?.badly[0]).toMatchObject({
      id: "ours-shots",
      standing: "Worst of 5 sessions",
    });
    const middling = sessionStandouts(shooting(9), others);
    expect(middling?.well.map((s) => s.id)).not.toContain("ours-shots");
    expect(middling?.badly.map((s) => s.id)).not.toContain("ours-shots");
  });

  it("widens to the best fifth as Sessions add up", () => {
    const many = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(shooting);
    const second = sessionStandouts(shooting(8.5), many);
    expect(second?.well[0]).toMatchObject({
      id: "ours-shots",
      rank: 2,
      standing: "2nd best of 10 sessions",
    });
  });

  it("does not call a figure most Sessions share our best or worst", () => {
    // No red cards, like three of the four others.
    const carded = [match({ redCards: 2 }), match({ redCards: 2 })];
    const standouts = sessionStandouts(shooting(9), [
      ...others.slice(1),
      carded,
    ]);
    const ids = [...(standouts?.well ?? []), ...(standouts?.badly ?? [])].map(
      (s) => s.id,
    );
    expect(ids).not.toContain("ours-red-cards");
    expect(ids).not.toContain("opponent-red-cards");
  });

  it("says nothing for a one-Match Session or with fewer than four others", () => {
    expect(sessionStandouts([match({ shots: 20 })], others)).toBeNull();
    expect(sessionStandouts(shooting(14), others.slice(1))).toBeNull();
    // One-Match Sessions are not compared with.
    expect(
      sessionStandouts(shooting(14), [...others.slice(1), [match()]]),
    ).toBeNull();
  });
});
