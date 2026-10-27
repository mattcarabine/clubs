import {
  type ReactNode,
  type RefObject,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** The open state a trigger and its `Popover` share. */
export type PopoverState = {
  triggerRef: RefObject<HTMLButtonElement | null>;
  dialogRef: RefObject<HTMLDialogElement | null>;
  dialogId: string;
  open: boolean;
  /** Counts opens, so each one can mount fresh contents (use it as their `key`). */
  opens: number;
  show: () => void;
  /** Closes for any reason; the dialog's close event tidies up. */
  close: () => void;
  /** Records that the dialog closed; only `Popover` calls it. */
  setClosed: () => void;
};

/**
 * The state behind a `Popover`. On each open it shows the dialog as a modal,
 * places it under the trigger, and focuses the first element matching
 * `focus` inside it.
 */
export function usePopover(focus: string): PopoverState {
  const [open, setOpen] = useState(false);
  const [opens, setOpens] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    if (opens === 0 || !dialog || !trigger || dialog.open) return;
    dialog.showModal();
    placeBelow(dialog, trigger);
    dialog.querySelector<HTMLElement>(focus)?.focus();
  }, [opens, focus]);

  return {
    triggerRef,
    dialogRef,
    dialogId,
    open,
    opens,
    show: () => {
      setOpen(true);
      setOpens((n) => n + 1);
    },
    close: () => dialogRef.current?.close(),
    setClosed: () => setOpen(false),
  };
}

/** The ARIA a popover's trigger button needs. */
export function popoverTriggerProps(popover: PopoverState) {
  return {
    ref: popover.triggerRef,
    type: "button" as const,
    "aria-haspopup": "dialog" as const,
    "aria-expanded": popover.open,
    "aria-controls": popover.dialogId,
    onClick: popover.show,
  };
}

type PopoverProps = {
  popover: PopoverState;
  /** The dialog's accessible name, e.g. "Choose dates". */
  label: string;
  /** Mounted only while open. */
  children: ReactNode;
};

/**
 * A modal panel in the top layer, so no scrolling rail clips it: from `sm`
 * up a popover under its trigger, on phones a bottom sheet. Esc or a click
 * on the backdrop closes it, and focus returns to the trigger.
 */
export function Popover({ popover, label, children }: PopoverProps) {
  const { dialogRef, dialogId, triggerRef, open, close } = popover;
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the click only catches the backdrop; keyboards close with Esc, built into the dialog.
    <dialog
      ref={dialogRef}
      id={dialogId}
      aria-label={label}
      onClose={() => {
        // The close event comes a task after Esc: by then the trigger may have reopened it.
        if (dialogRef.current?.open) return;
        popover.setClosed();
        triggerRef.current?.focus();
      }}
      // The backdrop belongs to the dialog element itself.
      onClick={(event) => event.target === event.currentTarget && close()}
      className={[
        "m-0 max-w-none border-shale-600 border-t-2 bg-shale-900 p-0 text-ink backdrop:bg-shale-950/80",
        // Phones: a bottom sheet that scrolls inside itself.
        "fixed inset-x-0 top-auto bottom-0 max-h-[90dvh] w-full overflow-y-auto overscroll-contain",
        // From sm: a popover under the trigger, placed by `placeBelow`.
        "sm:absolute sm:right-auto sm:bottom-auto sm:max-h-none sm:w-max sm:overflow-visible",
      ].join(" ")}
    >
      {open && children}
    </dialog>
  );
}

/** A popover's green slanted strip label ("Dates", "Squad"), flush with its edge. */
export function PopoverTab({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="clip-slant-r mb-3 flex h-8 w-max items-center bg-rave pr-5 pl-3 font-display font-extrabold text-base text-shale-950 uppercase tracking-wide [--slant:0.6rem] sm:mt-4 sm:pl-4"
    >
      {children}
    </span>
  );
}

/**
 * From `sm` up, puts the popover under the trigger, kept 16px inside the
 * viewport. It sits in the top layer, so these are page coordinates and it
 * scrolls with the trigger. On phones the classes make it a bottom sheet.
 */
function placeBelow(dialog: HTMLDialogElement, trigger: HTMLElement) {
  if (!window.matchMedia("(min-width: 640px)").matches) {
    dialog.style.removeProperty("top");
    dialog.style.removeProperty("left");
    return;
  }
  const box = trigger.getBoundingClientRect();
  const gutter = 16;
  const left = Math.max(
    gutter,
    Math.min(box.left, window.innerWidth - dialog.offsetWidth - gutter),
  );
  dialog.style.top = `${box.bottom + window.scrollY + 8}px`;
  dialog.style.left = `${left + window.scrollX}px`;
}
