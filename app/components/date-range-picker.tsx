import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  type CalendarDate,
  type CalendarMonth,
  calendarMonthOf,
  formatCalendarRange,
  londonDateKey,
} from "~/lib/london-time";
import {
  ALL_DATES_LABEL,
  type CalendarRange,
  DATE_PRESET_LABEL,
  DATE_PRESETS,
  type DatePreset,
  type DateRange,
  dateRangeLabel,
  presetRange,
} from "~/stats/filter";

import { chipClassName } from "./chip";
import {
  type CalendarSelection,
  orderedRange,
  RangeCalendar,
} from "./range-calendar";

type DateRangePickerProps = {
  /** The applied range, which the trigger names. */
  value: DateRange;
  /** Days before it are muted in the calendar: no Match was recorded then. */
  firstMatchDate?: CalendarDate | null;
  onApply: (range: DateRange) => void;
};

/**
 * The date filter: a slanted chip naming the applied range ("Last 30 days",
 * "5 Oct – 12 Oct") that opens a modal popover with the presets and a
 * calendar. Nothing changes until Apply; Cancel, Esc or a click outside
 * discards the draft, and focus returns to the chip.
 *
 * From `sm` up the popover drops below the chip, presets down the left and
 * (from `md`) two months side by side. On phones it is a bottom sheet:
 * presets as a chip row, one month, and a sticky Apply.
 */
export function DateRangePicker({
  value,
  firstMatchDate,
  onApply,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  // Counts opens, so each one shows the dialog and mounts a fresh draft.
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
    dialog.querySelector<HTMLElement>("input:checked")?.focus();
  }, [opens]);

  // Closing for any reason (Apply, Cancel, Esc, a click outside) ends in `onClose`.
  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => {
          setOpen(true);
          setOpens((n) => n + 1);
        }}
        className={chipClassName(value.kind !== "all")}
      >
        {dateRangeLabel(value)}
        <svg
          aria-hidden
          viewBox="0 0 10 6"
          className="mb-0.5 ml-1.5 inline-block h-1.5 w-2.5"
        >
          <path d="M0 0h10L5 6z" fill="currentColor" />
        </svg>
      </button>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the click only catches the backdrop; keyboards close with Esc, built into the dialog. */}
      <dialog
        ref={dialogRef}
        id={dialogId}
        aria-label="Choose dates"
        onClose={() => {
          // The close event comes a task after Esc: by then the chip may have reopened it.
          if (dialogRef.current?.open) return;
          setOpen(false);
          triggerRef.current?.focus();
        }}
        // The backdrop belongs to the dialog element itself.
        onClick={(event) => event.target === event.currentTarget && close()}
        className={[
          "m-0 max-w-none border-shale-600 border-t-2 bg-shale-900 p-0 text-ink backdrop:bg-shale-950/80",
          // Phones: a bottom sheet that scrolls inside itself.
          "fixed inset-x-0 top-auto bottom-0 max-h-[90dvh] w-full overflow-y-auto overscroll-contain",
          // From sm: a popover under the chip, placed by `placeBelow`.
          "sm:absolute sm:right-auto sm:bottom-auto sm:max-h-none sm:w-max sm:overflow-visible",
        ].join(" ")}
      >
        {open && (
          <PickerPanel
            key={opens}
            value={value}
            firstMatchDate={firstMatchDate}
            onApply={(range) => {
              close();
              onApply(range);
            }}
            onCancel={close}
          />
        )}
      </dialog>
    </>
  );
}

/** What is picked but not yet applied: like `DateRange`, but a custom range can be half-picked. */
type Draft =
  | { kind: "all" }
  | { kind: "preset"; preset: DatePreset }
  | { kind: "custom"; from?: CalendarDate; to?: CalendarDate };

type PresetOption = "all" | DatePreset | "custom";

const PRESET_OPTIONS: readonly PresetOption[] = [
  "all",
  ...DATE_PRESETS,
  "custom",
];

const OPTION_LABEL: Record<PresetOption, string> = {
  all: ALL_DATES_LABEL,
  ...DATE_PRESET_LABEL,
  custom: "Custom range",
};

type PickerPanelProps = {
  value: DateRange;
  firstMatchDate?: CalendarDate | null;
  onApply: (range: DateRange) => void;
  onCancel: () => void;
};

