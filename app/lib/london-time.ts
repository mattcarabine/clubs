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

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
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

/** "Tue 14 Oct 2026" */
export function formatLondonDate(date: Date): string {
  return dateFormat.format(date).replace(",", "");
}

/** "14 Oct", for chart axes and compact lists. */
export function formatLondonShortDate(date: Date): string {
  return shortDateFormat.format(date);
}

/** "20:30" */
export function formatLondonTime(date: Date): string {
  return timeFormat.format(date);
}

/** "Tue 14 Oct 2026, 20:30" */
export function formatLondonDateTime(date: Date): string {
  return `${formatLondonDate(date)}, ${formatLondonTime(date)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
