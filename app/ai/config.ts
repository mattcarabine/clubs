/**
 * The write-up model and what it costs (docs/adr/0006). Swap `AI_MODEL` for
 * `claude-sonnet-5-5` to halve the bill; its prices are already here.
 */
export const AI_MODEL = "claude-opus-5-5";

/** Thinking depth: Opus 5.5 always thinks, so effort is the only dial. */
export const AI_EFFORT = "medium";

/** Room for thinking plus a recap and its Match reports. */
export const AI_MAX_TOKENS = 16_000;

/** USD per million tokens, from Anthropic's price list (2026-10). */
export interface ModelPrice {
  input: number;
  output: number;
  /** Writing the 5-minute prompt cache: 1.25 times `input`. */
  cacheWrite: number;
  cacheRead: number;
}

export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-sonnet-5-5": {
    input: 2,
    output: 10,
    cacheWrite: 2.5,
    cacheRead: 0.2,
  },
};

/** A job is tried at most this many times, then left `failed`. */
export const MAX_ATTEMPTS = 3;

/** The most model calls one Poll makes, so a backfill drains a few at a time. */
export const CALLS_PER_POLL = 2;

/**
 * No call starts once a Poll's write-ups have run this long, so they finish
 * well inside the 5-minute gap before the next Poll.
 */
export const DRAIN_BUDGET_MS = 150_000;

/** The wait before a failed job's second try; it doubles for the third. */
export const DEFAULT_RETRY_BASE_MS = 5 * 60_000;

/** How long one model call may take. */
export const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * The house style's revision. Bump it to rewrite every write-up: each
 * writer's versions carry it (`revised`), so every subject gets a new job
 * and its new text is stored beside the old, which pages stop showing.
 * 2: CLUBS-48 (pundit prose, EA's data gaps left out).
 */
export const WRITEUP_REVISION = 2;

/** A subject's version under the current `WRITEUP_REVISION`. */
export function revised(version: string): string {
  return `r${WRITEUP_REVISION}:${version}`;
}
