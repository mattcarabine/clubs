import { runWriteups } from "../app/ai/run";
import { runSessionPosts } from "../app/discord/run";
import { runMilestones } from "../app/milestones/record";
import { runPoll } from "../app/poll/run";

/**
 * Every 5 minutes: the Poll, then Milestone detection on what it stored (so
 * their comments queue with the write-ups), then the jobs that act once a
 * Session is over (`isSessionOver`): its write-ups, then its Discord post,
 * which includes the recap. Each step after the Poll never throws, so none
 * delays or fails the Poll's own record. `now` is the cron's scheduled time,
 * which Milestones are stamped with and the write-ups judge what is due by
 * (E2E runs set it).
 */
export async function runScheduled(
  env: Env,
  now: Date = new Date(),
): Promise<void> {
  const poll = await runPoll(env);
  await runMilestones(
    env,
    Boolean(poll && (poll.matchesAdded > 0 || poll.snapshotsAdded > 0)),
    now,
  );
  await runWriteups(env, now);
  await runSessionPosts(env);
}
