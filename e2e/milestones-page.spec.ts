// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Locator, Page } from "@playwright/test";

import type { fakeEa as FakeEa } from "./support/fake-ea.ts";
import { KAB, LOL, serveMatch } from "./support/milestones.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-51: the Milestones page. Club leaders up top, then Milestones grouped
// by Session and by Match, filtered by type and by Squad Member.

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

/**
 * An older Session of six 2-1 Wins (a record 6 Wins in a Session), then a
 * 6-0 tonight with a Kabeeble hat-trick and four goal involvements for
 * Loltown95: four Milestones from one Match. Returns the Match IDs.
 */
async function serveTwoSessions(fakeEa: typeof FakeEa) {
  const older: string[] = [];
  for (let i = 0; i < 6; i++) {
    older.push(
      await serveMatch(
        fakeEa,
        `93710000000000${i}`,
        2 * DAY_MINUTES - i * 20,
        [{ player: KAB }, { player: LOL }],
        { goalsFor: 2, goalsAgainst: 1 },
      ),
    );
  }
  const tonight = await serveMatch(
    fakeEa,
    "937100000000009",
    20,
    [
      { player: KAB, goals: 3 },
      { player: LOL, goals: 1, assists: 3 },
    ],
    { goalsFor: 6, goalsAgainst: 0 },
  );
  return { older, tonight };
}

/** The feed's Session sections, newest first (the leaders are a region too). */
function sessions(page: Page): Locator {
  return page
    .getByRole("main")
    .getByRole("region")
    .filter({ has: page.getByRole("link", { name: "Session details" }) });
}

function feed(page: Page): Locator {
  return sessions(page).getByRole("article");
}

const TONIGHT = [
  "Kabeeble — Hat-trick",
  "Loltown95 — 4 goal involvements",
  "A Bloo Bloo — Record Win, by 6 goals",
  "A Bloo Bloo — Record 6 goals in a Match",
];

test("the club leaders name the leader and the next two in each stat, linking to profiles", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // Perfect ratings come from recorded Matches: two for Loltown95, one for Kabeeble.
  await serveMatch(fakeEa, "937000000000001", 60, [
    { player: KAB, rating: 10 },
    { player: LOL, rating: 10 },
  ]);
  await serveMatch(fakeEa, "937000000000002", 30, [
    { player: KAB, rating: 8.2 },
    { player: LOL, rating: 10 },
  ]);
  await triggerPoll();

  await page.goto("/milestones");
  const leaders = page.getByRole("region", { name: "Club leaders" });
  const board = (label: string) =>
    leaders
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: label, exact: true }) });

  // EA's career totals in fixtures/ea/members-career-stats.json, for the
  // Squad Members with recorded Appearances.
  await expect(board("Goals")).toContainText("98");
  await expect(board("Goals").getByRole("link").first()).toHaveAttribute(
    "href",
    `/players/${KAB.id}`,
  );
  await expect(board("Goals").getByRole("link").first()).toContainText(
    "Kabeeble",
  );
  await expect(
    // Hidden on phones, where the boards show only the leader.
    board("Goals").locator('ol[aria-label="Next in Goals"]'),
  ).toHaveText(/^2\s*Loltown95\s*86$/);
  await expect(board("Assists").getByRole("link").first()).toContainText(
    "Loltown95",
  );
  await expect(board("Average rating")).toContainText("7.9");
  await expect(board("Average rating").getByRole("link").first()).toContainText(
    "Loltown95",
  );
  await expect(
    board("Man of the Match").getByRole("link").first(),
  ).toContainText("Loltown95");
  // A tie goes by name: Kabeeble and Loltown95 both have 112.
  await expect(board("Appearances").getByRole("link").first()).toContainText(
    "Kabeeble",
  );
  await expect(
    board("Perfect ratings").getByRole("link").first(),
  ).toContainText("Loltown95");
  await expect(board("Perfect ratings")).toHaveText(
    /^Perfect ratings\s*2\s*Loltown95\s*2\s*Kabeeble\s*1$/,
  );
  await expectNoHorizontalScroll(page);
});

test("graft and discipline lead with tackles, passes, shots and red cards from recorded Matches", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const graft = (
    tackles: number,
    passes: number,
    shots: number,
    reds: number,
  ) => ({
    tacklesmade: String(tackles),
    passesmade: String(passes),
    shots: String(shots),
    redcards: String(reds),
  });
  await serveMatch(fakeEa, "937200000000001", 60, [
    { player: KAB, stats: graft(2, 30, 6, 1) },
    { player: LOL, stats: graft(9, 50, 1, 0) },
  ]);
  await serveMatch(fakeEa, "937200000000002", 30, [
    { player: KAB, stats: graft(1, 20, 5, 1) },
    { player: LOL, stats: graft(8, 45, 2, 0) },
  ]);
  await triggerPoll();

  await page.goto("/milestones");
  const section = page.getByRole("region", { name: "Graft and discipline" });
  const board = (label: string) =>
    section
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: label, exact: true }) });
  await expect(board("Tackles")).toHaveText(
    /^Tackles\s*17\s*Loltown95\s*2\s*Kabeeble\s*3$/,
  );
  await expect(board("Passes")).toHaveText(
    /^Passes\s*95\s*Loltown95\s*2\s*Kabeeble\s*50$/,
  );
  await expect(board("Shots")).toHaveText(
    /^Shots\s*11\s*Kabeeble\s*2\s*Loltown95\s*3$/,
  );
  // Nobody with no red cards is on that board.
  await expect(board("Red cards")).toHaveText(/^Red cards\s*2\s*Kabeeble$/);
});

