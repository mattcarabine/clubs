import type { Locator, Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import {
  DROPPED_OUT,
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
  stats: DROPPED_OUT,
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

test("the Squad table leaves out a 0-minute Appearance but counts a DNF we quit (CLUBS-87)", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, alphaMatches());

  await page.goto("/squad");
  await expect(await squadCell(page, ALPHA.name, "Played")).toHaveText("3");
  // (8 + 8 + 3) / 3
  await expect(await squadCell(page, ALPHA.name, "Rating")).toHaveText("6.3");
  await expect(await squadCell(page, BRAVO.name, "Played")).toHaveText("4");
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
  // The two Wins and the DNF we quit; never the Win Alpha dropped out of.
  await expect(ratings).toHaveCount(3);
  await expect(ratings.locator("td").first()).toHaveText("8.0");
  await expect(ratings.last().locator("td").first()).toHaveText("3.0");
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

test("Compare counts our stats from a DNF we quit, and its record counts the loss", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, alphaMatches());

  await page.goto(`/compare?players=${ALPHA.id},${BRAVO.id}`);
  const headline = page.getByRole("table", { name: "Headline stats" });
  await expect(compareFigure(headline, "Appearances")).toHaveText("3");
  const teamRecord = page.getByRole("table", { name: "Team record" });
  // The two full Wins and the DNF we quit; never the Win Alpha dropped out of.
  await expect(compareFigure(teamRecord, "Played")).toHaveText("3");
  await expect(compareFigure(teamRecord, "Lost")).toHaveText("1");
});

const OUR_TABLE = "Performance in wins against draws and defeats";
const OPPONENT_TABLE =
  "Opponents' performance in our wins against our draws and defeats";

/** A club's Shots per 90 row on the Analysis page: in our Wins, then in our draws and defeats. */
function analysisShots(page: Page, table: string): Locator {
  return page
    .getByRole("table", { name: table, exact: true })
    .locator("tbody tr")
    .filter({ has: page.getByRole("rowheader", { name: "Shots per 90" }) })
    .getByRole("cell");
}

/** The Analysis page's Outcome Split section. */
function outcomeSplitSection(page: Page): Locator {
  return page.getByRole("region", { name: "Outcome Split", exact: true });
}

// CLUBS-93: with the wiped stats restored (CLUBS-87), a side's stats in a
// Match it rage quit count like any others.
test("the Outcome Split counts our stats from a Match we rage quit", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [
    ...[9, 8, 7].map((d) => withShots(lasting(win(daysAgo(d)), 90), 10)),
    ...[6, 5].map((d) => withShots(lasting(loss(daysAgo(d)), 90), 4)),
    // 4 shots in the 45 minutes before we quit is 8 per 90: (4 + 4 + 8) / 3.
    withShots(lasting(dnf({ ourWin: false, ...daysAgo(3) }), 45), 4),
  ]);

  await page.goto("/analysis");
  await expect(
    page.getByRole("region", { name: "Top findings", exact: true }),
  ).toContainText("3 wins and 3 draws and defeats");
  await expect(analysisShots(page, OUR_TABLE).nth(0)).toHaveText("10.0");
  await expect(analysisShots(page, OUR_TABLE).nth(1)).toHaveText("4.8");
  await expect(outcomeSplitSection(page)).not.toContainText("rage quit");
});

test("the Outcome Split counts the Opponent's stats from a Match they rage quit", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [
    ...[9, 8].map((d) =>
      withShots(lasting(win(daysAgo(d)), 90), 6, "opponent"),
    ),
    // 6 shots in the 45 minutes before they quit is 12 per 90.
    withShots(lasting(dnf({ ourWin: true, ...daysAgo(6) }), 45), 6, "opponent"),
    ...[5, 4, 3].map((d) =>
      withShots(lasting(loss(daysAgo(d)), 90), 9, "opponent"),
    ),
  ]);

  await page.goto("/analysis");
  // (6 + 6 + 6) shots over 225 minutes.
  await expect(analysisShots(page, OPPONENT_TABLE).nth(0)).toHaveText("7.2");
  await expect(analysisShots(page, OPPONENT_TABLE).nth(1)).toHaveText("9.0");
});
