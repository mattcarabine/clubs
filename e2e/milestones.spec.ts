// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import { KAB, LOL, serveMatch } from "./support/milestones.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-36: Milestone comments, and Milestones on the Match page, the
// profile. The Milestones page itself is milestones-page.spec.ts.

/** Anything that would label the copy as machine-written. */
const AI_LABEL = /claude|anthropic|\bAI\b|written by|generated/i;

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

function card(page: Page, headline: string) {
  return page.getByRole("article", { name: headline });
}

test("a Milestone's comment shows as site copy, and the plain sentence stands in while the call fails", async ({
  page,
  fakeEa,
  fakeAnthropic,
  triggerPoll,
}) => {
  await serveMatch(fakeEa, "936600000000001", 10, [{ player: KAB, goals: 3 }]);
  await fakeAnthropic.failNext(500);
  await triggerPoll();

  await page.goto("/milestones");
  const hatTrick = card(page, "Kabeeble — Hat-trick");
  await expect(hatTrick).toContainText("Kabeeble scored 3 goals in one Match.");

  await fakeAnthropic.reply({
    comments: [
      {
        milestoneId: await milestoneId(page),
        comment: "Three goals and the match ball. He will be unbearable.",
      },
    ],
  });
  await triggerPoll();
  await page.reload();
  await expect(hatTrick).toContainText(
    "Three goals and the match ball. He will be unbearable.",
  );
  await expect(hatTrick).not.toContainText("scored 3 goals in one Match");
  await expect(page.getByRole("main")).not.toContainText(AI_LABEL);
  await expectNoHorizontalScroll(page);
});

/** The only Milestone's ID, from the stored rows. */
async function milestoneId(page: Page): Promise<string> {
  const res = await page.request.get("/__test/tables/milestones");
  const [row] = (await res.json()) as { id: number }[];
  return String(row.id);
}

test("the Match page and the profile show the relevant Milestones", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const quiet = await serveMatch(fakeEa, "936800000000001", 60, [
    { player: KAB },
    { player: LOL },
  ]);
  const big = await serveMatch(fakeEa, "936800000000002", 20, [
    { player: KAB, goals: 3 },
    { player: LOL, goals: 1, assists: 3 },
  ]);
  await triggerPoll();

  await page.goto(`/matches/${big}`);
  const inMatch = page.getByRole("region", {
    name: "Milestones in this Match",
  });
  await expect(inMatch.getByRole("article")).toHaveText([
    /Loltown95 — 4 goal involvements/,
    /Kabeeble — Hat-trick/,
  ]);
  await page.goto(`/matches/${quiet}`);
  await expect(
    page.getByRole("region", { name: "Milestones in this Match" }),
  ).toHaveCount(0);

  await page.goto(`/players/${LOL.id}`);
  const theirs = page.getByRole("region", { name: "Milestones" });
  await expect(theirs.getByRole("article")).toHaveText([
    /Loltown95 — 4 goal involvements/,
  ]);
  await expect(
    theirs.getByRole("link", { name: "All their Milestones" }),
  ).toHaveAttribute("href", `/milestones?who=${LOL.id}`);
});

test.describe("on a 375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the nav keeps every item usable without scrolling the page sideways", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link")).toHaveCount(5);
    await expectNoHorizontalScroll(page);

    await nav.getByRole("link", { name: "Milestones" }).click();
    await expect(page).toHaveURL(/\/milestones$/);
    const current = nav.getByRole("link", { name: "Milestones" });
    await expect(current).toHaveAttribute("aria-current", "page");
    await expect(current).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalScroll(page);
  });
});
