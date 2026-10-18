/**
 * Discord Session posts (CLUBS-39), run by the scheduled handler after the
 * Poll and its write-ups: once a Session is over (`isSessionOver`, the same
 * rule as its recap), post it to the squad's channel once.
 *
 * - The post waits for the Session's recap, but at most `RECAP_WAIT_POLLS`
 *   Polls; then it goes without one.
 * - A failed call is retried on later Polls (a 429 not before its
 *   `retry_after`), at most `MAX_POST_ATTEMPTS` times.
 * - Sessions that had already ended when posting was released are never
 *   posted: the first run records them as `skipped`, and the
 *   `RELEASE_BASELINE` row marks that it has run.
 *
 * Never throws, and never touches the Poll's own record.
 */
import { latestWriteup, latestWriteups } from "~/ai/writeups";
import { bulkInsert } from "~/db/bulk";
import { type Db, getDb } from "~/db/client";
import { type SessionPostStatus, sessionPosts } from "~/db/schema";
import { sessionPath } from "~/lib/paths";
import { siteUrl } from "~/lib/site";
import { errorMessage } from "~/lib/text";
import {
  getSession,
  groupSessions,
  isSessionOver,
  listKickoffs,
  listMilestones,
  type SessionGroup,
} from "~/stats";

import { sessionPostBody } from "./message";
import { postWebhook } from "./webhook";

/** Polls a post waits for its recap: 3 Polls, 15 minutes. */
export const RECAP_WAIT_POLLS = 3;
/** Webhook calls before a post gives up. */
export const MAX_POST_ATTEMPTS = 3;
/** The `session_posts` row that records the release (no Session has this ID). */
export const RELEASE_BASELINE = "release-baseline";

const DEFAULT_TIMEOUT_MS = 10_000;

type PostRow = typeof sessionPosts.$inferSelect;

export async function runSessionPosts(env: Env): Promise<void> {
  const url = env.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.log(JSON.stringify({ event: "discord", status: "skipped" }));
    return;
  }
  try {
    const db = getDb(env.DB);
    const summary = await postSessions(db, {
      url,
      clubName: env.EA_CLUB_NAME,
      now: new Date(),
      timeoutMs: Number(env.DISCORD_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    });
    console.log(JSON.stringify({ event: "discord", ...summary }));
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "discord",
        status: "failed",
        error: errorMessage(error),
      }),
    );
  }
}

interface PostContext {
  url: string;
  clubName: string;
  now: Date;
  timeoutMs: number;
}

interface PostSummary {
  /** Sessions recorded as never to be posted, on the first run. */
  skipped?: number;
  posted: string[];
  waiting: string[];
  failed: string[];
}

async function postSessions(db: Db, ctx: PostContext): Promise<PostSummary> {
  const { now } = ctx;
  const [kickoffs, rows] = await Promise.all([
    listKickoffs(db),
    db.select().from(sessionPosts),
  ]);
  const over = groupSessions(kickoffs).filter((s) => isSessionOver(s, now));
  const byId = new Map(rows.map((row) => [row.sessionId, row]));
  const summary: PostSummary = { posted: [], waiting: [], failed: [] };

  if (!byId.has(RELEASE_BASELINE)) {
    const skipped = [RELEASE_BASELINE, ...over.map((s) => s.id)];
    await bulkInsert(
      db,
      sessionPosts,
      skipped.map((sessionId) => ({
        sessionId,
        status: "skipped" as const,
        // bulkInsert writes every column, so defaults must be given.
        pollsWaited: 0,
        attempts: 0,
        createdAt: now,
      })),
    ).onConflictDoNothing();
    return { ...summary, skipped: over.length };
  }

  // Newest first, so a backlog never holds up tonight's post.
  for (const session of over.reverse()) {
    const row = byId.get(session.id);
    if (row && !isDue(row, now)) continue;
    const outcome = await postSession(db, ctx, session, row);
    summary[outcome].push(session.id);
  }
  return summary;
}

function isDue(row: PostRow, now: Date): boolean {
  return (
    row.status === "pending" &&
    (row.nextAttemptAt === null || row.nextAttemptAt <= now)
  );
}

async function postSession(
  db: Db,
  ctx: PostContext,
  group: SessionGroup,
  row: PostRow | undefined,
): Promise<"posted" | "waiting" | "failed"> {
  const { now } = ctx;
  const pollsWaited = row?.pollsWaited ?? 0;
  const save = (values: Partial<PostRow> & { status: SessionPostStatus }) =>
    db
      .insert(sessionPosts)
      .values({ sessionId: group.id, createdAt: now, ...values })
      .onConflictDoUpdate({ target: sessionPosts.sessionId, set: values });

  const recap = await latestWriteup(db, "session", group.id);
  if (!recap && pollsWaited < RECAP_WAIT_POLLS) {
    await save({ status: "pending", pollsWaited: pollsWaited + 1 });
    return "waiting";
  }

  const [session, headlines, milestones] = await Promise.all([
    getSession(db, group.id),
    latestWriteups(db, "headline", group.matchIds),
    listMilestones(db, ctx.clubName, { matchIds: group.matchIds }),
  ]);
  if (!session) return "waiting";
  const body = sessionPostBody({
    ...session,
    url: siteUrl(sessionPath(session.id)),
    clubName: ctx.clubName,
    headlines: new Map([...headlines].map(([id, h]) => [id, h.text])),
    recap: recap?.text ?? null,
    milestones: milestones.map((m) => m.headline).reverse(),
  });

  const attempts = (row?.attempts ?? 0) + 1;
  // Leased first: an overlapping Poll sees it waiting.
  await save({
    status: "pending",
    pollsWaited,
    attempts,
    nextAttemptAt: new Date(now.getTime() + ctx.timeoutMs + 60_000),
  });
  const result = await postWebhook(ctx.url, body, ctx.timeoutMs);
  if (result.ok) {
    await save({
      status: "posted",
      attempts,
      lastError: null,
      nextAttemptAt: null,
      postedAt: new Date(),
    });
    return "posted";
  }
  const gaveUp = attempts >= MAX_POST_ATTEMPTS;
  await save({
    status: gaveUp ? "failed" : "pending",
    attempts,
    lastError: result.error,
    nextAttemptAt: result.retryAfterMs
      ? new Date(now.getTime() + result.retryAfterMs)
      : null,
  });
  return "failed";
}
