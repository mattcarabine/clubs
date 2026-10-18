import type { Locator, Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import {
  dnf,
  type Lineup,
  lasting,
  loss,
  win,
  withLineup,
  withShots,
} from "./support/match-builders.ts";
import { daysAgo, record } from "./support/record.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-48: gaps in EA's data are not performances. A player who drops out
// (0 minutes, a 3.0) is never counted, and our side of a DNF we quit is left
// out of every stat, while the Match still counts in the record.

/** Squad Members that exist only in these specs. */
const ALPHA = { id: "948000001", name: "Alpha Gap" };
const BRAVO = { id: "948000002", name: "Bravo Gap" };

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so every count is exact.
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

/** Alpha drops out of a Win (0 minutes, a 3.0). */
const droppedOut: Lineup[number] = {
  player: ALPHA,
  rating: 3,
  stats: { secondsPlayed: "0" },
};

/**
 * Two full Wins with Alpha on an 8.0, a Win Alpha dropped out of, and a
 * DNF we quit after 20 minutes with Alpha on a 3.0. Bravo plays them all.
 */
function alphaMatches(): AddMatchBody[] {
  const bravo = { player: BRAVO, rating: 7 };
  return [
    withLineup(win(daysAgo(4)), [{ player: ALPHA, rating: 8 }, bravo]),
    withLineup(win(daysAgo(3)), [{ player: ALPHA, rating: 8 }, bravo]),
    withLineup(win(daysAgo(2)), [droppedOut, bravo]),
    withLineup(lasting(dnf({ ourWin: false, ...daysAgo(1) }), 20), [
      { player: ALPHA, rating: 3 },
      bravo,
    ]),
  ];
}

/** One Squad Member's cell on the Squad table, in the column with this header. */
async function squadCell(page: Page, name: string, header: string) {
  const table = page.getByRole("table", { name: "Squad Members" });
  const headers = await table.getByRole("columnheader").allTextContents();
  const index = headers.findIndex((h) => h.trim() === header);
  expect(index, `column ${header}`).toBeGreaterThan(0);
  return table
    .locator("tbody tr")
    .filter({ has: page.getByRole("rowheader", { name: new RegExp(name) }) })
    .getByRole("cell")
    .nth(index - 1);
}

test("the Squad table counts neither a 0-minute Appearance nor a DNF we quit", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, alphaMatches());

  await page.goto("/squad");
  await expect(await squadCell(page, ALPHA.name, "Apps")).toHaveText("2");
  await expect(await squadCell(page, ALPHA.name, "Rating")).toHaveText("8.0");
  await expect(await squadCell(page, BRAVO.name, "Apps")).toHaveText("3");
});

test("the profile plots only counted Appearances", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, alphaMatches());

  await page.goto(`/players/${ALPHA.id}`);
  const ratings = page
    .getByRole("table", { name: "Match rating" })
    .locator("tbody tr");
  await expect(ratings).toHaveCount(2);
  for (const row of await ratings.all()) {
    await expect(row.locator("td").first()).toHaveText("8.0");
  }
});

/** A's figures on Compare's table for one stat. */
function compareFigure(table: Locator, label: string) {
  return table
    .locator("tbody tr")
    .filter({
      has: table.page().getByRole("rowheader", { name: label, exact: true }),
    })
    .getByRole("cell")
    .first()
    .locator("[data-figure]");
}

test("Compare leaves out our stats from a DNF we quit, but its record still counts the loss", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, alphaMatches());

  await page.goto(`/compare?players=${ALPHA.id},${BRAVO.id}`);
  const headline = page.getByRole("table", { name: "Headline stats" });
  await expect(compareFigure(headline, "Appearances")).toHaveText("2");
  const teamRecord = page.getByRole("table", { name: "Team record" });
  // The two full Wins and the DNF we quit; never the Win Alpha dropped out of.
  await expect(compareFigure(teamRecord, "Played")).toHaveText("3");
  await expect(compareFigure(teamRecord, "Lost")).toHaveText("1");
});

test("the Outcome Split leaves our stats from a DNF we quit out of the per-90s, but counts the loss", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [
    ...[9, 8, 7].map((d) => withShots(lasting(win(daysAgo(d)), 90), 10)),
    ...[6, 5, 4].map((d) => withShots(lasting(loss(daysAgo(d)), 90), 4)),
    // EA keeps no shots for us after we quit; counted, it would drag 4.0 down.
    withShots(lasting(dnf({ ourWin: false, ...daysAgo(3) }), 20), 0),
  ]);

  await page.goto("/analysis");
  await expect(
    page.getByRole("region", { name: "Top findings", exact: true }),
  ).toContainText("3 Wins and 4 Dropped Points");
  const shots = page
    .getByRole("table", { name: "Performance in Wins and Dropped Points" })
    .locator("tbody tr")
    .filter({ has: page.getByRole("rowheader", { name: "Shots per 90" }) });
  await expect(shots.getByRole("cell").nth(0)).toHaveText("10.0");
  await expect(shots.getByRole("cell").nth(1)).toHaveText("4.0");
});
