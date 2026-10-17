// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import { leaderboardWithGamesPlayed } from "./support/leaderboard.ts";
import { win } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-21: the FilterBar's date filter. "All", the presets Last 7 days,
// Last 30 days and Last year, and a custom from/to range of London calendar
// days, inclusive at both ends.

const DAY_MS = 24 * 60 * 60 * 1000;

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so totals are exact whatever today's date.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

function filters(page: Page) {
  return page.getByRole("region", { name: "Stats filters" });
}

function dateChip(page: Page, name: string | RegExp) {
  return filters(page)
    .getByRole("group", { name: "Dates" })
    .getByRole("button", { name, exact: typeof name === "string" });
}

function played(page: Page) {
  return page
    .getByRole("region", { name: "Record" })
    .locator("div")
    .filter({ has: page.getByText("Played", { exact: true }) })
    .locator("dd")
    .first();
}

function searchParams(page: Page) {
  return new URL(page.url()).searchParams;
}

/** Opens the custom range picker, retrying a click that lands before hydration. */
async function openPicker(page: Page) {
  const form = page.getByRole("form", { name: "Custom dates" });
  await expect(async () => {
    if (!(await form.isVisible())) await dateChip(page, /^Custom$|–/).click();
    await expect(form).toBeVisible({ timeout: 1000 });
  }).toPass();
  return form;
}

async function pickRange(page: Page, from: string, to: string) {
  const form = await openPicker(page);
  await form.getByLabel("From").fill(from);
  await form.getByLabel("To").fill(to);
  await form.getByRole("button", { name: "Apply" }).click();
  await expect(form).toBeHidden();
}

test("a custom range counts only the Matches inside it", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // 20:00 London (BST) on 1, 10 and 17 Oct 2026.
  for (const day of ["01", "10", "17"]) {
    await fakeEa.addMatch(win({ playedAt: new Date(`2026-10-${day}T19:00Z`) }));
  }
  await triggerPoll();

  await page.goto("/test/stats");
  await expect(played(page)).toHaveText("3");

  await pickRange(page, "2026-10-05", "2026-10-12");
  await expect
    .poll(() => searchParams(page).toString())
    .toBe("from=2026-10-05&to=2026-10-12");
  await expect(played(page)).toHaveText("1");
  await expect(dateChip(page, "5 Oct – 12 Oct")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("the end date includes a Match late that evening in London", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // 23:30 London on 12 Oct is 22:30 UTC in BST.
  await fakeEa.addMatch(win({ playedAt: new Date("2026-10-12T22:30Z") }));
  // 00:30 London on 13 Oct is still 12 Oct in UTC, but outside the range.
  await fakeEa.addMatch(win({ playedAt: new Date("2026-10-12T23:30Z") }));
  await triggerPoll();

  await page.goto("/test/stats?from=2026-10-12&to=2026-10-12");
  await expect(played(page)).toHaveText("1");
  await expect(dateChip(page, "12 Oct")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("Last 7 days is kept relative in the URL", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(win({ playedAt: new Date(Date.now() - 3 * DAY_MS) }));
  await fakeEa.addMatch(win({ playedAt: new Date(Date.now() - 10 * DAY_MS) }));
  await triggerPoll();

  await page.goto("/test/stats");
  await expect(played(page)).toHaveText("2");
  await expect(async () => {
    await dateChip(page, "Last 7 days").click();
    await expect
      .poll(() => searchParams(page).get("range"), { timeout: 1000 })
      .toBe("7d");
  }).toPass();
  await expect(played(page)).toHaveText("1");
  expect(searchParams(page).has("from")).toBe(false);

  // A shared link carries the preset, not dates.
  await page.reload();
  await expect(played(page)).toHaveText("1");
  await expect(dateChip(page, "Last 7 days")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await dateChip(page, "Last 30 days").click();
  await expect.poll(() => searchParams(page).get("range")).toBe("30d");
  await expect(played(page)).toHaveText("2");
});

test("All counts every Match and leaves the URL clean", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(win({ playedAt: new Date(Date.now() - 400 * DAY_MS) }));
  await fakeEa.addMatch(win({ playedAt: new Date(Date.now() - 3 * DAY_MS) }));
  await triggerPoll();

  await page.goto("/test/stats?range=1y");
  await expect(played(page)).toHaveText("1");

  await dateChip(page, "All").click();
  await expect.poll(() => new URL(page.url()).search).toBe("");
  await expect(played(page)).toHaveText("2");
  await expect(dateChip(page, "All")).toHaveAttribute("aria-pressed", "true");
});

for (const query of [
  "from=2026-10-12&to=2026-10-05",
  "from=2026-02-30&to=2026-03-02",
  "from=yesterday&to=today",
  "range=last10",
]) {
  test(`a bad range falls back to All: ?${query}`, async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    await fakeEa.addMatch(win({ playedAt: new Date("2026-10-01T19:00Z") }));
    await fakeEa.addMatch(win({ playedAt: new Date("2026-10-10T19:00Z") }));
    await triggerPoll();

    const response = await page.goto(`/test/stats?${query}`);
    expect(response?.status()).toBe(200);
    await expect(played(page)).toHaveText("2");
    await expect(dateChip(page, "All")).toHaveAttribute("aria-pressed", "true");
  });
}

test("the custom range combines with the Season filter", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // Season 1: Matches on 1 and 10 Oct.
  await fakeEa.addMatch(win({ playedAt: new Date("2026-10-01T19:00Z") }));
  await fakeEa.addMatch(win({ playedAt: new Date("2026-10-10T19:00Z") }));
  await triggerPoll();
  // EA resets the season totals: Season 2 starts now.
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(2),
  );
  await triggerPoll();
  await fakeEa.addMatch(win({ playedAt: new Date(Date.now() + 60_000) }));
  await triggerPoll();

  // The window is the intersection of the dates and the Season.
  await page.goto("/test/stats?from=2026-10-05&to=2099-12-31&season=1");
  await expect(played(page)).toHaveText("1");
  await page.goto("/test/stats?from=2026-10-05&to=2099-12-31&season=2");
  await expect(played(page)).toHaveText("1");
  await page.goto("/test/stats?from=2026-10-01&to=2026-10-12&season=2");
  await expect(played(page)).toHaveText("0");
});

