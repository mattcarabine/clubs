/**
 * CLUBS-39: once a Session is over, the Poll posts it to the squad's Discord
 * once, after its recap (or without it after 3 Polls), against the fake
 * Discord webhook. Discord itself is never called.
 */
import { formatLondonDate } from "../app/lib/london-time.ts";
import type { RecordedPost } from "./fake-discord/control.ts";
import {
  KAB as MILESTONE_KAB,
  LOL as MILESTONE_LOL,
  serveMatch,
} from "./support/milestones.ts";
import { expect, test } from "./support/test.ts";
import { type PollRunRow, serveSession } from "./support/writeups.ts";

interface SessionPostRow {
  session_id: string;
  status: string;
  polls_waited: number;
  attempts: number;
  last_error: string | null;
  posted_at: number | null;
}

interface Embed {
  title: string;
  url: string;
  color: number;
  description: string;
  fields: { name: string; value: string }[];
}

function embedOf(post: RecordedPost): Embed {
  return (post.body.embeds as Embed[])[0];
}

test.beforeEach(async ({ fakeEa, triggerPoll }) => {
  // Only the Matches each test adds.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
  // The release: the first Poll that can post, before any Session ends.
  await triggerPoll();
});

test("an ended Session with its recap is posted once: title, scorelines with headlines, top performer and the recap's first paragraph", async ({
  fakeEa,
  fakeAnthropic,
  fakeDiscord,
  triggerPoll,
  db,
}) => {
  const ids = await serveSession(fakeEa, {
    idPrefix: "93540000000000",
    startedMinutesAgo: 120,
    results: ["W", "L"],
  });
  await fakeAnthropic.reply({
    recap:
      "A split night. Kabeeble scored in both Matches.\n\nThe second paragraph stays on the site.",
    matchReports: [
      { matchId: ids[0], report: "Won.", headline: "Kabeeble the hero" },
      { matchId: ids[1], report: "Lost.", headline: "Bloo Bloo undone" },
    ],
    stateOfTheClub: "Fine.",
  });
  await triggerPoll();

  const posts = await fakeDiscord.requests();
  expect(posts).toHaveLength(1);
  const [post] = posts;
  expect(post.body.allowed_mentions).toEqual({ parse: [] });
  expect(post.body.embeds).toHaveLength(1);
  const embed = embedOf(post);
  const [first] = await db.rows<{ played_at: number }>("matches");
  expect(embed.title).toBe(
    `Session · ${formatLondonDate(new Date(first.played_at))} · W1 D0 L1`,
  );
  expect(embed.url).toBe(`https://clubs.marabine.co.uk/sessions/${ids[0]}`);
  expect(embed.color).toBe(0x0f3f7a);
  const lines = embed.description.split("\n");
  expect(lines[0]).toBe("A split night. Kabeeble scored in both Matches.");
  expect(embed.description).not.toContain("second paragraph");
  expect(lines.slice(-2)).toEqual([
    expect.stringMatching(
      /^\*\*W\*\* A Bloo Bloo \d–\d .* — Kabeeble the hero$/,
    ),
    expect.stringMatching(
      /^\*\*L\*\* A Bloo Bloo \d–\d .* — Bloo Bloo undone$/,
    ),
  ]);
  expect(embed.fields).toEqual([
    { name: "Top performer", value: "Kabeeble · 2 G" },
  ]);
  // No label says who wrote it.
  expect(JSON.stringify(post.body)).not.toMatch(/claude|anthropic|\bAI\b/i);

  // A further Poll posts nothing more.
  await triggerPoll();
  expect(await fakeDiscord.requests()).toHaveLength(1);
  const [row] = await db
    .rows<SessionPostRow>("session_posts")
    .then((rows) => rows.filter((r) => r.session_id === ids[0]));
  expect(row).toMatchObject({ status: "posted", attempts: 1 });
  expect(row.posted_at).not.toBeNull();
});

test("with no recap after 3 Polls, the post goes out without one", async ({
  fakeEa,
  fakeAnthropic,
  fakeDiscord,
  triggerPoll,
}) => {
  await serveSession(fakeEa, {
    idPrefix: "93541000000000",
    startedMinutesAgo: 120,
    results: ["W"],
  });
  await fakeAnthropic.failNext(500, { count: 10 });

  for (let poll = 1; poll <= 3; poll++) {
    await triggerPoll();
    expect(await fakeDiscord.requests(), `Poll ${poll}`).toHaveLength(0);
  }
  await triggerPoll();
  const posts = await fakeDiscord.requests();
  expect(posts).toHaveLength(1);
  // Just the scoreline.
  expect(embedOf(posts[0]).description).toMatch(/^\*\*W\*\* A Bloo Bloo/);
});

test("a Discord 500 leaves the Poll ok and is retried on the next Poll", async ({
  fakeEa,
  fakeDiscord,
  triggerPoll,
  db,
}) => {
  const [sessionId] = await serveSession(fakeEa, {
    idPrefix: "93542000000000",
    startedMinutesAgo: 120,
    results: ["D"],
  });
  await fakeDiscord.failNext(500);
  await triggerPoll();
  expect(await fakeDiscord.requests()).toHaveLength(1);

  await triggerPoll();
  expect(await fakeDiscord.requests()).toHaveLength(2);
  const runs = await db.rows<PollRunRow>("poll_runs");
  expect(runs.every((r) => r.status === "ok")).toBe(true);
  const rows = await db.rows<SessionPostRow>("session_posts");
  expect(rows.find((r) => r.session_id === sessionId)).toMatchObject({
    status: "posted",
    attempts: 2,
  });
});

