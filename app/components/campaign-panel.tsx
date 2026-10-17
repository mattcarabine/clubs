import type { ReactNode } from "react";
import type { Outcome } from "~/lib/domain";
import { FormGuide } from "./form-guide";

/** Where the current Campaign is. */
export type CampaignPanelStage =
  | { kind: "league" }
  | {
      kind: "promotion-series";
      /** The most Matches the series can last. */
      matches: number;
      winsNeeded: number;
      /** The series so far, oldest first. */
      results: readonly Outcome[];
    }
  | {
      kind: "relegation-match";
      /** The Division a loss drops Our Club into. */
      divisionBelow: string;
    };

export type CampaignPanelProgress = {
  points: number;
  /** Null where the Division has no Points Target (Elite). */
  pointsTarget: number | null;
  /** Null where the Division can't be relegated (Division 5). */
  chances: { left: number; total: number } | null;
  /** The Campaign's League Matches, oldest first. */
  league: readonly Outcome[];
  stage: CampaignPanelStage;
};

type CampaignPanelProps = {
  /** "Division 4". */
  division: string;
  /** Omit before Campaign tracking starts: the panel then shows only the Division. */
  progress?: CampaignPanelProgress;
  /** Notes under the panel, e.g. the Playoffs or a tracking warning. */
  children?: ReactNode;
};

/** A segmented bar draws one segment per point up to this target; past it, a plain bar. */
const MAX_SEGMENTS = 30;

/**
 * The current Campaign as a broadcast league strip: the Division in a green
 * tab, Campaign points against the Points Target, Chances as pips, the League
 * Matches so far, and the Promotion Series or Relegation Match when one is on.
 */
export function CampaignPanel({
  division,
  progress,
  children,
}: CampaignPanelProps) {
  return (
    <section
      aria-label="Current Campaign"
      className="min-w-0 border-rave border-t-2 bg-shale-900"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pr-4">
        <h3 className="clip-slant-r bg-rave py-1 pr-8 pl-4 font-display font-extrabold text-2xl text-shale-950 uppercase italic tracking-wide [--slant:0.9rem] sm:text-3xl">
          {division}
        </h3>
        {progress && <StageLabel stage={progress.stage} />}
      </div>
      <div className="flex flex-col gap-5 p-4 sm:p-5">
        {progress && <CampaignProgress {...progress} />}
        {children}
      </div>
    </section>
  );
}

function StageLabel({ stage }: { stage: CampaignPanelStage }) {
  const text = {
    league: "League",
    "promotion-series": "Promotion Series",
    "relegation-match": "Relegation Match",
  }[stage.kind];
  return (
    <span className="pt-2 font-display font-bold text-ink-muted text-lg uppercase tracking-wide">
      {text}
    </span>
  );
}

function CampaignProgress({
  points,
  pointsTarget,
  chances,
  league,
  stage,
}: CampaignPanelProgress) {
  return (
    <>
      {stage.kind === "relegation-match" && (
        <p className="border-loss border-l-4 bg-shale-800 px-4 py-3 text-ink">
          <span className="block font-display font-extrabold text-2xl uppercase tracking-wide">
            Relegation Match next
          </span>
          <span className="text-ink-soft text-sm">
            All Chances used. Win to stay up, lose and we drop to{" "}
            {stage.divisionBelow}.
          </span>
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-8">
        <PointsMeter points={points} target={pointsTarget} />
        {chances && <ChancePips {...chances} />}
      </div>
      {stage.kind === "promotion-series" && <SeriesStrip {...stage} />}
      <div className="flex flex-col gap-2">
        <span className="text-ink-muted text-sm">
          {league.length === 0
            ? "No League Matches yet in this Campaign"
            : `League Matches (${league.length}), oldest first`}
        </span>
        <FormGuide results={league} />
      </div>
    </>
  );
}

function PointsMeter({
  points,
  target,
}: {
  points: number;
  target: number | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="flex items-baseline gap-2">
        <span className="font-display font-extrabold text-score text-ink italic tabular">
          {points}
        </span>
        {target !== null && (
          <span className="font-display font-extrabold text-3xl text-ink-muted tabular">
            / {target}
          </span>
        )}
        <span className="text-ink-soft text-sm">
          {target === null ? "points, no Points Target" : "points"}
        </span>
      </p>
      {target !== null && <PointsBar points={points} target={target} />}
    </div>
  );
}

function PointsBar({ points, target }: { points: number; target: number }) {
  const filled = Math.min(points, target);
  const segmented = target <= MAX_SEGMENTS;
  return (
    <div
      role="progressbar"
      aria-label="Campaign points against the Points Target"
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={filled}
      aria-valuetext={`${points} of ${target} points`}
      className="flex h-4 gap-0.5 [--slant:0.3rem]"
    >
      {segmented ? (
        Array.from({ length: target }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: one segment per point
            key={i}
            className={`clip-slant min-w-0 flex-1 ${i < filled ? "bg-rave" : "bg-shale-700"}`}
          />
        ))
      ) : (
        <span className="clip-slant-r flex-1 bg-shale-700">
          <span
            className="block h-full bg-rave"
            style={{ width: `${(filled / target) * 100}%` }}
          />
        </span>
      )}
    </div>
  );
}

function ChancePips({ left, total }: { left: number; total: number }) {
  return (
    <div className="flex flex-col gap-2">
      <span
        role="img"
        aria-label={`${left} of ${total} Chances left`}
        className="flex gap-1 [--slant:0.4rem]"
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: one pip per Chance
            key={i}
            className={`clip-slant h-6 w-8 ${i < left ? "bg-sound-300" : "border border-shale-600 bg-shale-800"}`}
          />
        ))}
      </span>
      <span aria-hidden className="text-ink-soft text-sm">
        {left === 1 ? "1 Chance left" : `${left} Chances left`}
      </span>
    </div>
  );
}

/** "2 of 3 Wins needed", or "4 Wins in a row needed" when every Match must be won. */
function seriesTarget(matches: number, winsNeeded: number): string {
  return winsNeeded === matches
    ? `${winsNeeded} Wins in a row needed`
    : `${winsNeeded} of ${matches} Wins needed`;
}

function SeriesStrip({
  matches,
  winsNeeded,
  results,
}: Extract<CampaignPanelStage, { kind: "promotion-series" }>) {
  const wins = results.filter((r) => r === "W").length;
  return (
    <div className="flex flex-col gap-2 border-rave border-l-4 bg-shale-800 px-4 py-3">
      <p className="font-display font-extrabold text-2xl text-ink uppercase tracking-wide">
        Promotion Series: {seriesTarget(matches, winsNeeded)}
      </p>
      <p className="text-ink-soft text-sm">
        {results.length === 0
          ? "Points Target reached. The series starts with the next League Match; a draw counts as a loss."
          : `${wins} won, ${results.length} of up to ${matches} played. A draw counts as a loss.`}
      </p>
      <FormGuide results={results} />
    </div>
  );
}
