// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Locator, Page } from "@playwright/test";

import {
  dnf,
  friendly,
  OUR_CLUB_ID,
  recordedLeagueMatches,
  win,
} from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-11: the Match list (/matches) and Match detail (/matches/:matchId).

const CLUB_NAME = "A Bloo Bloo";
const MINUTE_MS = 60_000;

/** The links to Match detail pages in the list, in page order. */
function matchLinks(page: Page) {
  return page.getByRole("main").locator('a[href^="/matches/"]');
}

function lineup(page: Page, clubName: string) {
  return page.getByRole("region", { name: `${clubName} line-up` });
}

/** A line-up row: its accessible name starts with the player's name. */
function playerRow(table: Locator, name: string) {
  return table.getByRole("row", { name: new RegExp(`^${escapeRegExp(name)}`) });
}

async function expectNoHorizontalScroll(page: Page) {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fits).toBe(true);
}

test.describe("Match detail", () => {
  test("a recorded Match shows both line-ups and the score from the Raw Payload", async ({
    page,
    triggerPoll,
  }) => {
    await triggerPoll();
    const recorded = recordedLeagueMatches()[0];
    const opponentId = Object.keys(recorded.clubs).find(
      (id) => id !== OUR_CLUB_ID,
    );
    if (!opponentId) throw new Error("Recorded match has no Opponent");
    const ours = recorded.clubs[OUR_CLUB_ID];
    const theirs = recorded.clubs[opponentId];
    const opponentName = theirs.details?.name ?? opponentId;

    await page.goto(`/matches/${recorded.matchId}`);

    await expect(
      page.getByRole("heading", { level: 1, name: `v ${opponentName}` }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Score" })
        .getByText(
          `${CLUB_NAME} ${ours.goals}, ${opponentName} ${theirs.goals}`,
        ),
    ).toBeAttached();

    for (const [clubId, clubName] of [
      [OUR_CLUB_ID, CLUB_NAME],
      [opponentId, opponentName],
    ] as const) {
      const table = lineup(page, clubName);
      const players = Object.entries(recorded.players[clubId] ?? {});
      expect(players.length).toBeGreaterThan(0);
      // One row per player plus a heading row per Position Group and the header.
      for (const [playerId, player] of players) {
        const name = player.playername ?? playerId;
        const row = playerRow(table, name);
        await expect(row).toHaveCount(1);
        await expect(row.getByRole("cell").first()).toHaveText(
          Number(player.rating).toFixed(1),
        );
        // Squad Members link to their profiles; Opponent players never do.
        const link = row.getByRole("link", { name });
        if (clubId === OUR_CLUB_ID) {
          await expect(link).toHaveAttribute("href", `/players/${playerId}`);
        } else {
          await expect(link).toHaveCount(0);
        }
      }
    }

    const motm = Object.values(recorded.players[OUR_CLUB_ID] ?? {}).find(
      (p) => p.mom === "1",
    );
    if (motm?.playername) {
      await expect(
        playerRow(lineup(page, CLUB_NAME), motm.playername).getByTitle(
          "Man of the Match",
        ),
      ).toBeVisible();
    }

    // The team comparison totals the line-ups.
    const shots = (clubId: string) =>
      Object.values(recorded.players[clubId] ?? {}).reduce(
        (total, p) => total + Number(p.shots),
        0,
      );
    await expect(
      page
        .getByRole("region", { name: "Match stats" })
        .getByText(
          `Shots: ${CLUB_NAME} ${shots(OUR_CLUB_ID)}, ${opponentName} ${shots(opponentId)}`,
        ),
    ).toBeAttached();
    await expect(
      page.getByRole("link", { name: `Head-to-head with ${opponentName}` }),
    ).toHaveAttribute("href", `/opponents/${opponentId}`);
  });

  test("a DNF win shows a DNF badge and explains it", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
    await fakeEa.addMatch(dnf({ matchId: "800000000000001" }));
    await triggerPoll();

    await page.goto("/matches");
    await expect(matchLinks(page)).toHaveCount(1);
    await expect(
      matchLinks(page).first().getByTitle("Did not finish"),
    ).toBeVisible();
    await matchLinks(page).first().click();

    await expect(page).toHaveURL(/\/matches\/800000000000001$/);
    const score = page.getByRole("region", { name: "Score" });
    await expect(score.getByTitle("Did not finish")).toBeVisible();
    await expect(score.getByText("DNF win", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "DNF" }),
    ).toContainText(
      `quit before full time, so EA awarded the Match to ${CLUB_NAME}`,
    );
  });

  test("a Friendly's page is a 404, though the Poll stored it", async ({
    page,
    fakeEa,
    triggerPoll,
    db,
  }) => {
    await fakeEa.addMatch(friendly({ matchId: "800000000000002" }));
    await triggerPoll();
    expect(
      (await db.rows("matches")).some((m) => m.match_id === "800000000000002"),
    ).toBe(true);

    const res = await page.goto("/matches/800000000000002");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("Match not found")).toBeVisible();
  });

  test("an unknown Match ID is a 404", async ({ page }) => {
    const res = await page.goto("/matches/123");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("Match not found")).toBeVisible();
    await expect(page.getByRole("link", { name: "All Matches" })).toBeVisible();
  });
});

