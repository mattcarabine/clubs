import type { Page } from "@playwright/test";

import { win } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-65: hide, show and reorder the Squad table's columns, remembered in
// the browser.

/** The Recorded table's default header row. */
const DEFAULT_HEADERS = [
  "Squad Member",
  "G+A",
  "Rating",
  "Form",
  "Apps",
  "Vs team",
  "G",
  "A",
  "Mins",
  "G/90",
  "A/90",
  "G+A/90",
  "Shots",
  "Pass %",
  "Tkl %",
  "MOTM",
  "CS",
  "Saves",
  "Red",
  "Red/90",
  "Recent",
];

test.beforeEach(async ({ fakeEa, triggerPoll }) => {
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
  // The fixture line-up, which EA's member totals cover too.
  await fakeEa.addMatch(win());
  await triggerPoll();
});

function squadTable(page: Page) {
  return page.getByRole("table", { name: "Squad Members" });
}

async function headers(page: Page): Promise<string[]> {
  const texts = await squadTable(page)
    .getByRole("columnheader")
    .allTextContents();
  return texts.map((t) => t.trim());
}

function header(page: Page, name: string) {
  return squadTable(page).getByRole("columnheader", { name, exact: true });
}

function columnsChip(page: Page) {
  return page.getByRole("button", { name: /^Columns/ });
}

function picker(page: Page) {
  return page.getByRole("dialog", { name: "Choose columns" });
}

/** Opens the Columns picker, retrying a click that lands before hydration. */
async function openPicker(page: Page) {
  await expect(async () => {
    await columnsChip(page).click();
    await expect(picker(page)).toBeVisible({ timeout: 1000 });
  }).toPass();
  return picker(page);
}

/** Right-clicks a header, retrying until the hydrated menu opens. */
async function openHeaderMenu(page: Page, name: string) {
  const menu = page.getByRole("menu", { name: /column$/ });
  await expect(async () => {
    await header(page, name).click({ button: "right" });
    await expect(menu).toBeVisible({ timeout: 1000 });
  }).toPass();
  return menu;
}

test("hiding a column from its header menu lasts across a reload", async ({
  page,
}) => {
  await page.goto("/squad");
  await expect.poll(() => headers(page)).toEqual(DEFAULT_HEADERS);

  const menu = await openHeaderMenu(page, "Shots");
  await expect(menu).toHaveAccessibleName("Shots column");
  await menu.getByRole("menuitem", { name: "Hide column" }).click();

  await expect(header(page, "Shots")).toHaveCount(0);
  await expect(columnsChip(page)).toHaveText(/Columns · 1 hidden/);
  // The header focus came from is gone, so focus lands on the table itself
  // rather than back at the top of the page.
  await expect(
    page.getByRole("region", { name: "Squad Members" }),
  ).toBeFocused();

  await page.reload();
  await expect(columnsChip(page)).toHaveText(/Columns · 1 hidden/);
  await expect(header(page, "Shots")).toHaveCount(0);
  await expect
    .poll(() => headers(page))
    .toEqual(DEFAULT_HEADERS.filter((h) => h !== "Shots"));
});

