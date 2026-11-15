/**
 * Analysis's "Over time" (ADR 0008, from Trends): EA's Skill Rating each time
 * it changed and the Division history. Neither follows the filters.
 */
import {
  ChartFrame,
  EmptyState,
  LineChart,
  LondonTime,
  SectionHeading,
} from "~/components";
import { formatCount, formatSigned } from "~/lib/number-format";
import type { UnlistedDay } from "~/stats";

import { type CampaignsView, DivisionHistory } from "./campaigns";

export interface SkillRatingView {
  labels: string[];
  values: number[];
  /** Matches EA counted but never listed (CLUBS-90), by London day, oldest first. */
  unlisted: UnlistedDay[];
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
        subtitle="How EA's skill rating and our division have moved. The filters don't change these."
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
          description="The rating appears once we've picked up EA's club totals."
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
          <UnlistedNote days={skillRating.unlisted} />
        </ChartFrame>
      )}
    </section>
  );
}

/** Why the rating moved with no match to show for it. */
function UnlistedNote({ days }: { days: readonly UnlistedDay[] }) {
  if (days.length === 0) return null;
  const total = days.reduce((sum, d) => sum + d.count, 0);
  return (
    <p className="mt-3 text-ink-muted text-sm">
      EA counted {formatCount(total, "match", "matches")} it never listed, so{" "}
      {total === 1 ? "it is" : "they are"} missing from this site:{" "}
      {days.map(({ day, count, ratingChange }, i) => (
        <span key={day.getTime()}>
          {i > 0 && ", "}
          {count} on <LondonTime date={day} format="day" />
          {ratingChange !== null && ` (rating ${formatSigned(ratingChange)})`}
        </span>
      ))}
      .
    </p>
  );
}

function skillRatingChange(values: readonly number[]): string {
  if (values.length < 2) return "One reading so far";
  const change = values[values.length - 1] - values[0];
  return `${formatSigned(change)} since ${values[0]}`;
}
