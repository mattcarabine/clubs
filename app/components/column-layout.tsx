import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  type ColumnLayout,
  defaultColumnLayout,
  isDefaultColumnLayout,
  moveColumn,
  neighbour,
  parseColumnLayout,
  serialiseColumnLayout,
  setColumnHidden,
} from "~/lib/column-layout";

import { chipClassName } from "./chip";
import type { DataTableColumn } from "./data-table";
import {
  Popover,
  PopoverCaret,
  PopoverTab,
  popoverTriggerProps,
  usePopover,
} from "./popover";

/**
 * A viewer's arrangement of a `DataTable`'s columns (CLUBS-65). The first
 * column is the pinned row header, so it is never hidden or moved; the rest
 * are in `order`.
 */
export type ColumnLayoutState = {
  /** The movable columns' ids in display order, hidden ones included. */
  order: readonly string[];
  /** `order` without the hidden columns. */
  visible: readonly string[];
  hidden: ReadonlySet<string>;
  isDefault: boolean;
  /** Puts column `id` in `target`'s place (see `moveColumn`). */
  move: (id: string, target: string) => void;
  setHidden: (id: string, hidden: boolean) => void;
  reset: () => void;
};

/**
 * The column layout for one table, kept in localStorage under `storageKey`
 * so it survives a reload. The server has no storage, so the first render
 * (and the server's) uses the default layout and the stored one follows
 * straight after hydration. Storage can be missing or blocked; then the
 * layout simply lasts until the page is left.
 */
export function useColumnLayout<T>(
  storageKey: string,
  columns: readonly DataTableColumn<T>[],
): ColumnLayoutState {
  const defaults = useMemo(() => {
    const movable = columns.slice(1);
    return defaultColumnLayout(
      movable.map((c) => c.id),
      movable.filter((c) => c.defaultHidden).map((c) => c.id),
    );
  }, [columns]);
  const [layout, setLayout] = useState<ColumnLayout>(defaults);

  useEffect(() => {
    setLayout(parseColumnLayout(readStorage(storageKey), defaults));
  }, [storageKey, defaults]);

  const update = (next: ColumnLayout) => {
    setLayout(next);
    writeStorage(
      storageKey,
      isDefaultColumnLayout(next, defaults)
        ? null
        : serialiseColumnLayout(next),
    );
  };

  const hidden = new Set(layout.hidden);
  return {
    order: layout.order,
    visible: layout.order.filter((id) => !hidden.has(id)),
    hidden,
    isDefault: isDefaultColumnLayout(layout, defaults),
    move: (id, target) =>
      update({ ...layout, order: moveColumn(layout.order, id, target) }),
    setHidden: (id, isHidden) => update(setColumnHidden(layout, id, isHidden)),
    reset: () => update(defaults),
  };
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Stores `value` under `key`, or forgets the key for null. */
function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Blocked storage: the layout still applies until the page is left.
  }
}

/** The table's columns as the layout arranges them: the pinned one, then the visible rest. */
export function arrangeColumns<T>(
  columns: readonly DataTableColumn<T>[],
  layout: ColumnLayoutState | undefined,
): readonly DataTableColumn<T>[] {
  if (!layout) return columns;
  const byId = new Map(columns.map((c) => [c.id, c]));
  return [columns[0], ...layout.visible.flatMap((id) => byId.get(id) ?? [])];
}

/** A column's name in full, for menus and the picker: "Goals", not "G". */
export function columnName<T>(column: DataTableColumn<T>): string {
  return column.label ?? column.header;
}

/** "Columns", or "Columns · 2 hidden". */
function triggerText(hiddenCount: number): string {
  return hiddenCount === 0 ? "Columns" : `Columns · ${hiddenCount} hidden`;
}

type Direction = "up" | "down";
type Move = { id: string; direction: Direction };
const OPPOSITE: Record<Direction, Direction> = { up: "down", down: "up" };

/**
 * The Columns chip and its popover: every movable column with a Shown tick
 * box and Move up / Move down buttons, and Reset. It is the way to show a
 * hidden column again, and the way to rearrange columns by touch or
 * keyboard, where a header's right-click menu and drag are out of reach.
 */
