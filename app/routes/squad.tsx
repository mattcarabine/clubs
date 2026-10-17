/**
 * The Squad table (CLUBS-9): one row per Squad Member over the Matches the
 * FilterBar selects, sortable on every column, with a toggle that brings
 * Former Squad Members back in.
 *
 * `?source=ea` (CLUBS-19) swaps in EA's own season totals from the latest
 * member Snapshots: they include Matches from before tracking began, so the
 * Match filters, per-90s and Form do not apply.
 */
import { env } from "cloudflare:workers";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router";

import {
  Chip,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  PageHeader,
  PlayerChip,
} from "~/components";
import { getDb } from "~/db/client";
import type { PositionGroup } from "~/lib/domain";
import { formatLondonDate } from "~/lib/london-time";
import {
  formatCount,
  formatDecimal,
  formatPercentage,
  formatThousands,
  NO_VALUE,
} from "~/lib/number-format";
import { sortBy } from "~/lib/sort";
import {
  type EaMemberTotals,
  type EaSeasonTotals,
  eaCleanSheets,
  eaMemberTotals,
  type LeaderboardRow,
  parseStatsFilter,
  parseStatsSource,
  squadLeaderboard,
} from "~/stats";

import type { Route } from "./+types/squad";

/** `?former=1` includes Former Squad Members; absent means the current squad. */
const FORMER_PARAM = "former";

export function meta(_: Route.MetaArgs) {
  return [{ title: "A Bloo Bloo — Squad" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const filter = parseStatsFilter(params);
  const includeFormer = params.get(FORMER_PARAM) === "1";
  const db = getDb(env.DB);
  if (parseStatsSource(params) === "ea") {
    return {
      source: "ea" as const,
      filter,
      includeFormer,
      rows: await eaMemberTotals(db, { includeFormer }),
    };
  }
  const rows = await squadLeaderboard(db, filter, { includeFormer });
  return {
    source: "recorded" as const,
    filter,
    includeFormer,
    rows,
  };
}

type SquadData<Source> = Extract<
  Route.ComponentProps["loaderData"],
  { source: Source }
>;

export default function Squad({ loaderData }: Route.ComponentProps) {
  return loaderData.source === "ea" ? (
    <EaSquad {...loaderData} />
  ) : (
    <RecordedSquad {...loaderData} />
  );
}

function RecordedSquad({ filter, includeFormer, rows }: SquadData<"recorded">) {
  return (
    <>
      <PageHeader
        title="Squad"
        subtitle={formatCount(rows.length, "Squad Member", "Squad Members")}
        aside={<SquadToggle includeFormer={includeFormer} />}
      />
      <FilterBar filter={filter} source="recorded" />
      {rows.length > 0 && <Leaders leaders={LEADERS} rows={rows} />}
      <DataTable
        caption="Squad Members"
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.playerId}
        initialSort={{ columnId: "apps", direction: "desc" }}
        empty={
          <EmptyState
            title="No Squad Members to show"
            description="No Squad Member has an Appearance in these Matches. Widen the filters to see more."
          />
        }
      />
      {rows.length > 0 && <ColumnKey entries={KEY} />}
    </>
  );
}

function EaSquad({ filter, includeFormer, rows }: SquadData<"ea">) {
  const takenAt = rows.find((r) => r.season)?.season?.takenAt;
  return (
    <>
      <PageHeader
        title="Squad"
        subtitle={
          takenAt
            ? `EA's season totals for ${formatCount(rows.length, "Squad Member", "Squad Members")}, as of ${formatLondonDate(takenAt)}`
            : "EA's season totals"
        }
        aside={<SquadToggle includeFormer={includeFormer} />}
      />
      <FilterBar filter={filter} source="ea" />
      {rows.length > 0 && <Leaders leaders={EA_LEADERS} rows={rows} />}
      <DataTable
        caption="Squad Members"
        columns={EA_COLUMNS}
        rows={rows}
        rowKey={(r) => r.playerId}
        initialSort={{ columnId: "games", direction: "desc" }}
        empty={
          <EmptyState
            title="No EA totals yet"
            description="EA's season totals arrive with the next Poll that reaches EA. Switch to Recorded to see the Appearances tracked so far."
          />
        }
      />
      {rows.length > 0 && <ColumnKey entries={EA_KEY} />}
    </>
  );
}

/** Current squad only, or everyone including Former Squad Members. */
function SquadToggle({ includeFormer }: { includeFormer: boolean }) {
  const [, setSearchParams] = useSearchParams();
  const show = (former: boolean) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (former) next.set(FORMER_PARAM, "1");
        else next.delete(FORMER_PARAM);
        return next;
      },
      { preventScrollReset: true },
    );
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Squad Members to show</legend>
      <div className="flex gap-1">
        <Chip pressed={!includeFormer} onClick={() => show(false)}>
          Current squad
        </Chip>
        <Chip pressed={includeFormer} onClick={() => show(true)}>
          Include former
        </Chip>
      </div>
    </fieldset>
  );
}

