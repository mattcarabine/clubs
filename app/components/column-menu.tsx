import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** Where a header's menu opens, and the element focus returns to. */
export type ColumnMenuAt = {
  id: string;
  x: number;
  y: number;
  trigger: HTMLElement;
};

/**
 * Where to open the menu for a header's `contextmenu` event. A keyboard's
 * menu key fires it with no pointer position, so then it opens under the header.
 */
export function columnMenuAt(
  id: string,
  event: MouseEvent<HTMLElement>,
): ColumnMenuAt {
  const header = event.currentTarget;
  const trigger = header.querySelector("button") ?? header;
  if (event.clientX !== 0 || event.clientY !== 0) {
    return { id, x: event.clientX, y: event.clientY, trigger };
  }
  const box = header.getBoundingClientRect();
  return { id, x: box.left, y: box.bottom, trigger };
}

export type ColumnMenuAction = {
  label: string;
  disabled?: boolean;
  run: () => void;
};

/** Kept clear of the viewport's edges. */
const GUTTER = 8;

/**
 * A header's right-click menu (CLUBS-65): a small list of actions at the
 * pointer, in the top layer so the table's scroller never clips it. Arrow
 * keys move between items; Esc, a click elsewhere or picking an item closes
 * it, and focus returns to the header.
 */
export function ColumnMenu({
  at,
  label,
  actions,
  onClose,
}: {
  at: ColumnMenuAt;
  /** Names the menu, e.g. "Shots column". */
  label: string;
  actions: readonly ColumnMenuAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    menu.showPopover();
    const left = Math.min(at.x, window.innerWidth - menu.offsetWidth - GUTTER);
    const top = Math.min(at.y, window.innerHeight - menu.offsetHeight - GUTTER);
    menu.style.left = `${Math.max(GUTTER, left)}px`;
    menu.style.top = `${Math.max(GUTTER, top)}px`;
    items(menu)[0]?.focus();
  }, [at]);

  const close = () => ref.current?.hidePopover();

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = items(event.currentTarget);
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    const next = {
      ArrowDown: all[(i + 1) % all.length],
      ArrowUp: all[(i - 1 + all.length) % all.length],
      Home: all[0],
      End: all[all.length - 1],
    }[event.key];
    if (!next) return;
    event.preventDefault();
    next.focus();
  };

  return (
    <div
      ref={ref}
      popover="auto"
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onToggle={(event) => {
        if (event.newState !== "closed") return;
        // Back to the header, unless a click elsewhere already moved focus on.
        const active = document.activeElement;
        if (active === document.body || ref.current?.contains(active)) {
          at.trigger.focus();
        }
        onClose();
      }}
      className="fixed m-0 min-w-44 border-rave border-t-2 bg-shale-900 p-1 text-ink"
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          role="menuitem"
          disabled={action.disabled}
          onClick={() => {
            close();
            action.run();
          }}
          className="block min-h-9 w-full px-3 text-left text-sm hover:bg-shale-800 focus-visible:-outline-offset-2 focus-visible:outline-rave disabled:cursor-not-allowed disabled:text-ink-muted disabled:hover:bg-transparent"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

/** The menu's enabled items, in order. */
function items(menu: HTMLElement): HTMLButtonElement[] {
  return [
    ...menu.querySelectorAll<HTMLButtonElement>(
      "[role=menuitem]:not(:disabled)",
    ),
  ];
}

/** A header being dragged, and the header under the pointer. */
export type ColumnDrag = { id: string; over: string | null };

/** How far the pointer travels before a press on a header becomes a drag. */
const DRAG_THRESHOLD_PX = 6;

/**
 * Dragging a header onto another moves its column there (CLUBS-65). It is
 * for mice and pens: on touch a header drag would fight the table's
 * sideways scroll, so phones use the Columns picker. Headers that can be
 * dropped on carry `data-column-drop` with their column id. A drag ends in a
 * click on the header's sort button, which is swallowed so it does not sort.
 */
export function useColumnDrag(onDrop: (id: string, target: string) => void) {
  const [drag, setDrag] = useState<ColumnDrag | null>(null);

  const start = (id: string) => (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || event.pointerType === "touch") return;
    const origin = { x: event.clientX, y: event.clientY };
    let current: ColumnDrag | null = null;

    const move = (e: globalThis.PointerEvent) => {
      if (
        !current &&
        Math.hypot(e.clientX - origin.x, e.clientY - origin.y) <
          DRAG_THRESHOLD_PX
      ) {
        return;
      }
      current = { id, over: dropTargetAt(e.clientX, e.clientY) };
      setDrag(current);
    };
    const end = (e: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (!current) return;
      setDrag(null);
      swallowNextClick();
      if (e.type === "pointerup" && current.over && current.over !== id) {
        onDrop(id, current.over);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  return { drag, start };
}

function dropTargetAt(x: number, y: number): string | null {
  const header = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-column-drop]");
  return header?.dataset.columnDrop ?? null;
}

/** Eats the click a drag's release would cause, if one comes this turn. */
function swallowNextClick() {
  const swallow = (event: Event) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", swallow, true));
}
