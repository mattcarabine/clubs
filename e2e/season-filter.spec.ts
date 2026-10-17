import type { Page } from "@playwright/test";

import { leaderboardWithGamesPlayed } from "./support/leaderboard.ts";
import { loss, win } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-14: the FilterBar's Season picker narrows every stat to one Season.
// Runs against /test/stats, the test-only page with the record and the Squad
// leaderboard, until the Squad page mounts the FilterBar.

const HOUR_MS = 60 * 60 * 1000;

function tile(page: Page, label: string) {
  return page
    .getByRole("region", { name: "Record" })
    .locator("div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("dd")
    .first();
}

function seasonPicker(page: Page) {
  return page
    .getByRole("region", { name: "Stats filters" })
    .getByRole("combobox", { name: "Season" });
}

/** Every Squad Member's Appearances column. */
async function squadAppearances(page: Page): Promise<string[]> {
  const rows = page
    .getByRole("table", { name: "Squad Members" })
    .locator("tbody tr");
  return rows.evaluateAll((trs) =>
    trs.map((tr) => tr.querySelectorAll("td")[0]?.textContent ?? ""),
  );
}

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

test("filtering to Season 2 counts only the Matches after the boundary", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // Season 1: two wins, then season games played reaches 31.
  await fakeEa.addMatch(win({ playedAt: new Date(Date.now() - 2 * HOUR_MS) }));
  await fakeEa.addMatch(win({ playedAt: new Date(Date.now() - HOUR_MS) }));
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(31),
  );
  await triggerPoll();

  // EA resets the season totals: Season 2 starts at this Snapshot.
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(2),
  );
  await triggerPoll();

  // Season 2: one loss.
  await fakeEa.addMatch(loss({ playedAt: new Date(Date.now() + 60_000) }));
  await triggerPoll();

  await page.goto("/test/stats");
  await expect(seasonPicker(page)).toHaveValue("");
  await expect(tile(page, "Played")).toHaveText("3");
  expect(new Set(await squadAppearances(page))).toEqual(new Set(["3"]));

  await seasonPicker(page).selectOption({ label: "Season 2 (current)" });
  await expect
    .poll(() => new URL(page.url()).searchParams.get("season"))
    .toBe("2");
  await expect(tile(page, "Played")).toHaveText("1");
  await expect(tile(page, "W-D-L")).toHaveText("0-0-1");
  expect(new Set(await squadAppearances(page))).toEqual(new Set(["1"]));

  await seasonPicker(page).selectOption({ label: "Season 1" });
  await expect(tile(page, "Played")).toHaveText("2");
  await expect(tile(page, "W-D-L")).toHaveText("2-0-0");

  // Back to all Seasons: the Season leaves the URL.
  await seasonPicker(page).selectOption({ label: "All Seasons" });
  await expect
    .poll(() => new URL(page.url()).searchParams.has("season"))
    .toBe(false);
  await expect(tile(page, "Played")).toHaveText("3");
});

test("a shared Season URL restores the filter on load", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(win({ playedAt: new Date(Date.now() - HOUR_MS) }));
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(31),
  );
  await triggerPoll();
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(2),
  );
  await triggerPoll();

  await page.goto("/test/stats?season=2");
  await expect(seasonPicker(page)).toHaveValue("2");
  await expect(tile(page, "Played")).toHaveText("0");
});

test("the Season picker stays hidden until a second Season starts", async ({
  page,
  triggerPoll,
}) => {
  await triggerPoll();
  await page.goto("/test/stats");
  await expect(
    page
      .getByRole("region", { name: "Stats filters" })
      .getByRole("button", { name: "League", exact: true }),
  ).toBeVisible();
  await expect(seasonPicker(page)).toHaveCount(0);
});
