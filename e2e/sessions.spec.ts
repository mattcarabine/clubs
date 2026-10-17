// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import { draw, loss, win, withLineup } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-34: the Matches page grouped by Session, and the Session page.

const MINUTE_MS = 60_000;

const KAB = { id: "934000001", name: "Kabeeble" };
const TREV = { id: "934000002", name: "Trevor" };

/** Kabeeble scores in every Match; Trevor plays only where `withTrevor` says. */
function lineup(body: AddMatchBody, withTrevor = true): AddMatchBody {
  return withLineup(body, [
    { player: KAB, goals: 1, rating: 8 },
    ...(withTrevor ? [{ player: TREV, rating: 6.5 }] : []),
  ]);
}

/**
 * Two Sessions, the newest an hour ago: the older a Win then, 30 minutes
 * later, a Loss; after a 60-minute gap, a Win and, 30 minutes later, a Draw.
 */
const SESSIONS = {
  older: ["934000000000001", "934000000000002"],
  newer: ["934000000000003", "934000000000004"],
};

async function recordTwoSessions(
  fakeEa: { addMatch: (body: AddMatchBody) => Promise<void> },
  triggerPoll: () => Promise<unknown>,
) {
  const start = Date.now() - 3 * 60 * MINUTE_MS;
  const at = (minutes: number) => new Date(start + minutes * MINUTE_MS);
  const [a, b] = SESSIONS.older;
  const [c, d] = SESSIONS.newer;
  await fakeEa.addMatch(lineup(win({ matchId: a, playedAt: at(0) })));
  await fakeEa.addMatch(lineup(loss({ matchId: b, playedAt: at(30) }), false));
  await fakeEa.addMatch(lineup(win({ matchId: c, playedAt: at(90) })));
  await fakeEa.addMatch(lineup(draw({ matchId: d, playedAt: at(120) })));
  await triggerPoll();
}

/** The Session sections on /matches, newest first. */
function sessions(page: Page) {
  return page.getByRole("main").getByRole("region", { name: /^Session, / });
}

function matchLinks(scope: ReturnType<Page["getByRole"]>) {
  return scope.locator('a[href^="/matches/"]');
}

async function expectNoHorizontalScroll(page: Page) {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fits).toBe(true);
}

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

test("Matches 30 minutes apart share a Session and a 60-minute gap starts a new one", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordTwoSessions(fakeEa, triggerPoll);
  await page.goto("/matches");

  await expect(sessions(page)).toHaveCount(2);
  const [newer, older] = [sessions(page).nth(0), sessions(page).nth(1)];

  // Newest first, each Session's Matches newest first.
  await expect(matchLinks(newer)).toHaveCount(2);
  await expect(matchLinks(newer).first()).toHaveAttribute(
    "href",
    `/matches/${SESSIONS.newer[1]}`,
  );
  await expect(matchLinks(older).last()).toHaveAttribute(
    "href",
    `/matches/${SESSIONS.older[0]}`,
  );

  await expect(newer.getByText("Won 1, drawn 1, lost 0")).toBeAttached();
  await expect(newer.getByText("1 Dropped Points")).toBeVisible();
  await expect(newer.getByText("5 scored, 3 conceded")).toBeVisible();
  await expect(newer.getByText("2 Matches", { exact: false })).toBeVisible();
  await expect(older.getByText("Won 1, drawn 0, lost 1")).toBeAttached();
  await expect(older.getByText("4 scored, 4 conceded")).toBeVisible();
  // Kabeeble scored in both Matches.
  await expect(older.getByText("Top performer")).toBeVisible();
  await expect(older.getByText(KAB.name)).toBeVisible();
  await expect(older.getByText(/^2 G/)).toBeVisible();
});

