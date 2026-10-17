/**
 * The fetching half of a Poll: asks EA for everything one Poll needs.
 *
 * Kept free of D1 and Worker APIs so the same code can run as a Node script on
 * the home relay and push its result to the Worker (docs/adr/0005).
 */
import { type EaResponse, fetchEa } from "../ea/client.ts";
import {
  type ClubRef,
  type EaRequest,
  type MatchType,
  opponentRatingsRequest,
  pollRequests,
} from "../ea/endpoints.ts";
import {
  NO_RATING_STATE,
  opponentsToRate,
  type RatingState,
} from "./rating-targets.ts";

export interface PollConfig {
  club: ClubRef;
  baseUrl: string;
  timeoutMs?: number;
}

export interface CollectOptions {
  now?: () => number;
  /** Which Opponents still need rating; without it, every recent Match's Opponent is rated. */
  ratings?: RatingState;
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
 * Sends the Poll's requests one at a time, then one request for the
 * Opponents to rate, if any. Stops at the first block (403/429) or timeout:
 * when Akamai or EA is refusing us, the remaining requests would fail the same
 * way and only spend subrequests.
 */
export async function collectPoll(
  config: PollConfig,
  { now = Date.now, ratings = NO_RATING_STATE }: CollectOptions = {},
): Promise<CollectedPoll> {
  const startedAt = now();
  const responses: CollectedResponse[] = [];
  const finish = (aborted: boolean): CollectedPoll => ({
    startedAt,
    finishedAt: now(),
    responses,
    aborted,
  });

  /** Sends one request; false when the Poll should stop. */
  async function send(request: EaRequest): Promise<boolean> {
    const fetchedAt = now();
    const response = await fetchEa(request, config);
    responses.push({
      request,
      fetchedAt,
      durationMs: now() - fetchedAt,
      response,
    });
    return (
      response.ok ||
      !(response.kind === "blocked" || response.kind === "timeout")
    );
  }

  for (const request of pollRequests(config.club)) {
    if (!(await send(request))) return finish(true);
  }

  const opponents = opponentsToRate(
    matchesPayloads(responses),
    config.club.clubId,
    ratings,
    now(),
  );
  if (opponents.length) {
    // Last, so a failure here costs nothing else; the next Poll retries.
    await send(opponentRatingsRequest(config.club.platform, opponents));
  }
  return finish(false);
}

function matchesPayloads(responses: readonly CollectedResponse[]) {
  return responses.flatMap(({ request, response }) =>
    request.endpoint === "clubs/matches" && response.ok
      ? [{ matchType: request.variant as MatchType, json: response.json }]
      : [],
  );
}
