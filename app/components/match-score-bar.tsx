import type { ReactNode } from "react";
import { formatOptional, formatPercentage } from "~/lib/number-format";
import type { MatchSkillRatings, MatchSummary } from "~/stats/matches";
import type { MatchSides } from "~/stats/summaries";

import { RageQuitBadge } from "./rage-quit-badge";
import { ScoreBar, type ScoreBarStat } from "./score-bar";

type MatchScoreBarProps = {
  /** Our Club's name, always on the left in club blue. */
  clubName: string;
  match: Pick<
    MatchSummary,
    "matchType" | "opponent" | "goalsFor" | "goalsAgainst" | "outcome" | "dnf"
  >;
  size?: "hero" | "compact";
  /** When the Match was played, e.g. a `<LondonTime>`. */
  when?: ReactNode;
  /** Hero only: each club's Skill Rating, under its name. */
  skillRatings?: MatchSkillRatings;
  /** Hero only: both clubs' totals, for the stat strip. Hidden unless both sides have Appearances. */
  sides?: MatchSides;
};

/**
 * A ScoreBar for one Match from Our Club's side. The hero groups Match Type,
 * "Full time" or who rage quit and the kick-off into one tab cluster; compact
 * rows show the Match Type, a rage quit badge and the kick-off.
 */
export function MatchScoreBar({
  clubName,
  match,
  size = "compact",
  when,
  skillRatings,
  sides,
}: MatchScoreBarProps) {
  const hero = size === "hero";
  let status: ReactNode = null;
  if (match.dnf) status = <RageQuitBadge dnf outcome={match.outcome} />;
  else if (hero) status = "Full time";
  const ratings = hero ? skillRatings : undefined;
  const hasRatings =
    ratings !== undefined &&
    (ratings.ours !== null || ratings.opponent !== null);

  return (
    <>
      {hasRatings && (
        <p className="sr-only">{`Skill ratings at this Match: ${clubName} ${formatOptional(ratings.ours)}, ${match.opponent.name} ${formatOptional(ratings.opponent)}`}</p>
      )}
      <ScoreBar
        home={{
          name: clubName,
          score: match.goalsFor,
          isOurClub: true,
          detail: hasRatings && <SkillRating value={ratings.ours} />,
        }}
        away={{
          name: match.opponent.name,
          score: match.goalsAgainst,
          crestUrl: match.opponent.crestUrl,
          detail: hasRatings && <SkillRating value={ratings.opponent} />,
        }}
        size={size}
        label={match.matchType}
        meta={[status, when]}
        outcome={match.outcome}
        stats={hero && sides ? keyStats(sides) : undefined}
      />
    </>
  );
}

function SkillRating({ value }: { value: number | null }) {
  return (
    <>
      Skill rating{" "}
      <span className="font-display font-extrabold text-ink tabular">
        {formatOptional(value)}
      </span>
    </>
  );
}

/** Shots, pass % and tackles for both clubs, or none unless both sides have Appearances. */
function keyStats({ ours, theirs }: MatchSides): ScoreBarStat[] | undefined {
  if (ours.appearances === 0 || theirs.appearances === 0) return undefined;
  return [
    { label: "Shots", home: String(ours.shots), away: String(theirs.shots) },
    {
      label: "Pass %",
      home: formatPercentage(ours.passPercentage),
      away: formatPercentage(theirs.passPercentage),
    },
    {
      label: "Tackles",
      home: String(ours.tacklesMade),
      away: String(theirs.tacklesMade),
    },
  ];
}
