/**
 * CLUBS-63: Streaks (the club's runs of results, each Squad Member's own best
 * runs) and the biggest defeat. A Rage Quit counts by its result in a
 * Streak, but sets no scoreline record, since EA awards or cuts short its
 * score.
 */

import type { AddMatchBody } from "./fake-ea/control.ts";
import type { fakeEa as FakeEa } from "./support/fake-ea.ts";
import { dnf, draw, loss, win } from "./support/match-builders.ts";
import {
  KAB,
  LOL,
  type MilestoneRow,
  serveMatch,
} from "./support/milestones.ts";
import { expect, test } from "./support/test.ts";

const DAY_MS = 24 * 60 * 60_000;
const DAY_MINUTES = 24 * 60;

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

const matchId = (i: number) => `9380000000000${String(i).padStart(2, "0")}`;

type Build = (options: { matchId: string; playedAt: Date }) => AddMatchBody;

/**
 * Plays Matches a day apart (one Session each), oldest first, as
 * `matchId(0)`, `matchId(1)`, ..., Polling after each group: EA lists only
 * the latest few Matches, so a long history needs several Polls.
 */
async function playDaily(
  fakeEa: typeof FakeEa,
  triggerPoll: () => Promise<unknown>,
  groups: Build[][],
): Promise<void> {
  const builds = groups.flat();
  const start = Date.now() - builds.length * DAY_MS;
  let i = 0;
  for (const group of groups) {
    for (const build of group) {
      await fakeEa.addMatch(
        build({ matchId: matchId(i), playedAt: new Date(start + i * DAY_MS) }),
      );
      i++;
    }
    await triggerPoll();
  }
}

test("the club's Streaks and biggest defeat count a Rage Quit by result, but never its score", async ({
  fakeEa,
  triggerPoll,
  db,
}) => {
  await playDaily(fakeEa, triggerPoll, [
    [
      // Five Matches before records count: Win runs of 2, a 1-goal defeat.
      (o) => win({ ...o, goalsFor: 2, goalsAgainst: 1 }),
      (o) => win({ ...o, goalsFor: 2, goalsAgainst: 1 }),
      (o) => loss({ ...o, goalsFor: 1, goalsAgainst: 2 }),
      (o) => win({ ...o, goalsFor: 2, goalsAgainst: 1 }),
      (o) => win({ ...o, goalsFor: 2, goalsAgainst: 1 }),
      // 5: unbeaten in 3, a record.
      (o) => draw({ ...o, goalsFor: 1, goalsAgainst: 1 }),
    ],
    [
      // 6: winless in 2, a record, and a record 2-goal defeat.
      (o) => loss({ ...o, goalsFor: 0, goalsAgainst: 2 }),
      // 7: we rage quit 0-3: winless in 3, but no record defeat by 3.
      (o) => dnf({ ...o, ourWin: false }),
      // 8: they rage quit 3-0: a Win that starts a run, but no record goals.
      (o) => dnf({ ...o, ourWin: true }),
      (o) => win({ ...o, goalsFor: 2, goalsAgainst: 1 }),
      // 10: a record 3 Wins in a row, counting the Rage Quit.
      (o) => win({ ...o, goalsFor: 2, goalsAgainst: 1 }),
    ],
  ]);

  const club = (await db.rows<MilestoneRow>("milestones"))
    .filter((m) => m.subject === "club")
    .map((m) => [m.kind, m.value, m.threshold, m.match_id]);
  expect(club).toEqual(
    expect.arrayContaining([
      ["record-unbeaten-run", 3, 2, matchId(5)],
      ["record-winless-run", 2, 1, matchId(6)],
      ["record-defeat-margin", 2, 1, matchId(6)],
      ["record-win-run", 3, 2, matchId(10)],
    ]),
  );
  expect(club).toHaveLength(4);
  const winRun = (await db.rows<MilestoneRow>("milestones")).find(
    (m) => m.kind === "record-win-run",
  );
  expect(winRun?.dedupe_key).toBe(`club:record-win-run:${matchId(8)}`);
});

test("a Squad Member's scoring run skips a 0-minute Appearance, and a Man of the Match run needs two", async ({
  fakeEa,
  triggerPoll,
  db,
}) => {
  const ids = [
    "938100000000001",
    "938100000000002",
    "938100000000003",
    "938100000000004",
  ];
  await serveMatch(fakeEa, ids[0], 3 * DAY_MINUTES, [
    { player: KAB, goals: 1 },
    { player: LOL, motm: true },
  ]);
  await serveMatch(fakeEa, ids[1], 2 * DAY_MINUTES, [
    { player: KAB, goals: 1 },
    { player: LOL, motm: true },
  ]);
  // Kabeeble dropped out: 0 minutes neither extends nor ends the run.
  await serveMatch(fakeEa, ids[2], DAY_MINUTES, [
    { player: KAB, rating: 3, stats: { secondsPlayed: "0" } },
    { player: LOL },
  ]);
  await serveMatch(fakeEa, ids[3], 20, [
    { player: KAB, goals: 1 },
    { player: LOL },
  ]);
  await triggerPoll();

  const streaks = (await db.rows<MilestoneRow>("milestones"))
    .filter((m) => m.kind.endsWith("-run") && m.subject === "player")
    .map((m) => [m.kind, m.player_id, m.value, m.match_id, m.dedupe_key]);
  expect(streaks).toEqual(
    expect.arrayContaining([
      [
        "scoring-run",
        KAB.id,
        3,
        ids[3],
        `player:${KAB.id}:scoring-run:${ids[0]}`,
      ],
      ["motm-run", LOL.id, 2, ids[1], `player:${LOL.id}:motm-run:${ids[0]}`],
    ]),
  );
  expect(streaks).toHaveLength(2);

  // Rerunning stores nothing twice.
  await triggerPoll();
  expect(
    (await db.rows<MilestoneRow>("milestones")).filter(
      (m) => m.kind.endsWith("-run") && m.subject === "player",
    ),
  ).toHaveLength(2);
});
