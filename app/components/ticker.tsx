import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

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
 * A broadcast ticker strip. When the items are wider than the strip they
 * scroll continuously and pause on hover or focus; when they fit, or with
 * reduced motion, they sit still (and scroll by hand if they overflow).
 */
export function Ticker({ label, items, durationSeconds = 40 }: TickerProps) {
  const [viewport, overflows] = useOverflows<HTMLDivElement>(items);
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
        ref={viewport}
        className={`group relative min-w-0 flex-1 ${overflows ? "overflow-hidden motion-reduce:overflow-x-auto" : "overflow-x-auto"}`}
        // Focusable so keyboard users can pause it, or scroll it under reduced motion.
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region
        tabIndex={0}
      >
        {overflows ? (
          <div
            className="flex w-max animate-ticker group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused] motion-reduce:animate-none"
            style={
              { "--ticker-duration": `${durationSeconds}s` } as CSSProperties
            }
          >
            <TickerTrack items={items} loop />
            <TickerTrack items={items} loop hidden />
          </div>
        ) : (
          <TickerTrack items={items} />
        )}
      </div>
    </section>
  );
}

/**
 * Whether the items are wider than the element, re-checked on resize. False
 * on the server and until measured, so the strip first renders still.
 */
function useOverflows<T extends HTMLElement>(items: readonly TickerItem[]) {
  const ref = useRef<T>(null);
  const [overflows, setOverflows] = useState(false);
  // Callers rebuild the array on every render; re-measure only when the items change.
  const itemIds = items.map((item) => item.id).join();

  // biome-ignore lint/correctness/useExhaustiveDependencies: itemIds is the trigger, not a value read
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const check = () => {
      // Measure the first copy's items, not the track: a looping track is padded to a screen wide.
      const entries = element.querySelectorAll("ul:first-of-type > li");
      const first = entries[0]?.getBoundingClientRect();
      const last = entries[entries.length - 1]?.getBoundingClientRect();
      setOverflows(
        first !== undefined &&
          last !== undefined &&
          last.right - first.left > element.clientWidth,
      );
    };
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => observer.disconnect();
  }, [itemIds]);

  return [ref, overflows] as const;
}

function TickerTrack({
  items,
  loop = false,
  hidden = false,
}: {
  items: TickerItem[];
  /** One of the two back-to-back copies that scroll as a loop. */
  loop?: boolean;
  hidden?: boolean;
}) {
  return (
    <ul
      aria-hidden={hidden || undefined}
      // Each looping copy is at least a screen wide so a short list never leaves a gap mid-loop.
      className={`flex shrink-0 items-center ${loop ? "motion-safe:min-w-[100vw]" : ""} ${hidden ? "motion-reduce:hidden" : ""}`}
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
