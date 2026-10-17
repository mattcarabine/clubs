import { type CSSProperties, useState } from "react";

import { SERIES_COLORS } from "~/components";
import { niceTicks } from "~/components/charts/scale";

export type GoalContributionDatum = {
  id: string;
  /** X-axis label, e.g. the Match date. */
  label: string;
  goals: number;
  assists: number;
};

type GoalContributionsChartProps = {
  data: readonly GoalContributionDatum[];
  /** Names the chart for screen readers. */
  label: string;
};

const PLOT_HEIGHT = 168;

/**
 * Goals and assists per Match as stacked columns, oldest first: goals in the
 * first series colour on the baseline, assists stacked above in the second.
 * Hover, tap or focus a column for its values; a screen-reader table has them all.
 */
export function GoalContributionsChart({
  data,
  label,
}: GoalContributionsChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const ticks = niceTicks(
    0,
    Math.max(1, ...data.map((d) => d.goals + d.assists)),
    3,
  );
  const top = ticks[ticks.length - 1];
  const pct = (value: number) => `${(value / top) * 100}%`;
  const current = active === null ? null : data[active];

  return (
    <div className="w-full">
      <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2">
        <div aria-hidden className="relative" style={{ height: PLOT_HEIGHT }}>
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
        <div
          aria-hidden
          className="relative"
          style={{ height: PLOT_HEIGHT }}
          onPointerLeave={() => setActive(null)}
        >
          {ticks.map((t) => (
            <span
              key={t}
              className={`absolute inset-x-0 h-px ${t === 0 ? "bg-shale-600" : "bg-shale-700"}`}
              style={{ bottom: pct(t) }}
            />
          ))}
          <div className="absolute inset-0 flex items-end">
            {data.map((d, i) => (
              <div
                key={d.id}
                className={`flex h-full min-w-0 flex-1 items-end justify-center ${active === i ? "bg-shale-800" : ""}`}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
              >
                <div className="flex h-full w-full max-w-4 flex-col-reverse px-px">
                  {d.goals > 0 && (
                    <span
                      className="block rounded-t-sm"
                      style={{
                        height: pct(d.goals),
                        background: SERIES_COLORS[0],
                      }}
                    />
                  )}
                  {d.assists > 0 && (
                    <span
                      // The 2px gap in the surface colour separates the stacked segments.
                      className="block rounded-t-sm border-shale-900 border-b-2"
                      style={{
                        height: pct(d.assists),
                        background: SERIES_COLORS[1],
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
          {current && active !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 min-w-28 border-rave border-l-2 bg-shale-800 px-3 py-2 shadow-lg"
              style={tooltipPosition(active, data.length)}
            >
              <div className="mb-1 text-ink-muted text-xs">{current.label}</div>
              <TooltipRow
                color={SERIES_COLORS[0]}
                value={current.goals}
                name="Goals"
              />
              <TooltipRow
                color={SERIES_COLORS[1]}
                value={current.assists}
                name="Assists"
              />
            </div>
          )}
        </div>
        <div />
        {/* Only the first and last dates, so labels never collide or overflow. */}
        <div
          aria-hidden
          className="mt-2 flex justify-between gap-2 text-ink-muted text-xs"
        >
          <span>{data[0]?.label}</span>
          {data.length > 1 && <span>{data[data.length - 1].label}</span>}
        </div>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Match</th>
            <th scope="col">Goals</th>
            <th scope="col">Assists</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.id}>
              <th scope="row">{d.label}</th>
              <td>{d.goals}</td>
              <td>{d.assists}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Beside the active column, on whichever side has more room. */
function tooltipPosition(active: number, count: number): CSSProperties {
  if (active >= count / 2) {
    return { right: `${100 - (active / count) * 100}%` };
  }
  return { left: `${((active + 1) / count) * 100}%` };
}

function TooltipRow({
  color,
  value,
  name,
}: {
  color: string;
  value: number;
  name: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="size-2.5 rounded-sm" style={{ background: color }} />
      <span className="font-semibold text-ink tabular">{value}</span>
      <span className="text-ink-soft">{name}</span>
    </div>
  );
}
