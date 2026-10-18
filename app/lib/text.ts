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

/** The first sentence of some prose, e.g. a teaser; the whole first paragraph if it never ends one. */
export function firstSentence(text: string): string {
  const [lead = ""] = paragraphs(text);
  return lead.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? lead;
}
