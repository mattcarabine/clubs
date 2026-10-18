import {
  CONTROL_PREFIX,
  type RecordedRequest,
  type ReplyBody,
} from "../fake-anthropic/control.ts";
import { FAKE_ANTHROPIC_URL } from "./ports.ts";

/** Drives the fake Anthropic upstream's control API from a test. */
export const fakeAnthropic = {
  /** No scripted replies or failures, and no logged requests. */
  reset: () => post("reset"),

  /**
   * Answer the next Messages request with this text, or this object as JSON
   * (structured output). Unscripted requests get JSON fitting their schema.
   */
  reply: (content: ReplyBody["content"]) => post("reply", { content }),

  /**
   * Fail the next `count` requests with this HTTP status and API error type,
   * e.g. 500 `api_error`, or 400 `invalid_request_error` for a credit
   * balance too low.
   */
  failNext: (
    status: number,
    {
      count = 1,
      type,
      message,
    }: { count?: number; type?: string; message?: string } = {},
  ) => post("fail-next", { status, count, type, message }),

  /** Never answer the next `count` requests, so the Worker's call times out. */
  timeoutNext: (count = 1) => post("fail-next", { timeout: true, count }),

  /** Every Messages request received since the last reset, oldest first. */
  async requests(): Promise<RecordedRequest[]> {
    const res = await fetch(`${FAKE_ANTHROPIC_URL}${CONTROL_PREFIX}requests`);
    return res.json() as Promise<RecordedRequest[]>;
  },
};

async function post(action: string, body?: unknown): Promise<void> {
  const res = await fetch(`${FAKE_ANTHROPIC_URL}${CONTROL_PREFIX}${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `fake Anthropic ${action} failed: ${res.status} ${await res.text()}`,
    );
  }
}
