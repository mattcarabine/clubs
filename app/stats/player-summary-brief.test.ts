import { describe, expect, it } from "vitest";

import {
  MIN_SUMMARY_APPEARANCES,
  summarySubjects,
} from "./player-summary-brief";

const at = (iso: string) => new Date(`${iso}Z`);

describe("summarySubjects", () => {
  it("lists Squad Members with enough Appearances, as of the week they last played", () => {
    const regular = Array.from({ length: MIN_SUMMARY_APPEARANCES }, (_, i) => ({
      playerId: "2",
      // Tue 3 Nov, then Thu 12 Nov for the last.
      playedAt: at(i < 4 ? "2026-11-03T20:00:00" : "2026-11-12T21:00:00"),
    }));
    const newcomer = [{ playerId: "1", playedAt: at("2026-11-12T21:00:00") }];
    expect(summarySubjects([...regular, ...newcomer])).toEqual([
      { playerId: "2", weekStart: "2026-11-09" },
    ]);
  });
});
