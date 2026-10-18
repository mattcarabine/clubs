/**
 * CLUBS-45: once the Poll sees a Season end, one call writes its Season
 * Review and one Discord post announces it with the link; the review page
 * 404s until then, and carries Season-specific link-preview tags. CLUBS-47:
 * a finished Season with no Matches is settled once and never checked
 * again. Against the fake EA, Anthropic and Discord.
 */
import type { RecordedPost } from "./fake-discord/control.ts";
import {
  EA_FINAL,
  endSeason,
  playSeason,
  type SeasonReviewPostRow,
} from "./support/season-review.ts";
import { expect, test } from "./support/test.ts";
import type { AiJobRow, AiWriteupRow } from "./support/writeups.ts";

const REVIEW_PATH = "/seasons/1/review";
const REVIEW_URL = `https://clubs.marabine.co.uk${REVIEW_PATH}`;
const POLL_INTERVAL_MS = 5 * 60_000;

interface Embed {
  title: string;
  url: string;
  description: string;
  fields: { name: string; value: string }[];
}

function reviewPosts(posts: RecordedPost[]): Embed[] {
  return posts
    .map((post) => (post.body.embeds as Embed[])[0])
    .filter((embed) => embed.title.includes("Review"));
}

async function reviewJobs(db: { rows<T>(t: string): Promise<T[]> }) {
  return (await db.rows<AiJobRow>("ai_jobs")).filter(
    (job) => job.kind === "season-review",
  );
}

test("the Poll that ends a Season makes one call and one Discord post with the review's link; a repeat Poll does neither", async ({
  fakeEa,
  fakeAnthropic,
  fakeDiscord,
  triggerPoll,
  db,
  request,
}) => {
  await playSeason({ fakeEa, triggerPoll });
  // The Season is still running: nothing yet.
  expect(await reviewJobs(db)).toHaveLength(0);
  expect((await request.get(REVIEW_PATH)).status()).toBe(404);

  const callsBefore = (await fakeAnthropic.requests()).length;
  await endSeason({ fakeEa, triggerPoll });

  const jobs = await reviewJobs(db);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({
    subject_key: "1",
    status: "done",
    attempts: 1,
  });
  const reviewCalls = (await fakeAnthropic.requests())
    .slice(callsBefore)
    .filter((call) => call.raw.includes("Season Review"));
  expect(reviewCalls).toHaveLength(1);
  // Every number comes from the input, which carries EA's final totals.
  expect(reviewCalls[0].raw).toContain(`\\"played\\":${EA_FINAL.gamesPlayed}`);

  const writeups = (await db.rows<AiWriteupRow>("ai_writeups")).filter(
    (w) => w.kind === "season-review",
  );
  expect(writeups.map((w) => w.subject_key).sort()).toEqual(
    [
      "1/intro",
      "1/outro",
      "1/award/player-of-the-season",
      "1/award/golden-boot",
      "1/award/playmaker",
      "1/award/most-improved",
      "1/award/ever-present",
      "1/award/hot-streak",
    ].sort(),
  );

  const posts = reviewPosts(await fakeDiscord.requests());
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    title: "Season 1 Review is in",
    url: REVIEW_URL,
  });
  expect(posts[0].fields).toEqual([
    { name: "Player of the Season", value: "Kabeeble · 8.0 average rating" },
    { name: "Golden Boot", value: "Kabeeble · 13 goals" },
    { name: "Playmaker", value: "Trevor · 6 assists" },
  ]);
  expect(JSON.stringify(posts[0])).not.toMatch(/claude|anthropic|\bAI\b/i);
  expect((await request.get(REVIEW_PATH)).status()).toBe(200);

  await triggerPoll();
  expect(await reviewJobs(db)).toHaveLength(1);
  expect(reviewPosts(await fakeDiscord.requests())).toHaveLength(1);
  const [row] = await db.rows<SeasonReviewPostRow>("season_review_posts");
  expect(row).toMatchObject({ season: 1, status: "posted", attempts: 1 });
});