test("Cancel closes the picker without changing the filter", async ({
  page,
}) => {
  await page.goto("/test/stats?range=30d");
  const form = await openPicker(page);
  await form.getByLabel("From").fill("2026-10-01");
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toBeHidden();
  expect(searchParams(page).toString()).toBe("range=30d");
});

test("Apply waits for both dates, in order", async ({ page }) => {
  await page.goto("/test/stats");
  const form = await openPicker(page);
  const apply = form.getByRole("button", { name: "Apply" });
  await form.getByLabel("From").fill("");
  await expect(apply).toBeDisabled();
  await form.getByLabel("From").fill("2026-10-12");
  await form.getByLabel("To").fill("2026-10-05");
  await expect(apply).toBeDisabled();
  await form.getByLabel("To").fill("2026-10-12");
  await expect(apply).toBeEnabled();
});

test("a range across New Year shows both years on its chip", async ({
  page,
}) => {
  await page.goto("/test/stats?from=2025-12-20&to=2026-01-05");
  await expect(dateChip(page, "20 Dec 2025 – 5 Jan 2026")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

const FILTER_PAGES = [
  "/squad",
  "/matches",
  "/opponents",
  "/trends",
  "/test/stats",
];

test("the picker fits a 375px phone on every page with the FilterBar", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(win());
  await triggerPoll();
  await page.setViewportSize({ width: 375, height: 800 });

  // The detail pages too: the first Squad Member's and Opponent's.
  const firstLink = async (from: string, prefix: string) => {
    await page.goto(from);
    const href = await page
      .locator(`main a[href^="${prefix}"]`)
      .first()
      .getAttribute("href");
    expect(href, `a link to ${prefix}`).toBeTruthy();
    return href ?? "";
  };
  const detailPages = [
    await firstLink("/squad", "/players/"),
    await firstLink("/opponents", "/opponents/"),
  ];
  for (const path of [...FILTER_PAGES, ...detailPages]) {
    await page.goto(path);
    const form = await openPicker(page);
    await expect(form.getByLabel("From")).toBeInViewport();
    await expect(form.getByRole("button", { name: "Apply" })).toBeInViewport();
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits, path).toBe(true);
  }
});
