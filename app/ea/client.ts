/**
 * Minimal EA Pro Clubs HTTP client. Runs under workerd and Node (docs/adr/0005).
 */
import { type EaRequest, requestUrl } from "./endpoints.ts";

/**
 * The Chrome-like header set that gets past EA's Akamai bot detection
 * (verified from Cloudflare LHR and a home connection on 2026-10-17).
 * Change it only after re-verifying against live EA.
 */
export const EA_BROWSER_HEADERS: Readonly<Record<string, string>> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Origin: "https://www.ea.com",
  Referer: "https://www.ea.com/",
  "sec-fetch-site": "same-site",
  "sec-fetch-mode": "cors",
  "sec-fetch-dest": "empty",
  "sec-ch-ua": '"Chromium";v="129", "Not=A?Brand";v="8"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
};

export const DEFAULT_EA_TIMEOUT_MS = 10_000;

export interface EaClientOptions {
  baseUrl: string;
  timeoutMs?: number;
}

/**
 * Why a request failed:
 * - `blocked`: 403 or 429, Akamai turning us away; later requests will fail too.
 * - `timeout`: no response within the timeout.
 * - `http`: any other non-2xx status.
 * - `network`: the connection itself failed.
 * - `invalid_json`: a 2xx whose body is not JSON.
 */
export type EaFailureKind =
  | "blocked"
  | "timeout"
  | "http"
  | "network"
  | "invalid_json";

export type EaResponse =
  | { ok: true; status: number; body: string; json: unknown }
  | { ok: false; status: number | null; kind: EaFailureKind; error: string };

/** Fetches one EA request. Never throws: every failure becomes an `EaResponse`. */
export async function fetchEa(
  request: EaRequest,
  { baseUrl, timeoutMs = DEFAULT_EA_TIMEOUT_MS }: EaClientOptions,
): Promise<EaResponse> {
  let response: Response;
  let body: string;
  try {
    response = await fetch(requestUrl(baseUrl, request), {
      headers: EA_BROWSER_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    });
    body = await response.text();
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return timedOut
      ? {
          ok: false,
          status: null,
          kind: "timeout",
          error: `No response within ${timeoutMs} ms`,
        }
      : { ok: false, status: null, kind: "network", error: String(error) };
  }

  if (!response.ok) {
    const blocked = response.status === 403 || response.status === 429;
    return {
      ok: false,
      status: response.status,
      kind: blocked ? "blocked" : "http",
      error: `HTTP ${response.status}: ${body.slice(0, 200)}`,
    };
  }

  try {
    return { ok: true, status: response.status, body, json: JSON.parse(body) };
  } catch {
    return {
      ok: false,
      status: response.status,
      kind: "invalid_json",
      error: `Body is not JSON: ${body.slice(0, 200)}`,
    };
  }
}
