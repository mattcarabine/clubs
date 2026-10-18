import { formatPercentage, formatSigned } from "~/lib/number-format";
import {
  type WinChanceModel,
  type WinChancePoint,
  winChance,
} from "~/stats/win-chance";

import { SERIES_COLORS } from "./chart-frame";
import { linearScale, niceTicks, tickAnchor } from "./scale";
import { useElementWidth } from "./use-element-width";

type WinChanceChartProps = {
  /** The Win Chance curve. */
  model: Pick<WinChanceModel, "intercept" | "slope">;
  /** The rated Matches, drawn at 100% for a Win and 0% for Dropped Points. */
  points: readonly WinChancePoint[];
  /** Names the chart for screen readers. */
  label: string;
  height?: number;
};

const M = { top: 12, right: 16, bottom: 28, left: 44 };
const Y_TICKS = [0, 25, 50, 75, 100];
/** How far, in percentage points, a dot may sit off 0% or 100% so close gaps don't hide each other. */
const JITTER = 6;
/** Points sampled along the curve. */
const CURVE_STEPS = 64;
/** The smallest x-axis reach either side of an even gap, in rating points. */
const MIN_GAP_REACH = 100;

/**
 * Win Chance against the rating gap: the curve, with each rated Match as a
 * dot at 100% (Win) or 0% (Dropped Points), nudged off the line so dots at
 * similar gaps stay visible. Static, so no tooltip; a screen-reader table
 * carries every Match.
 */
export function WinChanceChart({
  model,
  points,
  label,
  height = 240,
}: WinChanceChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>(640);
  const gaps = points.map((p) => p.gap);
  const xTicks = niceTicks(
    Math.min(-MIN_GAP_REACH, ...gaps),
    Math.max(MIN_GAP_REACH, ...gaps),
    width < 480 ? 3 : 6,
  );
  const domain = [xTicks[0], xTicks[xTicks.length - 1]] as const;
  const x = linearScale(domain, [M.left, width - M.right]);
  const y = linearScale([0, 100], [height - M.bottom, M.top]);
  const curve = Array.from({ length: CURVE_STEPS + 1 }, (_, i) => {
    const gap = domain[0] + ((domain[1] - domain[0]) * i) / CURVE_STEPS;
    return `${i === 0 ? "M" : "L"}${x(gap)},${y(winChance(model, gap) * 100)}`;
  }).join("");

  return (
    <div className="w-full">
      <div ref={ref} className="w-full">
        <svg
          role="img"
          aria-label={label}
          width={width}
          height={height}
          className="block max-w-full"
        >
          {Y_TICKS.map((tick) => (
            <g key={tick}>
              <line
                x1={M.left}
                x2={width - M.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={
                  tick === 0
                    ? "var(--color-shale-600)"
                    : "var(--color-shale-700)"
                }
                strokeWidth={1}
              />
              <text
                x={M.left - 8}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
                className="fill-ink-muted text-xs"
              >
                {`${tick}%`}
              </text>
            </g>
          ))}
          {xTicks.map((tick, i) => (
            <text
              key={tick}
              x={x(tick)}
              y={height - 8}
              textAnchor={tickAnchor(i, xTicks.length - 1)}
              className="fill-ink-muted text-xs"
            >
              {formatSigned(tick)}
            </text>
          ))}
          {points.map((p, i) => (
            <circle
              // biome-ignore lint/suspicious/noArrayIndexKey: points are positional
              key={i}
              cx={x(p.gap)}
              cy={y(p.won ? 100 - jitter(i) : jitter(i))}
              r={4}
              fill={SERIES_COLORS[1]}
              stroke="var(--color-shale-900)"
              strokeWidth={2}
            />
          ))}
          <path
            d={curve}
            fill="none"
            stroke={SERIES_COLORS[0]}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Rating gap</th>
              <th scope="col">Win Chance</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: gaps may repeat
              <tr key={i}>
                <th scope="row">{formatSigned(p.gap)}</th>
                <td>{formatPercentage(winChance(model, p.gap) * 100)}</td>
                <td>{p.won ? "Win" : "Dropped Points"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A stable offset in [0, JITTER) for the i-th dot: the golden-ratio sequence spreads neighbours apart. */
function jitter(i: number): number {
  return ((i * 0.618034) % 1) * JITTER;
}
