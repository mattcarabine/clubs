/**
 * The storing half of a Poll: writes a `CollectedPoll` to D1 in one batch.
 */

import { inArray, sql } from "drizzle-orm";

import type { Db } from "../db/client.ts";
import {
  type PollError,
  type PollStatus,
  pollRuns,
  rawPayloads,
} from "../db/schema.ts";
import type { CollectedPoll } from "./collect.ts";
import { payloadHash } from "./hash.ts";

export interface PollSummary {
  status: PollStatus;
  requests: number;
  failures: number;
  payloadsStored: number;
  errors: PollError[];
}

type RawPayloadRow = Required<Omit<typeof rawPayloads.$inferInsert, "id">>;

export async function recordPoll(
  db: Db,
  poll: CollectedPoll,
): Promise<PollSummary> {
  const errors: PollError[] = [];
  const payloads: RawPayloadRow[] = [];
  for (const { request, response, fetchedAt } of poll.responses) {
    const { endpoint, variant } = request;
    if (response.ok) {
      payloads.push({
        endpoint,
        variant,
        fetchedAt: new Date(fetchedAt),
        hash: await payloadHash(response.body),
        body: response.body,
      });
    } else {
      errors.push({
        endpoint,
        variant,
        status: response.status,
        kind: response.kind,
        message: response.error,
      });
    }
  }

  const latest = await latestHashes(db);
  const changed = payloads.filter((p) => latest.get(requestKey(p)) !== p.hash);

  const summary: PollSummary = {
    status: pollStatus(poll, errors.length),
    requests: poll.responses.length,
    failures: errors.length,
    payloadsStored: changed.length,
    errors,
  };

  await db.batch([
    db.insert(pollRuns).values({
      startedAt: new Date(poll.startedAt),
      finishedAt: new Date(poll.finishedAt),
      status: summary.status,
      requests: summary.requests,
      failures: summary.failures,
      payloadsStored: summary.payloadsStored,
      errors: errors.length ? errors : null,
    }),
    ...changed.map((payload) => db.insert(rawPayloads).values(payload)),
  ]);
  return summary;
}

/** `failed` when nothing usable came back; `partial` when some requests failed or were never sent. */
function pollStatus(poll: CollectedPoll, failures: number): PollStatus {
  if (failures === poll.responses.length) return "failed";
  return failures > 0 || poll.aborted ? "partial" : "ok";
}

/** Identifies one EA request across Polls. */
function requestKey(request: { endpoint: string; variant: string }): string {
  return `${request.endpoint}|${request.variant}`;
}

/** Hash of the most recent Raw Payload per request, in one read. */
async function latestHashes(db: Db): Promise<Map<string, string>> {
  const latestIds = db
    .select({ id: sql<number>`max(${rawPayloads.id})` })
    .from(rawPayloads)
    .groupBy(rawPayloads.endpoint, rawPayloads.variant);
  const rows = await db
    .select({
      endpoint: rawPayloads.endpoint,
      variant: rawPayloads.variant,
      hash: rawPayloads.hash,
    })
    .from(rawPayloads)
    .where(inArray(rawPayloads.id, latestIds));
  return new Map(rows.map((row) => [requestKey(row), row.hash]));
}
