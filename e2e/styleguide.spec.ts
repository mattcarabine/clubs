// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import { expect, test } from "./support/test.ts";

// CLUBS-5: every design-system component renders on /styleguide, on phone and
// desktop, without horizontal page scroll.

test.beforeEach(async ({ page }) => {
  await page.goto("/styleguide");
});

test("app shell shows the crest lockup and primary nav", async ({ page }) => {
  await expect(page.getByRole("link", { name: "A Bloo Bloo" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Primary" });
  for (const label of [
    "Matches",
    "Squad",
    "Trends",
    "Analysis",
    "Milestones",
  ]) {
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
    section("score-bar")
      .getByText("Northside Athletic", { exact: true })
      .first(),
  ).toBeVisible();
  // CLUBS-31: a hero for every result, and strips of 1 and 6 performers.
  for (const result of [
    "Win",
    "Draw",
    "Loss",
    "We rage quit",
    "They rage quit",
  ]) {
    await expect(
      section("score-bar").getByText(result, { exact: true }).first(),
    ).toBeVisible();
  }
  const strips = section("top-performers").getByRole("region", {
    name: "Top performers",
  });
  await expect(strips).toHaveCount(2);
  await expect(strips.first().getByRole("listitem")).toHaveCount(1);
  // A looping strip's second copy is hidden from the accessibility tree.
  await expect(strips.nth(1).getByRole("listitem")).toHaveCount(6);
  await expect(
    section("ticker").getByRole("region", { name: "Latest" }),
  ).toBeVisible();
  await expect(section("stat-tile").getByText("Win rate")).toBeVisible();
  await expect(
    section("campaign-panel").getByText(
      "Promotion Series: 4 Wins in a row needed",
    ),
  ).toBeVisible();
  await expect(
    section("campaign-panel").getByText("Relegation Match next"),
  ).toBeVisible();
  await expect(
    section("charts").getByRole("img", { name: "Division over time" }),
  ).toBeVisible();
  await expect(
    section("form-guide").getByRole("list", {
      name: "Form, oldest to newest: Win, Win, Draw, Loss, Win, Win",
    }),
  ).toBeVisible();
  // CLUBS-34: a whole Session, and one the filter narrowed.
  await expect(
    section("session-header").getByText("2 Dropped Points"),
  ).toBeVisible();
  await expect(
    section("session-header").getByText("1 of 3 Matches shown"),
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
    section("charts").getByRole("slider", {
      name: "Goals and assists by Appearance",
    }),
  ).toBeVisible();
  await expect(
    section("form-badge").locator('[title="Last 5: 8.1 avg vs 7.3 usual"]'),
  ).toHaveCount(2);
  await expect(
    section("form-badge").getByText("Cold", { exact: true }),
  ).toBeVisible();
  await expect(section("tag").getByText("Small sample")).toBeVisible();
  await expect(
    section("empty-state").getByText("No Matches yet"),
  ).toBeVisible();
  await expect(
    section("loading").getByRole("status", { name: "Loading Matches" }),
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

test("the head-to-head bar reads the record in words", async ({ page }) => {
  await expect(
    page
      .getByTestId("sg-head-to-head-bar")
      .getByText(
        "A Bloo Bloo against Northside Athletic: 4 wins, 1 draw, 2 losses",
      ),
  ).toBeAttached();
});

test("the date-range picker opens its presets and calendar", async ({
  page,
}) => {
  const section = page.getByTestId("sg-date-range-picker");
  const trigger = section.getByRole("button", { name: /^3 Oct – 7 Oct/ });
  const dialog = page.getByRole("dialog", { name: "Choose dates" });
  await expect(async () => {
    if (!(await dialog.isVisible())) await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(
    dialog.getByRole("radio", { name: "Custom range" }),
  ).toBeChecked();
  await expect(dialog.getByRole("grid").first()).toBeVisible();
});

test("the StoryDeck takes the arrow keys only while it has focus", async ({
  page,
}) => {
  const deck = page
    .getByTestId("sg-story")
    .getByRole("region", { name: "Sample Season Review" });
  const pip = (n: number) =>
    deck.getByRole("button", { name: new RegExp(`^${n} of 3`) });
  await expect(pip(1)).toHaveAttribute("aria-current", "step");
  await page.keyboard.press("ArrowRight");
  await expect(pip(1)).toHaveAttribute("aria-current", "step");

  await deck.focus();
  await page.keyboard.press("ArrowRight");
  await expect(pip(2)).toHaveAttribute("aria-current", "step");
});
