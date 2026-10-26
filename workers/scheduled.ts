import { runWriteups } from "../app/ai/run";
import { runSessionPosts } from "../app/discord/run";
import { runSeasonReviewPosts } from "../app/discord/season-review";
import { runMilestones } from "../app/milestones/record";
import { runPoll } from "../app/poll/run";

/**
 * Every 5 minutes: the Poll, then Milestone detection on what it stored (so
 * their comments queue with the write-ups), then the jobs that act once a
 * Session or a Season is over (`isSessionOver`, a new Season detected): their
 * write-ups, then their Discord posts, which wait for those write-ups. Each
 * step after the Poll never throws, so none delays or fails the Poll's own
 * record. `now` is the cron's scheduled time, which Milestones are stamped
 * with and the write-ups judge what is due by (E2E runs set it).
 */
export async function runScheduled(
  env: Env,
  now: Date = new Date(),
): Promise<void> {
  // With the home relay polling EA (docs/adr/0007), its Polls arrive at
  // `/relay/poll`, which runs Milestone detection itself.
  const poll = env.EA_POLL_SOURCE === "relay" ? null : await runPoll(env);
  await runMilestones(
    env,
    Boolean(poll && (poll.matchesAdded > 0 || poll.snapshotsAdded > 0)),
    now,
  );
  await runWriteups(env, now);
  await runSessionPosts(env);
  await runSeasonReviewPosts(env);
}
