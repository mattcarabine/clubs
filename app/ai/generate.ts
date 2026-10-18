/**
 * `generate`: the single entry point for every write-up (docs/adr/0006). It
 * owns the model config, prompt caching, structured output, idempotency by
 * input hash, retries with backoff, token and cost accounting, and storage.
 * Callers describe the work as a `GenerateTask`; the queue (`queue.ts`)
 * decides which tasks a Poll runs.
 */
import { and, eq, ne } from "drizzle-orm";

import type { Db } from "~/db/client";
import { aiJobs, aiWriteups } from "~/db/schema";
import { sha256Hex } from "~/lib/sha256";
import { errorMessage } from "~/lib/text";

import {
  AiCallError,
  type AiClientConfig,
  callModel,
  type ModelRequest,
} from "./client";
import {
  AI_EFFORT,
  AI_MAX_TOKENS,
  AI_MODEL,
  MAX_ATTEMPTS,
  MODEL_PRICES,
} from "./config";
import { estimateCost, type TokenUsage } from "./cost";
import { isDue, retryDelay } from "./plan";
import { cleanWriteupText, promptJson } from "./sanitise";
import type { WriteupKind } from "./writeups";

/** One piece of text to store for a subject. */
export interface WriteupDraft {
  kind: WriteupKind;
  subjectKey: string;
  text: string;
}

export interface Prompt {
  /** The fixed system prompt: cached. */
  system: string;
  /** Background that changes rarely, e.g. Squad Members' baselines: cached after the system prompt. */
  context?: unknown;
  /** What to write from `input`. */
  instructions: string;
}

export interface GenerateTask {
  /** The writer, e.g. `session`. */
  kind: string;
  subjectKey: string;
  /** See `Subject.version`. */
  version: string;
  /**
   * Pre-computed numbers from `app/stats/`, never Raw Payloads. Pass any
   * third-party text (club and persona names) through `promptName`.
   */
  input: unknown;
  prompt: Prompt;
  /** A JSON schema for structured output; without one the reply is plain text. */
  schema?: Record<string, unknown>;
  /**
   * The write-ups to store from the reply (the parsed JSON, or the text).
   * Validate it strictly: return none for anything off-schema, and the job
   * fails and is retried. Every text is then cleaned (`cleanWriteupText`).
   */
  writeups(output: unknown): WriteupDraft[];
}

export interface GenerateContext {
  db: Db;
  client: AiClientConfig;
  now: Date;
  /** The wait before a failed job's second try (`retryDelay`). */
  retryBaseMs: number;
}

export type GenerateResult =
  | { status: "written"; costUsd: number | null }
  /** A done job already had this exact input, so nothing was sent. */
  | { status: "unchanged" }
  /** Already written, out of attempts, or waiting out its backoff. */
  | { status: "skipped" }
  | { status: "failed"; error: string; costUsd: number | null };

