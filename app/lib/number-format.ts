/** Display formats for stat values shared by pages. */

/** Shown in place of a value that cannot be computed, e.g. a % of nothing. */
export const NO_VALUE = "–";

/** "+5", "0" or "−3" (a true minus sign), e.g. for goal difference. */
export function formatSigned(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

/** A Win-rate gap in whole percentage points, "+12 pts", or a dash for null. */
export function formatPointsGap(gap: number | null): string {
  return gap === null ? NO_VALUE : `${formatSigned(Math.round(gap))} pts`;
}

/** A 0 to 100 percentage rounded to a whole number, "67%", or a dash for null. */
export function formatPercentage(value: number | null): string {
  return value === null ? NO_VALUE : `${Math.round(value)}%`;
}

/**
 * Fixed decimal places, one by default: "7.4" for a rating, "0.68" with 2 for
 * a per-90. A dash for null.
 */
export function formatDecimal(value: number | null, digits = 1): string {
  return value === null ? NO_VALUE : value.toFixed(digits);
}

/** A count as is, or a dash for a value EA did not send. */
export function formatOptional(value: number | null): string {
  return value === null ? NO_VALUE : String(value);
}

/** A count with thousands separators, "1,267", or a dash for a value EA did not send. */
export function formatThousands(value: number | null): string {
  return value === null ? NO_VALUE : value.toLocaleString("en-GB");
}

/** "1 Match", "6 Matches": a count with its noun. */
export function formatCount(
  n: number,
  singular: string,
  plural: string,
): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
