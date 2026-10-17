const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Polls run every 5 minutes, so data older than three missed Polls is stale. */
export const STALE_AFTER_MINUTES = 15;

/** "just now", "4 min ago", "3 hr ago", "2 days ago". Future times read as "just now". */
export function formatRelativeTime(then: Date, now: Date): string {
  const elapsed = now.getTime() - then.getTime();
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} hr ago`;
  const days = Math.floor(elapsed / DAY);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** True once more than `staleAfterMinutes` have passed since `then`. */
export function isStale(
  then: Date,
  now: Date,
  staleAfterMinutes: number,
): boolean {
  return now.getTime() - then.getTime() > staleAfterMinutes * MINUTE;
}
