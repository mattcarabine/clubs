import { runWriteups } from "../app/ai/run";
import { runSessionPosts } from "../app/discord/run";
import { runSeasonReviewPosts } from "../app/discord/season-review";
import { runPoll } from "../app/poll/run";

/**
 * Every 5 minutes: the Poll, then the jobs that act once a Session or a
 * Season is over (`isSessionOver`, a new Season detected): their write-ups,
 * then their Discord posts, which wait for those write-ups. Each step after
 * the Poll never throws, so none delays or fails the Poll's own record.
 */
export async function runScheduled(env: Env): Promise<void> {
  await runPoll(env);
  await runWriteups(env);
  await runSessionPosts(env);
  await runSeasonReviewPosts(env);
}
