import type { ReactNode } from "react";
import type { MatchSummary } from "~/stats/matches";

import { DnfBadge } from "./dnf-badge";
import { ScoreBar } from "./score-bar";

type MatchScoreBarProps = {
  /** Our Club's name, always on the left in club blue. */
  clubName: string;
  match: Pick<
    MatchSummary,
    "matchType" | "opponent" | "goalsFor" | "goalsAgainst" | "outcome" | "dnf"
  >;
  size?: "hero" | "compact";
  /** Shown after the DNF badge in the tab row, e.g. the kick-off time or "FT". */
  status?: ReactNode;
};

/** A ScoreBar for one Match from Our Club's side: Match Type tab, DNF badge and result. */
export function MatchScoreBar({
  clubName,
  match,
  size,
  status,
}: MatchScoreBarProps) {
  return (
    <ScoreBar
      home={{ name: clubName, score: match.goalsFor, isOurClub: true }}
      away={{ name: match.opponent.name, score: match.goalsAgainst }}
      size={size}
      label={match.matchType}
      status={
        <>
          {match.dnf && <DnfBadge />}
          {status}
        </>
      }
      outcome={match.outcome}
    />
  );
}
