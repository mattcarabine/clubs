// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Locator, Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import { type Lineup, win, withLineup } from "./support/match-builders.ts";
import { membersPayload } from "./support/members.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-20: Compare, two Squad Members side by side.

/** Squad Members that exist only in these specs. */
const ALPHA = { id: "900000021", name: "Alpha Mid" };
const BRAVO = { id: "900000022", name: "Bravo Striker" };
const CHARLIE = { id: "900000023", name: "Charlie Spare" };
/** Marked former by the test env's TEST_ROSTER (wrangler.jsonc). */
const FORMER = { id: "900000099", name: "Zed Former" };

type FakeEa = { addMatch(body: AddMatchBody): Promise<void> };

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so every total is exact.
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

/** Records one Match per line-up, oldest first, then Polls. */
async function recordMatches(
  fakeEa: FakeEa,
  triggerPoll: () => Promise<void>,
  lineups: Lineup[],
  build: (playedAt: Date) => AddMatchBody = (playedAt) => win({ playedAt }),
) {
  for (const [i, lineup] of lineups.entries()) {
    const playedAt = new Date(Date.now() - (lineups.length - i) * 60_000);
    await fakeEa.addMatch(withLineup(build(playedAt), lineup));
  }
  await triggerPoll();
}

function headline(page: Page) {
  return page.getByRole("table", { name: "Headline stats" });
}

/** One stat's row on a tale-of-the-tape table. */
function tapeRow(table: Locator, label: string) {
  return table.locator("tbody tr").filter({
    has: table.page().getByRole("rowheader", { name: label, exact: true }),
  });
}

/** A's (0) or B's (1) cell of a stat. */
function tapeCell(table: Locator, label: string, side: 0 | 1) {
  return tapeRow(table, label).getByRole("cell").nth(side);
}

/** A's and B's figures for a stat. */
async function expectFigures(
  table: Locator,
  label: string,
  [a, b]: [string, string],
) {
  await expect(
    tapeCell(table, label, 0).locator("[data-figure]"),
    `${label} A`,
  ).toHaveText(a);
  await expect(
    tapeCell(table, label, 1).locator("[data-figure]"),
    `${label} B`,
  ).toHaveText(b);
}

/** A side's plate, the button that opens its Squad picker. */
function plate(page: Page, side: "First" | "Second") {
  return page.getByRole("button", { name: `${side} Squad Member:` });
}

function picker(page: Page, side: "first" | "second") {
  return page.getByRole("dialog", { name: `Choose the ${side} Squad Member` });
}

/** Opens a side's picker, retrying a click that lands before hydration. */
async function openPicker(page: Page, side: "First" | "Second") {
  const dialog = picker(page, side === "First" ? "first" : "second");
  await expect(async () => {
    await plate(page, side).click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  return dialog;
}

function filters(page: Page) {
  return page.getByRole("region", { name: "Stats filters" });
}

/** Clicks a control and waits for the URL to change, retrying a click that lands before hydration. */
async function clickUntil(
  page: Page,
  control: Locator,
  param: string,
  expected: string | null,
) {
  await expect(async () => {
    await control.click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get(param), {
        timeout: 1000,
      })
      .toBe(expected);
  }).toPass();
}

test("both columns show each Squad Member's totals, with each row's leader picked out", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // Alpha plays all three with a goal each; Bravo plays two with 3 each.
  await recordMatches(fakeEa, triggerPoll, [
    [
      { player: ALPHA, goals: 1 },
      { player: BRAVO, goals: 3 },
    ],
    [
      { player: ALPHA, goals: 1 },
      { player: BRAVO, goals: 3 },
    ],
    [{ player: ALPHA, goals: 1 }],
  ]);

  await page.goto(`/compare?players=${ALPHA.id},${BRAVO.id}`);
  await expect(page.locator("h1")).toHaveText("Compare");
  const table = headline(page);
  await expect(table.getByRole("columnheader").first()).toHaveText(ALPHA.name);
  await expect(table.getByRole("columnheader").last()).toHaveText(BRAVO.name);

  await expectFigures(table, "Appearances", ["3", "2"]);
  await expectFigures(table, "Goals", ["3", "6"]);
  await expect(tapeCell(table, "Appearances", 0)).toHaveAttribute(
    "data-leader",
    "true",
  );
  await expect(tapeCell(table, "Appearances", 1)).not.toHaveAttribute(
    "data-leader",
  );
  await expect(tapeCell(table, "Goals", 1)).toHaveAttribute(
    "data-leader",
    "true",
  );
  await expect(tapeCell(table, "Goals", 1)).toContainText("(leads)");
  await expect(tapeCell(table, "Goals", 0)).not.toHaveAttribute("data-leader");

  // Bravo's two Appearances are a small sample.
  await expect(tapeCell(table, "Goals", 1)).toContainText("small sample");
  await expect(tapeCell(table, "Goals", 0)).not.toContainText("small sample");
  await expect(
    page.getByText("Fewer than 3 Matches: a small sample.").first(),
  ).toBeVisible();

  // Both rating runs on one chart: two Squad Members, each with an average.
  const chart = page.getByRole("table", { name: "Match rating" });
  await expect(chart.locator("thead th")).toHaveText([
    "Point",
    `${ALPHA.name} rating`,
    `${ALPHA.name} 5-Match avg`,
    `${BRAVO.name} rating`,
    `${BRAVO.name} 5-Match avg`,
  ]);
  await expect(chart.locator("tbody tr")).toHaveCount(3);

  // Each Squad Member's team record over their own Matches.
  const record = page.getByRole("table", { name: "Team record" });
  await expectFigures(record, "Played", ["3", "2"]);
  await expectFigures(record, "Won", ["3", "2"]);
});

