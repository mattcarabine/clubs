// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Locator, Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import { loss, OUR_CLUB_ID, win } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-85: the Squad table and profiles rebuilt around Match Events.

/** In every recorded Match, as midfielders for Our Club. */
const KABEEBLE = "256171605";
const TINBS = "380993182";
/** The recorded Opponent, and its midfielder who plays the whole Match. */
const OPPONENT_ID = "356611";
const THEIR_MIDFIELDER = "1011157123282";

const PROFILE = `/players/${KABEEBLE}`;
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

function section(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

/** One figure's row in a list set against the yardstick. */
function yardstick(scope: Locator, id: string) {
  return scope.locator(`[data-yardstick="${id}"]`);
}

function squadTable(page: Page) {
  return page.getByRole("table", { name: "Squad Members" });
}

async function squadCell(page: Page, name: string, header: string) {
  const headers = await squadTable(page)
    .getByRole("columnheader")
    .allTextContents();
  const index = headers.findIndex((h) => h.trim() === header);
  expect(index, `column ${header}`).toBeGreaterThan(0);
  return squadTable(page)
    .locator("tbody tr")
    .filter({ has: page.getByRole("rowheader", { name: new RegExp(name) }) })
    .getByRole("cell")
    .nth(index - 1);
}

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so every figure is exact.
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

test("a profile leads with the Squad Member's share of what the team did", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // Kabeeble: a goal and a second assist of our 3, 3 of our 4 shots on
  // target, 2 of the 4 times we won the ball, 3 of the 4 times we lost it.
  const match = bare(win({ goalsFor: 3, goalsAgainst: 1 }));
  playing(match, OUR_CLUB_ID, KABEEBLE, {
    214: 1,
    115: 1,
    217: 3,
    108: 1,
    109: 1,
    106: 3,
  });
  playing(match, OUR_CLUB_ID, TINBS, { 217: 1, 109: 2, 106: 1 });
  await fakeEa.addMatch(match);
  await triggerPoll();

  await page.goto(PROFILE);
  const influence = section(page, "Influence");
  await expect(influence).toBeVisible();
  // Influence comes before the charts.
  const [influenceTop, chartTop] = await Promise.all(
    [influence, page.getByRole("table", { name: "Match rating" })].map(
      async (l) => (await l.boundingBox())?.y ?? 0,
    ),
  );
  expect(influenceTop).toBeLessThan(chartTop);

  const shares = section(page, "Share of the team");
  const tile = (label: string) =>
    shares.locator("div").filter({
      has: page.getByText(label, { exact: true }),
    });
  await expect(tile("Of our goals, scored or set up")).toContainText("67%");
  await expect(tile("Of our goals, scored or set up")).toContainText("2 of 3");
  // Each other share says where it sits against an equal split of the minutes.
  await expect(tile("Of our shots on target")).toContainText(
    "75%■3 of 4, more than an even share (50%)",
  );
  await expect(tile("Of the ball we won back")).toContainText(
    "50%■2 of 4, an even share (50%)",
  );
  await expect(tile("Of the ball we lost")).toContainText(
    "75%■3 of 4, more than an even share (50%)",
  );
});

test("what they add and give away sits beside a typical opponent in their position", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const match = bare(win());
  // Kabeeble, a midfielder: 4 interceptions, lost the ball 3 times.
  playing(match, OUR_CLUB_ID, KABEEBLE, { 6: 4, 106: 3, 217: 3, 218: 1 });
  // Their midfielder: 2 interceptions, lost it 6 times.
  playing(match, OPPONENT_ID, THEIR_MIDFIELDER, { 6: 2, 106: 6 });
  await fakeEa.addMatch(match);
  await triggerPoll();

  await page.goto(PROFILE);
  const adds = section(page, "What they add");
  await expect(yardstick(adds, "interceptions")).toContainText(
    /Interceptions\s*4\.00/,
  );
  await expect(yardstick(adds, "interceptions")).toContainText(
    "Typical opposing midfielder: 2.00",
  );
  await expect(yardstick(adds, "interceptions")).toContainText("Better");

  // Losing the ball less than they do is better, and says so.
  const costs = section(page, "What they give away");
  await expect(yardstick(costs, "ballLost")).toContainText(/Ball lost\s*3\.00/);
  await expect(yardstick(costs, "ballLost")).toContainText(
    "Typical opposing midfielder: 6.00",
  );
  await expect(yardstick(costs, "ballLost")).toContainText("Better");

  // The rest of their game, by part of the game.
  const attacking = section(page, "How they play").getByRole("region", {
    name: "Attacking",
  });
  await expect(yardstick(attacking, "shotAccuracy")).toContainText("75%");

  // With every position counted, the yardstick says so.
  await page.goto(`${PROFILE}?positions=all`);
  await expect(
    yardstick(section(page, "What they add"), "interceptions"),
  ).toContainText("Typical opponent in the same positions: 2.00");
});

