/**
 * CLUBS-95: Analysis's "Why we win" and "Why we lose".
 */
import { lasting, loss, OUR_CLUB_ID, win } from "./support/match-builders.ts";
import { bare, KABEEBLE, playing } from "./support/match-events.ts";
import { daysAgo, record } from "./support/record.ts";
import { expect, test } from "./support/test.ts";

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so every figure is exact.
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

/** EA's code for losing the ball in the middle third. */
const BALL_LOST = 106;
/** EA's code for a completed dribble. */
const DRIBBLE = 174;

test("why we lose names the stat that gets worse and the squad member behind it", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const built = (
    body: ReturnType<typeof win>,
    lost: number,
    dribbles: number,
  ) =>
    playing(lasting(bare(body), 90), OUR_CLUB_ID, KABEEBLE, {
      [BALL_LOST]: lost,
      [DRIBBLE]: dribbles,
    });
  await record(fakeEa, triggerPoll, [
    ...[4, 5, 6].map((lost, i) => built(win(daysAgo(9 - i)), lost, 8)),
    ...[14, 15, 16].map((lost, i) => built(loss(daysAgo(6 - i)), lost, 2)),
  ]);

  await page.goto("/analysis");
  const section = page.getByRole("region", { name: "Why we win and lose" });
  const lose = section.getByRole("region", { name: "Why we lose" });
  const ballLost = lose
    .getByRole("listitem")
    .filter({ hasText: "Ball lost per 90" });
  await expect(ballLost).toContainText(
    "In draws and defeats we lose the ball 10.0 more times per 90 than in wins.",
  );
  await expect(ballLost).toContainText("Small sample");
  await expect(ballLost).toContainText(
    "shows it most: 5.0 in wins, 15.0 in draws and defeats",
  );
  await expect(ballLost.getByRole("link")).toHaveAttribute(
    "href",
    `/players/${KABEEBLE}`,
  );

  const winPanel = section.getByRole("region", { name: "Why we win" });
  await expect(
    winPanel.getByRole("listitem").filter({ hasText: "Dribbles per 90" }),
  ).toContainText(
    "In wins we complete 6.0 more dribbles per 90 than in draws and defeats.",
  );
  // The result itself is never a reason.
  await expect(section).not.toContainText(/goals per 90/i);
});

test("the section waits for 3 wins and 3 draws or defeats", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [win(daysAgo(2)), loss(daysAgo(1))]);
  await page.goto("/analysis");
  await expect(
    page.getByRole("region", { name: "Why we win and lose" }),
  ).toHaveCount(0);
});
