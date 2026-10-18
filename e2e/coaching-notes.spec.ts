// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import { formatLondonDate } from "../app/lib/london-time.ts";
import {
  afterRelease,
  DAZ,
  drainSessions,
  fakeNote,
  KAB,
  nextWeek,
  pastWeek,
  playSession,
  TREV,
} from "./support/coaching.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-44: each Squad Member's weekly coaching notes on their profile.

/** Anything that would label the copy as machine-written. */
const AI_LABEL = /claude|anthropic|\bAI\b|written by|generated/i;

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

function coachingNotes(page: Page) {
  return page.getByRole("region", { name: "Coaching notes" });
}

function weekOf(week: { from: Date }): string {
  return `Week of ${formatLondonDate(week.from)}`;
}

test("everyone who played gets notes signed by The Gaff, with no AI label; anyone who didn't play gets none", async ({
  page,
  fakeEa,
  fakeAnthropic,
  triggerPoll,
}) => {
  const week = pastWeek(2);
  await playSession(fakeEa, triggerPoll, pastWeek(4), "9354800000", [
    [{ player: DAZ }],
  ]);
  await playSession(fakeEa, triggerPoll, week, "9354810000", [
    [{ player: KAB }, { player: TREV }],
  ]);
  await drainSessions(fakeAnthropic, triggerPoll);
  await triggerPoll(afterRelease(week));

  for (const player of [KAB, TREV]) {
    await page.goto(`/players/${player.id}`);
    const notes = coachingNotes(page);
    await expect(
      notes.getByRole("heading", { name: "Coaching notes" }),
    ).toBeVisible();
    await expect(notes).toContainText(weekOf(week));
    await expect(notes.getByRole("listitem")).toHaveText([fakeNote(player.id)]);
    await expect(notes).toContainText("— The Gaff");
    await expect(page.getByRole("main")).not.toContainText(AI_LABEL);
    // Only one week so far, so no history.
    await expect(notes.getByText(/Earlier weeks/)).toHaveCount(0);
  }

  await page.goto(`/players/${DAZ.id}`);
  await expect(page.getByRole("heading", { name: DAZ.name })).toBeVisible();
  await expect(coachingNotes(page)).toHaveCount(0);
});

test("an AI failure leaves last week's notes showing, the next Poll writes this week's, and earlier weeks move into the history", async ({
  page,
  fakeEa,
  fakeAnthropic,
  triggerPoll,
}) => {
  const first = pastWeek(3);
  const second = nextWeek(first);
  await playSession(fakeEa, triggerPoll, first, "9354900000", [
    [{ player: KAB }],
  ]);
  await playSession(fakeEa, triggerPoll, second, "9354910000", [
    [{ player: KAB }],
  ]);
  await drainSessions(fakeAnthropic, triggerPoll);
  await triggerPoll(afterRelease(first));

  await fakeAnthropic.failNext(500);
  await triggerPoll(afterRelease(second));

  await page.goto(`/players/${KAB.id}`);
  const notes = coachingNotes(page);
  await expect(notes).toContainText(weekOf(first));
  await expect(notes.getByRole("listitem")).toHaveText([fakeNote(KAB.id)]);
  await expect(notes).not.toContainText(weekOf(second));

  // Retried on the next Poll.
  await triggerPoll(afterRelease(second, 5));
  await page.reload();
  await expect(notes).toContainText(weekOf(second));
  await expect(notes.getByRole("article").first()).toContainText("— The Gaff");

  const history = notes.locator("details");
  await expect(history.locator("summary")).toHaveText("Earlier weeks (1)");
  await expect(history.getByText(weekOf(first))).toBeHidden();
  await history.locator("summary").click();
  await expect(history.getByText(weekOf(first))).toBeVisible();
  await expect(history.getByRole("article")).toContainText("— The Gaff");
  await expect(page.getByRole("main")).not.toContainText(AI_LABEL);
});

test.describe("on a 375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the notes and their history fit with no horizontal scroll", async ({
    page,
    fakeEa,
    fakeAnthropic,
    triggerPoll,
  }) => {
    const first = pastWeek(3);
    const second = nextWeek(first);
    await playSession(fakeEa, triggerPoll, first, "9355000000", [
      [{ player: KAB }],
    ]);
    await playSession(fakeEa, triggerPoll, second, "9355010000", [
      [{ player: KAB }],
    ]);
    await drainSessions(fakeAnthropic, triggerPoll);
    await fakeAnthropic.reply({
      notes: [
        {
          playerId: KAB.id,
          points: [
            "Kabeeble's conversion fell to 18% while his shots per 90 rose to 4.20; the chances are there.",
            "Supercalifragilisticexpialidocious-length-words-should-wrap-without-pushing-the-page-sideways.",
          ],
        },
      ],
    });
    await triggerPoll(afterRelease(first));
    await triggerPoll(afterRelease(second));

    await page.goto(`/players/${KAB.id}`);
    const notes = coachingNotes(page);
    await notes.locator("summary").click();
    await expect(notes.getByText(weekOf(first))).toBeVisible();
    await notes.scrollIntoViewIfNeeded();
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits).toBe(true);
  });
});
