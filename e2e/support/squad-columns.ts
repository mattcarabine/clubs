import type { Page } from "@playwright/test";

import { expect } from "./test.ts";

// The Squad table's Columns picker (CLUBS-65), shared by the specs that
// read a column the table hides by default (CLUBS-80).

export function columnsChip(page: Page) {
  return page.getByRole("button", { name: /^Columns/ });
}

export function columnPicker(page: Page) {
  return page.getByRole("dialog", { name: "Choose columns" });
}

/** Opens the Columns picker, retrying a click that lands before hydration. */
export async function openColumnPicker(page: Page) {
  await expect(async () => {
    await columnsChip(page).click();
    await expect(columnPicker(page)).toBeVisible({ timeout: 1000 });
  }).toPass();
  return columnPicker(page);
}

/**
 * Shows columns the Squad table hides by default, by their names in the
 * picker ("Saves", or "Rating against teammates" for Above team).
 */
export async function showSquadColumns(page: Page, names: readonly string[]) {
  const picker = await openColumnPicker(page);
  for (const name of names) {
    await picker
      .getByRole("checkbox", { name: `Show ${name}`, exact: true })
      .check();
  }
  await picker.getByRole("button", { name: "Done" }).click();
  await expect(picker).toBeHidden();
}
