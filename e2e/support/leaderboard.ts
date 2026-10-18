import { readFileSync } from "node:fs";
import path from "node:path";

import { fixtureFileName } from "../../app/ea/endpoints.ts";
import { FIXTURES_DIR, OUR_CLUB_ID } from "./match-builders.ts";

/**
 * The recorded current-season leaderboard with Our Club's `gamesPlayed` set,
 * for `fakeEa.setPayload("currentSeasonLeaderboard/search", ...)`. A drop in
 * `gamesPlayed` between Polls starts a new Season. `currentDivision` is EA's
 * Division (1 = Elite to 6 = Division 5); the recording has 3 (Division 2).
 * `stats` sets any other of Our Club's fields, e.g. `wins`.
 */
export function leaderboardWithGamesPlayed(
  gamesPlayed: number,
  {
    currentDivision,
    stats = {},
  }: { currentDivision?: number; stats?: Record<string, number> } = {},
): Record<string, unknown>[] {
  const file = fixtureFileName({
    endpoint: "currentSeasonLeaderboard/search",
    variant: "",
  });
  const clubs: Record<string, unknown>[] = JSON.parse(
    readFileSync(path.join(FIXTURES_DIR, file), "utf8"),
  );
  const division =
    currentDivision === undefined
      ? {}
      : { currentDivision: String(currentDivision) };
  return clubs.map((club) =>
    club.clubId === OUR_CLUB_ID
      ? {
          ...club,
          ...Object.fromEntries(
            Object.entries(stats).map(([key, value]) => [key, String(value)]),
          ),
          gamesPlayed: String(gamesPlayed),
          ...division,
        }
      : club,
  );
}
