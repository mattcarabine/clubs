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
// out of every stat, while the Match still counts in the record. CLUBS-56
// does the same for the Opponent's side of a Match they quit.

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

/** The Analysis page's Shots per 90 row: ours in Wins, ours in draws and defeats, then the Opponent's. */
function analysisShots(page: Page): Locator {
  return page
    .getByRole("table", {
      name: "Performance in wins against draws and defeats",
    })
    .locator("tbody tr")
    .filter({ has: page.getByRole("rowheader", { name: "Shots per 90" }) })
    .getByRole("cell");
}

/** The Analysis page's Outcome Split heading text, where the rage-quit note sits. */
function outcomeSplitSection(page: Page): Locator {
  return page.getByRole("region", { name: "Outcome Split", exact: true });
}

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
  ).toContainText("3 wins and 4 draws and defeats");
  await expect(analysisShots(page).nth(0)).toHaveText("10.0");
  await expect(analysisShots(page).nth(1)).toHaveText("4.0");
  await expect(outcomeSplitSection(page)).toContainText(
    "Leaves out our stats from 1 match we rage quit, since EA wipes the stats of a side that rage quits.",
  );
});

// CLUBS-56: EA zeroes the Opponent's side when they quit, just as it does ours.
test("the Outcome Split leaves the Opponent's zeroed stats from a Match they quit out of their per-90s", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [
    ...[9, 8, 7].map((d) =>
      withShots(lasting(win(daysAgo(d)), 90), 6, "opponent"),
    ),
    // They quit at 30 minutes and EA kept no shots for them; counted, it
    // would drag their 6.0 in our Wins down to 5.1.
    withShots(lasting(dnf({ ourWin: true, ...daysAgo(6) }), 30), 0, "opponent"),
    ...[5, 4, 3].map((d) =>
      withShots(lasting(loss(daysAgo(d)), 90), 9, "opponent"),
    ),
  ]);

  await page.goto("/analysis");
  await expect(
    page.getByRole("region", { name: "Top findings", exact: true }),
  ).toContainText("4 wins and 3 draws and defeats");
  await expect(analysisShots(page).nth(2)).toHaveText("6.0");
  await expect(analysisShots(page).nth(3)).toHaveText("9.0");
  await expect(outcomeSplitSection(page)).toContainText(
    "Leaves out opponents' stats from 1 match they rage quit, since EA wipes the stats of a side that rage quits.",
  );
});

test("the Outcome Split says nothing about rage quits when no one quit", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [
    ...[6, 5, 4].map((d) => win(daysAgo(d))),
    ...[3, 2, 1].map((d) => loss(daysAgo(d))),
  ]);

  await page.goto("/analysis");
  await expect(outcomeSplitSection(page)).toBeVisible();
  await expect(outcomeSplitSection(page)).not.toContainText("rage quit");
});
