/**
 * A viewer's choice of table columns (CLUBS-65): their order and which are
 * hidden, by column id. It lives in the browser, so the stored form is
 * checked on the way in and reconciled with the table's current columns.
 */
export type ColumnLayout = {
  /** Every column id, in display order, hidden ones included. */
  order: readonly string[];
  hidden: readonly string[];
};

/** Bump when the stored shape changes; older layouts are then ignored. */
const VERSION = 1;

export function defaultColumnLayout(ids: readonly string[]): ColumnLayout {
  return { order: ids, hidden: [] };
}

export function serialiseColumnLayout(layout: ColumnLayout): string {
  return JSON.stringify({ v: VERSION, ...layout });
}

/**
 * Reads a stored layout against the table's columns `ids` (in their default
 * order). Unknown ids are dropped, and a column the stored layout has never
 * seen goes back in after the column that precedes it by default, so a new
 * column lands near where it was designed to be. Anything malformed gives
 * the default layout.
 */
export function parseColumnLayout(
  raw: string | null,
  ids: readonly string[],
): ColumnLayout {
  const stored = readStored(raw);
  if (!stored) return defaultColumnLayout(ids);
  const known = new Set(ids);
  const order = [...new Set(stored.order)].filter((id) => known.has(id));
  ids.forEach((id, i) => {
    if (order.includes(id)) return;
    const before = i === 0 ? -1 : order.indexOf(ids[i - 1]);
    order.splice(before + 1, 0, id);
  });
  return { order, hidden: stored.hidden.filter((id) => known.has(id)) };
}

function readStored(raw: string | null): ColumnLayout | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      "v" in value &&
      value.v === VERSION &&
      "order" in value &&
      isStringArray(value.order) &&
      "hidden" in value &&
      isStringArray(value.hidden)
    ) {
      return { order: value.order, hidden: value.hidden };
    }
  } catch {
    // Not JSON: fall through to the default.
  }
  return null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Moves column `id` into `target`'s place: before it when moving earlier,
 * after it when moving later. The same move serves a drop on a header, a
 * "Move left" past the visible neighbour, and a step up a list.
 */
export function moveColumn(
  order: readonly string[],
  id: string,
  target: string,
): readonly string[] {
  const to = order.indexOf(target);
  if (id === target || to === -1 || !order.includes(id)) return order;
  const next = order.filter((c) => c !== id);
  next.splice(to, 0, id);
  return next;
}

/** The neighbour `step` places along `ids` (-1 is the one before), if any. */
export function neighbour(
  ids: readonly string[],
  id: string,
  step: -1 | 1,
): string | undefined {
  const i = ids.indexOf(id);
  return i === -1 ? undefined : ids[i + step];
}

export function setColumnHidden(
  layout: ColumnLayout,
  id: string,
  hidden: boolean,
): ColumnLayout {
  const rest = layout.hidden.filter((c) => c !== id);
  return { ...layout, hidden: hidden ? [...rest, id] : rest };
}

export function isDefaultColumnLayout(
  layout: ColumnLayout,
  ids: readonly string[],
): boolean {
  return (
    layout.hidden.length === 0 &&
    layout.order.length === ids.length &&
    layout.order.every((id, i) => id === ids[i])
  );
}
