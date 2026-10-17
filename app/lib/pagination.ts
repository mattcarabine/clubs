/**
 * Page numbers in the URL (`?page=2`). Page 1 is the default and is left out
 * of the URL. `writeStatsFilter` drops `page` whenever the filter changes.
 */

export const PAGE_PARAM = "page";

/** The 1-based page in `params`; anything missing or invalid is page 1. */
export function parsePage(params: URLSearchParams): number {
  const raw = params.get(PAGE_PARAM);
  if (raw === null || !/^\d+$/.test(raw)) return 1;
  return Math.max(1, Number(raw));
}

/** How many pages `total` rows fill; at least 1, so an empty list still has a page. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** A copy of `params` pointing at `page`, keeping every other param. */
export function withPage(
  params: URLSearchParams,
  page: number,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (page <= 1) next.delete(PAGE_PARAM);
  else next.set(PAGE_PARAM, String(page));
  return next;
}
