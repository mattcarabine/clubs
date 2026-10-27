// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import { win, withLineup } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-9: the Squad table at /squad.

/** Squad Members that exist only in these specs. */
const ALPHA = { id: "900000001", name: "Alpha Striker" };
const BRAVO = { id: "900000002", name: "Bravo Winger" };
/** Marked former by the test env's TEST_ROSTER (wrangler.jsonc). */
const FORMER = { id: "900000099", name: "Old Boy" };

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so every total is exact.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

function squadTable(page: Page) {
  return page.getByRole("table", { name: "Squad Members" });
}

function bodyRows(page: Page) {
  return squadTable(page).locator("tbody tr");
}

function memberRow(page: Page, name: string) {
  return bodyRows(page).filter({
    has: page.getByRole("rowheader", { name: new RegExp(name) }),
  });
}

/** One Squad Member's cell in the column with this header. */
async function memberCell(page: Page, name: string, header: string) {
  const headers = await squadTable(page)
    .getByRole("columnheader")
    .allTextContents();
  const index = headers.findIndex((h) => h.trim() === header);
  expect(index, `column ${header}`).toBeGreaterThan(0);
  // The first column is the row header, so data cells start one along.
  return memberRow(page, name)
    .getByRole("cell")
    .nth(index - 1);
}

/** Alpha: 3 goals in 2 Appearances. Bravo: 2 goals in 5. */
async function recordAlphaAndBravo(
  fakeEa: { addMatch(body: AddMatchBody): Promise<void> },
  triggerPoll: () => Promise<void>,
) {
  await fakeEa.addMatch(
    withLineup(win(), [
      { player: ALPHA, goals: 2 },
      { player: BRAVO, goals: 1 },
    ]),
  );
  await fakeEa.addMatch(
    withLineup(win(), [
      { player: ALPHA, goals: 1 },
      { player: BRAVO, goals: 1 },
    ]),
  );
  for (let i = 0; i < 3; i++) {
    await fakeEa.addMatch(withLineup(win(), [{ player: BRAVO }]));
  }
  await triggerPoll();
}

test("sorting by goals per 90 ranks the sharper finisher first", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordAlphaAndBravo(fakeEa, triggerPoll);
  await page.goto("/squad");

  // Default order: most Appearances first.
  await expect(bodyRows(page).first()).toContainText(BRAVO.name);
  await expect(await memberCell(page, ALPHA.name, "G")).toHaveText("3");
  await expect(await memberCell(page, BRAVO.name, "G")).toHaveText("2");

  await squadTable(page).getByRole("button", { name: "G/90" }).click();
  await expect(
    squadTable(page).getByRole("columnheader", { name: "G/90" }),
  ).toHaveAttribute("aria-sort", "descending");
  await expect(bodyRows(page).first()).toContainText(ALPHA.name);
  await expect(bodyRows(page).nth(1)).toContainText(BRAVO.name);
});

// CLUBS-62: red cards in total and per 90. EA sends no yellow cards.
test("red cards show in total and per 90, and sort", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const ninety = { secondsPlayed: "5400", redcards: "0" };
  await fakeEa.addMatch(
    withLineup(win(), [
      { player: ALPHA, stats: { ...ninety, redcards: "1" } },
      { player: BRAVO, stats: ninety },
    ]),
  );
  await fakeEa.addMatch(
    withLineup(win(), [
      { player: ALPHA, stats: ninety },
      { player: BRAVO, stats: ninety },
    ]),
  );
  await triggerPoll();
  await page.goto("/squad");

  await expect(await memberCell(page, ALPHA.name, "Red")).toHaveText("1");
  await expect(await memberCell(page, ALPHA.name, "Red/90")).toHaveText("0.50");
  await expect(await memberCell(page, BRAVO.name, "Red")).toHaveText("0");
  await expect(await memberCell(page, BRAVO.name, "Red/90")).toHaveText("0.00");

  await squadTable(page).getByRole("button", { name: "Red/90" }).click();
  await expect(bodyRows(page).first()).toContainText(ALPHA.name);
  await expect(page.getByText(/EA does not report yellow cards/)).toBeVisible();
});

