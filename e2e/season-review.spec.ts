// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
/**
 * CLUBS-45: the Season Review page, a deck of cards. Phones step through it
 * like stories (tap, swipe, progress pips); desktop scroll-snaps; arrow keys
 * work on both, and reduced motion stops the cards wiping in. Nothing on the
 * site links to it.
 */
import type { Locator, Page } from "@playwright/test";

import {
  EXPECTED_AWARDS,
  endSeason,
  KAB,
  playSeason,
  SPARROWS,
} from "./support/season-review.ts";
import { expect, test } from "./support/test.ts";

const REVIEW_PATH = "/seasons/1/review";

const FULL_ORDER = [
  "intro",
  "record",
  "division",
  "extremes",
  "best-session",
  "when-we-play",
  "opponents",
  "award-player-of-the-season",
  "award-golden-boot",
  "award-playmaker",
  "award-most-improved",
  "award-ever-present",
  "award-hot-streak",
  "milestones",
  "outro",
];

function card(page: Page, id: string): Locator {
  return page.locator(`[data-card="${id}"]`);
}

function cardIds(page: Page): Promise<string[]> {
  return page
    .locator("[data-card]")
    .evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).dataset.card ?? ""),
    );
}

function pip(page: Page, position: number): Locator {
  return page
    .getByRole("list", { name: "Progress" })
    .getByRole("button", { name: new RegExp(`^${position} of `) });
}

function stage(page: Page): Locator {
  return page.getByTestId("story-cards");
}

