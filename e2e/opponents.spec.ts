// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import type { fakeEa as FakeEaClient } from "./support/fake-ea.ts";
import { draw, loss, win } from "./support/match-builders.ts";
import { against } from "./support/opponent.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-12: head-to-head records on /opponents and /opponents/:clubId.

/** The Opponent of every Match the builders make (from the recorded fixture). */
const CLUB_X = { clubId: "356611", name: "Bunch of bums" };
const CLUB_Y = { clubId: "700001", name: "Northside Athletic" };

type FakeEa = typeof FakeEaClient;

const HOUR_MS = 60 * 60 * 1000;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR_MS);

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so the records are exact.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

/** Two wins and a loss against X, and one win against Y. */
async function seedHeadToHead(
  fakeEa: FakeEa,
  triggerPoll: () => Promise<void>,
) {
  await fakeEa.addMatch(
    win({
      matchId: "9001",
      playedAt: hoursAgo(30),
      goalsFor: 3,
      goalsAgainst: 1,
    }),
  );
  await fakeEa.addMatch(
    loss({
      matchId: "9002",
      playedAt: hoursAgo(20),
      goalsFor: 1,
      goalsAgainst: 3,
    }),
  );
  await fakeEa.addMatch(
    win({
      matchId: "9003",
      playedAt: hoursAgo(10),
      goalsFor: 2,
      goalsAgainst: 0,
    }),
  );
  await fakeEa.addMatch(
    against(CLUB_Y, win({ matchId: "9004", playedAt: hoursAgo(5) })),
  );
  await triggerPoll();
}

function recordsTable(page: Page) {
  return page.getByRole("table", { name: "Head-to-head records" });
}

/** P, W, D, L, GF, GA, GD and Win % for one Opponent's row. */
async function opponentRow(page: Page, name: string) {
  const row = recordsTable(page)
    .getByRole("row")
    .filter({
      has: page.getByRole("rowheader", { name }),
    });
  await expect(row).toHaveCount(1);
  return (await row.getByRole("cell").allTextContents()).slice(0, 8);
}

function filterButton(page: Page, name: string) {
  return page
    .getByRole("region", { name: "Stats filters" })
    .getByRole("button", { name, exact: true });
}

function matchLinks(page: Page) {
  return page
    .getByRole("region", { name: "Matches", exact: true })
    .getByRole("link");
}

test("the Opponents list shows each club's head-to-head record, most played first", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await seedHeadToHead(fakeEa, triggerPoll);

  await page.goto("/opponents");

  expect(await opponentRow(page, CLUB_X.name)).toEqual([
    "3",
    "2",
    "0",
    "1",
    "6",
    "4",
    "+2",
    "67%",
  ]);
  expect(await opponentRow(page, CLUB_Y.name)).toEqual([
    "1",
    "1",
    "0",
    "0",
    "3",
    "1",
    "+2",
    "100%",
  ]);

  // Most played is the default order, and X leads the page.
  await expect(recordsTable(page).getByRole("rowheader")).toHaveText([
    CLUB_X.name,
    CLUB_Y.name,
  ]);
  await expect(
    page.getByRole("link", {
      name: `A Bloo Bloo against ${CLUB_X.name}: 2 wins, 0 draws, 1 loss Most played`,
    }),
  ).toBeVisible();

  // Sortable: Last met puts the most recent meeting first.
  await recordsTable(page).getByRole("button", { name: "Last met" }).click();
  await expect(recordsTable(page).getByRole("rowheader")).toHaveText([
    CLUB_Y.name,
    CLUB_X.name,
  ]);
});

test("an Opponent's page lists exactly the Matches against them, newest first", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await seedHeadToHead(fakeEa, triggerPoll);

  await page.goto("/opponents");
  await recordsTable(page).getByRole("link", { name: CLUB_X.name }).click();
  await expect(page).toHaveURL(`/opponents/${CLUB_X.clubId}`);

  await expect(
    page.getByRole("heading", { level: 1, name: CLUB_X.name }),
  ).toBeVisible();
  await expect(matchLinks(page)).toHaveCount(3);
  const hrefs = await matchLinks(page).evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  );
  expect(hrefs).toEqual(["/matches/9003", "/matches/9002", "/matches/9001"]);

  const record = page.getByRole("region", { name: "Head-to-head record" });
  await expect(
    record.getByText(
      "A Bloo Bloo against Bunch of bums: 2 wins, 0 draws, 1 loss",
    ),
  ).toBeAttached();
  await expect(record.getByText("+2", { exact: true })).toBeVisible();

  // Top performers link to their Squad Member pages.
  const performers = page.getByRole("table", {
    name: "Top performers against them",
  });
  await expect(performers.getByRole("link").first()).toHaveAttribute(
    "href",
    /^\/players\/\d+$/,
  );
});

