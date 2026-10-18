import { describe, expect, it } from "vitest";

import {
  capitalise,
  clampText,
  errorMessage,
  firstSentence,
  paragraphs,
} from "./text";

describe("capitalise", () => {
  it("upper-cases the first letter only", () => {
    expect(capitalise("goals per 90")).toBe("Goals per 90");
  });
});

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
  it("keeps the first sentence and its end mark", () => {
    expect(firstSentence("A late collapse. Then a rally!")).toBe(
      "A late collapse.",
    );
    expect(firstSentence("What a night! Kab scored twice.")).toBe(
      "What a night!",
    );
  });

  it("does not split on a decimal point", () => {
    expect(firstSentence("Rated 8.5 all night? Yes. Again.")).toBe(
      "Rated 8.5 all night?",
    );
  });

  it("returns the whole text, trimmed, when it has no end mark", () => {
    expect(firstSentence("  A run of five wins  ")).toBe("A run of five wins");
  });

  it("stops at the first paragraph", () => {
    expect(firstSentence("No full stop here\n\nSecond.")).toBe(
      "No full stop here",
    );
  });
});

describe("clampText", () => {
  it("leaves text that fits alone", () => {
    expect(clampText("Five wins", 9)).toBe("Five wins");
  });

  it("cuts at the last whole word and adds an ellipsis", () => {
    const clamped = clampText("Playoff · Sat 17 Oct · Loss", 20);
    expect(clamped).toBe("Playoff · Sat 17…");
    expect(clamped.length).toBeLessThanOrEqual(20);
  });

  it("cuts a single long word mid-word", () => {
    expect(clampText("Supercalifragilistic", 6)).toBe("Super…");
  });
});
