// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import { loss, OUR_CLUB_ID, win } from "./support/match-builders.ts";
import { membersPayload } from "./support/members.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-10: the Squad Member profile at /players/:playerId.

/** Kabeeble: in every recorded Match and in both member Snapshot fixtures. */
const PLAYER_ID = "256171605";
const PROFILE = `/players/${PLAYER_ID}`;

/** Sets Kabeeble's rating in a built Match, as EA sends it ("7.50"). */
function rated(fake: AddMatchBody, rating: number): AddMatchBody {
  fake.match.players[OUR_CLUB_ID][PLAYER_ID].rating = rating.toFixed(2);
  return fake;
}

function section(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so every count is exact.
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

test("the rating chart plots every Appearance with a 5-Match rolling average", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const ratings = [6, 7, 8, 9, 7.5, 8.5];
  for (const rating of ratings) await fakeEa.addMatch(rated(win(), rating));
  await triggerPoll();

  await page.goto(PROFILE);
  await expect(
    page.getByRole("heading", { level: 1, name: "Kabeeble" }),
  ).toBeVisible();
  await expect(page.getByText(/^Tracking since /)).toBeVisible();

  const chart = page.getByRole("table", { name: "Match rating" });
  const points = chart.locator("tbody tr");
  await expect(points).toHaveCount(6);
  // Columns: point, Match rating, 5-Match average.
  await expect(points.last().locator("td")).toHaveText(["8.5", "8.0"]);
  await expect(points.first().locator("td")).toHaveText(["6.0", "6.0"]);

  // Goal contributions and pass % chart the same 6 Appearances.
  for (const name of ["Goal contributions", "Pass completion"]) {
    await expect(
      page.getByRole("table", { name }).locator("tbody tr"),
    ).toHaveCount(6);
  }
});

test("the EA totals block shows EA's career games apart from tracked Appearances", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.setPayload(
    "members/career/stats",
    membersPayload("members/career/stats", {
      Kabeeble: { gamesPlayed: "80" },
    }),
  );
  await fakeEa.addMatch(win());
  await fakeEa.addMatch(loss());
  await triggerPoll();

  await page.goto(PROFILE);
  const eaTotals = section(page, "EA totals");
  await expect(
    section(page, "Career (EA)")
      .getByRole("definition")
      .filter({ hasText: /^80$/ }),
  ).toBeVisible();
  await expect(eaTotals.getByText("2 Appearances")).toBeVisible();
  await expect(
    section(page, "Tracked totals")
      .locator("div")
      .filter({ has: page.getByText("Appearances", { exact: true }) })
      .locator("dd")
      .first(),
  ).toHaveText("2");
});

test("build progression lists each overall with its date", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(win());
  await fakeEa.setPayload(
    "members/stats",
    membersPayload("members/stats", { Kabeeble: { proOverall: "78" } }),
  );
  await triggerPoll();
  await fakeEa.setPayload(
    "members/stats",
    membersPayload("members/stats", { Kabeeble: { proOverall: "80" } }),
  );
  await triggerPoll();

  await page.goto(PROFILE);
  // Today in Europe/London, as the page writes dates: "17 Oct 2026".
  const today = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());
  const entries = section(page, "Build progression").getByRole("listitem");
  await expect(entries).toHaveCount(2);
  // Newest first.
  await expect(entries.nth(0)).toContainText("Overall 80");
  await expect(entries.nth(0)).toContainText("+2");
  await expect(entries.nth(0)).toContainText(today);
  await expect(entries.nth(1)).toContainText("Overall 78");
  await expect(entries.nth(1)).toContainText(today);
  // The header shows the current build.
  await expect(page.locator("header dl")).toContainText("80");
});

test("an unknown player ID is a 404 with a way back to the Squad", async ({
  page,
}) => {
  const response = await page.goto("/players/999999999");
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle("A Bloo Bloo — Squad Member not found");
  await expect(page.getByText("Squad Member not found")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Squad" }).last(),
  ).toHaveAttribute("href", "/squad");
});

test("the build plate shows position, not EA's unnamed play style code", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(win());
  await triggerPoll();

  await page.goto(PROFILE);
  const plate = page.locator("header dl");
  await expect(plate).toContainText("Position");
  await expect(plate).not.toContainText("Play style");
  await expect(page.getByText(/Style \d/)).toHaveCount(0);
});

test("best Matches link to their Match pages, best rating first", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const ratings = [6.1, 9.4, 7.2, 8.8, 5.5, 7.9, 6.6];
  const matches = ratings.map((rating) => rated(win(), rating));
  for (const match of matches) await fakeEa.addMatch(match);
  await triggerPoll();

  await page.goto(PROFILE);
  const best = section(page, "Best Matches").getByRole("link");
  await expect(best).toHaveCount(5);
  await expect(best.first()).toContainText("9.4");
  await expect(best.first()).toHaveAttribute(
    "href",
    `/matches/${matches[1].match.matchId}`,
  );
  await expect(best.last()).toContainText("6.6");
});

test("the profile fits a 375px phone without horizontal page scroll", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  for (const rating of [7.1, 8.2, 6.9]) {
    await fakeEa.addMatch(rated(win(), rating));
  }
  await triggerPoll();

  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(PROFILE);
  await expect(section(page, "Build progression")).toBeVisible();
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fits).toBe(true);
});
