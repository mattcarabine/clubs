import { type ReactNode, useState } from "react";
import { Link } from "react-router";

import { neighbour } from "~/lib/column-layout";
import { type SortDirection, type SortValue, sortBy } from "~/lib/sort";
import { fadeAttributes, useScrollFade } from "~/lib/use-scroll-fade";

import {
  arrangeColumns,
  type ColumnLayoutState,
  columnName,
} from "./column-layout";
import {
  type ColumnDrag,
  ColumnMenu,
  type ColumnMenuAt,
  columnMenuAt,
  useColumnDrag,
} from "./column-menu";
import {
  LINKED_ROW,
  LINKED_ROW_HEADER,
  ROW_HEADER_LINK,
  useRowLink,
} from "./row-link";

export type DataTableColumn<T> = {
  id: string;
  header: string;
  /** The full name where `header` abbreviates it ("Goals" for "G"), for the column picker. */
  label?: string;
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
  /**
   * The viewer's column choices from `useColumnLayout` (CLUBS-65): hides and
   * orders every column after the pinned first, and lets a header be hidden
   * or moved from its right-click menu or dragged to a new place. Mount a
   * `ColumnPicker` with the same layout for touch and keyboards.
   */
  layout?: ColumnLayoutState;
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
  layout,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort);
  const [scrollerRef, edges] = useScrollFade<HTMLElement>();
  const rowLink = useRowLink();
  const [menu, setMenu] = useState<ColumnMenuAt | null>(null);
  const { drag, start: startDrag } = useColumnDrag((id, target) =>
    layout?.move(id, target),
  );
  const shown = arrangeColumns(columns, layout);
  // A hidden column no longer sorts the table.
  const sortColumn = shown.find((c) => c.id === sort?.columnId);
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
              {shown.map((column, i) => {
                const direction =
                  sort?.columnId === column.id ? sort.direction : undefined;
                const movable = layout !== undefined && i > 0;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={direction && ARIA_SORT[direction]}
                    {...(movable && {
                      "data-column-drop": column.id,
                      onContextMenu: (event) => {
                        event.preventDefault();
                        setMenu(columnMenuAt(column.id, event));
                      },
                      onPointerDown: startDrag(column.id),
                    })}
                    className={[
                      "border-shale-700 border-b bg-shale-800 px-2 py-2 font-display font-bold text-base text-ink-muted uppercase leading-tight tracking-wide first:pl-3 sm:px-3",
                      alignClass(column.align),
                      // The pinned header may wrap on phones, so a long label
                      // ("Squad Member") never widens the pinned column.
                      i === 0
                        ? "sticky left-0 z-10 sm:whitespace-nowrap"
                        : "whitespace-nowrap",
                      movable ? MOVABLE_HEADER : "",
                      dragClass(drag, column.id, layout?.visible),
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
                  {shown.map((column, i) => {
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
      {menu && layout && (
        <HeaderMenu
          at={menu}
          column={columns.find((c) => c.id === menu.id)}
          layout={layout}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

/** A movable header's right-click menu: hide it, or move it past a visible neighbour. */
function HeaderMenu<T>({
  at,
  column,
  layout,
  onClose,
}: {
  at: ColumnMenuAt;
  column: DataTableColumn<T> | undefined;
  layout: ColumnLayoutState;
  onClose: () => void;
}) {
  const left = neighbour(layout.visible, at.id, -1);
  const right = neighbour(layout.visible, at.id, 1);
  return (
    <ColumnMenu
      at={at}
      label={`${column ? columnName(column) : at.id} column`}
      onClose={onClose}
      actions={[
        { label: "Hide column", run: () => layout.setHidden(at.id, true) },
        {
          label: "Move left",
          disabled: !left,
          run: () => left && layout.move(at.id, left),
        },
        {
          label: "Move right",
          disabled: !right,
          run: () => right && layout.move(at.id, right),
        },
      ]}
    />
  );
}

/** A header that can be dragged: a grab cursor for mice, and no text selection mid-drag. */
const MOVABLE_HEADER =
  "select-none pointer-fine:cursor-grab pointer-fine:[&_button]:cursor-grab";

/**
 * Mid-drag, the dragged header dims and the one under the pointer shows a
 * rave edge on the side the column will land.
 */
function dragClass(
  drag: ColumnDrag | null,
  id: string,
  visible: readonly string[] = [],
): string {
  if (!drag) return "";
  if (drag.id === id) return "opacity-50";
  if (drag.over !== id) return "";
  return visible.indexOf(drag.id) < visible.indexOf(id)
    ? "shadow-[inset_-3px_0_0_var(--color-rave)]"
    : "shadow-[inset_3px_0_0_var(--color-rave)]";
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
