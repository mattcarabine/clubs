import type { ReactNode } from "react";

/** Series colours in fixed order (validated for colour-blind separation). Never cycle past four. */
export const SERIES_COLORS = [
  "var(--color-series-1)",
  "var(--color-series-2)",
  "var(--color-series-3)",
  "var(--color-series-4)",
] as const;

export const MAX_SERIES = SERIES_COLORS.length;

export type SeriesColor = (typeof SERIES_COLORS)[number];

/** How a series or legend entry is drawn, when not by its place in the order. */
export type SeriesStyle = { color?: SeriesColor; dashed?: boolean };

/** A series' colour: its own, else its place in the fixed order. */
export function seriesColor(style: SeriesStyle, index: number): SeriesColor {
  return style.color ?? SERIES_COLORS[index];
}

/** The dash pattern of a `dashed` line series, matched by its swatches. */
export const DASH = "5 4";

/** A short line in a series' colour, dashed to match a dashed series. */
export function SeriesSwatch({
  color,
  dashed = false,
  className = "w-4",
}: {
  color: string;
  dashed?: boolean;
  className?: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 16 2" className={`h-0.5 ${className}`}>
      <line
        x1={0}
        x2={16}
        y1={1}
        y2={1}
        stroke={color}
        strokeWidth={2}
        strokeDasharray={dashed ? DASH : undefined}
      />
    </svg>
  );
}

type ChartFrameProps = {
  title: string;
  subtitle?: string;
  /** Usually a <ChartLegend>; required for two or more series. */
  legend?: ReactNode;
  children: ReactNode;
};

/** Titled panel every chart sits in, so charts look the same on every page. */
export function ChartFrame({
  title,
  subtitle,
  legend,
  children,
}: ChartFrameProps) {
  return (
    <figure className="min-w-0 border-shale-700 border-t-2 bg-shale-900 p-4 sm:p-5">
      <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <span>
          <span className="block font-display font-extrabold text-2xl text-ink uppercase leading-tight tracking-wide">
            {title}
          </span>
          {subtitle && (
            <span className="block text-ink-muted text-sm">{subtitle}</span>
          )}
        </span>
        {legend}
      </figcaption>
      {children}
    </figure>
  );
}

export type LegendEntry = { id: string; label: string } & SeriesStyle;

/** Legend keyed with short line strokes, mirroring line marks. */
export function ChartLegend({
  entries,
  mark = "line",
}: {
  entries: readonly LegendEntry[];
  mark?: "line" | "box";
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-ink-soft text-sm">
      {entries.map((entry, i) => (
        <li key={entry.id} className="flex items-center gap-2">
          {mark === "line" ? (
            <SeriesSwatch color={seriesColor(entry, i)} dashed={entry.dashed} />
          ) : (
            <span
              aria-hidden
              className="size-3 rounded-sm"
              style={{ background: seriesColor(entry, i) }}
            />
          )}
          {entry.label}
        </li>
      ))}
    </ul>
  );
}
