import { EmptyState } from "~/components";
import { formatLondonDate } from "~/lib/london-time";
import { formatDecimal, formatOptional } from "~/lib/number-format";
import type { CareerTotals } from "~/stats";

type AllTimePanelProps = {
  /** EA's latest career totals, or null before the first Snapshot. */
  career: CareerTotals | null;
  /** Our own count over the current filter, shown alongside for contrast. */
  trackedAppearances: number;
};

/**
 * EA's own all-time record for the Squad Member, kept visibly apart from what
 * this site has tracked: EA counts Matches from before tracking began.
 */
export function AllTimePanel({
  career,
  trackedAppearances,
}: AllTimePanelProps) {
  if (!career) {
    return (
      <EmptyState
        title="No EA career totals yet"
        description="They arrive with the next Poll that reaches EA."
      />
    );
  }
  const figures = [
    { label: "Goals", value: formatOptional(career.goals) },
    { label: "Assists", value: formatOptional(career.assists) },
    { label: "Man of the Match", value: formatOptional(career.manOfTheMatch) },
    { label: "Avg rating", value: formatDecimal(career.averageRating) },
  ];
  return (
    <div className="border-sound-700 border-t-2 bg-shale-900">
      <dl>
        <div className="flex items-end justify-between gap-4 bg-sound-900 px-4 py-3">
          <dt className="text-ink text-sm">Games played</dt>
          <dd className="font-display font-extrabold text-score text-ink tabular">
            {formatOptional(career.gamesPlayed)}
          </dd>
        </div>
        <div className="grid grid-cols-2">
          {figures.map((f) => (
            <div
              key={f.label}
              className="flex flex-col gap-0.5 border-shale-700 border-b px-4 py-3 odd:border-r"
            >
              <dt className="text-ink-muted text-sm">{f.label}</dt>
              <dd className="font-display font-extrabold text-3xl text-ink tabular leading-none">
                {f.value}
              </dd>
            </div>
          ))}
        </div>
      </dl>
      <p className="px-4 py-3 text-ink-muted text-sm">
        Tracked here:{" "}
        <span className="font-semibold text-ink-soft">
          {trackedAppearances}{" "}
          {trackedAppearances === 1 ? "Appearance" : "Appearances"}
        </span>{" "}
        in these filters. EA as of {formatLondonDate(career.takenAt)}.
      </p>
    </div>
  );
}
