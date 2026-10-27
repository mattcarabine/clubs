// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import { readFileSync } from "node:fs";
import path from "node:path";

import type { AddMatchBody } from "./fake-ea/control.ts";
import { leaderboardWithGamesPlayed } from "./support/leaderboard.ts";
import { draw, loss, OUR_CLUB_ID, win } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-13: the Trends charts, now on /analysis (CLUBS-59). Each test serves only the Matches it adds, so the
// recorded fixtures never leak into the buckets being checked.
test.beforeEach(async ({ fakeEa }) => {
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

test("shows a line-up of 4 Squad Members who played 3 Matches together, with its W/D/L", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const day = (d: number) => new Date(`2026-09-${10 + d}T19:00:00Z`);
  await fakeEa.addMatch(
    win({ goalsFor: 3, goalsAgainst: 1, playedAt: day(1) }),
  );
  await fakeEa.addMatch(
    draw({ goalsFor: 2, goalsAgainst: 2, playedAt: day(2) }),
  );
  await fakeEa.addMatch(
    loss({ goalsFor: 0, goalsAgainst: 1, playedAt: day(3) }),
  );
  // Two Matches with one Squad Member missing: a different line-up, under the minimum.
  await fakeEa.addMatch(withoutOnePlayer(win({ playedAt: day(4) })));
  await fakeEa.addMatch(withoutOnePlayer(win({ playedAt: day(5) })));
  await triggerPoll();

  await page.goto("/analysis");

  const table = page.getByRole("table", { name: "Line-up performance" });
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByRole("listitem")).toHaveCount(4);
  await expect(rows.first().getByRole("cell")).toHaveText([
    "3",
    "1",
    "1",
    "1",
    "33%",
    "+1",
  ]);
});

test("with one skill rating reading there is no chart yet", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.setPayload("clubs/overallStats", overallStats("1632"));
  await triggerPoll();

  await page.goto("/analysis");
  const section = page.getByRole("region", { name: "Skill rating" });
  await expect(section.getByText("Now 1632")).toBeVisible();
  await expect(
    section.getByText("The line starts once EA's rating changes."),
  ).toBeVisible();
  await expect(section.getByRole("slider")).toHaveCount(0);
});

test("charts both club Snapshots' skill ratings", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.setPayload("clubs/overallStats", overallStats("1600"));
  await triggerPoll();
  await fakeEa.setPayload("clubs/overallStats", overallStats("1632"));
  await triggerPoll();

  await page.goto("/analysis");

  const section = page.getByRole("region", { name: "Skill rating" });
  await expect(section.getByText("Now 1632")).toBeVisible();
  await expect(
    section
      .getByRole("table", { name: "Skill rating over time" })
      .getByRole("cell"),
  ).toHaveText(["1600", "1632"]);
});

test("respects the FilterBar's Match Types", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(win());
  await fakeEa.addMatch(
    loss({ matchType: "playoffMatch", goalsFor: 0, goalsAgainst: 4 }),
  );
  await triggerPoll();

  const results = page.getByRole("region", { name: "Results" });
  await page.goto("/analysis");
  await expect(
    results.getByText("2 matches: 1 won, 0 drawn, 1 lost."),
  ).toBeVisible();

  await page.goto("/analysis?types=league");
  await expect(
    results.getByText("1 Match: 1 won, 0 drawn, 0 lost."),
  ).toBeVisible();
});

test("says what will fill the page before any Matches", async ({ page }) => {
  await page.goto("/analysis");
  await expect(page.getByText("Not enough matches yet")).toBeVisible();
  await expect(page.getByText("No skill rating yet")).toBeVisible();
});

