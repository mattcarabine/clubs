/**
 * The broadcast tale of the tape: each stat's label in the middle, Squad
 * Member A's figure on the left in blue and B's on the right in green, each
 * over a bar of their share, with the leader picked out.
 */
import { NO_VALUE } from "~/lib/number-format";

/** The note under a figure resting on fewer than `SMALL_SAMPLE` Matches. */
export const SMALL_SAMPLE_NOTE = "Fewer than 3 Matches: a small sample.";

/** One stat across the tape. */
export interface TapeRow {
  label: string;
  /** A's and B's figures; null shows "–". */
  values: readonly [number | null, number | null];
  format: (value: number) => string;
  /** Which way leads, or null when neither does (e.g. Matches played). */
  better: "higher" | "lower" | null;
  /** Each side's figure rests on fewer than 3 Matches. */
  smallSample?: readonly [boolean, boolean];
  /** Draw the share bars; off for figures that can go negative. */
  bars?: boolean;
}

type TaleOfTheTapeProps = {
  caption: string;
  /** A's and B's names, for the column headers. */
  names: readonly [string, string | null];
  rows: readonly TapeRow[];
};

export function TaleOfTheTape({ caption, names, rows }: TaleOfTheTapeProps) {
  const hasSmallSample = rows.some((r) => r.smallSample?.some(Boolean));
  return (
    <div className="border-shale-700 border-t-2 bg-shale-900">
      <table className="w-full table-fixed border-collapse text-sm tabular">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          <col />
          <col className="w-28 sm:w-44" />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th
              scope="col"
              className="truncate bg-sound-900 px-3 py-2 text-right font-display font-bold text-base text-ink uppercase tracking-wide"
            >
              {names[0]}
            </th>
            <th scope="col" className="bg-shale-800 px-1 py-2">
              <span className="sr-only">Stat</span>
            </th>
            <th
              scope="col"
              className={`truncate px-3 py-2 text-left font-display font-bold text-base uppercase tracking-wide ${names[1] ? "bg-rave text-shale-950" : "bg-shale-800 text-ink-muted"}`}
            >
              {names[1] ?? NO_VALUE}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <TapeRowView key={row.label} row={row} />
          ))}
        </tbody>
      </table>
      {hasSmallSample && (
        <p className="border-shale-700 border-t px-3 py-2 text-ink-muted text-xs">
          <span aria-hidden>* </span>
          {SMALL_SAMPLE_NOTE}
        </p>
      )}
    </div>
  );
}

function TapeRowView({ row }: { row: TapeRow }) {
  const leader = leadingSide(row);
  const [a, b] = row.values;
  const total = (a ?? 0) + (b ?? 0);
  const cell = (side: Side) => {
    const value = row.values[side];
    return (
      <TapeCell
        side={side}
        text={value === null ? NO_VALUE : row.format(value)}
        leads={leader === side}
        smallSample={value !== null && (row.smallSample?.[side] ?? false)}
        share={row.bars === false ? null : barShare(value, total)}
      />
    );
  };
  return (
    <tr className="border-shale-700 border-t first:border-t-0">
      {cell(0)}
      <th
        scope="row"
        className="px-1 text-center font-display font-bold text-ink-muted text-sm uppercase leading-tight tracking-wide sm:text-base"
      >
        {row.label}
      </th>
      {cell(1)}
    </tr>
  );
}

/** 0 is A, on the left; 1 is B, on the right. */
type Side = 0 | 1;

type TapeCellProps = {
  side: Side;
  text: string;
  leads: boolean;
  smallSample: boolean;
  /** The bar's length as a share of both figures, 0 to 100, or null for no bar. */
  share: number | null;
};

/** A figure's share of both, 0 to 100; nothing for a missing or non-positive one. */
function barShare(value: number | null, total: number): number {
  if (value === null || value <= 0 || total <= 0) return 0;
  return (value / total) * 100;
}

/** One side's figure, pointing at the label when it leads, over its share bar. */
function TapeCell({ side, text, leads, smallSample, share }: TapeCellProps) {
  const left = side === 0;
  return (
    <td
      data-leader={leads || undefined}
      className={`px-3 py-2.5 ${left ? "text-right" : "text-left"}`}
    >
      <span
        className={`inline-flex items-baseline gap-1.5 font-display text-2xl leading-none sm:text-3xl ${left ? "flex-row-reverse" : ""} ${leads ? "font-extrabold text-ink" : "font-bold text-ink-soft"}`}
      >
        <span data-figure>{text}</span>
        {leads && (
          <>
            <span aria-hidden className="text-rave text-xs">
              {left ? "▶" : "◀"}
            </span>
            <span className="sr-only">(leads)</span>
          </>
        )}
        {smallSample && (
          <span className="font-sans text-ink-muted text-sm">
            *<span className="sr-only">small sample</span>
          </span>
        )}
      </span>
      {share !== null && (
        <span
          aria-hidden
          className={`mt-1.5 flex h-1.5 bg-shale-800 ${left ? "justify-end" : ""}`}
        >
          <span
            className={`${left ? "bg-sound-300" : "bg-rave"} ${leads ? "" : "opacity-50"}`}
            style={{ width: `${share}%` }}
          />
        </span>
      )}
    </td>
  );
}

/** 0 for A, 1 for B, or null when level, either is missing, or neither way leads. */
export function leadingSide(row: TapeRow): Side | null {
  const [a, b] = row.values;
  if (row.better === null || a === null || b === null || a === b) return null;
  return a > b === (row.better === "higher") ? 0 : 1;
}
