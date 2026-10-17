import type { EaEndpoint } from "../../app/ea/endpoints.ts";
import {
  type AddMatchBody,
  CONTROL_PREFIX,
  type RecordedRequest,
} from "../fake-ea/control.ts";
import { FAKE_EA_URL } from "./ports.ts";

/** Drives the fake EA upstream's control API from a test. */
export const fakeEa = {
  /** Back to the recorded fixtures, with no queued failures or logged requests. */
  reset: () => post("reset"),

  /** Serve one more Match; build it with the helpers in `./match-builders.ts`. */
  addMatch: (fake: AddMatchBody) => post("matches", fake),

  /** Replace the body one request returns, e.g. changed `members/stats`. */
  setPayload: (endpoint: EaEndpoint, body: unknown, variant = "") =>
    post("payload", { endpoint, variant, body }),

  /** Fail the next `count` EA requests with this HTTP status (e.g. 403 for an Akamai block). */
  failNext: (status: number, count = 1) => post("fail-next", { status, count }),

  /** Never answer the next `count` EA requests, so the Worker's fetch times out. */
  timeoutNext: (count = 1) => post("fail-next", { timeout: true, count }),

  /** Every EA request received since the last reset, oldest first. */
  async requests(): Promise<RecordedRequest[]> {
    const res = await fetch(`${FAKE_EA_URL}${CONTROL_PREFIX}requests`);
    return res.json() as Promise<RecordedRequest[]>;
  },
};

async function post(action: string, body?: unknown): Promise<void> {
  const res = await fetch(`${FAKE_EA_URL}${CONTROL_PREFIX}${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `fake EA ${action} failed: ${res.status} ${await res.text()}`,
    );
  }
}
