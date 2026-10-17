/**
 * CLUBS-4: a Poll turns EA's responses into Matches, Appearances, clubs,
 * players and Snapshots, idempotently.
 */
import {
  dnf,
  friendly,
  OUR_CLUB_ID,
  recordedLeagueMatches,
  win,
} from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

interface MatchRow {
  match_id: string;
  match_type: string;
  opponent_club_id: string;
  goals_for: number;
  goals_against: number;
  result: string;
  dnf: number;
  raw_payload_id: number;
  ingested_at: number;
}

interface AppearanceRow {
  match_id: string;
  player_id: string;
  club_id: string;
  position_group: string | null;
}

interface SnapshotRow {
  raw_payload_id: number;
  source: string;
  subject: string;
  subject_key: string;
  player_id: string | null;
  stats: string;
}

interface PollRunRow {
  status: string;
  matches_added: number;
  snapshots_added: number;
}

test("polling the recorded league Matches twice stores each Match once, with Appearances for both clubs", async ({
  triggerPoll,
  db,
}) => {
  await triggerPoll();
  await triggerPoll();

  const matches = await db.rows<MatchRow>("matches");
  const recorded = recordedLeagueMatches();
  expect(matches.map((m) => m.match_id).sort()).toEqual(
    recorded.map((m) => m.matchId).sort(),
  );

  const appearances = await db.rows<AppearanceRow>("appearances");
  for (const match of recorded) {
    const expected = Object.entries(match.players).flatMap(
      ([clubId, players]) =>
        Object.keys(players).map((playerId) => `${clubId}/${playerId}`),
    );
    const stored = appearances
      .filter((a) => a.match_id === match.matchId)
      .map((a) => `${a.club_id}/${a.player_id}`);
    expect(stored.sort()).toEqual(expected.sort());
    expect(new Set(stored.map((s) => s.split("/")[0])).size).toBe(2);
  }

  const runs = await db.rows<PollRunRow>("poll_runs");
  expect(runs.map((r) => [r.status, r.matches_added])).toEqual([
    ["ok", 10],
    ["ok", 0],
  ]);

  const clubs = await db.rows<{ club_id: string; name: string }>("clubs");
  expect(clubs).toContainEqual({ club_id: OUR_CLUB_ID, name: "A Bloo Bloo" });
  expect(clubs).toHaveLength(11);
});

test("a new Match is stored and the older ones are not touched", async ({
  triggerPoll,
  fakeEa,
  db,
}) => {
  await triggerPoll();
  const before = await db.rows<MatchRow>("matches");

  const added = win({ goalsFor: 5, goalsAgainst: 0 });
  await fakeEa.addMatch(added);
  await triggerPoll();

  const after = await db.rows<MatchRow>("matches");
  expect(after).toHaveLength(11);
  expect(after.slice(0, 10)).toEqual(before);
  expect(after[10]).toMatchObject({
    match_id: added.match.matchId,
    match_type: "league",
    goals_for: 5,
    goals_against: 0,
    result: "win",
    dnf: 0,
  });

  const appearances = await db.rows<AppearanceRow>("appearances");
  expect(
    appearances.filter((a) => a.match_id === added.match.matchId),
  ).toHaveLength(7);
  const runs = await db.rows<PollRunRow>("poll_runs");
  expect(runs.map((r) => r.matches_added)).toEqual([10, 1]);
});

test("Friendly and DNF results are derived correctly", async ({
  triggerPoll,
  fakeEa,
  db,
}) => {
  const friendlyDraw = friendly({ goalsFor: 3, goalsAgainst: 3 });
  const friendlyLoss = friendly({ goalsFor: 0, goalsAgainst: 2 });
  const dnfLoss = dnf({ ourWin: false });
  for (const match of [friendlyDraw, friendlyLoss, dnfLoss]) {
    await fakeEa.addMatch(match);
  }
  await triggerPoll();

  const byId = new Map(
    (await db.rows<MatchRow>("matches")).map((m) => [m.match_id, m]),
  );
  expect(byId.get(friendlyDraw.match.matchId)).toMatchObject({
    match_type: "friendly",
    result: "draw",
    dnf: 0,
  });
  expect(byId.get(friendlyLoss.match.matchId)).toMatchObject({
    match_type: "friendly",
    result: "loss",
  });
  expect(byId.get(dnfLoss.match.matchId)).toMatchObject({
    match_type: "league",
    result: "loss",
    dnf: 1,
  });
});

test("unchanged member stats write no Snapshot; changed stats write one", async ({
  triggerPoll,
  fakeEa,
  db,
}) => {
  await triggerPoll();
  const first = await db.rows<SnapshotRow>("snapshots");
  // 5 members in each of members/stats and members/career/stats, plus Our
  // Club in clubs/overallStats and the leaderboard.
  expect(first).toHaveLength(12);
  const kabeeble = first.find(
    (s) => s.source === "members/stats" && s.subject_key === "Kabeeble",
  );
  expect(kabeeble?.player_id).toBe("256171605");
  expect(JSON.parse(kabeeble?.stats ?? "{}")).toMatchObject({ goals: 98 });

  await triggerPoll();
  expect(await db.rows<SnapshotRow>("snapshots")).toHaveLength(12);

  const raw = await db.rows<{ endpoint: string; body: string }>("raw_payloads");
  const memberStats = JSON.parse(
    raw.find((r) => r.endpoint === "members/stats")?.body ?? "{}",
  );
  memberStats.members[0].goals = "99";
  await fakeEa.setPayload("members/stats", memberStats);
  await triggerPoll();

  const after = await db.rows<SnapshotRow>("snapshots");
  const added = after.slice(first.length);
  // One new Snapshot: a single payload's worth of rows, all members/stats.
  expect(new Set(added.map((s) => s.raw_payload_id)).size).toBe(1);
  expect(added.map((s) => s.source)).toEqual(Array(5).fill("members/stats"));
  expect(JSON.parse(added[0].stats)).toMatchObject({ goals: 99 });

  const runs = await db.rows<PollRunRow>("poll_runs");
  expect(runs.map((r) => r.snapshots_added)).toEqual([12, 0, 5]);
});

test("a 403 or a timeout is recorded in poll_runs, and the next Poll catches up", async ({
  triggerPoll,
  fakeEa,
  db,
  request,
}) => {
  await fakeEa.failNext(403);
  await triggerPoll();
  await fakeEa.timeoutNext();
  await triggerPoll();

  const runs = await db.rows<PollRunRow & { errors: string }>("poll_runs");
  expect(runs.map((r) => r.status)).toEqual(["failed", "failed"]);
  expect(runs.map((r) => JSON.parse(r.errors)[0].kind)).toEqual([
    "blocked",
    "timeout",
  ]);
  expect(await db.rows("matches")).toHaveLength(0);
  expect((await request.get("/")).ok()).toBe(true);

  await triggerPoll();
  expect(await db.rows("matches")).toHaveLength(10);
});
