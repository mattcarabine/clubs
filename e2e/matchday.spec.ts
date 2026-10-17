// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import {
  dnf,
  OUR_CLUB_ID,
  recordedLeagueMatches,
  win,
} from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-7: the Matchday page at `/`.

const CLUB_NAME = "A Bloo Bloo";

/** The newest recorded Competitive Match, from Our Club's point of view. */
function newestFixtureMatch() {
  const [match] = recordedLeagueMatches();
  const opponentId = Object.keys(match.clubs).find((id) => id !== OUR_CLUB_ID);
  if (!opponentId) throw new Error("Recorded match has no Opponent");
  const opponent = match.clubs[opponentId];
  return {
    goalsFor: Number(match.clubs[OUR_CLUB_ID].goals),
    goalsAgainst: Number(opponent.goals),
    opponentName: opponent.details?.name ?? opponentId,
  };
}

function latestMatch(page: Page) {
  return page.getByRole("region", { name: "Latest Match" });
}

/** The ScoreBar's screen-reader sentence, e.g. "A Bloo Bloo 4, Bunch of bums 1". */
function scoreLine(goalsFor: number, opponent: string, goalsAgainst: number) {
  return `${CLUB_NAME} ${goalsFor}, ${opponent} ${goalsAgainst}`;
}

test("shows the latest Match's score and Opponent from the fixture", async ({
  page,
  triggerPoll,
}) => {
  await triggerPoll();
  await page.goto("/");

  const { goalsFor, goalsAgainst, opponentName } = newestFixtureMatch();
  await expect(
    page.getByRole("heading", { level: 1, name: "Matchday" }),
  ).toBeVisible();
  const hero = latestMatch(page);
  await expect(hero).toContainText(
    scoreLine(goalsFor, opponentName, goalsAgainst),
  );
  await expect(hero).toContainText("League");
  await expect(
    hero.getByRole("link", { name: new RegExp(opponentName) }),
  ).toHaveAttribute("href", /^\/matches\/\d+$/);
  await expect(page.getByText("Updated just now")).toBeVisible();
});

test("shows the latest Match's top performers, form and season snapshot", async ({
  page,
  triggerPoll,
}) => {
  await triggerPoll();
  await page.goto("/");

  // In the recorded Match, tinbs_irl was Man of the Match and Loltown95 scored twice.
  const ticker = page.getByRole("region", { name: "Top performers" });
  await expect(ticker.getByText("tinbs_irl").first()).toBeAttached();
  await expect(ticker.getByText(/Man of the Match/).first()).toBeAttached();
  await expect(ticker.getByText(/2 goals, 1 assist/).first()).toBeAttached();

  await expect(
    page.getByRole("list", { name: /Form, oldest to newest/ }),
  ).toBeVisible();

  const snapshot = page.getByRole("region", { name: "Season snapshot" });
  await expect(snapshot).toContainText("1632");
  await expect(snapshot).toContainText("55-18-39");

  const noSideScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(noSideScroll).toBe(true);
});

test("flags a DNF on the latest Match", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(dnf());
  await triggerPoll();
  await page.goto("/");

  await expect(
    latestMatch(page).getByText("DNF", { exact: true }),
  ).toBeVisible();
});

test("picks up a new result after 60s without a reload", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await page.clock.install();
  await triggerPoll();
  await page.goto("/");
  const { opponentName } = newestFixtureMatch();
  await expect(latestMatch(page)).toContainText(
    scoreLine(
      newestFixtureMatch().goalsFor,
      opponentName,
      newestFixtureMatch().goalsAgainst,
    ),
  );
  // Survives only if the page is not reloaded.
  await page.evaluate(() => {
    (window as unknown as { stayedOpen: boolean }).stayedOpen = true;
  });

  // `win()` clones the newest recorded Match, so the Opponent is the same.
  await fakeEa.addMatch(win({ goalsFor: 7, goalsAgainst: 0 }));
  await triggerPoll();
  await expect(latestMatch(page)).not.toContainText(
    scoreLine(7, opponentName, 0),
  );

  await page.clock.fastForward("01:00");
  await expect(latestMatch(page)).toContainText(scoreLine(7, opponentName, 0));
  expect(
    await page.evaluate(
      () => (window as unknown as { stayedOpen?: boolean }).stayedOpen,
    ),
  ).toBe(true);
});

test("warns when the last successful Poll was 2 hours ago", async ({
  page,
  request,
  triggerPoll,
}) => {
  await triggerPoll();
  const aged = await request.post("/__test/poll-runs/age?minutes=120");
  expect(aged.ok()).toBe(true);

  await page.goto("/");
  await expect(page.getByText("Stale:")).toBeVisible();
  await expect(page.getByText("Updated 2 hr ago")).toBeVisible();
});

test("shows a friendly empty state with an empty database", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("No Competitive Matches yet")).toBeVisible();
  await expect(latestMatch(page)).toHaveCount(0);
  await expect(page.getByText(/Updated/)).toHaveCount(0);
});
