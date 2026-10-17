/**
 * CLUBS-28: the Poll records both clubs' Skill Ratings on each Match: at the
 * time for new Matches, and backfilled for Matches recorded before.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  BACKFILL_OPPONENTS_PER_POLL,
  RATING_WINDOW_MS,
} from "../app/poll/rating-targets.ts";
import type { RecordedRequest } from "./fake-ea/control.ts";
import {
  FIXTURES_DIR,
  OUR_CLUB_ID,
  recordedLeagueMatches,
  win,
} from "./support/match-builders.ts";
import { against } from "./support/opponent.ts";
import { expect, test } from "./support/test.ts";

interface MatchRow {
  match_id: string;
  opponent_club_id: string;
  our_skill_rating: number | null;
  opponent_skill_rating: number | null;
}

interface RawPayloadRow {
  endpoint: string;
  variant: string;
  body: string;
}

interface PollRunRow {
  status: string;
}

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(FIXTURES_DIR, name), "utf8"));

/** Our Club's Skill Rating in the recorded `clubs/overallStats`. */
const OUR_RATING = 1632;

/** Each recorded Opponent's Skill Rating, by club ID. */
const OPPONENT_RATINGS = new Map<string, number>(
  fixture("clubs-overallStats-opponents.json").map(
    (club: { clubId: string; skillRating: string }) => [
      club.clubId,
      Number(club.skillRating),
    ],
  ),
);

/** The builders' Opponent (from the recorded fixture) and a second one. */
const CLUB_X = "356611";
const CLUB_Y = { clubId: "377180", name: "Recorded Rival" };

/** The Opponents named by each Opponents' overallStats request, in order. */
function opponentRequests(requests: RecordedRequest[]): string[][] {
  return requests
    .filter((r) => r.endpoint === "clubs/overallStats")
    .map((r) => r.params.clubIds ?? [])
    .filter((ids) => !ids.includes(OUR_CLUB_ID));
}

