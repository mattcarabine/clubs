export type SortDirection = "asc" | "desc";
export type SortValue = number | string | null | undefined;

/**
 * Returns a sorted copy. Numbers compare numerically, strings with a
 * locale-aware natural compare, and missing values always sink to the bottom
 * whatever the direction. Ties keep their input order.
 */
export function sortBy<T>(
  rows: readonly T[],
  getValue: (row: T) => SortValue,
  direction: SortDirection,
): T[] {
  const sign = direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: getValue(row) }))
    .sort((a, b) => {
      const aMissing = a.value == null;
      const bMissing = b.value == null;
      if (aMissing || bMissing) {
        return aMissing === bMissing ? a.index - b.index : aMissing ? 1 : -1;
      }
      const order = compare(
        a.value as number | string,
        b.value as number | string,
      );
      return order === 0 ? a.index - b.index : sign * order;
    })
    .map(({ row }) => row);
}

function compare(a: number | string, b: number | string): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en-GB", {
    numeric: true,
    sensitivity: "base",
  });
}
