import {
  SectionHeading,
  type StatDelta,
  StatGrid,
  StatTile,
} from "~/components";
import { formatOptional } from "~/lib/number-format";
import type { ClubSnapshotSummary } from "~/stats";

/**
 * EA's own club totals as of the latest Poll (moved from Matchday, ADR 0008).
 * They include Matches from before tracking began, so the filters never apply.
 */
export function ClubSnapshot({ club }: { club: ClubSnapshotSummary }) {
  return (
    <section aria-label="Season snapshot" className="mb-8">
      <SectionHeading
        title="Season snapshot"
        subtitle="EA's club totals, as of the latest Poll. Not affected by the filters."
      />
      <StatGrid>
        <StatTile
          label="Skill rating"
          value={formatOptional(club.skillRating)}
          featured
          trend={club.skillRatingTrend}
          delta={skillRatingDelta(club.skillRatingChange)}
        />
        <StatTile
          label="Won, drawn, lost"
          value={
            <span className="text-4xl sm:text-5xl">
              {[club.wins, club.draws, club.losses]
                .map(formatOptional)
                .join("-")}
            </span>
          }
        />
        <StatTile label="Win streak" value={formatOptional(club.winStreak)} />
        <StatTile
          label="Unbeaten run"
          value={formatOptional(club.unbeatenStreak)}
        />
      </StatGrid>
    </section>
  );
}

/** The skill rating's last move, or nothing when it has not moved. */
function skillRatingDelta(change: number | null): StatDelta | undefined {
  if (change === null || change === 0) return undefined;
  const sign = change > 0 ? "+" : "";
  return {
    text: `${sign}${change} since last change`,
    tone: change > 0 ? "positive" : "negative",
  };
}
