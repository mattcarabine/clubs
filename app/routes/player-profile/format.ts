/** Display formats shared by the profile's panels. Missing values show as "–". */
export const MISSING = "–";

/** A rating to one decimal place: "7.6". */
export function formatRating(value: number | null): string {
  return value === null ? MISSING : value.toFixed(1);
}

/** A 0 to 100 percentage, rounded: "74%". */
export function formatPercent(value: number | null): string {
  return value === null ? MISSING : `${Math.round(value)}%`;
}

/** A count EA may not have sent. */
export function formatCount(value: number | null): string {
  return value === null ? MISSING : String(value);
}