/** The popover's contents, mounted on each open so the draft starts from the applied range. */
function PickerPanel({
  value,
  firstMatchDate,
  onApply,
  onCancel,
}: PickerPanelProps) {
  const [today] = useState(() => londonDateKey(new Date()));
  const months = useMediaQuery("(min-width: 768px)") ? 2 : 1;
  const [draft, setDraft] = useState<Draft>(value);
  const [lastMonth, setLastMonth] = useState<CalendarMonth>(() =>
    calendarMonthOf(draftRange(value, today)?.to ?? today),
  );
  const presetsId = useId();
  const hintId = useId();

  const selected: PresetOption =
    draft.kind === "preset" ? draft.preset : draft.kind;
  const range = draftRange(draft, today);
  const applied = toDateRange(draft);

  const choose = (option: PresetOption) => {
    switch (option) {
      case "all":
        setDraft({ kind: "all" });
        return;
      case "custom":
        // Keep the days already shown, so they can be adjusted.
        setDraft({ kind: "custom", ...range });
        return;
      default:
        setDraft({ kind: "preset", preset: option });
        // Show where the preset ends: today.
        setLastMonth(calendarMonthOf(today));
    }
  };

  const pick = (day: CalendarDate) =>
    setDraft(
      draft.kind === "custom" && draft.from && !draft.to
        ? { kind: "custom", ...orderedRange(draft.from, day) }
        : { kind: "custom", from: day },
    );

  return (
    <div className="sm:flex">
      <fieldset className="border-shale-700 sm:w-44 sm:shrink-0 sm:border-r">
        <legend className="sr-only">Range</legend>
        {/* The broadcast strip label, flush with the panel's edge. */}
        <span
          aria-hidden
          className="clip-slant-r mb-3 flex h-8 w-max items-center bg-rave pr-5 pl-3 font-display font-extrabold text-base text-shale-950 uppercase tracking-wide [--slant:0.6rem] sm:mt-4 sm:pl-4"
        >
          Dates
        </span>
        <div className="flex gap-1 overflow-x-auto px-3 pb-3 [scrollbar-width:none] sm:flex-col sm:overflow-visible sm:px-4 sm:pb-4">
          {PRESET_OPTIONS.map((option) => (
            <label key={option} className="shrink-0">
              <input
                type="radio"
                name={presetsId}
                value={option}
                checked={selected === option}
                onChange={() => choose(option)}
                className="peer sr-only"
              />
              <span
                className={[
                  chipClassName(selected === option),
                  "flex cursor-pointer items-center sm:w-full",
                  "peer-focus-visible:-outline-offset-4 peer-focus-visible:outline-2 peer-focus-visible:outline-ink",
                ].join(" ")}
              >
                {OPTION_LABEL[option]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex min-w-0 flex-col">
        <div className="px-3 pt-1 pb-3 sm:px-5 sm:pt-4">
          <RangeCalendar
            months={months}
            lastMonth={lastMonth}
            onLastMonthChange={setLastMonth}
            selection={calendarSelection(draft, range)}
            today={today}
            firstMatchDate={firstMatchDate}
            onPick={pick}
          />
        </div>
        <div className="sticky bottom-0 mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-shale-700 border-t bg-shale-900 px-3 py-3 sm:px-5">
          <div className="mr-auto min-w-0">
            <p
              aria-live="polite"
              className="font-display font-extrabold text-ink text-xl uppercase leading-tight tracking-wide"
            >
              {describeDraft(draft, range)}
            </p>
            <p id={hintId} className="text-ink-muted text-sm">
              UK days, both ends included.
            </p>
          </div>
          <div className="ml-auto flex gap-1">
            <button
              type="button"
              onClick={onCancel}
              className={chipClassName(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!applied}
              aria-describedby={hintId}
              onClick={() => applied && onApply(applied)}
              className={`${chipClassName(true)} px-6 disabled:bg-shale-800 disabled:text-ink-muted`}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The days a draft covers, or null for all dates or a half-picked range. */
function draftRange(draft: Draft, today: CalendarDate): CalendarRange | null {
  if (draft.kind === "preset") return presetRange(draft.preset, today);
  if (draft.kind === "custom" && draft.from && draft.to) {
    return { from: draft.from, to: draft.to };
  }
  return null;
}

function calendarSelection(
  draft: Draft,
  range: CalendarRange | null,
): CalendarSelection {
  if (range) return range;
  return draft.kind === "custom" && draft.from ? { from: draft.from } : null;
}

/** The draft as a filter value, or null while a custom range is half-picked. */
function toDateRange(draft: Draft): DateRange | null {
  if (draft.kind !== "custom") return draft;
  const { from, to } = draft;
  return from && to ? { kind: "custom", from, to } : null;
}

/** The footer's summary, read out as it changes. */
function describeDraft(draft: Draft, range: CalendarRange | null): string {
  switch (draft.kind) {
    case "all":
      return ALL_DATES_LABEL;
    case "preset":
      return range
        ? `${DATE_PRESET_LABEL[draft.preset]}: ${formatCalendarRange(range.from, range.to)}`
        : DATE_PRESET_LABEL[draft.preset];
    case "custom":
      if (range) return formatCalendarRange(range.from, range.to);
      return draft.from
        ? `From ${formatCalendarRange(draft.from, draft.from)}: pick the last day`
        : "Pick the first day";
  }
}

/**
 * From `sm` up, puts the popover under the trigger, kept 16px inside the
 * viewport. It sits in the top layer, so these are page coordinates and it
 * scrolls with the chip. On phones the classes make it a bottom sheet.
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

/** Whether a media query matches; false on the server. */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
