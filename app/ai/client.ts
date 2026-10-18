/**
 * The one place that talks to the Anthropic Messages API, through the
 * official SDK (it runs in Workers). Only the scheduled Poll reaches it
 * (docs/adr/0006); no route imports this module.
 *
 * Retries are the queue's job, across Polls with backoff, so the SDK's own
 * are off: one Poll makes at most one request per write-up.
 */
import Anthropic from "@anthropic-ai/sdk";

import { errorMessage } from "~/lib/text";

import type { TokenUsage } from "./cost";

export interface AiClientConfig {
  apiKey: string;
  /** The fake upstream's URL in E2E runs; the real API otherwise. */
  baseURL?: string;
  timeoutMs: number;
}

/** The body of one Messages API request, exactly as sent and stored. */
export type ModelRequest = Anthropic.MessageCreateParamsNonStreaming;

export interface ModelReply {
  text: string;
  /** The model that answered. */
  model: string;
  usage: TokenUsage;
}

/** A failed call. Billing and credit errors are failures like any other. */
export class AiCallError extends Error {
  constructor(
    message: string,
    /** Tokens already paid for, e.g. when the reply was cut off. */
    readonly usage?: TokenUsage,
    readonly model?: string,
  ) {
    super(message);
    this.name = "AiCallError";
  }
}

export async function callModel(
  config: AiClientConfig,
  request: ModelRequest,
): Promise<ModelReply> {
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: config.timeoutMs,
    maxRetries: 0,
  });
  let message: Anthropic.Message;
  try {
    message = await client.messages.create(request);
  } catch (error) {
    throw new AiCallError(describeError(error));
  }

  const usage = toUsage(message.usage);
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  if (message.stop_reason !== "end_turn" || !text) {
    throw new AiCallError(
      `Unusable reply: stop_reason ${message.stop_reason}`,
      usage,
      message.model,
    );
  }
  return { text, model: message.model, usage };
}

function toUsage(usage: Anthropic.Usage): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

function describeError(error: unknown): string {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "Timed out";
  if (error instanceof Anthropic.APIError) {
    return `${error.status ?? "no status"} ${error.message}`;
  }
  return errorMessage(error);
}
