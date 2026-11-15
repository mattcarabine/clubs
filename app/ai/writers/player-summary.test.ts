import { describe, expect, it } from "vitest";

import { MAX_PARAGRAPH_LENGTH, playerSummaryWriteups } from "./player-summary";

const POSITIONS = ["Midfielder", "Forward"] as const;

function summary(positionGroup: string, paragraphs: unknown[] = ["Plays."]) {
  return { positionGroup, paragraphs };
}

describe("playerSummaryWriteups", () => {
  it("stores one write-up per Position Group, its paragraphs joined", () => {
    expect(
      playerSummaryWriteups(
        {
          summaries: [
            summary("Midfielder", ["Wins  the ball\nhigh.", "Gives it away."]),
            summary("Forward"),
          ],
        },
        "7",
        POSITIONS,
      ),
    ).toEqual([
      {
        kind: "player-summary",
        subjectKey: "7/Midfielder",
        text: "Wins the ball high.\n\nGives it away.",
      },
      { kind: "player-summary", subjectKey: "7/Forward", text: "Plays." },
    ]);
  });

  const forward = summary("Forward");
  it.each([
    ["a missing position", { summaries: [forward] }],
    [
      "a position not in the input",
      { summaries: [summary("Midfielder"), forward, summary("Defender")] },
    ],
    ["a position twice", { summaries: [forward, forward] }],
    ["no paragraphs", { summaries: [summary("Midfielder", []), forward] }],
    [
      "four paragraphs",
      { summaries: [summary("Midfielder", ["a", "b", "c", "d"]), forward] },
    ],
    [
      "an empty paragraph",
      { summaries: [summary("Midfielder", ["a", " "]), forward] },
    ],
    [
      "a non-text paragraph",
      { summaries: [summary("Midfielder", ["a", 3]), forward] },
    ],
    [
      "a paragraph too long",
      {
        summaries: [
          summary("Midfielder", ["a".repeat(MAX_PARAGRAPH_LENGTH + 1)]),
          forward,
        ],
      },
    ],
    ["an extra field", { summaries: [], title: "b" }],
    ["plain text", "a"],
  ])("stores nothing for %s", (_, output) => {
    expect(playerSummaryWriteups(output, "7", POSITIONS)).toEqual([]);
  });
});
