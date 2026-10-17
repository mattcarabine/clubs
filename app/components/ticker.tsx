import type { CSSProperties, ReactNode } from "react";

export type TickerItem = {
  id: string;
  /** Leading emphasised part, e.g. "W 3–1". */
  headline: ReactNode;
  /** Supporting text, e.g. "vs Northside FC". */
  detail?: ReactNode;
};

type TickerProps = {
  /** Text in the fixed green tab, e.g. "Latest". */
  label: string;
  items: TickerItem[];
  /** Seconds for one full loop. Longer lists want longer loops. */
  durationSeconds?: number;
};

/**
 * A broadcast ticker strip. Items scroll continuously and pause on hover or
 * focus; with reduced motion they sit still and scroll by hand instead.
 */
export function Ticker({ label, items, durationSeconds = 40 }: TickerProps) {
  if (items.length === 0) return null;

  return (
    <section
      aria-label={label}
      className="flex h-9 items-stretch overflow-hidden border-shale-700 border-b bg-shale-900"
    >
      <span
        aria-hidden
        className="clip-slant-r z-10 flex shrink-0 items-center bg-rave pr-5 pl-4 font-display font-extrabold text-base text-shale-950 uppercase tracking-wide [--slant:0.6rem]"
      >
        {label}
      </span>
      <div
        className="group relative min-w-0 flex-1 overflow-hidden motion-reduce:overflow-x-auto"
        // Focusable so keyboard users can pause it, or scroll it under reduced motion.
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region
        tabIndex={0}
      >
        <div
          className="flex w-max animate-ticker group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused] motion-reduce:animate-none"
          style={
            { "--ticker-duration": `${durationSeconds}s` } as CSSProperties
          }
        >
          <TickerTrack items={items} />
          <TickerTrack items={items} hidden />
        </div>
      </div>
    </section>
  );
}

function TickerTrack({
  items,
  hidden = false,
}: {
  items: TickerItem[];
  hidden?: boolean;
}) {
  return (
    <ul
      aria-hidden={hidden || undefined}
      // Each copy is at least a screen wide so a short list never leaves a gap mid-loop.
      className={`flex shrink-0 motion-safe:min-w-[100vw] items-center ${hidden ? "motion-reduce:hidden" : ""}`}
    >
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-2 whitespace-nowrap px-5 text-sm before:mr-3 before:h-3 before:w-1 before:-skew-x-12 before:bg-sound-700"
        >
          <span className="font-display font-extrabold text-base text-ink uppercase tracking-wide">
            {item.headline}
          </span>
          {item.detail != null && (
            <span className="text-ink-soft">{item.detail}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
