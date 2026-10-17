export type BarDatum = {
  id: string;
  label: string;
  /** Zero or more; bars grow from a shared zero baseline. */
  value: number;
};

type BarChartProps = {
  data: readonly BarDatum[];
  /** Names the chart for screen readers. */
  label: string;
  formatValue?: (value: number) => string;
  /** Fix the scale's maximum to compare several charts; defaults to the largest value. */
  max?: number;
};

/**
 * Horizontal bar chart, the phone-friendly default for ranking Squad Members
 * or Opponents. Every bar carries its value at the tip, so no tooltip is needed.
 */
export function BarChart({
  data,
  label,
  formatValue = (v) => String(v),
  max,
}: BarChartProps) {
  const top = max ?? Math.max(0, ...data.map((d) => d.value));

  return (
    <ul aria-label={label} className="grid gap-1.5">
      {data.map((d) => {
        const pct = top > 0 ? (Math.max(0, d.value) / top) * 100 : 0;
        return (
          <li
            key={d.id}
            className="group grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]"
          >
            {/* Wraps onto a second line on phones rather than hiding the label's end. */}
            <span className="line-clamp-2 break-words text-ink-soft text-sm">
              {d.label}
            </span>
            {/* The right padding reserves room for the value at the longest bar's tip. */}
            <span className="flex items-center pr-14">
              <span
                className="h-4 shrink-0 rounded-r bg-series-1 transition-[filter] group-hover:brightness-125"
                style={{ width: `${pct}%` }}
              />
              <span className="-mr-14 shrink-0 pl-2 font-semibold text-ink text-sm tabular">
                {formatValue(d.value)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
