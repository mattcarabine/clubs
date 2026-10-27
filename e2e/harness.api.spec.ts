/**
 * CLUBS-3: the E2E harness itself. The Worker polls the fake EA upstream
 * (never live EA), records each Poll, and survives EA failures.
 */
import { EA_BROWSER_HEADERS } from "../app/ea/client.ts";
import { OPPONENT_RATINGS_VARIANT } from "../app/ea/endpoints.ts";
import { win } from "./support/match-builders.ts";
import {
  E2E_INSTANCE,
  FAKE_ANTHROPIC_URL,
  FAKE_EA_BASE_URL,
  FAKE_EA_URL,
} from "./support/ports.ts";
import { expect, test } from "./support/test.ts";

interface PollRunRow {
  status: string;
  requests: number;
  failures: number;
  payloads_stored: number;
  errors: string | null;
}

interface RawPayloadRow {
  endpoint: string;
  variant: string;
  body: string;
}

test("a Poll against the recorded league matches stores them and the pages render", async ({
  triggerPoll,
  db,
  page,
}) => {
  await triggerPoll();

  const [run] = await db.rows<PollRunRow>("poll_runs");
  expect(run).toMatchObject({ status: "ok", failures: 0, requests: 7 });

  const payloads = await db.rows<RawPayloadRow>("raw_payloads");
  const league = payloads.find((p) => p.variant === "leagueMatch");
  expect(JSON.parse(league?.body ?? "[]")).toHaveLength(10);

  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Matches" }),
  ).toBeVisible();
});

test("the Worker only talks to the fake EA upstream, with the Chrome header set", async ({
  triggerPoll,
  fakeEa,
}) => {
  await triggerPoll();

  const requests = await fakeEa.requests();
  expect(requests.map((r) => r.endpoint)).toEqual([
    "clubs/matches",
    "clubs/matches",
    "clubs/matches",
    "members/stats",
    "members/career/stats",
    "clubs/overallStats",
    "currentSeasonLeaderboard/search",
  ]);
  for (const request of requests) {
    expect(request.headers["user-agent"]).toBe(
      EA_BROWSER_HEADERS["User-Agent"],
    );
    expect(request.headers.origin).toBe("https://www.ea.com");
    expect(request.headers["sec-fetch-site"]).toBe("same-site");
  }
  expect(requests[0].query).toMatchObject({
    platform: "common-gen5",
    clubIds: "332191",
    matchType: "leagueMatch",
    maxResultCount: "10",
  });
  expect(requests[6].query.clubName).toBe("A Bloo Bloo");
});

test("an unchanged EA response is not stored twice; a changed one is", async ({
  triggerPoll,
  fakeEa,
  db,
}) => {
  // Opponents' ratings (CLUBS-28) are asked for afresh each time, and the
  // backfill of the recorded Matches adds one such payload per later Poll.
  const pollPayloads = async () =>
    (await db.rows<RawPayloadRow>("raw_payloads")).filter(
      (row) => row.variant !== OPPONENT_RATINGS_VARIANT,
    );

  await triggerPoll();
  expect(await pollPayloads()).toHaveLength(7);

  await triggerPoll();
  expect(await pollPayloads()).toHaveLength(7);

  const newMatch = win();
  await fakeEa.addMatch(newMatch);
  await triggerPoll();

  const stored = await pollPayloads();
  expect(stored).toHaveLength(8);
  expect(stored[7]).toMatchObject({
    endpoint: "clubs/matches",
    variant: "leagueMatch",
  });
  expect(JSON.parse(stored[7].body)[0].matchId).toBe(newMatch.match.matchId);
  const runs = await db.rows<PollRunRow>("poll_runs");
  expect(runs.map((r) => r.payloads_stored)).toEqual([7, 1, 2]);
});

test("an EA 403 is recorded as a failed Poll and nothing crashes", async ({
  triggerPoll,
  fakeEa,
  db,
  page,
}) => {
  await fakeEa.failNext(403);
  await triggerPoll();

  const [run] = await db.rows<PollRunRow>("poll_runs");
  // The Poll stops at the block rather than spending more subrequests.
  expect(run).toMatchObject({ status: "failed", requests: 1, failures: 1 });
  expect(JSON.parse(run.errors ?? "[]")).toEqual([
    expect.objectContaining({ kind: "blocked", status: 403 }),
  ]);
  expect(await db.rows("raw_payloads")).toHaveLength(0);

  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Matches" }),
  ).toBeVisible();

  // The next Poll recovers.
  await triggerPoll();
  const runs = await db.rows<PollRunRow>("poll_runs");
  expect(runs.map((r) => r.status)).toEqual(["failed", "ok"]);
});

test("an EA timeout is recorded as a failed Poll", async ({
  triggerPoll,
  fakeEa,
  db,
}) => {
  await fakeEa.timeoutNext();
  await triggerPoll();

  const [run] = await db.rows<PollRunRow>("poll_runs");
  expect(run).toMatchObject({ status: "failed", requests: 1, failures: 1 });
  expect(JSON.parse(run.errors ?? "[]")).toEqual([
    expect.objectContaining({ kind: "timeout", status: null }),
  ]);
});

test("a failure on one endpoint is a partial Poll that still stores the rest", async ({
  triggerPoll,
  fakeEa,
  db,
}) => {
  await fakeEa.failNext(500);
  await triggerPoll();

  const [run] = await db.rows<PollRunRow>("poll_runs");
  expect(run).toMatchObject({ status: "partial", requests: 7, failures: 1 });
  expect(await db.rows("raw_payloads")).toHaveLength(6);
});

test("each server's health check accepts only this checkout's run (CLUBS-18)", async ({
  request,
}) => {
  const workerHealth = (ea: string, anthropic = FAKE_ANTHROPIC_URL) =>
    request.get(
      `/__test/health?ea=${encodeURIComponent(ea)}&anthropic=${encodeURIComponent(anthropic)}`,
    );
  expect((await workerHealth(FAKE_EA_BASE_URL)).status()).toBe(200);
  expect((await workerHealth("http://localhost:1/api/fc/")).status()).toBe(409);
  expect(
    (await workerHealth(FAKE_EA_BASE_URL, "http://localhost:1")).status(),
  ).toBe(409);

  for (const fake of [FAKE_EA_URL, FAKE_ANTHROPIC_URL]) {
    const health = (instance: string) =>
      request.get(`${fake}/__control/health?instance=${instance}`);
    expect((await health(E2E_INSTANCE)).status()).toBe(200);
    expect((await health("another-checkout")).status()).toBe(409);
  }
});
