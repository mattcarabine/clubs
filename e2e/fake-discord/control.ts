/**
 * The fake Discord webhook's paths and control API (`/__control/*`), shared
 * by the server and the `fakeDiscord` test helper.
 */

export const CONTROL_PREFIX = "/__control/";

/** The webhook the Worker posts to in E2E runs: a made-up ID and token. */
export const WEBHOOK_PATH = "/api/webhooks/100000000000000001/e2e-token";

/**
 * `POST /__control/fail-next`: answer the next `count` webhook calls (default
 * 1) with this status; a 429 carries `retryAfter` seconds in its body, as
 * Discord's `retry_after`.
 */
export interface FailNextBody {
  status: number;
  retryAfter?: number;
  count?: number;
}

/** One webhook call the fake received, from `GET /__control/requests`. */
export interface RecordedPost {
  path: string;
  /** The JSON body as sent. */
  body: Record<string, unknown>;
}
