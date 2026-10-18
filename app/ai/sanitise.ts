/**
 * Guards around the model (docs/adr/0006). Opponent club names and persona
 * names are chosen by strangers on EA, so they reach the prompt only as
 * short, single-line data; and the model's text is cleaned before it is
 * stored, so it never carries markup or links onto the site (or, later,
 * Discord).
 */

/** The longest name the prompt ever carries. */
export const MAX_PROMPT_NAME = 40;

/**
 * A third-party name made safe to quote in a prompt: control and format
 * characters (newlines included) become spaces, whitespace collapses, and
 * it is cut to `MAX_PROMPT_NAME` characters.
 */
export function promptName(name: string): string {
  const flat = name
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [...flat].slice(0, MAX_PROMPT_NAME).join("").trim();
}

/**
 * The club an Appearance belongs to, as a prompt names it: Our Club by
 * name, an Opponent through `promptName`.
 */
export function promptClub(isOurClub: boolean, opponentName: string): string {
  return isOurClub ? "A Bloo Bloo" : promptName(opponentName);
}

/**
 * JSON for a prompt's data block. `<` and `>` are escaped as JSON unicode
 * escapes, so nothing inside the data can close or open the block's tags.
 */
export function promptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
}

/**
 * A write-up's text as the site stores it: Markdown links become their
 * words, bare URLs and HTML tags are dropped, control characters other than
 * line breaks are removed, and line endings are normalised.
 */
export function cleanWriteupText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "")
    .replace(/[^\P{Cc}\n]|\p{Cf}/gu, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
