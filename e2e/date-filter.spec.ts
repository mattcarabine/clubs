// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import {
  addCalendarDays,
  calendarMonthOf,
  londonDateKey,
} from "../app/lib/london-time.ts";
import {
  applyButton,
  choosePreset,
  clickPreset,
  dateTrigger,
  dayButton,
  dayCell,
  openPicker,
  pickRange,
  presetOption,
  showMonth,
} from "./support/date-picker.ts";
import { leaderboardWithGamesPlayed } from "./support/leaderboard.ts";
import { win } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-21 and CLUBS-33: the FilterBar's date filter, one picker with the
// presets (All dates, Last 7 days, Last 30 days, Last 12 months) and a
// calendar for a custom range of London calendar days, inclusive at both ends.

const DAY_MS = 24 * 60 * 60 * 1000;

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so totals are exact whatever today's date.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

function played(page: Page) {
  return page
    .getByRole("region", { name: "Record" })
    .locator("div")
    .filter({ has: page.getByText("Played", { exact: true }) })
    .locator("dd")
    .first();
}

function search(page: Page) {
  return new URL(page.url()).search;
}

function today() {
  return londonDateKey(new Date());
}

test("choosing Last 30 days and applying sets ?range=30d", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(win({ playedAt: new Date(Date.now() - 3 * DAY_MS) }));
  await fakeEa.addMatch(win({ playedAt: new Date(Date.now() - 40 * DAY_MS) }));
  await triggerPoll();

  await page.goto("/test/stats");
  await expect(played(page)).toHaveText("2");
  await expect(dateTrigger(page)).toHaveText("All dates");

  await choosePreset(page, "Last 30 days");
  await expect.poll(() => search(page)).toBe("?range=30d");
  await expect(dateTrigger(page)).toHaveText("Last 30 days");
  await expect(played(page)).toHaveText("1");
});

test("clicking two days sets ?from&to, swapping reversed clicks", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // 20:00 London (BST) on 1, 10 and 17 Oct 2026.
  for (const day of ["01", "10", "17"]) {
    await fakeEa.addMatch(win({ playedAt: new Date(`2026-10-${day}T19:00Z`) }));
  }
  await triggerPoll();

  await page.goto("/test/stats");
  await expect(played(page)).toHaveText("3");

  // The end first, then the start.
  await pickRange(page, "2026-10-12", "2026-10-05");
  await expect.poll(() => search(page)).toBe("?from=2026-10-05&to=2026-10-12");
  await expect(played(page)).toHaveText("1");
  await expect(dateTrigger(page)).toHaveText(/^5 Oct – 12 Oct( 2026)?$/);
});

test("the preset list switches to Custom range once a day is clicked", async ({
  page,
}) => {
  await page.goto("/test/stats?range=7d");
  const dialog = await openPicker(page);
  await expect(presetOption(dialog, "Last 7 days")).toBeChecked();
  await dayButton(dialog, addCalendarDays(today(), -1)).click();
  await expect(presetOption(dialog, "Custom range")).toBeChecked();
  // Half a range cannot be applied.
  await expect(applyButton(dialog)).toBeDisabled();
});

for (const close of ["Cancel", "Escape"] as const) {
  test(`${close} leaves the URL unchanged`, async ({ page }) => {
    await page.goto("/test/stats?range=30d");
    const dialog = await openPicker(page);
    await clickPreset(dialog, "Last 7 days");
    if (close === "Cancel") {
      await dialog.getByRole("button", { name: "Cancel" }).click();
    } else {
      await page.keyboard.press("Escape");
    }
    await expect(dialog).toBeHidden();
    expect(search(page)).toBe("?range=30d");
    await expect(dateTrigger(page)).toHaveText("Last 30 days");
    // Focus goes back to the trigger.
    await expect(dateTrigger(page)).toBeFocused();
  });
}

test("future days can't be selected", async ({ page }) => {
  await page.goto("/test/stats");
  const dialog = await openPicker(page);
  await expect(
    dialog.getByRole("button", { name: "Next month" }),
  ).toBeDisabled();
  await expect(dayButton(dialog, today())).toBeEnabled();
  const tomorrow = addCalendarDays(today(), 1);
  if (calendarMonthOf(tomorrow) === calendarMonthOf(today())) {
    await expect(dayButton(dialog, tomorrow)).toBeDisabled();
  }
});

