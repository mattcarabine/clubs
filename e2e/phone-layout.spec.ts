// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./support/test.ts";

// CLUBS-22: the Squad table, filter rail, time formats and linked rows.

const PHONE = { width: 375, height: 812 };

/** True when the element sits wholly inside its scroll container's visible box. */
async function fullyInView(cell: Locator): Promise<boolean> {
  return cell.evaluate((el) => {
    const scroller = el.closest("section");
    if (!scroller) return false;
    const box = el.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    return box.left >= view.left && box.right <= view.right;
  });
}

function squadTable(page: Page) {
  return page.getByRole("table", { name: "Squad Members" });
}

test.describe("on a 375px phone", () => {
  test.use({ viewport: PHONE });

  test("the Squad table shows the name with G+A, Rating, Form and Apps without scrolling", async ({
    page,
    triggerPoll,
  }) => {
    await triggerPoll();
    await page.goto("/squad");

    const table = squadTable(page);
    for (const header of ["Squad Member", "G+A", "Rating", "Form", "Apps"]) {
      const cell = table.getByRole("columnheader", {
        name: header,
        exact: true,
      });
      expect(await fullyInView(cell), `${header} in view`).toBe(true);
    }
    // Every name fits beside them too.
    for (const name of await table.getByRole("rowheader").all()) {
      expect(await fullyInView(name)).toBe(true);
    }
  });

  test("the Squad table starts on the first screen", async ({
    page,
    triggerPoll,
  }) => {
    await triggerPoll();
    await page.goto("/squad");

    const box = await squadTable(page).boundingBox();
    expect(box?.y).toBeLessThan(PHONE.height);
  });

  test("the filter rail fades at the edge it scrolls toward", async ({
    page,
  }) => {
    await page.goto("/opponents");
    const rail = page
      .getByRole("region", { name: "Stats filters" })
      .locator(".scroll-fade")
      .first();

    await expect(rail).toHaveAttribute("data-fade-end", "");
    await expect(rail).not.toHaveAttribute("data-fade-start", "");

    await rail.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect(rail).toHaveAttribute("data-fade-start", "");
    await expect(rail).not.toHaveAttribute("data-fade-end", "");
  });
});

test("Matches are dated as moments: weekday, day, month and 24-hour time", async ({
  page,
  triggerPoll,
}) => {
  await triggerPoll();
  await page.goto("/");

  const moment =
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}( \d{4})?, \d{2}:\d{2}$/;
  const latest = page
    .getByRole("region", { name: "Latest Match" })
    .locator("time");
  await expect(latest).toHaveText(moment);
  const earlier = page
    .getByRole("region", { name: "Before that" })
    .locator("time");
  for (const time of await earlier.all()) {
    await expect(time).toHaveText(moment);
  }
  // Relative times are only for how old the data is.
  await expect(
    page.getByRole("region", { name: "Latest Match" }).getByText(/ ago$/),
  ).toHaveCount(0);
});

test("a click anywhere on an Opponent's row opens their page", async ({
  page,
  triggerPoll,
}) => {
  await triggerPoll();
  await page.goto("/opponents");

  const table = page.getByRole("table", { name: "Head-to-head records" });
  const firstRow = table.locator("tbody tr").first();
  const name = await firstRow.getByRole("rowheader").innerText();
  const href = await firstRow.getByRole("link").getAttribute("href");

  // A stat cell, not the name's own link.
  await firstRow.getByRole("cell").first().click();
  await expect(page).toHaveURL(href ?? "");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    new RegExp(name, "i"),
  );
});
