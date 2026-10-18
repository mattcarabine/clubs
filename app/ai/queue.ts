/**
 * The write-up queue, drained at the end of each Poll (docs/adr/0006). Each
 * writer lists its subjects cheaply (newest first); the queue picks those
 * whose current version has no write-up and are due, a few per Poll, and
 * hands each to `generate`. A backfill is just a long list of due subjects.
 *
 * Adding a kind of write-up takes an `AiWriter` (subjects, prompt and input
 * builder) and a display; register it in `run.ts`.
 */
import { eq } from "drizzle-orm";

import type { Db } from "~/db/client";
import { aiJobs } from "~/db/schema";

import { CALLS_PER_POLL, DRAIN_BUDGET_MS } from "./config";
import { type GenerateContext, type GenerateTask, generate } from "./generate";
import { dueSubjects, type Subject } from "./plan";

export interface AiWriter<S extends Subject = Subject> {
  /** Stored as the job's kind. */
  kind: string;
  /** Every subject that should have a write-up, newest first. Keep it to a query or two. */
  subjects(db: Db, now: Date): Promise<S[]>;
  /** The work for one subject, or null if it no longer exists. */
  task(db: Db, subject: S): Promise<GenerateTask | null>;
}

export interface DrainSummary {
  written: number;
  unchanged: number;
  failed: number;
  /** Due subjects left for later Polls. */
  waiting: number;
  costUsd: number;
  errors: string[];
}

export async function drainQueue(
  ctx: GenerateContext,
  writers: readonly AiWriter[],
  { limit = CALLS_PER_POLL, budgetMs = DRAIN_BUDGET_MS } = {},
): Promise<DrainSummary> {
  const summary: DrainSummary = {
    written: 0,
    unchanged: 0,
    failed: 0,
    waiting: 0,
    costUsd: 0,
    errors: [],
  };
  const started = Date.now();
  let calls = 0;
  for (const writer of writers) {
    const [subjects, jobs] = await Promise.all([
      writer.subjects(ctx.db, ctx.now),
      ctx.db
        .select({
          subjectKey: aiJobs.subjectKey,
          version: aiJobs.version,
          status: aiJobs.status,
          attempts: aiJobs.attempts,
          nextAttemptAt: aiJobs.nextAttemptAt,
        })
        .from(aiJobs)
        .where(eq(aiJobs.kind, writer.kind)),
    ]);
    const due = dueSubjects(subjects, jobs, ctx.now, subjects.length);
    for (const subject of due) {
      if (calls >= limit || Date.now() - started > budgetMs) {
        summary.waiting++;
        continue;
      }
      const task = await writer.task(ctx.db, subject);
      if (!task) continue;
      const result = await generate(ctx, task);
      if (result.status === "written" || result.status === "failed") {
        calls++;
        summary.costUsd += result.costUsd ?? 0;
      }
      if (result.status === "written") summary.written++;
      if (result.status === "unchanged") summary.unchanged++;
      if (result.status === "failed") {
        summary.failed++;
        summary.errors.push(
          `${writer.kind} ${subject.subjectKey}: ${result.error}`,
        );
      }
    }
  }
  return summary;
}
