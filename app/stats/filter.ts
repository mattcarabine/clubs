/**
 * The global stats filter: which Matches every stat on a page counts. It
 * lives in the URL so a filtered view can be shared and survives a reload.
 *
 *   ?types=league&dnf=0&range=30d&season=2
 *   ?from=2026-10-05&to=2026-10-12
 *   ?positions=all
 *   ?campaign=current|previous|3
 *
 * Defaults (Competitive Matches, DNF included, all dates, all Seasons, no
 * Campaign, main position only) are left out of the URL, so an unfiltered page has a clean
 * address.
 *
 * Adding a dimension: add a field to `StatsFilter` and `DEFAULT_STATS_FILTER`,
 * read it in `parseStatsFilter`, write it in `writeStatsFilter`, turn it into
 * SQL in `scope.ts`, and add a control to `FilterBar`. A dimension that needs
 * data the URL can't carry (a Campaign's kick-offs) is filled in by
 * `resolveStatsFilter`, which every loader calls.
 */
import type { MatchType } from "~/lib/domain";
import {
  addCalendarDays,
  type CalendarDate,
  formatCalendarRange,
  isCalendarRange,
  londonDateKey,
  londonDayStart,
} from "~/lib/london-time";

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
  "1y": "Last 12 months",
};

/** How many London calendar days, today included, each preset covers. */
const DATE_PRESET_DAYS: Record<DatePreset, number> = {
  "7d": 7,
  "30d": 30,
  "1y": 365,
};

/** Both ends of a range of London calendar days, inclusive. */
export interface CalendarRange {
  from: CalendarDate;
  to: CalendarDate;
}

/**
 * Which dates count: all of them, a relative preset, or a custom range of
 * London calendar days, inclusive at both ends (CLAUDE.md "Date filtering").
 */
export type DateRange =
  | { kind: "all" }
  | { kind: "preset"; preset: DatePreset }
  | ({ kind: "custom" } & CalendarRange);

export const ALL_DATES: DateRange = { kind: "all" };

export const ALL_DATES_LABEL = "All dates";

/** The days a preset covers when `today` is the London date: it and the days before it. */
export function presetRange(
  preset: DatePreset,
  today: CalendarDate,
): CalendarRange {
  return {
    from: addCalendarDays(today, 1 - DATE_PRESET_DAYS[preset]),
    to: today,
  };
}

/** How the FilterBar names a range: "All dates", "Last 30 days" or "5 Oct – 12 Oct". */
export function dateRangeLabel(range: DateRange, now = new Date()): string {
  switch (range.kind) {
    case "all":
      return ALL_DATES_LABEL;
    case "preset":
      return DATE_PRESET_LABEL[range.preset];
    case "custom":
      return formatCalendarRange(range.from, range.to, now);
  }
}

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
      const { from } = presetRange(range.preset, londonDateKey(now));
      return { start: londonDayStart(from) };
    }
    case "custom":
      return {
        start: londonDayStart(range.from),
        end: londonDayStart(addCalendarDays(range.to, 1)),
      };
  }
}

/**
 * `?campaign=`: the current Campaign, the one before it, or one by its
 * number (1 is the first tracked, as `findCampaign` counts them).
 */
export type CampaignRef = "current" | "previous" | number;

export const CAMPAIGN_REF_LABEL: Record<"current" | "previous", string> = {
  current: "This Campaign",
  previous: "Last Campaign",
};

/** The kick-offs of a Campaign's first and last Match, both included. */
export interface CampaignKickoffs {
  first: Date;
  last: Date;
}

/**
 * A selected Campaign. The URL only names it; `resolveStatsFilter` (in
 * `campaigns-query.ts`) replays the Campaigns to find its kick-offs, or drops
 * the selection when no such Campaign exists. `matchScope` refuses an
 * unresolved one.
 */
export interface CampaignSelection {
  ref: CampaignRef;
  /** Unset until resolved; null when the Campaign has no Matches yet. */
  kickoffs?: CampaignKickoffs | null;
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
   * Count only each Squad Member's Appearances in their Main Position
   * (CLUBS-82, `positions.ts`). Only player-level stats apply it (Squad,
   * profile, Analysis's Squad members, Compare), through `inMainPosition`;
   * `matchScope` ignores it, since it narrows Appearances, not Matches.
   */
  mainPositionOnly: boolean;
  /**
   * One Campaign's Matches: League only, from its first Match to its last.
   * Absent means no Campaign narrowing.
   */
  campaign?: CampaignSelection;
}

export const DEFAULT_STATS_FILTER: StatsFilter = {
  matchTypes: COMPETITIVE_MATCH_TYPES,
  includeDnf: true,
  dates: ALL_DATES,
  mainPositionOnly: true,
};

/** The URL search params the filter owns. */
export const FILTER_PARAMS = {
  matchTypes: "types",
  includeDnf: "dnf",
  range: "range",
  from: "from",
  to: "to",
  season: "season",
  /** `?positions=all` counts every position; absent means main position only. */
  mainPositionOnly: "positions",
  campaign: "campaign",
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
    mainPositionOnly: params.get(FILTER_PARAMS.mainPositionOnly) !== "all",
    campaign: parseCampaign(params.get(FILTER_PARAMS.campaign)),
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
    FILTER_PARAMS.mainPositionOnly,
    filter.mainPositionOnly ? null : "all",
  );
  setOrDelete(
    next,
    FILTER_PARAMS.campaign,
    filter.campaign === undefined ? null : String(filter.campaign.ref),
  );
  return next;
}

export function isDefaultStatsFilter(filter: StatsFilter): boolean {
  return (
    sameMatchTypes(filter.matchTypes, DEFAULT_STATS_FILTER.matchTypes) &&
    filter.includeDnf === DEFAULT_STATS_FILTER.includeDnf &&
    filter.dates.kind === "all" &&
    filter.season === undefined &&
    filter.mainPositionOnly &&
    filter.campaign === undefined
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
  return parsePositiveInteger(raw);
}

/** `current`, `previous` or a positive Campaign number; anything else means no Campaign. */
function parseCampaign(raw: string | null): CampaignSelection | undefined {
  if (raw === "current" || raw === "previous") return { ref: raw };
  const number = parsePositiveInteger(raw);
  return number === undefined ? undefined : { ref: number };
}

function parsePositiveInteger(raw: string | null): number | undefined {
  return raw !== null && /^[1-9]\d*$/.test(raw) ? Number(raw) : undefined;
}

/**
 * Selects a Campaign, or none. A Campaign counts League Matches only, so
 * selecting one also narrows the Match Types to League, keeping the chips
 * truthful.
 */
export function selectCampaign(
  filter: StatsFilter,
  ref: CampaignRef | undefined,
): StatsFilter {
  if (ref === undefined) return { ...filter, campaign: undefined };
  return { ...filter, matchTypes: ["League"], campaign: { ref } };
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
