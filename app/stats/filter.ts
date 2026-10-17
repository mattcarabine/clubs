/**
 * The global stats filter: which Matches every stat on a page counts. It
 * lives in the URL so a filtered view can be shared and survives a reload.
 *
 *   ?types=league&dnf=0&range=30d&season=2
 *   ?from=2026-10-05&to=2026-10-12
 *   ?pos=midfielder,forward
 *
 * Defaults (Competitive Matches, DNF included, all dates, all Seasons) are
 * left out of the URL, so an unfiltered page has a clean address.
 *
 * Adding a dimension: add a field to `StatsFilter` and `DEFAULT_STATS_FILTER`,
 * read it in `parseStatsFilter`, write it in `writeStatsFilter`, turn it into
 * SQL in `scope.ts`, and add a control to `FilterBar`.
 */
import type { MatchType } from "~/lib/domain";
import {
  addCalendarDays,
  type CalendarDate,
  isCalendarRange,
  londonDateKey,
  londonDayStart,
} from "~/lib/london-time";

import {
  ALL_POSITIONS,
  type PositionGroupSelection,
  parsePositionGroups,
  writePositionGroups,
} from "./positions";

/**
 * The Match Types a filter can select: the Competitive ones. Friendlies are
 * never shown, so `?types=friendly` is ignored like any unknown value.
 */
export const MATCH_TYPES = [
  "League",
  "Playoff",
] as const satisfies readonly MatchType[];

/** League and Playoff: the default scope for all stats (CONTEXT.md). */
export const COMPETITIVE_MATCH_TYPES: readonly MatchType[] = MATCH_TYPES;

/**
 * The relative date presets. Each covers today and the days before it, as
 * London calendar days, so a shared `?range=7d` link always means the last
 * 7 days from whenever it is opened.
 */
export const DATE_PRESETS = ["7d", "30d", "1y"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const DATE_PRESET_LABEL: Record<DatePreset, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "1y": "Last year",
};

/** How many London calendar days, today included, each preset covers. */
const DATE_PRESET_DAYS: Record<DatePreset, number> = {
  "7d": 7,
  "30d": 30,
  "1y": 365,
};

/**
 * Which dates count: all of them, a relative preset, or a custom range of
 * London calendar days, inclusive at both ends (CLAUDE.md "Date filtering").
 */
export type DateRange =
  | { kind: "all" }
  | { kind: "preset"; preset: DatePreset }
  | { kind: "custom"; from: CalendarDate; to: CalendarDate };

export const ALL_DATES: DateRange = { kind: "all" };

/** The instants a range covers: `start` inclusive, `end` exclusive; absent means unbounded. */
export interface DateWindow {
  start?: Date;
  end?: Date;
}

/** Turns a range into instants, with presets counted back from `now`'s London date. */
export function dateWindow(range: DateRange, now: Date): DateWindow {
  switch (range.kind) {
    case "all":
      return {};
    case "preset": {
      const today = londonDateKey(now);
      const first = addCalendarDays(today, 1 - DATE_PRESET_DAYS[range.preset]);
      return { start: londonDayStart(first) };
    }
    case "custom":
      return {
        start: londonDayStart(range.from),
        end: londonDayStart(addCalendarDays(range.to, 1)),
      };
  }
}

export interface StatsFilter {
  /** Never empty; always in `MATCH_TYPES` order. */
  matchTypes: readonly MatchType[];
  /** DNF Matches count by default; pages still flag them. */
  includeDnf: boolean;
  dates: DateRange;
  /** One Season's number; absent means all Seasons. */
  season?: number;
  /**
   * Which of a Squad Member's Appearances count, by Position Group; empty
   * means All Positions. Only player-level stats apply it (the Squad table
   * and profile), by passing it to `squadLeaderboard` / `getPlayerProfile`;
   * `matchScope` ignores it, since it narrows Appearances, not Matches.
   */
  positionGroups: PositionGroupSelection;
}

export const DEFAULT_STATS_FILTER: StatsFilter = {
  matchTypes: COMPETITIVE_MATCH_TYPES,
  includeDnf: true,
  dates: ALL_DATES,
  positionGroups: ALL_POSITIONS,
};

/** The URL search params the filter owns. */
export const FILTER_PARAMS = {
  matchTypes: "types",
  includeDnf: "dnf",
  range: "range",
  from: "from",
  to: "to",
  season: "season",
  positionGroups: "pos",
} as const;

/** Reset whenever the filter changes, since the old page may no longer exist. */
const PAGE_PARAM = "page";

