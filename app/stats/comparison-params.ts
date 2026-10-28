/**
 * A Comparison's URL format (CLUBS-20): which two Squad Members and which
 * Matches ("All matches" or "Played together"). Lives in the URL next to the
 * filter (whose "Main position only" applies to both sides) and source, so a
 * Comparison can be shared:
 *
 *   /compare?players=256171605,380993182&scope=together
 *
 * The default (All matches) is left out of the URL. Client-safe:
 * no queries, so the compare page's controls can import it.
 */
import { parseStatsFilter, withoutPage, writeStatsFilter } from "./filter";
import { parseStatsSource, writeStatsSource } from "./source";

/** The two sides of a Comparison: A on the left, B on the right. */
export const COMPARISON_SIDES = ["A", "B"] as const;
export type ComparisonSide = (typeof COMPARISON_SIDES)[number];

export const COMPARISON_SCOPES = ["all", "together"] as const;
/** Every Match each Squad Member played, or only their Shared Matches. */
export type ComparisonScope = (typeof COMPARISON_SCOPES)[number];

export const COMPARISON_SCOPE_LABEL: Record<ComparisonScope, string> = {
  all: "All matches",
  together: "Played together",
};

export const COMPARISON_PARAMS = {
  players: "players",
  scope: "scope",
} as const;

export interface ComparisonParams {
  /** Up to two distinct Squad Member IDs, A first. Not yet checked against the Squad. */
  players: string[];
  scope: ComparisonScope;
}

/** The Comparison in `params`; anything missing or invalid takes its default. */
export function parseComparisonParams(
  params: URLSearchParams,
): ComparisonParams {
  const ids = (params.get(COMPARISON_PARAMS.players) ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return {
    players: [...new Set(ids)].slice(0, COMPARISON_SIDES.length),
    scope:
      params.get(COMPARISON_PARAMS.scope) === "together" ? "together" : "all",
  };
}

/** A copy of `params` comparing these Squad Members (none removes the param). */
export function writeComparisonPlayers(
  params: URLSearchParams,
  players: readonly string[],
): URLSearchParams {
  return setOrDelete(
    params,
    COMPARISON_PARAMS.players,
    players.length ? players.join(",") : null,
  );
}

export function writeComparisonScope(
  params: URLSearchParams,
  scope: ComparisonScope,
): URLSearchParams {
  return setOrDelete(
    params,
    COMPARISON_PARAMS.scope,
    scope === "all" ? null : scope,
  );
}

/**
 * The canonical params once the requested players are checked against the
 * Squad, or null when `params` already is. A repeated or unknown ID is
 * dropped, so `players=unknown,B` becomes `players=B`.
 */
export function canonicalComparisonParams(
  params: URLSearchParams,
  requested: ComparisonParams,
  known: readonly string[],
): URLSearchParams | null {
  const kept = requested.players.filter((id) => known.includes(id));
  const raw = params.get(COMPARISON_PARAMS.players);
  if (raw === null || raw === kept.join(",")) return null;
  return writeComparisonPlayers(params, kept);
}

/**
 * The compare page for these Squad Members, opened from a page with the
 * global filter in `from` (the Squad table, a profile). The filter, "Main
 * position only" included, and the source carry over.
 */
export function comparePath(
  from: URLSearchParams,
  players: readonly string[],
): string {
  const next = writeComparisonPlayers(
    writeStatsSource(
      writeStatsFilter(new URLSearchParams(), parseStatsFilter(from)),
      parseStatsSource(from),
    ),
    players,
  );
  const search = next.toString();
  // Keep the commas readable in the address bar.
  return `/compare${search ? `?${search.replaceAll("%2C", ",")}` : ""}`;
}

function setOrDelete(
  params: URLSearchParams,
  name: string,
  value: string | null,
): URLSearchParams {
  const next = withoutPage(params);
  if (value === null) next.delete(name);
  else next.set(name, value);
  return next;
}
