// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
/**
 * CLUBS-100: "Choices on the ball", EA's verdict on each pass and shot as
 * shares, on Analysis, a profile and Compare.
 */
import type { Locator, Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import { OUR_CLUB_ID, win } from "./support/match-builders.ts";
import {
  bare,
  type Events,
  KABEEBLE,
  OPPONENT_ID,
  playing,
  THEIR_MIDFIELDER,
  TINBS,
} from "./support/match-events.ts";
import { expect, test } from "./support/test.ts";

/** In every recorded Match for Our Club, as a forward. */
const LOLTOWN = "274963432";

/** EA's verdicts as Match Events, best first. */
function verdicts(
  best: number,
  good: number,
  none: number,
  poor: number,
): Events {
  return { 177: best, 176: good, 175: none, 182: poor };
}

/**
 * One Match: Kabeeble takes a good or the best option with 20% of 200
 * choices, tinbs_irl with 40% of 200, and their midfielder with 30% of 200.
 */
function oneMatch(): AddMatchBody {
  const match = bare(win());
  playing(match, OUR_CLUB_ID, KABEEBLE, verdicts(10, 30, 100, 60));
  playing(match, OUR_CLUB_ID, TINBS, verdicts(30, 50, 80, 40));
  playing(match, OPPONENT_ID, THEIR_MIDFIELDER, verdicts(20, 40, 100, 40));
  return match;
}

function choices(page: Page) {
  return page.getByRole("region", { name: "Choices on the ball" });
}

function bar(scope: Locator, name: string) {
  return scope.locator(`[data-choices="${name}"]`);
}

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so every figure is exact.
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

test("Analysis sets our club beside the opponents and ranks squad members by good or best options", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(oneMatch());
  await triggerPoll();

  await page.goto("/analysis");
  const section = choices(page);
  await expect(section).toBeVisible();

  // Our club is both squad members together: 40 best and 80 good of 400.
  const club = bar(section, "Our club");
  await expect(club).toContainText("400 choices");
  await expect(club).toContainText(
    "30% good or best · 25% should have passed elsewhere",
  );
  await expect(bar(section, "Opponents")).toContainText(
    "30% good or best · 20% should have passed elsewhere",
  );

  // The squad members, most good or best options first.
  const members = section
    .getByRole("list")
    .filter({ has: page.getByRole("link") })
    .getByRole("listitem");
  await expect(members).toHaveCount(2);
  await expect(members.nth(0)).toContainText("tinbs_irl");
  await expect(members.nth(0)).toContainText(
    "40% good or best · 20% should have passed elsewhere",
  );
  await expect(members.nth(1)).toContainText("Kabeeble");
  await expect(members.nth(1)).toContainText(
    "20% good or best · 30% should have passed elsewhere",
  );
  await expect(members.nth(1).getByRole("link")).toHaveAttribute(
    "href",
    `/players/${KABEEBLE}`,
  );

  // Every share is in the bar's own name, best first.
  await expect(
    section.getByRole("img", {
      name: "Kabeeble: Best option 5%, Good option 15%, No good option 50%, Should have passed elsewhere 30%",
    }),
  ).toBeVisible();

  // The key names EA's four verdicts, and a note says what they cover.
  for (const verdict of [
    "Best option",
    "Good option",
    "No good option",
    "Should have passed elsewhere",
  ]) {
    await expect(
      section
        .getByRole("list", { name: "Key" })
        .getByText(verdict, { exact: true }),
    ).toBeVisible();
  }
  await expect(section).toContainText("EA judges every pass and shot.");
});

test("a share is printed on its segment where it fits", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(oneMatch());
  await triggerPoll();

  await page.goto("/analysis");
  const kabeeble = bar(choices(page), "Kabeeble");
  for (const [verdict, share] of [
    ["good", "15%"],
    ["none", "50%"],
    ["poor", "30%"],
  ]) {
    await expect(
      kabeeble.locator(`[data-verdict="${verdict}"]`).getByText(share),
    ).toBeVisible();
  }
});