/** What every Squad table row has, whichever source it comes from. */
type SquadRow = {
  playerId: string;
  name: string;
  positionGroup: PositionGroup | null;
  former: boolean;
};

type Leader<Row> = {
  label: string;
  pick: (row: Row) => number | null;
  format: (value: number) => string;
};

const LEADERS: readonly Leader<LeaderboardRow>[] = [
  { label: "Goals", pick: (r) => r.goals, format: String },
  { label: "Assists", pick: (r) => r.assists, format: String },
  {
    label: "Average rating",
    pick: (r) => r.averageRating,
    format: formatDecimal,
  },
  { label: "Form", pick: (r) => r.form, format: formatDecimal },
];

/** EA's numeric season figures, one per column. */
type EaSeasonFigure = Exclude<
  keyof EaSeasonTotals,
  "takenAt" | "favouritePosition"
>;

/** A season value of an EA row, null before the member's first season Snapshot. */
function season(
  pick: (season: EaSeasonTotals) => number | null,
): (row: EaMemberTotals) => number | null {
  return (row) => (row.season ? pick(row.season) : null);
}

const EA_LEADERS: readonly Leader<EaMemberTotals>[] = [
  { label: "Goals", pick: season((s) => s.goals), format: String },
  { label: "Assists", pick: season((s) => s.assists), format: String },
  {
    label: "Average rating",
    pick: season((s) => s.averageRating),
    format: formatDecimal,
  },
  {
    label: "MOTM",
    pick: season((s) => s.manOfTheMatch),
    format: String,
  },
];

/** The broadcast "leaders" strip: who tops each headline stat. */
function Leaders<Row extends SquadRow>({
  leaders,
  rows,
}: {
  leaders: readonly Leader<Row>[];
  rows: readonly Row[];
}) {
  return (
    <section aria-label="Leaders" className="mb-6">
      <dl className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {leaders.map((leader, i) => {
          const [top] = sortBy(rows, leader.pick, "desc");
          // Nobody leads on a zero, e.g. before anyone has scored.
          const best = leader.pick(top);
          const value = best === null || best <= 0 ? null : best;
          return (
            <LeaderTile
              key={leader.label}
              label={leader.label}
              value={value === null ? NO_VALUE : leader.format(value)}
              featured={i === 0}
            >
              {value !== null && (
                <Link
                  to={playerPath(top.playerId)}
                  className="block truncate font-semibold text-sound-300 hover:text-ink"
                >
                  {top.name}
                </Link>
              )}
            </LeaderTile>
          );
        })}
      </dl>
    </section>
  );
}

