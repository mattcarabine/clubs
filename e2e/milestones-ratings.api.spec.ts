/**
 * CLUBS-52: the only rating feat is a Perfect rating (10.0), counted as a
 * landmark from the recorded Appearances; dropped kinds never show, and a
 * kind with nothing stored yet backfills from older Matches.
 */

import {
  forgetMilestones,
  KAB,
  LOL,
  type MilestoneRow,
  renameMilestones,
  serveMatch,
} from "./support/milestones.ts";
import { expect, test } from "./support/test.ts";

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

/**
 * The stored Squad Member Milestones as `[kind, value, matchId]`, sorted;
 * a run of Wins also sets club records, which these tests don't look at.
 */
async function stored(db: {
  rows<T>(table: string): Promise<T[]>;
}): Promise<[string, number, string][]> {
  const rows = await db.rows<MilestoneRow>("milestones");
  return rows
    .filter((m) => m.subject === "player")
    .map((m): [string, number, string] => [m.kind, m.value, m.match_id])
    .sort();
}

test("a 10.0 is a Perfect rating, while a 9.5 or a personal best below 10.0 is no Milestone", async ({
  fakeEa,
  triggerPoll,
  db,
}) => {
  // Five 7.0s for Kabeeble, then an 8.5 (a personal best) and a 9.5.
  for (let i = 0; i < 7; i++) {
    await serveMatch(fakeEa, `93690000000000${i}`, 200 - i * 20, [
      { player: KAB, rating: [7, 7, 7, 7, 7, 8.5, 9.5][i] },
      { player: LOL, rating: i === 6 ? 10 : 7 },
    ]);
  }
  await triggerPoll();

  expect(await stored(db)).toEqual([["perfect-rating", 10, "936900000000006"]]);
});

test("a Squad Member's 3rd Perfect rating is also a 3rd Perfect rating landmark", async ({
  fakeEa,
  triggerPoll,
  db,
}) => {
  const matchIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    matchIds.push(
      await serveMatch(fakeEa, `93691000000000${i}`, 100 - i * 20, [
        { player: KAB, rating: 10 },
        { player: LOL },
      ]),
    );
  }
  await triggerPoll();

  expect(await stored(db)).toEqual(
    [
      ...matchIds.map((id): [string, number, string] => [
        "perfect-rating",
        10,
        id,
      ]),
      ["perfect-ratings", 3, matchIds[2]] as [string, number, string],
    ].sort(),
  );
  const [landmark] = (await db.rows<MilestoneRow>("milestones")).filter(
    (m) => m.kind === "perfect-ratings",
  );
  expect(landmark).toMatchObject({ player_id: KAB.id, threshold: 3 });
});

test("stored Milestones of a kind no longer detected never show", async ({
  fakeEa,
  triggerPoll,
  request,
}) => {
  await serveMatch(fakeEa, "936920000000001", 60, [
    { player: KAB, goals: 3 },
    { player: LOL, rating: 10 },
  ]);
  await triggerPoll();
  // As if this Perfect rating were a dropped "rating" feat.
  await renameMilestones(request, "perfect-rating", "rating");

  const page = await (await request.get("/milestones")).text();
  expect(page).toContain("Kabeeble — Hat-trick");
  expect(page).not.toContain("Loltown95 — ");
});

test("a kind with nothing stored yet backfills from Matches older than the Poll's usual window", async ({
  fakeEa,
  triggerPoll,
  request,
  db,
}) => {
  // A Perfect rating, then more Matches than a Poll looks back over, polled
  // as they come in, since EA returns only the latest few.
  const perfect = await serveMatch(fakeEa, "936930000000100", 2000, [
    { player: KAB, rating: 10 },
  ]);
  for (let i = 0; i < 31; i++) {
    await serveMatch(
      fakeEa,
      `9369300000000${String(i).padStart(2, "0")}`,
      1000 - i * 20,
      [{ player: KAB, goals: i === 0 ? 3 : 0 }],
    );
    if (i % 5 === 4 || i === 30) await triggerPoll();
  }
  // As if Perfect ratings were added after the hat-trick was stored.
  await forgetMilestones(request, "perfect-rating");
  expect(await stored(db)).toEqual([["hat-trick", 3, "936930000000000"]]);

  await serveMatch(fakeEa, "936930000000099", 5, [{ player: KAB }]);
  await triggerPoll();

  expect(await stored(db)).toEqual([
    ["hat-trick", 3, "936930000000000"],
    ["perfect-rating", 10, perfect],
  ]);
});
