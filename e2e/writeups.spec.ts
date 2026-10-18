// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import { expect, test } from "./support/test.ts";
import { serveSession } from "./support/writeups.ts";

// CLUBS-35: write-ups shown as ordinary site copy, and never written by a page.

/** Anything that would label the copy as machine-written. */
const AI_LABEL = /claude|anthropic|\bAI\b|written by|generated/i;

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

async function expectNoAiLabel(page: Page) {
  await expect(page.getByRole("main")).not.toContainText(AI_LABEL);
  expect(await page.title()).not.toMatch(AI_LABEL);
}

async function expectNoHorizontalScroll(page: Page) {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fits).toBe(true);
}

test("the recap, Match reports and State of the club show as site copy, and no page calls the API", async ({
  page,
  fakeEa,
  fakeAnthropic,
  triggerPoll,
}) => {
  const ids = await serveSession(fakeEa, {
    idPrefix: "93520000000000",
    startedMinutesAgo: 120,
    results: ["W", "L"],
  });
  await fakeAnthropic.reply({
    recap:
      "A split night at the office. Kabeeble scored in both Matches.\n\nThe loss stung.",
    matchReports: [
      { matchId: ids[0], report: "Kabeeble opened the scoring early." },
      { matchId: ids[1], report: "Undone at the back in the second half." },
    ],
    stateOfTheClub: "Played 2, won 1. The Squad is finding its feet.",
  });
  await triggerPoll();
  expect(await fakeAnthropic.requests()).toHaveLength(1);

  await page.goto(`/sessions/${ids[0]}`);
  const recap = page.getByRole("article", { name: "Session recap" });
  await expect(recap.getByRole("paragraph")).toHaveText([
    "A split night at the office. Kabeeble scored in both Matches.",
    "The loss stung.",
    /^Filed /,
  ]);
  await expectNoAiLabel(page);
  await expectNoHorizontalScroll(page);

  await page.goto("/matches");
  await expect(page.getByText("A split night at the office.")).toBeVisible();
  await expect(page.getByText("The loss stung.")).toHaveCount(0);

  for (const [matchId, report] of [
    [ids[0], "Kabeeble opened the scoring early."],
    [ids[1], "Undone at the back in the second half."],
  ]) {
    await page.goto(`/matches/${matchId}`);
    await expect(
      page.getByRole("article", { name: "Match report" }),
    ).toContainText(report);
    await expectNoAiLabel(page);
  }

  await page.goto("/analysis");
  await expect(
    page.getByRole("article", { name: "State of the club" }),
  ).toContainText("The Squad is finding its feet.");
  await expectNoAiLabel(page);
  await expectNoHorizontalScroll(page);

  // Every page load above, and a few more, sent nothing upstream.
  for (const path of ["/", "/squad", "/trends", "/opponents"]) {
    await page.goto(path);
  }
  expect(await fakeAnthropic.requests()).toHaveLength(1);
});

test("a write-up is shown as text: HTML in it is escaped", async ({
  page,
  fakeEa,
  fakeAnthropic,
  triggerPoll,
}) => {
  const [sessionId] = await serveSession(fakeEa, {
    idPrefix: "93521000000000",
    startedMinutesAgo: 120,
    results: ["W"],
  });
  const injected = '<img src=x onerror="window.__pwned=1"><b>Bold</b> claim.';
  await fakeAnthropic.reply({
    recap: injected,
    matchReports: [],
    stateOfTheClub: "Fine.",
  });
  await triggerPoll();

  await page.goto(`/sessions/${sessionId}`);
  const recap = page.getByRole("article", { name: "Session recap" });
  await expect(recap).toContainText(injected);
  await expect(recap.locator("img, b")).toHaveCount(0);
  expect(await page.evaluate(() => "__pwned" in window)).toBe(false);
});

test("an out-of-credit error keeps the previous write-ups on the pages", async ({
  page,
  fakeEa,
  fakeAnthropic,
  triggerPoll,
  db,
}) => {
  const ids = await serveSession(fakeEa, {
    idPrefix: "93522000000000",
    startedMinutesAgo: 150,
    results: ["W"],
  });
  await fakeAnthropic.reply({
    recap: "First recap.",
    matchReports: [{ matchId: ids[0], report: "First report." }],
    stateOfTheClub: "First State of the club.",
  });
  await triggerPoll();

  // A late Match joins the Session, and the rewrite hits an empty balance.
  await serveSession(fakeEa, {
    idPrefix: "93522100000000",
    startedMinutesAgo: 120,
    results: ["L"],
  });
  await fakeAnthropic.failNext(400, {
    type: "invalid_request_error",
    message: "Your credit balance is too low to access the Anthropic API.",
  });
  await triggerPoll();

  expect(await fakeAnthropic.requests()).toHaveLength(2);
  const runs = await db.rows<{ status: string }>("poll_runs");
  expect(runs.map((r) => r.status)).toEqual(["ok", "ok"]);

  await page.goto(`/sessions/${ids[0]}`);
  await expect(
    page.getByRole("article", { name: "Session recap" }),
  ).toContainText("First recap.");
  await page.goto(`/matches/${ids[0]}`);
  await expect(
    page.getByRole("article", { name: "Match report" }),
  ).toContainText("First report.");
  await page.goto("/analysis");
  await expect(
    page.getByRole("article", { name: "State of the club" }),
  ).toContainText("First State of the club.");
});