test("both pages respect the Match Type filter", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await seedHeadToHead(fakeEa, triggerPoll);
  await fakeEa.addMatch(
    draw({
      matchId: "9005",
      matchType: "playoffMatch",
      playedAt: hoursAgo(1),
      goalsFor: 4,
      goalsAgainst: 4,
    }),
  );
  await triggerPoll();

  // Competitive Matches by default: the Playoff counts.
  await page.goto("/opponents");
  expect(await opponentRow(page, CLUB_X.name)).toEqual([
    "4",
    "2",
    "1",
    "1",
    "10",
    "8",
    "+2",
    "50%",
  ]);

  await filterButton(page, "Playoff").click();
  await expect(page).toHaveURL(/types=league(&|$)/);
  expect(await opponentRow(page, CLUB_X.name)).toEqual([
    "3",
    "2",
    "0",
    "1",
    "6",
    "4",
    "+2",
    "67%",
  ]);

  // Only Playoffs: Y drops off the list and X's page shows one Match.
  await page.goto("/opponents?types=playoff");
  await expect(recordsTable(page).getByRole("rowheader")).toHaveText([
    CLUB_X.name,
  ]);
  await page.goto(`/opponents/${CLUB_X.clubId}?types=playoff`);
  await expect(matchLinks(page)).toHaveCount(1);
  await expect(matchLinks(page)).toHaveAttribute("href", "/matches/9005");
});

test("an Opponent with no Matches in the filter says so", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await seedHeadToHead(fakeEa, triggerPoll);
  await page.goto(`/opponents/${CLUB_Y.clubId}?types=playoff`);
  await expect(page.getByText("No Matches against them")).toBeVisible();
});

test("an unknown Opponent is a 404 with a way back to all Opponents", async ({
  page,
}) => {
  const res = await page.goto("/opponents/123456789");
  expect(res?.status()).toBe(404);
  await expect(page).toHaveTitle("A Bloo Bloo — Opponent not found");
  await expect(page.getByText("Opponent not found")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "All Opponents" }),
  ).toHaveAttribute("href", "/opponents");
});

test("no Opponent is crowned most played when every club was met once", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(win({ matchId: "9101", playedAt: hoursAgo(10) }));
  await fakeEa.addMatch(
    against(CLUB_Y, win({ matchId: "9102", playedAt: hoursAgo(5) })),
  );
  await triggerPoll();

  await page.goto("/opponents");
  await expect(recordsTable(page).getByRole("rowheader")).toHaveCount(2);
  await expect(page.getByText("Most played")).toHaveCount(0);
});

test("the Opponent header shows form only once there are 3 results", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await seedHeadToHead(fakeEa, triggerPoll);
  const form = page.locator("header").getByRole("list", {
    name: /^Form, oldest to newest/,
  });

  await page.goto(`/opponents/${CLUB_X.clubId}`);
  await expect(form).toHaveAccessibleName(
    "Form, oldest to newest: Win, Loss, Win",
  );

  await page.goto(`/opponents/${CLUB_Y.clubId}`);
  await expect(
    page.getByRole("heading", { level: 1, name: CLUB_Y.name }),
  ).toBeVisible();
  await expect(form).toHaveCount(0);
});

test("with no Matches the Opponents page explains what will fill it", async ({
  page,
}) => {
  await page.goto("/opponents");
  await expect(page.getByText("No Opponents yet")).toBeVisible();
});

test("both pages fit a 375px phone without horizontal page scroll", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await seedHeadToHead(fakeEa, triggerPoll);
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of ["/opponents", `/opponents/${CLUB_X.clubId}`]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits, path).toBe(true);
  }
});
