import { expect, test } from "@playwright/test";

// CLUBS-5: every design-system component renders on /styleguide, on phone and
// desktop, without horizontal page scroll.

test.beforeEach(async ({ page }) => {
  await page.goto("/styleguide");
});

test("app shell shows the crest lockup and primary nav", async ({ page }) => {
  await expect(page.getByRole("link", { name: "A Bloo Bloo" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Primary" });
  for (const label of ["Matchday", "Squad", "Matches", "Opponents", "Trends"]) {
    await expect(nav.getByRole("link", { name: label })).toBeAttached();
  }
  await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute(
    "href",
    /crest/,
  );
});

test("every component section renders", async ({ page }) => {
  await expect(
    page.getByRole("heading", { level: 1, name: "Styleguide" }),
  ).toBeVisible();

  const section = (id: string) => page.getByTestId(`sg-${id}`);

  await expect(
    section("score-bar").getByText("A Bloo Bloo 3, Northside Athletic 1"),
  ).toBeAttached();
  await expect(
    section("score-bar").getByText("Northside Athletic", { exact: true }),
  ).toBeVisible();
  await expect(
    section("ticker").getByRole("region", { name: "Latest" }),
  ).toBeVisible();
  await expect(section("stat-tile").getByText("Win rate")).toBeVisible();
  await expect(
    section("form-guide").getByRole("list", {
      name: "Form, oldest to newest: Win, Win, Draw, Loss, Win, Win",
    }),
  ).toBeVisible();
  await expect(section("player-chip").getByText("Kopite Kev")).toBeVisible();
  await expect(
    section("last-updated-badge").getByText("4 min ago"),
  ).toBeVisible();
  await expect(section("last-updated-badge").getByText("Stale:")).toBeVisible();
  await expect(
    section("data-table").getByRole("table", {
      name: "Squad Members this Season",
    }),
  ).toBeAttached();
  await expect(
    section("charts").getByRole("slider", {
      name: "Goals for and against by Match",
    }),
  ).toBeVisible();
  await expect(
    section("charts").getByRole("list", { name: "Goals by Squad Member" }),
  ).toBeVisible();
  await expect(
    section("empty-state").getByText("No Matches yet"),
  ).toBeVisible();
  await expect(
    section("loading").getByRole("status", { name: "Loading Matchday" }),
  ).toBeAttached();
});

test("data table sorts when a header is clicked", async ({ page }) => {
  const table = page.getByRole("table", { name: "Squad Members this Season" });
  const firstRowHeader = table.locator("tbody tr").first().locator("th");

  await expect(firstRowHeader).toHaveText("Kopite Kev");
  // Retry the click: one that lands before hydration does nothing.
  await expect(async () => {
    await table.getByRole("button", { name: "Pass %" }).click();
    await expect(
      table.getByRole("columnheader", { name: "Pass %" }),
    ).toHaveAttribute("aria-sort", "descending", { timeout: 1000 });
  }).toPass();
  await expect(firstRowHeader).toHaveText("Big Sam Allardyce Fan");
});

test("has no horizontal page scroll, down to a 375px phone", async ({
  page,
  viewport,
}) => {
  for (const width of [viewport?.width ?? 1440, 375]) {
    await page.setViewportSize({ width, height: viewport?.height ?? 800 });
    // Wait for fonts and chart measurement so the check sees the final layout.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits, `no horizontal scroll at ${width}px`).toBe(true);
  }
});
