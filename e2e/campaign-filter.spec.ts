import type { Page } from "@playwright/test";

import {
  type CampaignHarness,
  type MatchAt,
  play,
  startSeason,
} from "./support/campaigns.ts";
import { draw, loss, win, withLineup } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-42: the FilterBar's Campaign chips scope every stats page to one
// Campaign's League Matches.

const STAR = { id: "900000042", name: "Campaign Star" };
const HOUR_MS = 60 * 60 * 1000;

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
  await fakeEa.setPayload("clubs/matches", [], "playoffMatch");
});

/** A Match the Star plays in. */
const starring =
  (build: typeof win): MatchAt =>
  (options) =>
    withLineup(build(options), [{ player: STAR }]);

/**
 * One League Win before tracking starts, then two Campaigns: Division 5
 * (W W D reaches 7 points, then a Win in the series promotes) and Division 4
 * in progress (L D). The Star plays all 7 Matches.
 */
async function seedCampaigns(harness: CampaignHarness) {
  await harness.fakeEa.addMatch(
    withLineup(win({ playedAt: new Date(Date.now() - 2 * HOUR_MS) }), [
      { player: STAR },
    ]),
  );
  await startSeason(harness);
  await play(harness, [win, win, draw, win, loss, draw].map(starring), 5);
}

function filters(page: Page) {
  return page.getByRole("region", { name: "Stats filters" });
}

function campaignGroup(page: Page) {
  return filters(page).getByRole("group", { name: "Campaign" });
}

function campaignChip(page: Page, name: string) {
  return campaignGroup(page).getByRole("button", { name, exact: true });
}

function searchParam(page: Page, name: string) {
  return new URL(page.url()).searchParams.get(name);
}

/** The Star's Appearances in the Squad table. */
async function starAppearances(page: Page) {
  const table = page.getByRole("table", { name: "Squad Members" });
  const headers = await table.getByRole("columnheader").allTextContents();
  const index = headers.findIndex((h) => h.trim() === "Played");
  expect(index, "Played column").toBeGreaterThan(0);
  // The first column is the row header, so data cells start one along.
  return table
    .locator("tbody tr")
    .filter({ has: page.getByRole("rowheader", { name: /Campaign Star/ }) })
    .getByRole("cell")
    .nth(index - 1);
}

/** The Analysis page's "Not enough Matches yet" text, which counts the filtered Wins and Dropped Points. */
function analysisNeeds(page: Page, needed: string) {
  return page.getByText(
    `The Outcome Split needs at least 3 Wins and 3 draws and defeats in these filters: ${needed}.`,
  );
}

