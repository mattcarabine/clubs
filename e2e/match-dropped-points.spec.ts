import type { Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import {
  dnf,
  draw,
  friendly,
  lasting,
  loss,
  win,
  withOnlyShots,
} from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-27: the Match page's "Why we dropped points" panel, a Dropped Points
// Match against the average Win.

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so the baseline is exact.
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

type Fake = { addMatch(body: AddMatchBody): Promise<void> };

async function record(
  fakeEa: Fake,
  triggerPoll: () => Promise<void>,
  builds: AddMatchBody[],
) {
  for (const body of builds) await fakeEa.addMatch(body);
  await triggerPoll();
}

/** Full-length Wins with 10, 12 and 14 shots: 12.0 per 90 on average. */
function seededWins(): AddMatchBody[] {
  return [10, 12, 14].map((shots) => withOnlyShots(lasting(win(), 90), shots));
}

function panel(page: Page) {
  return page.getByRole("region", { name: "Why we dropped points" });
}

function deviations(page: Page) {
  return panel(page)
    .getByRole("list", { name: "Biggest differences from a typical Win" })
    .getByRole("listitem");
}

const LOSS_ID = "870000000000001";

test("a loss with far fewer shots than the Wins leads with shots and both values", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [
    ...seededWins(),
    // Friendlies are never counted, however many shots.
    withOnlyShots(lasting(friendly({ goalsFor: 3, goalsAgainst: 0 }), 90), 40),
    withOnlyShots(lasting(loss({ matchId: LOSS_ID }), 90), 2),
  ]);

  // Page filters never change the baseline.
  await page.goto(`/matches/${LOSS_ID}?types=playoff`);
  await expect(panel(page)).toContainText(
    "Against the average of 3 Wins: Competitive Matches, all time, DNFs included.",
  );
  await expect(deviations(page).first()).toContainText(
    "10.0 fewer shots per 90 than in a typical Win (2.0 vs 12.0)",
  );
  await expect(deviations(page).first()).toContainText("A Bloo Bloo");
});

test("a draw shows the panel and a Win does not", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const winId = "870000000000002";
  const drawId = "870000000000003";
  await record(fakeEa, triggerPoll, [
    ...seededWins(),
    withOnlyShots(lasting(win({ matchId: winId }), 90), 12),
    withOnlyShots(lasting(draw({ matchId: drawId }), 90), 12),
  ]);

  await page.goto(`/matches/${drawId}`);
  await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toContainText("Against the average of 4 Wins");
  // 12 shots is the average Win: nothing else differs either.
  await expect(panel(page)).toContainText(
    "Nothing stood out: every stat was in line with a typical Win.",
  );

  await page.goto(`/matches/${winId}`);
  await expect(page.locator("h1")).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
});

test("with fewer than 3 recorded Wins the panel is hidden", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [
    ...seededWins().slice(0, 2),
    withOnlyShots(lasting(loss({ matchId: LOSS_ID }), 90), 2),
  ]);

  await page.goto(`/matches/${LOSS_ID}`);
  await expect(page.locator("h1")).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
});

test("a 45-minute loss is compared per 90, not as raw totals", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const shortId = "870000000000004";
  await record(fakeEa, triggerPoll, [
    ...seededWins(),
    // 9 shots in 45 minutes: 18.0 per 90, more than a typical Win, not fewer.
    withOnlyShots(lasting(loss({ matchId: shortId }), 45), 9),
  ]);

  await page.goto(`/matches/${shortId}`);
  await expect(deviations(page)).toHaveText([
    /6\.0 more shots per 90 than in a typical Win \(18\.0 vs 12\.0\)/,
  ]);
});

test("a DNF we quit has no panel: EA kept none of our stats (CLUBS-48)", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const dnfId = "870000000000005";
  await record(fakeEa, triggerPoll, [
    ...seededWins(),
    withOnlyShots(lasting(dnf({ ourWin: false, matchId: dnfId }), 45), 0),
  ]);

  await page.goto(`/matches/${dnfId}`);
  await expect(page.locator("h1")).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
});

test.describe("on a 375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the panel fits without horizontal page scroll", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    await record(fakeEa, triggerPoll, [
      ...seededWins(),
      withOnlyShots(lasting(loss({ matchId: LOSS_ID }), 90), 2),
    ]);

    await page.goto(`/matches/${LOSS_ID}`);
    await expect(deviations(page).first()).toBeVisible();
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits).toBe(true);
  });
});
