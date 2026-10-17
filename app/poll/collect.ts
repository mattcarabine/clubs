/**
 * The fetching half of a Poll: asks EA for everything one Poll needs.
 *
 * Kept free of D1 and Worker APIs so the same code can run as a Node script on
 * the home relay and push its result to the Worker (docs/adr/0005).
 */
import { type EaResponse, fetchEa } from "../ea/client.ts";
import { type ClubRef, type EaRequest, pollRequests } from "../ea/endpoints.ts";

export interface PollConfig {
  club: ClubRef;
  baseUrl: string;
  timeoutMs?: number;
}

export interface CollectedResponse {
  request: EaRequest;
  /** Epoch milliseconds when the request was sent. */
  fetchedAt: number;
  durationMs: number;
  response: EaResponse;
}

export interface CollectedPoll {
  startedAt: number;
  finishedAt: number;
  responses: CollectedResponse[];
  /** True when the Poll stopped early, so some requests were never sent. */
  aborted: boolean;
}

/**
 * Sends the Poll's requests one at a time. Stops at the first block (403/429)
 * or timeout: when Akamai or EA is refusing us, the remaining requests would
 * fail the same way and only spend subrequests.
 */
export async function collectPoll(
  config: PollConfig,
  now: () => number = Date.now,
): Promise<CollectedPoll> {
  const startedAt = now();
  const responses: CollectedResponse[] = [];
  const requests = pollRequests(config.club);

  for (const request of requests) {
    const fetchedAt = now();
    const response = await fetchEa(request, config);
    responses.push({
      request,
      fetchedAt,
      durationMs: now() - fetchedAt,
      response,
    });
    if (
      !response.ok &&
      (response.kind === "blocked" || response.kind === "timeout")
    ) {
      break;
    }
  }

  return {
    startedAt,
    finishedAt: now(),
    responses,
    aborted: responses.length < requests.length,
  };
}
