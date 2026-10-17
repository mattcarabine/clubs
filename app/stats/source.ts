/**
 * Where a page's Squad Member stats come from (CLUBS-19): our Recorded
 * Appearances, which the `StatsFilter` narrows, or EA's own totals from the
 * latest member Snapshots, which it cannot. Lives in the URL next to the
 * filter, so a view can be shared:
 *
 *   ?source=ea
 *
 * The default (Recorded) is left out of the URL. `FilterBar` shows the toggle
 * when a page passes it a `source`.
 */
import { withoutPage } from "./filter";

export const STATS_SOURCES = ["recorded", "ea"] as const;
export type StatsSource = (typeof STATS_SOURCES)[number];

export const DEFAULT_STATS_SOURCE: StatsSource = "recorded";

export const STATS_SOURCE_LABEL: Record<StatsSource, string> = {
  recorded: "Recorded",
  ea: "EA totals",
};

export const STATS_SOURCE_PARAM = "source";

/** The source in `params`; anything missing or unknown is Recorded. */
export function parseStatsSource(params: URLSearchParams): StatsSource {
  const raw = params.get(STATS_SOURCE_PARAM);
  return (STATS_SOURCES as readonly string[]).includes(raw ?? "")
    ? (raw as StatsSource)
    : DEFAULT_STATS_SOURCE;
}

/** The source for a loader's request. */
export function statsSourceFromRequest(request: Request): StatsSource {
  return parseStatsSource(new URL(request.url).searchParams);
}

/**
 * A copy of `params` with the source written in (omitted when Recorded). The
 * filter params are kept, so switching back restores the same filter, and the
 * page number is reset.
 */
export function writeStatsSource(
  params: URLSearchParams,
  source: StatsSource,
): URLSearchParams {
  const next = withoutPage(params);
  if (source === DEFAULT_STATS_SOURCE) next.delete(STATS_SOURCE_PARAM);
  else next.set(STATS_SOURCE_PARAM, source);
  return next;
}