test.describe("Match list", () => {
  test.beforeEach(async ({ fakeEa }) => {
    // Only the Matches each test adds.
    await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
  });

  test("lists Matches newest first, 20 to a page", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    // EA returns at most 10 Matches per Poll, so record 21 over three Polls.
    const start = Date.now() - 2 * 24 * 60 * MINUTE_MS;
    for (let i = 0; i < 21; i++) {
      await fakeEa.addMatch(
        win({
          matchId: String(810_000_000_000_000 + i),
          playedAt: new Date(start + i * MINUTE_MS),
        }),
      );
      if (i % 10 === 9) await triggerPoll();
    }
    await triggerPoll();

    await page.goto("/matches");
    await expect(page.getByText("21 Matches, newest first")).toBeVisible();
    await expect(matchLinks(page)).toHaveCount(20);
    await expect(matchLinks(page).first()).toHaveAttribute(
      "href",
      "/matches/810000000000020",
    );
    await expect(matchLinks(page).last()).toHaveAttribute(
      "href",
      "/matches/810000000000001",
    );
    // Each row shows the Match Type, the result and both clubs.
    const first = matchLinks(page).first();
    await expect(first.getByText("League", { exact: true })).toBeVisible();
    await expect(first.getByRole("img", { name: "Win" })).toBeVisible();
    await expect(first.getByText(`${CLUB_NAME} 3, `)).toBeAttached();

    const pages = page.getByRole("navigation", { name: "Pages" });
    await expect(pages.getByText("Page 1 of 2")).toBeVisible();
    await pages.getByRole("link", { name: "Older" }).click();
    await expect(page).toHaveURL(/\?page=2$/);
    await expect(matchLinks(page)).toHaveCount(1);
    await expect(matchLinks(page).first()).toHaveAttribute(
      "href",
      "/matches/810000000000000",
    );
    await pages.getByRole("link", { name: "Newer" }).click();
    await expect(matchLinks(page)).toHaveCount(20);
  });

  test("respects the FilterBar", async ({ page, fakeEa, triggerPoll }) => {
    await fakeEa.addMatch(win());
    await fakeEa.addMatch(win({ matchType: "playoffMatch" }));
    await triggerPoll();

    await page.goto("/matches");
    await expect(matchLinks(page)).toHaveCount(2);

    await page
      .getByRole("region", { name: "Stats filters" })
      .getByRole("button", { name: "Playoff", exact: true })
      .click();
    await expect(page).toHaveURL(/types=league(&|$)/);
    await expect(matchLinks(page)).toHaveCount(1);
    await expect(page.getByText("1 Match, newest first")).toBeVisible();
  });

  test("says so when no Matches fit", async ({ page }) => {
    await page.goto("/matches");
    await expect(page.getByText("No Matches", { exact: true })).toBeVisible();
  });
});

test("both pages fit a 375px phone without horizontal page scroll", async ({
  page,
  triggerPoll,
}) => {
  await triggerPoll();
  await page.setViewportSize({ width: 375, height: 800 });

  await page.goto("/matches");
  await expect(matchLinks(page).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  await matchLinks(page).first().click();
  await expect(lineup(page, CLUB_NAME)).toBeVisible();
  await expectNoHorizontalScroll(page);
});

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