test('"Played together" counts only the Shared Matches', async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // Bravo shares 3 of Alpha's 5 Matches, and plays one without Alpha.
  await recordMatches(fakeEa, triggerPoll, [
    [{ player: ALPHA }],
    [{ player: ALPHA }, { player: BRAVO }],
    [{ player: ALPHA }, { player: BRAVO }],
    [{ player: ALPHA }, { player: BRAVO }],
    [{ player: ALPHA }],
    [{ player: BRAVO }],
  ]);

  await page.goto(`/compare?players=${ALPHA.id},${BRAVO.id}`);
  const table = headline(page);
  await expectFigures(table, "Appearances", ["5", "4"]);

  const scope = page.getByRole("group", { name: "Matches" });
  await clickUntil(
    page,
    scope.getByRole("button", { name: "Played together" }),
    "scope",
    "together",
  );
  await expectFigures(table, "Appearances", ["3", "3"]);
  await expect(
    scope.getByRole("button", { name: "Played together" }),
  ).toHaveAttribute("aria-pressed", "true");

  // One shared record, over exactly those 3 Matches.
  const record = page.getByRole("region", { name: "Team record" });
  await expect(page.getByRole("table", { name: "Team record" })).toHaveCount(0);
  await expect(
    record.getByRole("term").getByText("Played", { exact: true }),
  ).toBeVisible();
  await expect(
    record
      .locator("div")
      .filter({ has: page.getByText("Played", { exact: true }) })
      .locator("dd")
      .first(),
  ).toHaveText("3");
  await expect(
    page.getByRole("table", { name: "Match rating" }).locator("tbody tr"),
  ).toHaveCount(3);

  await clickUntil(
    page,
    scope.getByRole("button", { name: "All matches" }),
    "scope",
    null,
  );
  await expectFigures(table, "Appearances", ["5", "4"]);
});

test("on EA totals the headline stats come from EA, and the chart and scope toggle are hidden", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const KABEEBLE = "256171605";
  const TINBS = "380993182";
  await fakeEa.setPayload(
    "members/stats",
    membersPayload("members/stats", { tinbs_irl: { goals: "140" } }),
  );
  await fakeEa.addMatch(win());
  await triggerPoll();

  await page.goto(`/compare?players=${KABEEBLE},${TINBS}&source=ea`);
  const table = headline(page);
  await expect(tapeCell(table, "Games", 0).locator("[data-figure]")).toHaveText(
    "112",
  );
  await expect(tapeCell(table, "Goals", 1).locator("[data-figure]")).toHaveText(
    "140",
  );
  await expect(tapeRow(table, "Form")).toHaveCount(0);

  await expect(page.getByRole("group", { name: "Matches" })).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Match rating" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("region", { name: "Team record" })).toHaveCount(
    0,
  );
  await expect(page.getByText("EA gives no per-Match data")).toBeVisible();

  // Each side's Position Group picker stays, disabled with the reason.
  const picker = page.getByRole("group", { name: /: Position Group$/ });
  await expect(picker).toHaveCount(2);
  await expect(
    picker.first().getByRole("button", { name: "Forward" }),
  ).toBeDisabled();
  await expect(picker.first()).toHaveAttribute(
    "title",
    "EA's totals can't be split by Position Group",
  );
});

