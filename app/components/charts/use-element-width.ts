import { useEffect, useRef, useState } from "react";

/**
 * Tracks an element's content width so SVG charts can lay out in real pixels
 * (keeping text and strokes crisp). Renders at `fallback` on the server and
 * until the first measurement.
 */
export function useElementWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(0, Math.floor(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
