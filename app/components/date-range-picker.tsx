import { type FormEvent, useId, useState } from "react";

import {
  type CalendarDate,
  formatLondonShortDate,
  isCalendarRange,
  londonDateKey,
  londonDayStart,
} from "~/lib/london-time";

import { chipClassName } from "./chip";

type CalendarRange = { from: CalendarDate; to: CalendarDate };

type DateRangePickerProps = {
  id: string;
  /** The custom range already applied, to start editing from. */
  applied?: CalendarRange;
  onApply: (range: CalendarRange) => void;
  onCancel: () => void;
};

/**
 * Two native date fields, styled as broadcast chips, for a custom range of
 * London calendar days. Native inputs bring each phone's own date wheel or
 * calendar. "Apply" stays off until both dates are set and in order, so a
 * half-picked range never reaches the URL.
 */
export function DateRangePicker({
  id,
  applied,
  onApply,
  onCancel,
}: DateRangePickerProps) {
  const [from, setFrom] = useState(applied?.from ?? "");
  const [to, setTo] = useState(applied?.to ?? londonDateKey(new Date()));
  const hintId = useId();
  const valid = isCalendarRange(from, to);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) onApply({ from, to });
  };

  return (
    <form
      id={id}
      aria-label="Custom dates"
      onSubmit={submit}
      className="flex flex-wrap items-end gap-x-3 gap-y-3 border-shale-700 border-t pr-3 pb-3 sm:pt-3 sm:pr-4"
    >
      {/* The broadcast strip label, flush with the panel's edge like the Ticker's. */}
      <span
        aria-hidden
        className="clip-slant-r flex h-9 items-center self-start bg-rave pr-5 pl-3 font-display font-extrabold text-base text-shale-950 uppercase tracking-wide [--slant:0.6rem] sm:self-end sm:pl-4"
      >
        Custom dates
      </span>
      <div className="grid w-full grid-cols-2 gap-2 pl-3 sm:w-auto sm:pl-0">
        <DateField
          label="From"
          value={from}
          max={to || undefined}
          describedBy={hintId}
          onChange={setFrom}
        />
        <DateField
          label="To"
          value={to}
          min={from || undefined}
          describedBy={hintId}
          onChange={setTo}
        />
      </div>
      <div className="flex gap-1 pl-3 sm:pl-0">
        <button
          type="submit"
          disabled={!valid}
          className={chipClassName(valid)}
        >
          Apply
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={chipClassName(false)}
        >
          Cancel
        </button>
      </div>
      <p
        id={hintId}
        className="w-full pl-3 text-ink-muted text-sm leading-snug sm:w-auto sm:self-center sm:pl-2"
      >
        Whole days in UK time, both dates included.
      </p>
    </form>
  );
}

type DateFieldProps = {
  label: string;
  value: string;
  min?: string;
  max?: string;
  describedBy: string;
  onChange: (value: string) => void;
};

function DateField({
  label,
  value,
  min,
  max,
  describedBy,
  onChange,
}: DateFieldProps) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-ink-muted text-sm">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        required
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        className={[
          // 16px text, so iOS does not zoom the page on focus.
          "clip-slant min-h-9 w-full min-w-0 bg-shale-800 px-3 font-display font-bold text-base text-ink tabular uppercase tracking-wide [--slant:0.35rem] [color-scheme:dark] sm:w-44",
          "hover:bg-shale-700 focus-visible:-outline-offset-4 focus-visible:outline-ink",
        ].join(" ")}
      />
    </label>
  );
}

/** "5 Oct – 12 Oct", the label of an applied custom range. */
export function formatDateRange(from: CalendarDate, to: CalendarDate): string {
  // Years only when the range spans two: "20 Dec 2025 – 5 Jan 2026".
  const withYear = from.slice(0, 4) !== to.slice(0, 4);
  const day = (date: CalendarDate) =>
    `${formatLondonShortDate(londonDayStart(date))}${withYear ? ` ${date.slice(0, 4)}` : ""}`;
  return from === to ? day(from) : `${day(from)} – ${day(to)}`;
}