test("ticking two Squad Members on the Squad table opens Compare for them", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordMatches(fakeEa, triggerPoll, [
    [{ player: ALPHA }, { player: BRAVO }, { player: CHARLIE }],
  ]);

  await page.goto("/squad");
  const tick = (name: string) =>
    page.getByRole("checkbox", { name: `Compare ${name}` });
  const compare = page.getByRole("button", { name: "Compare", exact: true });
  await expect(compare).toBeDisabled();

  await expect(async () => {
    await tick(ALPHA.name).check();
    await expect(tick(ALPHA.name)).toBeChecked({ timeout: 1000 });
    // The page stays put: the tick is not a click on the row's link.
    expect(new URL(page.url()).pathname).toBe("/squad");
  }).toPass();
  await expect(page.getByText(`${ALPHA.name} vs …`)).toBeVisible();
  await tick(BRAVO.name).check();
  await expect(tick(CHARLIE.name)).toBeDisabled();

  await page.getByRole("link", { name: "Compare", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/compare\\?players=${ALPHA.id},${BRAVO.id}$`),
  );
  await expectFigures(headline(page), "Appearances", ["1", "1"]);
});

test('"Compare to…" on a profile opens Compare with a picker for the second Squad Member', async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordMatches(fakeEa, triggerPoll, [
    [{ player: ALPHA }, { player: BRAVO }],
  ]);

  await page.goto(`/players/${ALPHA.id}`);
  await page.getByRole("link", { name: "Compare to…" }).click();
  await expect(page).toHaveURL(new RegExp(`/compare\\?players=${ALPHA.id}$`));

  await expect(plate(page, "First")).toHaveAccessibleName(
    `First Squad Member: ${ALPHA.name}`,
  );
  await expect(plate(page, "Second")).toHaveAccessibleName(
    "Second Squad Member: none picked",
  );
  await expect(plate(page, "Second")).toContainText("Compare to…");
  await expectFigures(headline(page), "Appearances", ["1", "–"]);

  // Picking the second Squad Member completes the Comparison.
  const dialog = await openPicker(page, "Second");
  await dialog.getByRole("button", { name: BRAVO.name }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("players"))
    .toBe(`${ALPHA.id},${BRAVO.id}`);
  await expect(plate(page, "Second")).toHaveAccessibleName(
    `Second Squad Member: ${BRAVO.name}`,
  );
  await expectFigures(headline(page), "Appearances", ["1", "1"]);
});

test("a repeated or unknown ID shows the first Squad Member and a picker, not an error", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordMatches(fakeEa, triggerPoll, [[{ player: ALPHA }]]);

  for (const players of [
    `${ALPHA.id},${ALPHA.id}`,
    `${ALPHA.id},999999999`,
    `999999999,${ALPHA.id}`,
  ]) {
    await page.goto(`/compare?players=${players}`);
    await expect(page.locator("h1")).toHaveText("Compare");
    await expect(plate(page, "First")).toHaveAccessibleName(
      `First Squad Member: ${ALPHA.name}`,
    );
    await expect(plate(page, "Second")).toHaveAccessibleName(
      "Second Squad Member: none picked",
    );
    await expectFigures(headline(page), "Appearances", ["1", "–"]);
    // The URL drops the ID that could not be shown.
    expect(new URL(page.url()).searchParams.get("players")).toBe(ALPHA.id);
  }
});

test("an unknown first ID moves the second Squad Member to A with their Position Groups", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordMatches(fakeEa, triggerPoll, [
    [{ player: BRAVO, pos: "forward" }],
    [{ player: BRAVO, pos: "midfielder" }],
  ]);

  await page.goto(`/compare?players=999999999,${BRAVO.id}&posB=forward`);
  await expect(plate(page, "First")).toHaveAccessibleName(
    `First Squad Member: ${BRAVO.name}`,
  );
  await expectFigures(headline(page), "Appearances", ["1", "–"]);
  await expect(
    page
      .getByRole("group", { name: `${BRAVO.name}: Position Group` })
      .getByRole("button", { name: "Forward" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("a plate's picker lists the whole Squad, marks the current pick and keeps out the other side's", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordMatches(fakeEa, triggerPoll, [
    [{ player: ALPHA }, { player: BRAVO }, { player: FORMER }],
  ]);

  await page.goto(`/compare?players=${ALPHA.id},${BRAVO.id}`);
  const dialog = await openPicker(page, "First");
  await expect(dialog.getByRole("button")).toHaveText([
    /Alpha Mid.*Showing/,
    /Bravo Striker.*Already picked/,
    /Zed Former.*Former/,
  ]);
  const current = dialog.getByRole("button", { name: ALPHA.name });
  await expect(current).toHaveAttribute("aria-current", "true");
  await expect(current).toBeFocused();
  await expect(dialog.getByRole("button", { name: BRAVO.name })).toBeDisabled();

  // Esc changes nothing and returns focus to the plate.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(plate(page, "First")).toBeFocused();
  expect(new URL(page.url()).searchParams.get("players")).toBe(
    `${ALPHA.id},${BRAVO.id}`,
  );

  // Picking the Former Squad Member swaps A.
  await (await openPicker(page, "First"))
    .getByRole("button", { name: FORMER.name })
    .click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("players"))
    .toBe(`${FORMER.id},${BRAVO.id}`);
  await expect(headline(page).getByRole("columnheader").first()).toHaveText(
    FORMER.name,
  );
});

test("the second plate waits for the first Squad Member", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordMatches(fakeEa, triggerPoll, [[{ player: ALPHA }]]);
  await page.goto("/compare");
  await expect(plate(page, "First")).toHaveAccessibleName(
    "First Squad Member: none picked",
  );
  await expect(plate(page, "Second")).toBeDisabled();
});

test("changing the FilterBar changes both columns", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const both: Lineup = [{ player: ALPHA }, { player: BRAVO }];
  await recordMatches(fakeEa, triggerPoll, [both]);
  await recordMatches(fakeEa, triggerPoll, [both, both], (playedAt) =>
    win({ playedAt, matchType: "playoffMatch" }),
  );

  await page.goto(`/compare?players=${ALPHA.id},${BRAVO.id}`);
  const table = headline(page);
  await expectFigures(table, "Appearances", ["3", "3"]);

  await clickUntil(
    page,
    filters(page)
      .getByRole("group", { name: "Match Type" })
      .getByRole("button", { name: "Playoff" }),
    "types",
    "league",
  );
  await expectFigures(table, "Appearances", ["1", "1"]);
});

test("each side counts its own Position Groups", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // Alpha: 3 as Midfielder, 2 as Forward. Bravo: 4 as Forward.
  await recordMatches(fakeEa, triggerPoll, [
    [
      { player: ALPHA, pos: "midfielder" },
      { player: BRAVO, pos: "forward" },
    ],
    [
      { player: ALPHA, pos: "midfielder" },
      { player: BRAVO, pos: "forward" },
    ],
    [
      { player: ALPHA, pos: "midfielder" },
      { player: BRAVO, pos: "forward" },
    ],
    [
      { player: ALPHA, pos: "forward" },
      { player: BRAVO, pos: "forward" },
    ],
    [{ player: ALPHA, pos: "forward" }],
  ]);

  await page.goto(`/compare?players=${ALPHA.id},${BRAVO.id}`);
  const table = headline(page);
  await expectFigures(table, "Appearances", ["5", "4"]);

  const chip = (who: string, name: string) =>
    page
      .getByRole("group", { name: `${who}: Position Group` })
      .getByRole("button", { name, exact: true });
  await expect(chip(ALPHA.name, "All Positions")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await clickUntil(page, chip(ALPHA.name, "Midfielder"), "posA", "midfielder");
  await clickUntil(page, chip(BRAVO.name, "Forward"), "posB", "forward");
  await expectFigures(table, "Appearances", ["3", "4"]);

  await clickUntil(page, chip(ALPHA.name, "All Positions"), "posA", null);
  await clickUntil(page, chip(BRAVO.name, "All Positions"), "posB", null);
  await expectFigures(table, "Appearances", ["5", "4"]);
});

test("Compare fits a 375px phone", async ({ page, fakeEa, triggerPoll }) => {
  await recordMatches(fakeEa, triggerPoll, [
    [{ player: ALPHA }, { player: BRAVO }],
    [{ player: ALPHA }, { player: BRAVO }],
    [{ player: ALPHA }],
  ]);
  await page.setViewportSize({ width: 375, height: 800 });

  for (const query of [
    `players=${ALPHA.id},${BRAVO.id}`,
    `players=${ALPHA.id},${BRAVO.id}&scope=together&posA=midfielder`,
    `players=${ALPHA.id},${BRAVO.id}&source=ea`,
    `players=${ALPHA.id}`,
    "",
  ]) {
    await page.goto(`/compare?${query}`);
    await expect(page.locator("h1")).toHaveText("Compare");
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits, query).toBe(true);
  }

  // The picker is a bottom sheet across the phone.
  await page.goto(`/compare?players=${ALPHA.id},${BRAVO.id}`);
  const dialog = await openPicker(page, "Second");
  const box = await dialog.boundingBox();
  expect(box?.width).toBe(375);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(800, 0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