test("a profile says what goes with winning", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // 3 interceptions in each of 5 Wins, none in 5 defeats.
  for (let i = 0; i < 5; i++) {
    await fakeEa.addMatch(
      playing(bare(win()), OUR_CLUB_ID, KABEEBLE, { 6: 3, 215: 20 }),
    );
    await fakeEa.addMatch(
      playing(bare(loss()), OUR_CLUB_ID, KABEEBLE, { 215: 20, 216: 6 }),
    );
  }
  await triggerPoll();

  await page.goto(PROFILE);
  const movers = section(page, "What goes with winning");
  await expect(movers).toContainText("A pattern in 10 matches so far");
  const more = movers.getByRole("list", { name: "We win more with" });
  await expect(more.getByRole("listitem")).toHaveText([
    /3 or more interceptions.*Small sample.*Won 5 of 5 \(100%\)\. With fewer, won 0 of 5 \(0%\)\./,
  ]);
  const less = movers.getByRole("list", { name: "We win less with" });
  await expect(less.getByRole("listitem")).toHaveText([
    /6 or more passes gone astray.*Won 0 of 5 \(0%\)\. With fewer, won 5 of 5 \(100%\)\./,
  ]);
});

test("a profile with no detailed stats says so", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(bare(win()));
  await triggerPoll();

  await page.goto(PROFILE);
  await expect(section(page, "Influence")).toContainText(
    "No detailed stats in these matches",
  );
  await expect(section(page, "How they play")).toHaveCount(0);
});

test("the Squad table shows one part of the game at a time", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // Two Matches: one yellow card that EA counts three times over, then two
  // yellows and the red they add up to.
  await fakeEa.addMatch(
    playing(bare(win()), OUR_CLUB_ID, KABEEBLE, { 95: 2, 213: 1, 2: 1 }),
  );
  await fakeEa.addMatch(
    playing(
      bare(win()),
      OUR_CLUB_ID,
      KABEEBLE,
      { 95: 2, 3: 2 },
      {
        redcards: "1",
      },
    ),
  );
  await triggerPoll();

  await page.goto("/squad");
  const views = page.getByRole("group", { name: "Stats to show" });
  await expect(views.getByRole("button", { name: "Overview" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    squadTable(page).getByRole("columnheader", { name: "G+A", exact: true }),
  ).toBeVisible();

  await views.getByRole("button", { name: "Discipline" }).click();
  await expect(page).toHaveURL(/[?&]view=discipline/);
  await expect(
    squadTable(page).getByRole("columnheader", { name: "G+A", exact: true }),
  ).toHaveCount(0);
  // 3 yellows, 3 fouls and a red in 180 minutes.
  await expect(await squadCell(page, "Kabeeble", "Yellow/90")).toHaveText(
    "1.50",
  );
  await expect(await squadCell(page, "Kabeeble", "Fouls/90")).toHaveText(
    "1.50",
  );
  await expect(await squadCell(page, "Kabeeble", "Red/90")).toHaveText("0.50");
  await expect(await squadCell(page, "Kabeeble", "Played")).toHaveText("2");
  // A teammate with no detailed stats shows a dash, not a zero.
  await expect(await squadCell(page, "tinbs_irl", "Yellow/90")).toHaveText("–");
  // The key under the table says what each header means.
  await expect(
    page.getByText("Yellow cards per 90 minutes. Lower is better"),
  ).toBeVisible();

  // Compare ticks survive a change of view.
  await squadTable(page)
    .getByRole("checkbox", { name: "Compare Kabeeble" })
    .check();
  await views.getByRole("button", { name: "Defending" }).click();
  await expect(
    squadTable(page).getByRole("checkbox", { name: "Compare Kabeeble" }),
  ).toBeChecked();

  // The view is part of the address, so a link opens on it.
  await page.goto("/squad?view=passing");
  await expect(views.getByRole("button", { name: "Passing" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    squadTable(page).getByRole("columnheader", {
      name: "Passes/90",
      exact: true,
    }),
  ).toBeVisible();
});

test("EA totals have no views, since EA's own totals have none of this", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(win());
  await triggerPoll();

  await page.goto("/squad?source=ea&view=passing");
  await expect(page.getByRole("group", { name: "Stats to show" })).toHaveCount(
    0,
  );
  await expect(
    squadTable(page).getByRole("columnheader", { name: "G+A", exact: true }),
  ).toBeVisible();
});

test.describe("on a 375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the profile and every Squad view fit the screen", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    // The recorded Match Events, as EA sent them.
    for (let i = 0; i < 5; i++) {
      await fakeEa.addMatch(win());
      await fakeEa.addMatch(loss());
    }
    await triggerPoll();

    const fits = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
    await page.goto(PROFILE);
    await expect(section(page, "Influence")).toBeVisible();
    expect(await fits()).toBe(true);

    for (const view of ["attacking", "passing", "onTheBall", "defending"]) {
      await page.goto(`/squad?view=${view}`);
      await expect(squadTable(page)).toBeVisible();
      expect(await fits(), view).toBe(true);
    }
  });
});
