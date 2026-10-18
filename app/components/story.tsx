import {
  type ReactNode,
  type TouchEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/** One card in a StoryDeck. */
export interface StoryDeckCard {
  id: string;
  /** Names the card for its progress pip and screen readers: "Golden Boot". */
  label: string;
  content: ReactNode;
}

type StoryDeckProps = {
  /** Names the whole deck: "Season 3 Review". */
  label: string;
  cards: readonly StoryDeckCard[];
  /** `viewport` fills the screen below the header; `panel` is a fixed-height box, for the styleguide. */
  fill?: "viewport" | "panel";
};

/** Tailwind's `lg`: above it the deck scrolls; below it, it steps like stories. */
const WIDE = "(min-width: 64rem)";
/** How far a swipe must travel, in pixels, to change card. */
const SWIPE_PX = 40;
/** The arrow keys step forward (right, down) or back (left, up). */
const KEY_STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

/**
 * Full-height cards told in order (CLUBS-45's Season Review). On phones one
 * card shows at a time, like stories: tap the right two thirds (or swipe
 * left) for the next, the left third (or swipe right) for the previous, with
 * progress pips along the top. On desktop the cards are a scroll-snapped
 * vertical sequence with the pips down the side. Arrow keys step through
 * both. Each card wipes in as it becomes current, unless reduced motion is
 * asked for.
 */
export function StoryDeck({ label, cards, fill = "viewport" }: StoryDeckProps) {
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  activeRef.current = active;
  const deckRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const height = useViewportHeight(deckRef, fill === "viewport");
  const count = cards.length;

  const go = useCallback(
    (index: number) => {
      const next = Math.min(Math.max(index, 0), count - 1);
      setActive(next);
      if (window.matchMedia(WIDE).matches) {
        const reduce = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        cardRefs.current[next]?.scrollIntoView({
          behavior: reduce ? "auto" : "smooth",
          block: "start",
        });
      }
    },
    [count],
  );

  // A page given over to the deck takes the arrow keys everywhere; a panel
  // among other content only while it has focus.
  useEffect(() => {
    const target = fill === "viewport" ? window : deckRef.current;
    if (!target) return;
    function onKey(event: Event) {
      const { key, altKey, ctrlKey, metaKey } = event as KeyboardEvent;
      const step = KEY_STEPS[key];
      if (!step || altKey || ctrlKey || metaKey) return;
      const focused = event.target as HTMLElement | null;
      if (focused?.closest?.("input, textarea, select, [contenteditable]"))
        return;
      event.preventDefault();
      go(activeRef.current + step);
    }
    target.addEventListener("keydown", onKey);
    return () => target.removeEventListener("keydown", onKey);
  }, [go, fill]);

  // On desktop, scrolling moves the current card (and its pip).
  useEffect(() => {
    const list = listRef.current;
    if (!list || !window.matchMedia(WIDE).matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = cardRefs.current.indexOf(
            entry.target as HTMLDivElement,
          );
          if (index >= 0) setActive(index);
        }
      },
      { root: list, threshold: 0.6 },
    );
    for (const card of cardRefs.current) if (card) observer.observe(card);
    return () => observer.disconnect();
  }, []);

  function onTouchStart(event: TouchEvent) {
    const point = event.touches[0];
    touch.current = point ? { x: point.clientX, y: point.clientY } : null;
  }

  function onTouchEnd(event: TouchEvent) {
    const start = touch.current;
    const point = event.changedTouches[0];
    touch.current = null;
    if (!start || !point || window.matchMedia(WIDE).matches) return;
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
    go(activeRef.current + (dx < 0 ? 1 : -1));
  }

  function onTap(event: React.MouseEvent<HTMLDivElement>) {
    if (window.matchMedia(WIDE).matches) return;
    if ((event.target as HTMLElement).closest("a, button")) return;
    const { left, width } = event.currentTarget.getBoundingClientRect();
    go(active + (event.clientX - left < width / 3 ? -1 : 1));
  }

  const current = cards[active];
  return (
    <section
      ref={deckRef}
      aria-label={label}
      aria-roledescription="story"
      tabIndex={fill === "panel" ? 0 : undefined}
      className={`relative ${fill === "panel" ? "h-[34rem]" : "h-[calc(100svh-9rem)]"}`}
      style={height ? { height } : undefined}
    >
      <ol
        aria-label="Progress"
        className="absolute inset-x-0 top-0 z-10 flex gap-1 px-3 pt-1 lg:inset-x-auto lg:top-1/2 lg:-right-1 lg:-translate-y-1/2 lg:flex-col lg:gap-1.5 lg:px-0 lg:pt-0"
      >
        {cards.map((card, i) => (
          <li key={card.id} className="flex flex-1 lg:flex-none">
            <button
              type="button"
              aria-label={`${i + 1} of ${count}: ${card.label}`}
              aria-current={i === active ? "step" : undefined}
              onClick={() => go(i)}
              // A 24px tall target around the thin visible bar.
              className="flex h-6 w-full items-center lg:h-7 lg:w-3 lg:justify-center"
            >
              <span
                aria-hidden
                className={`block h-1.5 w-full -skew-x-[24deg] transition-colors lg:h-full lg:w-1.5 lg:skew-x-0 lg:-skew-y-[24deg] ${pipColour(i, active)}`}
              />
            </button>
          </li>
        ))}
      </ol>
      {/* The deck's tap and swipe zones; keyboard users have the arrow keys and the pips. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: arrow keys are handled on the window. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: see above. */}
      <div
        ref={listRef}
        onClick={onTap}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        data-testid="story-cards"
        className="h-full overflow-hidden lg:snap-y lg:snap-mandatory lg:overflow-y-auto lg:pr-5 motion-safe:lg:scroll-smooth"
      >
        {cards.map((card, i) => (
          <div
            key={card.id}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            data-card={card.id}
            data-active={i === active}
            className={`h-full lg:snap-start lg:pb-4 motion-safe:data-[active=true]:animate-story-in ${i === active ? "" : "max-lg:hidden"}`}
          >
            {card.content}
          </div>
        ))}
      </div>
      <p aria-live="polite" className="sr-only">
        {current && `${active + 1} of ${count}: ${current.label}`}
      </p>
    </section>
  );
}

