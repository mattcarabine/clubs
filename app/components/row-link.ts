import type { MouseEvent } from "react";
import { useNavigate } from "react-router";

/**
 * Table rows that link somewhere (a Squad Member, an Opponent) read as rows,
 * not as blue link text: the row header holds the real link in ink, the row
 * shows a pointer, and hovering it lights the header's left edge in rave.
 */
export const LINKED_ROW = "group cursor-pointer";
export const LINKED_ROW_HEADER =
  "group-hover:shadow-[inset_3px_0_0_var(--color-rave),1px_0_0_var(--color-shale-700)]";
export const ROW_HEADER_LINK = "hover:text-ink focus-visible:outline-offset-4";

/**
 * A `<tr>` click handler that follows `href`, for mouse users clicking
 * anywhere on a linked row. Keyboards and screen readers use the row header's
 * own link, so this is a convenience, not the only way in.
 */
export function useRowLink() {
  const navigate = useNavigate();
  return (href: string | undefined) =>
    href
      ? (event: MouseEvent<HTMLTableRowElement>) => {
          if (shouldFollow(event)) navigate(href);
        }
      : undefined;
}

/**
 * True for a plain click on the row itself: not on a control inside
 * it, not a modified click (new tab), and not the end of a text selection.
 */
function shouldFollow(event: MouseEvent<HTMLTableRowElement>): boolean {
  const target = event.target as HTMLElement;
  return !(
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    target.closest("a, button, input, label") ||
    window.getSelection()?.toString()
  );
}