test.describe("a reviewed Season", () => {
  test.beforeEach(async ({ fakeEa, triggerPoll }) => {
    await playSeason({ fakeEa, triggerPoll });
    await endSeason({ fakeEa, triggerPoll });
  });

  test("the cards run in order, with each Award going to the right Squad Member", async ({
    page,
  }) => {
    await page.goto(REVIEW_PATH);
    await expect(
      page.getByRole("heading", { level: 1, name: "Season 1" }),
    ).toBeAttached();
    expect(await cardIds(page)).toEqual(FULL_ORDER);

    for (const [title, winner] of EXPECTED_AWARDS) {
      const id = `award-${title.toLowerCase().replaceAll(" ", "-")}`;
      await expect(card(page, id).locator("p").first()).toHaveText(title);
      await expect(card(page, id).locator("h2")).toHaveText(winner);
    }
    // The intro says the Season is covered since records began.
    await expect(card(page, "intro")).toContainText("Since records began on");
    // EA's final count leads the record, with ours beside it.
    await expect(card(page, "record").locator("h2")).toHaveText("W20 D4 L7");
    await expect(card(page, "record")).toContainText(
      "7 Matches, W4 D1 L2, 13 scored and 8 conceded",
    );
    await expect(card(page, "opponents")).toContainText("Robins");
    await expect(card(page, "opponents")).toContainText(SPARROWS.name);
    await expect(card(page, "extremes")).toContainText("5");
    // The Milestones reached (CLUBS-36): Kabeeble's five-goal Match.
    await expect(card(page, "milestones")).toContainText(KAB.name);
    // Write-ups carry no label saying how they were written.
    await expect(page.locator("main")).not.toContainText(/claude|\bAI\b/i);
  });

  test("no page, nav item or Season control links to a Season Review", async ({
    page,
  }) => {
    for (const path of ["/", "/trends", "/matches", "/squad", "/analysis"]) {
      await page.goto(path);
      await expect(
        page.getByRole("navigation", { name: "Primary" }),
      ).toBeVisible();
      expect(
        await page.locator('a[href*="/seasons/"], a[href*="review"]').count(),
        path,
      ).toBe(0);
      await expect(
        page.getByRole("navigation", { name: "Primary" }),
      ).not.toContainText(/review/i);
    }
  });

  test.describe("on a phone", () => {
    test.skip(({ isMobile }) => !isMobile, "Phones only");

    test("tap and swipe step through the cards, with progress pips", async ({
      page,
    }) => {
      await page.goto(REVIEW_PATH);
      await expect(card(page, "intro")).toBeVisible();
      await expect(card(page, "record")).toBeHidden();
      await expect(pip(page, 1)).toHaveAttribute("aria-current", "step");
      await expect(
        page.getByRole("list", { name: "Progress" }).getByRole("button"),
      ).toHaveCount(FULL_ORDER.length);

      const box = await stage(page).boundingBox();
      if (!box) throw new Error("No deck");
      // The right two thirds go forward, the left third back.
      await stage(page).tap({
        position: { x: box.width * 0.8, y: box.height * 0.8 },
      });
      await expect(card(page, "record")).toBeVisible();
      await expect(card(page, "intro")).toBeHidden();
      await expect(pip(page, 2)).toHaveAttribute("aria-current", "step");
      await expect(pip(page, 1)).not.toHaveAttribute("aria-current", "step");
      await stage(page).tap({
        position: { x: box.width * 0.1, y: box.height * 0.8 },
      });
      await expect(card(page, "intro")).toBeVisible();

      // A swipe left goes forward, right goes back.
      await swipe(stage(page), -150);
      await expect(card(page, "record")).toBeVisible();
      await swipe(stage(page), -150);
      await expect(card(page, "division")).toBeVisible();
      await swipe(stage(page), 150);
      await expect(card(page, "record")).toBeVisible();

      // A pip jumps straight to its card.
      await pip(page, FULL_ORDER.length).tap();
      await expect(card(page, "outro")).toBeVisible();
    });

    test("the arrow keys step through the cards", async ({ page }) => {
      await page.goto(REVIEW_PATH);
      await expect(card(page, "intro")).toBeVisible();
      await page.keyboard.press("ArrowRight");
      await expect(card(page, "record")).toBeVisible();
      await page.keyboard.press("ArrowDown");
      await expect(card(page, "division")).toBeVisible();
      await page.keyboard.press("ArrowLeft");
      await expect(card(page, "record")).toBeVisible();
    });
  });

  test.describe("on desktop", () => {
    test.skip(({ isMobile }) => isMobile, "Desktop only");

    test("the cards are a scroll-snapped vertical sequence that the arrow keys and the pips follow", async ({
      page,
    }) => {
      await page.goto(REVIEW_PATH);
      const list = stage(page);
      expect(
        await list.evaluate((el) => {
          const style = getComputedStyle(el);
          return [style.scrollSnapType, style.overflowY];
        }),
      ).toEqual(["y mandatory", "auto"]);
      // Every card is laid out, one viewport each.
      for (const id of FULL_ORDER) await expect(card(page, id)).toBeVisible();
      const [listBox, cardBox] = await Promise.all([
        list.boundingBox(),
        card(page, "intro").boundingBox(),
      ]);
      expect(cardBox?.height).toBeCloseTo(listBox?.height ?? 0, -1);
      expect(
        await card(page, "record").evaluate(
          (el) => getComputedStyle(el).scrollSnapAlign,
        ),
      ).toBe("start");

      await page.keyboard.press("ArrowDown");
      await expect(pip(page, 2)).toHaveAttribute("aria-current", "step");
      await expect
        .poll(() => list.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(0);
      await expect(card(page, "record")).toBeInViewport({ ratio: 0.9 });

      // Scrolling moves the pips too.
      await list.hover();
      await page.mouse.wheel(0, (listBox?.height ?? 800) * 2);
      await expect(pip(page, 2)).not.toHaveAttribute("aria-current", "step");
    });
  });

  test("reduced motion stops the cards wiping in", async ({ page }) => {
    await page.goto(REVIEW_PATH);
    expect(await animationName(card(page, "intro"))).toBe("story-in");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.keyboard.press("ArrowRight");
    await expect(pip(page, 2)).toHaveAttribute("aria-current", "step");
    expect(await animationName(card(page, "record"))).toBe("none");
  });

  test.describe("on a 375px phone", () => {
    test.use({ viewport: { width: 375, height: 740 } });

    test("no card scrolls the page sideways", async ({ page }) => {
      await page.goto(REVIEW_PATH);
      for (const [i, id] of FULL_ORDER.entries()) {
        await expect(pip(page, i + 1)).toHaveAttribute("aria-current", "step");
        await expect(card(page, id)).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          id,
        ).toBe(true);
        await page.keyboard.press("ArrowRight");
      }
      await expect(card(page, "outro")).toBeVisible();
    });
  });
});

test("cards with no data are skipped", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // A Season of a single Win: no schedule, rivals or rated Awards.
  await playSeason({ fakeEa, triggerPoll }, [
    { result: "W", score: [2, 0], opponent: SPARROWS, hoursAgo: 2 },
  ]);
  await endSeason({ fakeEa, triggerPoll });

  await page.goto(REVIEW_PATH);
  expect(await cardIds(page)).toEqual([
    "intro",
    "record",
    "division",
    "extremes",
    "best-session",
    "award-golden-boot",
    "award-playmaker",
    "award-ever-present",
    "outro",
  ]);
  await expect(card(page, "award-golden-boot").locator("h2")).toHaveText(
    KAB.name,
  );
});

function animationName(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).animationName);
}

/** A horizontal swipe across the deck by `dx` pixels, as touch events. */
async function swipe(target: Locator, dx: number) {
  const box = await target.boundingBox();
  if (!box) throw new Error("No deck");
  const y = box.y + box.height / 2;
  const startX = box.x + box.width / 2 - dx / 2;
  const at = (x: number) => [{ identifier: 0, clientX: x, clientY: y }];
  await target.dispatchEvent("touchstart", {
    touches: at(startX),
    changedTouches: at(startX),
    targetTouches: at(startX),
  });
  await target.dispatchEvent("touchend", {
    touches: [],
    changedTouches: at(startX + dx),
    targetTouches: [],
  });
}
