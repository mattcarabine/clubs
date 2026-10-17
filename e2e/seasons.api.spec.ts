/**
 * CLUBS-14: the Poll detects a new Season when the current-season
 * leaderboard's games played goes down.
 */
import { leaderboardWithGamesPlayed } from "./support/leaderboard.ts";
import { expect, test } from "./support/test.ts";

interface SeasonRow {
  number: number;
  started_at: number;
}

interface SnapshotRow {
  source: string;
  taken_at: number;
  stats: string;
}

test("Season 2 starts at the Snapshot where season games played dropped from 31 to 2", async ({
  fakeEa,
  triggerPoll,
  db,
}) => {
  for (const gamesPlayed of [30, 31, 2]) {
    await fakeEa.setPayload(
      "currentSeasonLeaderboard/search",
      leaderboardWithGamesPlayed(gamesPlayed),
    );
    await triggerPoll();
  }

  const leaderboard = (await db.rows<SnapshotRow>("snapshots")).filter(
    (row) => row.source === "currentSeasonLeaderboard/search",
  );
  expect(leaderboard.map((row) => JSON.parse(row.stats).gamesPlayed)).toEqual([
    30, 31, 2,
  ]);

  // Season 1 started before tracking began.
  expect(await db.rows<SeasonRow>("seasons")).toEqual([
    { number: 1, started_at: 0 },
    { number: 2, started_at: leaderboard[2].taken_at },
  ]);
});

test("an unchanged or rising leaderboard keeps the one Season", async ({
  fakeEa,
  triggerPoll,
  db,
}) => {
  for (const gamesPlayed of [30, 30, 31]) {
    await fakeEa.setPayload(
      "currentSeasonLeaderboard/search",
      leaderboardWithGamesPlayed(gamesPlayed),
    );
    await triggerPoll();
  }

  expect(await db.rows<SeasonRow>("seasons")).toEqual([
    { number: 1, started_at: 0 },
  ]);
});
