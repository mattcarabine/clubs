import { EmptyState } from "~/components";
import { formatLondonDate } from "~/lib/london-time";
import {
  formatCount,
  formatDecimal,
  formatOptional,
  formatPercentage,
  formatThousands,
} from "~/lib/number-format";
import {
  type EaCareerTotals,
  type EaSeasonTotals,
  eaCleanSheets,
} from "~/stats";

type EaTotalsProps = {
  /** EA's latest career totals, or null before the first Snapshot. */
  career: EaCareerTotals | null;
  /** EA's latest season totals, or null before the first Snapshot. */
  season: EaSeasonTotals | null;
  /** Our own count over the current filter, shown alongside for contrast. */
  trackedAppearances: number;
};

/**
 * EA's own Career and This Season (EA) totals for a Squad Member, kept
 * visibly apart from what this site has tracked: EA counts Matches from
 * before tracking began, and the filter does not touch them.
 */
export function EaTotals({
  career,
  season,
  trackedAppearances,
}: EaTotalsProps) {
  if (!career && !season) {
    return (
      <EmptyState
        title="No EA totals yet"
        description="EA's season and career totals arrive with the next Poll that reaches EA."
      />
    );
  }
  const takenAt = (season ?? career)?.takenAt;
  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-6">
        <TotalsPanel
          title="Career"
          detail="Since the club was founded"
          gamesPlayed={career?.gamesPlayed ?? null}
          figures={career ? careerFigures(career) : null}
        />
        <TotalsPanel
          title="This Season (EA)"
          detail="EA's current Season"
          gamesPlayed={season?.gamesPlayed ?? null}
          figures={season ? seasonFigures(season) : null}
          wide
        />
      </div>
      <p className="mt-3 text-ink-muted text-sm">
        Tracked here:{" "}
        <span className="font-semibold text-ink-soft">
          {formatCount(trackedAppearances, "Appearance", "Appearances")}
        </span>{" "}
        in these filters.
        {takenAt && <> EA as of {formatLondonDate(takenAt)}.</>}
      </p>
    </div>
  );
}

type Figure = {
  label: string;
  value: string;
  /** A 0 to 100 rate, drawn as a meter under the value. */
  rate?: number | null;
};

function careerFigures(career: EaCareerTotals): Figure[] {
  return [
    { label: "Goals", value: formatOptional(career.goals) },
    { label: "Assists", value: formatOptional(career.assists) },
    { label: "Man of the Match", value: formatOptional(career.manOfTheMatch) },
    { label: "Avg rating", value: formatDecimal(career.averageRating) },
  ];
}

/**
 * Ordered so each count sits beside its success rate (passes, pass %) in the
 * two-column phone grid, and the rows read attack, build-up, then overall on
 * desktop's four columns.
 */
function seasonFigures(season: EaSeasonTotals): Figure[] {
  const goalkeeper = season.favouritePosition === "Goalkeeper";
  return [
    { label: "Goals", value: formatOptional(season.goals) },
    { label: "Assists", value: formatOptional(season.assists) },
    rate("Shot success", season.shotSuccessRate),
    { label: "Avg rating", value: formatDecimal(season.averageRating) },
    { label: "Passes", value: formatThousands(season.passesMade) },
    rate("Pass success", season.passSuccessRate),
    { label: "Tackles", value: formatThousands(season.tacklesMade) },
    rate("Tackle success", season.tackleSuccessRate),
    { label: "Man of the Match", value: formatOptional(season.manOfTheMatch) },
    {
      label: goalkeeper ? "Clean sheets (GK)" : "Clean sheets (DEF)",
      value: formatOptional(eaCleanSheets(season)),
    },
    { label: "Red cards", value: formatOptional(season.redCards) },
    rate("Win rate", season.winRate),
  ];
}

function rate(label: string, value: number | null): Figure {
  return { label, value: formatPercentage(value), rate: value };
}

type TotalsPanelProps = {
  title: string;
  detail: string;
  gamesPlayed: number | null;
  /** Null before this side's first Snapshot. */
  figures: Figure[] | null;
  /** Four figures across on desktop instead of two. */
  wide?: boolean;
};

/** One side of the EA totals: a games-played header strip over a grid of figures. */
function TotalsPanel({
  title,
  detail,
  gamesPlayed,
  figures,
  wide,
}: TotalsPanelProps) {
  return (
    <section
      aria-label={title}
      className="min-w-0 border-sound-700 border-t-2 bg-shale-900"
    >
      <div className="flex items-end justify-between gap-4 bg-sound-900 px-4 py-3">
        <div className="min-w-0">
          <h3 className="font-display font-extrabold text-2xl text-ink uppercase leading-none tracking-wide">
            {title}
          </h3>
          <p className="mt-1 text-ink-soft text-sm">{detail}</p>
        </div>
        {figures && (
          <dl className="flex shrink-0 items-end gap-2">
            <dt className="pb-1 text-ink-soft text-sm">Games</dt>
            <dd className="font-display font-extrabold text-score text-ink tabular leading-none">
              {formatOptional(gamesPlayed)}
            </dd>
          </dl>
        )}
      </div>
      {figures ? (
        <dl
          className={`grid grid-cols-2 ${wide ? "sm:grid-cols-3 xl:grid-cols-4" : ""}`}
        >
          {figures.map((figure) => (
            <FigureCell key={figure.label} figure={figure} />
          ))}
        </dl>
      ) : (
        <p className="px-4 py-6 text-ink-soft text-sm">
          No {title} totals from EA yet. They arrive with the next Poll that
          reaches EA.
        </p>
      )}
    </section>
  );
}

function FigureCell({ figure }: { figure: Figure }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-shale-700 border-r border-b px-4 py-3">
      <dt className="truncate text-ink-muted text-sm">{figure.label}</dt>
      <dd className="font-display font-extrabold text-3xl text-ink tabular leading-none">
        {figure.value}
        {figure.rate != null && <RateMeter rate={figure.rate} />}
      </dd>
    </div>
  );
}

/** A slim 0 to 100 bar under a rate; the number above carries the meaning. */
function RateMeter({ rate }: { rate: number }) {
  return (
    <span aria-hidden className="mt-2 block h-1 bg-shale-700">
      <span
        className="block h-full bg-rave"
        style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
      />
    </span>
  );
}
