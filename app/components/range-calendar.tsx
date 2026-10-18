import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import {
  addCalendarDays,
  addCalendarMonths,
  addCalendarMonthsToDate,
  type CalendarDate,
  type CalendarMonth,
  calendarMonthDays,
  calendarMonthOf,
  calendarMonthsBetween,
  calendarWeekdayIndex,
  formatCalendarDay,
  formatCalendarMonth,
  WEEKDAYS,
} from "~/lib/london-time";
import type { CalendarRange } from "~/stats/filter";

/** What the calendar shows as picked: a whole range, or only its first day so far. */
export type CalendarSelection =
  | CalendarRange
  | { from: CalendarDate; to?: undefined }
  | null;

type RangeCalendarProps = {
  /** How many months show side by side, ending with `lastMonth`. */
  months: number;
  lastMonth: CalendarMonth;
  onLastMonthChange: (month: CalendarMonth) => void;
  selection: CalendarSelection;
  /** London's date: later days are disabled. */
  today: CalendarDate;
  /** Earlier days are muted, though still selectable. */
  firstMatchDate?: CalendarDate | null;
  onPick: (day: CalendarDate) => void;
};

/** Keyboard moves within the grid (the APG date picker pattern). */
const MOVES: Record<string, (day: CalendarDate) => CalendarDate> = {
  ArrowLeft: (day) => addCalendarDays(day, -1),
  ArrowRight: (day) => addCalendarDays(day, 1),
  ArrowUp: (day) => addCalendarDays(day, -7),
  ArrowDown: (day) => addCalendarDays(day, 7),
  PageUp: (day) => addCalendarMonthsToDate(day, -1),
  PageDown: (day) => addCalendarMonthsToDate(day, 1),
  Home: (day) => addCalendarDays(day, -calendarWeekdayIndex(day)),
  End: (day) => addCalendarDays(day, 6 - calendarWeekdayIndex(day)),
};

/**
 * Month grids for picking a range of London calendar days, Monday first.
 * Each month is an ARIA grid with one roving tab stop: arrows move by day
 * and week, PageUp / PageDown by month, Home / End to the week's ends, and
 * Enter or Space picks the day. Once a first day is picked, hovering or
 * moving to another previews the range. Future days are disabled.
 */