test("a 429 is retried no sooner than its retry_after", async ({
  fakeEa,
  fakeDiscord,
  triggerPoll,
}) => {
  await serveSession(fakeEa, {
    idPrefix: "93543000000000",
    startedMinutesAgo: 120,
    results: ["W"],
  });
  await fakeDiscord.failNext(429, { retryAfter: 2 });
  await triggerPoll();
  // Still inside the 2 seconds Discord asked for.
  await triggerPoll();
  expect(await fakeDiscord.requests()).toHaveLength(1);

  await new Promise((resolve) => setTimeout(resolve, 2_100));
  await triggerPoll();
  expect(await fakeDiscord.requests()).toHaveLength(2);
});

test("a post gives up after 3 failed attempts", async ({
  fakeEa,
  fakeDiscord,
  triggerPoll,
  db,
}) => {
  const [sessionId] = await serveSession(fakeEa, {
    idPrefix: "93544000000000",
    startedMinutesAgo: 120,
    results: ["L"],
  });
  await fakeDiscord.failNext(500, { count: 5 });
  for (let poll = 1; poll <= 5; poll++) await triggerPoll();

  expect(await fakeDiscord.requests()).toHaveLength(3);
  const rows = await db.rows<SessionPostRow>("session_posts");
  const row = rows.find((r) => r.session_id === sessionId);
  expect(row).toMatchObject({ status: "failed", attempts: 3 });
  expect(row?.last_error).toContain("500");
  const runs = await db.rows<PollRunRow>("poll_runs");
  expect(runs.every((r) => r.status === "ok")).toBe(true);
});

test("the post lists the Session's Milestones by headline (CLUBS-36)", async ({
  fakeEa,
  fakeDiscord,
  triggerPoll,
}) => {
  await serveMatch(fakeEa, "93546000000001", 120, [
    { player: MILESTONE_KAB, goals: 3 },
    { player: MILESTONE_LOL, rating: 9.4 },
  ]);
  await triggerPoll();

  const [post] = await fakeDiscord.requests();
  expect(embedOf(post).fields).toContainEqual({
    name: "Milestones",
    value: ["Kabeeble — Hat\\-trick", "Loltown95 — 9.4 rating"].join("\n"),
  });
});

test("an Opponent's name cannot format, link or ping in the post", async ({
  fakeEa,
  fakeDiscord,
  triggerPoll,
}) => {
  await serveSession(fakeEa, {
    idPrefix: "93545000000000",
    startedMinutesAgo: 120,
    results: ["W"],
    opponentName: "@everyone **[win](https://evil.example)**",
  });
  await triggerPoll();

  const [post] = await fakeDiscord.requests();
  expect(post.body.allowed_mentions).toEqual({ parse: [] });
  const { description } = embedOf(post);
  expect(description).toContain(
    "@​everyone \\*\\*\\[win\\]\\(https\\://evil.example\\)\\*\\*",
  );
  expect(description).not.toContain("@everyone");
});

test.describe("release", () => {
  test("Sessions that ended before release are never posted; the next one is", async ({
    request,
    fakeEa,
    fakeDiscord,
    triggerPoll,
    db,
  }) => {
    // Start again from before the release, with two past Sessions.
    expect((await request.post("/__test/reset")).ok()).toBe(true);
    const past = [
      await serveSession(fakeEa, {
        idPrefix: "93546000000000",
        startedMinutesAgo: 3 * 24 * 60,
        results: ["W", "D"],
      }),
      await serveSession(fakeEa, {
        idPrefix: "93546100000000",
        startedMinutesAgo: 24 * 60,
        results: ["L"],
      }),
    ];
    await triggerPoll();
    await triggerPoll();
    expect(await fakeDiscord.requests()).toHaveLength(0);
    const rows = await db.rows<SessionPostRow>("session_posts");
    expect(
      rows
        .filter((r) => r.session_id !== "release-baseline")
        .map((r) => [r.session_id, r.status]),
    ).toEqual(past.map(([id]) => [id, "skipped"]));

    const [next] = await serveSession(fakeEa, {
      idPrefix: "93546200000000",
      startedMinutesAgo: 120,
      results: ["W"],
    });
    await triggerPoll();
    const posts = await fakeDiscord.requests();
    expect(posts).toHaveLength(1);
    expect(embedOf(posts[0]).url).toContain(`/sessions/${next}`);
  });
});

test("without the webhook secret nothing is posted and the Poll is ok", async ({
  fakeEa,
  fakeDiscord,
  triggerPollWithoutDiscord,
  db,
}) => {
  await serveSession(fakeEa, {
    idPrefix: "93547000000000",
    startedMinutesAgo: 120,
    results: ["W"],
  });
  await triggerPollWithoutDiscord();
  await triggerPollWithoutDiscord();

  expect(await fakeDiscord.requests()).toHaveLength(0);
  const runs = await db.rows<PollRunRow>("poll_runs");
  expect(runs.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
  // Only the release baseline from beforeEach: nothing was queued.
  const rows = await db.rows<SessionPostRow>("session_posts");
  expect(rows.map((r) => r.session_id)).toEqual(["release-baseline"]);
});
