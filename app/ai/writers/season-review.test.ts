import { describe, expect, it } from "vitest";

import { MAX_CITATION_LENGTH, seasonReviewWriteups } from "./season-review";

const AWARDS = ["golden-boot", "playmaker"];

function reply(overrides: Record<string, unknown> = {}) {
  return {
    intro: "What a Season.",
    citations: [
      { award: "golden-boot", citation: "Twelve goals." },
      { award: "playmaker", citation: "Nine assists." },
    ],
    outro: "Onwards.",
    ...overrides,
  };
}

describe("seasonReviewWriteups", () => {
  it("stores the intro, the outro and a citation per Award, keyed by the Season", () => {
    expect(seasonReviewWriteups(reply(), 3, AWARDS)).toEqual([
      { kind: "season-review", subjectKey: "3/intro", text: "What a Season." },
      { kind: "season-review", subjectKey: "3/outro", text: "Onwards." },
      {
        kind: "season-review",
        subjectKey: "3/award/golden-boot",
        text: "Twelve goals.",
      },
      {
        kind: "season-review",
        subjectKey: "3/award/playmaker",
        text: "Nine assists.",
      },
    ]);
  });

  it("stores nothing for an off-schema reply", () => {
    const off = [
      { ...reply(), extra: "x" },
      reply({ intro: 1 }),
      // A missing Award, an unknown one, and one cited twice.
      reply({ citations: [{ award: "golden-boot", citation: "x" }] }),
      reply({
        citations: [
          { award: "golden-boot", citation: "x" },
          { award: "hot-streak", citation: "x" },
        ],
      }),
      reply({
        citations: [
          { award: "golden-boot", citation: "x" },
          { award: "golden-boot", citation: "x" },
        ],
      }),
      reply({
        citations: [
          {
            award: "golden-boot",
            citation: "x".repeat(MAX_CITATION_LENGTH + 1),
          },
          { award: "playmaker", citation: "x" },
        ],
      }),
    ];
    for (const output of off) {
      expect(seasonReviewWriteups(output, 3, AWARDS)).toEqual([]);
    }
  });
});
