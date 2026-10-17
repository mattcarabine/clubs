import { linearScale } from "./scale";
import { useElementWidth } from "./use-element-width";

type SparklineProps = {
  values: readonly number[];
  /** Describes the trend for screen readers, e.g. "Goals in the last 10 Matches". */
  label: string;
  height?: number;
};

const PAD = 4;

/** A tiny trend line in the de-emphasis colour, with the latest point in rave green. */
export function Sparkline({ values, label, height = 32 }: SparklineProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>(120);
  if (values.length < 2) return null;

  const x = linearScale([0, values.length - 1], [PAD, width - PAD]);
  const y = linearScale(
    [Math.min(...values), Math.max(...values)],
    [height - PAD, PAD],
  );
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const last = values.length - 1;

  return (
    <div ref={ref} className="w-full">
      <svg
        role="img"
        aria-label={`${label}: ${values.join(", ")}`}
        width={width}
        height={height}
        className="block max-w-full overflow-visible"
      >
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-ink-muted)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={x(last)}
          cy={y(values[last])}
          r={4}
          fill="var(--color-rave)"
          stroke="var(--color-shale-900)"
          strokeWidth={2}
        />
      </svg>
    </div>
  );
}
