import { describe, expect, it } from "vitest";

import { DEFAULT_STATS_FILTER, type StatsFilter } from "./filter";
import {
  compareFigures,
  compareOptions,
  compareSide,
  pairBuckets,
  parseCompareRequest,
  previousRange,
  writeCompareRequest,
} from "./period-compare";
import type { RecordSummary } from "./summaries";

const TODAY = "2026-10-27";
const NOW = new Date("2026-10-27T12:00:00Z");

function filter(overrides: Partial<StatsFilter>): StatsFilter {
  return { ...DEFAULT_STATS_FILTER, ...overrides };
}

function record(
  wins: number,
  draws: number,
  losses: number,
  goalsFor: number,
  goalsAgainst: number,
): RecordSummary {
  const played = wins + draws + losses;
  return {
    played,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    points: wins * 3 + draws,
    winPercentage: played ? (wins / played) * 100 : null,
  } as RecordSummary;
}

describe("previousRange", () => {
  it("is the same number of days just before, both ends inclusive", () => {
    expect(previousRange({ from: "2026-10-21", to: "2026-10-27" })).toEqual({
      from: "2026-10-14",
      to: "2026-10-20",
    });
  });

  it("compares one day with the day before", () => {
    expect(previousRange({ from: "2026-10-27", to: "2026-10-27" })).toEqual({
      from: "2026-10-26",
      to: "2026-10-26",
    });
  });

  it("counts calendar days across the end of BST", () => {
    // BST ends on Sun 25 Oct 2026: a 23-hour day, still one calendar day.
    expect(previousRange({ from: "2026-10-25", to: "2026-10-31" })).toEqual({
      from: "2026-10-18",
      to: "2026-10-24",
    });
  });

  it("crosses month and year ends", () => {
    expect(previousRange({ from: "2026-01-01", to: "2026-01-30" })).toEqual({
      from: "2025-12-02",
      to: "2025-12-31",
    });
  });
});

describe("compareOptions", () => {
  it("compares the last 30 days with the 30 before them, never a year earlier", () => {
    const options = compareOptions(
      filter({ dates: { kind: "preset", preset: "30d" } }),
      [1, 2],
      TODAY,
    );
    expect(options).toEqual({
      kind: "period",
      current: { from: "2026-09-28", to: "2026-10-27" },
      previous: { from: "2026-08-29", to: "2026-09-27" },
    });
  });

  it("compares a custom range with the same number of days before it", () => {
    expect(
      compareOptions(
        filter({
          dates: { kind: "custom", from: "2026-10-05", to: "2026-10-12" },
        }),
        [],
        TODAY,
      ),
    ).toMatchObject({ previous: { from: "2026-09-27", to: "2026-10-04" } });
  });

  it("offers the other Seasons, defaulting to the one before", () => {
    expect(compareOptions(filter({ season: 3 }), [1, 2, 3], TODAY)).toEqual({
      kind: "season",
      season: 3,
      others: [1, 2],
      fallback: 2,
    });
    expect(compareOptions(filter({ season: 1 }), [1, 2], TODAY)).toMatchObject({
      fallback: 2,
    });
  });

  it("never compares a Campaign, All dates, or a lone Season", () => {
    expect(
      compareOptions(
        filter({
          dates: { kind: "preset", preset: "7d" },
          campaign: { ref: "current" },
        }),
        [1, 2],
        TODAY,
      ),
    ).toBeNull();
    expect(compareOptions(DEFAULT_STATS_FILTER, [1, 2], TODAY)).toBeNull();
    expect(compareOptions(filter({ season: 1 }), [1], TODAY)).toBeNull();
  });
});

describe("compareSide", () => {
  const weekly = filter({ dates: { kind: "preset", preset: "7d" } });

  it("filters to the previous days and names them", () => {
    const side = compareSide(
      weekly,
      compareOptions(weekly, [], TODAY),
      "previous",
      NOW,
    );
    expect(side?.filter.dates).toEqual({
      kind: "custom",
      from: "2026-10-14",
      to: "2026-10-20",
    });
    expect(side?.label).toMatch(/^7 days before \(/);
  });

  it("filters to the picked Season, keeping the rest of the filter", () => {
    const seasonal = filter({ season: 2, matchTypes: ["League"] });
    const side = compareSide(
      seasonal,
      compareOptions(seasonal, [1, 2], TODAY),
      1,
      NOW,
    );
    expect(side?.filter).toMatchObject({ season: 1, matchTypes: ["League"] });
    expect(side?.label).toBe("Season 1");
  });

  it("ignores a request the filter cannot meet", () => {
    const seasonal = filter({ season: 2 });
    const options = compareOptions(seasonal, [1, 2], TODAY);
    expect(compareSide(seasonal, options, 7, NOW)).toBeNull();
    expect(compareSide(seasonal, options, "previous", NOW)).toBeNull();
    expect(
      compareSide(weekly, compareOptions(weekly, [], TODAY), 1, NOW),
    ).toBeNull();
    expect(compareSide(seasonal, options, null, NOW)).toBeNull();
  });
});

describe("?vs=", () => {
  it("round-trips previous and a Season, and drops anything else", () => {
    for (const request of ["previous", 2] as const) {
      const params = new URLSearchParams({
        vs: writeCompareRequest(request) ?? "",
      });
      expect(parseCompareRequest(params)).toBe(request);
    }
    for (const raw of ["0", "-1", "two", "1.5", ""]) {
      expect(parseCompareRequest(new URLSearchParams({ vs: raw }))).toBeNull();
    }
  });
});

describe("compareFigures", () => {
  it("gives each figure's change, direction and whether it is good for us", () => {
    const [win, scored, conceded, dropped] = compareFigures(
      record(3, 0, 1, 8, 4),
      record(1, 1, 2, 4, 8),
    );
    expect(win).toMatchObject({
      current: 75,
      previous: 25,
      change: 50,
      direction: "up",
      good: true,
    });
    expect(scored).toMatchObject({ current: 2, previous: 1, good: true });
    expect(conceded).toMatchObject({
      current: 1,
      previous: 2,
      direction: "down",
      good: true,
    });
    expect(dropped).toMatchObject({ current: 25, previous: 75, good: true });
  });

  it("has no change when the earlier side has no Matches", () => {
    const figures = compareFigures(
      record(1, 0, 0, 2, 0),
      record(0, 0, 0, 0, 0),
    );
    for (const f of figures) {
      expect(f.previous).toBeNull();
      expect(f.change).toBeNull();
      expect(f.direction).toBeNull();
    }
  });
});

describe("pairBuckets", () => {
  const bucket = (label: string, played: number, wins: number) => ({
    label,
    played,
    wins,
    winPercentage: (wins / played) * 100,
  });

  it("pairs by label in order, keeps one-sided buckets and flags small samples", () => {
    const paired = pairBuckets(
      [bucket("Tue", 12, 6), bucket("Sat", 2, 1)],
      [bucket("Tue", 10, 3), bucket("Fri", 4, 4)],
      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    );
    expect(paired.map((p) => p.label)).toEqual(["Tue", "Fri", "Sat"]);
    expect(paired[0].smallSample).toBe(false);
    expect(paired[1]).toMatchObject({ current: null, smallSample: true });
    expect(paired[2]).toMatchObject({ previous: null, smallSample: true });
  });
});
