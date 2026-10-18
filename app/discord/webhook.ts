/**
 * One Discord webhook call. Never throws: a failure comes back with its
 * reason and, for a 429, how long Discord asked us to wait.
 */
import { errorMessage } from "~/lib/text";

export type WebhookResult =
  | { ok: true }
  | { ok: false; error: string; retryAfterMs?: number };

export async function postWebhook(
  url: string,
  body: unknown,
  timeoutMs: number,
): Promise<WebhookResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return { ok: true };
    const text = await res.text();
    return {
      ok: false,
      // Never the URL: it holds the webhook's token.
      error: `Discord answered ${res.status}: ${text.slice(0, 200)}`,
      ...(res.status === 429 && {
        retryAfterMs: retryAfterMs(text, res.headers.get("retry-after")),
      }),
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

/**
 * The wait a 429 asks for: the body's `retry_after` (seconds, fractional),
 * else the `Retry-After` header, else none. Exported for unit tests.
 */
export function retryAfterMs(body: string, header: string | null): number {
  let seconds = Number(header);
  try {
    const parsed = JSON.parse(body) as { retry_after?: unknown };
    if (typeof parsed.retry_after === "number") seconds = parsed.retry_after;
  } catch {
    // Not JSON: fall back to the header.
  }
  return Number.isFinite(seconds) && seconds > 0
    ? Math.ceil(seconds * 1000)
    : 0;
}
