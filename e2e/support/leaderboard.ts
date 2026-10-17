import { readFileSync } from "node:fs";
import path from "node:path";

import { fixtureFileName } from "../../app/ea/endpoints.ts";
import { FIXTURES_DIR, OUR_CLUB_ID } from "./match-builders.ts";

/**
 * The recorded current-season leaderboard with Our Club's `gamesPlayed` set,
 * for `fakeEa.setPayload("currentSeasonLeaderboard/search", ...)`. A drop in
 * `gamesPlayed` between Polls starts a new Season.
 */
export function leaderboardWithGamesPlayed(
  gamesPlayed: number,
): Record<string, unknown>[] {
  const file = fixtureFileName({
    endpoint: "currentSeasonLeaderboard/search",
    variant: "",
  });
  const clubs: Record<string, unknown>[] = JSON.parse(
    readFileSync(path.join(FIXTURES_DIR, file), "utf8"),
  );
  return clubs.map((club) =>
    club.clubId === OUR_CLUB_ID
      ? { ...club, gamesPlayed: String(gamesPlayed) }
      : club,
  );
}