test("focusing a bar, as a tap does, lists all four shares", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(oneMatch());
  await triggerPoll();

  await page.goto("/analysis");
  const kabeeble = bar(choices(page), "Kabeeble");
  const tooltip = kabeeble.getByText("Should have passed elsewhere", {
    exact: true,
  });
  await expect(tooltip).toBeHidden();
  await kabeeble.getByRole("img").focus();
  await expect(tooltip).toBeVisible();
  // The best option's 5% is too narrow to print on a phone's bar: it is here.
  await expect(
    kabeeble.getByText("Best option", { exact: true }),
  ).toBeVisible();
});

test("a small sample is said in words and listed last, and a handful of choices is left out", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const match = bare(win());
  // Kabeeble: 25% good or best, but of only 40 choices.
  playing(match, OUR_CLUB_ID, KABEEBLE, verdicts(2, 8, 20, 10));
  // tinbs_irl: 20% of 100.
  playing(match, OUR_CLUB_ID, TINBS, verdicts(10, 10, 60, 20));
  // Loltown95: 5 choices, too few to share out.
  playing(match, OUR_CLUB_ID, LOLTOWN, verdicts(1, 1, 2, 1));
  await fakeEa.addMatch(match);
  await triggerPoll();

  await page.goto("/analysis");
  const section = choices(page);
  const members = section
    .getByRole("list")
    .filter({ has: page.getByRole("link") })
    .getByRole("listitem");
  await expect(members).toHaveCount(2);
  await expect(members.nth(0)).toContainText("tinbs_irl");
  await expect(members.nth(0)).not.toContainText("Small sample");
  await expect(members.nth(1)).toContainText("Kabeeble");
  await expect(members.nth(1)).toContainText("25% good or best");
  await expect(members.nth(1)).toContainText("Small sample");
  await expect(section.getByText("Loltown95")).toHaveCount(0);
  // Their 5 choices still count in the club's 145.
  await expect(bar(section, "Our club")).toContainText("145 choices");
});

test("a profile sets the squad member beside a typical opponent in their position and our club", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(oneMatch());
  await triggerPoll();

  await page.goto(`/players/${KABEEBLE}`);
  const section = choices(page);
  await expect(section).toContainText(
    "beside a typical opposing midfielder and our club",
  );
  const rows = section
    .getByRole("listitem")
    .filter({ hasText: "good or best" });
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Kabeeble");
  await expect(rows.nth(0)).toContainText("200 choices");
  await expect(rows.nth(0)).toContainText("20% good or best");
  await expect(rows.nth(1)).toContainText("Typical opposing midfielder");
  await expect(rows.nth(1)).toContainText("30% good or best");
  await expect(rows.nth(2)).toContainText("Our club");
  await expect(rows.nth(2)).toContainText("30% good or best");
});

test("Compare puts both squad members' choices one above the other", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(oneMatch());
  await triggerPoll();

  await page.goto(`/compare?players=${KABEEBLE},${TINBS}`);
  const rows = choices(page)
    .getByRole("listitem")
    .filter({ hasText: "good or best" });
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Kabeeble");
  await expect(rows.nth(0)).toContainText(
    "20% good or best · 30% should have passed elsewhere",
  );
  await expect(rows.nth(1)).toContainText("tinbs_irl");
  await expect(rows.nth(1)).toContainText(
    "40% good or best · 20% should have passed elsewhere",
  );
});

test("with no detail from EA the section is left out", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(bare(win()));
  await triggerPoll();

  for (const path of [
    "/analysis",
    `/players/${KABEEBLE}`,
    `/compare?players=${KABEEBLE},${TINBS}`,
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(choices(page)).toHaveCount(0);
  }
});

test.describe("on a 375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the bars fit the screen", async ({ page, fakeEa, triggerPoll }) => {
    await fakeEa.addMatch(oneMatch());
    await triggerPoll();

    for (const path of [
      "/analysis",
      `/players/${KABEEBLE}`,
      `/compare?players=${KABEEBLE},${TINBS}`,
    ]) {
      await page.goto(path);
      await expect(choices(page)).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);
      // The bar spans the panel under the name.
      const box = await choices(page).getByRole("img").first().boundingBox();
      expect(box?.width).toBeGreaterThan(280);
    }
  });
});
