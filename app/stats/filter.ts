/**
 * The global stats filter: which Matches every stat on a page counts. It
 * lives in the URL so a filtered view can be shared and survives a reload.
 *
 *   ?types=league,friendly&dnf=0&range=30d
 *
 * Defaults (Competitive Matches, DNF included, all dates) are left out of the
 * URL, so an unfiltered page has a clean address.
 *
 * Adding a dimension (CLUBS-14 adds Season): add a field to `StatsFilter` and
 * `DEFAULT_STATS_FILTER`, read it in `parseStatsFilter`, write it in
 * `writeStatsFilter`, turn it into SQL in `scope.ts`, and add a control to
 * `FilterBar`.
 */
import type { MatchType } from "~/lib/domain";

export const MATCH_TYPES = [
  "League",
  "Playoff",
  "Friendly",
] as const satisfies readonly MatchType[];

/** League and Playoff: the default scope for all stats (CONTEXT.md). */
export const COMPETITIVE_MATCH_TYPES: readonly MatchType[] = [
  "League",
  "Playoff",
];

export const DATE_RANGES = ["all", "last10", "30d"] as const;
/** All Matches, the last 10 Matches, or Matches in the last 30 days. */
export type DateRange = (typeof DATE_RANGES)[number];

export const DATE_RANGE_LABEL: Record<DateRange, string> = {
  all: "All",
  last10: "Last 10",
  "30d": "Last 30 days",
};

export interface StatsFilter {
  /** Never empty; always in `MATCH_TYPES` order. */
  matchTypes: readonly MatchType[];
  /** DNF Matches count by default; pages still flag them. */
  includeDnf: boolean;
  range: DateRange;
}

export const DEFAULT_STATS_FILTER: StatsFilter = {
  matchTypes: COMPETITIVE_MATCH_TYPES,
  includeDnf: true,
  range: "all",
};

/** Leaderboards hide Squad Members with fewer Appearances than this. */
export const DEFAULT_MIN_APPEARANCES = 3;

/** The URL search params the filter owns. */
export const FILTER_PARAMS = {
  matchTypes: "types",
  includeDnf: "dnf",
  range: "range",
  minAppearances: "minApps",
} as const;

/** Reset whenever the filter changes, since the old page may no longer exist. */
const PAGE_PARAM = "page";

/** Reads the filter from search params; anything missing or invalid falls back to the default. */
export function parseStatsFilter(params: URLSearchParams): StatsFilter {
  return {
    matchTypes: parseMatchTypes(params.get(FILTER_PARAMS.matchTypes)),
    includeDnf: params.get(FILTER_PARAMS.includeDnf) !== "0",
    range: parseRange(params.get(FILTER_PARAMS.range)),
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
  setOrDelete(
    next,
    FILTER_PARAMS.range,
    filter.range === DEFAULT_STATS_FILTER.range ? null : filter.range,
  );
  return next;
}

export function isDefaultStatsFilter(filter: StatsFilter): boolean {
  return (
    sameMatchTypes(filter.matchTypes, DEFAULT_STATS_FILTER.matchTypes) &&
    filter.includeDnf === DEFAULT_STATS_FILTER.includeDnf &&
    filter.range === DEFAULT_STATS_FILTER.range
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

/** The leaderboard minimum; a missing, negative or non-integer value gives the default. */
export function parseMinAppearances(params: URLSearchParams): number {
  const raw = params.get(FILTER_PARAMS.minAppearances);
  if (raw === null || !/^\d+$/.test(raw)) return DEFAULT_MIN_APPEARANCES;
  return Number(raw);
}

/** A copy of `params` with the leaderboard minimum written in (omitted when default). */
export function writeMinAppearances(
  params: URLSearchParams,
  minAppearances: number,
): URLSearchParams {
  const next = withoutPage(params);
  setOrDelete(
    next,
    FILTER_PARAMS.minAppearances,
    minAppearances === DEFAULT_MIN_APPEARANCES
      ? null
      : String(Math.max(0, Math.floor(minAppearances))),
  );
  return next;
}

function parseMatchTypes(raw: string | null): readonly MatchType[] {
  if (raw === null) return DEFAULT_STATS_FILTER.matchTypes;
  const wanted = new Set(raw.toLowerCase().split(","));
  const types = MATCH_TYPES.filter((type) => wanted.has(type.toLowerCase()));
  return types.length ? types : DEFAULT_STATS_FILTER.matchTypes;
}

function parseRange(raw: string | null): DateRange {
  return (DATE_RANGES as readonly string[]).includes(raw ?? "")
    ? (raw as DateRange)
    : DEFAULT_STATS_FILTER.range;
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
function withoutPage(params: URLSearchParams): URLSearchParams {
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
