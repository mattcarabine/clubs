/**
 * CLUBS-44: weekly coaching notes, written by the first Poll after Monday
 * 09:00 London for every Squad Member who played that week, in one call to
 * the fake Anthropic upstream.
 */
import { revised } from "../app/ai/config.ts";
import {
  afterRelease,
  coachingRequests,
  DAZ,
  drainSessions,
  KAB,
  nextWeek,
  pastWeek,
  playSession,
  TREV,
} from "./support/coaching.ts";
import { promptText } from "./support/fake-anthropic.ts";
import { expect, test } from "./support/test.ts";
import type { AiJobRow, AiWriteupRow } from "./support/writeups.ts";

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

async function coachingRows(db: { rows<T>(table: string): Promise<T[]> }) {
  const jobs = (await db.rows<AiJobRow>("ai_jobs")).filter(
    (j) => j.kind === "coaching",
  );
  const writeups = (await db.rows<AiWriteupRow>("ai_writeups")).filter(
    (w) => w.kind === "coaching",
  );
  return { jobs, writeups };
}

test("the first Poll after Monday 09:00 London writes notes for everyone who played that week, in one call, and a second Poll that week makes none", async ({
  fakeEa,
  fakeAnthropic,
  triggerPoll,
  db,
}) => {
  const week = pastWeek(2);
  const before = pastWeek(4);
  await playSession(fakeEa, triggerPoll, before, "9354400000", [
    [{ player: DAZ }],
  ]);
  await playSession(fakeEa, triggerPoll, week, "9354410000", [
    [{ player: KAB }, { player: TREV }],
    [{ player: KAB }],
  ]);
  await drainSessions(fakeAnthropic, triggerPoll);

  // A minute before 09:00 on the Monday after, the week is not due yet.
  await triggerPoll(afterRelease(week, -1));
  expect(await coachingRequests(fakeAnthropic)).toHaveLength(0);

  await triggerPoll(afterRelease(week));
  const requests = await coachingRequests(fakeAnthropic);
  expect(requests).toHaveLength(1);
  const prompt = promptText(requests[0].body);
  expect(prompt).toContain(`"playerId":"${KAB.id}"`);
  expect(prompt).toContain(`"playerId":"${TREV.id}"`);
  // Dazza didn't play that week.
  expect(prompt).not.toContain(DAZ.id);

  const { jobs, writeups } = await coachingRows(db);
  expect(jobs).toEqual([
    expect.objectContaining({
      subject_key: week.start,
      version: revised([KAB.id, TREV.id].join(",")),
      status: "done",
      attempts: 1,
    }),
  ]);
  expect(writeups.map((w) => w.subject_key).sort()).toEqual([KAB.id, TREV.id]);

  // Later Polls that week, and the Sunday night before the next release, make no call.
  await triggerPoll(afterRelease(week, 60));
  await triggerPoll(afterRelease(week, 6 * 24 * 60 + 14 * 60));
  expect(await coachingRequests(fakeAnthropic)).toHaveLength(1);
  expect((await coachingRows(db)).writeups).toHaveLength(2);
});

test("the request carries the week's Appearances, Recent changes, form, per-position stats, Outcome Split and all-time totals, and no raw EA payloads", async ({
  fakeEa,
  fakeAnthropic,
  triggerPoll,
}) => {
  const week = pastWeek(2);
  // Fifteen ordinary Matches in midfield, then five big ones up front.
  await playSession(
    fakeEa,
    triggerPoll,
    pastWeek(4),
    "9354500000",
    Array.from({ length: 15 }, () => [
      { player: KAB, rating: 6, pos: "midfielder" },
    ]),
  );
  await playSession(
    fakeEa,
    triggerPoll,
    week,
    "9354510000",
    Array.from({ length: 5 }, () => [
      { player: KAB, rating: 9, goals: 2, pos: "forward" },
    ]),
  );
  await drainSessions(fakeAnthropic, triggerPoll);

  await triggerPoll(afterRelease(week));
  const [request] = await coachingRequests(fakeAnthropic);
  const prompt = promptText(request.body);
  for (const text of [
    `"name":"${KAB.name}"`,
    // Recent changes (CLUBS-37), in the profile's own words.
    '"recentChanges":{"improving":[{"change":',
    `{"change":"${KAB.name}'s average rating is up 1.5 over the last 10 Appearances (7.5 vs 6.0)"`,
    // Hot form (CLUBS-40), in football words (CLUBS-48).
    '"form":"Well above their usual ratings: Last 5: 9.0 avg vs',
    // Stats by Position Group.
    '"byPositionGroup":[{"positionGroup":"Midfielder","appearances":15',
    '{"positionGroup":"Forward","appearances":5',
    '"inWinsAgainstTheRest":{"inWins":',
    '"allTime":{"appearances":20',
    '"thisWeek":{"totals":{"appearances":5,',
    '"positionGroup":"Forward","minutes":',
  ]) {
    expect(prompt).toContain(text);
  }
  for (const eaField of ["vproattr", "passattempts", "match_event_aggregate"]) {
    expect(request.raw).not.toContain(eaField);
  }
});

test("on release, only the latest completed week is backfilled", async ({
  fakeEa,
  fakeAnthropic,
  triggerPoll,
  db,
}) => {
  const latest = pastWeek(2);
  const older = pastWeek(3);
  const oldest = pastWeek(4);
  await playSession(fakeEa, triggerPoll, oldest, "9354600000", [
    [{ player: DAZ }],
  ]);
  await playSession(fakeEa, triggerPoll, older, "9354610000", [
    [{ player: TREV }],
  ]);
  await playSession(fakeEa, triggerPoll, latest, "9354620000", [
    [{ player: KAB }],
  ]);

  // The first Poll of the release, with the Session write-ups still queued.
  for (let poll = 0; poll < 4; poll++) {
    await triggerPoll(afterRelease(latest));
  }

  const requests = await coachingRequests(fakeAnthropic);
  expect(requests).toHaveLength(1);
  const prompt = promptText(requests[0].body);
  expect(prompt).toContain(`"playerId":"${KAB.id}"`);
  expect(prompt).not.toContain(TREV.id);
  expect(prompt).not.toContain(DAZ.id);
  const { jobs, writeups } = await coachingRows(db);
  expect(jobs.map((j) => j.subject_key)).toEqual([latest.start]);
  expect(writeups.map((w) => w.subject_key)).toEqual([KAB.id]);
});

test("a failed call is retried on the next Poll", async ({
  fakeEa,
  fakeAnthropic,
  triggerPoll,
  db,
}) => {
  const week = pastWeek(2);
  await playSession(fakeEa, triggerPoll, week, "9354700000", [
    [{ player: KAB }],
  ]);
  await drainSessions(fakeAnthropic, triggerPoll);

  await fakeAnthropic.failNext(500);
  await triggerPoll(afterRelease(week));
  expect((await coachingRows(db)).writeups).toHaveLength(0);

  await triggerPoll(afterRelease(week, 10));
  expect(await coachingRequests(fakeAnthropic)).toHaveLength(2);
  const { jobs, writeups } = await coachingRows(db);
  expect(jobs).toEqual([
    expect.objectContaining({ status: "done", attempts: 2 }),
  ]);
  expect(writeups.map((w) => w.subject_key)).toEqual([KAB.id]);
  // The next week's release has nobody to coach.
  await triggerPoll(afterRelease(nextWeek(week)));
  expect(await coachingRequests(fakeAnthropic)).toHaveLength(2);
});
