/**
 * CLUBS-36: Milestones are detected by the Poll from EA's career totals and
 * the recorded Matches, stored once each, backfilled on release, and
 * commented on by one call per Poll against the fake Anthropic upstream.
 */

import {
  forgetMilestones,
  KAB,
  LOL,
  type MilestoneRow,
  serveCareerTotals,
  serveMatch,
} from "./support/milestones.ts";
import { expect, test } from "./support/test.ts";
import type { AiWriteupRow } from "./support/writeups.ts";

const DAY_MINUTES = 24 * 60;

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

/** The stored Milestones as `[kind, value, matchId]`. */
async function stored(db: {
  rows<T>(table: string): Promise<T[]>;
}): Promise<[string, number, string][]> {
  const rows = await db.rows<MilestoneRow>("milestones");
  return rows.map((m) => [m.kind, m.value, m.match_id]);
}

test("career goals going from 49 to 50 make one 50th goal Milestone, on the Match where they scored", async ({
  fakeEa,
  triggerPoll,
  db,
}) => {
  await serveCareerTotals(fakeEa, {
    Kabeeble: { goals: 49, gamesPlayed: 120 },
  });
  await triggerPoll();

  const matchId = await serveMatch(fakeEa, "936100000000001", 10, [
    { player: KAB, goals: 1 },
    { player: LOL },
  ]);
  await serveCareerTotals(fakeEa, {
    Kabeeble: { goals: 50, gamesPlayed: 121 },
  });
  await triggerPoll();

  const [milestone, ...others] = await db.rows<MilestoneRow>("milestones");
  expect(others).toEqual([]);
  expect(milestone).toMatchObject({
    kind: "goals",
    subject: "player",
    player_id: KAB.id,
    value: 50,
    threshold: 50,
    match_id: matchId,
    dedupe_key: `player:${KAB.id}:goals:50`,
  });

  // A repeat Poll, changed or not, never stores it again.
  await triggerPoll();
  await serveCareerTotals(fakeEa, {
    Kabeeble: { goals: 50, gamesPlayed: 121, assists: 70 },
  });
  await triggerPoll();
  expect(await stored(db)).toEqual([["goals", 50, matchId]]);
});

test("a Poll with two new Matches pins the Milestone to the one that reached it", async ({
  fakeEa,
  triggerPoll,
  db,
}) => {
  await serveCareerTotals(fakeEa, {
    Kabeeble: { goals: 48, gamesPlayed: 120 },
  });
  await triggerPoll();

  const first = await serveMatch(fakeEa, "936200000000001", 40, [
    { player: KAB, goals: 1 },
  ]);
  const second = await serveMatch(fakeEa, "936200000000002", 15, [
    { player: KAB, goals: 1 },
  ]);
  await serveCareerTotals(fakeEa, {
    Kabeeble: { goals: 50, gamesPlayed: 122 },
  });
  await triggerPoll();

  expect(await stored(db)).toEqual([["goals", 50, second]]);
  expect(second).not.toBe(first);
});

test("a hat-trick and a new biggest Win margin are found in the Match data", async ({
  fakeEa,
  triggerPoll,
  db,
}) => {
  // Six earlier Wins by one goal, then a 6-0 with a Kabeeble hat-trick.
  for (let i = 0; i < 6; i++) {
    await serveMatch(
      fakeEa,
      `93630000000000${i}`,
      200 - i * 20,
      [{ player: KAB }],
      {
        goalsFor: 2,
        goalsAgainst: 1,
      },
    );
  }
  const big = await serveMatch(
    fakeEa,
    "936300000000009",
    30,
    [{ player: KAB, goals: 3 }],
    {
      goalsFor: 6,
      goalsAgainst: 0,
    },
  );
  await triggerPoll();

  const milestones = await db.rows<MilestoneRow>("milestones");
  expect(
    milestones
      .filter((m) => m.match_id === big)
      .map((m) => [m.kind, m.value, m.threshold])
      .sort(),
  ).toEqual([
    ["hat-trick", 3, null],
    ["record-goals", 6, 2],
    ["record-win-margin", 6, 1],
  ]);
});