test("with nothing recorded, there are no leaders and the empty state says what will fill the page", async ({
  page,
}) => {
  await page.goto("/milestones");
  await expect(page.getByRole("region", { name: "Club leaders" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("region", { name: "Graft and discipline" }),
  ).toHaveCount(0);
  await expect(page.getByRole("main")).toContainText("No Milestones yet");
});

test("Milestones are grouped by Session, newest first, then by Match, with each Match's score strip once", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const { older, tonight } = await serveTwoSessions(fakeEa);
  await triggerPoll();

  await page.goto("/milestones");
  await expect(sessions(page)).toHaveCount(2);
  const [newest, oldest] = [sessions(page).nth(0), sessions(page).nth(1)];

  await expect(newest).toContainText("4 Milestones");
  await expect(newest.getByRole("article")).toHaveCount(4);
  for (const headline of TONIGHT) {
    await expect(newest.getByRole("article", { name: headline })).toBeVisible();
  }
  // One score strip for the Match, not one per Milestone.
  const matchLinks = newest.getByRole("link", { name: /^Match v / });
  await expect(matchLinks).toHaveCount(1);
  await expect(matchLinks).toHaveAttribute("href", `/matches/${tonight}`);
  await expect(
    newest.getByRole("link", { name: "Session details" }),
  ).toHaveAttribute("href", `/sessions/${tonight}`);
  await expect(
    newest
      .getByRole("article", { name: "Kabeeble — Hat-trick" })
      .getByRole("link", { name: "Kabeeble's profile" }),
  ).toHaveAttribute("href", `/players/${KAB.id}`);
  await expect(
    newest.getByRole("article", {
      name: "A Bloo Bloo — Record Win, by 6 goals",
    }),
  ).toContainText("Since records began");

  await expect(oldest).toContainText("1 Milestone");
  await expect(oldest.getByRole("article")).toHaveText([
    /A Bloo Bloo — Record 6 Wins in a Session/,
  ]);
  await expect(
    oldest.getByRole("link", { name: "Session details" }),
  ).toHaveAttribute("href", `/sessions/${older[0]}`);
});

test("the type and Squad Member filters narrow the feed and combine", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await serveTwoSessions(fakeEa);
  await triggerPoll();
  await page.goto("/milestones");
  const types = page.getByRole("navigation", { name: "Milestone type" });
  const whose = page.getByRole("navigation", { name: "Whose Milestones" });

  await types.getByRole("link", { name: "Records" }).click();
  await expect(page).toHaveURL(/\?type=record$/);
  await expect(feed(page)).toHaveCount(3);
  await expect(feed(page)).toHaveText([
    /Record/,
    /Record/,
    /Record 6 Wins in a Session/,
  ]);

  await types.getByRole("link", { name: "Feats" }).click();
  await expect(feed(page)).toHaveCount(2);
  await whose.getByRole("link", { name: "Kabeeble" }).click();
  await expect(page).toHaveURL(new RegExp(`type=feat&who=${KAB.id}`));
  await expect(feed(page)).toHaveText([/Kabeeble — Hat-trick/]);
  await expect(types.getByRole("link", { name: "Feats" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // Kabeeble has no landmarks: the empty state says the filter is why.
  await types.getByRole("link", { name: "Landmarks" }).click();
  await expect(feed(page)).toHaveCount(0);
  await expect(page.getByRole("main")).toContainText("No Milestones match");

  await types.getByRole("link", { name: "All" }).click();
  await expect(page).toHaveURL(new RegExp(`\\?who=${KAB.id}$`));
  await expect(feed(page)).toHaveText([/Kabeeble — Hat-trick/]);

  // An unknown type falls back to every kind.
  await page.goto("/milestones?type=nonsense");
  await expect(feed(page)).toHaveCount(5);
  await expect(types.getByRole("link", { name: "All" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test.describe("on a 375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the leaders scroll inside their row, the filters stay on the first screen and the page never scrolls sideways", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    await serveTwoSessions(fakeEa);
    await triggerPoll();
    await page.goto("/milestones");
    await expect(
      page.getByRole("region", { name: "Club leaders" }).getByRole("listitem"),
    ).not.toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Milestone type" }),
    ).toBeInViewport();
    await expectNoHorizontalScroll(page);
  });
});
