/**
 * The home relay's side of the Worker's relay API (docs/adr/0007): EA only
 * answers a real browser, so the Mac mini makes the Poll's requests and the
 * Worker records what it sends, exactly as it records its own Polls.
 *
 * - `GET /relay/plan` tells the relay which club to poll and which Opponents
 *   still need rating (`RelayPlan`).
 * - `POST /relay/poll` takes the collected Poll (`RelayPoll`) and answers
 *   with the `PollSummary` it recorded.
 *
 * Both need `Authorization: Bearer <RELAY_TOKEN>`. This module is the wire
 * format and the relay's client, shared by the Worker, `pnpm relay` and the
 * E2E suite, so it runs under both workerd and Node (docs/adr/0005).
 */
import {
  EA_FAILURE_KINDS,
  type EaFailureKind,
  type EaFetcher,
  type EaResponse,
  toEaResponse,
} from "../ea/client.ts";
import {
  type ClubRef,
  EA_ENDPOINTS,
  type EaEndpoint,
  type EaRequest,
} from "../ea/endpoints.ts";
import { type CollectedPoll, collectPoll } from "./collect.ts";
import type { RatingState } from "./rating-targets.ts";

export const RELAY_PLAN_PATH = "/relay/plan";
export const RELAY_POLL_PATH = "/relay/poll";

/** A Poll sends 8 requests at most; anything far beyond that is not a Poll. */
const MAX_RESPONSES = 20;

/** What the relay needs from D1 before it polls. */
export interface RelayPlan {
  club: ClubRef;
  ratedMatchIds: string[];
  backfillOpponents: string[];
}

/** A `CollectedResponse` on the wire: the body only, which the Worker parses again. */
export interface RelayResponse {
  request: EaRequest;
  fetchedAt: number;
  durationMs: number;
  response:
    | { ok: true; status: number; body: string }
    | Extract<EaResponse, { ok: false }>;
}

export interface RelayPoll {
  startedAt: number;
  finishedAt: number;
  aborted: boolean;
  responses: RelayResponse[];
}

export function toRelayPlan(club: ClubRef, state: RatingState): RelayPlan {
  return {
    club,
    ratedMatchIds: [...state.ratedMatchIds],
    backfillOpponents: [...state.backfillOpponents],
  };
}

export function ratingStateFromPlan(plan: RelayPlan): RatingState {
  return {
    ratedMatchIds: new Set(plan.ratedMatchIds),
    backfillOpponents: plan.backfillOpponents,
  };
}

/** Drops each parsed `json`: the Worker parses the body itself rather than trust a second copy. */
export function toRelayPoll(poll: CollectedPoll): RelayPoll {
  return {
    ...poll,
    responses: poll.responses.map(({ response, ...rest }) => ({
      ...rest,
      response: response.ok
        ? { ok: true, status: response.status, body: response.body }
        : response,
    })),
  };
}

/** A relay request the Worker refuses (400). */
export class RelayPollError extends Error {}

/**
 * Validates a `RelayPoll` from the wire and turns it back into the
 * `CollectedPoll` the Worker records. A body that is not JSON is recorded as
 * an `invalid_json` failure, as the Worker's own `fetch` would. Throws a
 * `RelayPollError` for anything that is not a `RelayPoll`.
 */
export function parseRelayPoll(input: unknown): CollectedPoll {
  const poll = record(input, "poll");
  const responses = poll.responses;
  if (!Array.isArray(responses) || responses.length > MAX_RESPONSES) {
    throw new RelayPollError(
      `poll.responses must be an array of at most ${MAX_RESPONSES}`,
    );
  }
  return {
    startedAt: wholeNumber(poll.startedAt, "poll.startedAt"),
    finishedAt: wholeNumber(poll.finishedAt, "poll.finishedAt"),
    aborted: bool(poll.aborted, "poll.aborted"),
    responses: responses.map((item, i) => {
      const path = `poll.responses[${i}]`;
      const entry = record(item, path);
      return {
        request: parseRequest(entry.request, `${path}.request`),
        fetchedAt: wholeNumber(entry.fetchedAt, `${path}.fetchedAt`),
        durationMs: wholeNumber(entry.durationMs, `${path}.durationMs`),
        response: parseResponse(entry.response, `${path}.response`),
      };
    }),
  };
}