function LeaderTile({
  label,
  value,
  featured,
  children,
}: {
  label: string;
  value: string;
  featured: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={[
        "flex min-w-0 flex-col gap-1 border-t-2 p-4",
        featured ? "border-rave bg-sound-900" : "border-shale-700 bg-shale-900",
      ].join(" ")}
    >
      <dt className="text-ink-soft text-sm">{label} leader</dt>
      <dd className="font-display font-extrabold text-5xl text-ink tabular leading-none">
        {value}
      </dd>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/** What the abbreviated headers mean. */
const KEY: readonly [string, string][] = [
  ["G / A", "Goals / assists"],
  ["/90", "Per 90 minutes played"],
  ["Tkl %", "Tackle success"],
  ["Form", "Average rating over the last 5 Appearances"],
  ["MOTM", "Man of the Match"],
  ["CS", "Clean sheets as Goalkeeper or Defender"],
];

const EA_KEY: readonly [string, string][] = [
  ["GP", "Games played this Season, as EA counts them"],
  ["G / A", "Goals / assists"],
  ["Shot %", "Shot success, as EA rates it"],
  ["Tkl %", "Tackle success"],
  ["MOTM", "Man of the Match"],
  ["CS", "Clean sheets in goal for a Goalkeeper, else as a Defender"],
];

function ColumnKey({ entries }: { entries: readonly [string, string][] }) {
  return (
    <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-ink-muted text-xs">
      {entries.map(([abbr, meaning]) => (
        <div key={abbr} className="flex gap-1.5">
          <dt className="font-display font-bold text-ink-soft text-sm uppercase leading-4">
            {abbr}
          </dt>
          <dd>{meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

function playerPath(playerId: string): string {
  return `/players/${playerId}`;
}

/** A sortable, right-aligned numeric column. */
function stat<Row>(
  id: string,
  header: string,
  value: (row: Row) => number | null,
  format: (value: number) => ReactNode = String,
): DataTableColumn<Row> {
  return {
    id,
    header,
    align: "right",
    cell: (row) => {
      const v = value(row);
      return v === null ? NO_VALUE : format(v);
    },
    sortValue: value,
  };
}

/** A sortable column of one of EA's season figures. */
function seasonStat(
  id: string,
  header: string,
  field: EaSeasonFigure,
  format?: (value: number) => ReactNode,
): DataTableColumn<EaMemberTotals> {
  return stat(
    id,
    header,
    season((s) => s[field]),
    format,
  );
}

/** The pinned Squad Member column, linking to their profile; `width` is its phone width. */
function nameColumn<Row extends SquadRow>(width: string): DataTableColumn<Row> {
  return {
    id: "name",
    header: "Squad Member",
    cell: (r) => (
      <span className={`block ${width} sm:w-auto`}>
        <PlayerChip
          name={r.name}
          positionGroup={r.positionGroup ?? undefined}
          former={r.former}
          to={playerPath(r.playerId)}
        />
      </span>
    ),
    sortValue: (r) => r.name,
    firstSort: "asc",
  };
}

const COLUMNS: DataTableColumn<LeaderboardRow>[] = [
  nameColumn("w-40"),
  stat("apps", "Apps", (r) => r.appearances),
  stat("mins", "Mins", (r) => r.minutes, formatThousands),
  stat("goals", "G", (r) => r.goals),
  stat("assists", "A", (r) => r.assists),
  stat("ga", "G+A", (r) => r.goalContributions),
  stat("goals90", "G/90", (r) => r.goalsPer90, per90),
  stat("assists90", "A/90", (r) => r.assistsPer90, per90),
  stat("ga90", "G+A/90", (r) => r.goalContributionsPer90, per90),
  stat("shots", "Shots", (r) => r.shots),
  stat("pass", "Pass %", (r) => r.passPercentage, formatPercentage),
  stat("tackle", "Tkl %", (r) => r.tacklePercentage, formatPercentage),
  stat("rating", "Rating", (r) => r.averageRating, formatDecimal),
  {
    ...stat("form", "Form", (r: LeaderboardRow) => r.form),
    cell: (r) => <FormCell form={r.form} average={r.averageRating} />,
  },
  stat("motm", "MOTM", (r) => r.manOfTheMatch),
  stat("cs", "CS", (r) => r.cleanSheets),
  stat("saves", "Saves", (r) => r.saves),
];

/**
 * EA's season totals: the rate stats lead, so a phone shows the name with
 * rating and pass success before the table scrolls.
 */
const EA_COLUMNS: DataTableColumn<EaMemberTotals>[] = [
  nameColumn("w-36"),
  seasonStat("rating", "Rating", "averageRating", formatDecimal),
  seasonStat("pass", "Pass %", "passSuccessRate", formatPercentage),
  seasonStat("shot", "Shot %", "shotSuccessRate", formatPercentage),
  seasonStat("tackle", "Tkl %", "tackleSuccessRate", formatPercentage),
  seasonStat("win", "Win %", "winRate", formatPercentage),
  seasonStat("games", "GP", "gamesPlayed"),
  seasonStat("goals", "G", "goals"),
  seasonStat("assists", "A", "assists"),
  stat("ga", "G+A", season(goalContributions)),
  seasonStat("passes", "Passes", "passesMade", formatThousands),
  seasonStat("tackles", "Tackles", "tacklesMade", formatThousands),
  seasonStat("motm", "MOTM", "manOfTheMatch"),
  stat("cs", "CS", season(eaCleanSheets)),
  seasonStat("red", "Red", "redCards"),
];

function goalContributions(s: EaSeasonTotals): number | null {
  return s.goals === null || s.assists === null ? null : s.goals + s.assists;
}

/** Below this, Form and the season average count as level. */
const FORM_LEVEL = 0.1;

type FormTrend = { arrow: string; colour: string; label: string };

const ABOVE_AVERAGE: FormTrend = {
  arrow: "▲",
  colour: "text-win",
  label: "above",
};
const BELOW_AVERAGE: FormTrend = {
  arrow: "▼",
  colour: "text-loss",
  label: "below",
};

/** How Form compares with the average rating, or null when they are level. */
function formTrend(form: number, average: number | null): FormTrend | null {
  const diff = average === null ? 0 : form - average;
  if (diff >= FORM_LEVEL) return ABOVE_AVERAGE;
  if (diff <= -FORM_LEVEL) return BELOW_AVERAGE;
  return null;
}

/** Form with an arrow saying whether it is above or below the average rating. */
function FormCell({
  form,
  average,
}: {
  form: number | null;
  average: number | null;
}) {
  if (form === null) return NO_VALUE;
  const trend = formTrend(form, average);
  return (
    // Relative so the sr-only text is placed within the table's scroll
    // container, not against the page, where it would widen the page.
    <span className="relative inline-flex items-center gap-1.5">
      {trend && (
        <span aria-hidden className={`text-[0.625rem] ${trend.colour}`}>
          {trend.arrow}
        </span>
      )}
      <span className="font-semibold text-ink">{formatDecimal(form)}</span>
      {trend && <span className="sr-only">{trend.label} average rating</span>}
    </span>
  );
}

function per90(value: number): string {
  return formatDecimal(value, 2);
}
