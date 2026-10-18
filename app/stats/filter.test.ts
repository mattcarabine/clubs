import { describe, expect, it } from "vitest";

import {
  DEFAULT_STATS_FILTER,
  dateRangeLabel,
  dateWindow,
  isDefaultStatsFilter,
  parseStatsFilter,
  presetRange,
  type StatsFilter,
  selectCampaign,
  statsFilterFromRequest,
  toggleMatchType,
  writeStatsFilter,
} from "./filter";

const params = (query: string) => new URLSearchParams(query);

describe("parseStatsFilter", () => {
  it("defaults to Competitive Matches, DNF included, all dates, All Positions", () => {
    expect(parseStatsFilter(params(""))).toEqual({
      matchTypes: ["League", "Playoff"],
      includeDnf: true,
      dates: { kind: "all" },
      positionGroups: [],
    });
  });

  it("reads every field", () => {
    expect(
      parseStatsFilter(
        params("types=playoff,league&dnf=0&range=30d&pos=forward,midfielder"),
      ),
    ).toEqual({
      matchTypes: ["League", "Playoff"],
      includeDnf: false,
      dates: { kind: "preset", preset: "30d" },
      positionGroups: ["Midfielder", "Forward"],
    });
  });

  it("ignores Friendlies, which are never shown", () => {
    expect(
      parseStatsFilter(params("types=league,friendly")).matchTypes,
    ).toEqual(["League"]);
    expect(parseStatsFilter(params("types=friendly")).matchTypes).toEqual(
      DEFAULT_STATS_FILTER.matchTypes,
    );
  });

  it("reads each date preset", () => {
    for (const preset of ["7d", "30d", "1y"] as const) {
      expect(parseStatsFilter(params(`range=${preset}`)).dates).toEqual({
        kind: "preset",
        preset,
      });
    }
  });

  it("reads a custom from/to range, inclusive of a single day", () => {
    expect(
      parseStatsFilter(params("from=2026-10-05&to=2026-10-12")).dates,
    ).toEqual({ kind: "custom", from: "2026-10-05", to: "2026-10-12" });
    expect(
      parseStatsFilter(params("from=2026-10-12&to=2026-10-12")).dates,
    ).toEqual({ kind: "custom", from: "2026-10-12", to: "2026-10-12" });
  });

  it("falls back to all dates for a bad range", () => {
    for (const query of [
      "range=last10",
      "range=forever",
      "from=2026-10-12&to=2026-10-05",
      "from=2026-10-05",
      "to=2026-10-05",
      "from=2026-02-30&to=2026-03-02",
      "from=5 Oct&to=12 Oct",
    ]) {
      expect(parseStatsFilter(params(query)).dates, query).toEqual({
        kind: "all",
      });
    }
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

  it("reads a Campaign: current, previous or a number, else none", () => {
    expect(parseStatsFilter(params("campaign=current")).campaign).toEqual({
      ref: "current",
    });
    expect(parseStatsFilter(params("campaign=previous")).campaign).toEqual({
      ref: "previous",
    });
    expect(parseStatsFilter(params("campaign=3")).campaign).toEqual({
      ref: 3,
    });
    for (const raw of ["", "0", "-1", "2.5", "latest"]) {
      expect(
        parseStatsFilter(params(`campaign=${raw}`)).campaign,
      ).toBeUndefined();
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
      writeStatsFilter(params("types=league&dnf=0"), DEFAULT_STATS_FILTER).size,
    ).toBe(0);
  });

  it("writes non-default values in a stable order", () => {
    const filter: StatsFilter = {
      matchTypes: ["Playoff"],
      includeDnf: false,
      dates: { kind: "preset", preset: "7d" },
      season: 2,
      positionGroups: ["Forward", "Defender"],
    };
    expect(writeStatsFilter(params(""), filter).toString()).toBe(
      "types=playoff&dnf=0&range=7d&season=2&pos=defender%2Cforward",
    );
  });

  it("writes a custom range as from/to and drops a preset", () => {
    const next = writeStatsFilter(params("range=30d"), {
      ...DEFAULT_STATS_FILTER,
      dates: { kind: "custom", from: "2026-10-05", to: "2026-10-12" },
    });
    expect(next.toString()).toBe("from=2026-10-05&to=2026-10-12");
    expect(
      writeStatsFilter(next, {
        ...DEFAULT_STATS_FILTER,
        dates: { kind: "preset", preset: "1y" },
      }).toString(),
    ).toBe("range=1y");
  });

  it("keeps unrelated params and resets the page", () => {
    const next = writeStatsFilter(params("sort=goals&page=3"), {
      ...DEFAULT_STATS_FILTER,
      dates: { kind: "preset", preset: "30d" },
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
      {
        matchTypes: ["Playoff"],
        includeDnf: false,
        dates: { kind: "preset", preset: "30d" },
        positionGroups: ["Goalkeeper"],
      },
      {
        matchTypes: ["League"],
        includeDnf: true,
        dates: { kind: "custom", from: "2026-01-01", to: "2026-10-17" },
        positionGroups: [],
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

describe("Campaign in the URL", () => {
  it("writes the Campaign's ref, never its resolved kick-offs", () => {
    const kickoffs = { first: new Date(0), last: new Date(1) };
    expect(
      writeStatsFilter(params(""), {
        ...DEFAULT_STATS_FILTER,
        campaign: { ref: "previous", kickoffs },
      }).toString(),
    ).toBe("campaign=previous");
    expect(
      writeStatsFilter(params("campaign=2"), {
        ...DEFAULT_STATS_FILTER,
        campaign: { ref: 2 },
      }).toString(),
    ).toBe("campaign=2");
    expect(
      writeStatsFilter(params("campaign=2"), DEFAULT_STATS_FILTER).size,
    ).toBe(0);
  });

  it("is not the default filter", () => {
    expect(
      isDefaultStatsFilter({
        ...DEFAULT_STATS_FILTER,
        campaign: { ref: "current" },
      }),
    ).toBe(false);
  });
});

describe("selectCampaign", () => {
  it("narrows to League, since a Campaign counts League Matches only", () => {
    expect(selectCampaign(DEFAULT_STATS_FILTER, "current")).toEqual({
      ...DEFAULT_STATS_FILTER,
      matchTypes: ["League"],
      campaign: { ref: "current" },
    });
  });

  it("clears the Campaign and keeps the Match Types", () => {
    const selected = selectCampaign(DEFAULT_STATS_FILTER, 2);
    const cleared = selectCampaign(selected, undefined);
    expect(cleared.campaign).toBeUndefined();
    expect(cleared.matchTypes).toEqual(["League"]);
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
    const playoffOnly = toggleMatchType(DEFAULT_STATS_FILTER, "League");
    expect(playoffOnly.matchTypes).toEqual(["Playoff"]);
    expect(toggleMatchType(playoffOnly, "League").matchTypes).toEqual([
      "League",
      "Playoff",
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

describe("dateWindow", () => {
  // Sat 17 Oct 2026, 21:30 in London (BST).
  const now = new Date("2026-10-17T20:30:00Z");

  it("is unbounded for all dates", () => {
    expect(dateWindow({ kind: "all" }, now)).toEqual({});
  });

  it("starts a preset at London midnight, today counting as day one", () => {
    expect(
      dateWindow({ kind: "preset", preset: "7d" }, now).start?.toISOString(),
    ).toBe("2026-10-10T23:00:00.000Z");
    expect(
      dateWindow({ kind: "preset", preset: "30d" }, now).start?.toISOString(),
    ).toBe("2026-09-17T23:00:00.000Z");
    expect(
      dateWindow({ kind: "preset", preset: "1y" }, now).start?.toISOString(),
    ).toBe("2025-10-17T23:00:00.000Z");
  });

  it("counts presets from London's date, not UTC's", () => {
    // 00:30 on Sun 18 Oct in London is still 17 Oct in UTC.
    const afterMidnight = new Date("2026-10-17T23:30:00Z");
    expect(
      dateWindow(
        { kind: "preset", preset: "7d" },
        afterMidnight,
      ).start?.toISOString(),
    ).toBe("2026-10-11T23:00:00.000Z");
  });

  it("covers whole London days at both ends of a custom range", () => {
    const window = dateWindow(
      { kind: "custom", from: "2026-10-05", to: "2026-10-12" },
      now,
    );
    expect(window.start?.toISOString()).toBe("2026-10-04T23:00:00.000Z");
    // A Match at 23:30 London on 12 Oct (22:30 UTC) is before the end.
    expect(window.end?.toISOString()).toBe("2026-10-12T23:00:00.000Z");
  });

  it("ends a custom range across the clock change", () => {
    const window = dateWindow(
      { kind: "custom", from: "2026-10-20", to: "2026-10-25" },
      now,
    );
    // BST ends on 25 Oct, so 26 Oct starts at midnight UTC.
    expect(window.end?.toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });
});

describe("presetRange", () => {
  it("covers today and the days before it", () => {
    expect(presetRange("7d", "2026-10-18")).toEqual({
      from: "2026-10-12",
      to: "2026-10-18",
    });
    expect(presetRange("1y", "2026-10-18").from).toBe("2025-10-19");
  });
});

describe("dateRangeLabel", () => {
  const now = new Date("2026-10-18T12:00:00Z");

  it("names each kind of range", () => {
    expect(dateRangeLabel({ kind: "all" }, now)).toBe("All dates");
    expect(dateRangeLabel({ kind: "preset", preset: "1y" }, now)).toBe(
      "Last 12 months",
    );
    expect(
      dateRangeLabel(
        { kind: "custom", from: "2026-10-03", to: "2026-10-07" },
        now,
      ),
    ).toBe("3 Oct – 7 Oct");
  });
});