test.describe("new Matches", () => {
  test.beforeEach(async ({ fakeEa }) => {
    // Only the Matches each test adds, so no backfill gets in the way.
    await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
  });

  test("a Poll that records a new Match stores the Opponent's overallStats and saves both ratings", async ({
    fakeEa,
    triggerPoll,
    db,
  }) => {
    await fakeEa.addMatch(win({ matchId: "28001" }));
    await triggerPoll();

    expect(opponentRequests(await fakeEa.requests())).toEqual([[CLUB_X]]);
    const [payload] = (await db.rows<RawPayloadRow>("raw_payloads")).filter(
      (row) => row.variant === "opponents",
    );
    expect(payload.endpoint).toBe("clubs/overallStats");
    expect(JSON.parse(payload.body)).toEqual([
      expect.objectContaining({ clubId: CLUB_X, skillRating: "1420" }),
    ]);
    expect(await db.rows<MatchRow>("matches")).toEqual([
      expect.objectContaining({
        match_id: "28001",
        our_skill_rating: OUR_RATING,
        opponent_skill_rating: 1420,
      }),
    ]);
  });

  test("several new Matches are rated with one request naming each Opponent once, and never refetched", async ({
    fakeEa,
    triggerPoll,
    db,
  }) => {
    await fakeEa.addMatch(win({ matchId: "28001" }));
    await fakeEa.addMatch(win({ matchId: "28002" }));
    await fakeEa.addMatch(against(CLUB_Y, win({ matchId: "28003" })));
    await triggerPoll();

    const [request, ...others] = opponentRequests(await fakeEa.requests());
    expect(others).toEqual([]);
    expect([...request].sort()).toEqual([CLUB_X, CLUB_Y.clubId].sort());

    const ratings = Object.fromEntries(
      (await db.rows<MatchRow>("matches")).map((m) => [
        m.match_id,
        m.opponent_skill_rating,
      ]),
    );
    expect(ratings).toEqual({
      "28001": 1420,
      "28002": 1420,
      "28003": OPPONENT_RATINGS.get(CLUB_Y.clubId),
    });

    await triggerPoll();
    expect(opponentRequests(await fakeEa.requests())).toHaveLength(1);
  });

  for (const failure of ["403", "timeout"] as const) {
    test(`an overallStats ${failure} leaves the rating empty without failing the Poll, and the next Poll fills it`, async ({
      fakeEa,
      triggerPoll,
      db,
    }) => {
      const target = {
        endpoint: "clubs/overallStats" as const,
        clubId: CLUB_X,
      };
      if (failure === "403") await fakeEa.failNext(403, 1, target);
      else await fakeEa.timeoutNext(1, target);
      await fakeEa.addMatch(win({ matchId: "28001" }));
      await triggerPoll();

      expect(await db.rows<PollRunRow>("poll_runs")).toEqual([
        expect.objectContaining({ status: "partial" }),
      ]);
      expect(await db.rows<MatchRow>("matches")).toEqual([
        expect.objectContaining({
          match_id: "28001",
          our_skill_rating: OUR_RATING,
          opponent_skill_rating: null,
        }),
      ]);

      await triggerPoll();
      expect(opponentRequests(await fakeEa.requests())).toEqual([
        [CLUB_X],
        [CLUB_X],
      ]);
      expect(await db.rows<MatchRow>("matches")).toEqual([
        expect.objectContaining({ opponent_skill_rating: 1420 }),
      ]);
    });
  }

  test("a failed rating is not retried more than an hour after the Match", async ({
    fakeEa,
    triggerPoll,
    db,
  }) => {
    // Played so that the window closes a few seconds after the first Poll.
    const windowEnds = Date.now() + 5_000;
    const match = win({ matchId: "28001" });
    match.match.timestamp = Math.floor((windowEnds - RATING_WINDOW_MS) / 1000);
    await fakeEa.addMatch(match);
    await fakeEa.failNext(403, 1, {
      endpoint: "clubs/overallStats",
      clubId: CLUB_X,
    });
    await triggerPoll();
    expect(opponentRequests(await fakeEa.requests())).toEqual([[CLUB_X]]);

    await new Promise((resolve) =>
      setTimeout(resolve, windowEnds + 1_000 - Date.now()),
    );
    await triggerPoll();
    expect(opponentRequests(await fakeEa.requests())).toEqual([[CLUB_X]]);
    expect(await db.rows<MatchRow>("matches")).toEqual([
      expect.objectContaining({
        our_skill_rating: OUR_RATING,
        opponent_skill_rating: null,
      }),
    ]);
  });
});

test("Matches recorded before ratings are backfilled a few Opponents per Poll, with the Opponent's current rating and our earliest Snapshot", async ({
  fakeEa,
  triggerPoll,
  db,
}) => {
  // The recorded Matches all predate the first Poll, so none is rated live.
  await triggerPoll();
  expect(opponentRequests(await fakeEa.requests())).toEqual([]);

  // Our rating has moved since: the backfill still uses the Snapshot nearest
  // each Match, which for Matches before the first Poll is the earliest.
  const [ours] = fixture("clubs-overallStats.json");
  await fakeEa.setPayload("clubs/overallStats", [
    { ...ours, skillRating: "1700" },
  ]);

  const opponents = new Set(
    recordedLeagueMatches().map(
      (m) => Object.keys(m.clubs).find((id) => id !== OUR_CLUB_ID) ?? "",
    ),
  );
  const polls = Math.ceil(opponents.size / BACKFILL_OPPONENTS_PER_POLL);
  for (let i = 0; i < polls + 1; i++) await triggerPoll();

  const requests = opponentRequests(await fakeEa.requests());
  expect(requests).toHaveLength(polls);
  for (const ids of requests) {
    expect(ids.length).toBeLessThanOrEqual(BACKFILL_OPPONENTS_PER_POLL);
  }
  expect(new Set(requests.flat())).toEqual(opponents);

  const rated = await db.rows<MatchRow>("matches");
  for (const match of rated) {
    expect(match).toMatchObject({
      our_skill_rating: OUR_RATING,
      opponent_skill_rating: OPPONENT_RATINGS.get(match.opponent_club_id),
    });
  }

  // Idempotent: nothing left to backfill, so nothing is asked or changed.
  await triggerPoll();
  expect(opponentRequests(await fakeEa.requests())).toHaveLength(polls);
  expect(await db.rows<MatchRow>("matches")).toEqual(rated);
});
