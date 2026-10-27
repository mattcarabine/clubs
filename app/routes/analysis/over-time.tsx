/**
 * Analysis's "Over time" (ADR 0008, from Trends): EA's Skill Rating each time
 * it changed and the Division history. Neither follows the filters.
 */
import {
  ChartFrame,
  EmptyState,
  LineChart,
  SectionHeading,
} from "~/components";
import { formatSigned } from "~/lib/number-format";

import { type CampaignsView, DivisionHistory } from "./campaigns";

export interface SkillRatingView {
  labels: string[];
  values: number[];
}

export function OverTimeSection({
  skillRating,
  campaigns,
}: {
  skillRating: SkillRatingView;
  campaigns: CampaignsView;
}) {
  return (
    <section aria-label="Over time" className="flex flex-col gap-6">
      <SectionHeading
        title="Over time"
        subtitle="EA's Skill Rating and our Division since tracking began. Not affected by the filters."
      />
      <SkillRatingSection skillRating={skillRating} />
      <DivisionHistory view={campaigns} />
    </section>
  );
}

function SkillRatingSection({ skillRating }: { skillRating: SkillRatingView }) {
  return (
    <section aria-label="Skill rating" className="min-w-0">
      {skillRating.values.length === 0 ? (
        <EmptyState
          title="No skill rating yet"
          description="The rating appears after the first Poll that records club totals."
        />
      ) : (
        <ChartFrame
          title={`Skill rating now ${skillRating.values.at(-1)}`}
          subtitle={skillRatingChange(skillRating.values)}
        >
          {skillRating.values.length > 1 ? (
            <LineChart
              label="Skill rating over time"
              labels={skillRating.labels}
              series={[
                { id: "sr", label: "Skill rating", values: skillRating.values },
              ]}
              includeZero={false}
              formatTick={String}
              integerTicks
            />
          ) : (
            <p className="text-ink-soft text-sm">
              The line starts once EA's rating changes.
            </p>
          )}
        </ChartFrame>
      )}
    </section>
  );
}

function skillRatingChange(values: readonly number[]): string {
  if (values.length < 2) return "One reading so far";
  const change = values[values.length - 1] - values[0];
  return `${formatSigned(change)} since ${values[0]}`;
}
