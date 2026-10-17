/** Display formats for stat numbers, shared by pages and charts. */

/** "+3", "0", "−2": a signed whole number such as goal difference. */
export function formatSigned(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

/** "67%" rounded to a whole percent, or "–" when there is no value. */
export function formatPercent(value: number | null): string {
  return value === null ? "–" : `${Math.round(value)}%`;
}
