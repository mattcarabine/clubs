/**
 * Drives the FilterBar's date-range picker (CLUBS-33): the "Dates" trigger
 * chip and its "Choose dates" popover of presets and month grids.
 *
 *   await choosePreset(page, "Last 30 days");
 *   const picker = await openPicker(page);
 *   await showMonth(picker, "2026-10");
 *   await dayButton(picker, "2026-10-05").click();
 */
import { expect, type Locator, type Page } from "@playwright/test";

import {
  type CalendarDate,
  type CalendarMonth,
  calendarMonthOf,
  formatCalendarDay,
  formatCalendarMonth,
} from "../../app/lib/london-time.ts";

/** The trigger chip, named after the applied range ("All dates", "Last 7 days", "5 Oct – 12 Oct"). */
export function dateTrigger(page: Page): Locator {
  return page
    .getByRole("region", { name: "Stats filters" })
    .getByRole("group", { name: "Dates" })
    .getByRole("button");
}

export function picker(page: Page): Locator {
  return page.getByRole("dialog", { name: "Choose dates" });
}

/** Opens the picker, retrying a click that lands before hydration. */
export async function openPicker(page: Page): Promise<Locator> {
  const dialog = picker(page);
  await expect(async () => {
    if (!(await dialog.isVisible())) await dateTrigger(page).click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  return dialog;
}

/** A preset in the picker's list: "All dates", "Last 7 days", ..., "Custom range". */
export function presetOption(dialog: Locator, name: string): Locator {
  return dialog.getByRole("radio", { name, exact: true });
}

/** Clicks a preset's chip: the label around its visually hidden radio. */
export async function clickPreset(
  dialog: Locator,
  name: string,
): Promise<void> {
  await dialog
    .locator("label")
    .filter({ has: dialog.page().getByRole("radio", { name, exact: true }) })
    .click();
  await expect(presetOption(dialog, name)).toBeChecked();
}

/** Opens the picker, chooses a preset and applies it. */
export async function choosePreset(page: Page, name: string): Promise<void> {
  const dialog = await openPicker(page);
  await clickPreset(dialog, name);
  await applyButton(dialog).click();
  await expect(dialog).toBeHidden();
}

export function applyButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Apply" });
}

/** A day's grid cell, which carries `aria-selected`. */
export function dayCell(dialog: Locator, date: CalendarDate): Locator {
  return dialog.getByRole("gridcell", {
    name: formatCalendarDay(date),
    exact: true,
  });
}

export function dayButton(dialog: Locator, date: CalendarDate): Locator {
  return dialog.getByRole("button", {
    name: formatCalendarDay(date),
    exact: true,
  });
}

/** Steps a month at a time, back or forward, until `month` shows. */
export async function showMonth(
  dialog: Locator,
  month: CalendarMonth,
): Promise<void> {
  const heading = dialog.getByRole("heading", {
    name: formatCalendarMonth(month),
  });
  for (let step = 0; step < 36 && !(await heading.isVisible()); step++) {
    const shown = await dialog
      .locator("[data-month]")
      .first()
      .getAttribute("data-month");
    const direction = (shown ?? "") > month ? "Previous" : "Next";
    await dialog.getByRole("button", { name: `${direction} month` }).click();
  }
  await expect(heading).toBeVisible();
}

/** Picks a custom range by clicking its two days in the order given, then applies it. */
export async function pickRange(
  page: Page,
  first: CalendarDate,
  second: CalendarDate,
): Promise<void> {
  const dialog = await openPicker(page);
  await showMonth(dialog, calendarMonthOf(first));
  await dayButton(dialog, first).click();
  await showMonth(dialog, calendarMonthOf(second));
  await dayButton(dialog, second).click();
  await applyButton(dialog).click();
  await expect(dialog).toBeHidden();
}
