/** Display formats for stat values shared by pages. */

/** Shown in place of a value that cannot be computed, e.g. a % of nothing. */
export const NO_VALUE = "–";

/** "+5", "0" or "−3" (a true minus sign), e.g. for goal difference. */
export function formatSigned(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

/** A 0 to 100 percentage rounded to a whole number, "67%", or a dash for null. */
export function formatPercentage(value: number | null): string {
  return value === null ? NO_VALUE : `${Math.round(value)}%`;
}

/** One decimal place, "7.4", e.g. for an average rating, or a dash for null. */
export function formatDecimal(value: number | null): string {
  return value === null ? NO_VALUE : value.toFixed(1);
}

/** "1 Match", "6 Matches": a count with its noun. */
export function formatCount(
  n: number,
  singular: string,
  plural: string,
): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
