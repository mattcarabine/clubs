import { toCrestAssetId } from "./parse.ts";

/**
 * Where EA's CDN serves a club's crest, from its `crestAssetId`. EA publishes
 * no API for this: it is the path EA's own Pro Clubs pages use, so an image
 * that fails to load must leave the club without a mark rather than break.
 */
export const CREST_BASE =
  "https://eafc24.content.easports.com/fifa/fltOnlineAssets/24B23FDE-7835-41C2-87A2-F453DFDB2E82/2024/fcweb/crests/256x256/l";

/** The crest's URL, or null without a well-formed asset ID. */
export function crestUrl(assetId: string | null | undefined): string | null {
  const id = toCrestAssetId(assetId);
  return id ? `${CREST_BASE}${id}.png` : null;
}
