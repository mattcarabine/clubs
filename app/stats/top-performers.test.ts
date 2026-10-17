import { describe, expect, it } from "vitest";

import { type PerformerInput, topPerformers } from "./top-performers";

function app(
  name: string,
  stats: Partial<Omit<PerformerInput, "name" | "playerId">> = {},
): PerformerInput {
  return {
    playerId: name,
    name,
    goals: 0,
    assists: 0,
    rating: 7,
    manOfTheMatch: false,
    ...stats,
  };
}

describe("topPerformers", () => {
  it("puts the Man of the Match first, then goals, then assists", () => {
    const result = topPerformers([
      app("Assister", { assists: 2 }),
      app("Quiet"),
      app("Scorer", { goals: 2, assists: 1 }),
      app("Motm", { manOfTheMatch: true, rating: 9.8 }),
      app("Single", { goals: 1 }),
    ]);
    expect(result.map((p) => p.name)).toEqual([
      "Motm",
      "Scorer",
      "Single",
      "Assister",
    ]);
  });

  it("breaks ties on rating, then name", () => {
    const result = topPerformers([
      app("B", { goals: 1, rating: 8 }),
      app("A", { goals: 1, rating: 8 }),
      app("C", { goals: 1, rating: 9 }),
    ]);
    expect(result.map((p) => p.name)).toEqual(["C", "A", "B"]);
  });

  it("falls back to the best-rated Appearance when nobody stood out", () => {
    const result = topPerformers([
      app("Low", { rating: 6.1 }),
      app("High", { rating: 7.9 }),
      app("Unrated", { rating: null }),
    ]);
    expect(result.map((p) => p.name)).toEqual(["High"]);
  });

  it("is empty with no Appearances or no ratings", () => {
    expect(topPerformers([])).toEqual([]);
    expect(topPerformers([app("Unrated", { rating: null })])).toEqual([]);
  });
});
