/**
 * The fake Anthropic upstream's control API (`/__control/*`), shared by the
 * server and the `fakeAnthropic` test helper.
 */

export const CONTROL_PREFIX = "/__control/";

/** `POST /__control/reply`: answer the next Messages request with this. */
export interface ReplyBody {
  /** The reply's text; an object is sent as its JSON (structured output). */
  content: string | Record<string, unknown>;
}

/**
 * `POST /__control/fail-next`: fail the next `count` Messages requests
 * (default 1) with an API error, or by never answering (`timeout`).
 */
export type FailNextBody =
  | {
      status: number;
      /** The API's error type, e.g. `api_error`, `billing_error`. */
      type?: string;
      message?: string;
      count?: number;
    }
  | { timeout: true; count?: number };

/** One Messages request the fake received, from `GET /__control/requests`. */
export interface RecordedRequest {
  path: string;
  headers: Record<string, string>;
  /** The JSON body as sent. */
  body: Record<string, unknown>;
  /** The body exactly as sent, for searching. */
  raw: string;
}

/** Tokens every fake reply reports, so specs can check the accounting. */
export const FAKE_USAGE = {
  input_tokens: 1_000,
  output_tokens: 500,
  cache_creation_input_tokens: 2_000,
  cache_read_input_tokens: 0,
};
