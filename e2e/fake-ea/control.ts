/**
 * The fake EA upstream's control API (`/__control/*`), shared by the server
 * and the `fakeEa` test helper.
 */
import type { EaEndpoint, MatchType } from "../../app/ea/endpoints.ts";
import type { EaMatch } from "../../app/ea/types.ts";

export const CONTROL_PREFIX = "/__control/";

/** Where the fake serves EA's API, as on `proclubs.ea.com`. */
export const EA_PREFIX = "/api/fc/";

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

/** Which requests a queued failure applies to; every request when empty. */
export interface FailureTarget {
  endpoint?: EaEndpoint;
  /** Only requests naming this club in `clubIds`. */
  clubId?: string;
}

/**
 * `POST /__control/fail-next`: make the next `count` EA requests (default 1)
 * matching `target` fail, either with an HTTP status or by never answering
 * (`timeout`).
 */
export type FailNextBody = (
  | { status: number; count?: number }
  | { timeout: true; count?: number }
) & { target?: FailureTarget };

/** One EA request the fake received, from `GET /__control/requests`. */
export interface RecordedRequest {
  endpoint: string;
  /** The last value of each query parameter. */
  query: Record<string, string>;
  /** Every value of each query parameter, e.g. a repeated `clubIds`. */
  params: Record<string, string[]>;
  headers: Record<string, string>;
}
