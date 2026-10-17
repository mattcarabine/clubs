/**
 * Live EA settings for the Node scripts that call EA directly: the fixture
 * recorder and `pnpm test:live`. The Worker reads the same values from its
 * Wrangler vars instead. Never used in CI (docs/adr/0004).
 */
import type { ClubRef } from "../app/ea/endpoints.ts";

export const LIVE_EA_BASE_URL = "https://proclubs.ea.com/api/fc/";

/** EA can be slow from a home connection; the Poll's 10s is tuned for Cloudflare. */
export const LIVE_EA_TIMEOUT_MS = 25_000;

export const OUR_CLUB: ClubRef = {
  platform: "common-gen5",
  clubId: "332191",
  clubName: "A Bloo Bloo",
};
