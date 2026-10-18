/**
 * CLUBS-46: Matchday's D1 read budget. An open Matchday checks the Poll every
 * minute, and that check must stay a few rows however much data there is.
 * Rows read come from the test-only meter (`app/db/rows-read.ts`).
 */
import type { APIRequestContext } from "@playwright/test";

import { win } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

/** The check an open Matchday makes every minute (`POLL_STATE_PATH`). */
const POLL_STATE_PATH = "/api/poll-state";
/** The per-check budget in `app/stats/README.md`. */
const POLL_CHECK_ROWS = 5;

interface PollStateJson {
  lastPoll: string | null;
  version: number;
}

/** Fetches `path` and returns the rows the app read to answer it. */
async function rowsRead(request: APIRequestContext, path: string) {
  await request.get("/__test/rows-read");
  const res = await request.get(path);
  expect(res.ok(), path).toBe(true);
  const { rowsRead } = await (await request.get("/__test/rows-read")).json();
  return rowsRead as number;
}

async function pollState(request: APIRequestContext): Promise<PollStateJson> {
  const res = await request.get(POLL_STATE_PATH);
  expect(res.ok()).toBe(true);
  return res.json();
}

test("the refresh check reads a few rows, however many Polls and Matches there are", async ({
  request,
  fakeEa,
  triggerPoll,
}) => {
  await triggerPoll();
  const fresh = await rowsRead(request, POLL_STATE_PATH);
  expect(fresh).toBeLessThanOrEqual(POLL_CHECK_ROWS);

  for (let i = 0; i < 10; i++) await fakeEa.addMatch(win());
  for (let i = 0; i < 20; i++) await triggerPoll();
  expect(await rowsRead(request, POLL_STATE_PATH)).toBe(fresh);
});

test("a full Matchday load does not grow with the number of Polls", async ({
  request,
  triggerPoll,
}) => {
  await triggerPoll();
  const before = await rowsRead(request, "/");

  for (let i = 0; i < 20; i++) await triggerPoll();
  expect(await rowsRead(request, "/")).toBe(before);
});

test("the version changes only when a Poll stores new data", async ({
  request,
  fakeEa,
  triggerPoll,
}) => {
  expect(await pollState(request)).toEqual({ lastPoll: null, version: 0 });

  // The next two Polls rate the Opponents the first one recorded.
  for (let i = 0; i < 3; i++) await triggerPoll();
  const first = await pollState(request);
  expect(first.version).toBeGreaterThan(0);
  expect(first.lastPoll).not.toBeNull();

  // Nothing new at EA: the Poll is newer, the data is not.
  await triggerPoll();
  const unchanged = await pollState(request);
  expect(unchanged.version).toBe(first.version);
  expect(Date.parse(unchanged.lastPoll ?? "")).toBeGreaterThanOrEqual(
    Date.parse(first.lastPoll ?? ""),
  );

  await fakeEa.addMatch(win());
  await triggerPoll();
  expect((await pollState(request)).version).toBeGreaterThan(first.version);
});

test("a failed Poll moves neither the last Poll nor the version", async ({
  request,
  fakeEa,
  triggerPoll,
}) => {
  await triggerPoll();
  const before = await pollState(request);

  // EA refuses the first request, so the Poll stops and fails.
  await fakeEa.failNext(403);
  await triggerPoll();
  expect(await pollState(request)).toEqual(before);
});
