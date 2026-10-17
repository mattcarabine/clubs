import { describe, expect, it } from "vitest";

import { monogram } from "./monogram";

describe("monogram", () => {
  it("takes the first letters of the first two words", () => {
    expect(monogram("Kebab Over6pack")).toBe("KO");
    expect(monogram("Real Gravesend Rovers Football Club")).toBe("RG");
  });

  it("takes the first two letters of a one-word name", () => {
    expect(monogram("Thunderstruijk")).toBe("TH");
  });

  it("skips punctuation and extra spaces", () => {
    expect(monogram("  F.C. -  united ")).toBe("FU");
    expect(monogram("x")).toBe("X");
  });

  it("is empty for a name with no letters or digits", () => {
    expect(monogram("  ")).toBe("");
  });
});
