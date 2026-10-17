// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import { dnf, draw, friendly, loss, win } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-6: the FilterBar rewrites the URL and the page's totals follow it.
// Runs against /test/stats, the test-only page that mounts the FilterBar.

const DAY_MS = 24 * 60 * 60 * 1000;

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so totals are exact whatever today's date.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

/** The value shown on the record tile with this label. */
function tile(page: Page, label: string) {
  return page
    .getByRole("region", { name: "Record" })
    .locator("div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("dd")
    .first();
}

async function expectRecord(
  page: Page,
  record: {
    played: string;
    wdl: string;
    goals: string;
    points: string;
    dnf: string;
  },
) {
  await expect(tile(page, "Played")).toHaveText(record.played);
  await expect(tile(page, "W-D-L")).toHaveText(record.wdl);
  await expect(tile(page, "Goals")).toHaveText(record.goals);
  await expect(tile(page, "Points")).toHaveText(record.points);
  await expect(tile(page, "DNF")).toHaveText(record.dnf);
}

function filterButton(page: Page, name: string) {
  return page
    .getByRole("region", { name: "Stats filters" })
    .getByRole("button", { name, exact: true });
}

async function expectPressed(page: Page, name: string, pressed: boolean) {
  await expect(filterButton(page, name)).toHaveAttribute(
    "aria-pressed",
    String(pressed),
  );
}

function searchParam(page: Page, key: string) {
  return new URL(page.url()).searchParams.get(key);
}

test("toggling filters updates the URL and the totals", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  for (const match of [
    win(),
    win(),
    loss(),
    dnf(),
    friendly({ goalsFor: 2, goalsAgainst: 1 }),
    draw({ playedAt: new Date(Date.now() - 40 * DAY_MS) }),
  ]) {
    await fakeEa.addMatch(match);
  }
  await triggerPoll();

  await page.goto("/test/stats");

  // Defaults: Competitive Matches, DNF included, all dates.
  await expectPressed(page, "League", true);
  await expectPressed(page, "Playoff", true);
  await expectPressed(page, "Friendly", false);
  await expectPressed(page, "Include DNF", true);
  await expectPressed(page, "All", true);
  await expectRecord(page, {
    played: "5",
    wdl: "3-1-1",
    goals: "12-7",
    points: "10",
    dnf: "1",
  });
  // The DNF Match is counted and flagged.
  await expect(
    page
      .getByRole("region", { name: "Matches" })
      .getByText("DNF", { exact: true }),
  ).toHaveCount(1);

  await filterButton(page, "Friendly").click();
  await expect
    .poll(() => searchParam(page, "types"))
    .toBe("league,playoff,friendly");
  await expectRecord(page, {
    played: "6",
    wdl: "4-1-1",
    goals: "14-8",
    points: "13",
    dnf: "1",
  });

  await filterButton(page, "Include DNF").click();
  await expect.poll(() => searchParam(page, "dnf")).toBe("0");
  await expectRecord(page, {
    played: "5",
    wdl: "3-1-1",
    goals: "11-8",
    points: "10",
    dnf: "0",
  });

  await filterButton(page, "Last 30 days").click();
  await expect.poll(() => searchParam(page, "range")).toBe("30d");
  await expectRecord(page, {
    played: "4",
    wdl: "3-0-1",
    goals: "9-6",
    points: "9",
    dnf: "0",
  });

  // Back to the defaults: the filter leaves the URL entirely.
  await filterButton(page, "Friendly").click();
  await filterButton(page, "Include DNF").click();
  await filterButton(page, "All").click();
  await expect.poll(() => new URL(page.url()).search).toBe("");
  await expectRecord(page, {
    played: "5",
    wdl: "3-1-1",
    goals: "12-7",
    points: "10",
    dnf: "1",
  });
});

test("a filtered URL restores the filter on load", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(win());
  await fakeEa.addMatch(dnf({ ourWin: false }));
  await fakeEa.addMatch(friendly({ goalsFor: 1, goalsAgainst: 1 }));
  await triggerPoll();

  await page.goto("/test/stats?types=friendly&dnf=0");

  await expectPressed(page, "Friendly", true);
  await expectPressed(page, "League", false);
  await expectPressed(page, "Include DNF", false);
  await expectRecord(page, {
    played: "1",
    wdl: "0-1-0",
    goals: "1-1",
    points: "1",
    dnf: "0",
  });
  // The only selected Match Type cannot be turned off.
  await expect(filterButton(page, "Friendly")).toBeDisabled();
});

test("Last 10 counts only the 10 most recent Matches", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // EA returns at most 10 Matches per Poll, so record 12 over two Polls.
  const start = Date.now() - 2 * DAY_MS;
  const at = (minutes: number) => new Date(start + minutes * 60_000);
  for (let i = 0; i < 6; i++) await fakeEa.addMatch(win({ playedAt: at(i) }));
  await triggerPoll();
  for (let i = 6; i < 12; i++) await fakeEa.addMatch(loss({ playedAt: at(i) }));
  await triggerPoll();

  await page.goto("/test/stats");
  await expect(tile(page, "Played")).toHaveText("12");

  await filterButton(page, "Last 10").click();
  await expect.poll(() => searchParam(page, "range")).toBe("last10");
  await expect(tile(page, "Played")).toHaveText("10");
  await expect(tile(page, "W-D-L")).toHaveText("4-0-6");
});

test("the minimum Appearances stepper hides Squad Members below it", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  for (let i = 0; i < 3; i++) await fakeEa.addMatch(win());
  await triggerPoll();

  await page.goto("/test/stats");
  const squad = page.getByRole("table", { name: "Squad Members" });
  await expect(squad.getByRole("row").nth(1)).toBeAttached();

  await page.getByRole("button", { name: "More minimum Appearances" }).click();
  await expect.poll(() => searchParam(page, "minApps")).toBe("4");
  await expect(page.getByText("No Squad Members")).toBeVisible();

  await page.getByRole("button", { name: "Fewer minimum Appearances" }).click();
  await expect.poll(() => searchParam(page, "minApps")).toBeNull();
  await expect(squad.getByRole("row").nth(1)).toBeAttached();
});

test("on a phone the FilterBar is one scrolling row, not a screenful", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/test/stats");
  const bar = page.getByRole("region", { name: "Stats filters" });
  await expect(filterButton(page, "League")).toBeVisible();
  const box = await bar.boundingBox();
  // One row of legends and chips, about 80px; wrapped it was over 300px.
  expect(box?.height).toBeLessThan(120);
  // The rest of the chips are reachable by scrolling the bar itself.
  // Retry the click: one that lands before hydration does nothing.
  await expect(async () => {
    await filterButton(page, "Last 30 days").click();
    await expect
      .poll(() => searchParam(page, "range"), { timeout: 1000 })
      .toBe("30d");
  }).toPass();
});

test("the FilterBar fits a 375px phone without horizontal page scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/test/stats");
  await expect(filterButton(page, "League")).toBeVisible();
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fits).toBe(true);
});