export function RangeCalendar({
  months,
  lastMonth,
  onLastMonthChange,
  selection,
  today,
  firstMatchDate,
  onPick,
}: RangeCalendarProps) {
  const visible = Array.from({ length: months }, (_, i) =>
    addCalendarMonths(lastMonth, i - months + 1),
  );
  const [focused, setFocused] = useState<CalendarDate>(() =>
    initialFocus(selection, today),
  );
  const [hovered, setHovered] = useState<CalendarDate | null>(null);
  const moveFocus = useRef(false);
  const gridsRef = useRef<HTMLDivElement>(null);

  // Keep the tab stop on a visible day, e.g. after the months change.
  const focusable = clampToMonths(focused, visible[0], lastMonth, today);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridsRef.current
      ?.querySelector<HTMLElement>(`[data-day="${focusable}"]`)
      ?.focus();
  }, [focusable]);

  const showMonth = (month: CalendarMonth) => {
    if (calendarMonthsBetween(visible[0], month) < 0) {
      onLastMonthChange(addCalendarMonths(month, months - 1));
    } else if (calendarMonthsBetween(lastMonth, month) > 0) {
      onLastMonthChange(month);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const move = MOVES[event.key];
    if (!move) return;
    event.preventDefault();
    const next = minDate(move(focusable), today);
    // Already there (e.g. right from today): nothing moves, so leave no pending focus.
    if (next === focusable) return;
    moveFocus.current = true;
    setFocused(next);
    setHovered(next);
    showMonth(calendarMonthOf(next));
  };

  const page = (delta: number) => {
    onLastMonthChange(addCalendarMonths(lastMonth, delta));
    setFocused(minDate(addCalendarMonthsToDate(focusable, delta), today));
  };

  return (
    <div ref={gridsRef} className="flex gap-6">
      {visible.map((month, index) => (
        <MonthGrid
          key={month}
          month={month}
          range={shownRange(selection, hovered)}
          today={today}
          firstMatchDate={firstMatchDate}
          focusable={focusable}
          onPick={onPick}
          onHover={setHovered}
          onFocusDay={setFocused}
          onKeyDown={onKeyDown}
          previous={index === 0 ? () => page(-1) : undefined}
          next={
            index === visible.length - 1
              ? {
                  go: () => page(1),
                  disabled: calendarMonthOf(today) <= lastMonth,
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}

type MonthGridProps = {
  month: CalendarMonth;
  range: CalendarRange | null;
  today: CalendarDate;
  firstMatchDate?: CalendarDate | null;
  focusable: CalendarDate;
  onPick: (day: CalendarDate) => void;
  onHover: (day: CalendarDate) => void;
  onFocusDay: (day: CalendarDate) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  previous?: () => void;
  next?: { go: () => void; disabled: boolean };
};

function MonthGrid({
  month,
  range,
  today,
  firstMatchDate,
  focusable,
  onPick,
  onHover,
  onFocusDay,
  onKeyDown,
  previous,
  next,
}: MonthGridProps) {
  const headingId = useId();
  const days = calendarMonthDays(month);
  // Blank slots before the 1st, so each day sits under its weekday.
  const cells: { key: string; day?: CalendarDate }[] = [
    ...Array.from({ length: calendarWeekdayIndex(days[0]) }, (_, n) => ({
      key: `before-${n}`,
    })),
    ...days.map((day) => ({ key: day, day })),
  ];
  const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );

  return (
    <div className="w-full sm:w-63">
      <div className="mb-2 flex h-9 items-center justify-between gap-2">
        <NavButton label="Previous month" onClick={previous} direction="left" />
        <h3
          id={headingId}
          className="font-display font-extrabold text-ink text-lg uppercase tracking-wide"
        >
          {formatCalendarMonth(month)}
        </h3>
        <NavButton
          label="Next month"
          onClick={next?.go}
          disabled={next?.disabled}
          direction="right"
        />
      </div>
      {/* The APG date picker grid: a table whose cells hold the day buttons, the focusable part. */}
      <table
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: an ARIA grid built on a table, as the APG date picker does.
        role="grid"
        aria-labelledby={headingId}
        data-month={month}
        className="w-full table-fixed border-collapse"
      >
        <thead>
          <tr>
            {WEEKDAYS.map((weekday) => (
              <th
                key={weekday}
                scope="col"
                abbr={weekday}
                className="pb-1 font-display font-bold text-ink-muted text-sm uppercase"
              >
                {weekday.slice(0, 2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0].key}>
              {week.map(({ key, day }) => {
                if (!day) return <td key={key} />;
                const isStart = day === range?.from;
                const isEnd = day === range?.to;
                const inRange = !!range && day > range.from && day < range.to;
                return (
                  // biome-ignore lint/a11y/useFocusableInteractive: focus goes to the day button inside, as in the APG date picker.
                  <td
                    key={key}
                    // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a grid's cells, so they can carry aria-selected.
                    role="gridcell"
                    aria-selected={isStart || isEnd || inRange}
                    className="p-0"
                  >
                    <button
                      type="button"
                      data-day={day}
                      tabIndex={day === focusable ? 0 : -1}
                      disabled={day > today}
                      aria-label={formatCalendarDay(day)}
                      aria-current={day === today ? "date" : undefined}
                      onClick={() => onPick(day)}
                      onKeyDown={onKeyDown}
                      onMouseEnter={() => onHover(day)}
                      onFocus={() => {
                        onFocusDay(day);
                        onHover(day);
                      }}
                      className={dayClassName({
                        isStart,
                        isEnd,
                        inRange,
                        isToday: day === today,
                        beforeFirstMatch:
                          !!firstMatchDate && day < firstMatchDate,
                      })}
                    >
                      {Number(day.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type NavButtonProps = {
  label: string;
  direction: "left" | "right";
  /** Absent leaves an empty slot, so the month heading stays centred. */
  onClick?: () => void;
  disabled?: boolean;
};

function NavButton({ label, direction, onClick, disabled }: NavButtonProps) {
  if (!onClick) return <span aria-hidden className="size-9" />;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={[
        "grid size-9 place-items-center bg-shale-800 text-ink-soft hover:bg-shale-700 hover:text-ink disabled:cursor-not-allowed disabled:bg-transparent disabled:text-shale-600",
        "focus-visible:-outline-offset-4 focus-visible:outline-ink",
        direction === "left" ? "clip-slant-l" : "clip-slant-r",
        "[--slant:0.35rem]",
      ].join(" ")}
    >
      <svg aria-hidden viewBox="0 0 6 10" className="h-2.5 w-1.5">
        <path
          d={direction === "left" ? "M6 0v10L0 5z" : "M0 0v10l6-5z"}
          fill="currentColor"
        />
      </svg>
    </button>
  );
}

type DayState = {
  isStart: boolean;
  isEnd: boolean;
  inRange: boolean;
  isToday: boolean;
  beforeFirstMatch: boolean;
};

/**
 * The range reads like a score strip: rave ends with angled outer edges and
 * a deep blue band between them.
 */
function dayClassName({
  isStart,
  isEnd,
  inRange,
  isToday,
  beforeFirstMatch,
}: DayState): string {
  const edge = isStart || isEnd;
  return [
    "h-10 w-full font-display font-bold text-base tabular transition-colors [--slant:0.35rem] motion-reduce:transition-none sm:h-9",
    "focus-visible:-outline-offset-4 focus-visible:outline-ink",
    "disabled:cursor-not-allowed disabled:text-shale-600 disabled:line-through",
    edgeClip(isStart, isEnd),
    dayTone(edge, inRange, beforeFirstMatch),
    isToday && !edge
      ? "underline decoration-2 decoration-rave underline-offset-4"
      : "",
  ].join(" ");
}

/** Angles the range's outer edges: both on a one-day range. */
function edgeClip(isStart: boolean, isEnd: boolean): string {
  if (isStart && isEnd) return "clip-slant";
  if (isStart) return "clip-slant-l";
  if (isEnd) return "clip-slant-r";
  return "";
}

function dayTone(
  edge: boolean,
  inRange: boolean,
  beforeFirstMatch: boolean,
): string {
  if (edge) return "bg-rave text-shale-950";
  if (inRange) return "bg-sound-900 text-ink";
  if (beforeFirstMatch) {
    return "text-ink-muted hover:bg-shale-800 enabled:hover:text-ink-soft";
  }
  return "text-ink-soft hover:bg-shale-800 enabled:hover:text-ink";
}

/** The range to highlight: the picked one, or a preview from the first day to the hovered one. */
function shownRange(
  selection: CalendarSelection,
  hovered: CalendarDate | null,
): CalendarRange | null {
  if (!selection) return null;
  if (selection.to) return selection;
  return orderedRange(selection.from, hovered ?? selection.from);
}

function initialFocus(
  selection: CalendarSelection,
  today: CalendarDate,
): CalendarDate {
  return minDate(selection?.to ?? selection?.from ?? today, today);
}

/** The same day moved into the visible months, and never after today. */
function clampToMonths(
  day: CalendarDate,
  firstMonth: CalendarMonth,
  lastMonth: CalendarMonth,
  today: CalendarDate,
): CalendarDate {
  const month = calendarMonthOf(day);
  const monthsBefore = calendarMonthsBetween(month, firstMonth);
  const shift =
    monthsBefore > 0
      ? monthsBefore
      : Math.min(0, calendarMonthsBetween(month, lastMonth));
  return minDate(addCalendarMonthsToDate(day, shift), today);
}

function minDate(a: CalendarDate, b: CalendarDate): CalendarDate {
  return a < b ? a : b;
}

/** Two days as a range, earlier first. */
export function orderedRange(a: CalendarDate, b: CalendarDate): CalendarRange {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}
