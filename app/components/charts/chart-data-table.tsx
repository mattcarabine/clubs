import type { ReactNode } from "react";

type ChartDataTableProps = {
  caption: string;
  /** One row per label, in order. */
  labels: readonly string[];
  series: readonly {
    id: string;
    label: string;
    values: readonly (number | null)[];
  }[];
  /** A cell's text from its value (null or undefined where a series has none). */
  formatCell: (value: number | null | undefined) => ReactNode;
};

/** A category chart's data for screen readers: one row per label, one column per series. */
export function ChartDataTable({
  caption,
  labels,
  series,
  formatCell,
}: ChartDataTableProps) {
  return (
    // A clipped wrapper: a table never shrinks to sr-only's 1px, so on its
    // own a wide one would widen the page.
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Point</th>
            {series.map((s) => (
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
              {series.map((s) => (
                <td key={s.id}>{formatCell(s.values[i])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
