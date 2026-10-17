import { describe, expect, it } from "vitest";

import type { EaMatch } from "../ea/types.ts";
import {
  NO_RATING_STATE,
  opponentsToRate,
  RATING_WINDOW_MS,
} from "./rating-targets.ts";

const OUR_CLUB = "332191";

/** A Match against `opponent`, played at `playedAt` (epoch ms). */
function match(matchId: string, opponent: string, playedAt: number): EaMatch {
  return {
    matchId,
    timestamp: Math.floor(playedAt / 1000),
    clubs: {
      [OUR_CLUB]: { result: "1", goals: "2" },
      [opponent]: { result: "2", goals: "1" },
    },
    players: {},
  };
}

const now = Date.parse("2026-10-17T20:00:00Z");
const minutesAgo = (minutes: number) => now - minutes * 60_000;
const league = (...matches: EaMatch[]) => [
  { matchType: "leagueMatch" as const, json: matches },
];

describe("opponentsToRate", () => {
  it("rates the Opponents of Matches played within the window, each once", () => {
    const payloads = league(
      match("1", "100", minutesAgo(5)),
      match("2", "100", minutesAgo(30)),
      match("3", "200", minutesAgo(59)),
    );
    expect(opponentsToRate(payloads, OUR_CLUB, NO_RATING_STATE, now)).toEqual([
      "100",
      "200",
    ]);
  });

  it("stops retrying once the window has closed", () => {
    const payloads = league(
      match("1", "100", now - RATING_WINDOW_MS),
      match("2", "200", now - RATING_WINDOW_MS - 1000),
    );
    expect(opponentsToRate(payloads, OUR_CLUB, NO_RATING_STATE, now)).toEqual([
      "100",
    ]);
  });

  it("skips Matches already rated", () => {
    const payloads = league(
      match("1", "100", minutesAgo(5)),
      match("2", "200", minutesAgo(5)),
    );
    const state = { ratedMatchIds: new Set(["1"]), backfillOpponents: [] };
    expect(opponentsToRate(payloads, OUR_CLUB, state, now)).toEqual(["200"]);
  });

  it("adds the backfill's Opponents after the recent ones, without repeats", () => {
    const payloads = league(match("1", "100", minutesAgo(5)));
    const state = {
      ratedMatchIds: new Set<string>(),
      backfillOpponents: ["300", "100"],
    };
    expect(opponentsToRate(payloads, OUR_CLUB, state, now)).toEqual([
      "100",
      "300",
    ]);
  });

  it("asks for nothing when there is nothing to rate", () => {
    expect(opponentsToRate(league(), OUR_CLUB, NO_RATING_STATE, now)).toEqual(
      [],
    );
  });
});