/** Reads the filter from search params; anything missing or invalid falls back to the default. */
export function parseStatsFilter(params: URLSearchParams): StatsFilter {
  return {
    matchTypes: parseMatchTypes(params.get(FILTER_PARAMS.matchTypes)),
    includeDnf: params.get(FILTER_PARAMS.includeDnf) !== "0",
    dates: parseDates(params),
    season: parseSeason(params.get(FILTER_PARAMS.season)),
    positionGroups: parsePositionGroups(
      params.get(FILTER_PARAMS.positionGroups),
    ),
  };
}

/** The filter for a loader's request. */
export function statsFilterFromRequest(request: Request): StatsFilter {
  return parseStatsFilter(new URL(request.url).searchParams);
}

/**
 * A copy of `params` with the filter written in: default values are removed,
 * unrelated params (sort order, tabs) are kept, and the page number is reset.
 */
export function writeStatsFilter(
  params: URLSearchParams,
  filter: StatsFilter,
): URLSearchParams {
  const next = withoutPage(params);
  setOrDelete(
    next,
    FILTER_PARAMS.matchTypes,
    writeMatchTypes(filter.matchTypes),
  );
  setOrDelete(next, FILTER_PARAMS.includeDnf, filter.includeDnf ? null : "0");
  const { dates } = filter;
  setOrDelete(
    next,
    FILTER_PARAMS.range,
    dates.kind === "preset" ? dates.preset : null,
  );
  setOrDelete(
    next,
    FILTER_PARAMS.from,
    dates.kind === "custom" ? dates.from : null,
  );
  setOrDelete(
    next,
    FILTER_PARAMS.to,
    dates.kind === "custom" ? dates.to : null,
  );
  setOrDelete(
    next,
    FILTER_PARAMS.season,
    filter.season === undefined ? null : String(filter.season),
  );
  setOrDelete(
    next,
    FILTER_PARAMS.positionGroups,
    writePositionGroups(filter.positionGroups),
  );
  return next;
}

export function isDefaultStatsFilter(filter: StatsFilter): boolean {
  return (
    sameMatchTypes(filter.matchTypes, DEFAULT_STATS_FILTER.matchTypes) &&
    filter.includeDnf === DEFAULT_STATS_FILTER.includeDnf &&
    filter.dates.kind === "all" &&
    filter.season === undefined &&
    filter.positionGroups.length === 0
  );
}

/** Adds or removes one Match Type, keeping at least one selected. */
export function toggleMatchType(
  filter: StatsFilter,
  type: MatchType,
): StatsFilter {
  const selected = filter.matchTypes.includes(type)
    ? filter.matchTypes.filter((t) => t !== type)
    : [...filter.matchTypes, type];
  return selected.length
    ? { ...filter, matchTypes: canonicalMatchTypes(selected) }
    : filter;
}

function parseMatchTypes(raw: string | null): readonly MatchType[] {
  if (raw === null) return DEFAULT_STATS_FILTER.matchTypes;
  const wanted = new Set(raw.toLowerCase().split(","));
  const types = MATCH_TYPES.filter((type) => wanted.has(type.toLowerCase()));
  return types.length ? types : DEFAULT_STATS_FILTER.matchTypes;
}

/**
 * A preset from `range`, else a custom range from `from` and `to`. Anything
 * invalid (an unknown preset, a malformed or missing date, `from` after `to`)
 * falls back to all dates.
 */
function parseDates(params: URLSearchParams): DateRange {
  const preset = params.get(FILTER_PARAMS.range);
  if ((DATE_PRESETS as readonly (string | null)[]).includes(preset)) {
    return { kind: "preset", preset: preset as DatePreset };
  }
  const from = params.get(FILTER_PARAMS.from) ?? "";
  const to = params.get(FILTER_PARAMS.to) ?? "";
  return isCalendarRange(from, to) ? { kind: "custom", from, to } : ALL_DATES;
}

/** A positive Season number, or undefined (all Seasons) for anything else. */
function parseSeason(raw: string | null): number | undefined {
  return raw !== null && /^[1-9]\d*$/.test(raw) ? Number(raw) : undefined;
}

/** The `types` param value, or null for the default Match Types. */
function writeMatchTypes(types: readonly MatchType[]): string | null {
  if (sameMatchTypes(types, DEFAULT_STATS_FILTER.matchTypes)) return null;
  return canonicalMatchTypes(types)
    .map((type) => type.toLowerCase())
    .join(",");
}

function canonicalMatchTypes(types: readonly MatchType[]): MatchType[] {
  return MATCH_TYPES.filter((type) => types.includes(type));
}

function sameMatchTypes(
  a: readonly MatchType[],
  b: readonly MatchType[],
): boolean {
  return a.length === b.length && a.every((type) => b.includes(type));
}

/** A copy of `params` without the page number, which a filter change resets. */
export function withoutPage(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(PAGE_PARAM);
  return next;
}

function setOrDelete(
  params: URLSearchParams,
  key: string,
  value: string | null,
): void {
  if (value === null) params.delete(key);
  else params.set(key, value);
}
