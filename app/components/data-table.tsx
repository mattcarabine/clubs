import { type ReactNode, useState } from "react";
import { Link } from "react-router";

import { type SortDirection, type SortValue, sortBy } from "~/lib/sort";
import { fadeAttributes, useScrollFade } from "~/lib/use-scroll-fade";

import {
  LINKED_ROW,
  LINKED_ROW_HEADER,
  ROW_HEADER_LINK,
  useRowLink,
} from "./row-link";

export type DataTableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Makes the column sortable. Return null for missing values; they sort last. */
  sortValue?: (row: T) => SortValue;
  /** Right-align numbers. Defaults to "left". */
  align?: "left" | "right";
  /** Direction applied on the first click. Defaults to "desc" (biggest first). */
  firstSort?: SortDirection;
};

export type DataTableSort = { columnId: string; direction: SortDirection };

type DataTableProps<T> = {
  /** Visible caption naming the table. */
  caption: string;
  /** The first column is the row header and sticks while the rest scroll. */
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /**
   * Makes each row a link: the row header becomes the link (for keyboards and
   * screen readers) and a click anywhere on the row follows it.
   */
  rowHref?: (row: T) => string;
  initialSort?: DataTableSort;
  /** Shown instead of the table when there are no rows. */
  empty?: ReactNode;
  /**
   * Rows to pick out in Our Club's blue, e.g. the selected Position Groups.
   * Colour alone never carries meaning, so say it in the row too.
   */
  highlight?: (row: T) => boolean;
  /** Puts a tick box in each row header, e.g. to pick Squad Members to compare. */
  select?: RowSelection<T>;
};

export type RowSelection<T> = {
  isSelected: (row: T) => boolean;
  /** E.g. once the most that can be picked are ticked. */
  isDisabled?: (row: T) => boolean;
  onToggle: (row: T) => void;
  /** Names each tick box for screen readers, e.g. "Compare Kabeeble". */
  label: (row: T) => string;
};

/**
 * Sortable table. On narrow screens it scrolls sideways inside its own
 * container with the first column pinned, so the page itself never scrolls.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  rowHref,
  initialSort,
  empty,
  highlight,
  select,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort);
  const [scrollerRef, edges] = useScrollFade<HTMLElement>();
  const rowLink = useRowLink();
  const sortColumn = columns.find((c) => c.id === sort?.columnId);
  const sorted =
    sort && sortColumn?.sortValue
      ? sortBy(rows, sortColumn.sortValue, sort.direction)
      : rows;

  if (rows.length === 0 && empty) return <>{empty}</>;

  const toggle = (column: DataTableColumn<T>) =>
    setSort((current) => ({
      columnId: column.id,
      direction:
        current?.columnId === column.id
          ? flip(current.direction)
          : (column.firstSort ?? "desc"),
    }));

  return (
    <div className="min-w-0 border-shale-700 border-t-2 bg-shale-900">
      <section
        ref={scrollerRef}
        // Only the end fades: the pinned first column must stay crisp.
        {...fadeAttributes({ start: false, end: edges.end })}
        className="scroll-fade overflow-x-auto"
        // Focusable so keyboard users can scroll it sideways.
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region
        tabIndex={0}
        aria-label={caption}
      >
        <table className="w-full border-separate border-spacing-0 text-sm tabular">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column, i) => {
                const direction =
                  sort?.columnId === column.id ? sort.direction : undefined;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={direction && ARIA_SORT[direction]}
                    className={[
                      "border-shale-700 border-b bg-shale-800 px-2 py-2 font-display font-bold text-base text-ink-muted uppercase leading-tight tracking-wide first:pl-3 sm:px-3",
                      alignClass(column.align),
                      // The pinned header may wrap on phones, so a long label
                      // ("Squad Member") never widens the pinned column.
                      i === 0
                        ? "sticky left-0 z-10 sm:whitespace-nowrap"
                        : "whitespace-nowrap",
                    ].join(" ")}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggle(column)}
                        className={`inline-flex items-center gap-1 text-left uppercase hover:text-ink ${direction ? "text-ink" : ""}`}
                      >
                        {column.header}
                        <SortIcon direction={direction} />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const highlighted = highlight?.(row) ?? false;
              const href = rowHref?.(row);
              return (
                <tr
                  key={rowKey(row)}
                  className={href ? LINKED_ROW : "group"}
                  onClick={rowLink(href)}
                  data-highlighted={highlighted || undefined}
                >
                  {columns.map((column, i) => {
                    const Cell = i === 0 ? "th" : "td";
                    const content = column.cell(row);
                    return (
                      <Cell
                        key={column.id}
                        scope={i === 0 ? "row" : undefined}
                        className={[
                          "whitespace-nowrap border-shale-700 border-b px-2 py-2.5 group-last:border-b-0 group-hover:bg-shale-800 first:pl-3 sm:px-3",
                          alignClass(column.align),
                          i === 0
                            ? `${rowHeaderClass(highlighted)} ${href ? LINKED_ROW_HEADER : ""}`
                            : cellClass(highlighted),
                        ].join(" ")}
                      >
                        {i === 0 ? (
                          <RowHeader href={href} select={select} row={row}>
                            {content}
                          </RowHeader>
                        ) : (
                          content
                        )}
                      </Cell>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/** The row header's content: the row's link, after its tick box when rows can be picked. */
