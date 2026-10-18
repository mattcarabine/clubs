import { describe, expect, it } from "vitest";

import {
  coachingWeek,
  latestCoachingWeek,
  londonWeekStart,
} from "./coaching-week";

const HOUR_MS = 60 * 60 * 1000;

describe("coachingWeek", () => {
  it("runs Monday to Monday, released at 09:00 London the next Monday (GMT)", () => {
    const week = coachingWeek("2026-11-09");
    expect(week.from.toISOString()).toBe("2026-11-09T00:00:00.000Z");
    expect(week.to.toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(week.releasedAt.toISOString()).toBe("2026-11-16T09:00:00.000Z");
  });

  it("uses London midnight and 09:00 in BST", () => {
    const week = coachingWeek("2026-07-06");
    expect(week.from.toISOString()).toBe("2026-07-05T23:00:00.000Z");
    expect(week.releasedAt.toISOString()).toBe("2026-07-13T08:00:00.000Z");
  });

  it("is 169 hours long the week the clocks go back, 167 the week they go forward", () => {
    // BST ends on Sun 25 Oct 2026 and starts on Sun 29 Mar 2026.
    const autumn = coachingWeek("2026-10-19");
    expect(autumn.to.getTime() - autumn.from.getTime()).toBe(169 * HOUR_MS);
    expect(autumn.from.toISOString()).toBe("2026-10-18T23:00:00.000Z");
    expect(autumn.releasedAt.toISOString()).toBe("2026-10-26T09:00:00.000Z");

    const spring = coachingWeek("2026-03-23");
    expect(spring.to.getTime() - spring.from.getTime()).toBe(167 * HOUR_MS);
    expect(spring.releasedAt.toISOString()).toBe("2026-03-30T08:00:00.000Z");
  });

  it("rejects a start that is not a Monday", () => {
    expect(() => coachingWeek("2026-10-20")).toThrow(/Monday/);
  });
});

describe("londonWeekStart", () => {
  it("is the London Monday, even when UTC is still on Sunday", () => {
    // 23:30 UTC on Sunday is 00:30 BST on Monday.
    expect(londonWeekStart(new Date("2026-07-12T23:30:00Z"))).toBe(
      "2026-07-13",
    );
    expect(londonWeekStart(new Date("2026-07-12T22:30:00Z"))).toBe(
      "2026-07-06",
    );
  });

  it("keeps Sunday in the week it ends", () => {
    expect(londonWeekStart(new Date("2026-10-18T12:00:00Z"))).toBe(
      "2026-10-12",
    );
  });
});

describe("latestCoachingWeek", () => {
  it("is the week before last until 09:00 London on Monday, then last week", () => {
    // Mon 26 Oct 2026 is GMT: 09:00 London is 09:00 UTC.
    expect(latestCoachingWeek(new Date("2026-10-26T08:59:59Z")).start).toBe(
      "2026-10-12",
    );
    expect(latestCoachingWeek(new Date("2026-10-26T09:00:00Z")).start).toBe(
      "2026-10-19",
    );
  });

  it("releases at 08:00 UTC on a BST Monday", () => {
    expect(latestCoachingWeek(new Date("2026-07-13T07:59:00Z")).start).toBe(
      "2026-06-29",
    );
    expect(latestCoachingWeek(new Date("2026-07-13T08:00:00Z")).start).toBe(
      "2026-07-06",
    );
  });

  it("releases at 08:00 UTC the Monday after the clocks go forward", () => {
    expect(latestCoachingWeek(new Date("2026-03-30T07:59:00Z")).start).toBe(
      "2026-03-16",
    );
    expect(latestCoachingWeek(new Date("2026-03-30T08:00:00Z")).start).toBe(
      "2026-03-23",
    );
  });

  it("stays on last week for the rest of the week", () => {
    expect(latestCoachingWeek(new Date("2026-10-25T23:59:00Z")).start).toBe(
      "2026-10-12",
    );
    expect(latestCoachingWeek(new Date("2026-10-18T12:00:00Z")).start).toBe(
      "2026-10-05",
    );
  });
});
