// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Locator, Page } from "@playwright/test";

import {
  type Lineup,
  OUR_CLUB_ID,
  win,
  withLineup,
} from "./support/match-builders.ts";
import { daysAgo } from "./support/record.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-53: EA records a player who rage quits with 0 seconds, a 3.0 and
// zeroed stats. The Match page says so on their line-up row instead of
// showing the zeroes as a performance.

const CLUB_NAME = "A Bloo Bloo";
const MATCH_ID = "853000000000001";
const STAYED = { id: "953000001", name: "Stayed Put" };
const QUITTER = { id: "953000002", name: "Walked Off" };
const OPPONENT_QUITTER = "Their Quitter";
let opponentName = "";

/** EA's record of a player who rage quit. */
const QUIT: Pick<Lineup[number], "rating" | "stats"> = {
  rating: 3,
  stats: { secondsPlayed: "0" },
};

test.beforeEach(async ({ fakeEa, triggerPoll }) => {
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
  const body = withLineup(win({ matchId: MATCH_ID, ...daysAgo(1) }), [
    { player: STAYED, rating: 8 },
    { player: QUITTER, ...QUIT },
  ]);
  // The Opponent's first player rage quit too.
  const [opponentId, opponentSide] = Object.entries(body.match.players).find(
    ([id]) => id !== OUR_CLUB_ID,
  ) ?? [undefined, undefined];
  if (!opponentId || !opponentSide) throw new Error("No Opponent line-up");
  opponentName = body.match.clubs[opponentId]?.details?.name ?? opponentId;
  const [first] = Object.values(opponentSide);
  Object.assign(first, {
    playername: OPPONENT_QUITTER,
    secondsPlayed: "0",
    rating: "3.00",
  });
  await fakeEa.addMatch(body);
  await triggerPoll();
});

function lineup(page: Page, clubName: string) {
  return page.getByRole("region", { name: `${clubName} line-up` });
}

function playerRow(table: Locator, name: string) {
  return table.getByRole("row", { name: new RegExp(`^${name}`) });
}

test("our player who rage quit is tagged, with dashes for stats", async ({
  page,
}) => {
  await page.goto(`/matches/${MATCH_ID}`);
  const ours = lineup(page, CLUB_NAME);

  const quitter = playerRow(ours, QUITTER.name);
  await expect(quitter.getByText("Rage quit", { exact: true })).toBeVisible();
  for (const cell of await quitter.getByRole("cell").all()) {
    await expect(cell).toHaveText("–");
  }

  // A player who stayed shows their real stats and no tag.
  const stayed = playerRow(ours, STAYED.name);
  await expect(stayed.getByText("Rage quit", { exact: true })).toHaveCount(0);
  await expect(stayed.getByRole("cell").first()).toHaveText("8.0");

  // The 3.0 never drags our average rating down.
  await expect(
    page
      .getByRole("region", { name: "Match stats" })
      .getByText(new RegExp(`^Average rating: ${CLUB_NAME} 8\\.0,`)),
  ).toBeAttached();
  await expect(page.getByRole("main")).not.toContainText("DNF");
});

test("an Opponent's player who rage quit is tagged too", async ({ page }) => {
  await page.goto(`/matches/${MATCH_ID}`);
  const theirs = lineup(page, opponentName);
  const quitter = playerRow(theirs, OPPONENT_QUITTER);
  await expect(quitter.getByText("Rage quit", { exact: true })).toBeVisible();
  await expect(quitter.getByRole("cell").first()).toHaveText("–");
  // Only the quitter is tagged.
  await expect(theirs.getByText("Rage quit", { exact: true })).toHaveCount(1);
});

test("the tag fits a phone without widening the page", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/matches/${MATCH_ID}`);
  await expect(
    playerRow(lineup(page, CLUB_NAME), QUITTER.name).getByText("Rage quit", {
      exact: true,
    }),
  ).toBeVisible();
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fits).toBe(true);
});
