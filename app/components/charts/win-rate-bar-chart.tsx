import { formatPercentage } from "~/lib/number-format";
import type { SplitBucket } from "~/stats/trends";

import { BarChart } from "./bar-chart";

type WinRateBarChartProps = {
  /** Names the chart for screen readers. */
  label: string;
  buckets: readonly SplitBucket[];
};

/**
 * Win % by bucket (a weekday, a kick-off time, a Session place) on a fixed
 * 0 to 100 scale, with each bucket's Matches played in brackets.
 */
export function WinRateBarChart({ label, buckets }: WinRateBarChartProps) {
  return (
    <BarChart
      label={label}
      max={100}
      formatValue={formatPercentage}
      data={buckets.map((b) => ({
        id: b.label,
        label: `${b.label} (${b.played})`,
        value: b.winPercentage,
      }))}
    />
  );
}
