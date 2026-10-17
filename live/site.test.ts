/**
 * Live site: production serves Matchday, private, with a recent Poll. Run
 * with `pnpm test:live`; set LIVE_SITE_URL to check another deployment.
 */
import { describe, expect, it } from "vitest";

import { STALE_AFTER_MINUTES } from "../app/lib/relative-time.ts";

const SITE_URL = process.env.LIVE_SITE_URL ?? "https://clubs.marabine.co.uk";

/** The LastUpdatedBadge renders `Updated <time dateTime="…">`. */
const LAST_UPDATED = /Updated(?:<!-- -->)?\s*<time dateTime="([^"]+)"/;

describe("live site", () => {
  it("serves Matchday with a recent last-updated time", async () => {
    const response = await fetch(SITE_URL);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");

    const html = await response.text();
    expect(html).toContain("<title>A Bloo Bloo — Matchday</title>");

    const updated = html.match(LAST_UPDATED)?.[1];
    if (!updated) {
      expect.fail(
        `${SITE_URL} has no "Updated" badge: no Poll has succeeded, or the badge markup changed.`,
      );
    }
    const ageMinutes = (Date.now() - Date.parse(updated)) / 60_000;
    expect(
      ageMinutes,
      `The last successful Poll was ${Math.round(ageMinutes)} minutes ago (${updated}); the cron may be failing.`,
    ).toBeLessThanOrEqual(STALE_AFTER_MINUTES);
  });
});
