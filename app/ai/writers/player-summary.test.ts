import { describe, expect, it } from "vitest";

import { MAX_PARAGRAPH_LENGTH, playerSummaryWriteups } from "./player-summary";

describe("playerSummaryWriteups", () => {
  it("stores the paragraphs as one write-up for the Squad Member", () => {
    expect(
      playerSummaryWriteups(
        { paragraphs: ["Wins  the ball\nhigh.", "Gives it away."] },
        "7",
      ),
    ).toEqual([
      {
        kind: "player-summary",
        subjectKey: "7",
        text: "Wins the ball high.\n\nGives it away.",
      },
    ]);
  });

  it.each([
    ["no paragraphs", { paragraphs: [] }],
    ["four paragraphs", { paragraphs: ["a", "b", "c", "d"] }],
    ["an empty paragraph", { paragraphs: ["a", " "] }],
    ["a non-text paragraph", { paragraphs: ["a", 3] }],
    [
      "a paragraph too long",
      { paragraphs: ["a".repeat(MAX_PARAGRAPH_LENGTH + 1)] },
    ],
    ["an extra field", { paragraphs: ["a"], title: "b" }],
    ["plain text", "a"],
  ])("stores nothing for %s", (_, output) => {
    expect(playerSummaryWriteups(output, "7")).toEqual([]);
  });
});
