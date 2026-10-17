/**
 * The storing half of a Poll: writes a `CollectedPoll` to D1 in one atomic
 * batch, so a Raw Payload and everything derived from it land together.
 *
 * Only payloads whose hash changed are stored and parsed. An unchanged Poll
 * therefore costs one read and one write (its `poll_runs` row), and a
 * re-polled Match is never written again.
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
import { ingestPayloads, type StoredPayload } from "./ingest.ts";
import { ratingStatements } from "./ratings.ts";

export interface PollSummary {
  status: PollStatus;
  requests: number;
  failures: number;
  payloadsStored: number;
  matchesAdded: number;
  snapshotsAdded: number;
  errors: PollError[];
}

interface Received extends Omit<StoredPayload, "id"> {
  hash: string;
  body: string;
}

export async function recordPoll(
  db: Db,
  poll: CollectedPoll,
  ourClubId: string,
): Promise<PollSummary> {
  const errors: PollError[] = [];
  const received: Received[] = [];
  for (const { request, response, fetchedAt } of poll.responses) {
    const { endpoint, variant } = request;
    if (response.ok) {
      received.push({
        endpoint,
        variant,
        fetchedAt: new Date(fetchedAt),
        hash: await payloadHash(response.body),
        body: response.body,
        json: response.json,
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

  const { hashes, maxId } = await latestPayloads(db);
  // IDs are assigned here so derived rows can reference their payload inside
  // the same batch. Polls never overlap, and the batch is a transaction, so a
  // clash fails the whole Poll cleanly and the next Poll retries.
  const changed: (Received & { id: number })[] = received
    .filter((payload) => hashes.get(requestKey(payload)) !== payload.hash)
    .map((payload, i) => ({ ...payload, id: maxId + i + 1 }));

  const ingestion = await ingestPayloads(
    db,
    changed,
    ourClubId,
    new Date(poll.finishedAt),
  );

  const summary: PollSummary = {
    status: pollStatus(poll, errors.length),
    requests: poll.responses.length,
    failures: errors.length,
    payloadsStored: changed.length,
    matchesAdded: ingestion.matchesAdded,
    snapshotsAdded: ingestion.snapshotsAdded,
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
      matchesAdded: summary.matchesAdded,
      snapshotsAdded: summary.snapshotsAdded,
      errors: errors.length ? errors : null,
    }),
    ...changed.map(({ id, endpoint, variant, fetchedAt, hash, body }) =>
      db
        .insert(rawPayloads)
        .values({ id, endpoint, variant, fetchedAt, hash, body }),
    ),
    ...ingestion.statements,
    ...ratingStatements(db, poll.responses, ourClubId, {
      matchesAdded: ingestion.matchesAdded,
      now: poll.finishedAt,
    }),
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

/**
 * The hash of the latest Raw Payload per request, and the highest payload ID,
 * in one read. The highest ID is always some request's latest.
 */
async function latestPayloads(
  db: Db,
): Promise<{ hashes: Map<string, string>; maxId: number }> {
  const latestIds = db
    .select({ id: sql<number>`max(${rawPayloads.id})` })
    .from(rawPayloads)
    .groupBy(rawPayloads.endpoint, rawPayloads.variant);
  const rows = await db
    .select({
      id: rawPayloads.id,
      endpoint: rawPayloads.endpoint,
      variant: rawPayloads.variant,
      hash: rawPayloads.hash,
    })
    .from(rawPayloads)
    .where(inArray(rawPayloads.id, latestIds));
  return {
    hashes: new Map(rows.map((row) => [requestKey(row), row.hash])),
    maxId: Math.max(0, ...rows.map((row) => row.id)),
  };
}
