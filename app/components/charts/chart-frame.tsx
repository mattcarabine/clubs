import type { ReactNode } from "react";

/** Series colours in fixed order (validated for colour-blind separation). Never cycle past four. */
export const SERIES_COLORS = [
  "var(--color-series-1)",
  "var(--color-series-2)",
  "var(--color-series-3)",
  "var(--color-series-4)",
] as const;

export const MAX_SERIES = SERIES_COLORS.length;

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

export type LegendEntry = { id: string; label: string };

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
          <span
            aria-hidden
            className={
              mark === "line" ? "h-0.5 w-4 rounded-full" : "size-3 rounded-sm"
            }
            style={{ background: SERIES_COLORS[i] }}
          />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}
