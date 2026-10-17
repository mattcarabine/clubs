// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Locator, Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import { type Lineup, win, withLineup } from "./support/match-builders.ts";
import { daysAgo, record } from "./support/record.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-40: Hot and Cold form badges, the last 5 ratings against the usual,
// on Squad, the profile, Compare and Matchday.

/** Squad Members that exist only in these specs. */
const HOT = { id: "900000051", name: "Hot Hand" };
const COLD = { id: "900000052", name: "Cold Feet" };
const STEADY = { id: "900000053", name: "Steady Eddie" };
const NEWBIE = { id: "900000054", name: "New Boy" };

const HOT_DETAIL = "Last 5: 8.0 avg vs 7.0 usual";
const COLD_DETAIL = "Last 5: 6.5 avg vs 7.5 usual";

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so every average is exact.
  for (const variant of ["leagueMatch", "playoffMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

/**
 * 15 Matches a day apart. The first 10 are League Matches with everyone in
 * their usual role; the last 5 are Playoff Matches, with Hot Hand at Forward.
 * New Boy misses the first Match, so has only 9 before the last 5.
 */
function season(): AddMatchBody[] {
  return Array.from({ length: 15 }, (_, i) => {
    const recent = i >= 10;
    const lineup: Lineup = [
      {
        player: HOT,
        rating: recent ? 8 : 7,
        pos: recent ? "forward" : "midfielder",
      },
      { player: COLD, rating: recent ? 6.5 : 7.5 },
      // A small change: 0.2 up.
      { player: STEADY, rating: recent ? 7.2 : 7 },
      ...(i === 0 ? [] : [{ player: NEWBIE, rating: recent ? 9 : 6 }]),
    ];
    return withLineup(
      win({
        ...daysAgo(15 - i),
        matchType: recent ? "playoffMatch" : "leagueMatch",
      }),
      lineup,
    );
  });
}

function squadRow(page: Page, name: string): Locator {
  return page
    .getByRole("table", { name: "Squad Members" })
    .locator("tbody tr")
    .filter({ has: page.getByRole("rowheader", { name: new RegExp(name) }) });
}

/** A badge, found by its tooltip. */
function badge(scope: Locator | Page, detail: string): Locator {
  return scope.locator(`[title="${detail}"]`);
}

test("Hot and Cold show on the Squad table with the two averages as the tooltip", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, season());

  await page.goto("/squad");
  const hot = badge(squadRow(page, HOT.name), HOT_DETAIL);
  await expect(hot).toHaveCount(1);
  await expect(hot).toContainText("Hot");
  const cold = badge(squadRow(page, COLD.name), COLD_DETAIL);
  await expect(cold).toContainText("Cold");

  // A small change, and fewer than 10 Appearances before the last 5: none.
  for (const name of [STEADY.name, NEWBIE.name]) {
    await expect(squadRow(page, name).locator("[title^='Last 5']")).toHaveCount(
      0,
    );
  }
});

test("the profile shows the badge beside the name", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, season());

  await page.goto(`/players/${HOT.id}`);
  const header = page.locator("header", {
    has: page.getByRole("heading", { level: 1, name: HOT.name }),
  });
  await expect(badge(header, HOT_DETAIL)).toContainText("Hot");

  await page.goto(`/players/${STEADY.id}`);
  await expect(page.locator("[title^='Last 5']")).toHaveCount(0);
});

test("Compare shows a badge on each side", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, season());

  await page.goto(`/compare?players=${HOT.id},${COLD.id}`);
  const plates = page.getByRole("region", { name: "Squad Members compared" });
  await expect(badge(plates, HOT_DETAIL)).toContainText("Hot");
  await expect(badge(plates, COLD_DETAIL)).toContainText("Cold");

  // Hot Hand's last 5 were all at Forward: as a Midfielder, no badge.
  await page.goto(`/compare?players=${HOT.id},${COLD.id}&posA=midfielder`);
  await expect(badge(plates, COLD_DETAIL)).toBeVisible();
  await expect(badge(plates, HOT_DETAIL)).toHaveCount(0);
});

test("badges follow the FilterBar and Position Group filters", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, season());

  // League only: the 10 earlier Matches, with no 10 before the last 5.
  await page.goto("/squad?types=league");
  await expect(page.locator("[title^='Last 5']")).toHaveCount(0);

  // As Forward, Hot Hand has only the last 5 Appearances.
  await page.goto("/squad?pos=forward");
  await expect(badge(page, HOT_DETAIL)).toHaveCount(0);
  await page.goto(`/players/${HOT.id}?pos=forward`);
  await expect(badge(page, HOT_DETAIL)).toHaveCount(0);
  await page.goto(`/players/${HOT.id}?types=league`);
  await expect(badge(page, HOT_DETAIL)).toHaveCount(0);
});

test.describe("on a 375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the Squad table keeps its first columns in view and the page does not scroll sideways", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    await record(fakeEa, triggerPoll, season());

    for (const path of [
      "/squad",
      `/players/${HOT.id}`,
      `/compare?players=${HOT.id},${COLD.id}`,
    ]) {
      await page.goto(path);
      await expect(badge(page, HOT_DETAIL).first()).toBeAttached();
      const fits = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(fits, path).toBe(true);
    }

    // The badge fits inside the name's phone cap (CLUBS-22, 6rem), so the
    // headline stats keep their place beside it.
    await page.goto("/squad");
    for (const player of [HOT, COLD]) {
      const name = squadRow(page, player.name).getByRole("link", {
        name: new RegExp(player.name),
      });
      expect((await name.boundingBox())?.width).toBeLessThanOrEqual(96);
    }

    // On phones the badge is just its arrow; the word is only read out.
    const hot = badge(squadRow(page, HOT.name), HOT_DETAIL);
    await expect(hot).toContainText("Hot");
    expect((await hot.boundingBox())?.width).toBeLessThan(32);
  });
});
