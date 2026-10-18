import { runWriteups } from "../app/ai/run";
import { runSessionPosts } from "../app/discord/run";
import { runPoll } from "../app/poll/run";

/**
 * Every 5 minutes: the Poll, then the jobs that act once a Session is over
 * (`isSessionOver`): its write-ups, then its Discord post, which includes
 * the recap. Each step after the Poll never throws, so none delays or fails
 * the Poll's own record. `now` is the cron's scheduled time, which the
 * write-ups judge what is due by (E2E runs set it).
 */
export async function runScheduled(
  env: Env,
  now: Date = new Date(),
): Promise<void> {
  await runPoll(env);
  await runWriteups(env, now);
  await runSessionPosts(env);
}
