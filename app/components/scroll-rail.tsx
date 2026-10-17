import type { ReactNode } from "react";

import { fadeAttributes, useScrollFade } from "~/lib/use-scroll-fade";

/**
 * A row of chip groups that scrolls sideways on phones, so a set of filters
 * takes one row, not a screen; its clipped edge fades so it reads as
 * scrollable. From `sm` up it wraps instead. Used by the FilterBar and
 * Compare's per-player Position Group pickers.
 */
export function ScrollRail({
  className = "",
  children,
}: {
  /** Padding and the like; the scrolling behaviour is built in. */
  className?: string;
  children: ReactNode;
}) {
  const [ref, edges] = useScrollFade<HTMLDivElement>();
  return (
    <div
      ref={ref}
      {...fadeAttributes(edges)}
      className={`scroll-fade flex items-end gap-x-6 gap-y-3 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible ${className}`}
    >
      {children}
    </div>
  );
}
