/**
 * Which Opponents a Poll asks EA to rate. Pure and free of D1 and Worker APIs,
 * so the fetching half of the Poll can use it on the home relay too
 * (docs/adr/0005). The D1 side lives in `./ratings.ts`.
 *
 * A Skill Rating is only "at the time" if it is read close to the Match, so a
 * new Match is rated, and retried after a failure, only within
 * `RATING_WINDOW_MS` of being played. Matches recorded before ratings were
 * captured (or first seen after that window) are backfilled instead, a few
 * Opponents per Poll, with the Opponent's current rating.
 */
import type { MatchType } from "../ea/endpoints.ts";
import { parseMatches } from "../ea/parse.ts";

/** How long after a Match its Opponent Rating still counts as "at the time". */
export const RATING_WINDOW_MS = 60 * 60 * 1000;

/** The backfill's per-Poll cap, so it never crowds out a Poll's own work. */
export const BACKFILL_OPPONENTS_PER_POLL = 5;

/** What the Poll knows from D1 before it asks EA for Opponent Ratings. */
export interface RatingState {
  /** Matches played within the rating window that already have an Opponent Rating. */
  ratedMatchIds: ReadonlySet<string>;
  /** Opponents of unrated Matches played before the window, for the backfill. */
  backfillOpponents: readonly string[];
}

export const NO_RATING_STATE: RatingState = {
  ratedMatchIds: new Set(),
  backfillOpponents: [],
};

/** One `clubs/matches` response from this Poll. */
export interface MatchesPayload {
  matchType: MatchType;
  json: unknown;
}

/**
 * The Opponents to rate in this Poll, each once: those of Matches in this
 * Poll's responses played within the rating window and not yet rated, then
 * the backfill's.
 */
export function opponentsToRate(
  payloads: readonly MatchesPayload[],
  ourClubId: string,
  state: RatingState,
  now: number,
): string[] {
  const windowStart = now - RATING_WINDOW_MS;
  const recent = payloads.flatMap(({ matchType, json }) =>
    parseMatches(json, matchType, ourClubId)
      .filter(
        (match) =>
          match.playedAt.getTime() >= windowStart &&
          !state.ratedMatchIds.has(match.matchId),
      )
      .map((match) => match.opponentClubId),
  );
  return [...new Set([...recent, ...state.backfillOpponents])];
}
