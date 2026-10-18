import { runWriteups } from "../app/ai/run";
import { runSessionPosts } from "../app/discord/run";
import { runPoll } from "../app/poll/run";

/**
 * Every 5 minutes: the Poll, then the jobs that act once a Session is over
 * (`isSessionOver`): its write-ups, then its Discord post, which includes
 * the recap. Each step after the Poll never throws, so none delays or fails
 * the Poll's own record.
 */
export async function runScheduled(env: Env): Promise<void> {
  await runPoll(env);
  await runWriteups(env);
  await runSessionPosts(env);
}
