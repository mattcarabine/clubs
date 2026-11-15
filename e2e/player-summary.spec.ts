import type { Page } from "@playwright/test";

import type { RecordedRequest } from "./fake-anthropic/control.ts";
import {
  afterRelease,
  coachingRequests,
  drainSessions,
  KAB,
  nextWeek,
  pastWeek,
  playSession,
  TREV,
} from "./support/coaching.ts";
import {
  type fakeAnthropic as FakeAnthropic,
  promptText,
} from "./support/fake-anthropic.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-94: a written summary of how each Squad Member plays, from every
// recorded Match, rewritten only after a week they played in.

/** Anything that would label the copy as machine-written. */
const AI_LABEL = /claude|anthropic|\bAI\b|written by|generated/i;

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

function playerSummary(page: Page) {
  return page.getByRole("region", { name: "Player summary" });
}

async function summaryRequests(
  fakeAnthropic: typeof FakeAnthropic,
): Promise<RecordedRequest[]> {
  return (await fakeAnthropic.requests()).filter(({ body }) =>
    promptText(body).includes("Write a player summary"),
  );
}

/** Kabeeble in five Matches in midfield, Trevor only in the first. */
const FIVE = [
  [{ player: KAB, pos: "midfielder" }, { player: TREV }],
  ...Array.from({ length: 4 }, () => [{ player: KAB, pos: "midfielder" }]),
];

test("a Squad Member with five Appearances gets a summary of how they play, with no AI label; one with fewer gets none", async ({
  page,
  fakeEa,
  fakeAnthropic,
  triggerPoll,
}) => {
  await playSession(fakeEa, triggerPoll, pastWeek(2), "9394800000", FIVE);
  await drainSessions(fakeAnthropic, triggerPoll);

  const requests = await summaryRequests(fakeAnthropic);
  expect(requests).toHaveLength(1);
  // The call carries their Event Stats beside a typical opponent's.
  const prompt = promptText(requests[0].body);
  expect(prompt).toContain(KAB.name);
  expect(prompt).toContain("whatTheyAdd");
  expect(prompt).toContain("typicalOpponent");

  await page.goto(`/players/${KAB.id}`);
  const summary = playerSummary(page);
  await expect(
    summary.getByRole("heading", { name: "Player summary" }),
  ).toBeVisible();
  await expect(summary).toContainText(
    /Fake paragraphs for Midfielder \(reply \d+\)\./,
  );
  await expect(summary).toContainText(
    `How ${KAB.name} plays as a midfielder, from every match on record. The filters don't change this.`,
  );
  // One position written about, so nothing to pick.
  await expect(summary.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText(AI_LABEL);

  await page.goto(`/players/${TREV.id}`);
  await expect(page.getByRole("heading", { name: TREV.name })).toBeVisible();
  await expect(playerSummary(page)).toHaveCount(0);
});

test("a Squad Member gets a summary for each position they have played five times, the main one first", async ({
  page,
  fakeEa,
  fakeAnthropic,
  triggerPoll,
}) => {
  await playSession(fakeEa, triggerPoll, pastWeek(3), "9394930000", [
    ...Array.from({ length: 6 }, () => [{ player: KAB, pos: "forward" }]),
  ]);
  await playSession(fakeEa, triggerPoll, pastWeek(2), "9394940000", [
    ...Array.from({ length: 5 }, () => [{ player: KAB, pos: "midfielder" }]),
    // Twice in defence is not enough to say how he plays there.
    ...Array.from({ length: 2 }, () => [{ player: KAB, pos: "defender" }]),
  ]);
  await drainSessions(fakeAnthropic, triggerPoll);

  // One call covers both positions.
  expect(await summaryRequests(fakeAnthropic)).toHaveLength(1);

  await page.goto(`/players/${KAB.id}`);
  const summary = playerSummary(page);
  await expect(summary.getByRole("button")).toHaveText([
    "Forward",
    "Midfielder",
  ]);
  await expect(summary).toContainText(/Fake paragraphs for Forward/);
  await summary.getByRole("button", { name: "Midfielder" }).click();
  await expect(summary).toContainText(/Fake paragraphs for Midfielder/);
  await expect(summary).toContainText(`How ${KAB.name} plays as a midfielder`);
  await expect(summary).not.toContainText(/Fake paragraphs for Forward/);
});

test("a summary is written once, and again only after a week they played in", async ({
  fakeEa,
  fakeAnthropic,
  triggerPoll,
}) => {
  const first = pastWeek(2);
  await playSession(fakeEa, triggerPoll, first, "9394900000", FIVE);
  await drainSessions(fakeAnthropic, triggerPoll);
  expect(await summaryRequests(fakeAnthropic)).toHaveLength(1);

  // More Polls with nothing new write nothing.
  await triggerPoll();
  await triggerPoll();
  expect(await summaryRequests(fakeAnthropic)).toHaveLength(1);

  // Kabeeble plays the week after: one more summary, for him alone.
  await playSession(fakeEa, triggerPoll, nextWeek(first), "9394910000", [
    [{ player: KAB, pos: "midfielder" }],
  ]);
  await drainSessions(fakeAnthropic, triggerPoll);
  expect(await summaryRequests(fakeAnthropic)).toHaveLength(2);
});

test("the coaching call carries the week's finer stats against the usual", async ({
  fakeEa,
  fakeAnthropic,
  triggerPoll,
}) => {
  const week = pastWeek(2);
  await playSession(fakeEa, triggerPoll, week, "9394920000", [
    [{ player: KAB }],
  ]);
  await drainSessions(fakeAnthropic, triggerPoll);
  await triggerPoll(afterRelease(week));

  const [request] = await coachingRequests(fakeAnthropic);
  const prompt = promptText(request.body);
  expect(prompt).toContain('"detail"');
  expect(prompt).toContain("Through balls");
  expect(prompt).toContain("thisWeek");
});

test("the Session call carries each player's finer counts for a Match", async ({
  fakeEa,
  fakeAnthropic,
  triggerPoll,
}) => {
  await playSession(fakeEa, triggerPoll, pastWeek(2), "9394950000", [
    [{ player: KAB }],
  ]);
  await drainSessions(fakeAnthropic, triggerPoll);

  const session = (await fakeAnthropic.requests()).find(({ body }) =>
    promptText(body).includes("Write about the Session"),
  );
  const prompt = promptText(session?.body ?? {});
  expect(prompt).toContain('"detail"');
  expect(prompt).toContain("shotsOnTarget");
  expect(prompt).toContain("ballWon");
});
