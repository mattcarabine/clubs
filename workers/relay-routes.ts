/**
 * The home relay's API (docs/adr/0007, wire format in `app/poll/relay.ts`):
 *
 * - `GET /relay/plan`: the club to poll and the Opponents still to rate.
 * - `POST /relay/poll`: records a Poll the relay collected, exactly as the
 *   cron records its own, then runs Milestone detection on it. Answers with
 *   the `PollSummary`, or 400 for a body that is not a `RelayPoll`.
 *
 * Both need `Authorization: Bearer <RELAY_TOKEN>` (401 otherwise). Without
 * a `RELAY_TOKEN` secret the routes do not exist (404).
 */
import { getDb } from "../app/db/client";
import { runMilestones } from "../app/milestones/record";
import type { CollectedPoll } from "../app/poll/collect";
import { ratingState } from "../app/poll/ratings";
import { type PollSummary, recordPoll } from "../app/poll/record";
import {
  parseRelayPoll,
  RELAY_PLAN_PATH,
  RELAY_POLL_PATH,
  RelayPollError,
  toRelayPlan,
} from "../app/poll/relay";
import { clubFromEnv, logPoll, recordPollFailure } from "../app/poll/run";

/** A Poll is about 250 KB today; this leaves room without inviting abuse. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

export async function handleRelayRoute(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const route = relayRoute(request);
  if (!route || !env.RELAY_TOKEN) return null;
  if (!(await authorised(request, env.RELAY_TOKEN))) {
    // No WWW-Authenticate: undici's fetch (vite preview's proxy to workerd)
    // sometimes fails on a 401 that carries one.
    return new Response("Unauthorised", { status: 401 });
  }
  return route(request, env);
}

type RelayRoute = (request: Request, env: Env) => Promise<Response>;

function relayRoute(request: Request): RelayRoute | null {
  const { pathname } = new URL(request.url);
  if (pathname === RELAY_PLAN_PATH && request.method === "GET") return plan;
  if (pathname === RELAY_POLL_PATH && request.method === "POST") return poll;
  return null;
}

async function plan(_request: Request, env: Env): Promise<Response> {
  const state = await ratingState(getDb(env.DB), env.EA_CLUB_ID, Date.now());
  return Response.json(toRelayPlan(clubFromEnv(env), state));
}

async function poll(request: Request, env: Env): Promise<Response> {
  // Read whole rather than trust Content-Length, which a chunked body lacks.
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return new Response("Poll too large", { status: 413 });
  }
  let collected: CollectedPoll;
  try {
    collected = parseRelayPoll(JSON.parse(body));
  } catch (error) {
    const message =
      error instanceof RelayPollError ? error.message : "Body is not JSON";
    return new Response(message, { status: 400 });
  }

  const db = getDb(env.DB);
  let summary: PollSummary;
  try {
    summary = await recordPoll(db, collected, env.EA_CLUB_ID);
  } catch (error) {
    await recordPollFailure(
      db,
      collected.startedAt,
      collected.responses.length,
      error,
    );
    return new Response("Recording failed", { status: 500 });
  }
  logPoll(summary, collected);
  await runMilestones(
    env,
    summary.matchesAdded > 0 || summary.snapshotsAdded > 0,
    new Date(collected.finishedAt),
  );
  return Response.json(summary);
}

/** Compares SHA-256 digests in constant time, so neither the token nor its length leaks through timing. */
async function authorised(request: Request, token: string): Promise<boolean> {
  const header = request.headers.get("Authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const [a, b] = await Promise.all([digest(given), digest(token)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function digest(value: string): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return new Uint8Array(hash);
}
