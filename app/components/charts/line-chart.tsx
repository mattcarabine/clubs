import { type KeyboardEvent, type PointerEvent, useState } from "react";
import { ChartDataTable } from "./chart-data-table";
import {
  DASH,
  MAX_SERIES,
  type SeriesColor,
  SeriesSwatch,
  seriesColor,
} from "./chart-frame";
import {
  axisLabelIndices,
  formatCompact,
  linearScale,
  niceTicks,
} from "./scale";
import { useElementWidth } from "./use-element-width";

export type LineSeries = {
  id: string;
  label: string;
  /** One value per entry in `labels`; null leaves a gap. */
  values: readonly (number | null)[];
  /**
   * A `SERIES_COLORS` entry, for series that pair up (each of two Squad
   * Members' rating and its average share a colour). Defaults to the
   * series' place in the fixed order.
   */
  color?: SeriesColor;
  /** Dashed, to tell a paired series apart without colour. */
  dashed?: boolean;
};

type LineChartProps = {
  /** X-axis categories in order, e.g. Match dates or "MD 1".."MD 10". */
  labels: readonly string[];
  /** Up to four series, coloured in fixed order. */
  series: readonly LineSeries[];
  /** Names the chart for screen readers. */
  label: string;
  height?: number;
  formatValue?: (value: number) => string;
  /**
   * Keep zero on the y-axis (the default). Turn off for values that sit far
   * from zero, such as a skill rating, so the change is visible.
   */
  includeZero?: boolean;
  /** Y-axis tick labels; compact ("1.2K") by default. */
  formatTick?: (value: number) => string;
  /** Whole-number y ticks, for values that are never fractional. */
  integerTicks?: boolean;
  /** A dashed, labelled level to read the lines against, e.g. 50% for a Win %. */
  reference?: { value: number; label: string };
};

const M = { top: 12, right: 12, bottom: 28 };
/** Room for y tick labels: about one text-xs character each, plus a gap to the plot. */
const TICK_CHAR_WIDTH = 7;
const TICK_GAP = 12;

/**
 * Multi-series line chart with a snapping crosshair and tooltip. Hover, touch
 * or focus it and use the arrow keys; a screen-reader table carries every value.
 */
