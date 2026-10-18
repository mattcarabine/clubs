import {
  ChartFrame,
  ChartLegend,
  EstimateTag,
  SectionHeading,
  WinChanceChart,
} from "~/components";
import { formatCount, formatDecimal } from "~/lib/number-format";
import { type CalibrationBand, MIN_FITTED_MATCHES } from "~/stats/win-chance";
import type { WinChanceAnalysis } from "~/stats/win-chance-query";

/**
 * "Win chance" (CLUBS-30): the curve of our Win Chance over the Skill Rating
 * gap with the filtered Matches on it, Wins against the Wins it expected,
 * and how often we won at each band of Win Chance.
 */
export function WinChanceSection({
  winChance,
}: {
  winChance: WinChanceAnalysis;
}) {
  const { model, points, unrated, vsExpected } = winChance;
  return (
    <section aria-label="Win chance" className="flex flex-col gap-4">
      <SectionHeading
        title="Win chance"
        subtitle="Our chance of a Win before kick-off from the Skill Rating gap: ours minus the Opponent's. Draws count as Dropped Points."
      />
      <div className="flex flex-wrap items-center gap-2 text-ink-muted text-sm">
        {model.source === "estimate" ? (
          <>
            <EstimateTag />
            <span>
              {`The Elo-style curve until there are ${MIN_FITTED_MATCHES} rated Matches (${model.matches} so far).`}
            </span>
          </>
        ) : (
          <span>
            {`Fitted to all ${model.matches} rated Competitive Matches.`}
          </span>
        )}
        {unrated > 0 && (
          <span>
            {`${formatCount(unrated, "Match", "Matches")} without Skill Ratings ${unrated === 1 ? "is" : "are"} left out.`}
          </span>
        )}
      </div>
      {points.length === 0 ? (
        <p className="text-ink-muted text-sm">
          No rated Matches in these filters yet.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-x-6">
          <ChartFrame
            title="Win chance by rating gap"
            subtitle="Each dot is a Match: at the top for a Win, at the bottom for Dropped Points."
            legend={<ChartLegend entries={WIN_CHANCE_LEGEND} />}
          >
            <WinChanceChart
              label="Win chance by Skill Rating gap"
              model={model}
              points={points}
            />
          </ChartFrame>
          <div className="flex min-w-0 flex-col gap-4">
            <section
              aria-label="Wins against expected"
              className="border-rave border-t-2 bg-sound-900 p-4"
            >
              <p className="font-display font-extrabold text-4xl text-ink uppercase italic leading-none tabular">
                {`${formatCount(vsExpected.wins, "Win", "Wins")} vs ${formatDecimal(vsExpected.expected)} expected`}
              </p>
              <p className="mt-2 text-ink-soft text-sm">
                {`Over ${formatCount(vsExpected.played, "rated Match", "rated Matches")} in these filters: ${verdict(vsExpected.wins, vsExpected.expected)}`}
              </p>
              {model.source === "fitted" &&
                vsExpected.played === model.matches && (
                  <p className="mt-2 text-ink-muted text-sm">
                    Over every Match it was fitted to, the curve expects as many
                    Wins as we got. Narrow the dates to see whether we are
                    beating it.
                  </p>
                )}
            </section>
            <CalibrationList bands={winChance.calibration} />
          </div>
        </div>
      )}
    </section>
  );
}

/** Whether we won more or fewer than the curve expected, to the nearest Win. */
function verdict(wins: number, expected: number): string {
  const gap = wins - expected;
  if (Math.abs(gap) < 0.5) return "in line with our rating.";
  return gap > 0 ? "beating our rating." : "below our rating.";
}

function CalibrationList({ bands }: { bands: CalibrationBand[] }) {
  return (
    <div className="border-shale-700 border-t-2 bg-shale-900 p-4">
      <h3 className="mb-2 font-display font-bold text-ink-muted text-lg uppercase tracking-wide">
        Calibration
      </h3>
      <ul aria-label="Calibration" className="flex flex-col gap-1 text-sm">
        {bands.map((band) => (
          <li key={band.from} className="text-ink-soft">
            {`Matches we were given ${band.from}–${band.to}%: won ${band.wins} of ${band.played}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

const WIN_CHANCE_LEGEND = [
  { id: "curve", label: "Win Chance" },
  { id: "matches", label: "Matches" },
];