function RowHeader<T>({
  href,
  select,
  row,
  children,
}: {
  href: string | undefined;
  select: RowSelection<T> | undefined;
  row: T;
  children: ReactNode;
}) {
  const content = href ? (
    <Link to={href} className={ROW_HEADER_LINK}>
      {children}
    </Link>
  ) : (
    children
  );
  if (!select) return content;
  return (
    <span className="flex items-center gap-2.5">
      <input
        type="checkbox"
        checked={select.isSelected(row)}
        disabled={select.isDisabled?.(row)}
        onChange={() => select.onToggle(row)}
        aria-label={select.label(row)}
        className="size-4 shrink-0 cursor-pointer accent-rave disabled:cursor-not-allowed disabled:opacity-40"
      />
      {content}
    </span>
  );
}

/**
 * A right-aligned, sortable numeric column. `format` turns the value into
 * display text (e.g. "+3", "67%"); it sorts on the raw number either way.
 */
export function numberColumn<T, V extends number | null>(
  id: string,
  header: string,
  value: (row: T) => V,
  format?: (value: V) => ReactNode,
): DataTableColumn<T> {
  return {
    id,
    header,
    align: "right",
    cell: format ? (row) => format(value(row)) : value,
    sortValue: value,
  };
}

const ARIA_SORT = {
  asc: "ascending",
  desc: "descending",
} as const satisfies Record<SortDirection, string>;

function flip(direction: SortDirection): SortDirection {
  return direction === "asc" ? "desc" : "asc";
}

function alignClass(align: "left" | "right" = "left") {
  return align === "right" ? "text-right" : "text-left";
}

/** The sticky first cell; a highlighted row gets a rave edge inside its border. */
function rowHeaderClass(highlighted: boolean): string {
  const sticky = "sticky left-0 z-10 font-semibold text-ink";
  return highlighted
    ? `${sticky} bg-sound-900 shadow-[inset_3px_0_0_var(--color-rave),1px_0_0_var(--color-shale-700)]`
    : `${sticky} bg-shale-900 shadow-[1px_0_0_var(--color-shale-700)]`;
}

function cellClass(highlighted: boolean): string {
  return highlighted ? "bg-sound-900 text-ink" : "text-ink-soft";
}

function SortIcon({ direction }: { direction?: SortDirection }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 8 12"
      className="h-3 w-2 shrink-0"
      fill="currentColor"
    >
      <path d="M4 0 8 5H0z" opacity={direction === "asc" ? 1 : 0.3} />
      <path d="M4 12 0 7h8z" opacity={direction === "desc" ? 1 : 0.3} />
    </svg>
  );
}