test("the header menu moves a column past its neighbour", async ({ page }) => {
  await page.goto("/squad");
  const menu = await openHeaderMenu(page, "Rating");
  await menu.getByRole("menuitem", { name: "Move left" }).click();
  await expect
    .poll(async () => (await headers(page)).slice(0, 3))
    .toEqual(["Squad Member", "Rating", "G+A"]);

  // Rating now leads the movable columns, so it can't go further left.
  const again = await openHeaderMenu(page, "Rating");
  await expect(
    again.getByRole("menuitem", { name: "Move left" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(again).toBeHidden();
});

test("right-clicking another header moves the menu to it", async ({ page }) => {
  await page.goto("/squad");
  await openHeaderMenu(page, "Rating");
  await header(page, "Shots").click({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(1);
  await expect(page.getByRole("menu")).toHaveAccessibleName("Shots column");
});

test("a hidden column comes back in its old place from the Columns picker", async ({
  page,
}) => {
  await page.goto("/squad");
  const menu = await openHeaderMenu(page, "Shots");
  await menu.getByRole("menuitem", { name: "Hide column" }).click();
  await expect(header(page, "Shots")).toHaveCount(0);

  const dialog = await openPicker(page);
  const shots = dialog.getByRole("checkbox", { name: "Show Shots" });
  await expect(shots).not.toBeChecked();
  await shots.check();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();

  await expect.poll(() => headers(page)).toEqual(DEFAULT_HEADERS);
  await expect(columnsChip(page)).toHaveText(/^Columns$/);
});

test("moving a column up in the picker reorders the table and lasts", async ({
  page,
}) => {
  await page.goto("/squad");
  const dialog = await openPicker(page);
  const up = dialog.getByRole("button", { name: "Move Average rating up" });
  await up.click();
  // Focus stays on the moved column's control, now at the top.
  await expect(up).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Move Average rating down" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");

  const moved = ["Squad Member", "Rating", "G+A", "Form"];
  await expect
    .poll(async () => (await headers(page)).slice(0, 4))
    .toEqual(moved);
  await page.reload();
  await expect
    .poll(async () => (await headers(page)).slice(0, 4))
    .toEqual(moved);
});

test("Reset columns restores the default columns and order", async ({
  page,
}) => {
  await page.goto("/squad");
  let dialog = await openPicker(page);
  await expect(
    dialog.getByRole("button", { name: "Reset columns" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Move Appearances up" }).click();
  await dialog.getByRole("checkbox", { name: "Show Minutes played" }).uncheck();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(columnsChip(page)).toHaveText(/1 hidden/);

  dialog = await openPicker(page);
  await dialog.getByRole("button", { name: "Reset columns" }).click();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect.poll(() => headers(page)).toEqual(DEFAULT_HEADERS);

  // Nothing is left stored, so a reload is the default too.
  await page.reload();
  await expect.poll(() => headers(page)).toEqual(DEFAULT_HEADERS);
});

test("EA totals keep their own column layout", async ({ page }) => {
  await page.goto("/squad");
  const menu = await openHeaderMenu(page, "Rating");
  await menu.getByRole("menuitem", { name: "Hide column" }).click();
  await expect(header(page, "Rating")).toHaveCount(0);

  await page.goto("/squad?source=ea");
  await expect(header(page, "GP")).toBeVisible();
  await expect(header(page, "Rating")).toBeVisible();
  await expect(columnsChip(page)).toHaveText(/^Columns$/);
});

test.describe("on desktop", () => {
  test.skip(({ isMobile }) => isMobile, "Dragging headers is for mice");

  test("dragging a header onto another moves the column there", async ({
    page,
  }) => {
    await page.goto("/squad");
    // Wait for hydration once: a second drag would move Apps back past G+A.
    await openPicker(page);
    await page.keyboard.press("Escape");
    await expect(picker(page)).toBeHidden();

    await header(page, "Apps").dragTo(header(page, "G+A"));
    await expect
      .poll(async () => (await headers(page)).slice(0, 3))
      .toEqual(["Squad Member", "Apps", "G+A"]);
    // The drop did not also sort by the dragged column.
    await expect(header(page, "Apps")).not.toHaveAttribute(
      "aria-sort",
      "ascending",
    );

    await page.reload();
    await expect
      .poll(async () => (await headers(page)).slice(0, 3))
      .toEqual(["Squad Member", "Apps", "G+A"]);
  });
});

test.describe("on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "Phones only");

  test("the Columns picker works by tap without widening the page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/squad");
    await expect(async () => {
      await columnsChip(page).tap();
      await expect(picker(page)).toBeVisible({ timeout: 1000 });
    }).toPass();
    await picker(page).getByRole("checkbox", { name: "Show Form" }).tap();
    await picker(page).getByRole("button", { name: "Done" }).tap();

    await expect(header(page, "Form")).toHaveCount(0);
    const pageFits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(pageFits).toBe(true);
  });
});
