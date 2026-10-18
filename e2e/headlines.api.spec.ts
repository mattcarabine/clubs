/**
 * CLUBS-43: Match headlines are written with the Session's recap, and
 * Matches reported before headlines existed get one from a cheap
 * headline-only call, against the fake Anthropic upstream.
 */
import { expect, test } from "./support/test.ts";
import {
  type AiJobRow,
  type AiWriteupRow,
  SESSION_CLOCK,
  serveSession,
} from "./support/writeups.ts";

test.use({ pollAt: SESSION_CLOCK });

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

function headlinesOf(writeups: AiWriteupRow[]) {
  return writeups.filter((w) => w.kind === "headline");
}

test("Matches with a report but no headline get one from the backlog, once each", async ({
  fakeEa,
  fakeAnthropic,
  triggerPoll,
  db,
}) => {
  const ids = await serveSession(fakeEa, {
    idPrefix: "93533000000000",
    startedMinutesAgo: 120,
    results: ["W", "L"],
  });
  // Reports written before headlines existed: the recap call leaves them blank.
  await fakeAnthropic.reply({
    recap: "A split night.",
    matchReports: ids.map((matchId) => ({
      matchId,
      report: "Report.",
      headline: "",
    })),
    stateOfTheClub: "Fine.",
  });
  await fakeAnthropic.reply({
    headlines: [
      { matchId: ids[0], headline: "Bloo Bloo romp home" },
      { matchId: ids[1], headline: "Bloo Bloo brought crashing down" },
    ],
  });
  await triggerPoll();

  const requests = await fakeAnthropic.requests();
  expect(requests).toHaveLength(2);
  // Headline-only: a small schema with no recap, and only the Matches lacking one.
  const backlog = JSON.stringify(requests[1].body);
  expect(backlog).toContain('"headlines"');
  expect(backlog).not.toContain("recap");

  const jobs = await db.rows<AiJobRow>("ai_jobs");
  expect(jobs.map((j) => [j.kind, j.version, j.status])).toEqual([
    ["session", ids.join(","), "done"],
    ["headline", ids.join(","), "done"],
  ]);

  // Later Polls find nothing left to write: no duplicates.
  await triggerPoll();
  await triggerPoll();
  expect(await fakeAnthropic.requests()).toHaveLength(2);
  const headlines = headlinesOf(await db.rows<AiWriteupRow>("ai_writeups"));
  expect(headlines.map((h) => [h.subject_key, h.text])).toEqual([
    [ids[0], "Bloo Bloo romp home"],
    [ids[1], "Bloo Bloo brought crashing down"],
  ]);
});

test("a new Session's headlines come with its recap, and the backlog makes no call", async ({
  fakeEa,
  fakeAnthropic,
  triggerPoll,
  db,
}) => {
  const ids = await serveSession(fakeEa, {
    idPrefix: "93534000000000",
    startedMinutesAgo: 120,
    results: ["W", "D", "L"],
  });
  await triggerPoll();
  await triggerPoll();

  expect(await fakeAnthropic.requests()).toHaveLength(1);
  const headlines = headlinesOf(await db.rows<AiWriteupRow>("ai_writeups"));
  expect(headlines.map((h) => h.subject_key)).toEqual(ids);
  for (const { text } of headlines) expect(text).toMatch(/^Fake headline/);
});

test("a headline over 80 characters is cut to fit, never stored past the limit", async ({
  fakeEa,
  fakeAnthropic,
  triggerPoll,
  db,
}) => {
  const [matchId] = await serveSession(fakeEa, {
    idPrefix: "93535000000000",
    startedMinutesAgo: 120,
    results: ["L"],
  });
  const long =
    "Bloo Bloo are torn to shreds by a rampant Kebab Over6pack side who simply could not stop scoring all night";
  expect(long.length).toBeGreaterThan(80);
  await fakeAnthropic.reply({
    recap: "A loss.",
    matchReports: [{ matchId, report: "Beaten.", headline: long }],
    stateOfTheClub: "Fine.",
  });
  await triggerPoll();

  const [headline] = headlinesOf(await db.rows<AiWriteupRow>("ai_writeups"));
  expect(headline.subject_key).toBe(matchId);
  expect(headline.text.length).toBeLessThanOrEqual(80);
  expect(headline.text).toMatch(/^Bloo Bloo are torn to shreds .*…$/);
  expect(long.startsWith(headline.text.slice(0, -1))).toBe(true);
});
