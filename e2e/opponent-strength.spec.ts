// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import { loss, win } from "./support/match-builders.ts";
import { type RatedMatch, recordRated } from "./support/ratings.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-29: /analysis groups rated Matches by the Opponent's strength.

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so every count is exact.
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

/** `count` Matches at a rating gap (ours minus theirs), the first `wins` of them Wins. */
function rated(count: number, gap: number | null, wins: number): RatedMatch[] {
  return Array.from({ length: count }, (_, i) => ({
    gap,
    build: i < wins ? win() : loss(),
  }));
}

function section(page: Page) {
  return page.getByRole("region", {
    name: "By Opponent strength",
    exact: true,
  });
}

function strengthRow(page: Page, group: string) {
  return section(page)
    .getByRole("table", { name: "Results by Opponent strength" })
    .locator("tbody tr")
    .filter({ has: page.getByRole("rowheader", { name: group }) });
}

function findings(page: Page) {
  return page.getByRole("list", { name: "Top findings" }).getByRole("listitem");
}

test("rated Matches land in their strength group with its Win rate, and unrated ones are counted out", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordRated(fakeEa, triggerPoll, [
    // Opponents exactly 100 above ours count as Stronger.
    ...rated(2, -100, 0),
    ...rated(3, -250, 1),
    ...rated(4, 40, 2),
    ...rated(6, 100, 5),
    ...rated(2, null, 1),
  ]);

  await page.goto("/analysis");
  await expect(section(page)).toBeVisible();
  await expect(strengthRow(page, "Stronger").locator("td")).toContainText([
    "5",
    "1",
    "0",
    "4",
    "20%",
  ]);
  await expect(strengthRow(page, "Similar").locator("td")).toContainText([
    "4",
    "2",
    "0",
    "2",
    "50%",
  ]);
  await expect(strengthRow(page, "Weaker").locator("td")).toContainText([
    "6",
    "5",
    "0",
    "1",
    "83%",
  ]);
  await expect(
    section(page).getByText("2 Matches without Skill Ratings are left out."),
  ).toBeVisible();
  await expect(
    section(page)
      .getByRole("list", { name: "Win % by Opponent strength" })
      .getByRole("listitem"),
  ).toHaveCount(3);

  await expect(
    findings(page).filter({ hasText: "Opponent strength" }),
  ).toContainText(
    "Against stronger opponents we win 20% (5) vs 83% against weaker (6)",
  );
});

test("a group with fewer than 3 Matches is hidden and left out of the findings", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordRated(fakeEa, triggerPoll, [
    ...rated(5, -150, 0),
    ...rated(2, 0, 2),
    ...rated(2, 150, 2),
    ...rated(1, null, 1),
  ]);

  await page.goto("/analysis");
  await expect(strengthRow(page, "Stronger")).toBeVisible();
  await expect(strengthRow(page, "Similar")).toHaveCount(0);
  await expect(strengthRow(page, "Weaker")).toHaveCount(0);
  await expect(
    section(page).getByText(
      "1 Match without Skill Ratings is left out. Hidden with fewer than 3 matches: Similar (2), Weaker (2).",
    ),
  ).toBeVisible();
  await expect(
    findings(page).filter({ hasText: "Opponent strength" }),
  ).toHaveCount(0);
});

test("the section fits the screen without horizontal page scroll", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordRated(fakeEa, triggerPoll, [
    ...rated(3, -150, 1),
    ...rated(3, 0, 2),
    ...rated(3, 150, 3),
  ]);

  await page.goto("/analysis");
  await section(page).scrollIntoViewIfNeeded();
  await expect(strengthRow(page, "Weaker")).toBeVisible();
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fits).toBe(true);
});
