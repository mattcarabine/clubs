/**
 * `pnpm relay [--once]`: the home relay (docs/adr/0007). EA's Akamai answers
 * only a real, windowed Chrome, so this runs on the always-on Mac mini: it
 * keeps one minimised Chrome open and every 5 minutes makes the Poll's
 * requests through it, then sends them to the Worker, which records them as
 * it would its own Poll.
 *
 * Needs Google Chrome installed, a logged-in desktop (the window must exist),
 * and `RELAY_TOKEN` (the Worker secret) from the shell or `.relay.env`;
 * `scripts/relay.sh` loads it. `RELAY_SITE_URL` overrides the site.
 * Never run in CI (docs/adr/0004).
 */
import { type Browser, chromium, errors, type Page } from "@playwright/test";

import { type EaFetcher, toEaResponse } from "../app/ea/client.ts";
import { requestUrl } from "../app/ea/endpoints.ts";
import { SITE_URL } from "../app/lib/site.ts";
import { runRelayOnce } from "../app/poll/relay.ts";
import { LIVE_EA_BASE_URL, LIVE_EA_TIMEOUT_MS } from "./live-ea.ts";

/** The cron's cadence (docs/adr/0002). */
const INTERVAL_MS = 5 * 60 * 1000;
/** Poll a minute before each cron run, so its write-ups and posts see the new Matches. */
const AHEAD_OF_CRON_MS = 60 * 1000;

const token = process.env.RELAY_TOKEN;
if (!token) {
  console.error("relay needs RELAY_TOKEN, in the environment or .relay.env");
  process.exit(1);
}
const siteUrl = process.env.RELAY_SITE_URL ?? SITE_URL;

/** The one Chrome every Poll shares, so it takes focus only when it opens. */
let chrome: { browser: Browser; page: Page } | undefined;

if (process.argv.includes("--once")) {
  process.exitCode = (await pollOnce()) ? 0 : 1;
  await closeChrome();
} else {
  for (;;) {
    await pollOnce();
    const sinceSlot = (Date.now() + AHEAD_OF_CRON_MS) % INTERVAL_MS;
    await sleep(INTERVAL_MS - sinceSlot);
  }
}

/** One Poll; logs one line and never throws. */
async function pollOnce(): Promise<boolean> {
  const startedAt = Date.now();
  try {
    const summary = await runRelayOnce({
      siteUrl,
      token: token as string,
      eaBaseUrl: LIVE_EA_BASE_URL,
      fetcher: browserFetcher(await openChrome()),
    });
    log({ ...summary, durationMs: Date.now() - startedAt });
    // A fresh Chrome next time, in case this one's session is what EA refused.
    if (summary.status === "failed") await closeChrome();
    return summary.status !== "failed";
  } catch (error) {
    log({ status: "error", error: String(error) });
    await closeChrome();
    return false;
  }
}

/** The shared Chrome, opened and minimised on first use or after it closed. */
async function openChrome(): Promise<Page> {
  if (chrome?.browser.isConnected()) return chrome.page;
  // Headless Chrome and Playwright's own Chromium are both refused
  // (ERR_HTTP2_PROTOCOL_ERROR); a windowed Chrome is not, even minimised
  // (2026-10-26).
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  const page = await browser.newPage();
  const cdp = await page.context().newCDPSession(page);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", {
    windowId,
    bounds: { windowState: "minimized" },
  });
  chrome = { browser, page };
  return page;
}

async function closeChrome(): Promise<void> {
  await chrome?.browser.close().catch(() => {});
  chrome = undefined;
}

/** Fetches each EA request by loading its URL in the page, as a person's browser would. */
function browserFetcher(page: Page): EaFetcher {
  return async (request) => {
    try {
      // "commit": a minimised window may never fire `load`, and the body
      // is all we need.
      const response = await page.goto(requestUrl(LIVE_EA_BASE_URL, request), {
        waitUntil: "commit",
        timeout: LIVE_EA_TIMEOUT_MS,
      });
      if (!response) {
        return {
          ok: false,
          status: null,
          kind: "network",
          error: "No response",
        };
      }
      return toEaResponse(response.status(), await response.text());
    } catch (error) {
      return error instanceof errors.TimeoutError
        ? {
            ok: false,
            status: null,
            kind: "timeout",
            error: `No response within ${LIVE_EA_TIMEOUT_MS} ms`,
          }
        : { ok: false, status: null, kind: "network", error: String(error) };
    }
  };
}

function log(fields: Record<string, unknown>): void {
  console.log(
    JSON.stringify({ at: new Date().toISOString(), event: "relay", ...fields }),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
