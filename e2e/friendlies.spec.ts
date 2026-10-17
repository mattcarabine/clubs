import type { Page } from "@playwright/test";

import { friendly, win, withLineup } from "./support/match-builders.ts";
import { against } from "./support/opponent.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-32: the Poll still stores Friendlies, but no page shows them.

/** A Squad Member who plays in the League Match and the Friendly. */
const REGULAR = { id: "900000041", name: "League Regular" };
/** A player whose only Appearance is in the Friendly. */
const GUEST = { id: "900000042", name: "Friendly Guest" };
/** The Opponent of every Match the builders make (from the recorded fixture). */
const LEAGUE_OPPONENT = { clubId: "356611", name: "Bunch of bums" };
/** An Opponent met only in the Friendly. */
const FRIENDLY_OPPONENT = { clubId: "7700001", name: "Exhibition Rovers" };
const FRIENDLY_ID = "880000000000001";

/** Every page that mounts the FilterBar. */
const FILTER_BAR_PAGES = [
  "/squad",
  "/matches",
  "/opponents",
  `/opponents/${LEAGUE_OPPONENT.clubId}`,
  "/trends",
  "/analysis",
  `/players/${REGULAR.id}`,
  "/compare",
];

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so every count is exact.
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

function filters(page: Page) {
  return page.getByRole("region", { name: "Stats filters" });
}

function matchTypeChip(page: Page, name: string) {
  return filters(page)
    .getByRole("group", { name: "Match Type" })
    .getByRole("button", { name, exact: true });
}

test("no FilterBar offers a Friendly chip", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(withLineup(win(), [{ player: REGULAR }]));
  await triggerPoll();

  for (const path of FILTER_BAR_PAGES) {
    await page.goto(path);
    await expect(matchTypeChip(page, "League"), path).toBeVisible();
    await expect(matchTypeChip(page, "Playoff"), path).toBeVisible();
    await expect(
      filters(page).getByRole("button", { name: /friendly/i }),
      path,
    ).toHaveCount(0);
  }
});

test("?types= ignores friendly", async ({ page, fakeEa, triggerPoll }) => {
  await fakeEa.addMatch(win());
  await fakeEa.addMatch(win({ matchType: "playoffMatch" }));
  await fakeEa.addMatch(friendly());
  await triggerPoll();

  // Only friendly: as if there were no types at all.
  let res = await page.goto("/matches?types=friendly");
  expect(res?.status()).toBe(200);
  await expect(page.getByText("2 Matches, newest first")).toBeVisible();
  await expect(matchTypeChip(page, "League")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(matchTypeChip(page, "Playoff")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // League and friendly: League only.
  res = await page.goto("/matches?types=league,friendly");
  expect(res?.status()).toBe(200);
  await expect(page.getByText("1 Match, newest first")).toBeVisible();
  await expect(matchTypeChip(page, "League")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(matchTypeChip(page, "Playoff")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("a Friendly recorded by a Poll appears on no page and in no count", async ({
  page,
  fakeEa,
  triggerPoll,
  db,
}) => {
  await fakeEa.addMatch(
    withLineup(win({ goalsFor: 1, goalsAgainst: 0 }), [
      { player: REGULAR, goals: 1 },
    ]),
  );
  // The newest Match, so Matchday would lead with it if it were shown.
  await fakeEa.addMatch(
    against(
      FRIENDLY_OPPONENT,
      withLineup(
        friendly({
          matchId: FRIENDLY_ID,
          goalsFor: 6,
          goalsAgainst: 5,
          playedAt: new Date(Date.now() + 60_000),
        }),
        [
          { player: REGULAR, goals: 5 },
          { player: GUEST, goals: 1 },
        ],
      ),
    ),
  );
  await triggerPoll();

  // Ingestion is unchanged: the Friendly is stored.
  const stored = await db.rows<{ match_id: string; match_type: string }>(
    "matches",
  );
  expect(stored.find((m) => m.match_id === FRIENDLY_ID)?.match_type).toBe(
    "friendly",
  );

  const hidden = [FRIENDLY_OPPONENT.name, GUEST.name, "Friendly"];
  for (const path of ["/", ...FILTER_BAR_PAGES]) {
    // Asking for Friendlies in the URL changes nothing.
    for (const query of ["", "?types=league,playoff,friendly"]) {
      await page.goto(path + query);
      for (const text of hidden) {
        await expect(
          page.getByRole("main"),
          `${path}${query}`,
        ).not.toContainText(text);
      }
    }
  }

  // Counts cover the League Match alone.
  await page.goto("/matches");
  await expect(page.getByText("1 Match, newest first")).toBeVisible();
  await page.goto("/trends");
  await expect(
    page
      .getByRole("region", { name: "Results" })
      .getByText("1 Match: 1 won, 0 drawn, 0 lost."),
  ).toBeVisible();
  await page.goto("/opponents");
  await expect(
    page
      .getByRole("table", { name: "Head-to-head records" })
      .getByRole("rowheader"),
  ).toHaveText([LEAGUE_OPPONENT.name]);
  await page.goto("/squad");
  await expect(
    page.getByRole("table", { name: "Squad Members" }).getByRole("rowheader"),
  ).toHaveText([new RegExp(REGULAR.name)]);

  // The Friendly's own pages are not found.
  for (const path of [
    `/matches/${FRIENDLY_ID}`,
    `/opponents/${FRIENDLY_OPPONENT.clubId}`,
    `/players/${GUEST.id}`,
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
  }

  // Compare drops a player it cannot show.
  await page.goto(`/compare?players=${REGULAR.id},${GUEST.id}`);
  await expect(page).toHaveURL(new RegExp(`players=${REGULAR.id}(&|$)`));
});
