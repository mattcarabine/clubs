/**
 * The coaching week (CLUBS-44): Squad Members' coaching notes cover one
 * London week, Monday 00:00 to the next Monday 00:00, and are written by
 * the first Poll after 09:00 London on the Monday that ends it.
 *
 * Pure and dependency-free, so the E2E specs share it (relative `.ts`
 * imports only).
 */
import {
  addCalendarDays,
  type CalendarDate,
  calendarWeekdayIndex,
  londonDateKey,
  londonDayStart,
} from "./london-time.ts";

/** The London hour on the Monday after a week when its notes become due. */
export const COACHING_RELEASE_HOUR = 9;

const HOUR_MS = 60 * 60 * 1000;

export interface CoachingWeek {
  /** The week's Monday, as a London calendar date: the week's key. */
  start: CalendarDate;
  /** 00:00 London on that Monday. */
  from: Date;
  /** 00:00 London on the next Monday, excluded. 167 or 169 hours after `from` in the weeks the clocks change. */
  to: Date;
  /** `COACHING_RELEASE_HOUR` London on the next Monday: from then its notes are due. */
  releasedAt: Date;
}

/** The week starting on `start`, which must be a Monday. */
export function coachingWeek(start: CalendarDate): CoachingWeek {
  if (calendarWeekdayIndex(start) !== 0) {
    throw new Error(`A coaching week starts on a Monday, not ${start}`);
  }
  const to = londonDayStart(addCalendarDays(start, 7));
  return {
    start,
    from: londonDayStart(start),
    to,
    // The clocks only ever change early on a Sunday, so a Monday's 09:00 is 9 hours after its midnight.
    releasedAt: new Date(to.getTime() + COACHING_RELEASE_HOUR * HOUR_MS),
  };
}

/** The Monday of the London week holding `date`. */
export function londonWeekStart(date: Date): CalendarDate {
  const day = londonDateKey(date);
  return addCalendarDays(day, -calendarWeekdayIndex(day));
}

/**
 * The latest week whose notes are due at `now`: last week from Monday
 * 09:00 London, the week before until then.
 */
export function latestCoachingWeek(now: Date): CoachingWeek {
  const lastWeek = coachingWeek(addCalendarDays(londonWeekStart(now), -7));
  return lastWeek.releasedAt <= now
    ? lastWeek
    : coachingWeek(addCalendarDays(lastWeek.start, -7));
}