test("charts no points total; the other Results charts stay", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(win());
  await fakeEa.addMatch(loss());
  await triggerPoll();
  await page.goto("/analysis");

  const results = page.getByRole("region", { name: "Results" });
  await expect(results.getByText("Run of results")).toBeVisible();
  await expect(
    results.getByRole("slider", { name: "Cumulative goal difference" }),
  ).toBeVisible();
  await expect(page.getByText(/Cumulative points/)).toHaveCount(0);
  await expect(
    page.getByRole("slider", { name: "Cumulative points" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("slider", { name: /Goals per match/ }),
  ).toBeVisible();
});

test("has no horizontal page scroll, down to a 375px phone", async ({
  page,
  fakeEa,
  triggerPoll,
  viewport,
}) => {
  // A tracked Season with a Promotion, so the Campaign panel, timeline and
  // history all render.
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(31),
  );
  await triggerPoll();
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(0, { currentDivision: 5 }),
  );
  await triggerPoll();
  const start = Date.now();
  for (const [i, build] of [win, win, draw, win, loss].entries()) {
    await fakeEa.addMatch(
      build({ playedAt: new Date(start + (i + 1) * 60_000) }),
    );
  }
  await triggerPoll();
  await page.goto("/analysis");
  await expect(
    page.getByRole("table", { name: "Campaign history" }),
  ).toBeVisible();

  for (const width of [viewport?.width ?? 1440, 375]) {
    await page.setViewportSize({ width, height: viewport?.height ?? 800 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits, `no horizontal scroll at ${width}px`).toBe(true);
  }
});

test("with too few Matches for the Outcome Split, the Win % charts by kick-off and day still show", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(win({ playedAt: new Date("2025-10-21T19:00:00Z") })); // Tue 20:00 BST
  await fakeEa.addMatch(loss({ playedAt: new Date("2025-10-28T22:30:00Z") })); // Tue 22:30 GMT
  await triggerPoll();
  await page.goto("/analysis");

  await expect(page.getByText("Not enough matches yet")).toBeVisible();
  const circumstances = page.getByRole("region", { name: "Circumstances" });
  await expect(
    circumstances.getByRole("list", { name: "Win % by day of the week" }),
  ).toHaveText(/Tue \(2\)\s*50%/);
  await expect(
    page.getByRole("list", { name: "Win % by kick-off time" }),
  ).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Personnel" })).toHaveCount(0);
});

test("Over time ignores the filters and says so", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.setPayload("clubs/overallStats", overallStats("1600"));
  await fakeEa.addMatch(win());
  await triggerPoll();
  await fakeEa.setPayload("clubs/overallStats", overallStats("1632"));
  await triggerPoll();

  for (const path of ["/analysis", "/analysis?range=7d&types=playoff"]) {
    await page.goto(path);
    const overTime = page.getByRole("region", { name: "Over time" });
    await expect(overTime).toContainText("The filters don't change these");
    await expect(
      overTime
        .getByRole("table", { name: "Skill rating over time" })
        .getByRole("cell"),
    ).toHaveText(["1600", "1632"]);
  }
});

test("/trends answers 301 to /analysis with its query string", async ({
  request,
}) => {
  const res = await request.get("/trends?types=league&range=30d", {
    maxRedirects: 0,
  });
  expect(res.status()).toBe(301);
  expect(res.headers().location).toBe("/analysis?types=league&range=30d");
});

test("/trends redirects to Analysis, keeping the filter", async ({ page }) => {
  await page.goto("/trends?types=league");
  await expect(page).toHaveURL(/\/analysis\?types=league$/);
  await expect(page.locator("h1")).toHaveText("Analysis");
  await expect(page.getByRole("region", { name: "Over time" })).toBeVisible();
});

/** The recorded `clubs/overallStats` payload with a different skill rating. */
function overallStats(skillRating: string): unknown {
  const file = path.resolve(
    import.meta.dirname,
    "../fixtures/ea/clubs-overallStats.json",
  );
  const [club] = JSON.parse(readFileSync(file, "utf8"));
  return [{ ...club, skillRating }];
}

/** The same Match with one of Our Club's Squad Members left out. */
function withoutOnePlayer(fake: AddMatchBody): AddMatchBody {
  const ours = fake.match.players[OUR_CLUB_ID];
  const [first] = Object.keys(ours);
  delete ours[first];
  return fake;
}