test("All dates counts every Match and clears the range params", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(win({ playedAt: new Date(Date.now() - 400 * DAY_MS) }));
  await fakeEa.addMatch(win({ playedAt: new Date(Date.now() - 3 * DAY_MS) }));
  await triggerPoll();

  await page.goto("/test/stats?range=1y&sort=x");
  await expect(played(page)).toHaveText("1");
  await expect(dateTrigger(page)).toHaveText("Last 12 months");

  await choosePreset(page, "All dates");
  await expect.poll(() => search(page)).toBe("?sort=x");
  await expect(played(page)).toHaveText("2");
  await expect(dateTrigger(page)).toHaveText("All dates");

  await page.goto("/test/stats?from=2026-10-01&to=2026-10-12");
  await choosePreset(page, "All dates");
  await expect.poll(() => search(page)).toBe("");
});

test("keyboard only: open, move with arrows, pick both ends, Apply", async ({
  page,
}) => {
  await page.goto("/test/stats");
  const dialog = await openPicker(page);
  await page.keyboard.press("Escape");
  await expect(dateTrigger(page)).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  // Tab from the presets to the calendar's one tab stop: today.
  const focusedDay = () =>
    page.evaluate(() => document.activeElement?.getAttribute("data-day"));
  for (let i = 0; i < 6 && (await focusedDay()) !== today(); i++) {
    await page.keyboard.press("Tab");
  }
  expect(await focusedDay()).toBe(today());

  await page.keyboard.press("ArrowUp"); // a week back
  await page.keyboard.press("ArrowLeft"); // and a day
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  const from = addCalendarDays(today(), -8);
  const to = addCalendarDays(today(), -6);
  await expect(dayCell(dialog, from)).toHaveAttribute("aria-selected", "true");

  await applyButton(dialog).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect.poll(() => search(page)).toBe(`?from=${from}&to=${to}`);
});

test("PageUp and PageDown change the month", async ({ page }) => {
  await page.goto("/test/stats?from=2026-03-10&to=2026-03-12");
  const dialog = await openPicker(page);
  await dayButton(dialog, "2026-03-12").focus();
  await page.keyboard.press("PageUp");
  await expect(dayButton(dialog, "2026-02-12")).toBeFocused();
  await page.keyboard.press("PageDown");
  await page.keyboard.press("PageDown");
  await expect(dayButton(dialog, "2026-04-12")).toBeFocused();
});

test("deep links open with their preset or range highlighted", async ({
  page,
}) => {
  await page.goto("/test/stats?range=7d");
  let dialog = await openPicker(page);
  await expect(presetOption(dialog, "Last 7 days")).toBeChecked();
  await expect(dayCell(dialog, today())).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(dayCell(dialog, addCalendarDays(today(), -6))).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Escape");

  await page.goto("/test/stats?from=2026-10-05&to=2026-10-12");
  dialog = await openPicker(page);
  await expect(presetOption(dialog, "Custom range")).toBeChecked();
  await showMonth(dialog, "2026-10");
  for (const [date, selected] of [
    ["2026-10-04", "false"],
    ["2026-10-05", "true"],
    ["2026-10-08", "true"],
    ["2026-10-12", "true"],
    ["2026-10-13", "false"],
  ]) {
    await expect(dayCell(dialog, date)).toHaveAttribute(
      "aria-selected",
      selected,
    );
  }
});

test("days before the first recorded Match are muted but selectable", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(win({ playedAt: new Date(Date.now() - 2 * DAY_MS) }));
  await triggerPoll();

  await page.goto("/test/stats");
  const dialog = await openPicker(page);
  const before = addCalendarDays(today(), -3);
  await showMonth(dialog, calendarMonthOf(before));
  await expect(dayButton(dialog, before)).toHaveClass(/text-ink-muted/);
  await expect(dayButton(dialog, before)).toBeEnabled();
  await expect(dayButton(dialog, today())).not.toHaveClass(/text-ink-muted/);
});

test("the end date includes a Match late that evening in London", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // 23:30 London on 12 Oct is 22:30 UTC in BST.
  await fakeEa.addMatch(win({ playedAt: new Date("2026-10-12T22:30Z") }));
  // 00:30 London on 13 Oct is still 12 Oct in UTC, but outside the range.
  await fakeEa.addMatch(win({ playedAt: new Date("2026-10-12T23:30Z") }));
  await triggerPoll();

  await page.goto("/test/stats?from=2026-10-12&to=2026-10-12");
  await expect(played(page)).toHaveText("1");
  await expect(dateTrigger(page)).toHaveText(/^12 Oct( 2026)?$/);
});

