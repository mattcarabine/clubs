/**
 * The Squad table (CLUBS-9): one row per Squad Member over the Matches the
 * FilterBar selects, sortable on every column, with a toggle that brings
 * Former Squad Members back in. The FilterBar's Position Group selection
 * (CLUBS-23) narrows each row to the Appearances in those groups.
 *
 * `?source=ea` (CLUBS-19) swaps in EA's own season totals from the latest
 * member Snapshots: they include Matches from before tracking began, so the
 * Match filters, per-90s and Form do not apply.
 */
import { env } from "cloudflare:workers";
import { type ReactNode, useState } from "react";
import { Link, useSearchParams } from "react-router";

import {
  ChangeArrow,
  Chip,
  chipClassName,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  FormBadge,
  PageHeader,
  PlayerChip,
  type RowSelection,
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
import { playerPath } from "~/lib/paths";
import { sortBy } from "~/lib/sort";
import {
  COMPARISON_SIDES,
  comparePath,
  describePositionGroups,
  type EaMemberTotals,
  type EaSeasonTotals,
  eaCleanSheets,
  eaMemberTotals,
  type FormIndicator,
  type LeaderboardRow,
  type PositionGroupSelection,
  parseStatsFilter,
  parseStatsSource,
  RECENT_WINDOW,
  type RecentChange,
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
  const rows = await squadLeaderboard(db, filter, {
    includeFormer,
    positionGroups: filter.positionGroups,
  });
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
        subtitle={squadSubtitle(rows.length, filter.positionGroups)}
        aside={<SquadToggle includeFormer={includeFormer} />}
      />
      <FilterBar filter={filter} source="recorded" positions />
      {rows.length > 0 && <Leaders leaders={LEADERS} rows={rows} />}
      <ComparePicker rows={rows}>
        {(select) => (
          <DataTable
            caption="Squad Members"
            select={select}
            columns={COLUMNS}
            rows={rows}
            rowKey={(r) => r.playerId}
            rowHref={(r) => playerPath(r.playerId)}
            initialSort={{ columnId: "apps", direction: "desc" }}
            empty={
              <EmptyState
                title="No Squad Members to show"
                description="No Squad Member has an Appearance in these Matches. Widen the filters to see more."
              />
            }
          />
        )}
      </ComparePicker>
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
      <FilterBar filter={filter} source="ea" positions />
      {rows.length > 0 && <Leaders leaders={EA_LEADERS} rows={rows} />}
      <ComparePicker rows={rows}>
        {(select) => (
          <DataTable
            caption="Squad Members"
            select={select}
            columns={EA_COLUMNS}
            rows={rows}
            rowKey={(r) => r.playerId}
            rowHref={(r) => playerPath(r.playerId)}
            initialSort={{ columnId: "games", direction: "desc" }}
            empty={
              <EmptyState
                title="No EA totals yet"
                description="EA's season totals arrive with the next Poll that reaches EA. Switch to Recorded to see the Appearances tracked so far."
              />
            }
          />
        )}
      </ComparePicker>
      {rows.length > 0 && <ColumnKey entries={EA_KEY} />}
    </>
  );
}

