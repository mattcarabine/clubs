/**
 * Recording many Matches through the fake EA upstream: EA lists only its
 * latest page of Matches, so a long run needs a Poll after every page.
 *
 *   await record(fakeEa, triggerPoll, [win(daysAgo(3)), loss(daysAgo(2))]);
 */
import type { AddMatchBody } from "../fake-ea/control.ts";
import type { MatchOptions } from "./match-builders.ts";

export type Fake = { addMatch(body: AddMatchBody): Promise<void> };

/** EA lists at most this many recent Matches per request. */
const EA_PAGE = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Adds Matches in order, oldest first, with a Poll after each page EA would list. */
export async function record(
  fakeEa: Fake,
  triggerPoll: () => Promise<void>,
  builds: readonly AddMatchBody[],
) {
  for (const [i, body] of builds.entries()) {
    await fakeEa.addMatch(body);
    if ((i + 1) % EA_PAGE === 0 || i === builds.length - 1) await triggerPoll();
  }
}

/** `count` days ago at 19:00 UTC: each Match its own Session. */
export function daysAgo(count: number): MatchOptions {
  const date = new Date(Date.now() - count * DAY_MS);
  date.setUTCHours(19, 0, 0, 0);
  return { playedAt: date };
}
