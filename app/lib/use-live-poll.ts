import { useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";

import { POLL_STATE_PATH } from "~/lib/paths";
import type { PollState } from "~/stats/snapshots";

/** A `PollState` from a loader (`lastPoll` a Date) or from the JSON check (a string). */
export type LivePollState = Omit<PollState, "lastPoll"> & {
  lastPoll: Date | string | null;
};

/**
 * Keeps a page left open up to date with the Poll, cheaply (CLUBS-7,
 * CLUBS-46). Every `intervalMs` while the tab is visible it asks
 * `/api/poll-state` (two rows read) for the latest `PollState`, and reruns the
 * page's loaders only when its `version` differs from the one they loaded, so
 * a page refreshing all evening reads its data again only after a Poll stores
 * something new. A hidden tab stops checking; when it comes back after a full
 * interval it checks at once.
 *
 * Pass the loader's `pollState(db)`, read before the rest of its data so the
 * version is never newer than the data. Returns the latest state, so "Updated
 * 4 min ago" follows every Poll even when nothing changed.
 */
export function useLivePoll(
  loaded: LivePollState,
  intervalMs: number,
): LivePollState {
  const [latest, setLatest] = useState(loaded);
  // The loaders reran: their state is the newest.
  useEffect(() => setLatest(loaded), [loaded]);

  const { revalidate } = useRevalidator();
  // The latest values, so the timer is not reset when they change.
  const current = useRef({ revalidate, version: loaded.version });
  current.current = { revalidate, version: loaded.version };

  useEffect(() => {
    let lastRun = Date.now();
    const check = async () => {
      lastRun = Date.now();
      const state = await fetchPollState();
      if (!state) return;
      setLatest(state);
      if (state.version !== current.current.version) {
        void current.current.revalidate();
      }
    };
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, intervalMs);
    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRun >= intervalMs
      ) {
        void check();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs]);

  return latest;
}

/** The latest `PollState`, or null when the check fails (the next one retries). */
async function fetchPollState(): Promise<LivePollState | null> {
  try {
    const response = await fetch(POLL_STATE_PATH);
    return response.ok ? ((await response.json()) as LivePollState) : null;
  } catch {
    return null;
  }
}
