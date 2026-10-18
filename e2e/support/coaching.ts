/**
 * Helpers for the coaching notes specs (CLUBS-44): coaching weeks safely in
 * the past, Matches served in them, and telling coaching calls apart from
 * the Session write-ups the same Polls make.
 */
import {
  type CoachingWeek,
  coachingWeek,
  latestCoachingWeek,
} from "../../app/lib/coaching-week.ts";
import { addCalendarDays } from "../../app/lib/london-time.ts";
import type { RecordedRequest } from "../fake-anthropic/control.ts";
import {
  type fakeAnthropic as FakeAnthropic,
  promptText,
} from "./fake-anthropic.ts";
import { type Lineup, win, withLineup } from "./match-builders.ts";
import { type Fake, record } from "./record.ts";

export { KAB, TREV } from "./writeups.ts";
export const DAZ = { id: "935000003", name: "Dazza" };

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * A coaching week `weeksBack` weeks before the one released now, so every
 * week a spec uses, and its release, is in the past whatever day it runs.
 */
export function pastWeek(weeksBack: number): CoachingWeek {
  const latest = latestCoachingWeek(new Date());
  return coachingWeek(addCalendarDays(latest.start, -7 * weeksBack));
}

/** The week after `week`. */
export function nextWeek(week: CoachingWeek): CoachingWeek {
  return coachingWeek(addCalendarDays(week.start, 7));
}

/** `minutes` after `week`'s notes are released (09:00 London on the Monday after it). */
export function afterRelease(week: CoachingWeek, minutes = 5): Date {
  return new Date(week.releasedAt.getTime() + minutes * MINUTE_MS);
}

/**
 * One Session on Thursday evening of `week` (20:00 London; the clocks never
 * change midweek): a Win per line-up, 30 minutes apart. Recorded with a
 * Poll after each page EA lists, at now, so no coaching week is released
 * by them. Returns the Match IDs.
 */
export async function playSession(
  fakeEa: Fake,
  triggerPoll: () => Promise<void>,
  week: CoachingWeek,
  idPrefix: string,
  lineups: readonly Lineup[],
): Promise<string[]> {
  const start = week.from.getTime() + (3 * 24 + 20) * HOUR_MS;
  const ids = lineups.map(
    (_, i) => `${idPrefix}${String(i + 1).padStart(2, "0")}`,
  );
  await record(
    fakeEa,
    triggerPoll,
    lineups.map((lineup, i) =>
      withLineup(
        win({
          matchId: ids[i],
          playedAt: new Date(start + i * 30 * MINUTE_MS),
        }),
        lineup,
      ),
    ),
  );
  return ids;
}

/** Whether a Messages request is a coaching call rather than a Session write-up. */
export function isCoachingRequest({ body }: RecordedRequest): boolean {
  return promptText(body).includes("coaching notes");
}

/** The coaching calls received so far, oldest first. */
export async function coachingRequests(
  fakeAnthropic: typeof FakeAnthropic,
): Promise<RecordedRequest[]> {
  return (await fakeAnthropic.requests()).filter(isCoachingRequest);
}

/**
 * Polls at now until the Session write-up queue is empty (a Poll makes no
 * call), so the next call a spec scripts is the coaching one.
 */
export async function drainSessions(
  fakeAnthropic: typeof FakeAnthropic,
  triggerPoll: () => Promise<void>,
): Promise<void> {
  for (let poll = 0; poll < 10; poll++) {
    const before = (await fakeAnthropic.requests()).length;
    await triggerPoll();
    if ((await fakeAnthropic.requests()).length === before) return;
  }
  throw new Error("The Session write-ups never drained");
}

/** The fake upstream's default note for a Squad Member: one point naming them. */
export function fakeNote(playerId: string): RegExp {
  return new RegExp(`Fake points for ${playerId} \\(reply \\d+\\)\\.`);
}
