// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Locator, Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import { OUR_CLUB_ID, win } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-86: Match Events on the Match page and Compare.

const KABEEBLE = "256171605";
const TINBS = "380993182";
const OPPONENT_ID = "356611";
const THEIR_MIDFIELDER = "1011157123282";
const FULL_MATCH = 90 * 60;

type Events = Record<number, number>;

/** A built Match with every player's Match Events removed, so each test sets its own. */
function bare(fake: AddMatchBody): AddMatchBody {
  for (const players of Object.values(fake.match.players)) {
    for (const player of Object.values(players)) {
      for (const field of Object.keys(player)) {
        if (field.startsWith("match_event_aggregate_")) delete player[field];
      }
    }
  }
  return fake;
}

/** Gives one player exactly these Match Events over exactly 90 minutes. */
function playing(
  fake: AddMatchBody,
  clubId: string,
  playerId: string,
  events: Events,
  stats: Record<string, string> = {},
): AddMatchBody {
  Object.assign(fake.match.players[clubId][playerId], {
    secondsPlayed: String(FULL_MATCH),
    match_event_aggregate_0: Object.entries(events)
      .map(([code, count]) => `${code}:${count}`)
      .join(","),
    ...stats,
  });
  return fake;
}

function tapeRow(table: Locator, label: string) {
  return table.locator("tbody tr").filter({
    has: table.page().getByRole("rowheader", { name: label, exact: true }),
  });
}

/** Both sides' figures for a stat, and which side leads (0 left, 1 right, null neither). */
async function expectTape(
  table: Locator,
  label: string,
  figures: [string, string],
  leader: 0 | 1 | null,
) {
  const cells = tapeRow(table, label).getByRole("cell");
  for (const side of [0, 1] as const) {
    await expect(
      cells.nth(side).locator("[data-figure]"),
      `${label} side ${side}`,
    ).toHaveText(figures[side]);
    const leads = expect(cells.nth(side), `${label} leader, side ${side}`);
    if (leader === side) await leads.toHaveAttribute("data-leader", "true");
    else await leads.not.toHaveAttribute("data-leader");
  }
}

function lineup(page: Page, club: string) {
  return page.getByRole("table", { name: `${club} line-up` });
}

async function lineupCell(table: Locator, player: string, header: string) {
  const headers = await table.getByRole("columnheader").allTextContents();
  const index = headers.findIndex((h) => h.trim() === header);
  expect(index, `column ${header}`).toBeGreaterThan(0);
  return table
    .locator("tbody tr")
    .filter({
      has: table.page().getByRole("rowheader", { name: new RegExp(player) }),
    })
    .getByRole("cell")
    .nth(index - 1);
}

test.beforeEach(async ({ fakeEa }) => {
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

test("the Match page sets our players' stats against theirs", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const match = bare(win());
  playing(match, OUR_CLUB_ID, KABEEBLE, { 217: 3, 6: 2, 106: 1, 95: 1 });
  playing(match, OUR_CLUB_ID, TINBS, { 217: 1, 6: 1, 105: 1 });
  playing(match, OPPONENT_ID, THEIR_MIDFIELDER, { 217: 1, 6: 3, 107: 5, 2: 2 });
  await fakeEa.addMatch(match);
  await triggerPoll();

  await page.goto(`/matches/${match.match.matchId}`);
  const tape = page.getByRole("table", { name: "In more detail" });
  await expectTape(tape, "Shots on target", ["4", "1"], 0);
  await expectTape(tape, "Interceptions", ["3", "3"], null);
  // Fewer is better for these, so the lower figure leads.
  await expectTape(tape, "Ball lost", ["2", "5"], 0);
  await expectTape(tape, "Fouls", ["0", "2"], 0);
  await expectTape(tape, "Yellow cards", ["1", "0"], 1);
});

test("the Match page has no detail tape when EA sent a side no detail", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const match = playing(bare(win()), OUR_CLUB_ID, KABEEBLE, { 217: 3 });
  await fakeEa.addMatch(match);
  await triggerPoll();

  await page.goto(`/matches/${match.match.matchId}`);
  await expect(page.getByRole("table", { name: /line-up$/ })).toHaveCount(2);
  await expect(page.getByRole("table", { name: "In more detail" })).toHaveCount(
    0,
  );
});

