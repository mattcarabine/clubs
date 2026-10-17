import { describe, expect, it } from "vitest";

import {
  canonicalComparisonParams,
  comparePath,
  parseComparisonParams,
  writeComparisonPlayers,
  writeComparisonPositionGroups,
  writeComparisonScope,
} from "./comparison-params";

const params = (query: string) => new URLSearchParams(query);

describe("parseComparisonParams", () => {
  it("defaults to no players, All matches and All Positions", () => {
    expect(parseComparisonParams(params(""))).toEqual({
      players: [],
      scope: "all",
      positionGroups: { A: [], B: [] },
    });
  });

  it("reads two players, the scope and each side's Position Groups", () => {
    expect(
      parseComparisonParams(
        params(
          "players=1,2&scope=together&posA=midfielder&posB=forward,midfielder",
        ),
      ),
    ).toEqual({
      players: ["1", "2"],
      scope: "together",
      positionGroups: { A: ["Midfielder"], B: ["Midfielder", "Forward"] },
    });
  });

  it("drops a repeated ID, blanks and anything past two", () => {
    expect(parseComparisonParams(params("players=1,1")).players).toEqual(["1"]);
    expect(parseComparisonParams(params("players=,1,,2,3")).players).toEqual([
      "1",
      "2",
    ]);
  });

  it("falls back to All matches for an unknown scope", () => {
    expect(parseComparisonParams(params("scope=shared")).scope).toBe("all");
  });
});

describe("writing a Comparison", () => {
  it("writes players, scope and positions, leaving defaults out", () => {
    let next = writeComparisonPlayers(params("page=2&types=league"), [
      "1",
      "2",
    ]);
    next = writeComparisonScope(next, "together");
    next = writeComparisonPositionGroups(next, "B", ["Forward"]);
    expect(Object.fromEntries(next)).toEqual({
      types: "league",
      players: "1,2",
      scope: "together",
      posB: "forward",
    });

    next = writeComparisonScope(next, "all");
    next = writeComparisonPositionGroups(next, "B", []);
    next = writeComparisonPlayers(next, []);
    expect(Object.fromEntries(next)).toEqual({ types: "league" });
  });
});

describe("comparePath", () => {
  it("opens Compare for the players", () => {
    expect(comparePath(params(""), ["1", "2"])).toBe("/compare?players=1,2");
    expect(comparePath(params(""), ["1"])).toBe("/compare?players=1");
  });

  it("carries the filter and source, making the global Position Groups each side's", () => {
    const path = comparePath(
      params("types=league&source=ea&pos=forward&former=1&page=3"),
      ["1", "2"],
    );
    const search = new URL(path, "https://x.test").searchParams;
    expect(Object.fromEntries(search)).toEqual({
      types: "league",
      source: "ea",
      players: "1,2",
      posA: "forward",
      posB: "forward",
    });
  });
});

describe("canonicalComparisonParams", () => {
  const canonical = (query: string, known: string[]) => {
    const search = params(query);
    const next = canonicalComparisonParams(
      search,
      parseComparisonParams(search),
      known,
    );
    return next && Object.fromEntries(next);
  };

  it("leaves a valid Comparison alone", () => {
    expect(canonical("players=1,2&posB=forward", ["1", "2"])).toBeNull();
    expect(canonical("", [])).toBeNull();
  });

  it("drops a repeated ID", () => {
    expect(canonical("players=1,1&posA=forward", ["1"])).toEqual({
      players: "1",
      posA: "forward",
    });
  });

  it("moves the Squad Member after an unknown ID to A, with their Position Groups", () => {
    expect(
      canonical("players=404,2&posA=midfielder&posB=forward&types=league", [
        "2",
      ]),
    ).toEqual({ types: "league", players: "2", posA: "forward" });
  });

  it("drops an unknown second ID and its Position Groups", () => {
    expect(canonical("players=1,404&posB=forward", ["1"])).toEqual({
      players: "1",
    });
  });
});