// CLUBS-24: there is no threshold, so one Appearance is enough to be listed.
test("a Squad Member with one Appearance is listed by default", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(withLineup(win(), [{ player: ALPHA, goals: 1 }]));
  await triggerPoll();

  await page.goto("/squad");
  await expect(memberRow(page, ALPHA.name)).toBeVisible();
  await expect(await memberCell(page, ALPHA.name, "Apps")).toHaveText("1");
  await expect(page.getByText("1 Squad Member", { exact: true })).toBeVisible();
});

test("an old link with the removed threshold param loads and ignores it", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(withLineup(win(), [{ player: ALPHA }]));
  await triggerPoll();

  const response = await page.goto("/squad?minApps=5");
  expect(response?.status()).toBe(200);
  await expect(memberRow(page, ALPHA.name)).toBeVisible();
  await expect(page.getByRole("group", { name: /appearances/i })).toHaveCount(
    0,
  );
});

test("Former Squad Members show only when included", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  for (let i = 0; i < 3; i++) {
    await fakeEa.addMatch(
      withLineup(win(), [{ player: ALPHA }, { player: FORMER }]),
    );
  }
  await triggerPoll();
  await page.goto("/squad");

  await expect(
    page.getByRole("button", { name: "Current squad" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(memberRow(page, ALPHA.name)).toBeVisible();
  await expect(memberRow(page, FORMER.name)).toHaveCount(0);

  await page.getByRole("button", { name: "Include former" }).click();
  await expect(page).toHaveURL(/former=1/);
  await expect(memberRow(page, FORMER.name)).toContainText("Former");

  await page.getByRole("button", { name: "Current squad" }).click();
  await expect(memberRow(page, FORMER.name)).toHaveCount(0);
});

test("Playoff Appearances count only when Playoffs are included", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  for (let i = 0; i < 3; i++) {
    await fakeEa.addMatch(withLineup(win(), [{ player: ALPHA, goals: 1 }]));
  }
  await fakeEa.addMatch(
    withLineup(win({ matchType: "playoffMatch" }), [
      { player: ALPHA, goals: 4 },
    ]),
  );
  await triggerPoll();
  await page.goto("/squad");

  await expect(await memberCell(page, ALPHA.name, "Apps")).toHaveText("4");
  await expect(await memberCell(page, ALPHA.name, "G")).toHaveText("7");

  await page
    .getByRole("region", { name: "Stats filters" })
    .getByRole("button", { name: "Playoff", exact: true })
    .click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("types"))
    .toBe("league");
  await expect(await memberCell(page, ALPHA.name, "Apps")).toHaveText("3");
  await expect(await memberCell(page, ALPHA.name, "G")).toHaveText("3");
});

test("clicking a name opens that Squad Member's page", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  for (let i = 0; i < 3; i++) {
    await fakeEa.addMatch(withLineup(win(), [{ player: ALPHA }]));
  }
  await triggerPoll();
  await page.goto("/squad");

  await squadTable(page).getByRole("link", { name: ALPHA.name }).click();
  await expect(page).toHaveURL(`/players/${ALPHA.id}`);
});

test("the table scrolls inside itself on a 375px phone", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // Six Appearances with Form above the average rating, so the Form cell
  // carries its screen-reader note too.
  for (const rating of [5, 8, 8, 8, 8, 8]) {
    await fakeEa.addMatch(
      withLineup(win(), [{ player: ALPHA, rating }, { player: BRAVO }]),
    );
  }
  await triggerPoll();
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/squad");
  await expect(memberRow(page, ALPHA.name)).toContainText(
    "above average rating",
  );

  const pageFits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(pageFits).toBe(true);

  // The table is wider than the phone and scrolls in its own region,
  // with the name column pinned.
  const region = page.getByRole("region", { name: "Squad Members" });
  const scrolls = await region.evaluate(
    (el) => el.scrollWidth > el.clientWidth,
  );
  expect(scrolls).toBe(true);
  const name = squadTable(page).getByRole("link", { name: ALPHA.name });
  const before = await name.boundingBox();
  const scrolled = await region.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
    return el.scrollLeft;
  });
  expect(scrolled).toBeGreaterThan(0);
  await expect.poll(async () => (await name.boundingBox())?.x).toBe(before?.x);
});

test("an empty squad says how to fill it", async ({ page }) => {
  await page.goto("/squad");
  await expect(page.getByText("No Squad Members to show")).toBeVisible();
});
