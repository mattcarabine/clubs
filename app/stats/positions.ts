/**
 * Main Position (CLUBS-82): the Position Group a Squad Member made most of
 * their Appearances in, among the Matches the filters select. With "Main
 * position only" on (the default), their stats count only those Appearances,
 * so a midfielder is judged as a midfielder and a forward as a forward.
 *
 * It replaces picking Position Groups by hand (CLUBS-23), which never made
 * two Squad Members comparable when each plays somewhere different.
 */
import type { PositionGroup } from "~/lib/domain";

/**
 * The Position Group most of these Appearances (one Squad Member's, oldest
 * first) were in. A tie goes to the group played in most recently.
 * Appearances with no position never decide it; null when none has one.
 */
export function mainPosition(
  appearances: readonly { positionGroup: PositionGroup | null }[],
): PositionGroup | null {
  const counts = new Map<PositionGroup, number>();
  let main: PositionGroup | null = null;
  for (const { positionGroup } of appearances) {
    if (positionGroup === null) continue;
    const count = (counts.get(positionGroup) ?? 0) + 1;
    counts.set(positionGroup, count);
    // `>=` hands a tie to the later Appearance's group.
    if (main === null || count >= (counts.get(main) ?? 0)) main = positionGroup;
  }
  return main;
}

/**
 * One Squad Member's Appearances that count: with `mainOnly`, those in their
 * Main Position (all of them when none has a position); otherwise all.
 */
export function inMainPosition<
  Row extends { positionGroup: PositionGroup | null },
>(appearances: readonly Row[], mainOnly: boolean): Row[] {
  const main = mainOnly ? mainPosition(appearances) : null;
  return main === null
    ? [...appearances]
    : appearances.filter((a) => a.positionGroup === main);
}
