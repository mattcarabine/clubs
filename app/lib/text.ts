/** Upper-cases the first letter: "goals per 90" becomes "Goals per 90". */
export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Prose split into paragraphs at blank lines, with single line breaks folded
 * into spaces and empty paragraphs dropped.
 */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

/**
 * The first sentence of some prose, e.g. a write-up's teaser or link
 * preview: up to and including the first ".", "!" or "?" that ends a word,
 * or the whole first paragraph if it never ends one.
 */
export function firstSentence(text: string): string {
  const [lead = ""] = paragraphs(text);
  return lead.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? lead;
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

/** A thrown value's message, for logs and stored errors. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
