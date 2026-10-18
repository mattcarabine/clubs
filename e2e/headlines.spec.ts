// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import { expect, test } from "./support/test.ts";
import { SESSION_CLOCK, serveSession } from "./support/writeups.ts";

test.use({ pollAt: SESSION_CLOCK });

// CLUBS-43: a tabloid headline per Match, written with the Session's recap.

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

async function expectNoHorizontalScroll(page: Page) {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fits).toBe(true);
}

function ogDescription(page: Page) {
  return page
    .locator('meta[property="og:description"]')
    .getAttribute("content");
}

test("every Match in an ended Session gets a headline: on the Matches list, the Match page, Matchday and the link preview", async ({
  page,
  fakeEa,
  fakeAnthropic,
  triggerPoll,
}) => {
  const ids = await serveSession(fakeEa, {
    idPrefix: "93530000000000",
    startedMinutesAgo: 120,
    results: ["W", "L"],
  });
  const headlines = [
    "Kabeeble fires Bloo Bloo to glory",
    "Bloo Bloo collapse in late horror show",
  ];
  await fakeAnthropic.reply({
    recap: "A split night.",
    matchReports: ids.map((matchId, i) => ({
      matchId,
      report: "Report.",
      headline: headlines[i],
    })),
    stateOfTheClub: "Fine.",
  });
  await triggerPoll();

  await page.goto("/matches");
  for (const [i, matchId] of ids.entries()) {
    const row = page.locator(`a[href="/matches/${matchId}"]`);
    await expect(row).toContainText(headlines[i]);
  }

  for (const [i, matchId] of ids.entries()) {
    await page.goto(`/matches/${matchId}`);
    await expect(
      page.getByRole("region", { name: "Score" }).getByText(headlines[i]),
    ).toBeVisible();
    expect(await ogDescription(page)).toMatch(
      new RegExp(`^${headlines[i]} · `),
    );
  }

  // The lead Match is the newest.
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Latest Match" }).getByText(headlines[1]),
  ).toBeVisible();
});

test("without a headline the score line shows on its own", async ({
  page,
  fakeEa,
  fakeAnthropic,
  triggerPoll,
}) => {
  // Still within 45 minutes of its last kick-off, so nothing is written yet.
  const [matchId] = await serveSession(fakeEa, {
    idPrefix: "93531000000000",
    startedMinutesAgo: 10,
    results: ["W"],
  });
  await triggerPoll();
  expect(await fakeAnthropic.requests()).toHaveLength(0);

  await page.goto("/matches");
  const row = page.locator(`a[href="/matches/${matchId}"]`);
  await expect(row).toContainText("A Bloo Bloo");
  await expect(row.locator("p[title]")).toHaveCount(0);

  await page.goto(`/matches/${matchId}`);
  await expect(page.getByRole("region", { name: "Score" })).toContainText(
    "A Bloo Bloo",
  );
  expect(await ogDescription(page)).toMatch(/^League · /);

  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Latest Match" }),
  ).toBeVisible();
});

test("at 375px a long headline is cut with an ellipsis, in full in its tooltip, and the page never scrolls sideways", async ({
  page,
  fakeEa,
  fakeAnthropic,
  triggerPoll,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const [matchId] = await serveSession(fakeEa, {
    idPrefix: "93532000000000",
    startedMinutesAgo: 120,
    results: ["D"],
  });
  // 80 characters, the most a headline may be.
  const long =
    "Bloo Bloo and Kebab Over6pack share the spoils in a madcap, end-to-end thriller!";
  expect(long).toHaveLength(80);
  await fakeAnthropic.reply({
    recap: "A draw.",
    matchReports: [{ matchId, report: "Level.", headline: long }],
    stateOfTheClub: "Fine.",
  });
  await triggerPoll();

  await page.goto("/matches");
  const headline = page.locator(`a[href="/matches/${matchId}"] p[title]`);
  await expect(headline).toHaveAttribute("title", long);
  const cut = await headline.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(cut).toBe(true);
  await expectNoHorizontalScroll(page);

  await page.goto(`/matches/${matchId}`);
  await expect(page.getByText(long)).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto("/");
  await expectNoHorizontalScroll(page);
});
