// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Locator, Page } from "@playwright/test";

import { leaderboardWithGamesPlayed } from "./support/leaderboard.ts";
import { dnf, loss, win } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-77: the club's records since records began, at the top of the
// Milestones page.

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const ago = (ms: number) => new Date(Date.now() - ms);

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

function records(page: Page): Locator {
  return page.getByRole("region", { name: "Club records" });
}

function board(page: Page, label: string): Locator {
  return records(page)
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: label, exact: true }) });
}

test("the club records show the club's best and worst, linking to where each was set", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // Division 3 (EA's 4), then Division 2 (EA's 3): the best is Division 2.
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(10, {
      currentDivision: 4,
      stats: { bestDivision: 4 },
    }),
  );
  await triggerPoll();

  // Three Wins in one Session (the 4-0 is the biggest), a rage quit Win
  // "9-0" that sets no scoreline record but extends the winning run to 4,
  // a 0-3 defeat, then two clean sheets still going.
  const night = 3 * DAY_MS;
  await fakeEa.addMatch(win({ matchId: "77001", playedAt: ago(night) }));
  await fakeEa.addMatch(
    win({
      matchId: "77002",
      goalsFor: 4,
      goalsAgainst: 0,
      playedAt: ago(night - 20 * MINUTE_MS),
    }),
  );
  await fakeEa.addMatch(
    win({ matchId: "77003", playedAt: ago(night - 40 * MINUTE_MS) }),
  );
  await fakeEa.addMatch(
    dnf({
      matchId: "77004",
      goalsFor: 9,
      goalsAgainst: 0,
      playedAt: ago(2 * DAY_MS),
    }),
  );
  await fakeEa.addMatch(
    loss({
      matchId: "77005",
      goalsFor: 0,
      goalsAgainst: 3,
      playedAt: ago(DAY_MS),
    }),
  );
  await fakeEa.addMatch(
    win({
      matchId: "77006",
      goalsFor: 1,
      goalsAgainst: 0,
      playedAt: ago(40 * MINUTE_MS),
    }),
  );
  await fakeEa.addMatch(
    win({
      matchId: "77007",
      goalsFor: 2,
      goalsAgainst: 0,
      playedAt: ago(20 * MINUTE_MS),
    }),
  );
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(17, {
      currentDivision: 3,
      stats: { bestDivision: 3 },
    }),
  );
  await triggerPoll();

  await page.goto("/milestones");

  // The records lead the page, above the club leaders.
  await expect(
    page.getByRole("main").getByRole("region").first(),
  ).toHaveAccessibleName("Club records");

  await expect(board(page, "Highest division")).toContainText("Div 2");
  await expect(board(page, "Highest division")).toContainText("first reached");
  // Our Club's Skill Rating in fixtures/ea/clubs-overallStats.json.
  await expect(board(page, "Highest skill rating")).toContainText("1,632");

  await expect(board(page, "Biggest win")).toContainText("4–0");
  await expect(board(page, "Biggest win").getByRole("link")).toHaveAttribute(
    "href",
    "/matches/77002",
  );
  await expect(board(page, "Most goals in a match")).toContainText("4");
  await expect(board(page, "Most goals in a match")).toContainText("4–0");

  await expect(board(page, "Longest winning run")).toContainText(
    /4\s*wins in a row/,
  );
  await expect(board(page, "Longest winning run")).not.toContainText(
    "Still going",
  );
  await expect(board(page, "Most wins in a session")).toContainText(
    /3\s*wins from 3 matches/,
  );
  await expect(
    board(page, "Most wins in a session").getByRole("link"),
  ).toHaveAttribute("href", "/sessions/77001");

  await expect(board(page, "Clean sheets in a row")).toContainText("2");
  await expect(board(page, "Clean sheets in a row")).toContainText(
    "Still going",
  );

  await expect(board(page, "Heaviest defeat")).toContainText("0–3");
  await expect(
    board(page, "Heaviest defeat").getByRole("link"),
  ).toHaveAttribute("href", "/matches/77005");
});

test("there are no club records before any Match", async ({
  page,
  triggerPoll,
}) => {
  await triggerPoll();
  await page.goto("/milestones");
  await expect(
    page.getByRole("heading", { name: "Milestones", level: 1 }),
  ).toBeVisible();
  await expect(records(page)).toHaveCount(0);
});

test.describe("on a 375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the records scroll inside their row and the page never scrolls sideways", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    for (const [i, minutes] of [80, 60, 40, 20].entries()) {
      await fakeEa.addMatch(
        win({ matchId: `7710${i}`, playedAt: ago(minutes * MINUTE_MS) }),
      );
    }
    await triggerPoll();
    await page.goto("/milestones");
    await expect(records(page).getByRole("listitem")).not.toHaveCount(0);
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits).toBe(true);
  });
});
