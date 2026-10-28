// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import { win, withLineup } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-82: "Main position only", on by default, counts each Squad Member's
// Appearances in the Position Group they played most (CLUBS-23's Position
// Group picker is gone).

/** Squad Members that exist only in these specs. */
const MIXER = { id: "900000011", name: "Mixer Midfielder" };
const KEEPER = { id: "900000012", name: "Keeper Only" };

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so every total is exact.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

/**
 * Mixer: 3 Midfielder Appearances (1 goal each), then 2 as Forward (2 goals
 * each), so their main position is Midfielder. Keeper plays in goal in all 5.
 */
async function recordMixedPositions(
  fakeEa: { addMatch(body: AddMatchBody): Promise<void> },
  triggerPoll: () => Promise<void>,
) {
  const appearances = [
    ...Array<string>(3).fill("midfielder"),
    ...Array<string>(2).fill("forward"),
  ];
  for (const [i, pos] of appearances.entries()) {
    await fakeEa.addMatch(
      withLineup(win({ playedAt: new Date(Date.now() - (5 - i) * 60_000) }), [
        { player: MIXER, pos, goals: pos === "forward" ? 2 : 1 },
        { player: KEEPER, pos: "goalkeeper" },
      ]),
    );
  }
  await triggerPoll();
}

function filters(page: Page) {
  return page.getByRole("region", { name: "Stats filters" });
}

function positionGroup(page: Page) {
  return filters(page).getByRole("group", { name: "Position", exact: true });
}

function toggle(page: Page) {
  return positionGroup(page).getByRole("button", {
    name: "Main position only",
  });
}

/** Clicks the toggle, retrying a click that lands before hydration. */
async function flip(page: Page, expected: string | null) {
  await expect(async () => {
    await toggle(page).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("positions"), {
        timeout: 1000,
      })
      .toBe(expected);
  }).toPass();
}

function squadRow(page: Page, name: string) {
  return page
    .getByRole("table", { name: "Squad Members" })
    .locator("tbody tr")
    .filter({ has: page.getByRole("rowheader", { name: new RegExp(name) }) });
}

/** One Squad Member's cell in the column with this header. */
async function squadCell(page: Page, name: string, header: string) {
  const headers = await page
    .getByRole("table", { name: "Squad Members" })
    .getByRole("columnheader")
    .allTextContents();
  const index = headers.findIndex((h) => h.trim() === header);
  expect(index, `column ${header}`).toBeGreaterThan(0);
  return squadRow(page, name)
    .getByRole("cell")
    .nth(index - 1);
}

function trackedTile(page: Page, label: string) {
  return page
    .getByRole("region", { name: "Tracked totals", exact: true })
    .locator("div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("dd")
    .first();
}

test("a profile counts the main position by default, and every position when it's off", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordMixedPositions(fakeEa, triggerPoll);

  await page.goto(`/players/${MIXER.id}`);
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  await expect(trackedTile(page, "Appearances")).toHaveText("3");
  await expect(
    page.getByRole("table", { name: "Match rating" }).locator("tbody tr"),
  ).toHaveCount(3);
  await expect(
    page.getByText("3 Matches as Midfielder, with the rolling 5-Match average"),
  ).toBeVisible();

  // The breakdown lists every position, the main one marked and highlighted.
  const breakdown = page.getByRole("table", { name: "By Position Group" });
  const rows = breakdown.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  const midfielder = rows.filter({ hasText: "Midfielder" });
  await expect(midfielder).toHaveAttribute("data-highlighted", "true");
  await expect(midfielder).toContainText("Main");
  await expect(midfielder.locator("td").first()).toHaveText("3");
  const forward = rows.filter({ hasText: "Forward" });
  await expect(forward).not.toHaveAttribute("data-highlighted");
  await expect(forward.locator("td").first()).toHaveText("2");

  await flip(page, "all");
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  await expect(trackedTile(page, "Appearances")).toHaveText("5");
  await expect(
    page.getByText("5 Matches, with the rolling 5-Match average"),
  ).toBeVisible();
  // Still marked as the main position, but no longer the only one counted.
  await expect(midfielder).toContainText("Main");
  await expect(midfielder).not.toHaveAttribute("data-highlighted");

  // Back on: a clean URL.
  await flip(page, null);
  await expect(trackedTile(page, "Appearances")).toHaveText("3");
});

test("the Squad table counts each Squad Member's own main position", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordMixedPositions(fakeEa, triggerPoll);

  await page.goto("/squad");
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  await expect(await squadCell(page, MIXER.name, "Played")).toHaveText("3");
  await expect(await squadCell(page, MIXER.name, "G")).toHaveText("3");
  // Keeper's main position is in goal, so every Match counts.
  await expect(await squadCell(page, KEEPER.name, "Played")).toHaveText("5");

  await flip(page, "all");
  await expect(await squadCell(page, MIXER.name, "Played")).toHaveText("5");
  await expect(await squadCell(page, MIXER.name, "G")).toHaveText("7");
  await expect(await squadCell(page, KEEPER.name, "Played")).toHaveText("5");
});

test("old Position Group links fall back to main position only", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordMixedPositions(fakeEa, triggerPoll);

  for (const path of ["/squad?pos=forward", "/squad?positions=main"]) {
    await page.goto(path);
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    await expect(await squadCell(page, MIXER.name, "Played")).toHaveText("3");
  }
});

test("on EA totals the toggle is disabled with a reason", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordMixedPositions(fakeEa, triggerPoll);

  await page.goto("/squad?source=ea");
  await expect(positionGroup(page)).toBeVisible();
  const reason = "EA's totals can't be split by position";
  await expect(positionGroup(page)).toHaveAttribute("title", reason);
  await expect(toggle(page)).toBeDisabled();
  await expect(toggle(page)).toHaveAttribute("title", reason);
  await expect(toggle(page)).toHaveAccessibleDescription(reason);
});

test("the toggle is only on player pages", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordMixedPositions(fakeEa, triggerPoll);

  for (const path of ["/", "/opponents"]) {
    await page.goto(path);
    await expect(filters(page)).toBeVisible();
    await expect(positionGroup(page)).toHaveCount(0);
  }
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Main position only" }),
  ).toHaveCount(0);
});

test("no page shows the old Position Group chips", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordMixedPositions(fakeEa, triggerPoll);

  // Analysis needs wins and defeats for its Squad members table, so analysis.spec.ts covers it.
  for (const path of [
    "/squad",
    `/players/${MIXER.id}`,
    `/compare?players=${MIXER.id},${KEEPER.id}`,
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "All Positions" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Main position only" }),
    ).toHaveCount(1);
  }
});

test("the toggle fits a 375px phone", async ({ page, fakeEa, triggerPoll }) => {
  await recordMixedPositions(fakeEa, triggerPoll);
  await page.setViewportSize({ width: 375, height: 800 });

  for (const path of [
    "/squad",
    `/players/${MIXER.id}?positions=all`,
    "/squad?source=ea",
    `/compare?players=${MIXER.id},${KEEPER.id}`,
  ]) {
    await page.goto(path);
    await expect(positionGroup(page)).toBeVisible();
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits, path).toBe(true);
  }
});
