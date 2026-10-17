import { describe, expect, it } from "vitest";

import {
  DEFAULT_MIN_APPEARANCES,
  DEFAULT_STATS_FILTER,
  isDefaultStatsFilter,
  parseMinAppearances,
  parseStatsFilter,
  type StatsFilter,
  statsFilterFromRequest,
  toggleMatchType,
  writeMinAppearances,
  writeStatsFilter,
} from "./filter";

const params = (query: string) => new URLSearchParams(query);

describe("parseStatsFilter", () => {
  it("defaults to Competitive Matches, DNF included, all dates", () => {
    expect(parseStatsFilter(params(""))).toEqual({
      matchTypes: ["League", "Playoff"],
      includeDnf: true,
      range: "all",
    });
  });

  it("reads every field", () => {
    expect(
      parseStatsFilter(params("types=friendly,league&dnf=0&range=30d")),
    ).toEqual({
      matchTypes: ["League", "Friendly"],
      includeDnf: false,
      range: "30d",
    });
    expect(parseStatsFilter(params("range=last10")).range).toBe("last10");
  });

  it("ignores unknown Match Types and case", () => {
    expect(parseStatsFilter(params("types=PLAYOFF,cup")).matchTypes).toEqual([
      "Playoff",
    ]);
  });

  it("falls back to defaults for invalid values", () => {
    expect(parseStatsFilter(params("types=&range=forever&dnf=maybe"))).toEqual(
      DEFAULT_STATS_FILTER,
    );
    expect(parseStatsFilter(params("types=cup")).matchTypes).toEqual([
      "League",
      "Playoff",
    ]);
  });

  it("reads a Season, defaulting to all Seasons", () => {
    expect(parseStatsFilter(params("season=2")).season).toBe(2);
    for (const raw of ["", "0", "-1", "2.5", "current"]) {
      expect(parseStatsFilter(params(`season=${raw}`)).season).toBeUndefined();
    }
  });

  it("reads a loader's request", () => {
    const request = new Request("https://stats.test/squad?dnf=0");
    expect(statsFilterFromRequest(request).includeDnf).toBe(false);
  });
});

describe("writeStatsFilter", () => {
  it("leaves defaults out of the URL", () => {
    expect(
      writeStatsFilter(params("types=friendly&dnf=0"), DEFAULT_STATS_FILTER)
        .size,
    ).toBe(0);
  });

  it("writes non-default values in a stable order", () => {
    const filter: StatsFilter = {
      matchTypes: ["Friendly", "League"],
      includeDnf: false,
      range: "last10",
      season: 2,
    };
    expect(writeStatsFilter(params(""), filter).toString()).toBe(
      "types=league%2Cfriendly&dnf=0&range=last10&season=2",
    );
  });

  it("keeps unrelated params and resets the page", () => {
    const next = writeStatsFilter(params("sort=goals&page=3"), {
      ...DEFAULT_STATS_FILTER,
      range: "30d",
    });
    expect(next.get("sort")).toBe("goals");
    expect(next.has("page")).toBe(false);
  });

  it("does not modify its input", () => {
    const input = params("page=2");
    writeStatsFilter(input, DEFAULT_STATS_FILTER);
    expect(input.get("page")).toBe("2");
  });

  it("round-trips through parseStatsFilter", () => {
    const filters: StatsFilter[] = [
      DEFAULT_STATS_FILTER,
      { matchTypes: ["Friendly"], includeDnf: false, range: "30d" },
      {
        matchTypes: ["League", "Playoff", "Friendly"],
        includeDnf: true,
        range: "last10",
      },
      { ...DEFAULT_STATS_FILTER, season: 3 },
    ];
    for (const filter of filters) {
      expect(parseStatsFilter(writeStatsFilter(params(""), filter))).toEqual(
        filter,
      );
    }
  });
});

describe("isDefaultStatsFilter", () => {
  it("compares Match Types regardless of order", () => {
    expect(
      isDefaultStatsFilter({
        ...DEFAULT_STATS_FILTER,
        matchTypes: ["Playoff", "League"],
      }),
    ).toBe(true);
    expect(
      isDefaultStatsFilter({ ...DEFAULT_STATS_FILTER, includeDnf: false }),
    ).toBe(false);
    expect(isDefaultStatsFilter({ ...DEFAULT_STATS_FILTER, season: 1 })).toBe(
      false,
    );
  });
});

describe("toggleMatchType", () => {
  it("adds and removes a Match Type, in canonical order", () => {
    const withFriendly = toggleMatchType(DEFAULT_STATS_FILTER, "Friendly");
    expect(withFriendly.matchTypes).toEqual(["League", "Playoff", "Friendly"]);
    expect(toggleMatchType(withFriendly, "League").matchTypes).toEqual([
      "Playoff",
      "Friendly",
    ]);
  });

  it("never removes the last Match Type", () => {
    const leagueOnly: StatsFilter = {
      ...DEFAULT_STATS_FILTER,
      matchTypes: ["League"],
    };
    expect(toggleMatchType(leagueOnly, "League")).toBe(leagueOnly);
  });
});

describe("minimum Appearances", () => {
  it("defaults to 3", () => {
    expect(parseMinAppearances(params(""))).toBe(DEFAULT_MIN_APPEARANCES);
    expect(DEFAULT_MIN_APPEARANCES).toBe(3);
  });

  it("reads a whole number, including 0", () => {
    expect(parseMinAppearances(params("minApps=1"))).toBe(1);
    expect(parseMinAppearances(params("minApps=0"))).toBe(0);
  });

  it("ignores negative or non-numeric values", () => {
    expect(parseMinAppearances(params("minApps=-1"))).toBe(3);
    expect(parseMinAppearances(params("minApps=2.5"))).toBe(3);
    expect(parseMinAppearances(params("minApps=lots"))).toBe(3);
  });

  it("writes only a non-default value and resets the page", () => {
    expect(writeMinAppearances(params("page=2"), 1).toString()).toBe(
      "minApps=1",
    );
    expect(writeMinAppearances(params("minApps=1"), 3).size).toBe(0);
  });
});
