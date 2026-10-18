import { describe, expect, it } from "vitest";

import { errorMessage, firstSentence, paragraphs } from "./text";

describe("errorMessage", () => {
  it("reads an Error's message and stringifies anything else", () => {
    expect(errorMessage(new Error("Timed out"))).toBe("Timed out");
    expect(errorMessage("plain")).toBe("plain");
  });
});

describe("paragraphs", () => {
  it("splits at blank lines and folds single line breaks", () => {
    expect(paragraphs("One\ntwo.\n\n  \nThree.\r\n\r\nFour.")).toEqual([
      "One two.",
      "Three.",
      "Four.",
    ]);
  });

  it("gives nothing for blank text", () => {
    expect(paragraphs(" \n\n ")).toEqual([]);
  });
});

describe("firstSentence", () => {
  it("ends at the first full stop, question or exclamation mark", () => {
    expect(firstSentence("What a night! Kab scored twice.")).toBe(
      "What a night!",
    );
    expect(firstSentence("Won 3-1. Then lost.")).toBe("Won 3-1.");
  });

  it("keeps decimals inside the sentence", () => {
    expect(firstSentence("Kab rated 8.4 all night. Nobody else did.")).toBe(
      "Kab rated 8.4 all night.",
    );
  });

  it("falls back to the first paragraph", () => {
    expect(firstSentence("No full stop here\n\nSecond.")).toBe(
      "No full stop here",
    );
  });
});
