/**
 * CLUBS-96: the Session page's "Against our other sessions", and the same
 * ranking in the recap's input.
 */
import { lasting, win, withOnlyShots } from "./support/match-builders.ts";
import { record } from "./support/record.ts";
import { expect, test } from "./support/test.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so every rank is exact.
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

const sessionId = (index: number) => `93960000000${index}001`;

/** One Session per entry, oldest first, each two 90-minute Wins with that many shots. */
function sessions(shots: readonly number[]) {
  return shots.flatMap((count, index) => {
    const start = new Date(Date.now() - (shots.length - index) * DAY_MS);
    start.setUTCHours(19, 0, 0, 0);
    return [0, 1].map((place) =>
      withOnlyShots(
        lasting(
          win({
            matchId: place === 0 ? sessionId(index) : `93960000000${index}002`,
            playedAt: new Date(start.getTime() + place * 20 * 60_000),
          }),
          90,
        ),
        count,
      ),
    );
  });
}

test("a Session page says what the Session did best and worst among our sessions", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, sessions([8, 4, 10, 12, 14]));

  await page.goto(`/sessions/${sessionId(4)}`);
  const section = page.getByRole("region", {
    name: "Against our other sessions",
  });
  await expect(section).toContainText(
    "among our sessions of 2 or more matches",
  );
  const well = section
    .getByRole("region", { name: "What we did well" })
    .getByRole("listitem")
    .filter({ hasText: "Shots per 90" });
  await expect(well).toContainText("Best of 5 sessions");
  await expect(well).toContainText("14.0");
  await expect(well).toContainText("Usually 8.5");
  await expect(
    section.getByRole("region", { name: "What we did badly" }),
  ).toContainText("Nothing was among our worst.");

  // An older Session is ranked among all of them too.
  await page.goto(`/sessions/${sessionId(1)}`);
  await expect(
    section
      .getByRole("region", { name: "What we did badly" })
      .getByRole("listitem")
      .filter({ hasText: "Shots per 90" }),
  ).toContainText("Worst of 5 sessions");

  // One in the middle is typical.
  await page.goto(`/sessions/${sessionId(2)}`);
  await expect(section).toContainText("A typical session");
});

test("the section waits for four other sessions", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, sessions([8, 4, 10, 14]));
  await page.goto(`/sessions/${sessionId(3)}`);
  await expect(page.getByRole("region", { name: "Record" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Against our other sessions" }),
  ).toHaveCount(0);
});

test("the recap is given the Session's rank among the sessions before it", async ({
  fakeEa,
  fakeAnthropic,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, sessions([8, 4, 10, 12, 14]));
  const sent = async () =>
    (await fakeAnthropic.requests()).find((r) =>
      r.raw.includes("againstOurOtherSessions"),
    );
  // Write-ups drain a few per Poll, the newest Session first.
  for (let i = 0; i < 4 && !(await sent()); i++) await triggerPoll();
  const request = await sent();
  expect(request?.raw).toContain("Best of 5 sessions");
  expect(request?.raw).toContain("sessionsCompared");
});
