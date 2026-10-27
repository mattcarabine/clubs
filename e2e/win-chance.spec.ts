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
  // CLUBS-73: no Calibration list, since Results by rating gap shows the same.
  await expect(section(page).getByText("Calibration")).toHaveCount(0);

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

// CLUBS-69: the chart groups Matches by rating gap, each band's Wins, draws
// and defeats in the outcome colours against the Win % expected.
test("Results by rating gap shows each band's Wins, draws and defeats against the Wins expected, following the FilterBar", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordRated(fakeEa, triggerPoll, [
    // Elo: −450 → 7%, −150 → 30%, 0 → 50%, 50 → 57%, 120 → 67%, 150 → 70%.
    { gap: -450, build: loss() },
    { gap: -150, build: win() },
    { gap: -150, build: draw() },
    { gap: 0, build: win() },
    { gap: 50, build: draw() },
    { gap: 120, build: win() },
    { gap: 150, build: win({ matchType: "playoffMatch" }) },
  ]);

  await page.goto("/analysis");
  const chart = section(page)
    .getByRole("figure")
    .filter({ hasText: "Results by rating gap" });
  await expect(chart).toContainText("Results by rating gap");
  for (const key of ["Win", "Draw", "Loss", "Expected Win %"]) {
    await expect(chart.getByText(key, { exact: true })).toBeVisible();
  }
  const rows = chart
    .getByRole("table", { name: "Results by Skill Rating gap" })
    .getByRole("row");
  // Rating gap, played, won, drawn, lost, Wins expected; biggest underdog first.
  await expect(rows).toHaveText([
    "Rating gapPlayedWonDrawnLostWins expected",
    "Under −30010010.1",
    "−200 to −10021100.6",
    "0 to +10021101.1",
    "+100 to +20022001.4",
  ]);
  await expect(
    chart.getByText("1 won, 1 drawn · 0.6 Wins expected"),
  ).toBeVisible();
  await expect(chart.getByText("2 won · 1.4 Wins expected")).toBeVisible();
  // The outcome colours paint each band's bar, the Win share labelled where it fits.
  await expect(chart.getByText("2W", { exact: true })).toHaveClass(/bg-win/);

  // CLUBS-73: the Wins against expected call-out leads, as wide as the chart.
  const callout = await section(page)
    .getByRole("region", { name: "Wins against expected" })
    .boundingBox();
  const chartBox = await chart.boundingBox();
  expect(callout && chartBox && callout.y < chartBox.y).toBe(true);
  expect(callout?.width).toBeCloseTo(chartBox?.width ?? 0, 0);

  // The FilterBar decides which Matches count: no Playoff Win at +150.
  await page.goto("/analysis?types=league");
  await expect(
    section(page)
      .getByRole("table", { name: "Results by Skill Rating gap" })
      .getByRole("row")
      .last(),
  ).toHaveText("+100 to +20011000.7");
});

test("Upsets either way are flagged in the score strip and the note, big ones with a banner", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // Elo: 30%, 15%, 70%, 85% and 85%.
  await recordRated(fakeEa, triggerPoll, [
    { gap: -150, build: win({ matchId: "30101" }) },
    { gap: -300, build: win({ matchId: "30102" }) },
    { gap: 150, build: draw({ matchId: "30103" }) },
    { gap: 300, build: loss({ matchId: "30104" }) },
    { gap: 300, build: win({ matchId: "30105" }) },
  ]);

  const cases = [
    {
      id: "30101",
      chance: "30%",
      label: "Upset Win",
      reason: "A Win from a Win Chance under 35%.",
      big: false,
    },
    {
      id: "30102",
      chance: "15%",
      label: "Big upset Win",
      reason: "A Win from a Win Chance under 20%.",
      big: true,
    },
    {
      id: "30103",
      chance: "70%",
      label: "Should have won",
      reason: "Dropped Points from a Win Chance over 65%.",
      big: false,
    },
    {
      id: "30104",
      chance: "85%",
      label: "Should really have won",
      reason: "Dropped Points from a Win Chance over 80%.",
      big: true,
    },
  ];
  for (const { id, chance, label, reason, big } of cases) {
    await page.goto(`/matches/${id}`);
    await expect(
      page.getByRole("list", { name: "Match details" }),
    ).toContainText(label);
    await expect(
      page.getByRole("list", { name: "Match details" }),
    ).not.toContainText("Full time");
    const note = matchNote(page);
    await expect(note).toContainText(`Win chance before kick-off: ${chance}`);
    await expect(note.getByText(label, { exact: true })).toHaveCount(1);
    await expect(note).toContainText(reason);
    // A big Upset's label is the banner, a full-width strip across the note.
    const labelBox = await note.getByText(label, { exact: true }).boundingBox();
    const noteBox = await note.boundingBox();
    expect(labelBox && noteBox && labelBox.width === noteBox.width, id).toBe(
      big,
    );
  }

  await page.goto("/matches/30105");
  await expect(page.getByRole("list", { name: "Match details" })).toContainText(
    "Full time",
  );
  await expect(matchNote(page)).not.toContainText("Upset");
  await expect(matchNote(page)).not.toContainText("Should");
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
    section(page).getByRole("table", { name: "Results by Skill Rating gap" }),
  ).toHaveCount(1);

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
