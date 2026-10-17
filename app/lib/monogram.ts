/**
 * A club's two-letter monogram, for the Opponent's mark on the ScoreBar: the
 * first letters of its first two words ("Kebab Over6pack" is "KO"), or the
 * first two letters of a one-word name ("Thunderstruijk" is "TH").
 */
export function monogram(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const letters =
    words.length > 1 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? "");
  return letters.slice(0, 2).toUpperCase();
}
