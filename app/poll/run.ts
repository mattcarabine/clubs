/**
 * One Poll, as run by the Worker's Cron Trigger: collect from EA, then record
 * to D1. Never throws; a failure is recorded in `poll_runs` and logged.
 */
import { getDb } from "../db/client.ts";
import { pollRuns } from "../db/schema.ts";
import { DEFAULT_EA_TIMEOUT_MS } from "../ea/client.ts";
import { type CollectedPoll, collectPoll, type PollConfig } from "./collect.ts";
import { type PollSummary, recordPoll } from "./record.ts";

export function pollConfigFromEnv(env: Env): PollConfig {
  return {
    club: {
      platform: env.EA_PLATFORM,
      clubId: env.EA_CLUB_ID,
      clubName: env.EA_CLUB_NAME,
    },
    baseUrl: env.EA_BASE_URL,
    timeoutMs: Number(env.EA_TIMEOUT_MS) || DEFAULT_EA_TIMEOUT_MS,
  };
}

export async function runPoll(env: Env): Promise<void> {
  const db = getDb(env.DB);
  const startedAt = Date.now();
  let poll: CollectedPoll | undefined;
  try {
    poll = await collectPoll(pollConfigFromEnv(env));
    log(await recordPoll(db, poll), poll);
  } catch (error) {
    // Recording itself failed (e.g. D1 unavailable): make a best effort to
    // leave a trace, but never let the scheduled handler throw.
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ event: "poll", status: "failed", error: message }),
    );
    try {
      await db.insert(pollRuns).values({
        startedAt: new Date(startedAt),
        finishedAt: new Date(),
        status: "failed",
        requests: poll?.responses.length ?? 0,
        failures: 1,
        payloadsStored: 0,
        errors: [
          {
            endpoint: "",
            variant: "",
            status: null,
            kind: "internal",
            message,
          },
        ],
      });
    } catch {
      // Already logged above.
    }
  }
}

function log(summary: PollSummary, poll: CollectedPoll): void {
  console.log(
    JSON.stringify({
      event: "poll",
      ...summary,
      durationMs: poll.finishedAt - poll.startedAt,
    }),
  );
}
