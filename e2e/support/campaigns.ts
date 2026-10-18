import type { AddMatchBody } from "../fake-ea/control.ts";
import type { fakeEa as FakeEa } from "./fake-ea.ts";
import { leaderboardWithGamesPlayed } from "./leaderboard.ts";

/**
 * Seeding Campaigns (CLUBS-41): Campaigns are rebuilt from League Matches
 * played after a detected Season start, so a spec starts a Season, then
 * plays Matches after it.
 */
export interface CampaignHarness {
  fakeEa: typeof FakeEa;
  triggerPoll: () => Promise<void>;
}

/** Builds one Match at the kick-off `play` gives it. */
export type MatchAt = (options: { playedAt: Date }) => AddMatchBody;

/** Polls a full leaderboard, then a reset one: the second Poll starts Season 2. */
export async function startSeason(
  { fakeEa, triggerPoll }: CampaignHarness,
  currentDivision = 6,
) {
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(31, { currentDivision: 3 }),
  );
  await triggerPoll();
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(0, { currentDivision }),
  );
  await triggerPoll();
}

/** Serves Matches a minute apart, after the Season start, then Polls. */
export async function play(
  { fakeEa, triggerPoll }: CampaignHarness,
  matches: MatchAt[],
  currentDivision: number,
) {
  const start = Date.now();
  for (const [i, build] of matches.entries()) {
    await fakeEa.addMatch(
      build({ playedAt: new Date(start + (i + 1) * 60_000) }),
    );
  }
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(matches.length, { currentDivision }),
  );
  await triggerPoll();
}
