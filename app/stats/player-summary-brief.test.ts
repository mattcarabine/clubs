import { describe, expect, it } from "vitest";

import type { PositionGroup } from "~/lib/domain";

import {
  MIN_SUMMARY_APPEARANCES,
  summaryPositions,
  summarySubjects,
} from "./player-summary-brief";

const at = (iso: string) => new Date(`${iso}Z`);

function played(positionGroup: PositionGroup | null, times: number) {
  return Array.from({ length: times }, () => ({ positionGroup }));
}

describe("summaryPositions", () => {
  it("lists the Position Groups played enough, most played first", () => {
    expect(
      summaryPositions([
        ...played("Forward", MIN_SUMMARY_APPEARANCES),
        ...played("Midfielder", MIN_SUMMARY_APPEARANCES + 2),
        ...played("Defender", MIN_SUMMARY_APPEARANCES - 1),
        ...played(null, MIN_SUMMARY_APPEARANCES),
      ]),
    ).toEqual(["Midfielder", "Forward"]);
  });
});

describe("summarySubjects", () => {
  it("lists Squad Members with enough Appearances in a position, as of the week they last played", () => {
    const regular = Array.from({ length: MIN_SUMMARY_APPEARANCES }, (_, i) => ({
      playerId: "2",
      positionGroup: "Midfielder" as const,
      // Tue 3 Nov, then Thu 12 Nov for the last.
      playedAt: at(i < 4 ? "2026-11-03T20:00:00" : "2026-11-12T21:00:00"),
    }));
    // Five Appearances, but never five in one position.
    const utility = Array.from({ length: MIN_SUMMARY_APPEARANCES }, (_, i) => ({
      playerId: "1",
      positionGroup: i < 3 ? ("Forward" as const) : ("Defender" as const),
      playedAt: at("2026-11-12T21:00:00"),
    }));
    expect(summarySubjects([...regular, ...utility])).toEqual([
      { playerId: "2", weekStart: "2026-11-09" },
    ]);
  });
});