export async function generate(
  ctx: GenerateContext,
  task: GenerateTask,
): Promise<GenerateResult> {
  const { db, now } = ctx;
  const job = await findOrCreateJob(db, task, now);
  if (!isDue(job, now)) return { status: "skipped" };

  const request = buildRequest(task);
  const input = JSON.stringify(request);
  const inputHash = await sha256Hex(input);
  if (await alreadyWritten(db, task, inputHash, job.id)) {
    await db
      .update(aiJobs)
      .set({ status: "done", inputHash, finishedAt: now })
      .where(eq(aiJobs.id, job.id));
    return { status: "unchanged" };
  }

  // Leased before the call: an overlapping Poll sees it waiting out a backoff.
  const attempts = job.attempts + 1;
  await db
    .update(aiJobs)
    .set({
      attempts,
      nextAttemptAt: new Date(
        now.getTime() + retryDelay(attempts, ctx.retryBaseMs),
      ),
      inputHash,
      input,
      model: AI_MODEL,
    })
    .where(eq(aiJobs.id, job.id));

  let usage: TokenUsage | undefined;
  let model = AI_MODEL;
  try {
    const reply = await callModel(ctx.client, request);
    usage = reply.usage;
    model = reply.model;
    const output = task.schema ? JSON.parse(reply.text) : reply.text;
    const drafts = task
      .writeups(output)
      .map((draft) => ({ ...draft, text: cleanWriteupText(draft.text) }))
      .filter((draft) => draft.text);
    if (drafts.length === 0) throw new Error("The reply held no write-ups");
    const costUsd = estimateCost(usage, MODEL_PRICES[model]);
    await db.batch([
      db
        .update(aiJobs)
        .set({
          status: "done",
          lastError: null,
          model,
          ...tokenColumns(usage),
          costUsd,
          finishedAt: new Date(),
        })
        .where(eq(aiJobs.id, job.id)),
      db.insert(aiWriteups).values(
        drafts.map((draft) => ({
          ...draft,
          jobId: job.id,
          createdAt: new Date(),
        })),
      ),
    ]);
    return { status: "written", costUsd };
  } catch (error) {
    if (error instanceof AiCallError) {
      usage ??= error.usage;
      if (error.model) model = error.model;
    }
    const message = errorMessage(error);
    // Tokens spent on an unusable reply still count towards the bill.
    const costUsd = usage ? estimateCost(usage, MODEL_PRICES[model]) : null;
    await db
      .update(aiJobs)
      .set({
        status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        lastError: message.slice(0, 500),
        ...(usage ? { ...tokenColumns(usage), costUsd, model } : {}),
      })
      .where(eq(aiJobs.id, job.id));
    return { status: "failed", error: message, costUsd };
  }
}

/** The `ai_jobs` columns that make up a `JobState`. */
export const jobStateColumns = {
  subjectKey: aiJobs.subjectKey,
  version: aiJobs.version,
  status: aiJobs.status,
  attempts: aiJobs.attempts,
  nextAttemptAt: aiJobs.nextAttemptAt,
};

/** The Messages API request for a task: the stable prefix first, so it caches. */
export function buildRequest(task: GenerateTask): ModelRequest {
  const { system, context, instructions } = task.prompt;
  return {
    model: AI_MODEL,
    max_tokens: AI_MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: {
      effort: AI_EFFORT,
      ...(task.schema && {
        format: { type: "json_schema", schema: task.schema },
      }),
    },
    system: [
      { type: "text", text: system, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: [
          ...(context === undefined
            ? []
            : [
                {
                  type: "text" as const,
                  text: `<background>\n${promptJson(context)}\n</background>`,
                  cache_control: { type: "ephemeral" as const },
                },
              ]),
          {
            type: "text",
            text: `${instructions}\n\n<data>\n${promptJson(task.input)}\n</data>`,
          },
        ],
      },
    ],
  };
}

async function findOrCreateJob(
  db: Db,
  { kind, subjectKey, version }: GenerateTask,
  now: Date,
) {
  const where = and(
    eq(aiJobs.kind, kind),
    eq(aiJobs.subjectKey, subjectKey),
    eq(aiJobs.version, version),
  );
  const columns = { id: aiJobs.id, ...jobStateColumns };
  const [existing] = await db.select(columns).from(aiJobs).where(where);
  if (existing) return existing;
  const [created] = await db
    .insert(aiJobs)
    .values({ kind, subjectKey, version, status: "pending", createdAt: now })
    .returning(columns);
  return created;
}

/** Whether another done job for this subject was sent exactly this input. */
async function alreadyWritten(
  db: Db,
  { kind, subjectKey }: GenerateTask,
  inputHash: string,
  jobId: number,
): Promise<boolean> {
  const [match] = await db
    .select({ id: aiJobs.id })
    .from(aiJobs)
    .where(
      and(
        eq(aiJobs.kind, kind),
        eq(aiJobs.subjectKey, subjectKey),
        eq(aiJobs.inputHash, inputHash),
        eq(aiJobs.status, "done"),
        ne(aiJobs.id, jobId),
      ),
    )
    .limit(1);
  return match !== undefined;
}

function tokenColumns(usage: TokenUsage) {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
  };
}