test("Last 7 days is kept relative in the URL", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(win({ playedAt: new Date(Date.now() - 3 * DAY_MS) }));
  await fakeEa.addMatch(win({ playedAt: new Date(Date.now() - 10 * DAY_MS) }));
  await triggerPoll();

  await page.goto("/test/stats");
  await choosePreset(page, "Last 7 days");
  await expect.poll(() => search(page)).toBe("?range=7d");
  await expect(played(page)).toHaveText("1");

  // A shared link carries the preset, not dates.
  await page.reload();
  await expect(played(page)).toHaveText("1");
  await expect(dateTrigger(page)).toHaveText("Last 7 days");
});

for (const query of [
  "from=2026-10-12&to=2026-10-05",
  "from=2026-02-30&to=2026-03-02",
  "from=yesterday&to=today",
  "range=last10",
]) {
  test(`a bad range falls back to All dates: ?${query}`, async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    await fakeEa.addMatch(win({ playedAt: new Date("2026-10-01T19:00Z") }));
    await fakeEa.addMatch(win({ playedAt: new Date("2026-10-10T19:00Z") }));
    await triggerPoll();

    const response = await page.goto(`/test/stats?${query}`);
    expect(response?.status()).toBe(200);
    await expect(played(page)).toHaveText("2");
    await expect(dateTrigger(page)).toHaveText("All dates");
  });
}

test("the custom range combines with the Season filter", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // Season 1: Matches on 1 and 10 Oct.
  await fakeEa.addMatch(win({ playedAt: new Date("2026-10-01T19:00Z") }));
  await fakeEa.addMatch(win({ playedAt: new Date("2026-10-10T19:00Z") }));
  await triggerPoll();
  // EA resets the season totals: Season 2 starts now.
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(2),
  );
  await triggerPoll();
  await fakeEa.addMatch(win({ playedAt: new Date(Date.now() + 60_000) }));
  await triggerPoll();

  // The window is the intersection of the dates and the Season.
  await page.goto("/test/stats?from=2026-10-05&to=2099-12-31&season=1");
  await expect(played(page)).toHaveText("1");
  await page.goto("/test/stats?from=2026-10-05&to=2099-12-31&season=2");
  await expect(played(page)).toHaveText("1");
  await page.goto("/test/stats?from=2026-10-01&to=2026-10-12&season=2");
  await expect(played(page)).toHaveText("0");
});

test("a range across New Year shows both years on the trigger", async ({
  page,
}) => {
  await page.goto("/test/stats?from=2025-12-20&to=2026-01-05");
  await expect(dateTrigger(page)).toHaveText("20 Dec 2025 – 5 Jan 2026");
});

test("phones get one month and a sticky Apply; desktops two months", async ({
  page,
  isMobile,
}) => {
  await page.goto("/test/stats?range=1y");
  const dialog = await openPicker(page);
  await expect(dialog.getByRole("grid")).toHaveCount(isMobile ? 1 : 2);
  await expect(applyButton(dialog)).toBeInViewport();
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fits).toBe(true);
});

const FILTER_PAGES = [
  "/squad",
  "/",
  "/opponents",
  "/analysis",
  "/compare",
  "/test/stats",
];

test("every page with a FilterBar uses the picker, which fits a 375px phone", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(win());
  await triggerPoll();
  await page.setViewportSize({ width: 375, height: 800 });

  // The detail pages too: the first Squad Member's and Opponent's.
  const firstLink = async (from: string, prefix: string) => {
    await page.goto(from);
    const href = await page
      .locator(`main a[href^="${prefix}"]`)
      .first()
      .getAttribute("href");
    expect(href, `a link to ${prefix}`).toBeTruthy();
    return href ?? "";
  };
  const detailPages = [
    await firstLink("/squad", "/players/"),
    await firstLink("/opponents", "/opponents/"),
  ];
  for (const path of [...FILTER_PAGES, ...detailPages]) {
    await page.goto(path);
    const dialog = await openPicker(page);
    await expect(dialog.getByRole("grid"), path).toHaveCount(1);
    await expect(presetOption(dialog, "Last 30 days"), path).toBeAttached();
    await expect(applyButton(dialog), path).toBeInViewport();
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits, path).toBe(true);
    await page.keyboard.press("Escape");
  }
});
