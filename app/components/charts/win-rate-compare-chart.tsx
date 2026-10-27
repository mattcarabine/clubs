import { formatPercentage } from "~/lib/number-format";
import type { ComparedBucket } from "~/stats/period-compare";
import type { SplitBucket } from "~/stats/trends";

import { SmallSampleTag } from "../tag";
import { SERIES_COLORS } from "./chart-frame";

type WinRateCompareChartProps = {
  /** Names the chart for screen readers. */
  label: string;
  buckets: readonly ComparedBucket[];
  /** How each side is named, e.g. "Last 7 days" and "7 days before". */
  sides: { current: string; previous: string };
};

/** This period first, in series-1; the earlier one in series-2, as the legend keys them. */
const SIDE_COLOR = { current: SERIES_COLORS[0], previous: SERIES_COLORS[1] };

/**
 * Win % by bucket for two periods (CLUBS-60): a pair of bars per bucket on a
 * fixed 0 to 100 scale, each with its Matches played in brackets, and a
 * "Small sample" tag when either side has few. Every bar carries its value,
 * so it needs no tooltip; a bucket one side never played says so in words.
 */
export function WinRateCompareChart({
  label,
  buckets,
  sides,
}: WinRateCompareChartProps) {
  return (
    <ul aria-label={label} className="grid gap-3">
      {buckets.map((b) => (
        <li
          key={b.label}
          className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-center gap-x-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]"
        >
          <span className="flex flex-col items-start gap-1 text-ink-soft text-sm">
            {b.label}
            {b.smallSample && <SmallSampleTag />}
          </span>
          <span className="grid gap-1">
            <Bar
              side={sides.current}
              bucket={b.current}
              color={SIDE_COLOR.current}
            />
            <Bar
              side={sides.previous}
              bucket={b.previous}
              color={SIDE_COLOR.previous}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Bar({
  side,
  bucket,
  color,
}: {
  side: string;
  bucket: SplitBucket | null;
  color: string;
}) {
  const value = bucket?.winPercentage ?? 0;
  return (
    // The right padding reserves room for the value at the longest bar's tip.
    <span className="flex items-center pr-24">
      <span className="sr-only">{side}: </span>
      <span
        className="h-3 shrink-0 rounded-r"
        style={{ width: `${bucket ? value : 0}%`, background: color }}
      />
      <span className="-mr-24 shrink-0 pl-2 text-ink text-xs tabular">
        {bucket
          ? `${formatPercentage(value)} (${bucket.played})`
          : "Not played"}
      </span>
    </span>
  );
}
