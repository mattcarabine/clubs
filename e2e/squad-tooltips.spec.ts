import type { Page } from "@playwright/test";

import { win } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-81: each Squad table header says what its column means, in a tooltip
// for mice and keyboards and as its accessible description.

const ABOVE_TEAM =
  "Rating against teammates' average in the same Matches: above 0 lifts the team";

test.beforeEach(async ({ fakeEa, triggerPoll }) => {
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
  await fakeEa.addMatch(win());
  await triggerPoll();
});

function squadTable(page: Page) {
  return page.getByRole("table", { name: "Squad Members" });
}

function sortButton(page: Page, name: string) {
  return squadTable(page)
    .getByRole("columnheader", { name, exact: true })
    .getByRole("button");
}

function tooltip(page: Page) {
  return page.locator("[role=tooltip]");
}

test("each header describes its column to screen readers", async ({ page }) => {
  await page.goto("/squad");
  await expect(sortButton(page, "G+A")).toHaveAccessibleDescription(
    "Goals plus assists",
  );
  await expect(sortButton(page, "Above team")).toHaveAccessibleDescription(
    ABOVE_TEAM,
  );
  await expect(sortButton(page, "Form")).toHaveAccessibleDescription(
    "Average rating over the last 5 Appearances",
  );
});

test("focusing a header with the keyboard shows its tooltip, and Esc hides it", async ({
  page,
}) => {
  await page.goto("/squad");
  await expect(async () => {
    await sortButton(page, "Squad Member").focus();
    await page.keyboard.press("Tab");
    await expect(sortButton(page, "G+A")).toBeFocused();
    await expect(tooltip(page)).toHaveText("Goals plus assists", {
      timeout: 1000,
    });
  }).toPass();

  await page.keyboard.press("Escape");
  await expect(tooltip(page)).toHaveCount(0);
});

test("Vs team is now called Above team, on the Squad table and in its legend", async ({
  page,
}) => {
  await page.goto("/squad");
  await expect(
    squadTable(page).getByRole("columnheader", { name: "Above team" }),
  ).toBeVisible();
  await expect(page.getByText(ABOVE_TEAM)).toBeVisible();
  await expect(page.getByText(/Vs team/i)).toHaveCount(0);
});

test.describe("on desktop", () => {
  test.skip(({ isMobile }) => isMobile, "Phones have no hover");

  test("resting the mouse on a header shows what it means", async ({
    page,
  }) => {
    await page.goto("/squad");
    const header = squadTable(page).getByRole("columnheader", {
      name: "Above team",
    });
    await expect(async () => {
      await page.mouse.move(0, 0);
      await header.hover();
      await expect(tooltip(page)).toHaveText(ABOVE_TEAM, { timeout: 1500 });
    }).toPass();
    await expect(tooltip(page)).toBeVisible();

    // It sits under the header, not over it.
    const tipBox = await tooltip(page).boundingBox();
    const headerBox = await header.boundingBox();
    expect(tipBox?.y).toBeGreaterThanOrEqual(
      (headerBox?.y ?? 0) + (headerBox?.height ?? 0),
    );

    await page.mouse.move(0, 0);
    await expect(tooltip(page)).toHaveCount(0);
  });

  test("the tooltip stays under its header as the page scrolls", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 500 });
    await page.goto("/squad");
    const header = squadTable(page).getByRole("columnheader", {
      name: "Above team",
    });
    await expect(async () => {
      await page.mouse.move(0, 0);
      await header.hover();
      await expect(tooltip(page)).toBeVisible({ timeout: 1500 });
    }).toPass();

    const gap = async () => {
      const tip = await tooltip(page).boundingBox();
      const box = await header.boundingBox();
      return Math.round((tip?.y ?? 0) - ((box?.y ?? 0) + (box?.height ?? 0)));
    };
    const before = await gap();
    // A nudge, so the header is still under the mouse.
    await page.evaluate(() => window.scrollBy(0, 10));
    await expect.poll(gap).toBe(before);
    await expect(tooltip(page)).toBeVisible();
  });

  test("dragging a header across others shows none of their tooltips", async ({
    page,
  }) => {
    await page.goto("/squad");
    const from = sortButton(page, "Rating");
    const over = sortButton(page, "G+A");
    // Prove hydration with one tooltip, then put it away.
    await expect(async () => {
      await page.mouse.move(0, 0);
      await from.hover();
      await expect(tooltip(page)).toBeVisible({ timeout: 1500 });
    }).toPass();
    await page.mouse.down();
    await expect(tooltip(page)).toHaveCount(0);
    const box = await over.boundingBox();
    await page.mouse.move(
      (box?.x ?? 0) + (box?.width ?? 0) / 2,
      (box?.y ?? 0) + (box?.height ?? 0) / 2,
      { steps: 5 },
    );
    // Rest on the drop target for longer than the hover delay.
    await page.waitForTimeout(700);
    await expect(tooltip(page)).toHaveCount(0);
    await page.mouse.up();
  });

  test("pressing a header to sort puts its tooltip away", async ({ page }) => {
    await page.goto("/squad");
    await expect(async () => {
      await page.mouse.move(0, 0);
      await sortButton(page, "G+A").hover();
      await expect(tooltip(page)).toBeVisible({ timeout: 1500 });
    }).toPass();
    await sortButton(page, "G+A").click();
    await expect(tooltip(page)).toHaveCount(0);
  });
});
