/**
 * CLUBS-88: the Poll records Our Club's Skill Rating going into each new
 * Match, from our Snapshot one game before the one its result changed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { FIXTURES_DIR, loss, win } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

interface MatchRow {
  match_id: string;
  our_skill_rating: number | null;
  our_rating_before: number | null;
}

const [OURS] = JSON.parse(
  readFileSync(path.join(FIXTURES_DIR, "clubs-overallStats.json"), "utf8"),
);
const PLAYED = Number(OURS.gamesPlayed);

test.beforeEach(async ({ fakeEa }) => {
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

test("a new Match keeps our rating from before it and after it", async ({
  fakeEa,
  triggerPoll,
  db,
}) => {
  const ours = (gamesPlayed: number, skillRating: number) =>
    fakeEa.setPayload("clubs/overallStats", [
      {
        ...OURS,
        gamesPlayed: String(gamesPlayed),
        skillRating: String(skillRating),
      },
    ]);
  const ratings = async () =>
    Object.fromEntries(
      (await db.rows<MatchRow>("matches")).map((m) => [
        m.match_id,
        [m.our_rating_before, m.our_skill_rating],
      ]),
    );

  /**
   * A Match time a second or more after the last Poll, as in life: the Poll
   * that reads a result always comes after the Match before it ended.
   */
  const afterLastPoll = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1100));
    return {
      kickOff: new Date(Math.floor(Date.now() / 1000) * 1000),
    };
  };

  await ours(PLAYED, 1600);
  await triggerPoll();

  // A Win takes us from 1600 to 1620.
  await ours(PLAYED + 1, 1620);
  await fakeEa.addMatch(win({ matchId: "88001", ...(await afterLastPoll()) }));
  await triggerPoll();
  expect(await ratings()).toEqual({ "88001": [1600, 1620] });

  // Two results in one Poll: the first follows our last reading, and no
  // reading sits between it and the second.
  await ours(PLAYED + 3, 1610);
  const first = await afterLastPoll();
  const second = await afterLastPoll();
  await fakeEa.addMatch(loss({ matchId: "88002", ...first }));
  await fakeEa.addMatch(win({ matchId: "88003", ...second }));
  await triggerPoll();
  expect(await ratings()).toMatchObject({
    "88002": [1620, 1610],
    "88003": [null, 1610],
  });

  // EA lists a Match before it counts it: our last reading is still the
  // one from before it.
  await fakeEa.addMatch(win({ matchId: "88004", ...(await afterLastPoll()) }));
  await triggerPoll();
  expect((await ratings())["88004"]).toEqual([1610, 1610]);

  // Once EA catches up, the next one is rated as usual.
  await ours(PLAYED + 4, 1625);
  await triggerPoll();
  await ours(PLAYED + 5, 1590);
  await fakeEa.addMatch(loss({ matchId: "88005", ...(await afterLastPoll()) }));
  await triggerPoll();
  expect((await ratings())["88005"]).toEqual([1625, 1590]);
});
