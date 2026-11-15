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
    const counts = [
      {
        playerId: "2",
        positionGroup: "midfielder",
        played: MIN_SUMMARY_APPEARANCES,
        lastPlayedAt: at("2026-11-03T20:00:00"),
      },
      // A later Appearance elsewhere still moves the week on.
      {
        playerId: "2",
        positionGroup: "forward",
        played: 1,
        lastPlayedAt: at("2026-11-12T21:00:00"),
      },
      // Five Appearances, but never five in one position.
      {
        playerId: "1",
        positionGroup: "forward",
        played: 3,
        lastPlayedAt: at("2026-11-12T21:00:00"),
      },
      {
        playerId: "1",
        positionGroup: "defender",
        played: 2,
        lastPlayedAt: at("2026-11-12T21:00:00"),
      },
      // Enough, but in no recorded position.
      {
        playerId: "3",
        positionGroup: null,
        played: MIN_SUMMARY_APPEARANCES,
        lastPlayedAt: at("2026-11-12T21:00:00"),
      },
    ];
    expect(summarySubjects(counts)).toEqual([
      { playerId: "2", weekStart: "2026-11-09" },
    ]);
  });
});
