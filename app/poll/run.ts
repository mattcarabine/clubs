/**
 * One Poll, as run by the Worker's Cron Trigger: collect from EA, then record
 * to D1. Never throws; a failure is recorded in `poll_runs` and logged.
 */
import { type Db, getDb } from "../db/client.ts";
import { pollRuns } from "../db/schema.ts";
import { DEFAULT_EA_TIMEOUT_MS } from "../ea/client.ts";
import type { ClubRef } from "../ea/endpoints.ts";
import { errorMessage } from "../lib/text.ts";
import { type CollectedPoll, collectPoll, type PollConfig } from "./collect.ts";
import { ratingState } from "./ratings.ts";
import { type PollSummary, recordPoll } from "./record.ts";

/** Our Club, from the Wrangler vars. */
export function clubFromEnv(env: Env): ClubRef {
  return {
    platform: env.EA_PLATFORM,
    clubId: env.EA_CLUB_ID,
    clubName: env.EA_CLUB_NAME,
  };
}

export function pollConfigFromEnv(env: Env): PollConfig {
  // The `test` env leaves it out: each E2E run passes its fake EA's URL in.
  if (!env.EA_BASE_URL) throw new Error("EA_BASE_URL is not set");
  return {
    club: clubFromEnv(env),
    baseUrl: env.EA_BASE_URL,
    timeoutMs: Number(env.EA_TIMEOUT_MS) || DEFAULT_EA_TIMEOUT_MS,
  };
}

/** Runs one Poll; returns what it stored, or null when recording failed. */
export async function runPoll(env: Env): Promise<PollSummary | null> {
  const db = getDb(env.DB);
  const startedAt = Date.now();
  let poll: CollectedPoll | undefined;
  try {
    const ratings = await ratingState(db, env.EA_CLUB_ID, startedAt);
    poll = await collectPoll(pollConfigFromEnv(env), { ratings });
    const summary = await recordPoll(db, poll, env.EA_CLUB_ID);
    logPoll(summary, poll);
    return summary;
  } catch (error) {
    // Recording itself failed (e.g. D1 unavailable): never let the scheduled
    // handler throw.
    await recordPollFailure(db, startedAt, poll?.responses.length ?? 0, error);
    return null;
  }
}

/**
 * Logs a Poll that could not be recorded, and makes a best effort to leave a
 * `failed` row in `poll_runs`, whoever collected it.
 */
export async function recordPollFailure(
  db: Db,
  startedAt: number,
  requests: number,
  error: unknown,
): Promise<void> {
  const message = errorMessage(error);
  console.error(
    JSON.stringify({ event: "poll", status: "failed", error: message }),
  );
  try {
    await db.insert(pollRuns).values({
      startedAt: new Date(startedAt),
      finishedAt: new Date(),
      status: "failed",
      requests,
      failures: 1,
      payloadsStored: 0,
      errors: [
        { endpoint: "", variant: "", status: null, kind: "internal", message },
      ],
    });
  } catch {
    // Already logged above.
  }
}

/** One log line per recorded Poll, whoever collected it. */
export function logPoll(summary: PollSummary, poll: CollectedPoll): void {
  console.log(
    JSON.stringify({
      event: "poll",
      ...summary,
      durationMs: poll.finishedAt - poll.startedAt,
    }),
  );
}
