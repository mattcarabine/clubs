import { type KeyboardEvent, type PointerEvent, useState } from "react";
import { MAX_SERIES, SERIES_COLORS } from "./chart-frame";
import { formatCompact, linearScale, niceTicks } from "./scale";
import { useElementWidth } from "./use-element-width";

export type LineSeries = {
  id: string;
  label: string;
  /** One value per entry in `labels`; null leaves a gap. */
  values: readonly (number | null)[];
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
};

const M = { top: 12, right: 12, bottom: 28, left: 36 };

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
}: LineChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>(640);
  const [active, setActive] = useState<number | null>(null);
  const shown = series.slice(0, MAX_SERIES);

  const all = shown.flatMap((s) => s.values.filter((v) => v != null));
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const x = linearScale(
    [0, Math.max(1, labels.length - 1)],
    [M.left, width - M.right],
  );
  const y = linearScale(
    [ticks[0], ticks[ticks.length - 1]],
    [height - M.bottom, M.top],
  );

  const xTickEvery = Math.max(
    1,
    Math.ceil(labels.length / Math.floor(width / 72)),
  );
  const indexAt = (clientX: number, rect: DOMRect) => {
    const ratio = (clientX - rect.left - M.left) / (width - M.left - M.right);
    return Math.min(
      labels.length - 1,
      Math.max(0, Math.round(ratio * (labels.length - 1))),
    );
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) =>
    setActive(
      indexAt(event.clientX, event.currentTarget.getBoundingClientRect()),
    );

  const last = labels.length - 1;
  const onKeyDown = (event: KeyboardEvent) => {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
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
      onFocus={() => setActive(last)}
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
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={M.left}
              x2={width - M.right}
              y1={y(t)}
              y2={y(t)}
              stroke={
                t === 0 ? "var(--color-shale-600)" : "var(--color-shale-700)"
              }
              strokeWidth={1}
            />
            <text
              x={M.left - 8}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              className="fill-ink-muted text-xs tabular"
            >
              {formatCompact(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % xTickEvery === 0 || i === labels.length - 1 ? (
            <text
              // biome-ignore lint/suspicious/noArrayIndexKey: labels may repeat
              key={i}
              x={x(i)}
              y={height - 8}
              textAnchor={
                i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"
              }
              className="fill-ink-muted text-xs"
            >
              {l}
            </text>
          ) : null,
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
        {shown.map((s, si) => (
          <g key={s.id}>
            <path
              d={toPath(s.values, x, y)}
              fill="none"
              stroke={SERIES_COLORS[si]}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.values.map((v, i) =>
              v != null &&
              (i === active ||
                (active == null && i === lastDefined(s.values))) ? (
                <circle
                  // biome-ignore lint/suspicious/noArrayIndexKey: points are positional
                  key={i}
                  cx={x(i)}
                  cy={y(v)}
                  r={4}
                  fill={SERIES_COLORS[si]}
                  stroke="var(--color-shale-900)"
                  strokeWidth={2}
                />
              ) : null,
            )}
          </g>
        ))}
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
              <span
                className="h-0.5 w-3 rounded-full"
                style={{ background: SERIES_COLORS[si] }}
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
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Point</th>
            {shown.map((s) => (
              <th key={s.id} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: labels may repeat
            <tr key={i}>
              <th scope="row">{l}</th>
              {shown.map((s) => (
                <td key={s.id}>{formatPoint(s.values[i], formatValue)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
