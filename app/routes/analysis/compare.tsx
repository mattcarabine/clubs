/**
 * "Compare to" on Analysis (CLUBS-60): the control that writes `?vs=`, and
 * the comparison it turns on: the headline figures for both periods with
 * their changes in words, and Win % by kick-off and by day side by side.
 */
import { useSearchParams } from "react-router";

import {
  ChangeArrow,
  ChartFrame,
  ChartLegend,
  Chip,
  ChipGroup,
  EmptyState,
  ScrollRail,
  SectionHeading,
  WinRateCompareChart,
} from "~/components";
import {
  formatCount,
  formatDecimal,
  formatPercentage,
} from "~/lib/number-format";
import {
  COMPARE_PARAM,
  type ComparedFigure,
  type CompareOptions,
  type CompareRequest,
  writeCompareRequest,
} from "~/stats/period-compare";
import type { PeriodComparisonView } from "~/stats/period-compare-query";

/** The `?vs=` chips the filter allows: the days before, or each other Season. */
export function CompareControl({
  options,
  active,
}: {
  options: CompareOptions;
  active: CompareRequest;
}) {
  const [, setSearchParams] = useSearchParams();
  const choose = (request: CompareRequest) =>
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        const value = writeCompareRequest(request);
        if (value === null) next.delete(COMPARE_PARAM);
        else next.set(COMPARE_PARAM, value);
        return next;
      },
      { preventScrollReset: true },
    );
  const choices: { request: CompareRequest; label: string }[] =
    options.kind === "period"
      ? [{ request: "previous", label: "The days before" }]
      : options.others.map((n) => ({ request: n, label: `Season ${n}` }));
  return (
    <div className="mb-8 border-shale-700 border-t-2 bg-shale-900">
      <ScrollRail className="px-3 py-3 sm:px-4">
        <ChipGroup label="Compare to">
          <Chip pressed={active === null} onClick={() => choose(null)}>
            Nothing
          </Chip>
          {choices.map(({ request, label }) => (
            <Chip
              key={label}
              pressed={active === request}
              onClick={() => choose(request)}
            >
              {label}
            </Chip>
          ))}
        </ChipGroup>
      </ScrollRail>
    </div>
  );
}

export function ComparisonSection({
  comparison,
}: {
  comparison: PeriodComparisonView;
}) {
  const { currentLabel, previousLabel, previousPlayed, figures } = comparison;
  const sides = { current: currentLabel, previous: previousLabel };
  return (
    <section aria-label="Comparison" className="flex flex-col gap-4">
      <SectionHeading
        title="Comparison"
        subtitle={`${currentLabel} against ${previousLabel}: ${formatCount(previousPlayed, "Match", "Matches")} then.`}
      />
      {previousPlayed === 0 ? (
        <EmptyState
          title={`No Matches in ${previousLabel}`}
          description="There is nothing to compare with yet. Pick another period, or check back once there are Matches in it."
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-1.5 sm:gap-3 lg:grid-cols-4">
            {figures.map((figure) => (
              <FigureTile key={figure.id} figure={figure} />
            ))}
          </dl>
          <div className="grid gap-4 lg:grid-cols-2 lg:gap-x-6">
            {(
              [
                ["By kick-off", "Win % by kick-off time", comparison.byKickoff],
                ["By day", "Win % by day of the week", comparison.byDay],
              ] as const
            ).map(([title, label, buckets]) => (
              <ChartFrame
                key={title}
                title={title}
                legend={
                  <ChartLegend
                    mark="box"
                    entries={[
                      { id: "current", label: currentLabel },
                      { id: "previous", label: previousLabel },
                    ]}
                  />
                }
              >
                <WinRateCompareChart
                  label={`${label}, compared`}
                  buckets={buckets}
                  sides={sides}
                />
              </ChartFrame>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function formatFigure(figure: ComparedFigure, value: number | null): string {
  return figure.unit === "pts"
    ? formatPercentage(value)
    : formatDecimal(value, 2);
}

/** "12 pts better" / "0.40 per Match worse" / "No change". */
function changeInWords(figure: ComparedFigure): string {
  const { change, good } = figure;
  if (change === null || change === 0 || good === null) return "No change";
  const size =
    figure.unit === "pts"
      ? `${formatDecimal(Math.abs(change), 0)} pts`
      : `${formatDecimal(Math.abs(change), 2)} per Match`;
  return `${size} ${good ? "better" : "worse"}`;
}

function FigureTile({ figure }: { figure: ComparedFigure }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-shale-700 border-t-2 bg-shale-900 p-3 sm:p-4">
      <dt className="text-ink-muted text-sm">{figure.label}</dt>
      <dd className="font-display font-extrabold text-3xl text-ink tabular sm:text-4xl">
        {formatFigure(figure, figure.current)}
      </dd>
      <dd className="text-ink-soft text-sm tabular">
        was {formatFigure(figure, figure.previous)}
      </dd>
      <dd className="flex items-center gap-1.5 text-ink text-sm">
        {figure.direction && (
          <ChangeArrow
            direction={figure.direction}
            good={figure.good ?? undefined}
            className="text-xs"
          />
        )}
        {changeInWords(figure)}
      </dd>
    </div>
  );
}
