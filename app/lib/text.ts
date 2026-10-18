/** Upper-cases the first letter: "goals per 90" becomes "Goals per 90". */
export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The first sentence of a paragraph, e.g. to quote a write-up in a link
 * preview: up to and including the first ".", "!" or "?" that ends a word.
 */
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  return trimmed.match(/^.*?[.!?](?=\s|$)/s)?.[0] ?? trimmed;
}

/**
 * At most `max` characters: a longer text is cut after the last whole word
 * that fits and ends with "…".
 */
export function clampText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
