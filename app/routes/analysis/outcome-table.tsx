/**
 * Analysis's "Wins vs draws and defeats" (CLUBS-93): one panel for Our Club
 * and one for the Opponents. Each lists the stats that differ between Wins
 * and Dropped Points, biggest difference first, with the bigger figure in
 * bold over a pair of bars; the stats that are about the same either way
 * share one line underneath.
 */
import type { OutcomeSide } from "~/stats/outcome-split";
import {
  type PerformanceRow,
  type PerformanceTable,
  performanceTable,
} from "~/stats/outcome-split";

type Club = "ours" | "opponent";

const PANELS: Record<
  Club,
  { title: string; caption: string; rule: string; header: string }
> = {
  ours: {
    title: "Us",
    caption: "Performance in wins against draws and defeats",
    rule: "border-sound-700",
    header: "bg-sound-900",
  },
  opponent: {
    title: "Opponents",
    caption: "Opponents' performance in our wins against our draws and defeats",
    rule: "border-shale-600",
    header: "bg-shale-800",
  },
};

/** Each side's bar: wins in the win colour, named by the column header. */
const BAR: Record<OutcomeSide, string> = {
  wins: "bg-win",
  dropped: "bg-draw",
};

export function OutcomeTables({
  performance,
}: {
  performance: readonly PerformanceRow[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:gap-x-6">
      {(["ours", "opponent"] as const).map((club) => (
        <OutcomePanel
          key={club}
          club={club}
          table={performanceTable(performance, club)}
        />
      ))}
    </div>
  );
}

function OutcomePanel({
  club,
  table,
}: {
  club: Club;
  table: PerformanceTable;
}) {
  const panel = PANELS[club];
  return (
    <div className={`min-w-0 border-t-2 bg-shale-900 ${panel.rule}`}>
      <h3
        className={`px-3 py-2 font-display font-bold text-ink text-xl uppercase tracking-wide ${panel.header}`}
      >
        {panel.title}
      </h3>
      {table.rows.length > 0 ? (
        <table className="w-full table-fixed border-collapse text-sm tabular">
          <caption className="sr-only">{panel.caption}</caption>
          <colgroup>
            <col />
            <col className="w-[4.5rem] sm:w-28" />
            <col className="w-[4.5rem] sm:w-28" />
            <col className="w-16 sm:w-20" />
          </colgroup>
          <thead>
            <tr className="font-display font-bold text-ink-muted text-sm uppercase tracking-wide">
              <th scope="col" className="px-3 py-2 text-left">
                Stat
              </th>
              <th scope="col" className="px-2 py-2 text-right">
                Wins
              </th>
              <th scope="col" className="px-2 py-2 text-right leading-tight">
                Draws and defeats
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Gap
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.id} className="border-shale-700 border-t">
                <th
                  scope="row"
                  className="px-3 py-2.5 text-left font-semibold text-ink"
                >
                  {row.label}
                </th>
                <Figure side="wins" row={row} />
                <Figure side="dropped" row={row} />
                <td className="px-3 py-2.5 text-right align-top font-display font-bold text-ink-soft text-xl leading-none">
                  {row.gap}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-3 py-3 text-ink-soft text-sm">
          Nothing stands out between wins and draws or defeats yet.
        </p>
      )}
      {table.level.length > 0 && (
        <p
          data-level
          className="border-shale-700 border-t px-3 py-2.5 text-ink-muted text-sm"
        >
          <span className="font-semibold text-ink-soft">
            About the same either way:
          </span>{" "}
          {table.level.map((label) => label.toLowerCase()).join(", ")}.
        </p>
      )}
    </div>
  );
}

/** One side's figure, bold when it is the bigger, over its bar. */
function Figure({
  side,
  row,
}: {
  side: OutcomeSide;
  row: PerformanceTable["rows"][number];
}) {
  const other = side === "wins" ? "dropped" : "wins";
  const bigger = row.bars !== null && row.bars[side] > row.bars[other];
  // The bigger figure is emphasised for screen readers too.
  const FigureText = bigger ? "strong" : "span";
  return (
    <td className="px-2 py-2.5 text-right align-top">
      <FigureText
        data-bigger={bigger || undefined}
        className={`font-display text-xl leading-none ${bigger ? "font-extrabold text-ink" : "font-semibold text-ink-muted"}`}
      >
        {row[side]}
      </FigureText>
      {row.bars && (
        <span
          aria-hidden
          className="mt-1.5 flex h-1.5 justify-end bg-shale-800"
        >
          <span
            className={`${BAR[side]} ${bigger ? "" : "opacity-60"}`}
            style={{ width: `${row.bars[side]}%` }}
          />
        </span>
      )}
    </td>
  );
}
