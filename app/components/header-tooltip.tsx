import {
  type FocusEvent,
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** The header showing its tooltip, and where it sits on screen. */
type Tip = { id: string; text: string; anchor: DOMRect };

/** How long a mouse rests on a header before its tooltip shows. */
const HOVER_DELAY_MS = 400;

/** Kept clear of the viewport's edges. */
const GUTTER = 8;

/**
 * A `DataTable` header's tooltip (CLUBS-81): what the column means, shown
 * when a mouse rests on the header or the keyboard focuses its sort button.
 * Leaving, pressing the header, a right-click or Esc hides it. Touch has no
 * hover, so it never shows there; screen readers get the same words as the
 * header's description, so the tooltip itself is hidden from them.
 */
export function useHeaderTooltip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hide = () => {
    clearTimeout(timer.current);
    setTip(null);
  };

  const showing = tip !== null;
  useEffect(() => {
    if (!showing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTip(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showing]);

  useEffect(() => () => clearTimeout(timer.current), []);

  /** Handlers for a header with a description; spread them on its `th`. */
  const headerProps = (id: string, text: string) => {
    const show = (header: HTMLElement) =>
      setTip({ id, text, anchor: header.getBoundingClientRect() });
    return {
      onPointerEnter: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType === "touch") return;
        const header = event.currentTarget;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => show(header), HOVER_DELAY_MS);
      },
      onPointerLeave: hide,
      onFocus: (event: FocusEvent<HTMLElement>) => {
        // Only keyboard focus: a click focuses the button too.
        if (event.target.matches(":focus-visible")) show(event.currentTarget);
      },
      onBlur: hide,
    };
  };

  return { tip, hide, headerProps };
}

/** The tooltip under the header it describes, in the top layer so the table's scroller never clips it. */
export function HeaderTooltip({ tip }: { tip: Tip }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    if (!box.matches(":popover-open")) box.showPopover();
    const left = Math.min(
      tip.anchor.left,
      window.innerWidth - box.offsetWidth - GUTTER,
    );
    box.style.left = `${Math.max(GUTTER, left)}px`;
    box.style.top = `${tip.anchor.bottom + 6}px`;
  }, [tip]);

  return (
    <div
      ref={ref}
      popover="manual"
      role="tooltip"
      aria-hidden
      className="pointer-events-none fixed m-0 max-w-64 border-rave border-t-2 bg-shale-800 px-3 py-2 text-ink text-sm leading-snug"
    >
      {tip.text}
    </div>
  );
}
