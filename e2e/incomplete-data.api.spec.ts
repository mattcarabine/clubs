/**
 * CLUBS-48: what the write-ups are given about gaps in EA's data, the
 * Milestones those gaps no longer make, and the house-style guard that
 * sends a write-up back to be written again.
 */
import { FAKE_USAGE } from "./fake-anthropic/control.ts";
import { promptText } from "./support/fake-anthropic.ts";
import {
  dnf,
  lasting,
  OUR_CLUB_ID,
  win,
  withLineup,
} from "./support/match-builders.ts";
import type { MilestoneRow } from "./support/milestones.ts";
import { expect, test } from "./support/test.ts";
import {
  type AiJobRow,
  type AiWriteupRow,
  KAB,
  SESSION_CLOCK,
  TREV,
} from "./support/writeups.ts";

test.use({ pollAt: SESSION_CLOCK });

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

const MINUTE_MS = 60_000;

/** A kick-off `minutesAgo` before the clock the specs poll at: long enough for its Session to be over. */
function kickOff(minutesAgo = 120) {
  return new Date(SESSION_CLOCK.getTime() - minutesAgo * MINUTE_MS);
}

/** The prompt of the Session call, whatever other calls (Milestone comments) ran first. */
async function sessionPrompt(fakeAnthropic: {
  requests(): Promise<{ body: Record<string, unknown> }[]>;
}): Promise<string> {
  const prompts = (await fakeAnthropic.requests()).map((r) =>
    promptText(r.body),
  );
  const prompt = prompts.find((p) => p.includes("Write about the Session"));
  if (!prompt) throw new Error("No Session call was made");
  return prompt;
}

/** The Opponent's name in a built Match. */
function opponentName(body: ReturnType<typeof win>): string {
  const [, club] = Object.entries(body.match.clubs).find(
    ([id]) => id !== OUR_CLUB_ID,
  ) ?? ["", {}];
  return String((club as { details?: { name?: string } }).details?.name);
}

test("a DNF we quit reaches the Match report prompt as quitBy us, with its end minute and no stats of ours", async ({
  fakeEa,
  fakeAnthropic,
  triggerPoll,
}) => {
  const body = withLineup(
    lasting(
      dnf({ ourWin: false, matchId: "94810000000001", playedAt: kickOff() }),
      20,
    ),
    [
      { player: KAB, rating: 4.1 },
      // Trevor dropped out: EA records no minutes and a 3.0.
      { player: TREV, rating: 3, stats: { secondsPlayed: "0" } },
    ],
  );
  await fakeEa.addMatch(body);
  await triggerPoll();

  const prompt = await sessionPrompt(fakeAnthropic);
  for (const text of [
    '"quitBy":"us"',
    '"endedAtMinute":20',
    `"score":"3-0 to ${opponentName(body)}"`,
    '"result":"we lost"',
    `"ourPlayers":["${KAB.name}"]`,
    `"droppedOut":[{"club":"A Bloo Bloo","name":"${TREV.name}"}]`,
    // The short, brutal treatment for a Match we quit.
    "we were outclassed and pulled the plug",
  ]) {
    expect(prompt).toContain(text);
  }
  // Neither our stats from the Match nor the dropped-out player's zeros.
  expect(prompt).not.toContain(`"name":"${KAB.name}","positionGroup"`);
  expect(prompt).not.toContain(`"name":"${TREV.name}","positionGroup"`);
  expect(prompt).not.toContain('"dnf"');
});

test("a DNF the Opponent quit says so, and keeps our stats", async ({
  fakeEa,
  fakeAnthropic,
  triggerPoll,
}) => {
  await fakeEa.addMatch(
    withLineup(
      lasting(
        dnf({ ourWin: true, matchId: "94811000000001", playedAt: kickOff() }),
        30,
      ),
      [{ player: KAB, goals: 3, rating: 9.1 }],
    ),
  );
  await triggerPoll();

  const prompt = await sessionPrompt(fakeAnthropic);
  expect(prompt).toContain('"quitBy":"opponent"');
  expect(prompt).toContain('"endedAtMinute":30');
  expect(prompt).toContain(`"name":"${KAB.name}","positionGroup"`);
});

test("a write-up that breaks the house style is written again once, and only the rewrite is stored", async ({
  fakeEa,
  fakeAnthropic,
  triggerPoll,
  db,
}) => {
  const matchId = "94812000000001";
  await fakeEa.addMatch(
    withLineup(win({ matchId, playedAt: kickOff() }), [
      { player: KAB, rating: 7 },
    ]),
  );
  // Real sentences from before CLUBS-48.
  await fakeAnthropic.reply({
    recap: "The Dropped Points were grim.",
    matchReports: [
      {
        matchId,
        report: "Kabeeble played zero minutes in a 5-2 DNF Win.",
        headline: "Mucky Mayhem won 0-3",
      },
    ],
    stateOfTheClub: "Call it Hot form and then some.",
  });
  await triggerPoll();

  const requests = await fakeAnthropic.requests();
  expect(requests).toHaveLength(2);
  const rewrite = promptText(requests[1].body);
  expect(rewrite).toContain("A first draft of this was rejected");
  for (const problem of [
    'the site label "Dropped Points"',
    'the site label "DNF"',
    "a zero-minutes claim",
    'the score "0-3", not written winner first',
    'the site label "Hot form" or "Cold form"',
  ]) {
    expect(rewrite).toContain(problem);
  }

  const writeups = await db.rows<AiWriteupRow>("ai_writeups");
  expect(writeups.map((w) => w.kind)).toEqual([
    "session",
    "match",
    "headline",
    "club",
  ]);
  for (const { text } of writeups) {
    expect(text).toMatch(/^Fake /);
  }
  // Both calls are billed to the job.
  const [job] = await db.rows<AiJobRow>("ai_jobs");
  expect(job).toMatchObject({
    status: "done",
    attempts: 1,
    input_tokens: 2 * FAKE_USAGE.input_tokens,
  });
});

test("a feat in a DNF we quit, or from a 0-minute Appearance, is no Milestone", async ({
  fakeEa,
  triggerPoll,
  db,
}) => {
  const quit = withLineup(
    dnf({ ourWin: false, matchId: "94813000000001", playedAt: kickOff(300) }),
    [{ player: KAB, rating: 9.5 }],
  );
  const finished = withLineup(
    win({ matchId: "94813000000002", playedAt: kickOff(200) }),
    [
      { player: KAB, rating: 9.5 },
      { player: TREV, rating: 9.5, stats: { secondsPlayed: "0" } },
    ],
  );
  await fakeEa.addMatch(quit);
  await fakeEa.addMatch(finished);
  await triggerPoll();

  const feats = (await db.rows<MilestoneRow>("milestones")).filter(
    (m) => m.kind === "rating",
  );
  expect(feats.map((m) => [m.player_id, m.match_id])).toEqual([
    [KAB.id, "94813000000002"],
  ]);
});
