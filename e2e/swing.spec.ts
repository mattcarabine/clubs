// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import {
  dnf,
  type Lineup,
  loss,
  win,
  withLineup,
} from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-70: Swing, our Win % when a Squad Member rates above their own
// average against below it, on Analysis and the profile.

const ALPHA = { id: "900000041", name: "Alpha Decider" };
const BRAVO = { id: "900000042", name: "Bravo Padder" };

test.beforeEach(async ({ fakeEa }) => {
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

/**
 * Four Wins and four defeats. Alpha rates 8 in the Wins and 6 in the
 * defeats; Bravo rates 7.5 or 6.5 whatever the result. Then a Match we rage
 * quit, which must change nothing.
 */
async function recordDeciderAndPadder(
  fakeEa: { addMatch(body: AddMatchBody): Promise<void> },
  triggerPoll: () => Promise<void>,
) {
  const matches: { build: (playedAt: Date) => AddMatchBody; lineup: Lineup }[] =
    [true, false, true, false, true, false, true, false].map((won, i) => ({
      build: (playedAt) => (won ? win({ playedAt }) : loss({ playedAt })),
      lineup: [
        { player: ALPHA, rating: won ? 8 : 6 },
        { player: BRAVO, rating: i < 4 ? 7.5 : 6.5 },
      ],
    }));
  matches.push({
    build: (playedAt) => dnf({ ourWin: false, playedAt }),
    lineup: [
      { player: ALPHA, rating: 9 },
      { player: BRAVO, rating: 3 },
    ],
  });
  for (const [i, { build, lineup }] of matches.entries()) {
    const playedAt = new Date(Date.now() - (matches.length - i) * 60_000);
    await fakeEa.addMatch(withLineup(build(playedAt), lineup));
    // EA lists only the latest 10 Matches, so Poll before any drop off.
    if (i % 5 === 4) await triggerPoll();
  }
  await triggerPoll();
}

function playerTable(page: Page) {
  return page.getByRole("table", {
    name: "Squad Members in Wins against draws and defeats",
  });
}

function playerRow(page: Page, name: string) {
  return playerTable(page)
    .locator("tbody tr")
    .filter({ has: page.getByRole("rowheader", { name }) });
}

test("Analysis leads its Squad Members table with Swing, biggest first", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordDeciderAndPadder(fakeEa, triggerPoll);
  await page.goto("/analysis");

  const table = playerTable(page);
  await expect(table.getByRole("columnheader").nth(1)).toHaveText(/Swing/);
  await expect(table.getByRole("rowheader").first()).toHaveText(ALPHA.name);

  // Swing, Win % above their average, Win % below it.
  const alpha = playerRow(page, ALPHA.name).getByRole("cell");
  await expect(alpha.nth(0)).toContainText("+100 pts");
  await expect(alpha.nth(0)).toContainText("Small sample");
  await expect(alpha.nth(1)).toHaveText("100%");
  await expect(alpha.nth(2)).toHaveText("0%");

  const bravo = playerRow(page, BRAVO.name).getByRole("cell");
  await expect(bravo.nth(0)).toContainText("0 pts");
  await expect(bravo.nth(1)).toHaveText("50%");
  await expect(bravo.nth(2)).toHaveText("50%");

  // On a 375px phone the page never scrolls sideways.
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(table).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("a Squad Member with too few Matches on one side has no Swing", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // Below their average only once, in one of three defeats.
  const ratings = [8, 8, 8, 8, 8, 6];
  for (const [i, rating] of ratings.entries()) {
    const playedAt = new Date(Date.now() - (ratings.length - i) * 60_000);
    const build = i < 3 ? win({ playedAt }) : loss({ playedAt });
    await fakeEa.addMatch(withLineup(build, [{ player: ALPHA, rating }]));
  }
  await triggerPoll();
  await page.goto("/analysis");
  const alpha = playerRow(page, ALPHA.name).getByRole("cell");
  await expect(alpha.nth(0)).toHaveText("–");

  await page.goto(`/players/${ALPHA.id}`);
  await expect(
    page.getByText(/when they play above their average/),
  ).toHaveCount(0);
});

test("the profile says the Swing in a sentence", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordDeciderAndPadder(fakeEa, triggerPoll);
  await page.goto(`/players/${ALPHA.id}`);
  const panel = page.getByRole("region", { name: "Wins vs Dropped Points" });
  await expect(panel).toContainText(
    "We win 100% when they play above their average and 0% when below (a Swing of +100 pts).",
  );
  await expect(panel.getByText("Small sample").first()).toBeVisible();
});
