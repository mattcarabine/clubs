// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import { draw, loss, win } from "./support/match-builders.ts";
import { type RatedMatch, recordRated } from "./support/ratings.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-30: Win Chance from the Skill Rating gap, on the Match and Analysis pages.

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so every count is exact.
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

function section(page: Page) {
  return page.getByRole("region", { name: "Win chance", exact: true });
}

function matchNote(page: Page) {
  return page.getByRole("complementary", { name: "Win chance" });
}

/** The Win Chance a Match page shows, as a number. */
async function matchChance(page: Page, matchId: string): Promise<number> {
  await page.goto(`/matches/${matchId}`);
  const text = await matchNote(page)
    .getByText(/Win chance before kick-off/)
    .textContent();
  const percent = text?.match(/(\d+)%/)?.[1];
  expect(percent, text ?? "").toBeDefined();
  return Number(percent);
}

test("under 20 rated Matches the Elo estimate is used and labelled, with Wins against expected and unrated Matches counted out", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordRated(fakeEa, triggerPoll, [
    // Elo: 50%, 50%, 91% and 9%, so 2.0 Wins expected.
    { gap: 0, build: win({ matchId: "30001" }) },
    { gap: 0, build: loss() },
    { gap: 400, build: win() },
    { gap: -400, build: draw() },
    { gap: 0, build: win({ matchType: "playoffMatch" }) },
    { gap: null, build: win({ matchId: "30009" }) },
  ]);

  await page.goto("/analysis?types=league");
  await expect(
    section(page).getByText("Estimate", { exact: true }),
  ).toBeVisible();
  await expect(
    section(page).getByText(
      "The Elo-style curve until there are 20 rated Matches (5 so far).",
    ),
  ).toBeVisible();
  await expect(
    section(page).getByText("1 Match without Skill Ratings is left out."),
  ).toBeVisible();
  await expect(
    section(page).getByRole("region", { name: "Wins against expected" }),
  ).toContainText("2 Wins vs 2.0 expected");
  await expect(
    section(page)
      .getByRole("list", { name: "Calibration" })
      .getByRole("listitem"),
  ).toHaveText([
    "Matches we were given 0–10%: won 0 of 1",
    "Matches we were given 50–60%: won 1 of 2",
    "Matches we were given 90–100%: won 1 of 1",
  ]);

  // The FilterBar decides which Matches count: the Playoff Win at 50% too.
  await page.goto("/analysis");
  await expect(
    section(page).getByRole("region", { name: "Wins against expected" }),
  ).toContainText("3 Wins vs 2.5 expected");

  await page.goto("/matches/30001");
  await expect(matchNote(page)).toContainText(
    "Win chance before kick-off: 50%",
  );
  await expect(
    matchNote(page).getByText("Estimate", { exact: true }),
  ).toBeVisible();

  await page.goto("/matches/30009");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(matchNote(page)).toHaveCount(0);
});

test("an upset Win and a should-have-won loss are flagged on their Match pages", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordRated(fakeEa, triggerPoll, [
    { gap: -300, build: win({ matchId: "30101" }) },
    { gap: 300, build: loss({ matchId: "30102" }) },
    { gap: 300, build: win({ matchId: "30103" }) },
  ]);

  await page.goto("/matches/30101");
  await expect(matchNote(page)).toContainText(
    "Win chance before kick-off: 15%",
  );
  await expect(matchNote(page)).toContainText("Upset Win");
  await expect(matchNote(page)).toContainText(
    "A Win from a Win Chance under 35%.",
  );

  await page.goto("/matches/30102");
  await expect(matchNote(page)).toContainText(
    "Win chance before kick-off: 85%",
  );
  await expect(matchNote(page)).toContainText("Should have won");
  await expect(matchNote(page)).toContainText(
    "Dropped Points from a Win Chance over 65%.",
  );

  await page.goto("/matches/30103");
  await expect(matchNote(page)).toContainText(
    "Win chance before kick-off: 85%",
  );
  await expect(matchNote(page)).not.toContainText("Upset Win");
  await expect(matchNote(page)).not.toContainText("Should have won");
});

test("the Match page bills us Favourites, a Toss-up or Underdogs, in words and colour", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // Elo: 85%, 50% and 15%.
  await recordRated(fakeEa, triggerPoll, [
    { gap: 300, build: win({ matchId: "30151" }) },
    { gap: 0, build: draw({ matchId: "30152" }) },
    { gap: -300, build: loss({ matchId: "30153" }) },
  ]);

  const cases = [
    { id: "30151", chance: "85%", label: "Favourites", colour: "--color-win" },
    { id: "30152", chance: "50%", label: "Toss-up", colour: "--color-draw" },
    { id: "30153", chance: "15%", label: "Underdogs", colour: "--color-loss" },
  ];
  for (const { id, chance, label, colour } of cases) {
    await page.goto(`/matches/${id}`);
    const note = matchNote(page);
    await expect(note.getByText(label, { exact: true })).toBeVisible();
    for (const other of cases.filter((c) => c.label !== label)) {
      await expect(note.getByText(other.label, { exact: true })).toHaveCount(0);
    }
    const figure = note.getByText(chance, { exact: true });
    const [figureColour, expected] = await figure.evaluate((el, token) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${token})`;
      document.body.append(probe);
      const want = getComputedStyle(probe).color;
      probe.remove();
      return [getComputedStyle(el).color, want];
    }, colour);
    expect(figureColour, label).toBe(expected);
  }
});

test("20 or more rated Matches fit a curve where a bigger gap gives a bigger chance", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  /** `count` Matches at a gap, the first `wins` of them Wins. */
  const at = (gap: number, count: number, wins: number, id?: string) =>
    Array.from(
      { length: count },
      (_, i): RatedMatch => ({
        gap,
        build:
          i < wins ? win({ matchId: i === 0 && id ? id : undefined }) : loss(),
      }),
    );
  await recordRated(fakeEa, triggerPoll, [
    ...at(-300, 6, 1, "30201"),
    ...at(-100, 6, 2),
    ...at(100, 6, 4),
    ...at(300, 6, 5, "30202"),
  ]);

  await page.goto("/analysis");
  await expect(
    section(page).getByText("Fitted to all 24 rated Competitive Matches."),
  ).toBeVisible();
  await expect(
    section(page).getByText("Estimate", { exact: true }),
  ).toHaveCount(0);
  await expect(
    section(page).getByRole("img", { name: "Win chance by Skill Rating gap" }),
  ).toBeVisible();

  const low = await matchChance(page, "30201");
  await expect(
    matchNote(page).getByText("Estimate", { exact: true }),
  ).toHaveCount(0);
  const high = await matchChance(page, "30202");
  expect(high).toBeGreaterThan(low);
});

test("the Win chance section and Match note fit the screen without horizontal page scroll", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordRated(fakeEa, triggerPoll, [
    { gap: -300, build: win({ matchId: "30301" }) },
    { gap: 120, build: loss() },
    { gap: 40, build: draw() },
  ]);

  for (const path of ["/analysis", "/matches/30301"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits, path).toBe(true);
  }
});