test("line-ups show yellow cards and switch to each player's detail", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const match = bare(win());
  // Kabeeble: booked once (EA counts it three times over). tinbs_irl: two
  // yellows and the red they add up to.
  playing(match, OUR_CLUB_ID, KABEEBLE, {
    95: 2,
    213: 1,
    217: 3,
    152: 4,
    174: 7,
    108: 1,
    110: 2,
    6: 2,
    106: 5,
    2: 1,
  });
  playing(match, OUR_CLUB_ID, TINBS, { 95: 2 }, { redcards: "1" });
  await fakeEa.addMatch(match);
  await triggerPoll();

  await page.goto(`/matches/${match.match.matchId}`);
  const ours = lineup(page, "A Bloo Bloo");
  const row = (name: string) =>
    ours.getByRole("rowheader", { name: new RegExp(name) });
  await expect(
    row("Kabeeble").getByRole("img", { name: "Yellow card", exact: true }),
  ).toBeVisible();
  await expect(
    row("tinbs_irl").getByRole("img", { name: "2 yellow cards" }),
  ).toBeVisible();
  await expect(
    row("tinbs_irl").getByRole("img", { name: "Red card" }),
  ).toBeVisible();
  await expect(row("Loltown95").getByRole("img")).toHaveCount(0);

  // The basics by default; Detail swaps the columns on both line-ups.
  await expect(await lineupCell(ours, "Kabeeble", "G")).toBeVisible();
  const views = page.getByRole("group", { name: "Line-up stats to show" });
  await views.getByRole("button", { name: "Detail" }).click();
  for (const [header, value] of [
    ["OnT", "3"],
    ["Thr", "4"],
    ["Drb", "7"],
    ["Won", "3"],
    ["Int", "2"],
    ["Lost", "5"],
    ["Fls", "1"],
  ]) {
    await expect(await lineupCell(ours, "Kabeeble", header)).toHaveText(value);
  }
  // Phones have no hover, so the short headers are spelled out underneath.
  await expect(page.getByRole("region", { name: "Line-ups" })).toContainText(
    "OnT: shots on target, Thr: through balls",
  );
  // A player EA sent no detail for shows dashes, not zeroes.
  await expect(await lineupCell(ours, "Loltown95", "OnT")).toHaveText("–");
  await expect(
    lineup(page, "Bunch of bums").getByRole("columnheader", { name: "OnT" }),
  ).toBeVisible();
});

test("Compare sets two Squad Members' influence side by side", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const match = bare(win());
  playing(match, OUR_CLUB_ID, KABEEBLE, { 6: 4, 106: 3 });
  playing(match, OUR_CLUB_ID, TINBS, { 6: 1, 106: 1 });
  await fakeEa.addMatch(match);
  await triggerPoll();

  await page.goto(`/compare?players=${KABEEBLE},${TINBS}`);
  const tape = page.getByRole("table", { name: "Influence" });
  await expectTape(tape, "Interceptions", ["4.00", "1.00"], 0);
  // Losing the ball less leads.
  await expectTape(tape, "Ball lost", ["3.00", "1.00"], 1);
});

test.describe("on a 375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the Match page and Compare fit the screen", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    const match = win();
    await fakeEa.addMatch(match);
    await triggerPoll();
    const fits = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );

    await page.goto(`/matches/${match.match.matchId}`);
    await expect(
      page.getByRole("table", { name: "In more detail" }),
    ).toBeVisible();
    expect(await fits()).toBe(true);
    await page
      .getByRole("group", { name: "Line-up stats to show" })
      .getByRole("button", { name: "Detail" })
      .click();
    expect(await fits()).toBe(true);

    await page.goto(`/compare?players=${KABEEBLE},${TINBS}`);
    await expect(page.getByRole("table", { name: "Influence" })).toBeVisible();
    expect(await fits()).toBe(true);
  });
});
