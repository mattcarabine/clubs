// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import {
  draw,
  friendly,
  loss,
  OUR_CLUB_ID,
  win,
} from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-13: /trends. Each test serves only the Matches it adds, so the
// recorded fixtures never leak into the buckets being checked.
test.beforeEach(async ({ fakeEa }) => {
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

const barList = (page: Page, name: string) =>
  page.getByRole("list", { name }).getByRole("listitem");

test("buckets Tuesday 20:00 and 22:30 London kick-offs by London time across a BST change", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // BST ended on Sun 26 Oct 2025, so the same London times are an hour apart in UTC.
  await fakeEa.addMatch(win({ playedAt: new Date("2025-10-21T19:00:00Z") })); // Tue 20:00 BST
  await fakeEa.addMatch(win({ playedAt: new Date("2025-10-21T21:30:00Z") })); // Tue 22:30 BST
  await fakeEa.addMatch(win({ playedAt: new Date("2025-10-28T20:00:00Z") })); // Tue 20:00 GMT
  await fakeEa.addMatch(loss({ playedAt: new Date("2025-10-28T22:30:00Z") })); // Tue 22:30 GMT
  await triggerPoll();

  await page.goto("/trends");

  await expect(barList(page, "Win % by day of the week")).toHaveText([
    /^Tue \(4\)\s*75%$/,
  ]);
  await expect(barList(page, "Win % by kick-off hour")).toHaveText([
    /^20:00 \(2\)\s*100%$/,
    /^22:00 \(2\)\s*50%$/,
  ]);
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

  await page.goto("/trends");

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

  await page.goto("/trends");
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

  await page.goto("/trends");

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
  await fakeEa.addMatch(friendly({ goalsFor: 0, goalsAgainst: 4 }));
  await triggerPoll();

  const results = page.getByRole("region", { name: "Results" });
  await page.goto("/trends");
  await expect(
    results.getByText("1 Match: 1 won, 0 drawn, 0 lost."),
  ).toBeVisible();

  await page.goto("/trends?types=league,playoff,friendly");
  await expect(
    results.getByText("2 Matches: 1 won, 0 drawn, 1 lost."),
  ).toBeVisible();
});

test("says what will fill the page before any Matches", async ({ page }) => {
  await page.goto("/trends");
  await expect(page.getByText("No Matches to chart")).toBeVisible();
  await expect(page.getByText("No skill rating yet")).toBeVisible();
});

test("has no horizontal page scroll, down to a 375px phone", async ({
  page,
  fakeEa,
  triggerPoll,
  viewport,
}) => {
  for (let d = 1; d <= 6; d++) {
    const playedAt = new Date(`2026-09-${10 + d}T19:30:00Z`);
    await fakeEa.addMatch(d % 3 ? win({ playedAt }) : loss({ playedAt }));
  }
  await triggerPoll();
  await page.goto("/trends");

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
