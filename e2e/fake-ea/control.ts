/**
 * The fake EA upstream's control API (`/__control/*`), shared by the server
 * and the `fakeEa` test helper.
 */
import type { EaEndpoint, MatchType } from "../../app/ea/endpoints.ts";
import type { EaMatch } from "../../app/ea/types.ts";

export const CONTROL_PREFIX = "/__control/";

/** `POST /__control/matches`: serve one more Match of this Match Type. */
export interface AddMatchBody {
  matchType: MatchType;
  match: EaMatch;
}

/** `POST /__control/payload`: replace what one request returns. */
export interface SetPayloadBody {
  endpoint: EaEndpoint;
  /** The Match Type for `clubs/matches`, otherwise omitted. */
  variant?: string;
  body: unknown;
}

/**
 * `POST /__control/fail-next`: make the next `count` EA requests (default 1)
 * fail, either with an HTTP status or by never answering (`timeout`).
 */
export type FailNextBody =
  | { status: number; count?: number }
  | { timeout: true; count?: number };

/** One EA request the fake received, from `GET /__control/requests`. */
export interface RecordedRequest {
  endpoint: string;
  query: Record<string, string>;
  headers: Record<string, string>;
}
