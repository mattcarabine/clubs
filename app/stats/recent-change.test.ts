import { describe, expect, it } from "vitest";

import {
  MIN_RECENT_APPEARANCES,
  RECENT_TREND_POINTS,
  RECENT_WINDOW,
  type RecentAppearance,
  recentChanges,
  splitRecent,
} from "./recent-change";

const FULL = 90 * 60;

function appearance(
  overrides: Partial<RecentAppearance> = {},
): RecentAppearance {
  return {
    positionGroup: "Midfielder",
    goals: 0,
    assists: 0,
    shots: 2,
    passesMade: 35,
    passAttempts: 50,
    tacklesMade: 2,
    tackleAttempts: 4,
    rating: 7,
    manOfTheMatch: false,
    redCards: 0,
    saves: 0,
    goalsConceded: 1,
    cleanSheet: false,
    secondsPlayed: FULL,
    outcome: "W",
    ...overrides,
  };
}

function many(
  count: number,
  build: (i: number) => Partial<RecentAppearance>,
): RecentAppearance[] {
  return Array.from({ length: count }, (_, i) => appearance(build(i)));
}

describe("splitRecent", () => {
  it("takes the latest items as recent and the rest as the baseline", () => {
    expect(splitRecent([1, 2, 3, 4, 5], 2)).toEqual({
      recent: [4, 5],
      baseline: [1, 2, 3],
    });
  });

  it("puts everything in recent when there are no more than the window", () => {
    expect(splitRecent([1, 2], 5)).toEqual({ recent: [1, 2], baseline: [] });
  });
});

describe("recentChanges", () => {
  it("reports a clear rise in pass % as improving, with both values and counts", () => {
    const apps = [
      // Passes made stay level, so only pass % changes.
      ...many(10, () => ({ passesMade: 63, passAttempts: 90 })), // 70%
      ...many(RECENT_WINDOW, () => ({ passesMade: 63, passAttempts: 70 })), // 90%
    ];
    const changes = recentChanges(apps, "Kabeeble");
    expect(changes.ready).toBe(true);
    expect(changes.dropping).toEqual([]);
    expect(changes.improving).toHaveLength(1);
    const [pass] = changes.improving;
    expect(pass).toMatchObject({
      id: "pass",
      label: "Pass %",
      direction: "up",
      text: "Kabeeble's pass % is up 20 points over the last 10 Appearances (90% vs 70%)",
      counts: "10 recent Appearances, 10 before",
      smallSample: false,
    });
  });

  it("reports a drop in shots per 90 as dropping off, using minutes played", () => {
    const apps = [
      ...many(6, () => ({ shots: 4 })),
      // 1 shot in 45 minutes is 2 per 90.
      ...many(RECENT_WINDOW, () => ({ shots: 1, secondsPlayed: FULL / 2 })),
    ];
    const [shots] = recentChanges(apps, "Star").dropping;
    expect(shots.text).toBe(
      "Star's shots per 90 are down 2.00 over the last 10 Appearances (2.00 vs 4.00)",
    );
    expect(shots.smallSample).toBe(true);
  });

  it("ranks Win % by Cohen's h alongside the averages", () => {
    const apps = [
      ...many(10, (i) => ({ outcome: i < 2 ? "W" : "L" })), // 20%
      ...many(RECENT_WINDOW, (i) => ({ outcome: i < 8 ? "W" : "L" })), // 80%
    ];
    const [win] = recentChanges(apps, "Star").improving;
    expect(win.text).toBe(
      "Star's Win % when playing is up 60 points over the last 10 Appearances (80% vs 20%)",
    );
  });

  it("leaves out changes below the effect-size threshold", () => {
    // 70% and 90% alternating, then 72% and 92%: d = 2 / 10 = 0.2.
    const apps = [
      ...many(10, (i) => ({ passesMade: i % 2 ? 45 : 35 })),
      ...many(RECENT_WINDOW, (i) => ({ passesMade: i % 2 ? 46 : 36 })),
    ];
    const changes = recentChanges(apps, "Star");
    expect(changes.ready).toBe(true);
    expect(changes.improving).toEqual([]);
    expect(changes.dropping).toEqual([]);
  });

  it("is not ready with fewer than 5 baseline Appearances", () => {
    const apps = [
      ...many(MIN_RECENT_APPEARANCES - 1, () => ({ passesMade: 10 })),
      ...many(RECENT_WINDOW, () => ({ passesMade: 45 })),
    ];
    const changes = recentChanges(apps, "Star");
    expect(changes).toMatchObject({
      ready: false,
      recentCount: 10,
      baselineCount: 4,
      improving: [],
      dropping: [],
    });
  });

  it("skips a stat with too few Appearances that can compute it", () => {
    // No tackle attempts in the baseline: tackle % cannot be compared.
    const apps = [
      ...many(10, () => ({ tacklesMade: 0, tackleAttempts: 0 })),
      ...many(RECENT_WINDOW, () => ({ tacklesMade: 4, tackleAttempts: 4 })),
    ];
    const ids = recentChanges(apps, "Star").improving.map((c) => c.id);
    expect(ids).toContain("tackles");
    expect(ids).not.toContain("tackle");
  });

  it("shows at most 3 changes each way, biggest first", () => {
    const apps = [
      ...many(10, (i) => ({
        goals: 0,
        assists: 0,
        shots: 1,
        passesMade: 30 + (i % 2),
        rating: 6 + (i % 2) * 0.5,
      })),
      ...many(RECENT_WINDOW, (i) => ({
        goals: 1,
        assists: 1,
        shots: 4,
        passesMade: 30 + (i % 2),
        rating: 8 + (i % 2) * 0.5,
      })),
    ];
    const { improving, biggest } = recentChanges(apps, "Star");
    expect(improving).toHaveLength(3);
    expect(biggest).toEqual(improving[0]);
  });

  it("gives each change a rolling-average trend over the last 20 Appearances", () => {
    const apps = [
      ...many(15, () => ({ passesMade: 63, passAttempts: 90 })),
      ...many(RECENT_WINDOW, () => ({ passesMade: 63, passAttempts: 70 })),
    ];
    const [pass] = recentChanges(apps, "Star").improving;
    expect(pass.trend).toHaveLength(RECENT_TREND_POINTS);
    expect(pass.trend[0]).toBe(70);
    expect(pass.trend.at(-1)).toBe(90);
  });

  it("picks the biggest change by effect size, whichever way it goes", () => {
    const apps = [
      // Rating 6 and 8 alternating, then 7 and 9: d = 1.
      ...many(10, (i) => ({ rating: i % 2 ? 8 : 6, shots: 4 })),
      // Shots fall from 4 to 1 every Match: no spread, so the bigger effect.
      ...many(RECENT_WINDOW, (i) => ({ rating: i % 2 ? 9 : 7, shots: 1 })),
    ];
    const changes = recentChanges(apps, "Star");
    expect(changes.improving.map((c) => c.id)).toEqual(["rating"]);
    expect(changes.biggest).toMatchObject({ id: "shots", direction: "down" });
  });

  it("has no biggest change when nothing changed", () => {
    expect(
      recentChanges(
        many(20, () => ({})),
        "Star",
      ).biggest,
    ).toBeNull();
  });
});
