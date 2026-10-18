/**
 * Discord Season Review posts (CLUBS-45), run by the scheduled handler after
 * the write-ups: once a finished Season's review is written (its intro is
 * stored), announce it once with its link. Until then the post waits, Poll
 * after Poll. A failed call is retried on later Polls (a 429 not before its
 * `retry_after`), at most `MAX_POST_ATTEMPTS` times.
 *
 * Never throws, and never touches the Poll's own record.
 */
import { latestWriteups, seasonReviewKey } from "~/ai/writeups";
import { type Db, getDb } from "~/db/client";
import { type SeasonReviewPostStatus, seasonReviewPosts } from "~/db/schema";
import { seasonReviewPath } from "~/lib/paths";
import { siteUrl } from "~/lib/site";
import { errorMessage } from "~/lib/text";
import { getSeasonReview, listFinishedSeasons } from "~/stats";

import { seasonReviewPostBody } from "./message";
import { DEFAULT_POST_TIMEOUT_MS, MAX_POST_ATTEMPTS } from "./run";
import { postWebhook } from "./webhook";

type PostRow = typeof seasonReviewPosts.$inferSelect;

export async function runSeasonReviewPosts(env: Env): Promise<void> {
  const url = env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    const summary = await postSeasonReviews(getDb(env.DB), {
      url,
      now: new Date(),
      timeoutMs: Number(env.DISCORD_TIMEOUT_MS) || DEFAULT_POST_TIMEOUT_MS,
    });
    if (summary.posted.length || summary.failed.length) {
      console.log(JSON.stringify({ event: "discord-season", ...summary }));
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "discord-season",
        status: "failed",
        error: errorMessage(error),
      }),
    );
  }
}

interface PostContext {
  url: string;
  now: Date;
  timeoutMs: number;
}

async function postSeasonReviews(
  db: Db,
  ctx: PostContext,
): Promise<{ posted: number[]; failed: number[] }> {
  const summary = { posted: [] as number[], failed: [] as number[] };
  const finished = await listFinishedSeasons(db);
  if (finished.length === 0) return summary;
  const [rows, intros] = await Promise.all([
    db.select().from(seasonReviewPosts),
    latestWriteups(
      db,
      "season-review",
      finished.map((s) => seasonReviewKey(s.number, "intro")),
    ),
  ]);
  const byNumber = new Map(rows.map((row) => [row.season, row]));
  for (const { number } of finished) {
    const row = byNumber.get(number);
    // The post waits for the review itself.
    if (!intros.has(seasonReviewKey(number, "intro"))) continue;
    if (row && !isDue(row, ctx.now)) continue;
    const posted = await postSeasonReview(db, ctx, number, row);
    if (posted !== null) summary[posted ? "posted" : "failed"].push(number);
  }
  return summary;
}

function isDue(row: PostRow, now: Date): boolean {
  return (
    row.status === "pending" &&
    (row.nextAttemptAt === null || row.nextAttemptAt <= now)
  );
}

/** Posts one review: true when Discord took it, false when it failed, null when there was nothing to post. */
async function postSeasonReview(
  db: Db,
  ctx: PostContext,
  number: number,
  row: PostRow | undefined,
): Promise<boolean | null> {
  const review = await getSeasonReview(db, number);
  if (!review) return null;
  const save = (
    values: Partial<PostRow> & { status: SeasonReviewPostStatus },
  ) =>
    db
      .insert(seasonReviewPosts)
      .values({ season: number, createdAt: ctx.now, ...values })
      .onConflictDoUpdate({ target: seasonReviewPosts.season, set: values });
  const attempts = (row?.attempts ?? 0) + 1;
  // Leased first: an overlapping Poll sees it waiting.
  await save({
    status: "pending",
    attempts,
    nextAttemptAt: new Date(ctx.now.getTime() + ctx.timeoutMs + 60_000),
  });
  const result = await postWebhook(
    ctx.url,
    seasonReviewPostBody({
      url: siteUrl(seasonReviewPath(number)),
      number,
      record: review.record,
      awards: review.awards,
    }),
    ctx.timeoutMs,
  );
  if (result.ok) {
    await save({
      status: "posted",
      attempts,
      lastError: null,
      nextAttemptAt: null,
      postedAt: new Date(),
    });
    return true;
  }
  await save({
    status: attempts >= MAX_POST_ATTEMPTS ? "failed" : "pending",
    attempts,
    lastError: result.error,
    nextAttemptAt: result.retryAfterMs
      ? new Date(ctx.now.getTime() + result.retryAfterMs)
      : null,
  });
  return false;
}
