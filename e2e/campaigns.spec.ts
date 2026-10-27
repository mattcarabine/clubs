import type { Page } from "@playwright/test";

import { play, startSeason } from "./support/campaigns.ts";
import { draw, loss, win } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-41: the Trends page's Campaign section. Campaigns are rebuilt from
// League Matches played after a detected Season start (Division 5, 0 points).

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
  await fakeEa.setPayload("clubs/matches", [], "playoffMatch");
});

const panel = (page: Page) =>
  page.getByRole("region", { name: "Current Campaign" });

const warning = (page: Page) =>
  panel(page).getByText("Campaign tracking may be off");

const playoff = (options: { playedAt: Date }) =>
  win({ ...options, matchType: "playoffMatch" });

test("shows the current Campaign, history and timeline after a Promotion", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await startSeason({ fakeEa, triggerPoll });
  // Division 5: W W D reaches 7 points; a Win in the series promotes.
  // Division 4: then a Win and a loss.
  await play({ fakeEa, triggerPoll }, [win, win, draw, win, win, loss], 5);

  await page.goto("/analysis");

  await expect(
    panel(page).getByRole("heading", { name: "Division 4" }),
  ).toBeVisible();
  await expect(
    panel(page).getByRole("progressbar", {
      name: "Campaign points against the Points Target",
    }),
  ).toHaveAttribute("aria-valuetext", "3 of 10 points");
  await expect(
    panel(page).getByRole("img", { name: "2 of 3 Chances left" }),
  ).toBeVisible();
  await expect(
    panel(page).getByRole("list", {
      name: "Form, oldest to newest: Win, Loss",
    }),
  ).toBeVisible();
  await expect(warning(page)).toHaveCount(0);

  const history = page
    .getByRole("table", { name: "Campaign history" })
    .locator("tbody tr");
  await expect(history).toHaveCount(2);
  await expect(history.nth(0)).toContainText("Division 4");
  await expect(history.nth(0)).toContainText("In progress");
  await expect(history.nth(1)).toContainText("Division 5");
  await expect(history.nth(1)).toContainText("2-1-0");
  await expect(history.nth(1)).toContainText("7 / 7");
  await expect(history.nth(1)).toContainText("Promoted");

  const timeline = page.getByRole("table", { name: "Division over time" });
  await expect(timeline.locator("tbody td")).toHaveText([
    "Division 5",
    "Season start",
    "Division 4",
    "Promotion",
  ]);
});

test("shows a Promotion Series in progress", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await startSeason({ fakeEa, triggerPoll });
  await play({ fakeEa, triggerPoll }, [win, win, draw, loss], 6);

  await page.goto("/analysis");

  await expect(
    panel(page).getByRole("heading", { name: "Division 5" }),
  ).toBeVisible();
  await expect(
    panel(page).getByText("Promotion Series: 1 of 3 Wins needed"),
  ).toBeVisible();
  await expect(
    panel(page).getByText("0 won, 1 of up to 3 played"),
  ).toBeVisible();
  // Division 5 can't be relegated, so it has no Chances.
  await expect(
    panel(page).getByRole("img", { name: /Chances left/ }),
  ).toHaveCount(0);
  // A single point (the Season start) is no timeline yet.
  await expect(
    page.getByRole("table", { name: "Division over time" }),
  ).toHaveCount(0);
});

test("before any Season start, shows EA's Division and when tracking starts", async ({
  page,
  triggerPoll,
}) => {
  // The recorded leaderboard says Division 2 (currentDivision 3).
  await triggerPoll();
  await page.goto("/analysis");

  await expect(
    panel(page).getByRole("heading", { name: "Division 2" }),
  ).toBeVisible();
  await expect(
    panel(page).getByText(
      "Campaign tracking starts at the beginning of next Season.",
    ),
  ).toBeVisible();
  await expect(panel(page).getByRole("progressbar")).toHaveCount(0);
  await expect(
    page.getByRole("table", { name: "Campaign history" }),
  ).toHaveCount(0);
});

test("warns when EA's Division disagrees outside the Playoffs", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await startSeason({ fakeEa, triggerPoll });
  await play({ fakeEa, triggerPoll }, [win], 3);

  await page.goto("/analysis");
  await expect(warning(page)).toContainText(
    "we make it Division 5, EA says Division 2",
  );
});

test("ignores EA's Division changing during the Playoffs", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await startSeason({ fakeEa, triggerPoll });
  await play({ fakeEa, triggerPoll }, [win, playoff], 3);

  await page.goto("/analysis");
  await expect(
    panel(page).getByText(/^Playoffs: League Matches don't count/),
  ).toBeVisible();
  await expect(warning(page)).toHaveCount(0);
  await expect(panel(page).getByRole("progressbar")).toHaveAttribute(
    "aria-valuetext",
    "3 of 7 points",
  );
});
