import { describe, expect, it } from "vitest";

import {
  parseStatsSource,
  statsSourceFromRequest,
  writeStatsSource,
} from "./source";

const params = (query: string) => new URLSearchParams(query);

describe("parseStatsSource", () => {
  it("defaults to Recorded", () => {
    expect(parseStatsSource(params(""))).toBe("recorded");
  });

  it("reads EA totals", () => {
    expect(parseStatsSource(params("source=ea"))).toBe("ea");
  });

  it("falls back to Recorded for anything unknown", () => {
    expect(parseStatsSource(params("source=EA"))).toBe("recorded");
    expect(parseStatsSource(params("source="))).toBe("recorded");
  });

  it("reads a loader's request", () => {
    expect(
      statsSourceFromRequest(new Request("https://x.test/squad?source=ea")),
    ).toBe("ea");
  });
});

describe("writeStatsSource", () => {
  it("writes EA totals and keeps the filter, resetting the page", () => {
    expect(
      writeStatsSource(params("types=playoff&page=3"), "ea").toString(),
    ).toBe("types=playoff&source=ea");
  });

  it("leaves Recorded out of the URL", () => {
    expect(
      writeStatsSource(params("source=ea&former=1"), "recorded").toString(),
    ).toBe("former=1");
  });
});
