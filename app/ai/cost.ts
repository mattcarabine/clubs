import type { ModelPrice } from "./config";

/** The tokens one call used, as the Messages API reports them. */
export interface TokenUsage {
  /** Uncached input tokens. */
  inputTokens: number;
  /** Includes thinking. */
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Two calls' tokens together, e.g. a reply and its rewrite. */
export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

/** A call's estimated cost in USD; null for a model with no price on file. */
export function estimateCost(
  usage: TokenUsage,
  price: ModelPrice | undefined,
): number | null {
  if (!price) return null;
  const dollars =
    usage.inputTokens * price.input +
    usage.outputTokens * price.output +
    usage.cacheReadTokens * price.cacheRead +
    usage.cacheWriteTokens * price.cacheWrite;
  return dollars / 1_000_000;
}
