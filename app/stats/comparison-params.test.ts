import { describe, expect, it } from "vitest";

import {
  canonicalComparisonParams,
  comparePath,
  parseComparisonParams,
  writeComparisonPlayers,
  writeComparisonScope,
} from "./comparison-params";

const params = (query: string) => new URLSearchParams(query);

describe("parseComparisonParams", () => {
  it("defaults to no players and All matches", () => {
    expect(parseComparisonParams(params(""))).toEqual({
      players: [],
      scope: "all",
    });
  });

  it("reads two players and the scope", () => {
    expect(
      parseComparisonParams(params("players=1,2&scope=together&posA=forward")),
    ).toEqual({ players: ["1", "2"], scope: "together" });
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
  it("writes players and scope, leaving defaults out", () => {
    let next = writeComparisonPlayers(params("page=2&types=league"), [
      "1",
      "2",
    ]);
    next = writeComparisonScope(next, "together");
    expect(Object.fromEntries(next)).toEqual({
      types: "league",
      players: "1,2",
      scope: "together",
    });

    next = writeComparisonScope(next, "all");
    next = writeComparisonPlayers(next, []);
    expect(Object.fromEntries(next)).toEqual({ types: "league" });
  });
});

describe("comparePath", () => {
  it("opens Compare for the players", () => {
    expect(comparePath(params(""), ["1", "2"])).toBe("/compare?players=1,2");
    expect(comparePath(params(""), ["1"])).toBe("/compare?players=1");
  });

  it("carries the filter, main position only included, and source", () => {
    const path = comparePath(
      params("types=league&source=ea&positions=all&former=1&page=3"),
      ["1", "2"],
    );
    const search = new URL(path, "https://x.test").searchParams;
    expect(Object.fromEntries(search)).toEqual({
      types: "league",
      source: "ea",
      positions: "all",
      players: "1,2",
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
    expect(canonical("players=1,2", ["1", "2"])).toBeNull();
    expect(canonical("", [])).toBeNull();
  });

  it("drops a repeated ID", () => {
    expect(canonical("players=1,1", ["1"])).toEqual({ players: "1" });
  });

  it("moves the Squad Member after an unknown ID to A", () => {
    expect(canonical("players=404,2&types=league", ["2"])).toEqual({
      types: "league",
      players: "2",
    });
  });

  it("drops an unknown second ID", () => {
    expect(canonical("players=1,404", ["1"])).toEqual({ players: "1" });
  });
});
