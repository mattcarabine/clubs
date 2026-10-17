import { describe, expect, it } from "vitest";

import {
  formatLondonDate,
  formatLondonDateTime,
  formatLondonShortDate,
  formatLondonTime,
  londonDateKey,
  londonParts,
} from "./london-time";

describe("londonParts", () => {
  it("applies BST (UTC+1) in summer", () => {
    // Wednesday 14 Oct 2026, 20:00 in London.
    expect(londonParts(new Date("2026-10-14T19:00:00Z"))).toEqual({
      year: 2026,
      month: 10,
      day: 14,
      weekday: "Wed",
      hour: 20,
      minute: 0,
    });
  });

  it("applies GMT (UTC+0) in winter", () => {
    // Tuesday 3 Nov 2026, 22:30 in London.
    expect(londonParts(new Date("2026-11-03T22:30:00Z"))).toMatchObject({
      weekday: "Tue",
      hour: 22,
      minute: 30,
    });
  });

  it("puts the same London wall-clock time in the same bucket across the clock change", () => {
    // BST ends 25 Oct 2026. Both are 20:00 on a Tuesday in London.
    const beforeChange = londonParts(new Date("2026-10-20T19:00:00Z"));
    const afterChange = londonParts(new Date("2026-10-27T20:00:00Z"));
    expect([beforeChange.weekday, beforeChange.hour]).toEqual(["Tue", 20]);
    expect([afterChange.weekday, afterChange.hour]).toEqual(["Tue", 20]);
  });

  it("rolls into the next London day after UTC midnight in BST", () => {
    // 23:30 UTC on Mon 12 Oct is 00:30 on Tue 13 Oct in London.
    const parts = londonParts(new Date("2026-10-12T23:30:00Z"));
    expect([parts.weekday, parts.day, parts.hour]).toEqual(["Tue", 13, 0]);
  });
});

describe("londonDateKey", () => {
  it("is the London calendar date", () => {
    expect(londonDateKey(new Date("2026-10-12T23:30:00Z"))).toBe("2026-10-13");
    expect(londonDateKey(new Date("2026-01-05T09:00:00Z"))).toBe("2026-01-05");
  });
});

describe("formatting", () => {
  const date = new Date("2026-10-14T19:05:00Z");

  const laterThisYear = new Date("2026-12-31T12:00:00Z");
  const nextYear = new Date("2027-01-02T12:00:00Z");

  it("writes a day and a moment without the year in the current year", () => {
    expect(formatLondonDate(date, laterThisYear)).toBe("Wed 14 Oct");
    expect(formatLondonDateTime(date, laterThisYear)).toBe("Wed 14 Oct, 20:05");
  });

  it("adds the year to a day or moment from another year", () => {
    expect(formatLondonDate(date, nextYear)).toBe("Wed 14 Oct 2026");
    expect(formatLondonDateTime(date, nextYear)).toBe("Wed 14 Oct 2026, 20:05");
  });

  it("takes the current year from London, not UTC", () => {
    // 23:30 UTC on 31 Dec 2025 is 23:30 GMT: still 2025 in London.
    const newYearsEve = new Date("2025-12-31T23:30:00Z");
    expect(formatLondonDate(newYearsEve, newYearsEve)).toBe("Wed 31 Dec");
    // 00:30 UTC on 1 Jan 2026 is a new London year, so 31 Dec gains its year.
    expect(
      formatLondonDate(newYearsEve, new Date("2026-01-01T00:30:00Z")),
    ).toBe("Wed 31 Dec 2025");
  });

  it("writes a time and a chart-axis date in London time", () => {
    expect(formatLondonTime(date)).toBe("20:05");
    expect(formatLondonShortDate(date)).toBe("14 Oct");
  });
});
