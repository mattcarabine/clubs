/**
 * Which write-ups a Poll attempts: pure, so the queue's rules are unit
 * tested. A subject needs work when no job covers its current version, or
 * its job failed and is due another try (exponential backoff, at most
 * `MAX_ATTEMPTS`).
 */
import type { AiJobStatus } from "~/db/schema";

import { MAX_ATTEMPTS } from "./config";

/** One thing a writer can write about, e.g. a Session. */
export interface Subject {
  subjectKey: string;
  /** Changes whenever the write-up should be redone, e.g. a Session's Match IDs. */
  version: string;
}

/** What the queue needs to know of a job. */
export interface JobState {
  subjectKey: string;
  version: string;
  status: AiJobStatus;
  attempts: number;
  nextAttemptAt: Date | null;
}

/** Whether a job may be tried now. A job is created due. */
export function isDue(job: JobState | undefined, now: Date): boolean {
  if (!job) return true;
  return (
    job.status === "pending" &&
    job.attempts < MAX_ATTEMPTS &&
    (job.nextAttemptAt === null || job.nextAttemptAt <= now)
  );
}

/**
 * The subjects to try now, in the writer's order (newest first), at most
 * `limit`. Subjects whose current version is written, or has used up its
 * attempts, are skipped.
 */
export function dueSubjects<S extends Subject>(
  subjects: readonly S[],
  jobs: readonly JobState[],
  now: Date,
  limit: number,
): S[] {
  const byVersion = new Map(jobs.map((job) => [versionKey(job), job] as const));
  return subjects
    .filter((subject) => isDue(byVersion.get(versionKey(subject)), now))
    .slice(0, Math.max(0, limit));
}

/**
 * How long to wait after the `attempts`-th try before the next: `baseMs`,
 * then double each time.
 */
export function retryDelay(attempts: number, baseMs: number): number {
  return baseMs * 2 ** Math.max(0, attempts - 1);
}

function versionKey({ subjectKey, version }: Subject): string {
  return `${subjectKey}\n${version}`;
}
