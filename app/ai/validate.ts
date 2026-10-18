/**
 * Checks on the model's replies: strict structure (anything off-schema
 * stores nothing), and the house style's hard rules for prose (CLUBS-48),
 * which send a write-up back to be written again.
 */

/** An object with exactly these keys. */
export function hasExactly(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((k) => own.includes(k));
}

/** A string with something in it, of at most `maxLength` characters. */
export function isText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim() !== "" &&
    value.length <= maxLength
  );
}

/** What a write-up's prose is checked against, beyond its own text. */
export interface ProseContext {
  /** Days between the first recorded Match and the write-up's moment, when known. */
  trackedDays?: number;
}

/** Tracking must cover this many days before prose may talk about "the last month". */
export const MONTH_DAYS = 30;

/** A rule and why it was broken, as the model is told on the rewrite. */
interface ProseRule {
  pattern: RegExp;
  problem: string;
}

/** Site labels that read like a database in prose (HOUSE_STYLE). */
const LABEL_RULES: readonly ProseRule[] = [
  {
    pattern: /\bdropped points?\b/i,
    problem: 'the site label "Dropped Points"',
  },
  { pattern: /\bDNFs?\b/i, problem: 'the site label "DNF"' },
  {
    pattern: /\b(?:hot|cold) form\b/i,
    problem: 'the site label "Hot form" or "Cold form"',
  },
  { pattern: /\boutcome split\b/i, problem: 'the site label "Outcome Split"' },
  {
    pattern: /\bsquad members?\b/i,
    problem: 'the site label "Squad Member"',
  },
  {
    pattern: /\brated \d{1,2},?\d{3}\b/i,
    problem:
      'a club\'s Skill Rating written as "rated 1589" (write "a 1,589-rated side")',
  },
];

/** EA's gaps (a dropped-out player, our side of a DNF we quit) reported as if they happened. */
const ZERO_CLAIM_RULES: readonly ProseRule[] = [
  {
    pattern: /\b(?:zero|0|no|nil) (?:minutes?|mins)\b/i,
    problem: "a zero-minutes claim",
  },
  {
    pattern: /\b(?:zero|0|no|nil) (?:completed )?(?:shots?|passes)\b/i,
    problem: "a zero-shots or zero-passes claim",
  },
  {
    pattern: /\bnot (?:a|one) (?:single )?(?:shot|(?:completed )?pass)\b/i,
    problem: "a zero-shots or zero-passes claim",
  },
  {
    pattern:
      /\b(?:did ?n[o'’]t|did not|failed to|could ?n[o'’]t|could not|never) (?:register|manage|have|take|get|complete|muster|make|fire|attempt|string together) (?:a|one|any) (?:single )?(?:shot|(?:completed )?pass)/i,
    problem: "a zero-shots or zero-passes claim",
  },
  {
    pattern: /\bwithout (?:a|one) (?:single )?(?:shot|completed pass)\b/i,
    problem: "a zero-shots or zero-passes claim",
  },
  {
    pattern: /(?<![\d.])0 (?:of|from) \d+ (?:passes|shots)\b|\b0\/0\b/i,
    problem: "a zero-shots or zero-passes claim",
  },
];

/** "since records began" may appear once in a piece, at most. */
const SINCE_RECORDS = /\bsince records began\b/gi;

/** "In a month" framing, while tracking covers less than `MONTH_DAYS`. */
const MONTH_FRAMING =
  /\b(?:in|over|for) (?:a|the (?:last|past)) month\b|\b(?:last|past) (?:30 days|month)\b|\bthis month\b/i;

/**
 * A score: 1 or 2 digits each side of a hyphen or dash, not part of a time,
 * date, decimal or formation (4-2-3-1), nor a range of units ("15-20 minutes").
 */
const SCORE =
  /(?<![\d.,:/–-])(?<!\b(?:minutes?|mins?) )(\d{1,2}) ?[-–] ?(\d{1,2})(?![\d.,:/–-])(?! ?(?:minutes?|mins?|goals?|games?|matches|days|shots|passes|tackles|points|per cent|%))/gi;

/**
 * Every house-style rule a piece of prose breaks, described for the model's
 * rewrite; empty when it is clean. Unit tested with real sentences the
 * model wrote before CLUBS-48.
 */
export function proseProblems(
  text: string,
  { trackedDays }: ProseContext = {},
): string[] {
  const problems = [...LABEL_RULES, ...ZERO_CLAIM_RULES]
    .filter(({ pattern }) => pattern.test(text))
    .map(({ problem }) => problem);
  for (const [score, a, b] of text.matchAll(SCORE)) {
    if (Number(a) < Number(b)) {
      problems.push(`the score "${score}", not written winner first`);
    }
  }
  if ((text.match(SINCE_RECORDS)?.length ?? 0) > 1) {
    problems.push('"since records began" more than once');
  }
  if (
    trackedDays !== undefined &&
    trackedDays < MONTH_DAYS &&
    MONTH_FRAMING.test(text)
  ) {
    problems.push(
      `"in a month" framing, when records only cover ${Math.floor(trackedDays)} days`,
    );
  }
  return [...new Set(problems)];
}
