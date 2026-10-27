/**
 * CLUBS-17: EA answers only a real browser, so in production the home relay
 * polls it and pushes each Poll to the Worker (docs/adr/0007).
 */
import { OUR_CLUB_ID, win } from "./support/match-builders.ts";
import { runTestRelay } from "./support/relay.ts";
import { expect, test } from "./support/test.ts";

test("with the Worker's EA fetch disabled, one relay run puts the new Match on the home page", async ({
  page,
  request,
  fakeEa,
}) => {
  const added = win({ goalsFor: 4, goalsAgainst: 0 });
  await fakeEa.addMatch(added);
  const opponentId = Object.keys(added.match.clubs).find(
    (id) => id !== OUR_CLUB_ID,
  );
  const opponent = added.match.clubs[opponentId ?? ""].details?.name;

  // The cron, as production runs it, leaves EA to the relay.
  const cron = await request.get("/__test/scheduled-relay-mode");
  expect(cron.ok()).toBe(true);
  expect(await fakeEa.requests()).toEqual([]);

  const summary = await runTestRelay();
  expect(summary).toMatchObject({ status: "ok", failures: 0 });

  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Latest Match" }),
  ).toContainText(`A Bloo Bloo 4, ${opponent} 0`);
  await expect(page.getByText("Updated just now")).toBeVisible();
});
