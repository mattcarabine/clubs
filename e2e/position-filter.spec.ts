// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import { win, withLineup } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-23: the Position Group selection (?pos=) on the Squad table and a
// Squad Member's profile.

/** Squad Members that exist only in these specs. */
const MIXER = { id: "900000011", name: "Mixer Midfielder" };
const KEEPER = { id: "900000012", name: "Keeper Only" };

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so every total is exact.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

/**
 * Mixer: 3 Midfielder Appearances (1 goal each), then 2 as Forward (2 goals
 * each). Keeper plays in goal in all 5.
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
  return filters(page).getByRole("group", { name: "Position Group" });
}

function positionChip(page: Page, name: string) {
  return positionGroup(page).getByRole("button", { name, exact: true });
}

/** Clicks a chip, retrying a click that lands before hydration. */
async function choose(page: Page, name: string, expectedPos: string | null) {
  await expect(async () => {
    await positionChip(page, name).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("pos"), {
        timeout: 1000,
      })
      .toBe(expectedPos);
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

test("selecting Forward on a profile narrows totals and the chart, not the breakdown", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordMixedPositions(fakeEa, triggerPoll);

  await page.goto(`/players/${MIXER.id}`);
  await expect(trackedTile(page, "Appearances")).toHaveText("5");
  await expect(positionChip(page, "All Positions")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await choose(page, "Forward", "forward");
  await expect(positionChip(page, "Forward")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(positionChip(page, "All Positions")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(trackedTile(page, "Appearances")).toHaveText("2");
  await expect(
    page.getByRole("table", { name: "Match rating" }).locator("tbody tr"),
  ).toHaveCount(2);
  await expect(
    page.getByText("2 Matches as Forward, with the rolling 5-Match average"),
  ).toBeVisible();
  await expect(page.getByText("4 goals and", { exact: false })).toBeVisible();

  // The breakdown is the overview: both groups, Forward picked out.
  const breakdown = page.getByRole("table", { name: "By Position Group" });
  const rows = breakdown.locator("tbody tr");
  await expect(rows).toHaveCount(2);
  const forward = rows.filter({ hasText: "Forward" });
  await expect(forward).toHaveAttribute("data-highlighted", "true");
  await expect(forward).toContainText("Selected");
  await expect(forward.locator("td").first()).toHaveText("2");
  const midfielder = rows.filter({ hasText: "Midfielder" });
  await expect(midfielder).not.toHaveAttribute("data-highlighted");
  await expect(midfielder.locator("td").first()).toHaveText("3");

  // Back to All Positions: the unfiltered profile, and a clean URL.
  await choose(page, "All Positions", null);
  await expect(trackedTile(page, "Appearances")).toHaveText("5");
  await expect(
    page.getByText("5 Matches, with the rolling 5-Match average"),
  ).toBeVisible();
});

test("the Squad table counts only Appearances in the selected Position Groups", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordMixedPositions(fakeEa, triggerPoll);

  await page.goto("/squad?pos=forward,midfielder");
  await expect(positionChip(page, "Midfielder")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(positionChip(page, "Forward")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(await squadCell(page, MIXER.name, "Apps")).toHaveText("5");
  await expect(await squadCell(page, MIXER.name, "G")).toHaveText("7");
  // Keeper never played there: still listed, but every figure is "–".
  for (const header of ["Apps", "G", "Rating", "Form", "Saves"]) {
    await expect(await squadCell(page, KEEPER.name, header)).toHaveText("–");
  }
  await expect(
    page.getByText(/counting Appearances as Midfielder or Forward/),
  ).toBeVisible();

  await choose(page, "Midfielder", "forward");
  await expect(await squadCell(page, MIXER.name, "Apps")).toHaveText("2");
  await expect(await squadCell(page, MIXER.name, "G")).toHaveText("4");
});

test("with no Position Group selected the Squad table is unfiltered", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordMixedPositions(fakeEa, triggerPoll);

  for (const path of ["/squad", "/squad?pos=", "/squad?pos=striker"]) {
    await page.goto(path);
    await expect(positionChip(page, "All Positions")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(await squadCell(page, MIXER.name, "Apps")).toHaveText("5");
    await expect(await squadCell(page, KEEPER.name, "Apps")).toHaveText("5");
  }
});

test("on EA totals the Position Group chips are disabled with a reason", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordMixedPositions(fakeEa, triggerPoll);

  await page.goto("/squad?source=ea&pos=forward");
  await expect(positionGroup(page)).toBeVisible();
  const reason = "EA's totals can't be split by Position Group";
  await expect(positionGroup(page)).toHaveAttribute("title", reason);
  for (const name of [
    "All Positions",
    "Goalkeeper",
    "Defender",
    "Midfielder",
    "Forward",
  ]) {
    await expect(positionChip(page, name)).toBeDisabled();
    await expect(positionChip(page, name)).toHaveAttribute("title", reason);
  }
  await expect(positionChip(page, "Forward")).toHaveAccessibleDescription(
    reason,
  );
});

test("the Position Group control is only on player pages", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordMixedPositions(fakeEa, triggerPoll);

  for (const path of ["/matches", "/opponents", "/trends"]) {
    await page.goto(path);
    await expect(filters(page)).toBeVisible();
    await expect(positionGroup(page)).toHaveCount(0);
  }
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.getByRole("group", { name: "Position Group" })).toHaveCount(
    0,
  );
});

test("the Position Group control fits a 375px phone", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordMixedPositions(fakeEa, triggerPoll);
  await page.setViewportSize({ width: 375, height: 800 });

  for (const path of [
    "/squad?pos=forward",
    `/players/${MIXER.id}?pos=midfielder`,
    "/squad?source=ea",
  ]) {
    await page.goto(path);
    await expect(positionGroup(page)).toBeVisible();
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits, path).toBe(true);
  }
});
