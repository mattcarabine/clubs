import { useEffect, useRef } from "react";
import { useRevalidator } from "react-router";

/**
 * Re-runs the page's loaders every `intervalMs` while the tab is visible, so a
 * page left open picks up new Polls without a reload. A hidden tab stops
 * fetching; when it comes back after a full interval it refreshes at once.
 */
export function useRevalidateWhileVisible(intervalMs: number): void {
  const { revalidate } = useRevalidator();
  // The latest `revalidate`, so the timer is not reset when its identity changes.
  const revalidateRef = useRef(revalidate);
  revalidateRef.current = revalidate;

  useEffect(() => {
    let lastRun = Date.now();
    const run = () => {
      lastRun = Date.now();
      void revalidateRef.current();
    };
    const id = setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, intervalMs);
    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRun >= intervalMs
      ) {
        run();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs]);
}
