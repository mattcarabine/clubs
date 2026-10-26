/**
 * The home relay in E2E (docs/adr/0007): the same `runRelayOnce` as
 * `pnpm relay`, but fetching from the fake EA upstream with plain `fetch`
 * (`collectPoll`'s default) instead of Chrome, and posting to this run's
 * app with a dummy token.
 */
import { type RelaySummary, runRelayOnce } from "../../app/poll/relay.ts";
import { APP_URL, FAKE_EA_BASE_URL } from "./ports.ts";

/** The `RELAY_TOKEN` the E2E server runs with. */
export const E2E_RELAY_TOKEN = "e2e-relay-token";

export function runTestRelay(): Promise<RelaySummary> {
  return runRelayOnce({
    siteUrl: APP_URL,
    token: E2E_RELAY_TOKEN,
    eaBaseUrl: FAKE_EA_BASE_URL,
  });
}