test("This Campaign and Last Campaign limit the Squad table to each Campaign's League Matches", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await seedCampaigns({ fakeEa, triggerPoll });
  await page.goto("/squad");
  await expect(await starAppearances(page)).toHaveText("7");
  await expect(campaignChip(page, "This Campaign")).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await campaignChip(page, "This Campaign").click();
  await expect.poll(() => searchParam(page, "campaign")).toBe("current");
  await expect(await starAppearances(page)).toHaveText("2");
  await expect(campaignChip(page, "This Campaign")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // A Campaign counts League Matches only, and the Match Type chips say so.
  await expect(
    filters(page).getByRole("button", { name: "Playoff", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");

  await campaignChip(page, "Last Campaign").click();
  await expect.poll(() => searchParam(page, "campaign")).toBe("previous");
  await expect(await starAppearances(page)).toHaveText("4");

  // Pressing the selected chip again clears the Campaign.
  await campaignChip(page, "Last Campaign").click();
  await expect.poll(() => searchParam(page, "campaign")).toBeNull();
  await expect(await starAppearances(page)).toHaveText("7");
});

test("This Campaign and Last Campaign limit the Analysis page", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await seedCampaigns({ fakeEa, triggerPoll });
  await page.goto("/analysis");
  // All 7: 4 Wins and 3 Dropped Points, enough for the Outcome Split.
  await expect(page.getByText("Not enough Matches yet")).toHaveCount(0);

  await campaignChip(page, "This Campaign").click();
  await expect.poll(() => searchParam(page, "campaign")).toBe("current");
  // L D: no Wins, 2 Dropped Points.
  await expect(
    analysisNeeds(page, "3 more Wins and 1 more draw or defeat"),
  ).toBeVisible();

  await campaignChip(page, "Last Campaign").click();
  await expect.poll(() => searchParam(page, "campaign")).toBe("previous");
  // W W D W: 3 Wins and 1 Dropped Points.
  await expect(analysisNeeds(page, "2 more draws or defeats")).toBeVisible();
});

test("?campaign= deep links select a Campaign, and an unknown one falls back to all", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await seedCampaigns({ fakeEa, triggerPoll });

  await page.goto("/squad?campaign=previous");
  await expect(await starAppearances(page)).toHaveText("4");
  await expect(campaignChip(page, "Last Campaign")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // By number: Campaign 2 is the current one.
  await page.goto("/squad?campaign=2");
  await expect(await starAppearances(page)).toHaveText("2");
  await expect(campaignChip(page, "Campaign 2")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  for (const unknown of ["9", "nonsense"]) {
    const response = await page.goto(`/squad?campaign=${unknown}`);
    expect(response?.status()).toBe(200);
    await expect(await starAppearances(page)).toHaveText("7");
    await expect(campaignGroup(page).getByRole("button")).toHaveText([
      "This Campaign",
      "Last Campaign",
    ]);
    for (const chip of await campaignGroup(page).getByRole("button").all()) {
      await expect(chip).toHaveAttribute("aria-pressed", "false");
    }
  }
});

test("with no Campaigns yet, the Campaign chips are hidden", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(withLineup(win(), [{ player: STAR }]));
  await triggerPoll();

  await page.goto("/squad");
  await expect(await starAppearances(page)).toHaveText("1");
  await expect(
    filters(page).getByRole("group", { name: "Match Type" }),
  ).toBeVisible();
  await expect(campaignGroup(page)).toHaveCount(0);

  // A shared link from a database with Campaigns falls back to all here.
  const response = await page.goto("/analysis?campaign=current");
  expect(response?.status()).toBe(200);
  await expect(
    filters(page).getByRole("group", { name: "Match Type" }),
  ).toBeVisible();
  await expect(campaignGroup(page)).toHaveCount(0);
});

test("the Campaign chips fit a 375px phone without horizontal page scroll", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await seedCampaigns({ fakeEa, triggerPoll });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/squad?campaign=1");
  await expect(campaignChip(page, "Campaign 1")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fits).toBe(true);
});

test("every stats page takes the Campaign filter", async ({
  page,
  fakeEa,
  triggerPoll,
  db,
}) => {
  await seedCampaigns({ fakeEa, triggerPoll });
  const [match] = await db.rows<{ opponent_club_id: string }>("matches");
  const pages = [
    "/squad?campaign=current",
    `/players/${STAR.id}?campaign=current`,
    "/analysis?campaign=current",
    "/?campaign=current",
    "/opponents?campaign=current",
    `/opponents/${match.opponent_club_id}?campaign=current`,
    `/compare?players=${STAR.id}&campaign=current`,
  ];
  for (const path of pages) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(campaignChip(page, "This Campaign"), path).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
});

test("a Campaign leaves out Playoff Matches and the League Matches after them", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await startSeason({ fakeEa, triggerPoll });
  const playoff: typeof win = (options) =>
    win({ ...options, matchType: "playoffMatch" });
  // Once Our Club plays a Playoff, League Matches stop counting until the next Season.
  await play({ fakeEa, triggerPoll }, [win, playoff, loss].map(starring), 6);

  await page.goto("/squad");
  await expect(await starAppearances(page)).toHaveText("3");
  await page.goto("/squad?campaign=current");
  await expect(await starAppearances(page)).toHaveText("1");
});
