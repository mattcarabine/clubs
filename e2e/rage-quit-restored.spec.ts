import {
  dnf,
  OUR_CLUB_ID,
  WIPED_STATS,
  win,
} from "./support/match-builders.ts";
import {
  bare,
  KABEEBLE,
  lineup,
  lineupCell,
  playing,
  TINBS,
} from "./support/match-events.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-87: the real score of a Rage Quit, the stats EA wipes when a player
// leaves early, and a player whose minutes EA lost.

test.beforeEach(async ({ fakeEa }) => {
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

test("a rage quit EA recorded as 3-0 shows the real score", async ({
  page,
  fakeEa,
  triggerPoll,
  db,
}) => {
  const awarded = dnf({ ourWin: true, realScore: [2, 0] });
  const stood = dnf({ ourWin: true, goalsFor: 4, goalsAgainst: 0 });
  await fakeEa.addMatch(awarded);
  await fakeEa.addMatch(stood);
  await triggerPoll();

  const stored = await db.rows("matches");
  expect(
    stored.find((m) => m.match_id === awarded.match.matchId),
  ).toMatchObject({
    goals_for: 2,
    goals_against: 0,
    result: "win",
    awarded_goals_for: 3,
    awarded_goals_against: 0,
  });
  expect(stored.find((m) => m.match_id === stood.match.matchId)).toMatchObject({
    goals_for: 4,
    awarded_goals_for: null,
    awarded_goals_against: null,
  });

  await page.goto(`/matches/${awarded.match.matchId}`);
  await expect(page.getByRole("region", { name: "Score" })).toContainText(
    "A Bloo Bloo 2, Bunch of bums 0",
  );
  const note = page.getByRole("complementary", { name: "Rage quit" });
  await expect(note).toContainText(
    "This is the score when they left. EA records it as 3-0.",
  );

  await page.goto(`/matches/${stood.match.matchId}`);
  await expect(note).toBeVisible();
  await expect(note).not.toContainText("EA records it as");
});

test("a player who left early gets their goals, assists, shots and passes back", async ({
  page,
  fakeEa,
  triggerPoll,
  db,
}) => {
  // We quit: EA zeroes Kabeeble's named stats but keeps what he did.
  const match = playing(
    bare(dnf({ ourWin: false })),
    OUR_CLUB_ID,
    KABEEBLE,
    { 214: 2, 11: 1, 217: 3, 218: 1, 215: 20, 216: 4 },
    WIPED_STATS,
  );
  await fakeEa.addMatch(match);
  await triggerPoll();

  const rows = await db.rows("appearances");
  expect(rows.find((a) => a.player_id === KABEEBLE)).toMatchObject({
    goals: 2,
    assists: 1,
    shots: 4,
    passes_made: 20,
    pass_attempts: 24,
  });

  await page.goto(`/matches/${match.match.matchId}`);
  const ours = lineup(page, "A Bloo Bloo");
  await expect(await lineupCell(ours, "Kabeeble", "G")).toHaveText("2");
  await expect(await lineupCell(ours, "Kabeeble", "A")).toHaveText("1");
  await expect(
    ours.getByRole("row").filter({ hasText: "Kabeeble" }),
  ).not.toContainText("Rage quit");
});

test("a player whose minutes EA lost still played", async ({
  page,
  fakeEa,
  triggerPoll,
  db,
}) => {
  const match = win();
  Object.assign(match.match.players[OUR_CLUB_ID][TINBS], {
    secondsPlayed: "0",
    rating: "3.00",
    goals: "1",
    shots: "3",
    passesmade: "22",
    passattempts: "27",
  });
  await fakeEa.addMatch(match);
  await triggerPoll();

  const rows = await db.rows("appearances");
  const longest = Math.max(...rows.map((a) => Number(a.seconds_played)));
  expect(rows.find((a) => a.player_id === TINBS)).toMatchObject({
    goals: 1,
    rating: null,
    seconds_played: longest,
  });

  await page.goto(`/matches/${match.match.matchId}`);
  const row = lineup(page, "A Bloo Bloo")
    .getByRole("row")
    .filter({ hasText: "tinbs_irl" });
  await expect(row).not.toContainText("Rage quit");
  await expect(
    await lineupCell(lineup(page, "A Bloo Bloo"), "tinbs_irl", "G"),
  ).toHaveText("1");
});
