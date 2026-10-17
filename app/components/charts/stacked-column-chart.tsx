import { type CSSProperties, type KeyboardEvent, useState } from "react";

import { MAX_SERIES, SERIES_COLORS } from "./chart-frame";
import { niceTicks } from "./scale";

export type StackedColumnSeries = {
  id: string;
  label: string;
  /** One non-negative value per entry in `labels`. */
  values: readonly number[];
};

type StackedColumnChartProps = {
  /** X-axis categories in order, e.g. Match dates. Only the first and last are drawn. */
  labels: readonly string[];
  /** Up to four series, stacked from the baseline in fixed colour order. */
  series: readonly StackedColumnSeries[];
  /** Names the chart for screen readers. */
  label: string;
  height?: number;
};

/**
 * Vertical stacked columns over a time-ordered category axis, e.g. goals and
 * assists per Match. Hover, tap or focus it and use the arrow keys for each
 * column's values; a screen-reader table carries them all.
 */
export function StackedColumnChart({
  labels,
  series,
  label,
  height = 168,
}: StackedColumnChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const shown = series.slice(0, MAX_SERIES);
  const last = labels.length - 1;
  const totals = labels.map((_, i) =>
    shown.reduce((sum, s) => sum + (s.values[i] ?? 0), 0),
  );
  const ticks = niceTicks(0, Math.max(1, ...totals), 3);
  const top = ticks[ticks.length - 1];
  const pct = (value: number) => `${(value / top) * 100}%`;

  const onKeyDown = (event: KeyboardEvent) => {
    const step = ARROW_STEP[event.key];
    if (step === undefined) return;
    event.preventDefault();
    setActive((i) => Math.min(last, Math.max(0, (i ?? last) + step)));
  };

  const current = active ?? last;
  const valueText = `${labels[current]}: ${shown
    .map((s) => `${s.label} ${s.values[current] ?? 0}`)
    .join(", ")}`;

  return (
    <div className="w-full">
      <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2">
        <div aria-hidden className="relative" style={{ height }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 translate-y-1/2 text-ink-muted text-xs tabular"
              style={{ bottom: pct(t) }}
            >
              {t}
            </span>
          ))}
        </div>
        {/* A slider over the columns, like LineChart's crosshair. */}
        <div
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={current}
          aria-valuetext={valueText}
          className="relative touch-pan-y"
          style={{ height }}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((i) => i ?? last)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
        >
          {ticks.map((t) => (
            <span
              key={t}
              aria-hidden
              className={`absolute inset-x-0 h-px ${t === 0 ? "bg-shale-600" : "bg-shale-700"}`}
              style={{ bottom: pct(t) }}
            />
          ))}
          <div aria-hidden className="absolute inset-0 flex items-end">
            {labels.map((l, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: labels may repeat
                key={i}
                title={l}
                className={`flex h-full min-w-0 flex-1 items-end justify-center ${active === i ? "bg-shale-800" : ""}`}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
              >
                <div className="flex h-full w-full max-w-4 flex-col-reverse px-px">
                  {shown.map((s, si) =>
                    (s.values[i] ?? 0) > 0 ? (
                      <span
                        key={s.id}
                        // Above the first segment, a 2px surface gap separates the stack.
                        className={`block rounded-t-sm ${si > 0 ? "border-shale-900 border-b-2" : ""}`}
                        style={{
                          height: pct(s.values[i]),
                          background: SERIES_COLORS[si],
                        }}
                      />
                    ) : null,
                  )}
                </div>
              </div>
            ))}
          </div>
          {active !== null && (
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 z-10 min-w-28 border-rave border-l-2 bg-shale-800 px-3 py-2 shadow-lg"
              style={tooltipPosition(active, labels.length)}
            >
              <div className="mb-1 text-ink-muted text-xs">
                {labels[active]}
              </div>
              {shown.map((s, si) => (
                <div key={s.id} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2.5 rounded-sm"
                    style={{ background: SERIES_COLORS[si] }}
                  />
                  <span className="font-semibold text-ink tabular">
                    {s.values[active] ?? 0}
                  </span>
                  <span className="text-ink-soft">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div />
        {/* Only the first and last labels, so they never collide or overflow. */}
        <div
          aria-hidden
          className="mt-2 flex justify-between gap-2 text-ink-muted text-xs"
        >
          <span>{labels[0]}</span>
          {last > 0 && <span>{labels[last]}</span>}
        </div>
      </div>
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
                <td key={s.id}>{s.values[i] ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ARROW_STEP: Partial<Record<string, 1 | -1>> = {
  ArrowRight: 1,
  ArrowLeft: -1,
};

/** Beside the active column, on whichever side has more room. */
function tooltipPosition(active: number, count: number): CSSProperties {
  if (active >= count / 2) {
    return { right: `${100 - (active / count) * 100}%` };
  }
  return { left: `${((active + 1) / count) * 100}%` };
}
