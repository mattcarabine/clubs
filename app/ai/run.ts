/**
 * Write-ups, run by the scheduled handler after each Poll (docs/adr/0006).
 * Never throws: a failure is logged, left on its job for a later Poll, and
 * never touches the Poll's own record.
 */
import { gte, sum } from "drizzle-orm";

import { type Db, getDb } from "~/db/client";
import { aiJobs } from "~/db/schema";
import type { AiClientConfig } from "./client";
import { DEFAULT_RETRY_BASE_MS, DEFAULT_TIMEOUT_MS } from "./config";
import { drainQueue } from "./queue";
import { sessionWriter } from "./writers/session";

/** Every writer, drained in this order. */
const WRITERS = [sessionWriter];

/** The client config from Worker env, or null without an API key (local dev, by default). */
export function aiClientConfig(env: Env): AiClientConfig | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  return {
    apiKey: env.ANTHROPIC_API_KEY,
    // Only the E2E run sets it, to its fake upstream; the SDK's default is the real API.
    baseURL: env.ANTHROPIC_BASE_URL || undefined,
    timeoutMs: Number(env.ANTHROPIC_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  };
}

export async function runWriteups(env: Env): Promise<void> {
  const client = aiClientConfig(env);
  if (!client) {
    console.log(JSON.stringify({ event: "ai", status: "skipped" }));
    return;
  }
  try {
    const db = getDb(env.DB);
    const now = new Date();
    const summary = await drainQueue(
      {
        db,
        client,
        now,
        retryBaseMs: env.AI_RETRY_BASE_MS
          ? Number(env.AI_RETRY_BASE_MS)
          : DEFAULT_RETRY_BASE_MS,
      },
      WRITERS,
    );
    console.log(
      JSON.stringify({
        event: "ai",
        ...summary,
        monthToDateUsd: await monthToDateCost(db, now),
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ event: "ai", status: "failed", error: message }),
    );
  }
}

/** Estimated spend on calls this calendar month (UTC), in USD. */
async function monthToDateCost(db: Db, now: Date): Promise<number> {
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const [row] = await db
    .select({ total: sum(aiJobs.costUsd).mapWith(Number) })
    .from(aiJobs)
    .where(gte(aiJobs.createdAt, monthStart));
  return row?.total ?? 0;
}
