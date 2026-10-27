// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import {
  dnf,
  loss,
  win,
  withLineup,
  withOpponentHumans,
} from "./support/match-builders.ts";
import { daysAgo, record } from "./support/record.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-49: /analysis groups Matches by how many humans the Opponent fielded.

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so every count is exact.
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

/** Our four Squad Members in every Match, so "against our numbers" is against 4. */
const OUR_FOUR = [1, 2, 3, 4].map((i) => ({
  player: { id: `90000004${i}`, name: `Squad Four ${i}` },
}));

let day = 60;

/** `count` Matches against `humans` Opponent humans, a day apart, the first `wins` of them Wins. */
function against(
  count: number,
  humans: number,
  wins: number,
  options: { matchType?: "playoffMatch" } = {},
): AddMatchBody[] {
  return Array.from({ length: count }, (_, i) =>
    withHumans(humans, (i < wins ? win : loss)({ ...nextDay(), ...options })),
  );
}

/** A built Match with our four and `humans` Opponent humans. */
function withHumans(humans: number, body: AddMatchBody): AddMatchBody {
  return withOpponentHumans(withLineup(body, OUR_FOUR), humans);
}

function nextDay() {
  day -= 1;
  return daysAgo(day);
}

function section(page: Page) {
  return page.getByRole("region", { name: "By Opponent humans", exact: true });
}

function humansRow(page: Page, label: string) {
  return section(page)
    .getByRole("table", { name: "Results by Opponent humans" })
    .locator("tbody tr")
    .filter({ has: page.getByRole("rowheader", { name: label, exact: true }) });
}

function bars(page: Page, chart: string) {
  return section(page).getByRole("list", { name: chart }).getByRole("listitem");
}

test("Matches land under their exact count, band and our numbers, and small counts are hidden", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [
    ...against(3, 2, 3),
    ...against(4, 4, 2),
    ...against(3, 6, 0),
    ...against(1, 7, 1),
  ]);

  await page.goto("/analysis");
  await expect(section(page)).toBeVisible();
  await expect(humansRow(page, "2 humans").locator("td")).toContainText([
    "3",
    "3",
    "0",
    "0",
    "100%",
  ]);
  await expect(humansRow(page, "4 humans").locator("td")).toContainText([
    "4",
    "2",
    "0",
    "2",
    "50%",
  ]);
  await expect(humansRow(page, "6 humans").locator("td")).toContainText([
    "3",
    "0",
    "0",
    "3",
    "0%",
  ]);
  await expect(humansRow(page, "7 humans")).toHaveCount(0);
  await expect(
    section(page).getByText("Hidden with fewer than 3 matches: 7 humans (1)."),
  ).toBeVisible();
  await expect(bars(page, "Win % by opponent humans")).toHaveCount(3);

  // Bands: 1–3 holds the 2s, 4–6 the 4s and 6s; 7–9 has only the one 7.
  await expect(bars(page, "Win % by band")).toHaveCount(2);
  await expect(bars(page, "Win % by band").first()).toContainText(
    "1–3 humans (3)",
  );
  await expect(bars(page, "Win % by band").nth(1)).toContainText(
    "4–6 humans (7)",
  );

  // Against our 4: slightly fewer (the 2s), the same (the 4s), slightly
  // more (the 6s); the 7 is 3 more, much more, with too few to show.
  const ours = bars(page, "Win % against our numbers");
  await expect(ours).toHaveCount(3);
  await expect(ours.nth(0)).toContainText("Slightly fewer (3)");
  await expect(ours.nth(1)).toContainText("Same (4)");
  await expect(ours.nth(2)).toContainText("Slightly more (3)");
  await expect(
    section(page).getByText("Hidden with fewer than 3 matches: Much more (1)."),
  ).toBeVisible();

  await expect(
    page
      .getByRole("list", { name: "Top findings" })
      .getByRole("listitem")
      .filter({ hasText: "Opponent humans" })
      .first(),
  ).toBeVisible();
});

test("each group shows how often we and the Opponent rage quit", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [
    ...against(3, 2, 3),
    // Against 8 (much more than our 4): we quit 2 of 4 and they quit 1.
    withHumans(8, dnf({ ourWin: false, ...nextDay() })),
    withHumans(8, dnf({ ourWin: false, ...nextDay() })),
    withHumans(8, dnf({ ourWin: true, ...nextDay() })),
    ...against(1, 8, 0),
  ]);

  await page.goto("/analysis");
  const againstOurs = section(page).getByRole("table", {
    name: "Results against our numbers",
  });
  await expect(
    againstOurs.getByRole("columnheader", { name: "We rage quit" }),
  ).toBeVisible();
  await expect(
    againstOurs.getByRole("columnheader", { name: "They rage quit" }),
  ).toBeVisible();
  await expect(section(page)).not.toContainText(/\bDNF\b|We quit|They quit/);
  const muchMore = againstOurs
    .locator("tbody tr")
    .filter({ has: page.getByRole("rowheader", { name: "Much more" }) });
  await expect(muchMore.locator("td")).toContainText([
    "4",
    "1",
    "0",
    "3",
    "25%",
    "50% (2)",
    "25% (1)",
  ]);
  await expect(humansRow(page, "2 humans").locator("td")).toContainText([
    "0% (0)",
    "0% (0)",
  ]);
});

test("the FilterBar applies to the section", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [
    ...against(6, 3, 3),
    ...against(3, 5, 0, { matchType: "playoffMatch" }),
  ]);

  await page.goto("/analysis");
  await expect(humansRow(page, "3 humans")).toBeVisible();
  await expect(humansRow(page, "5 humans")).toBeVisible();

  await page.goto("/analysis?types=league");
  await expect(humansRow(page, "3 humans").locator("td").first()).toHaveText(
    "6",
  );
  await expect(humansRow(page, "5 humans")).toHaveCount(0);
});

test("with every count under 3 Matches it says what each needs", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [
    ...against(2, 2, 2),
    ...against(2, 3, 1),
    ...against(2, 5, 0),
  ]);

  await page.goto("/analysis");
  await expect(
    section(page).getByText(
      "Hidden with fewer than 3 matches: 2 humans (2), 3 humans (2), 5 humans (2). Each number of humans needs at least 3 matches to show.",
    ),
  ).toBeVisible();
  await expect(
    section(page).getByRole("table", { name: "Results by Opponent humans" }),
  ).toHaveCount(0);
  // The 2s and 3s still make a band of 4.
  await expect(bars(page, "Win % by band")).toHaveCount(1);
});

test("the section fits the screen without horizontal page scroll", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [
    ...against(3, 2, 2),
    ...against(3, 4, 1),
    ...against(3, 8, 1),
  ]);

  await page.goto("/analysis");
  await section(page).scrollIntoViewIfNeeded();
  await expect(humansRow(page, "8 humans")).toBeVisible();
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fits).toBe(true);
});