test("an AI failure is retried on a later Poll, and the Discord post waits for the review", async ({
  fakeEa,
  fakeAnthropic,
  fakeDiscord,
  triggerPoll,
  db,
  request,
}) => {
  await playSeason({ fakeEa, triggerPoll });
  await fakeAnthropic.failNext(500);
  await endSeason({ fakeEa, triggerPoll });

  expect(await reviewJobs(db)).toMatchObject([
    { status: "pending", attempts: 1 },
  ]);
  expect(reviewPosts(await fakeDiscord.requests())).toHaveLength(0);
  expect(await db.rows("season_review_posts")).toHaveLength(0);
  expect((await request.get(REVIEW_PATH)).status()).toBe(404);
  // The Poll itself is unharmed.
  const runs = await db.rows<{ status: string }>("poll_runs");
  expect(runs.every((r) => r.status === "ok")).toBe(true);

  await triggerPoll();
  expect(await reviewJobs(db)).toMatchObject([{ status: "done", attempts: 2 }]);
  expect(reviewPosts(await fakeDiscord.requests())).toHaveLength(1);
  expect((await request.get(REVIEW_PATH)).status()).toBe(200);
});

test("a finished Season with no Matches is settled once: no call, no post, and later Polls never check it again", async ({
  fakeEa,
  fakeAnthropic,
  fakeDiscord,
  triggerPoll,
  db,
  request,
}) => {
  await playSeason({ fakeEa, triggerPoll }, []);
  await endSeason({ fakeEa, triggerPoll });

  const [settled, ...others] = await reviewJobs(db);
  expect(others).toHaveLength(0);
  expect(settled).toMatchObject({
    subject_key: "1",
    status: "empty",
    attempts: 0,
    input: null,
  });

  // Later Polls skip it before building its review (whose lookup would settle
  // it again, stamping this Poll's time), so its job is untouched.
  for (let i = 1; i <= 3; i++) {
    await triggerPoll(new Date(Date.now() + i * POLL_INTERVAL_MS));
  }
  expect(await reviewJobs(db)).toEqual([settled]);

  const calls = await fakeAnthropic.requests();
  expect(calls.filter((call) => call.raw.includes("Season Review"))).toEqual(
    [],
  );
  expect(reviewPosts(await fakeDiscord.requests())).toHaveLength(0);
  expect(await db.rows("season_review_posts")).toHaveLength(0);
  expect((await request.get(REVIEW_PATH)).status()).toBe(404);
});

test("a running Season, an unknown Season and a malformed number are 404s", async ({
  fakeEa,
  triggerPoll,
  request,
}) => {
  await playSeason({ fakeEa, triggerPoll });
  await endSeason({ fakeEa, triggerPoll });

  expect((await request.get(REVIEW_PATH)).status()).toBe(200);
  for (const path of [
    "/seasons/2/review",
    "/seasons/9/review",
    "/seasons/0/review",
    "/seasons/one/review",
  ]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
    expect(await res.text(), path).toContain("Season Review not found");
  }
});

test("the review page unfurls with Season-specific Open Graph tags", async ({
  fakeEa,
  triggerPoll,
  request,
}) => {
  await playSeason({ fakeEa, triggerPoll });
  await endSeason({ fakeEa, triggerPoll });

  const html = await (await request.get(REVIEW_PATH)).text();
  const tag = (property: string) =>
    html.match(
      new RegExp(`<meta property="${property}" content="([^"]*)"`),
    )?.[1];
  expect(tag("og:title")).toBe("Season 1 Review · A Bloo Bloo");
  expect(tag("og:description")).toBe(
    "W4 D1 L2 · 7 Matches · 13 scored, 8 conceded · Player of the Season: Kabeeble · Golden Boot: Kabeeble",
  );
  expect(tag("og:url")).toBe(REVIEW_URL);
  expect(tag("og:type")).toBe("article");
});
