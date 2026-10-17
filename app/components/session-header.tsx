import { Link } from "react-router";

import type { Outcome } from "~/lib/domain";
import { formatLondonTimeSpan } from "~/lib/london-time";
import { formatCount, formatDecimal } from "~/lib/number-format";
import type { PerformerTotals } from "~/stats/sessions";
import type { RecordSummary } from "~/stats/summaries";

import { FormGuide } from "./form-guide";
import { LondonTime } from "./london-time";
import { PlayerChip } from "./player-chip";

type SessionRecordProps = {
  record: Pick<
    RecordSummary,
    "wins" | "draws" | "losses" | "goalsFor" | "goalsAgainst"
  >;
};

/**
 * A Session's W-D-L as scoreboard numerals, its Dropped Points picked out on
 * a loss-red tab, and the goals either way.
 */
export function SessionRecord({ record }: SessionRecordProps) {
  const { wins, draws, losses, goalsFor, goalsAgainst } = record;
  const dropped = draws + losses;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className="font-display font-extrabold text-3xl text-ink uppercase tabular leading-none">
        <span className="sr-only">{`Won ${wins}, drawn ${draws}, lost ${losses}`}</span>
        <span aria-hidden className="flex gap-3">
          <RecordCount value={wins} letter="W" />
          <RecordCount value={draws} letter="D" />
          <RecordCount value={losses} letter="L" />
        </span>
      </p>
      {dropped > 0 && (
        <span className="clip-slant bg-loss px-3 py-1 font-display font-extrabold text-base text-shale-950 uppercase leading-none tracking-wide [--slant:0.35rem]">
          {dropped} Dropped Points
        </span>
      )}
      <p className="text-ink-soft text-sm">
        {goalsFor} scored, {goalsAgainst} conceded
      </p>
    </div>
  );
}

function RecordCount({ value, letter }: { value: number; letter: string }) {
  return (
    <span>
      {value}
      <span className="ml-0.5 text-ink-muted text-xl">{letter}</span>
    </span>
  );
}

type SessionHeaderProps = {
  /** The Session page; the whole header links there. */
  to: string;
  /** The Session's first and last kick-offs. */
  start: Date;
  end: Date;
  /** Every Match in the Session, whatever the filter. */
  matchCount: number;
  /** The Matches the filter left in; a note says so when it is fewer. */
  shownCount: number;
  record: SessionRecordProps["record"];
  /** The shown Matches' Outcomes, oldest first. */
  form: readonly Outcome[];
  topPerformer: PerformerTotals | null;
};

/**
 * The header over one Session's Matches on the Matches page: a green
 * "Session" tab, the London date and time span, the record, a form run and
 * the top performer. The whole header links to the Session page.
 */
export function SessionHeader({
  to,
  start,
  end,
  matchCount,
  shownCount,
  record,
  form,
  topPerformer,
}: SessionHeaderProps) {
  return (
    <Link
      to={to}
      className="group block border-sound-700 border-t-2 bg-shale-900 p-3 transition-colors hover:bg-shale-800 focus-visible:outline-2 focus-visible:outline-rave focus-visible:outline-offset-4 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="clip-slant-r bg-rave py-1 pr-4 pl-2 font-display font-extrabold text-base text-shale-950 uppercase leading-none tracking-wide [--slant:0.5rem]">
            Session
          </span>
          <h2 className="font-display font-extrabold text-2xl text-ink uppercase leading-none tracking-wide">
            <LondonTime date={start} format="day" />
          </h2>
          <span className="text-ink-soft text-sm tabular">
            {formatLondonTimeSpan(start, end)} ·{" "}
            {formatCount(matchCount, "Match", "Matches")}
          </span>
        </div>
        <span className="font-display font-bold text-lg text-sound-300 uppercase tracking-wide group-hover:text-ink">
          Session details <span aria-hidden>›</span>
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <SessionRecord record={record} />
        <FormGuide results={form} />
        {topPerformer && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-display font-bold text-ink-muted uppercase tracking-wide">
              Top performer
            </span>
            <PlayerChip
              name={topPerformer.name}
              stat={performerStat(topPerformer)}
            />
          </div>
        )}
      </div>
      {shownCount < matchCount && (
        <p className="mt-2 text-ink-muted text-sm">
          {shownCount} of {formatCount(matchCount, "Match", "Matches")} shown
        </p>
      )}
    </Link>
  );
}

/** "2 G · 1 A", or the average rating when they neither scored nor assisted. */
function performerStat(performer: PerformerTotals): string {
  const parts = [
    performer.goals > 0 && `${performer.goals} G`,
    performer.assists > 0 && `${performer.assists} A`,
  ].filter(Boolean);
  return parts.length > 0
    ? parts.join(" · ")
    : formatDecimal(performer.averageRating);
}
