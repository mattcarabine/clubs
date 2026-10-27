/**
 * CLUBS-14: the Poll detects a new Season when the current-season
 * leaderboard's games played goes down.
 */
import { leaderboardWithGamesPlayed } from "./support/leaderboard.ts";
import { friendly, loss, win } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

interface SeasonRow {
  number: number;
  started_at: number;
}

interface MatchRow {
  match_id: string;
  played_at: number;
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

test("after a gap in Polls, Season 2 starts at its first Match, not at the Poll that saw the reset", async ({
  fakeEa,
  triggerPoll,
  db,
}) => {
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
  await fakeEa.setPayload("clubs/matches", [], "playoffMatch");
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(126),
  );
  await triggerPoll();

  // While no Poll ran, Season 1 ended with a loss and Season 2 began with
  // two League Matches (and a Friendly, which EA's games played skips). All
  // of them arrive in the Poll that sees games played drop to 2.
  const lastPoll = Math.floor(Date.now() / 1000);
  const second = (n: number) => new Date((lastPoll + n) * 1000);
  const lastOfSeason1 = loss({ kickOff: second(1), matchId: "season-1-last" });
  const firstOfSeason2 = win({ kickOff: second(2), matchId: "season-2-first" });
  for (const match of [
    lastOfSeason1,
    firstOfSeason2,
    friendly({ kickOff: second(3) }),
    win({ kickOff: second(4), matchId: "season-2-second" }),
  ]) {
    await fakeEa.addMatch(match);
  }
  // The Poll must see every kick-off as played.
  const allPlayed = second(5).getTime();
  await new Promise((resolve) => setTimeout(resolve, allPlayed - Date.now()));
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(2),
  );
  await triggerPoll();

  const kickOff = new Map(
    (await db.rows<MatchRow>("matches")).map((row) => [
      row.match_id,
      row.played_at,
    ]),
  );
  expect(await db.rows<SeasonRow>("seasons")).toEqual([
    { number: 1, started_at: 0 },
    { number: 2, started_at: kickOff.get("season-2-first") },
  ]);
  expect(kickOff.get("season-1-last")).toBeLessThan(
    kickOff.get("season-2-first") ?? 0,
  );
});
