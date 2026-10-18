import { useEffect, useState } from "react";

/** Which ends of a sideways scroller have content hidden past them. */
export type ScrollEdges = { start: boolean; end: boolean };

const NONE: ScrollEdges = { start: false, end: false };

/** Below this many pixels of hidden content, an edge counts as reached. */
const SLACK_PX = 2;

/**
 * Marks a sideways scroller with `data-fade-start` / `data-fade-end` while
 * content is hidden past that edge, so the `scroll-fade` utility can fade it
 * out and show that the row scrolls. Spread the returned attributes on the
 * element that has the ref; leave out `start` where a sticky first column
 * must stay crisp. Nothing fades on the server or when everything fits.
 *
 * The ref is a callback ref, so a scroller that mounts later (a table that
 * first rendered its empty state) is still measured. The element itself comes
 * third, for callers that act on it too.
 */
export function useScrollFade<T extends HTMLElement>() {
  const [element, ref] = useState<T | null>(null);
  const [edges, setEdges] = useState<ScrollEdges>(NONE);

  useEffect(() => {
    if (!element) {
      setEdges(NONE);
      return;
    }
    const measure = () => {
      const { scrollLeft, scrollWidth, clientWidth } = element;
      const start = scrollLeft > SLACK_PX;
      const end = scrollWidth - clientWidth - scrollLeft > SLACK_PX;
      setEdges((current) =>
        current.start === start && current.end === end
          ? current
          : { start, end },
      );
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    // The scroller and its content both change size, e.g. on rotation or sort.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [element]);

  return [ref, edges, element] as const;
}

/** The data attributes `scroll-fade` reads, for the given edges. */
export function fadeAttributes({ start, end }: ScrollEdges) {
  return {
    "data-fade-start": start ? "" : undefined,
    "data-fade-end": end ? "" : undefined,
  };
}
