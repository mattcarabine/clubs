import {
  ChartFrame,
  EstimateTag,
  GapBandChart,
  GapBandLegend,
  SectionHeading,
} from "~/components";
import { formatCount, formatDecimal } from "~/lib/number-format";
import { MIN_FITTED_MATCHES } from "~/stats/win-chance";
import type { WinChanceAnalysis } from "~/stats/win-chance-query";

/**
 * "Win chance" (CLUBS-30): our Wins against the Wins the curve expected, then
 * the filtered Matches' results by band of Skill Rating gap against the Wins
 * expected (CLUBS-69).
 */
export function WinChanceSection({
  winChance,
}: {
  winChance: WinChanceAnalysis;
}) {
  const { model, bands, unrated, vsExpected } = winChance;
  return (
    <section aria-label="Win chance" className="flex flex-col gap-4">
      <SectionHeading
        title="Win chance"
        subtitle="Our chance of a Win before kick-off from the Skill Rating gap: ours minus the Opponent's. A draw counts against us, like a defeat."
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
      {bands.length === 0 ? (
        <p className="text-ink-muted text-sm">
          No rated Matches in these filters yet.
        </p>
      ) : (
        <>
          <section
            aria-label="Wins against expected"
            className="flex flex-col gap-2 border-rave border-t-2 bg-sound-900 p-4 lg:flex-row lg:items-center lg:gap-8 lg:p-6"
          >
            <p className="shrink-0 font-display font-extrabold text-4xl text-ink uppercase italic leading-none tabular lg:text-5xl">
              {`${formatCount(vsExpected.wins, "Win", "Wins")} vs ${formatDecimal(vsExpected.expected)} expected`}
            </p>
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-ink-soft">
                {`Over ${formatCount(vsExpected.played, "rated Match", "rated Matches")} in these filters: ${verdict(vsExpected.wins, vsExpected.expected)}`}
              </p>
              {model.source === "fitted" &&
                vsExpected.played === model.matches && (
                  <p className="text-ink-muted">
                    Over every Match it was fitted to, the curve expects as many
                    Wins as we got. Narrow the dates to see whether we are
                    beating it.
                  </p>
                )}
            </div>
          </section>
          <ChartFrame
            title="Results by rating gap"
            subtitle="Our Skill Rating minus the Opponent's: below 0 they were rated higher. Green past the marker means we won more than expected."
            legend={<GapBandLegend />}
          >
            <GapBandChart label="Results by Skill Rating gap" bands={bands} />
          </ChartFrame>
        </>
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