test("one call writes the comments on every Milestone a Poll found", async ({
  fakeEa,
  fakeAnthropic,
  triggerPoll,
  db,
}) => {
  await serveCareerTotals(fakeEa, {
    Kabeeble: { goals: 49, gamesPlayed: 120 },
  });
  await triggerPoll();
  await serveMatch(fakeEa, "936400000000001", 10, [
    { player: KAB, goals: 3 },
    { player: LOL, rating: 9.4 },
  ]);
  await serveCareerTotals(fakeEa, {
    Kabeeble: { goals: 52, gamesPlayed: 121 },
  });
  await triggerPoll();

  const milestones = await db.rows<MilestoneRow>("milestones");
  expect(milestones.map((m) => m.kind).sort()).toEqual([
    "goals",
    "hat-trick",
    "rating",
  ]);
  expect(new Set(milestones.map((m) => m.batch_key)).size).toBe(1);

  const requests = await fakeAnthropic.requests();
  expect(requests).toHaveLength(1);
  const writeups = await db.rows<AiWriteupRow>("ai_writeups");
  expect(writeups.map((w) => [w.kind, w.subject_key]).sort()).toEqual(
    milestones.map((m) => ["milestone", String(m.id)]).sort(),
  );
  // Each Milestone goes in with its headline and Match.
  for (const headline of [
    "Kabeeble — 50th goal",
    "Kabeeble — Hat-trick",
    "Loltown95 — 9.4 rating",
  ]) {
    expect(requests[0].raw).toContain(headline);
  }
});

test("on release, the Milestones already in D1's Matches and Snapshots are backfilled once, and their comments drain over later Polls", async ({
  fakeEa,
  fakeAnthropic,
  triggerPoll,
  request,
  db,
}) => {
  // History: three Sessions a day apart. Career goals were already past 50
  // at the first Snapshot, and the Appearances reach 100 between Snapshots.
  const hatTrick = await serveMatch(
    fakeEa,
    "936500000000001",
    3 * DAY_MINUTES,
    [{ player: KAB, goals: 3 }],
  );
  const standout = await serveMatch(
    fakeEa,
    "936500000000002",
    2 * DAY_MINUTES,
    [{ player: KAB }, { player: LOL, rating: 9.5 }],
  );
  await serveCareerTotals(fakeEa, {
    Kabeeble: { goals: 52, gamesPlayed: 99 },
  });
  await triggerPoll();
  const hundredth = await serveMatch(fakeEa, "936500000000003", DAY_MINUTES, [
    { player: KAB, goals: 1 },
  ]);
  await serveCareerTotals(fakeEa, {
    Kabeeble: { goals: 53, gamesPlayed: 100 },
  });
  await triggerPoll();

  // As if Milestones had just been released.
  await forgetMilestones(request);
  const callsBefore = (await fakeAnthropic.requests()).length;
  await triggerPoll();

  const backfilled = [
    ["appearances", 100, hundredth],
    ["hat-trick", 3, hatTrick],
    ["rating", 9.5, standout],
  ];
  expect((await stored(db)).sort()).toEqual(backfilled);
  // No 50th goal: it was passed before the first Snapshot.

  // Two calls a Poll, newest Session first; the oldest waits a Poll.
  expect((await fakeAnthropic.requests()).length - callsBefore).toBe(2);
  const commented = async () =>
    (await db.rows<AiWriteupRow>("ai_writeups"))
      .filter((w) => w.kind === "milestone")
      .map((w) => w.subject_key);
  const rows = await db.rows<MilestoneRow>("milestones");
  const idOf = (matchId: string) =>
    String(rows.find((m) => m.match_id === matchId)?.id);
  expect((await commented()).sort()).toEqual(
    [idOf(hundredth), idOf(standout)].sort(),
  );

  await triggerPoll();
  expect((await stored(db)).sort()).toEqual(backfilled);
  expect(await commented()).toContain(idOf(hatTrick));
});
