import { axisLabelIndices, linearScale } from "./scale";
import { useElementWidth } from "./use-element-width";

export type StepMarker = "up" | "down";

export type StepChartPoint = {
  /** X-axis label, e.g. the date of the change. */
  label: string;
  /** Index into `levels`. */
  level: number;
  /** A move up or down, drawn as a triangle pointing that way. */
  marker?: StepMarker;
  /** What happened here, for the screen-reader table, e.g. "Promotion". */
  note: string;
};

type StepChartProps = {
  /** The y-axis levels, bottom first, e.g. Division 5 up to Elite. */
  levels: readonly string[];
  /** Oldest first. The line holds each level until the next point. */
  points: readonly StepChartPoint[];
  /** The label of the line's right end, e.g. "Now". */
  endLabel: string;
  /** Words for each marker, shown in the key (shape and word, never colour alone). */
  markerLabels: Record<StepMarker, string>;
  /** Names the chart for screen readers. */
  label: string;
  height?: number;
};

const M = { top: 12, right: 12, bottom: 28 };
/** Room for y labels: about one text-xs character each, plus a gap to the plot. */
const TICK_CHAR_WIDTH = 7;
const TICK_GAP = 12;
const MARKER_SIZE = 6;

/**
 * A step line over ordered levels (Division over time): the line holds a
 * level until the next change, with triangle markers for moves up and down.
 * Static, so no tooltip; a screen-reader table carries every point.
 */
export function StepChart({
  levels,
  points,
  endLabel,
  markerLabels,
  label,
  height = 220,
}: StepChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>(640);
  const labels = [...points.map((p) => p.label), endLabel];
  const last = labels.length - 1;
  const left =
    Math.max(...levels.map((l) => l.length)) * TICK_CHAR_WIDTH + TICK_GAP;
  const x = linearScale([0, Math.max(1, last)], [left, width - M.right]);
  const y = linearScale([0, levels.length - 1], [height - M.bottom, M.top]);
  const xLabels = axisLabelIndices(labels, x(1) - x(0));

  // Hold each level until the next point, then step; the last runs to the end.
  const path = `M${x(0)},${y(points[0]?.level ?? 0)}${points
    .map((p, i) => `V${y(p.level)}H${x(i + 1)}`)
    .join("")}`;

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
          {levels.map((level, i) => (
            <g key={level}>
              <line
                x1={left}
                x2={width - M.right}
                y1={y(i)}
                y2={y(i)}
                stroke={
                  i === 0 ? "var(--color-shale-600)" : "var(--color-shale-700)"
                }
                strokeWidth={1}
              />
              <text
                x={left - 8}
                y={y(i)}
                dy="0.32em"
                textAnchor="end"
                className="fill-ink-muted text-xs"
              >
                {level}
              </text>
            </g>
          ))}
          {xLabels.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 8}
              textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
              className="fill-ink-muted text-xs"
            >
              {labels[i]}
            </text>
          ))}
          <path
            d={path}
            fill="none"
            stroke="var(--color-series-1)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {points.map((p, i) => (
            <Marker
              // biome-ignore lint/suspicious/noArrayIndexKey: points are positional
              key={i}
              cx={x(i)}
              cy={y(p.level)}
              marker={p.marker}
            />
          ))}
        </svg>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-ink-soft text-sm">
        {(["up", "down"] as const).map((marker) => (
          <li key={marker} className="flex items-center gap-2">
            <svg aria-hidden viewBox="-8 -8 16 16" className="size-3.5">
              <Marker cx={0} cy={0} marker={marker} />
            </svg>
            {markerLabels[marker]}
          </li>
        ))}
      </ul>
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Point</th>
              <th scope="col">Level</th>
              <th scope="col">Change</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: labels may repeat
              <tr key={i}>
                <th scope="row">{p.label}</th>
                <td>{levels[p.level]}</td>
                <td>{p.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const MARKER_FILL: Record<StepMarker, string> = {
  up: "var(--color-win)",
  down: "var(--color-loss)",
};

function Marker({
  cx,
  cy,
  marker,
}: {
  cx: number;
  cy: number;
  marker?: StepMarker;
}) {
  const ring = { stroke: "var(--color-shale-900)", strokeWidth: 2 };
  if (!marker) {
    return (
      <circle cx={cx} cy={cy} r={4} fill="var(--color-series-1)" {...ring} />
    );
  }
  const s = MARKER_SIZE;
  const tip = marker === "up" ? -s : s;
  return (
    <path
      d={`M${cx},${cy + tip}L${cx + s},${cy - tip}L${cx - s},${cy - tip}Z`}
      fill={MARKER_FILL[marker]}
      {...ring}
    />
  );
}
