/**
 * A Comparison's URL format (CLUBS-20): which two Squad Members, which
 * Matches ("All matches" or "Played together"), and each side's Position
 * Groups. Lives in the URL next to the filter and source, so a Comparison
 * can be shared:
 *
 *   /compare?players=256171605,380993182&scope=together&posA=midfielder&posB=forward
 *
 * Defaults (All matches, All Positions) are left out of the URL. Client-safe:
 * no queries, so the compare page's controls can import it.
 */
import { parseStatsFilter, withoutPage, writeStatsFilter } from "./filter";
import {
  ALL_POSITIONS,
  type PositionGroupSelection,
  parsePositionGroups,
  writePositionGroups,
} from "./positions";
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
  positionGroups: { A: "posA", B: "posB" },
} as const;

export interface ComparisonParams {
  /** Up to two distinct Squad Member IDs, A first. Not yet checked against the Squad. */
  players: string[];
  scope: ComparisonScope;
  positionGroups: Record<ComparisonSide, PositionGroupSelection>;
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
    positionGroups: {
      A: parsePositionGroups(params.get(COMPARISON_PARAMS.positionGroups.A)),
      B: parsePositionGroups(params.get(COMPARISON_PARAMS.positionGroups.B)),
    },
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

export function writeComparisonPositionGroups(
  params: URLSearchParams,
  side: ComparisonSide,
  groups: PositionGroupSelection,
): URLSearchParams {
  return setOrDelete(
    params,
    COMPARISON_PARAMS.positionGroups[side],
    writePositionGroups(groups),
  );
}

/**
 * The canonical params once the requested players are checked against the
 * Squad, or null when `params` already is. A repeated or unknown ID is
 * dropped, and each kept player brings their Position Groups along, so
 * `players=unknown,B&posB=forward` becomes `players=B&posA=forward`.
 */
export function canonicalComparisonParams(
  params: URLSearchParams,
  requested: ComparisonParams,
  known: readonly string[],
): URLSearchParams | null {
  const kept = requested.players.filter((id) => known.includes(id));
  const raw = params.get(COMPARISON_PARAMS.players);
  if (raw === null || raw === kept.join(",")) return null;
  let next = writeComparisonPlayers(params, kept);
  for (const [i, side] of COMPARISON_SIDES.entries()) {
    const from = COMPARISON_SIDES[requested.players.indexOf(kept[i] ?? "")];
    next = writeComparisonPositionGroups(
      next,
      side,
      from ? requested.positionGroups[from] : [],
    );
  }
  return next;
}

/**
 * The compare page for these Squad Members, opened from a page with the
 * global filter in `from` (the Squad table, a profile). The filter and source
 * carry over; the global Position Group selection becomes each side's.
 */
export function comparePath(
  from: URLSearchParams,
  players: readonly string[],
): string {
  const filter = parseStatsFilter(from);
  let next = writeStatsSource(
    writeStatsFilter(new URLSearchParams(), {
      ...filter,
      positionGroups: ALL_POSITIONS,
    }),
    parseStatsSource(from),
  );
  next = writeComparisonPlayers(next, players);
  players.forEach((_, i) => {
    next = writeComparisonPositionGroups(
      next,
      COMPARISON_SIDES[i],
      filter.positionGroups,
    );
  });
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