/** "4 Squad Members", saying which Appearances count when a Position Group is selected. */
function squadSubtitle(
  count: number,
  positionGroups: PositionGroupSelection,
): string {
  const members = formatCount(count, "Squad Member", "Squad Members");
  return positionGroups.length
    ? `${members}, counting Appearances as ${describePositionGroups(positionGroups)}`
    : members;
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

/**
 * Tick two Squad Members, then Compare (CLUBS-20): the bar above the table
 * and the tick boxes it hands the table. Once two are ticked the rest are
 * disabled; Compare carries the filter and source over.
 */
function ComparePicker<Row extends SquadRow>({
  rows,
  children,
}: {
  rows: readonly Row[];
  children: (select: RowSelection<Row>) => ReactNode;
}) {
  const [searchParams] = useSearchParams();
  const [ticked, setTicked] = useState<readonly string[]>([]);
  // A filter change can drop a ticked Squad Member's row; they no longer count.
  const pickedRows = ticked.flatMap((id) =>
    rows.filter((r) => r.playerId === id),
  );
  const picked = pickedRows.map((r) => r.playerId);
  const names = pickedRows.map((r) => r.name);
  const full = picked.length === COMPARISON_SIDES.length;
  const select: RowSelection<Row> = {
    isSelected: (row) => picked.includes(row.playerId),
    isDisabled: (row) => full && !picked.includes(row.playerId),
    onToggle: (row) =>
      setTicked(
        picked.includes(row.playerId)
          ? picked.filter((id) => id !== row.playerId)
          : [...picked, row.playerId],
      ),
    label: (row) => `Compare ${row.name}`,
  };
  if (rows.length < COMPARISON_SIDES.length) return children(select);
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p
          className="min-w-0 truncate text-ink-muted text-sm"
          aria-live="polite"
        >
          {names.length === 0
            ? "Tick two Squad Members to compare them"
            : `${names.join(" vs ")}${full ? "" : " vs …"}`}
        </p>
        {full ? (
          <Link
            to={comparePath(searchParams, picked)}
            className={`${chipClassName(true)} inline-flex items-center`}
          >
            Compare
          </Link>
        ) : (
          <button type="button" disabled className={chipClassName(false)}>
            Compare
          </button>
        )}
      </div>
      {children(select)}
    </>
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
      <dl className="grid grid-cols-2 gap-1.5 sm:gap-3 lg:grid-cols-4">
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
    // Phones get a compact tile (number beside the name) so the Squad table
    // starts on the first screen; wider screens stack it broadcast-size.
    <div
      className={[
        "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1 border-t-2 px-3 py-2.5 sm:flex sm:flex-col sm:items-stretch sm:p-4",
        featured ? "border-rave bg-sound-900" : "border-shale-700 bg-shale-900",
      ].join(" ")}
    >
      <dt className="col-span-2 truncate text-ink-soft text-xs sm:text-sm">
        {label} leader
      </dt>
      <dd className="font-display font-extrabold text-3xl text-ink tabular leading-none sm:text-5xl">
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
  ["Recent", `Biggest change over the last ${RECENT_WINDOW} Appearances`],
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

/**
 * The pinned Squad Member column. On phones it is just the name, capped in
 * width, so the headline stats beside it fit without scrolling.
 */
function nameColumn<Row extends SquadRow>(
  /** Hot or Cold form (CLUBS-40): beside the name, or under it on phones so the column never widens. */
  form?: (row: Row) => FormIndicator | null,
): DataTableColumn<Row> {
  return {
    id: "name",
    header: "Squad Member",
    cell: (r) => {
      const indicator = form?.(r);
      return (
        <span className="flex max-w-24 flex-col items-start sm:max-w-none sm:flex-row sm:items-center sm:gap-1.5">
          <PlayerChip
            name={r.name}
            positionGroup={r.positionGroup ?? undefined}
            former={r.former}
            dense
          />
          {indicator && (
            <FormBadge
              status={indicator.status}
              detail={indicator.text}
              compact
            />
          )}
        </span>
      );
    },
    sortValue: (r) => r.name,
    firstSort: "asc",
  };
}

/**
 * A column of the recorded totals. A Squad Member with no Appearances in the
 * selected Position Groups shows "–" throughout, and sorts last.
 */
function recordedStat(
  id: string,
  header: string,
  value: (row: LeaderboardRow) => number | null,
  format?: (value: number) => ReactNode,
): DataTableColumn<LeaderboardRow> {
  return stat(
    id,
    header,
    (row) => (row.appearances === 0 ? null : value(row)),
    format,
  );
}

/**
 * The stats people compare lead (G+A, rating, Form, Appearances), so a phone
 * shows them beside the name before the table scrolls.
 */
const COLUMNS: DataTableColumn<LeaderboardRow>[] = [
  nameColumn((r) => r.formIndicator),
  recordedStat("ga", "G+A", (r) => r.goalContributions),
  recordedStat("rating", "Rating", (r) => r.averageRating, formatDecimal),
  {
    ...recordedStat("form", "Form", (r) => r.form),
    cell: (r) => <FormCell form={r.form} average={r.averageRating} />,
  },
  recordedStat("apps", "Apps", (r) => r.appearances),
  recordedStat("goals", "G", (r) => r.goals),
  recordedStat("assists", "A", (r) => r.assists),
  recordedStat("mins", "Mins", (r) => r.minutes, formatThousands),
  recordedStat("goals90", "G/90", (r) => r.goalsPer90, per90),
  recordedStat("assists90", "A/90", (r) => r.assistsPer90, per90),
  recordedStat("ga90", "G+A/90", (r) => r.goalContributionsPer90, per90),
  recordedStat("shots", "Shots", (r) => r.shots),
  recordedStat("pass", "Pass %", (r) => r.passPercentage, formatPercentage),
  recordedStat("tackle", "Tkl %", (r) => r.tacklePercentage, formatPercentage),
  recordedStat("motm", "MOTM", (r) => r.manOfTheMatch),
  recordedStat("cs", "CS", (r) => r.cleanSheets),
  recordedStat("saves", "Saves", (r) => r.saves),
  {
    id: "recent",
    header: "Recent",
    cell: (r) => <RecentChangeCell change={r.recentChange} />,
    sortValue: (r) => recentChangeRank(r.recentChange),
  },
];

/** Sorts improving first, then no change, then dropping off. */
function recentChangeRank(change: RecentChange | null): number {
  if (!change) return 0;
  return change.direction === "up" ? 1 : -1;
}

/** The biggest recent change as an arrow and the stat; the sentence is its tooltip. */
function RecentChangeCell({ change }: { change: RecentChange | null }) {
  if (!change) return NO_VALUE;
  return (
    <span
      title={change.text}
      className="relative inline-flex items-center gap-1.5 whitespace-nowrap"
    >
      <ChangeArrow direction={change.direction} className="text-[0.625rem]" />
      <span className="sr-only">
        {change.direction === "up" ? "Improving:" : "Dropping off:"}
      </span>
      {change.label}
    </span>
  );
}

/**
 * EA's season totals, led like the Recorded table: G+A and rating, then
 * games played and pass success, so a phone shows them before it scrolls.
 */
const EA_COLUMNS: DataTableColumn<EaMemberTotals>[] = [
  nameColumn(),
  stat("ga", "G+A", season(goalContributions)),
  seasonStat("rating", "Rating", "averageRating", formatDecimal),
  seasonStat("games", "GP", "gamesPlayed"),
  seasonStat("pass", "Pass %", "passSuccessRate", formatPercentage),
  seasonStat("goals", "G", "goals"),
  seasonStat("assists", "A", "assists"),
  seasonStat("shot", "Shot %", "shotSuccessRate", formatPercentage),
  seasonStat("tackle", "Tkl %", "tackleSuccessRate", formatPercentage),
  seasonStat("win", "Win %", "winRate", formatPercentage),
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