function pipColour(index: number, active: number): string {
  if (index === active) return "bg-rave";
  return index < active ? "bg-ink-soft" : "bg-shale-600";
}

/** The height that fills the viewport below the deck's top, once measured. */
function useViewportHeight(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    function measure() {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      // Leaves the page's bottom padding showing under the last card.
      setHeight(Math.max(360, window.innerHeight - top - 16));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref, enabled]);
  return height;
}

type StoryCardProps = {
  /** The green tab naming the card: "Golden Boot". */
  kicker: string;
  /** The card's headline, set huge: a name, a record, a Season. */
  title: ReactNode;
  /** `h1` for the first card of a page; the rest are `h2`. */
  heading?: "h1" | "h2";
  /** The one big figure: "12", "7.8". */
  figure?: ReactNode;
  /** What the figure counts: "goals". */
  figureCaption?: ReactNode;
  /** `club` sets the angled band in Our Club's blue. */
  tone?: "club" | "neutral";
  children?: ReactNode;
};

/**
 * One full-height broadcast graphic in a StoryDeck: a green slanted tab, a
 * huge uppercase headline and supporting copy, with one big figure beside
 * it (below it on phones) over an angled band.
 */
export function StoryCard({
  kicker,
  title,
  heading: Heading = "h2",
  figure,
  figureCaption,
  tone = "neutral",
  children,
}: StoryCardProps) {
  return (
    <article className="relative flex h-full flex-col overflow-y-auto overflow-x-hidden border-rave border-t-2 bg-shale-900 px-5 pt-10 pb-6 sm:px-8 lg:px-16 lg:py-12">
      <span
        aria-hidden
        className={`clip-slant-l pointer-events-none absolute inset-y-0 right-0 w-1/4 [--slant:2.5rem] lg:w-2/5 lg:[--slant:9rem] ${tone === "club" ? "bg-sound-900" : "bg-shale-800"}`}
      />
      <div className="relative flex flex-1 flex-col justify-center gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-16">
        <div className="min-w-0 space-y-4">
          <p className="clip-slant-r inline-block bg-rave py-1 pr-6 pl-3 font-display font-bold text-base text-shale-950 uppercase tracking-wide [--slant:0.5rem]">
            {kicker}
          </p>
          <Heading className="break-words font-display font-extrabold text-5xl text-ink uppercase italic leading-[0.9] tracking-wide sm:text-6xl lg:text-7xl">
            {title}
          </Heading>
          {children && (
            <div className="max-w-prose space-y-3 text-ink-soft leading-relaxed lg:text-lg">
              {children}
            </div>
          )}
        </div>
        {figure !== undefined && (
          <div className="min-w-0 max-lg:order-first lg:text-right">
            <p className="font-display font-extrabold text-figure text-ink italic lg:text-figure-lg">
              {figure}
            </p>
            {figureCaption && (
              <p className="mt-2 font-display font-bold text-ink-soft text-xl uppercase tracking-wide">
                {figureCaption}
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
