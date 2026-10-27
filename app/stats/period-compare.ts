/**
 * Analysis's "Compare to" (CLUBS-60, ADR 0008): the filtered Matches against
 * an earlier period. A date range compares with the same number of London
 * calendar days just before it; a Season with another Season. A selected
 * Campaign never compares, since each Division plays at a different level,
 * and "All dates" has nothing before it.
 *
 * Pure and client-safe: the loader picks the earlier filter here, runs it,
 * and pairs the two sides' figures and Win % buckets with the helpers below.
 */
import {
  addCalendarDays,
  type CalendarDate,
  calendarDaysBetween,
  formatCalendarRange,
} from "~/lib/london-time";
import { formatCount } from "~/lib/number-format";

import {
  type CalendarRange,
  type DateRange,
  presetRange,
  type StatsFilter,
} from "./filter";
import { SMALL_SAMPLE_MATCHES } from "./outcome-split";
import type { ChangeDirection } from "./recent-change";
import type { RecordSummary } from "./summaries";
import type { SplitBucket } from "./trends";

/** `?vs=prev` compares a date range with the one before it; `?vs=2` with Season 2. */
export const COMPARE_PARAM = "vs";
const PREVIOUS = "prev";

/** What `?vs=` asks for, before checking it against the filter. */
export type CompareRequest = "previous" | number | null;

export function parseCompareRequest(params: URLSearchParams): CompareRequest {
  const raw = params.get(COMPARE_PARAM);
  if (raw === PREVIOUS) return "previous";
  if (raw !== null && /^[1-9]\d*$/.test(raw)) return Number(raw);
  return null;
}

/** The `?vs=` value for a request; null removes it. */
export function writeCompareRequest(request: CompareRequest): string | null {
  if (request === null) return null;
  return request === "previous" ? PREVIOUS : String(request);
}

/** How the filter's Matches can be compared, if at all. */
export type CompareOptions =
  | {
      kind: "period";
      /** The filter's own days and the same number just before them. */
      current: CalendarRange;
      previous: CalendarRange;
    }
  | {
      kind: "season";
      season: number;
      /** The other recorded Seasons, oldest first. */
      others: number[];
      /** The Season before, or the nearest other one. */
      fallback: number;
    };

/**
 * The N calendar days just before `range`, where N is its length: the last 7
 * days compare with the 7 before them, never with a year earlier.
 */
export function previousRange(range: CalendarRange): CalendarRange {
  const days = calendarDaysBetween(range.from, range.to) + 1;
  return {
    from: addCalendarDays(range.from, -days),
    to: addCalendarDays(range.from, -1),
  };
}

/** The calendar days a filter's date range covers, or null for "All dates". */
function calendarRangeOf(
  dates: DateRange,
  today: CalendarDate,
): CalendarRange | null {
  switch (dates.kind) {
    case "all":
      return null;
    case "preset":
      return presetRange(dates.preset, today);
    case "custom":
      return { from: dates.from, to: dates.to };
  }
}

/**
 * How `filter` can be compared. A date range takes precedence over a Season,
 * since the days are the narrower choice; a Campaign rules comparing out.
 */
export function compareOptions(
  filter: StatsFilter,
  seasons: readonly number[],
  today: CalendarDate,
): CompareOptions | null {
  if (filter.campaign) return null;
  const current = calendarRangeOf(filter.dates, today);
  if (current) {
    return { kind: "period", current, previous: previousRange(current) };
  }
  const { season } = filter;
  if (season === undefined) return null;
  const others = seasons.filter((n) => n !== season);
  if (others.length === 0) return null;
  const earlier = others.filter((n) => n < season);
  return {
    kind: "season",
    season,
    others,
    fallback: earlier.at(-1) ?? others[0],
  };
}

/** The earlier side of a comparison: its filter and how to name it. */
export interface CompareSide {
  filter: StatsFilter;
  /** "The 7 days before" / "Season 1". */
  label: string;
  /** The `?vs=` value that selects it. */
  request: CompareRequest;
}

