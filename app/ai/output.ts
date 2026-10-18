/**
 * Strict checks on a model's reply (docs/adr/0006): a writer stores nothing
 * from a reply that strays from its schema.
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

/** A string no longer than `maxLength`. */
export function isText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}
