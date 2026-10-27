import { OUTCOME_LABEL, type Outcome } from "~/lib/domain";
import {
  formatCount,
  formatDecimal,
  formatPercentage,
} from "~/lib/number-format";
import { type GapBand, gapBandLabel } from "~/stats/win-chance";

import { OUTCOME_FILL } from "../outcome-badge";

type GapBandChartProps = {
  /** Bands in order, biggest underdog first. */
  bands: readonly GapBand[];
  /** Names the chart for screen readers. */
  label: string;
};

/** A segment narrower than this share of its bar drops its "3W" label. */
const MIN_LABELLED_SHARE = 0.12;

/**
 * Results by rating gap (CLUBS-69): one row per band of Skill Rating gap, a
 * 100% bar of Wins, draws and defeats in the outcome colours with a marker
 * at the Win % the curve expected, and the counts in words below it. Hovering
 * a bar shows the expected and actual Win % (CLUBS-73); the words carry the
 * expected Win % too, for touch, and a screen-reader table carries them all.
 */
export function GapBandChart({ bands, label }: GapBandChartProps) {
  return (
    <div className="w-full">
      <ul aria-hidden className="grid gap-3">
        {bands.map((band) => {
          const name = gapBandLabel(band);
          const expectedShare = band.expectedWins / band.played;
          return (
            <li
              key={name}
              className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]"
            >
              <span className="flex flex-col">
                <span className="font-semibold text-ink text-sm tabular">
                  {name}
                </span>
                <span className="text-ink-muted text-xs">
                  {formatCount(band.played, "Match", "Matches")}
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-1.5 pt-0.5">
                <span className="group/bar relative flex h-4 gap-0.5">
                  {outcomeCounts(band).map(([outcome, count]) =>
                    count > 0 ? (
                      <span
                        key={outcome}
                        className={`flex items-center justify-center overflow-hidden font-display font-extrabold text-sm leading-none tabular ${OUTCOME_FILL[outcome]}`}
                        style={{ flexGrow: count, flexBasis: 0 }}
                      >
                        {count / band.played >= MIN_LABELLED_SHARE &&
                          `${count}${outcome}`}
                      </span>
                    ) : null,
                  )}
                  <ExpectedMarker
                    className="-inset-y-1 absolute -translate-x-1/2"
                    left={`${expectedShare * 100}%`}
                  />
                  <ExpectedTooltip band={band} expectedShare={expectedShare} />
                </span>
                <span className="text-ink-soft text-xs">
                  {`${resultsInWords(band)} · ${formatDecimal(band.expectedWins)} Wins expected (${formatPercentage(expectedShare * 100)})`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="sr-only">
        <table>
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Rating gap</th>
              <th scope="col">Played</th>
              <th scope="col">Won</th>
              <th scope="col">Drawn</th>
              <th scope="col">Lost</th>
              <th scope="col">Wins expected</th>
            </tr>
          </thead>
          <tbody>
            {bands.map((band) => (
              <tr key={gapBandLabel(band)}>
                <th scope="row">{gapBandLabel(band)}</th>
                <td>{band.played}</td>
                <td>{band.wins}</td>
                <td>{band.draws}</td>
                <td>{band.losses}</td>
                <td>{formatDecimal(band.expectedWins)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The key for the chart: each outcome's colour and the Expected marker. */
export function GapBandLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-ink-soft text-sm">
      {(["W", "D", "L"] as const).map((outcome) => (
        <li key={outcome} className="flex items-center gap-2">
          <span
            aria-hidden
            className={`size-3 rounded-sm ${OUTCOME_FILL[outcome]}`}
          />
          {OUTCOME_LABEL[outcome]}
        </li>
      ))}
      <li className="flex items-center gap-2">
        <span aria-hidden className="relative h-4 w-1">
          <ExpectedMarker className="inset-y-0 absolute" left="0" />
        </span>
        Expected Win %
      </li>
    </ul>
  );
}

/** A white tick edged in page background, so it reads on every outcome colour. */
function ExpectedMarker({
  className,
  left,
}: {
  className: string;
  left: string;
}) {
  return (
    <span
      className={`w-1 border-shale-950 border-x bg-ink ${className}`}
      style={{ left }}
    />
  );
}

/**
 * The band's expected and actual Win % over its bar while the pointer is on
 * it, styled like the LineChart's tooltip and kept on the bar's side of the
 * marker so it never runs past the chart.
 */
function ExpectedTooltip({
  band,
  expectedShare,
}: {
  band: GapBand;
  expectedShare: number;
}) {
  const at = expectedShare * 100;
  return (
    <span
      className="pointer-events-none absolute bottom-full z-10 mb-2 hidden min-w-36 border-rave border-l-2 bg-shale-800 px-3 py-2 group-hover/bar:block"
      style={at > 50 ? { right: `${100 - at}%` } : { left: `${at}%` }}
    >
      <span className="mb-1 block text-ink-muted text-xs">
        {gapBandLabel(band)}
      </span>
      <span className="flex items-center gap-2 text-sm">
        <span aria-hidden className="relative h-3 w-1">
          <ExpectedMarker className="inset-y-0 absolute" left="0" />
        </span>
        <span className="font-semibold text-ink tabular">
          {formatPercentage(at)}
        </span>
        <span className="text-ink-soft">Expected Win %</span>
      </span>
      <span className="flex items-center gap-2 text-sm">
        <span aria-hidden className={`size-3 rounded-sm ${OUTCOME_FILL.W}`} />
        <span className="font-semibold text-ink tabular">
          {formatPercentage((band.wins / band.played) * 100)}
        </span>
        <span className="text-ink-soft">Win %</span>
      </span>
    </span>
  );
}

function outcomeCounts(band: GapBand): [Outcome, number][] {
  return [
    ["W", band.wins],
    ["D", band.draws],
    ["L", band.losses],
  ];
}

/** "3 won, 1 lost": the outcomes that happened, in W/D/L order. */
function resultsInWords(band: GapBand): string {
  const words: Record<Outcome, string> = { W: "won", D: "drawn", L: "lost" };
  return outcomeCounts(band)
    .filter(([, count]) => count > 0)
    .map(([outcome, count]) => `${count} ${words[outcome]}`)
    .join(", ");
}
