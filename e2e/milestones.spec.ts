// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import { KAB, LOL, serveMatch } from "./support/milestones.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-36: the Milestones tab, and Milestones on the Match page, the
// profile and Matchday.

/** Anything that would label the copy as machine-written. */
const AI_LABEL = /claude|anthropic|\bAI\b|written by|generated/i;
const DAY_MINUTES = 24 * 60;

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

test("the Milestones page lists them newest first by Session, links to each Match and Session, and filters by Club or Squad Member", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // An older Session of six Wins, the last with a Kabeeble hat-trick; then a
  // 6-0 tonight with a 10.0 for Loltown95: a Perfect rating, a record Win
  // and most goals.
  const older: string[] = [];
  for (let i = 0; i < 6; i++) {
    older.push(
      await serveMatch(
        fakeEa,
        `93670000000000${i}`,
        2 * DAY_MINUTES - i * 20,
        [{ player: KAB, goals: i === 5 ? 3 : 0 }, { player: LOL }],
        { goalsFor: 2, goalsAgainst: 1 },
      ),
    );
  }
  const tonight = await serveMatch(
    fakeEa,
    "936700000000009",
    20,
    [{ player: KAB }, { player: LOL, rating: 10 }],
    { goalsFor: 6, goalsAgainst: 0 },
  );
  await triggerPoll();

  await page.goto("/milestones");
  await expect(
    page.getByRole("heading", { level: 1, name: "Milestones" }),
  ).toBeVisible();
  const sessions = page.getByRole("main").getByRole("region");
  await expect(sessions).toHaveCount(2);
  const [newest, oldest] = [sessions.nth(0), sessions.nth(1)];
  await expect(newest.getByRole("article")).toHaveText([
    /Loltown95 — Perfect rating/,
    /A Bloo Bloo — Record Win, by 6 goals/,
    /A Bloo Bloo — Record 6 goals in a Match/,
  ]);
  await expect(
    card(page, "A Bloo Bloo — Record Win, by 6 goals"),
  ).toContainText("Since records began");
  await expect(oldest.getByRole("article")).toHaveText([
    /Kabeeble — Hat-trick/,
    /A Bloo Bloo — Record 6 Wins in a Session/,
  ]);

  const hatTrick = card(page, "Kabeeble — Hat-trick");
  await expect(
    hatTrick.getByRole("link", { name: /^Match v / }),
  ).toHaveAttribute("href", `/matches/${older[5]}`);
  await expect(hatTrick.getByRole("link", { name: "Session" })).toHaveAttribute(
    "href",
    `/sessions/${older[0]}`,
  );
  await expect(
    newest.getByRole("link", { name: "Session details" }),
  ).toHaveAttribute("href", `/sessions/${tonight}`);

  const filter = page.getByRole("navigation", { name: "Whose Milestones" });
  await filter.getByRole("link", { name: "Club" }).click();
  await expect(page).toHaveURL(/who=club/);
  await expect(page.getByRole("main").getByRole("article")).toHaveText([
    /Record Win, by 6 goals/,
    /Record 6 goals in a Match/,
    /Record 6 Wins in a Session/,
  ]);

  await filter.getByRole("link", { name: "Kabeeble" }).click();
  await expect(page).toHaveURL(new RegExp(`who=${KAB.id}`));
  await expect(page.getByRole("main").getByRole("article")).toHaveText([
    /Kabeeble — Hat-trick/,
  ]);

  await filter.getByRole("link", { name: "All" }).click();
  await expect(page.getByRole("main").getByRole("article")).toHaveCount(5);
  await expectNoHorizontalScroll(page);
});

test("the Match page, the profile and Matchday show the relevant Milestones", async ({
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

  await page.goto("/");
  const latest = page.getByRole("region", { name: "Latest Milestone" });
  await expect(latest.getByRole("article")).toHaveCount(1);
  await expect(latest.getByRole("article")).toHaveText(
    /Kabeeble — Hat-trick|Loltown95 — 4 goal involvements/,
  );
  await expect(
    latest.getByRole("link", { name: "All Milestones" }),
  ).toHaveAttribute("href", "/milestones");
});

test.describe("on a 375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the nav keeps all seven items usable without scrolling the page sideways", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link")).toHaveCount(7);
    await expectNoHorizontalScroll(page);

    await nav.getByRole("link", { name: "Milestones" }).click();
    await expect(page).toHaveURL(/\/milestones$/);
    const current = nav.getByRole("link", { name: "Milestones" });
    await expect(current).toHaveAttribute("aria-current", "page");
    await expect(current).toBeInViewport({ ratio: 1 });
    await expectNoHorizontalScroll(page);
  });
});
