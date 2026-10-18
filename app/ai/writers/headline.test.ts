import { describe, expect, it } from "vitest";

import {
  headlineText,
  headlineWriteups,
  MAX_HEADLINE_LENGTH,
} from "./headline";

describe("headlineText", () => {
  it("keeps a headline that fits, on one line", () => {
    expect(headlineText("  Kebab Over6pack\nrun riot  ")).toBe(
      "Kebab Over6pack run riot",
    );
  });

  it("cuts a long headline after a whole word, with an ellipsis", () => {
    const text = headlineText("Bloo Bloo ".repeat(20));
    expect(text.length).toBeLessThanOrEqual(MAX_HEADLINE_LENGTH);
    expect(text).toMatch(/Bloo…$/);
  });
});

describe("headlineWriteups", () => {
  const ids = ["m1", "m2"];

  it("stores a headline per Match", () => {
    expect(
      headlineWriteups(
        {
          headlines: [
            { matchId: "m1", headline: "Bloo Bloo rampant" },
            { matchId: "m2", headline: "Sparrows sunk" },
          ],
        },
        ids,
      ),
    ).toEqual([
      { kind: "headline", subjectKey: "m1", text: "Bloo Bloo rampant" },
      { kind: "headline", subjectKey: "m2", text: "Sparrows sunk" },
    ]);
  });

  it("cuts an over-long headline to fit", () => {
    const [draft] = headlineWriteups(
      { headlines: [{ matchId: "m1", headline: "x ".repeat(100) }] },
      ids,
    );
    expect(draft.text.length).toBeLessThanOrEqual(MAX_HEADLINE_LENGTH);
  });

  it.each([
    ["an unexpected field", { headlines: [], link: "https://spam.example" }],
    [
      "a headline for another Match",
      { headlines: [{ matchId: "elsewhere", headline: "Spam" }] },
    ],
    [
      "a second headline for one Match",
      {
        headlines: [
          { matchId: "m1", headline: "One" },
          { matchId: "m1", headline: "Two" },
        ],
      },
    ],
    [
      "an extra field in a headline",
      { headlines: [{ matchId: "m1", headline: "One", extra: true }] },
    ],
    [
      "a headline that is not text",
      { headlines: [{ matchId: "m1", headline: 3 }] },
    ],
    ["plain text", "Just text"],
    ["null", null],
  ])("stores nothing from a reply with %s", (_, output) => {
    expect(headlineWriteups(output, ids)).toEqual([]);
  });
});
