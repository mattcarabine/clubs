/**
 * CLUBS-17: the home relay's routes (docs/adr/0007) need the relay's token,
 * record a relayed Poll like the cron's own, and refuse anything else.
 */
import { RELAY_PLAN_PATH, RELAY_POLL_PATH } from "../app/poll/relay.ts";
import { recordedLeagueMatches } from "./support/match-builders.ts";
import { E2E_RELAY_TOKEN, runTestRelay } from "./support/relay.ts";
import { expect, test } from "./support/test.ts";

const AUTH = { Authorization: `Bearer ${E2E_RELAY_TOKEN}` };

test("the relay's routes answer 401 without the token, or with a wrong one", async ({
  request,
}) => {
  const attempts: Record<string, string>[] = [
    {},
    { Authorization: "Bearer wrong-token" },
  ];
  for (const headers of attempts) {
    const plan = await request.get(RELAY_PLAN_PATH, { headers });
    expect(plan.status(), await plan.text()).toBe(401);
    const poll = await request.post(RELAY_POLL_PATH, { headers, data: {} });
    expect(poll.status()).toBe(401);
  }
});

test("a relayed Poll is recorded once, like the cron's own", async ({ db }) => {
  await runTestRelay();
  const second = await runTestRelay();

  const matches = await db.rows<{ match_id: string }>("matches");
  expect(matches.map((m) => m.match_id).sort()).toEqual(
    recordedLeagueMatches()
      .map((m) => m.matchId)
      .sort(),
  );
  const runs = await db.rows<{ status: string }>("poll_runs");
  expect(runs.map((r) => r.status)).toEqual(["ok", "ok"]);
  expect(second).toMatchObject({ matchesAdded: 0, snapshotsAdded: 0 });
});

test("the plan names Our Club for the relay to poll", async ({ request }) => {
  const plan = await request.get(RELAY_PLAN_PATH, { headers: AUTH });
  expect(plan.ok()).toBe(true);
  expect(await plan.json()).toMatchObject({
    club: { clubId: "332191", platform: "common-gen5" },
    ratedMatchIds: [],
  });
});

test("a body that is not a relayed Poll is refused with 400 and records nothing", async ({
  request,
  db,
}) => {
  for (const data of [
    "not json",
    { startedAt: 1, finishedAt: 2, aborted: false, responses: "none" },
    {
      startedAt: 1,
      finishedAt: 2,
      aborted: false,
      responses: [
        {
          request: { endpoint: "admin/delete", variant: "", query: {} },
          fetchedAt: 1,
          durationMs: 1,
          response: { ok: true, status: 200, body: "[]" },
        },
      ],
    },
  ]) {
    const res = await request.post(RELAY_POLL_PATH, {
      headers: { ...AUTH, "Content-Type": "application/json" },
      data: typeof data === "string" ? data : JSON.stringify(data),
    });
    expect(res.status()).toBe(400);
  }
  expect(await db.rows("poll_runs")).toEqual([]);
});
