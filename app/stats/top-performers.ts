/**
 * A Match's standout Squad Members: the Man of the Match, then everyone who
 * scored or assisted, best first. Pure, so it works on any Appearance rows
 * (e.g. `getMatch(...).appearances` filtered to Our Club).
 */

export interface PerformerInput {
  playerId: string;
  name: string;
  goals: number;
  assists: number;
  rating: number | null;
  manOfTheMatch: boolean;
}

export type TopPerformer = PerformerInput;

/**
 * The Man of the Match plus every scorer and assister, ordered MOTM first,
 * then goals, assists and rating. When nobody did any of that (a 0–0 with no
 * MOTM), the highest-rated Appearance stands in so the list is never empty
 * while there were Appearances.
 */
export function topPerformers(
  appearances: readonly PerformerInput[],
): TopPerformer[] {
  const ranked = [...appearances].sort(byContribution);
  const standouts = ranked.filter(
    (a) => a.manOfTheMatch || a.goals > 0 || a.assists > 0,
  );
  if (standouts.length) return standouts;
  const bestRated = [...appearances]
    .filter((a) => a.rating !== null)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];
  return bestRated ? [bestRated] : [];
}

function byContribution(a: PerformerInput, b: PerformerInput): number {
  return (
    Number(b.manOfTheMatch) - Number(a.manOfTheMatch) ||
    b.goals - a.goals ||
    b.assists - a.assists ||
    (b.rating ?? -1) - (a.rating ?? -1) ||
    a.name.localeCompare(b.name)
  );
}
