import { describe, expect, it } from "vitest";

import { MAX_ATTEMPTS } from "./config";
import { dueSubjects, isDue, type JobState, retryDelay } from "./plan";

const NOW = new Date("2026-10-18T21:00:00Z");
const MINUTE = 60_000;

function job(overrides: Partial<JobState> = {}): JobState {
  return {
    subjectKey: "s1",
    version: "a,b",
    status: "pending",
    attempts: 1,
    nextAttemptAt: new Date(NOW.getTime() - MINUTE),
    ...overrides,
  };
}

describe("isDue", () => {
  it("is due with no job yet", () => {
    expect(isDue(undefined, NOW)).toBe(true);
  });

  it("is due once a pending job's backoff has passed, not before", () => {
    expect(isDue(job(), NOW)).toBe(true);
    expect(isDue(job({ nextAttemptAt: NOW }), NOW)).toBe(true);
    expect(
      isDue(job({ nextAttemptAt: new Date(NOW.getTime() + MINUTE) }), NOW),
    ).toBe(false);
  });

  it("is never due once written, failed, empty or out of attempts", () => {
    expect(isDue(job({ status: "done" }), NOW)).toBe(false);
    expect(isDue(job({ status: "failed" }), NOW)).toBe(false);
    expect(isDue(job({ status: "empty" }), NOW)).toBe(false);
    expect(isDue(job({ attempts: MAX_ATTEMPTS }), NOW)).toBe(false);
  });
});

describe("dueSubjects", () => {
  const subjects = [
    { subjectKey: "new", version: "x" },
    { subjectKey: "s1", version: "a,b" },
    { subjectKey: "s0", version: "c" },
  ];

  it("keeps the writer's order and skips subjects already written", () => {
    const jobs = [job({ subjectKey: "s1", status: "done" })];
    expect(dueSubjects(subjects, jobs, NOW, 5)).toEqual([
      subjects[0],
      subjects[2],
    ]);
  });

  it("treats a new version of a written subject as due", () => {
    const jobs = [job({ subjectKey: "s1", version: "a", status: "done" })];
    expect(dueSubjects(subjects, jobs, NOW, 5)).toContainEqual(subjects[1]);
  });

  it("takes at most `limit`", () => {
    expect(dueSubjects(subjects, [], NOW, 2)).toEqual(subjects.slice(0, 2));
    expect(dueSubjects(subjects, [], NOW, 0)).toEqual([]);
  });
});

describe("retryDelay", () => {
  it("waits the base after the first try and doubles after each", () => {
    expect(retryDelay(1, 5 * MINUTE)).toBe(5 * MINUTE);
    expect(retryDelay(2, 5 * MINUTE)).toBe(10 * MINUTE);
    expect(retryDelay(3, 5 * MINUTE)).toBe(20 * MINUTE);
  });

  it("never waits with a zero base", () => {
    expect(retryDelay(2, 0)).toBe(0);
  });
});