/**
 * The filter to compare `filter` with, when `request` asks for a comparison
 * the options allow. Anything else (a stale `?vs=`, a Season not recorded)
 * means no comparison, never an error.
 */
export function compareSide(
  filter: StatsFilter,
  options: CompareOptions | null,
  request: CompareRequest,
  now: Date,
): CompareSide | null {
  if (!options || request === null) return null;
  if (options.kind === "period") {
    if (request !== "previous") return null;
    const { previous } = options;
    return {
      filter: { ...filter, dates: { kind: "custom", ...previous } },
      label: `${formatCount(calendarDaysBetween(previous.from, previous.to) + 1, "day", "days")} before (${formatCalendarRange(previous.from, previous.to, now)})`,
      request,
    };
  }
  if (request === "previous" || !options.others.includes(request)) return null;
  return {
    filter: { ...filter, season: request },
    label: `Season ${request}`,
    request,
  };
}

/** One headline figure for both sides. */
export interface ComparedFigure {
  id: "win" | "for" | "against" | "dropped";
  label: string;
  current: number | null;
  previous: number | null;
  /** current minus previous; null when either side has no value. */
  change: number | null;
  /** Up or down; null for no change or no value. */
  direction: ChangeDirection | null;
  /** Whether the change is good for us. */
  good: boolean | null;
  /** "Win %" in points, the rest per Match. */
  unit: "pts" | "per Match";
}

function perMatch(total: number, played: number): number | null {
  return played === 0 ? null : total / played;
}

function percentage(count: number, played: number): number | null {
  return played === 0 ? null : (count / played) * 100;
}

/** Win %, goals for and against per Match, and the share of Dropped Points, for both sides. */
export function compareFigures(
  current: RecordSummary,
  previous: RecordSummary,
): ComparedFigure[] {
  const figure = (
    id: ComparedFigure["id"],
    label: string,
    unit: ComparedFigure["unit"],
    higherIsBetter: boolean,
    value: (r: RecordSummary) => number | null,
  ): ComparedFigure => {
    const now = value(current);
    const before = value(previous);
    const change = now === null || before === null ? null : now - before;
    const direction =
      change === null || change === 0 ? null : change > 0 ? "up" : "down";
    return {
      id,
      label,
      current: now,
      previous: before,
      change,
      direction,
      good: direction === null ? null : (direction === "up") === higherIsBetter,
      unit,
    };
  };
  return [
    figure("win", "Win %", "pts", true, (r) => percentage(r.wins, r.played)),
    figure("for", "Goals scored", "per Match", true, (r) =>
      perMatch(r.goalsFor, r.played),
    ),
    figure("against", "Goals conceded", "per Match", false, (r) =>
      perMatch(r.goalsAgainst, r.played),
    ),
    figure("dropped", "Dropped Points", "pts", false, (r) =>
      percentage(r.draws + r.losses, r.played),
    ),
  ];
}

/** One bucket (a day, a kick-off time) with both sides' Win %. */
export interface ComparedBucket {
  label: string;
  current: SplitBucket | null;
  previous: SplitBucket | null;
  /** Either side rests on fewer than `SMALL_SAMPLE_MATCHES`. */
  smallSample: boolean;
}

/**
 * Pairs two sides' buckets by label, in `order` (every label either side
 * has), so a day played in only one period still shows, empty on the other.
 */
export function pairBuckets(
  current: readonly SplitBucket[],
  previous: readonly SplitBucket[],
  order: readonly string[],
): ComparedBucket[] {
  const find = (side: readonly SplitBucket[], label: string) =>
    side.find((b) => b.label === label) ?? null;
  return order.flatMap((label) => {
    const now = find(current, label);
    const before = find(previous, label);
    if (!now && !before) return [];
    return [
      {
        label,
        current: now,
        previous: before,
        smallSample:
          (now?.played ?? 0) < SMALL_SAMPLE_MATCHES ||
          (before?.played ?? 0) < SMALL_SAMPLE_MATCHES,
      },
    ];
  });
}