function parseRequest(input: unknown, path: string): EaRequest {
  const request = record(input, path);
  const endpoint = request.endpoint as EaEndpoint;
  if (!EA_ENDPOINTS.includes(endpoint)) {
    throw new RelayPollError(`${path}.endpoint is not an EA endpoint we poll`);
  }
  const query = record(request.query, `${path}.query`);
  for (const [key, value] of Object.entries(query)) {
    const valid =
      typeof value === "string" ||
      (Array.isArray(value) && value.every((v) => typeof v === "string"));
    if (!valid) {
      throw new RelayPollError(`${path}.query.${key} must be text`);
    }
  }
  return {
    endpoint,
    variant: text(request.variant, `${path}.variant`),
    query: query as EaRequest["query"],
  };
}

function parseResponse(input: unknown, path: string): EaResponse {
  const response = record(input, path);
  if (response.ok === true) {
    const status = wholeNumber(response.status, `${path}.status`);
    return toEaResponse(status, text(response.body, `${path}.body`));
  }
  if (response.ok !== false) {
    throw new RelayPollError(`${path}.ok must be true or false`);
  }
  const kind = response.kind as EaFailureKind;
  if (!EA_FAILURE_KINDS.includes(kind)) {
    throw new RelayPollError(`${path}.kind is not a failure kind`);
  }
  return {
    ok: false,
    status:
      response.status === null
        ? null
        : wholeNumber(response.status, `${path}.status`),
    kind,
    error: text(response.error, `${path}.error`),
  };
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RelayPollError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

/** A non-negative whole number: an epoch-ms time, a duration or an HTTP status. */
function wholeNumber(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RelayPollError(`${path} must be a whole number`);
  }
  return value as number;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new RelayPollError(`${path} must be text`);
  }
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new RelayPollError(`${path} must be true or false`);
  }
  return value;
}

export interface RelayOptions {
  /** The Worker's origin, e.g. `https://clubs.marabine.co.uk`. */
  siteUrl: string;
  token: string;
  /** EA's API base, e.g. `https://proclubs.ea.com/api/fc/`. */
  eaBaseUrl: string;
  timeoutMs?: number;
  /** How each request reaches EA: `pnpm relay` drives Chrome; without it, plain `fetch` (as the specs do). */
  fetcher?: EaFetcher;
}

/** What one relay run recorded, as the Worker's `PollSummary` reports it. */
export interface RelaySummary {
  status: string;
  requests: number;
  failures: number;
  matchesAdded: number;
  snapshotsAdded: number;
}

/**
 * One relay Poll: ask the Worker for the plan, collect from EA, send it back.
 * Throws when the Worker cannot be reached or refuses the token.
 */
export async function runRelayOnce({
  siteUrl,
  token,
  eaBaseUrl,
  timeoutMs,
  fetcher,
}: RelayOptions): Promise<RelaySummary> {
  const headers = { Authorization: `Bearer ${token}` };
  const plan: RelayPlan = await relayJson(
    await fetch(new URL(RELAY_PLAN_PATH, siteUrl), { headers }),
  );
  const poll = await collectPoll(
    { club: plan.club, baseUrl: eaBaseUrl, timeoutMs },
    { ratings: ratingStateFromPlan(plan), fetcher },
  );
  return relayJson(
    await fetch(new URL(RELAY_POLL_PATH, siteUrl), {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(toRelayPoll(poll)),
    }),
  );
}

async function relayJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `${response.url} answered HTTP ${response.status}: ${body.slice(0, 200)}`,
    );
  }
  return response.json() as Promise<T>;
}
