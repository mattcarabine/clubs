import { Link } from "react-router";

import { playerPath, sessionPath } from "~/lib/paths";
import type { MilestoneEntry } from "~/stats/milestones-query";

import { LondonTime } from "./london-time";
import { MatchScoreBar } from "./match-score-bar";
import { Tag } from "./tag";

const LINK =
  "font-display font-bold text-base text-sound-300 uppercase tracking-wide hover:text-ink";

/** What a card shows of a stored Milestone. */
export type MilestoneCardData = Pick<
  MilestoneEntry,
  | "category"
  | "subject"
  | "playerId"
  | "name"
  | "headline"
  | "badge"
  | "figure"
  | "comment"
  | "match"
  | "sessionId"
>;

type MilestoneCardProps = {
  /** Our Club's name, for the Match's score strip. */
  clubName: string;
  milestone: MilestoneCardData;
  /** The Match's score strip and Session link; off on the Match's own page. */
  showMatch?: boolean;
  /** A link to the Squad Member's profile; off on the profile itself. */
  showProfile?: boolean;
};

/**
 * One Milestone: its figure as a scoreboard numeral, a badge for its kind,
 * the headline and the comment, then the Match it came in as a compact
 * score strip. Our Club's Milestones have a club-blue rule, badge and figure
 * panel; a Squad Member's are rave green. Records say "Since records began".
 */
export function MilestoneCard({
  clubName,
  milestone,
  showMatch = true,
  showProfile = true,
}: MilestoneCardProps) {
  const isClub = milestone.subject === "club";
  const { match, playerId } = milestone;
  return (
    <article
      aria-label={milestone.headline}
      className={`min-w-0 border-t-2 bg-shale-900 p-3 sm:p-4 ${isClub ? "border-sound-300" : "border-rave"}`}
    >
      <MilestoneBody milestone={milestone} />
      {(showMatch || (showProfile && playerId)) && (
        <div className="mt-3 flex flex-col gap-2">
          {showMatch && (
            <Link
              to={`/matches/${match.matchId}`}
              aria-label={`Match v ${match.opponent.name}`}
              className="block hover:opacity-90"
            >
              <MatchScoreBar
                clubName={clubName}
                match={match}
                when={<LondonTime date={match.playedAt} format="moment" />}
              />
            </Link>
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {showMatch && (
              <Link to={sessionPath(milestone.sessionId)} className={LINK}>
                Session <span aria-hidden>›</span>
              </Link>
            )}
            {showProfile && playerId && (
              <Link to={playerPath(playerId)} className={LINK}>
                {milestone.name}'s profile <span aria-hidden>›</span>
              </Link>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * A Milestone as a compact row, for a list that already shows its Match
 * (the Milestones page groups them under each Match's score strip): the
 * figure, badge, headline and comment, with a rule down the left in its
 * subject's colour and a link to the Squad Member's profile.
 */
export function MilestoneRow({
  milestone,
}: {
  milestone: Omit<MilestoneCardData, "match" | "sessionId">;
}) {
  const isClub = milestone.subject === "club";
  return (
    <article
      aria-label={milestone.headline}
      className={`min-w-0 border-l-2 bg-shale-900 py-3 pr-3 pl-3 sm:pr-4 ${isClub ? "border-sound-300" : "border-rave"}`}
    >
      <MilestoneBody milestone={milestone} size="row" />
      {milestone.playerId && (
        <Link
          to={playerPath(milestone.playerId)}
          className={`${LINK} mt-2 inline-block text-sm`}
        >
          {milestone.name}'s profile <span aria-hidden>›</span>
        </Link>
      )}
    </article>
  );
}

/** The figure, badge, headline and comment a card and a row share. */
function MilestoneBody({
  milestone,
  size = "card",
}: {
  milestone: Pick<
    MilestoneCardData,
    "category" | "subject" | "headline" | "badge" | "figure" | "comment"
  >;
  size?: "card" | "row";
}) {
  const isClub = milestone.subject === "club";
  const row = size === "row";
  return (
    <div className="flex items-start gap-3 sm:gap-4">
      <p
        aria-hidden
        className={`min-w-[2.5ch] shrink-0 text-center font-display font-extrabold text-ink italic tabular leading-none ${row ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl"} ${isClub ? "clip-slant bg-sound-900 px-2 py-2 [--slant:0.4rem]" : ""}`}
      >
        {milestone.figure}
      </p>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`clip-slant px-2 py-0.5 font-display font-extrabold text-sm uppercase tracking-wide [--slant:0.25rem] ${isClub ? "bg-sound-700 text-ink" : "bg-rave text-shale-950"}`}
          >
            {isClub ? `Club ${milestone.badge}` : milestone.badge}
          </span>
          {milestone.category === "record" && (
            <Tag tone="warning">Since records began</Tag>
          )}
        </div>
        <h3
          className={`mt-1.5 font-display font-extrabold text-ink uppercase leading-tight tracking-wide [overflow-wrap:anywhere] ${row ? "text-lg sm:text-xl" : "text-xl sm:text-2xl"}`}
        >
          {milestone.headline}
        </h3>
        <p
          className={`mt-1 text-ink-soft leading-relaxed ${row ? "text-sm sm:text-base" : ""}`}
        >
          {milestone.comment}
        </p>
      </div>
    </div>
  );
}

/** Milestones as a list of cards, in the order given. */
export function MilestoneList({
  milestones,
  className = "flex flex-col gap-3",
  ...card
}: Omit<MilestoneCardProps, "milestone"> & {
  milestones: readonly (MilestoneCardProps["milestone"] & { id: number })[];
  /** The list's layout; a single column by default. */
  className?: string;
}) {
  return (
    <ul className={className}>
      {milestones.map((milestone) => (
        <li key={milestone.id}>
          <MilestoneCard milestone={milestone} {...card} />
        </li>
      ))}
    </ul>
  );
}
