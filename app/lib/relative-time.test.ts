import { describe, expect, it } from "vitest";
import { formatRelativeTime, isStale } from "./relative-time";

const now = new Date("2026-10-17T20:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;

describe("formatRelativeTime", () => {
  it.each([
    [0, "just now"],
    [59_999, "just now"],
    [-5 * MIN, "just now"],
    [MIN, "1 min ago"],
    [59 * MIN, "59 min ago"],
    [60 * MIN, "1 hr ago"],
    [23 * 60 * MIN + 59 * MIN, "23 hr ago"],
    [24 * 60 * MIN, "1 day ago"],
    [3 * 24 * 60 * MIN, "3 days ago"],
  ])("%i ms ago reads %s", (elapsed, expected) => {
    expect(formatRelativeTime(ago(elapsed), now)).toBe(expected);
  });
});

describe("isStale", () => {
  it("is fresh up to and including the threshold", () => {
    expect(isStale(ago(15 * MIN), now, 15)).toBe(false);
  });

  it("is stale past the threshold", () => {
    expect(isStale(ago(15 * MIN + 1), now, 15)).toBe(true);
  });
});