export function ColumnPicker<T>({
  columns,
  layout,
}: {
  columns: readonly DataTableColumn<T>[];
  layout: ColumnLayoutState;
}) {
  const popover = usePopover("input");
  const byId = new Map(columns.map((c) => [c.id, c]));
  const [pinned] = columns;
  // After a move the row's DOM node moves too, which drops focus; put it back.
  const [moved, setMoved] = useState<Move | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    if (!moved) return;
    const find = (direction: Direction) =>
      listRef.current?.querySelector<HTMLButtonElement>(
        `[data-move="${moved.id}:${direction}"]`,
      );
    const pressed = find(moved.direction);
    // At an end of the list the button pressed is now disabled; use the other.
    (pressed?.disabled ? find(OPPOSITE[moved.direction]) : pressed)?.focus();
    setMoved(null);
  }, [moved]);

  const step = (id: string, direction: Direction) => {
    const target = neighbour(layout.order, id, direction === "up" ? -1 : 1);
    if (!target) return;
    layout.move(id, target);
    setMoved({ id, direction });
  };

  return (
    <>
      <button
        {...popoverTriggerProps(popover)}
        className={`${chipClassName(false)} inline-flex items-center gap-1.5`}
      >
        {triggerText(layout.hidden.size)}
        <PopoverCaret className="h-1.5 w-2.5" />
      </button>
      <Popover popover={popover} label="Choose columns">
        <PopoverTab>Columns</PopoverTab>
        <div className="px-3 pb-3 sm:w-80 sm:px-4 sm:pb-4">
          <p className="mb-2 text-ink-muted text-sm">
            {columnName(pinned)} always comes first. Right-click a header to
            hide it, or drag it to move it.
          </p>
          <ul
            ref={listRef}
            aria-label="Columns in order"
            className="border-shale-700 border-t sm:max-h-[55vh] sm:overflow-y-auto"
          >
            {layout.order.map((id, i) => {
              const column = byId.get(id);
              if (!column) return null;
              const name = columnName(column);
              return (
                <li
                  key={id}
                  className="flex items-center gap-1 border-shale-700 border-b py-1"
                >
                  <label className="flex min-h-9 min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={!layout.hidden.has(id)}
                      onChange={(event) =>
                        layout.setHidden(id, !event.target.checked)
                      }
                      aria-label={`Show ${name}`}
                      className="size-4 shrink-0 cursor-pointer accent-rave"
                    />
                    <span className="font-display font-bold text-base text-ink uppercase tracking-wide">
                      {column.header}
                    </span>
                    {column.label && (
                      <span className="truncate text-ink-muted text-sm">
                        {column.label}
                      </span>
                    )}
                  </label>
                  <MoveButton
                    id={id}
                    name={name}
                    direction="up"
                    disabled={i === 0}
                    onClick={() => step(id, "up")}
                  />
                  <MoveButton
                    id={id}
                    name={name}
                    direction="down"
                    disabled={i === layout.order.length - 1}
                    onClick={() => step(id, "down")}
                  />
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex justify-between gap-2">
            <button
              type="button"
              disabled={layout.isDefault}
              onClick={layout.reset}
              className={chipClassName(false)}
            >
              Reset columns
            </button>
            <button
              type="button"
              onClick={popover.close}
              className={chipClassName(true)}
            >
              Done
            </button>
          </div>
        </div>
      </Popover>
    </>
  );
}

function MoveButton({
  id,
  name,
  direction,
  disabled,
  onClick,
}: {
  id: string;
  name: string;
  direction: Direction;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-move={`${id}:${direction}`}
      aria-label={`Move ${name} ${direction}`}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 shrink-0 items-center justify-center bg-shale-800 text-ink-soft hover:bg-shale-700 hover:text-ink focus-visible:-outline-offset-2 focus-visible:outline-rave disabled:cursor-not-allowed disabled:text-shale-600 disabled:hover:bg-shale-800"
    >
      <svg aria-hidden viewBox="0 0 10 6" className="h-1.5 w-2.5">
        <path
          d={direction === "up" ? "M0 6h10L5 0z" : "M0 0h10L5 6z"}
          fill="currentColor"
        />
      </svg>
    </button>
  );
}
