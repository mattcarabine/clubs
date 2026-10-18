/**
 * Europe/London date helpers. Every time shown to a user, and every
 * day-of-week or time-of-day bucket, goes through here so BST is handled
 * once (CLAUDE.md "Conventions").
 */

export const LONDON_TIME_ZONE = "Europe/London";

/** Monday-first, matching how UK calendars and the Trends splits read. */
export const WEEKDAYS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** A moment's wall-clock fields in London. */
export interface LondonParts {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
  weekday: Weekday;
  /** 0 to 23. */
  hour: number;
  minute: number;
}

const partsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

export function londonParts(date: Date): LondonParts {
  const parts: Record<string, string> = {};
  for (const { type, value } of partsFormat.formatToParts(date)) {
    parts[type] = value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday as Weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** The London calendar date as `YYYY-MM-DD`, for grouping by day. */
export function londonDateKey(date: Date): string {
  const { year, month, day } = londonParts(date);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** A London calendar date as `YYYY-MM-DD`, as `londonDateKey` writes it. */
export type CalendarDate = string;

/** True for a real `YYYY-MM-DD` date: "2026-02-30" and "2026-1-5" are not. */
export function isCalendarDate(raw: string): raw is CalendarDate {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(raw) && utcCalendarDate(utcMidnight(raw)) === raw
  );
}

/** True when both are real dates and `from` is not after `to`. */
export function isCalendarRange(from: string, to: string): boolean {
  return isCalendarDate(from) && isCalendarDate(to) && from <= to;
}

/** The calendar date `days` after (or, if negative, before) `date`. */
export function addCalendarDays(
  date: CalendarDate,
  days: number,
): CalendarDate {
  return utcCalendarDate(utcMidnight(date) + days * DAY_MS);
}

/**
 * The moment a London calendar day begins: 00:00 GMT in winter, 23:00 UTC
 * the evening before in BST. The clocks change at 01:00 UTC, never near
 * London midnight, so the offset at UTC midnight is the one that applies.
 */
export function londonDayStart(date: CalendarDate): Date {
  const midnight = utcMidnight(date);
  const london = londonParts(new Date(midnight));
  const wallClock = Date.UTC(
    london.year,
    london.month - 1,
    london.day,
    london.hour,
    london.minute,
  );
  return new Date(midnight - (wallClock - midnight));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/*
 * Calendar months, for the date-range picker's grid. These are pure calendar
 * arithmetic on `YYYY-MM-DD` strings: no instant, so no time zone.
 */

/** A calendar month as `YYYY-MM`. */
export type CalendarMonth = string;

export function calendarMonthOf(date: CalendarDate): CalendarMonth {
  return date.slice(0, 7);
}

/** The month `months` after (or, if negative, before) `month`. */
export function addCalendarMonths(
  month: CalendarMonth,
  months: number,
): CalendarMonth {
  const [year, index] = month.split("-").map(Number);
  return utcCalendarDate(Date.UTC(year, index - 1 + months, 1)).slice(0, 7);
}

/** Months from `from` to `to`: 0 for the same month, negative when `to` is earlier. */
export function calendarMonthsBetween(
  from: CalendarMonth,
  to: CalendarMonth,
): number {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

/** Every day of a month, in order. */
export function calendarMonthDays(month: CalendarMonth): CalendarDate[] {
  const first = `${month}-01`;
  const days: CalendarDate[] = [];
  for (let day = first; calendarMonthOf(day) === month; ) {
    days.push(day);
    day = addCalendarDays(day, 1);
  }
  return days;
}

/** The same day of the month `months` away, clamped to that month's last day (31 Jan + 1 is 28 Feb). */
export function addCalendarMonthsToDate(
  date: CalendarDate,
  months: number,
): CalendarDate {
  const days = calendarMonthDays(
    addCalendarMonths(calendarMonthOf(date), months),
  );
  return days[Math.min(Number(date.slice(8)), days.length) - 1];
}

/** The weekday's index in `WEEKDAYS`: 0 for Monday to 6 for Sunday. */
export function calendarWeekdayIndex(date: CalendarDate): number {
  return (new Date(utcMidnight(date)).getUTCDay() + 6) % 7;
}

/** Epoch milliseconds at 00:00 UTC on a `YYYY-MM-DD` date. */
function utcMidnight(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** The UTC calendar date of an instant, as `YYYY-MM-DD`. */
function utcCalendarDate(epochMs: number): CalendarDate {
  return new Date(epochMs).toISOString().slice(0, 10);
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const shortDateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE,
  day: "numeric",
  month: "short",
});

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/*
 * The time-format convention (CLAUDE.md "Time formats"): a day reads
 * "Wed 14 Oct" and a moment "Wed 14 Oct, 20:30", each with the year added
 * only when it is not the current London year. Relative times ("4 min ago")
 * are for the age of our data, never for when a Match was played.
 */

/** A day: "Wed 14 Oct" this year, "Tue 14 Oct 2025" in any other. */
export function formatLondonDate(date: Date, now: Date = new Date()): string {
  const day = dateFormat.format(date).replace(",", "");
  const { year } = londonParts(date);
  return year === londonParts(now).year ? day : `${day} ${year}`;
}

/** A moment, such as a Match's kick-off: "Wed 14 Oct, 20:30". */
export function formatLondonDateTime(
  date: Date,
  now: Date = new Date(),
): string {
  return `${formatLondonDate(date, now)}, ${formatLondonTime(date)}`;
}

/** "20:30", only under a heading that already names the day. */
export function formatLondonTime(date: Date): string {
  return timeFormat.format(date);
}

/** "20:05–21:40", one time when both are the same minute: a Session under its day. */
export function formatLondonTimeSpan(start: Date, end: Date): string {
  const first = formatLondonTime(start);
  const last = formatLondonTime(end);
  return first === last ? first : `${first}–${last}`;
}

/** "14 Oct", only where space is tightest: chart axes and the date-range chip. */
export function formatLondonShortDate(date: Date): string {
  return shortDateFormat.format(date);
}

/**
 * A range of calendar days, as the FilterBar's date trigger shows it:
 * "5 Oct – 12 Oct", or "12 Oct" for one day. Like every day, the year is
 * added only outside the current London year ("5 Oct – 12 Oct 2025"), and
 * a range across New Year names both ("20 Dec 2025 – 5 Jan 2026").
 */
export function formatCalendarRange(
  from: CalendarDate,
  to: CalendarDate,
  now: Date = new Date(),
): string {
  const short = (date: CalendarDate) =>
    formatLondonShortDate(londonDayStart(date));
  const [fromYear, toYear] = [from.slice(0, 4), to.slice(0, 4)];
  if (fromYear !== toYear) {
    return `${short(from)} ${fromYear} – ${short(to)} ${toYear}`;
  }
  const range = from === to ? short(from) : `${short(from)} – ${short(to)}`;
  return Number(toYear) === londonParts(now).year
    ? range
    : `${range} ${toYear}`;
}

const monthFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE,
  month: "long",
  year: "numeric",
});

const longDayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** A calendar heading: "October 2026". */
export function formatCalendarMonth(month: CalendarMonth): string {
  return monthFormat.format(londonDayStart(`${month}-01`));
}

/** A day in full, for screen readers: "Saturday 3 October 2026". */
export function formatCalendarDay(date: CalendarDate): string {
  return longDayFormat.format(londonDayStart(date)).replace(",", "");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