test("a Session header opens the Session page and a Match row its Match page", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordTwoSessions(fakeEa, triggerPoll);
  await page.goto("/matches");

  const newer = sessions(page).first();
  await newer.getByRole("link", { name: /Session details/ }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${SESSIONS.newer[0]}$`));
  await expect(
    page.getByRole("heading", { level: 1, name: "Session" }),
  ).toBeVisible();

  await page.goBack();
  await matchLinks(sessions(page).first()).first().click();
  await expect(page).toHaveURL(new RegExp(`/matches/${SESSIONS.newer[1]}$`));
});

test("a partly filtered Session says how many Matches are shown, and a fully filtered one is hidden", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const start = Date.now() - 6 * 60 * MINUTE_MS;
  const at = (minutes: number) => new Date(start + minutes * MINUTE_MS);
  // One Session of a League Match and a Playoff, then a Playoff-only Session.
  await fakeEa.addMatch(win({ matchId: "934100000000001", playedAt: at(0) }));
  await fakeEa.addMatch(
    loss({
      matchId: "934100000000002",
      playedAt: at(30),
      matchType: "playoffMatch",
    }),
  );
  await fakeEa.addMatch(
    win({
      matchId: "934100000000003",
      playedAt: at(180),
      matchType: "playoffMatch",
    }),
  );
  await triggerPoll();

  await page.goto("/matches");
  await expect(sessions(page)).toHaveCount(2);
  await expect(page.getByText(/of \d+ Matches shown/)).toHaveCount(0);

  await page.goto("/matches?types=league");
  await expect(sessions(page)).toHaveCount(1);
  const session = sessions(page).first();
  await expect(session.getByText("1 of 2 Matches shown")).toBeVisible();
  await expect(matchLinks(session)).toHaveCount(1);
  // The record covers only the Matches shown.
  await expect(session.getByText("Won 1, drawn 0, lost 0")).toBeAttached();
});

test("a page holds whole Sessions, never splitting one", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // 19 single-Match Sessions an hour apart, then a 3-Match Session: page 1
  // reaches 20 Matches only by taking the whole 3-Match Session.
  const start = Date.now() - 2 * 24 * 60 * MINUTE_MS;
  const at = (minutes: number) => new Date(start + minutes * MINUTE_MS);
  const kickoffs = [
    ...Array.from({ length: 19 }, (_, i) => i * 60),
    ...[0, 20, 40].map((m) => 20 * 60 + m),
  ];
  // EA returns at most 10 Matches per Poll.
  for (const [i, minutes] of kickoffs.entries()) {
    await fakeEa.addMatch(
      win({ matchId: String(934_200_000_000_000 + i), playedAt: at(minutes) }),
    );
    if (i % 10 === 9) await triggerPoll();
  }
  await triggerPoll();

  await page.goto("/matches");
  await expect(page.getByText("22 Matches, newest first")).toBeVisible();
  // The newest Session (3 Matches) and 17 single-Match Sessions make 20.
  await expect(sessions(page)).toHaveCount(18);
  await expect(matchLinks(page.getByRole("main"))).toHaveCount(20);
  const pages = page.getByRole("navigation", { name: "Pages" });
  await expect(pages.getByText("Page 1 of 2")).toBeVisible();
  await pages.getByRole("link", { name: "Older" }).click();
  await expect(sessions(page)).toHaveCount(2);
});

test("/sessions redirects to /matches", async ({ page }) => {
  await page.goto("/sessions");
  await expect(page).toHaveURL(/\/matches$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Matches" }),
  ).toBeVisible();
});

test("the Session page shows its Matches in order, a leaderboard and its record", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordTwoSessions(fakeEa, triggerPoll);
  await page.goto(`/sessions/${SESSIONS.older[0]}`);

  await expect(page.getByRole("link", { name: "All Matches" })).toBeVisible();
  const record = page.getByRole("region", { name: "Record" });
  await expect(record.getByText("Won 1, drawn 0, lost 1")).toBeAttached();
  await expect(record.getByText("1 Dropped Points")).toBeVisible();

  // Oldest first, and only this Session's.
  const matches = matchLinks(page.getByRole("region", { name: "Matches" }));
  await expect(matches).toHaveCount(2);
  await expect(matches.nth(0)).toHaveAttribute(
    "href",
    `/matches/${SESSIONS.older[0]}`,
  );
  await expect(matches.nth(1)).toHaveAttribute(
    "href",
    `/matches/${SESSIONS.older[1]}`,
  );

  const table = page.getByRole("table", { name: "Session leaderboard" });
  // Header plus one row each: Kabeeble played twice and scored twice, Trevor once.
  await expect(table.getByRole("row")).toHaveCount(3);
  // Cells after the name: Apps, G, A, G+A, Rating, MOTM.
  const cells = (name: string) =>
    table.getByRole("row", { name: new RegExp(`^${name}`) }).getByRole("cell");
  await expect(cells(KAB.name).nth(0)).toHaveText("2");
  await expect(cells(KAB.name).nth(1)).toHaveText("2");
  await expect(cells(KAB.name).nth(4)).toHaveText("8.0");
  await expect(cells(TREV.name).nth(0)).toHaveText("1");
  await expect(cells(TREV.name).nth(1)).toHaveText("0");
  await expect(cells(TREV.name).nth(4)).toHaveText("6.5");
  await expect(
    page.getByRole("region", { name: "The night's form" }),
  ).toContainText("3 points");
});

test("the Session page compares the Session with the usual once there are 3 other Matches", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordTwoSessions(fakeEa, triggerPoll);
  const usual = page.getByRole("region", { name: "Compared with your usual" });
  // Two other Matches say too little.
  await page.goto(`/sessions/${SESSIONS.newer[0]}`);
  await expect(page.getByRole("region", { name: "Record" })).toBeVisible();
  await expect(usual).toHaveCount(0);

  await fakeEa.addMatch(
    win({
      matchId: "934400000000001",
      playedAt: new Date(Date.now() - 24 * 60 * MINUTE_MS),
    }),
  );
  await triggerPoll();
  await page.reload();
  const table = usual.getByRole("table", {
    name: "This Session against the usual",
  });
  await expect(table.getByRole("row", { name: /^Goals per 90/ })).toBeVisible();
  await expect(
    table.getByRole("row", { name: /^Opponent goals per 90/ }),
  ).toBeVisible();
});

test("Matchday links to tonight's Session and a Match links to its Session", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordTwoSessions(fakeEa, triggerPoll);

  await page.goto("/");
  await page.getByRole("link", { name: "Tonight's Session" }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${SESSIONS.newer[0]}$`));

  await page.goto(`/matches/${SESSIONS.older[1]}`);
  await page.getByRole("link", { name: "This Match's Session" }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${SESSIONS.older[0]}$`));
});

test("Matchday links to the last Session once tonight's is over", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(
    win({
      matchId: "934300000000001",
      playedAt: new Date(Date.now() - 24 * 60 * MINUTE_MS),
    }),
  );
  await triggerPoll();
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Last Session" }),
  ).toHaveAttribute("href", "/sessions/934300000000001");
});

test("an unknown Session is a 404", async ({ page, fakeEa, triggerPoll }) => {
  await recordTwoSessions(fakeEa, triggerPoll);
  // A Match that does not start its Session is no Session's ID either.
  for (const id of ["123", SESSIONS.older[1]]) {
    const res = await page.goto(`/sessions/${id}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByText("Session not found")).toBeVisible();
    await expect(page.getByRole("link", { name: "All Matches" })).toBeVisible();
  }
});

test("both pages fit a 375px phone and use the width on desktop", async ({
  page,
  fakeEa,
  triggerPoll,
  viewport,
}) => {
  await recordTwoSessions(fakeEa, triggerPoll);
  const wide = viewport?.width ?? 1440;

  for (const path of ["/matches", `/sessions/${SESSIONS.newer[0]}`]) {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(path);
    await expect(page.locator('a[href^="/matches/9"]').first()).toBeVisible();
    await expectNoHorizontalScroll(page);

    if (wide >= 1024) {
      // Desktop sets a Session's two Matches side by side.
      await page.setViewportSize({ width: wide, height: 900 });
      const rows = page.locator('a[href^="/matches/9"]');
      const [first, second] = [
        await rows.nth(0).boundingBox(),
        await rows.nth(1).boundingBox(),
      ];
      expect(first?.y).toBe(second?.y);
      await expectNoHorizontalScroll(page);
    }
  }
});
