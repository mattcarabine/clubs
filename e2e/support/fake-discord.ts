import {
  CONTROL_PREFIX,
  type FailNextBody,
  type RecordedPost,
} from "../fake-discord/control.ts";
import { FAKE_DISCORD_URL } from "./ports.ts";

/** Drives the fake Discord webhook's control API from a test. */
export const fakeDiscord = {
  /** No scripted failures, and no logged posts. */
  reset: () => post("reset"),

  /**
   * Fail the next `count` webhook calls with this status; a 429 asks the
   * Worker to wait `retryAfter` seconds.
   */
  failNext: (
    status: number,
    { count, retryAfter }: Omit<FailNextBody, "status"> = {},
  ) => post("fail-next", { status, count, retryAfter }),

  /** Every webhook call received since the last reset, oldest first. */
  async requests(): Promise<RecordedPost[]> {
    const res = await fetch(`${FAKE_DISCORD_URL}${CONTROL_PREFIX}requests`);
    return res.json() as Promise<RecordedPost[]>;
  },
};

async function post(action: string, body?: unknown): Promise<void> {
  const res = await fetch(`${FAKE_DISCORD_URL}${CONTROL_PREFIX}${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `fake Discord ${action} failed: ${res.status} ${await res.text()}`,
    );
  }
}