export function LineChart({
  labels,
  series,
  label,
  height = 240,
  formatValue = (v) => String(v),
  includeZero = true,
  formatTick = formatCompact,
  integerTicks = false,
  reference,
}: LineChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>(640);
  const [active, setActive] = useState<number | null>(null);
  const shown = series.slice(0, MAX_SERIES);
  const last = labels.length - 1;

  const all = shown.flatMap((s) => s.values.filter((v) => v != null));
  const fixed = [
    ...(includeZero ? [0] : []),
    ...(reference ? [reference.value] : []),
  ];
  let [lo, hi] = [Math.min(...fixed, ...all), Math.max(...fixed, ...all)];
  // A flat series away from zero still gets a band around it, not a 0-based axis.
  if (!includeZero && lo === hi) [lo, hi] = [lo - 1, hi + 1];
  const ticks = niceTicks(lo, hi, 4, { integer: integerTicks });
  const tickLabels = ticks.map(formatTick);
  const left =
    Math.max(...tickLabels.map((t) => t.length)) * TICK_CHAR_WIDTH + TICK_GAP;
  const x = linearScale([0, Math.max(1, last)], [left, width - M.right]);
  const y = linearScale(
    [ticks[0], ticks[ticks.length - 1]],
    [height - M.bottom, M.top],
  );

  const xLabels = axisLabelIndices(labels, x(1) - x(0));
  const indexAt = (clientX: number, rect: DOMRect) => {
    const ratio = (clientX - rect.left - left) / (width - left - M.right);
    return Math.min(last, Math.max(0, Math.round(ratio * last)));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) =>
    setActive(
      indexAt(event.clientX, event.currentTarget.getBoundingClientRect()),
    );

  const onKeyDown = (event: KeyboardEvent) => {
    const step = ARROW_STEP[event.key];
    if (step === undefined) return;
    event.preventDefault();
    setActive((i) => Math.min(last, Math.max(0, (i ?? last) + step)));
  };

  const current = active ?? last;
  const valueText = `${labels[current]}: ${shown
    .map((s) => `${s.label} ${formatPoint(s.values[current], formatValue)}`)
    .join(", ")}`;

  // The crosshair works like a slider over the points: arrow keys step through
  // them and screen readers hear each point's values. The data table sits
  // outside it because a slider's children are hidden from assistive tech.
  const chart = (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={last}
      aria-valuenow={current}
      aria-valuetext={valueText}
      className="relative w-full touch-pan-y"
      onPointerMove={onPointerMove}
      onPointerDown={onPointerMove}
      onPointerLeave={() => setActive(null)}
      onFocus={() => setActive((i) => i ?? last)}
      onBlur={() => setActive(null)}
      onKeyDown={onKeyDown}
    >
      <svg
        aria-hidden
        width={width}
        height={height}
        // Clips rather than overflows before the first measurement.
        className="block max-w-full"
      >
        {ticks.map((t, i) => (
          <g key={t}>
            <line
              x1={left}
              x2={width - M.right}
              y1={y(t)}
              y2={y(t)}
              stroke={
                t === 0 ? "var(--color-shale-600)" : "var(--color-shale-700)"
              }
              strokeWidth={1}
            />
            <text
              x={left - 8}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              className="fill-ink-muted text-xs tabular"
            >
              {tickLabels[i]}
            </text>
          </g>
        ))}
        {xLabels.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={height - 8}
            textAnchor={tickAnchor(i, last)}
            className="fill-ink-muted text-xs"
          >
            {labels[i]}
          </text>
        ))}
        {reference && (
          <g>
            <line
              x1={left}
              x2={width - M.right}
              y1={y(reference.value)}
              y2={y(reference.value)}
              stroke="var(--color-ink-muted)"
              strokeWidth={1}
              strokeDasharray={DASH}
            />
            <text
              x={left + 4}
              y={y(reference.value) - 6}
              textAnchor="start"
              className="fill-ink-muted text-xs"
            >
              {reference.label}
            </text>
          </g>
        )}
        {active != null && (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={M.top}
            y2={height - M.bottom}
            stroke="var(--color-ink-muted)"
            strokeWidth={1}
          />
        )}
        {shown.map((s, si) => {
          // One marker per series: at the crosshair, or on the latest value at rest.
          const markerAt = active ?? lastDefined(s.values);
          const markerValue = s.values[markerAt];
          const color = seriesColor(s, si);
          return (
            <g key={s.id}>
              <path
                d={toPath(s.values, x, y)}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? DASH : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {markerValue != null && (
                <circle
                  cx={x(markerAt)}
                  cy={y(markerValue)}
                  r={4}
                  fill={color}
                  stroke="var(--color-shale-900)"
                  strokeWidth={2}
                />
              )}
            </g>
          );
        })}
      </svg>
      {active != null && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 z-10 min-w-32 border-rave border-l-2 bg-shale-800 px-3 py-2 shadow-lg"
          style={
            x(active) > width / 2
              ? { right: width - x(active) + 8 }
              : { left: x(active) + 8 }
          }
        >
          <div className="mb-1 text-ink-muted text-xs">{labels[active]}</div>
          {shown.map((s, si) => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <SeriesSwatch
                color={seriesColor(s, si)}
                dashed={s.dashed}
                className="w-3"
              />
              <span className="font-semibold text-ink tabular">
                {formatPoint(s.values[active], formatValue)}
              </span>
              <span className="text-ink-soft">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full">
      {chart}
      <ChartDataTable
        caption={label}
        labels={labels}
        series={shown}
        formatCell={(v) => formatPoint(v, formatValue)}
      />
    </div>
  );
}

const ARROW_STEP: Partial<Record<string, 1 | -1>> = {
  ArrowRight: 1,
  ArrowLeft: -1,
};

/** Pins the first and last x labels inside the plot; centres the rest. */
function tickAnchor(index: number, last: number): "start" | "middle" | "end" {
  if (index === 0) return "start";
  if (index === last) return "end";
  return "middle";
}

function lastDefined(values: readonly (number | null)[]): number {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] != null) return i;
  }
  return -1;
}

function formatPoint(
  value: number | null | undefined,
  format: (value: number) => string,
): string {
  return value == null ? "–" : format(value);
}

/** SVG path that lifts the pen over null gaps. */
function toPath(
  values: readonly (number | null)[],
  x: (i: number) => number,
  y: (v: number) => number,
): string {
  let d = "";
  let penDown = false;
  values.forEach((v, i) => {
    if (v == null) {
      penDown = false;
      return;
    }
    d += `${penDown ? "L" : "M"}${x(i)},${y(v)}`;
    penDown = true;
  });
  return d;
}
