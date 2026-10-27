import type { Page } from "@playwright/test";

import { leaderboardWithGamesPlayed } from "./support/leaderboard.ts";
import { draw, loss, win } from "./support/match-builders.ts";
import { daysAgo, record } from "./support/record.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-60: Analysis's "Compare to". A date range compares with the same
// number of days just before it; a Season with another Season; a Campaign or
// "All dates" never.

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

const control = (page: Page) => page.getByRole("group", { name: "Compare to" });
const comparison = (page: Page) =>
  page.getByRole("region", { name: "Comparison" });

/** A headline figure's tile, by its label. */
function figure(page: Page, label: string) {
  return comparison(page)
    .locator("dl > div")
    .filter({ has: page.getByText(label, { exact: true }) });
}

test("the last 7 days compare with the 7 days before, and a shared link keeps it", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [
    // The 7 days before: 1 Win in 3, 4 scored, 6 conceded.
    win({ ...daysAgo(12), goalsFor: 2, goalsAgainst: 1 }),
    loss({ ...daysAgo(10), goalsFor: 1, goalsAgainst: 3 }),
    draw({ ...daysAgo(8), goalsFor: 1, goalsAgainst: 2 }),
    // The last 7 days: 2 Wins in 3.
    win({ ...daysAgo(5), goalsFor: 3, goalsAgainst: 0 }),
    win({ ...daysAgo(3), goalsFor: 2, goalsAgainst: 1 }),
    loss({ ...daysAgo(1), goalsFor: 0, goalsAgainst: 1 }),
  ]);

  await page.goto("/analysis?range=7d");
  await expect(comparison(page)).toHaveCount(0);
  await control(page).getByRole("button", { name: "The days before" }).click();
  await expect(page).toHaveURL(/[?&]vs=prev(&|$)/);

  await expect(comparison(page)).toContainText(
    /Last 7 days against 7 days before \(.+\): 3 matches then\./,
  );
  await expect(figure(page, "Win %")).toContainText("67%");
  await expect(figure(page, "Win %")).toContainText("was 33%");
  await expect(figure(page, "Win %")).toContainText("33 pts better");
  await expect(figure(page, "Goals conceded")).toContainText(
    "1.33 per match better",
  );
  await expect(
    comparison(page).getByRole("list", {
      name: "Win % by day of the week, compared",
    }),
  ).toBeVisible();
  // Each bar names its period in words, not only by colour.
  await expect(
    comparison(page)
      .getByRole("list", { name: "Win % by day of the week, compared" })
      .getByText(/^Now \d+%/)
      .first(),
  ).toBeVisible();
  // Every bucket here rests on a handful of Matches.
  await expect(
    comparison(page).getByText("Small sample").first(),
  ).toBeVisible();

  // A shared link opens the same view.
  await page.reload();
  await expect(figure(page, "Win %")).toContainText("was 33%");
  await expect(
    control(page).getByRole("button", { name: "The days before" }),
  ).toHaveAttribute("aria-pressed", "true");

  await control(page).getByRole("button", { name: "Nothing" }).click();
  await expect(comparison(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/vs=/);
});

test("an earlier period with no Matches says so, with no changes", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [win(daysAgo(2))]);

  await page.goto("/analysis?range=7d&vs=prev");
  await expect(
    comparison(page).getByText(/^No matches in 7 days before/),
  ).toBeVisible();
  await expect(comparison(page).getByText(/better|worse/)).toHaveCount(0);
});

test("Season 2 offers Season 1 first, and never with a Campaign or All dates", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const HOUR_MS = 60 * 60 * 1000;
  // Season 1: a Win and a loss, then EA resets the season totals.
  await fakeEa.addMatch(win({ playedAt: new Date(Date.now() - 3 * HOUR_MS) }));
  await fakeEa.addMatch(loss({ playedAt: new Date(Date.now() - 2 * HOUR_MS) }));
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(31),
  );
  await triggerPoll();
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(1),
  );
  // Season 2: one Win.
  await fakeEa.addMatch(win({ playedAt: new Date(Date.now() + 60_000) }));
  await triggerPoll();

  await page.goto("/analysis?season=2");
  // The Season before is the first choice after "Nothing".
  await expect(control(page).getByRole("button")).toHaveText([
    "Nothing",
    "Season 1",
  ]);
  await control(page).getByRole("button", { name: "Season 1" }).click();
  await expect(page).toHaveURL(/[?&]vs=1(&|$)/);
  await expect(comparison(page)).toContainText(
    "Season 2 against Season 1: 2 Matches then.",
  );
  await expect(figure(page, "Win %")).toContainText("was 50%");

  // Nothing to compare: every date, or a Campaign.
  await page.goto("/analysis");
  await expect(control(page)).toHaveCount(0);
  await page.goto("/analysis?range=7d&campaign=current&vs=prev");
  await expect(control(page)).toHaveCount(0);
  await expect(comparison(page)).toHaveCount(0);
});

test("the comparison fits a 375px phone", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [
    win(daysAgo(9)),
    loss(daysAgo(2)),
    win(daysAgo(1)),
  ]);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/analysis?range=7d&vs=prev");
  await expect(figure(page, "Win %")).toBeVisible();
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fits).toBe(true);
});
