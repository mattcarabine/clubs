// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Locator, Page } from "@playwright/test";

import { OUR_CLUB_ID, win, withLineup } from "./support/match-builders.ts";
import { daysAgo } from "./support/record.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-61, CLUBS-64: a player who was sent off gets a small red card icon
// on their line-up row, beside the name like MOTM, for both clubs.

const CLUB_NAME = "A Bloo Bloo";
const MATCH_ID = "861000000000001";
const CLEAN = { id: "961000001", name: "Kept Calm" };
const SENT_OFF = { id: "961000002", name: "Saw Red" };
const OPPONENT_SENT_OFF = "Their Hothead";
let opponentName = "";

test.beforeEach(async ({ fakeEa, triggerPoll }) => {
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
  const body = withLineup(win({ matchId: MATCH_ID, ...daysAgo(1) }), [
    { player: CLEAN, rating: 8, stats: { redcards: "0" } },
    { player: SENT_OFF, rating: 5, stats: { redcards: "1" } },
  ]);
  // The Opponent's first player was sent off; the rest were not.
  const [opponentId, opponentSide] = Object.entries(body.match.players).find(
    ([id]) => id !== OUR_CLUB_ID,
  ) ?? [undefined, undefined];
  if (!opponentId || !opponentSide) throw new Error("No Opponent line-up");
  opponentName = body.match.clubs[opponentId]?.details?.name ?? opponentId;
  Object.values(opponentSide).forEach((player, i) => {
    player.redcards = i === 0 ? "1" : "0";
    if (i === 0) player.playername = OPPONENT_SENT_OFF;
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

const redCard = (scope: Locator) =>
  scope.getByRole("img", { name: "Red card", exact: true });

test("our player who was sent off is marked, and only them", async ({
  page,
}) => {
  await page.goto(`/matches/${MATCH_ID}`);
  const ours = lineup(page, CLUB_NAME);

  const card = redCard(playerRow(ours, SENT_OFF.name));
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("title", "Sent off");
  // An icon, not a chip with the words on it.
  await expect(ours.getByText("Red card", { exact: true })).toHaveCount(0);
  await expect(redCard(playerRow(ours, CLEAN.name))).toHaveCount(0);
  // A red card is not a rage quit: their stats still show.
  await expect(
    playerRow(ours, SENT_OFF.name).getByRole("cell").first(),
  ).toHaveText("5.0");
});

test("an Opponent's player who was sent off is marked too", async ({
  page,
}) => {
  await page.goto(`/matches/${MATCH_ID}`);
  const theirs = lineup(page, opponentName);
  await expect(redCard(playerRow(theirs, OPPONENT_SENT_OFF))).toBeVisible();
  await expect(redCard(theirs)).toHaveCount(1);
});

test("the icon fits a phone without widening the page", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/matches/${MATCH_ID}`);
  await expect(
    redCard(playerRow(lineup(page, CLUB_NAME), SENT_OFF.name)),
  ).toBeVisible();
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fits).toBe(true);
});
