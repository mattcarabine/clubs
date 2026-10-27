import { describe, expect, it } from "vitest";

import type { FormIndicator } from "./recent-change";
import { formWatch, type LeaderboardRow } from "./squad";

function indicator(recent: number, usual: number): FormIndicator {
  return {
    status: recent > usual ? "hot" : "cold",
    recent,
    usual,
    text: `Last 5: ${recent} avg vs ${usual} usual`,
  };
}

/** A Squad table row with only what Form watch reads. */
function row(
  playerId: string,
  formIndicator: FormIndicator | null,
  former = false,
): LeaderboardRow {
  return {
    playerId,
    name: `Player ${playerId}`,
    former,
    formIndicator,
  } as LeaderboardRow;
}

describe("formWatch", () => {
  it("lists only current Squad Members in Hot or Cold form, biggest gap first", () => {
    const watch = formWatch([
      row("1", indicator(7.6, 7)),
      row("2", null),
      row("3", indicator(6, 7.5)),
      row("4", indicator(9, 6), true),
    ]);
    expect(watch.map((r) => r.playerId)).toEqual(["3", "1"]);
    expect(watch[0]).toEqual({
      playerId: "3",
      name: "Player 3",
      formIndicator: indicator(6, 7.5),
    });
  });

  it("is empty when nobody qualifies", () => {
    expect(formWatch([row("1", null)])).toEqual([]);
  });
});
