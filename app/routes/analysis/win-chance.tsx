import {
  ChartFrame,
  EstimateTag,
  GapBandChart,
  GapBandLegend,
  SectionHeading,
} from "~/components";
import { formatCount, formatDecimal } from "~/lib/number-format";
import type { ByStrength } from "~/stats/outcome-split";
import { MIN_FITTED_MATCHES } from "~/stats/win-chance";
import type { WinChanceAnalysis } from "~/stats/win-chance-query";

import { StrengthPanel } from "./strength";

/**
 * "Win chance" (CLUBS-30): our Wins against the Wins the curve expected, then
 * the filtered Matches' results by band of Skill Rating gap against the Wins
 * expected (CLUBS-69), and by Opponent strength (CLUBS-29) once the Outcome
 * Split is ready (CLUBS-73).
 */
export function WinChanceSection({
  winChance,
  byStrength,
}: {
  winChance: WinChanceAnalysis;
  byStrength?: ByStrength;
}) {
  const { model, bands, unrated, vsExpected } = winChance;
  return (
    <section aria-label="Win chance" className="flex flex-col gap-4">
      <SectionHeading
        title="Win chance"
        subtitle="How likely we were to win before kick-off, judged by our skill rating against the opponent's."
      />
      <div className="flex flex-wrap items-center gap-2 text-ink-muted text-sm">
        {model.source === "estimate" ? (
          <>
            <EstimateTag />
            <span>
              {`A rough estimate until we have ${MIN_FITTED_MATCHES} matches with both skill ratings (${model.matches} so far).`}
            </span>
          </>
        ) : (
          <span>
            {`Based on our ${model.matches} matches with both skill ratings.`}
          </span>
        )}
        {unrated > 0 && (
          <span>
            {`${formatCount(unrated, "match", "matches")} without skill ratings ${unrated === 1 ? "is" : "are"} left out.`}
          </span>
        )}
      </div>
      {bands.length === 0 ? (
        <p className="text-ink-muted text-sm">
          No matches with skill ratings in these filters yet.
        </p>
      ) : (
        <>
          <section
            aria-label="Wins against expected"
            className="flex flex-col gap-2 border-rave border-t-2 bg-sound-900 p-4 lg:flex-row lg:items-center lg:gap-8 lg:p-6"
          >
            <p className="shrink-0 font-display font-extrabold text-4xl text-ink uppercase italic leading-none tabular lg:text-5xl">
              {`${formatCount(vsExpected.wins, "win", "wins")} vs ${formatDecimal(vsExpected.expected)} expected`}
            </p>
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-ink-soft">
                {`Over ${formatCount(vsExpected.played, "rated match", "rated matches")} in these filters: ${verdict(vsExpected.wins, vsExpected.expected)}`}
              </p>
              {model.source === "fitted" &&
                vsExpected.played === model.matches && (
                  <p className="text-ink-muted">
                    Across every match this always equals our wins, because the
                    estimate is built from them. Pick a date range to see if we
                    are beating it.
                  </p>
                )}
            </div>
          </section>
          <ChartFrame
            title="Results by rating gap"
            subtitle="Grouped by how far our skill rating was above or below the opponent's (minus means they were rated higher). Green past the white marker means we won more than expected."
            legend={<GapBandLegend />}
          >
            <GapBandChart label="Results by skill rating gap" bands={bands} />
          </ChartFrame>
          {byStrength && <StrengthPanel byStrength={byStrength} />}
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
