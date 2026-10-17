import { useEffect, useState } from "react";
import {
  formatRelativeTime,
  isStale,
  STALE_AFTER_MINUTES,
} from "~/lib/relative-time";

type LastUpdatedBadgeProps = {
  /** When the data was last refreshed (the latest Poll), as a Date or ISO string. */
  updatedAt: Date | string;
  /** Defaults to three missed Polls. */
  staleAfterMinutes?: number;
  /** Fixes "now", for the styleguide and tests. Live otherwise. */
  now?: Date;
};

const TICK_MS = 30_000;

/** "Updated 4 min ago" with a live dot, turning amber with a warning once stale. */
export function LastUpdatedBadge({
  updatedAt,
  staleAfterMinutes = STALE_AFTER_MINUTES,
  now: fixedNow,
}: LastUpdatedBadgeProps) {
  const then = new Date(updatedAt);
  const now = useNow(fixedNow);
  const stale = isStale(then, now, staleAfterMinutes);

  return (
    <span
      className={[
        "inline-flex items-center gap-2 border-l-2 bg-shale-900 py-1 pr-3 pl-2 text-sm",
        stale ? "border-stale text-stale" : "border-rave text-ink-soft",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={`size-2 rounded-full ${stale ? "bg-stale" : "animate-shimmer bg-rave motion-reduce:animate-none"}`}
      />
      <span>
        {stale && <span className="font-semibold">Stale: </span>}
        Updated{" "}
        <time dateTime={then.toISOString()} suppressHydrationWarning>
          {formatRelativeTime(then, now)}
        </time>
      </span>
    </span>
  );
}

/** Current time, re-read every 30s; frozen when `fixed` is given. */
function useNow(fixed?: Date): Date {
  const [now, setNow] = useState(() => fixed ?? new Date());
  useEffect(() => {
    if (fixed) return;
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, [fixed]);
  return fixed ?? now;
}
