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
  ColumnPicker,
  chipClassName,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  FormBadge,
  FormWatch,
  PageHeader,
  PlayerChip,
  type RowSelection,
  useColumnLayout,
} from "~/components";
import { getDb } from "~/db/client";
import type { PositionGroup } from "~/lib/domain";
import { formatLondonDate } from "~/lib/london-time";
import {
  formatCount,
  formatDecimal,
  formatPercentage,
  formatSignedDecimal,
  formatThousands,
  NO_VALUE,
} from "~/lib/number-format";
import { pageMeta } from "~/lib/page-meta";
import { playerPath } from "~/lib/paths";
import { sortBy } from "~/lib/sort";
import {
  COMPARISON_SIDES,
  comparePath,
  type EaMemberTotals,
  type EaSeasonTotals,
  eaCleanSheets,
  eaMemberTotals,
  type FormIndicator,
  formWatch,
  type LeaderboardRow,
  parseStatsFilter,
  parseStatsSource,
  RECENT_WINDOW,
  type RecentChange,
  resolveStatsFilter,
  squadLeaderboard,
} from "~/stats";

import type { Route } from "./+types/squad";

/** `?former=1` includes Former Squad Members; absent means the current squad. */
const FORMER_PARAM = "former";

/**
 * Where each source's column choices are kept in the browser (CLUBS-65).
 * Recorded and EA totals have different columns, so each has its own.
 */
const COLUMN_LAYOUT_KEYS = {
  // v2: CLUBS-80 changed the defaults, so earlier layouts start again from them.
  recorded: "squad-columns:recorded:v2",
  ea: "squad-columns:ea",
} as const;

export function meta({ location }: Route.MetaArgs) {
  return pageMeta({
    title: "A Bloo Bloo — Squad",
    description:
      "Every Squad Member's Appearances, goals, assists and ratings, with Hot and Cold form.",
    path: location.pathname,
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const includeFormer = params.get(FORMER_PARAM) === "1";
  const db = getDb(env.DB);
  const filter = await resolveStatsFilter(db, parseStatsFilter(params));
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
    mainPositionOnly: filter.mainPositionOnly,
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
  const watch = formWatch(rows);
  const layout = useColumnLayout(COLUMN_LAYOUT_KEYS.recorded, COLUMNS);
  return (
    <>
      <PageHeader
        title="Squad"
        subtitle={formatCount(rows.length, "Squad Member", "Squad Members")}
        aside={<SquadToggle includeFormer={includeFormer} />}
      />
      <FilterBar filter={filter} source="recorded" positions />
      {rows.length > 0 && <Leaders leaders={LEADERS} rows={rows} />}
      <ComparePicker
        rows={rows}
        tools={<ColumnPicker columns={COLUMNS} layout={layout} />}
      >
        {(select) => (
          <DataTable
            caption="Squad Members"
            select={select}
            layout={layout}
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
      {watch.length > 0 && (
        <div className="mt-8">
          <FormWatch rows={watch} />
        </div>
      )}
    </>
  );
}

function EaSquad({ filter, includeFormer, rows }: SquadData<"ea">) {
  const takenAt = rows.find((r) => r.season)?.season?.takenAt;
  const layout = useColumnLayout(COLUMN_LAYOUT_KEYS.ea, EA_COLUMNS);
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
      <ComparePicker
        rows={rows}
        tools={<ColumnPicker columns={EA_COLUMNS} layout={layout} />}
      >
        {(select) => (
          <DataTable
            caption="Squad Members"
            select={select}
            layout={layout}
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
 * disabled; Compare carries the filter and source over. `tools` (the
 * Columns picker) sit beside Compare whenever there are rows.
 */
function ComparePicker<Row extends SquadRow>({
  rows,
  tools,
  children,
}: {
  rows: readonly Row[];
  tools: ReactNode;
  children: (select: RowSelection<Row>) => ReactNode;
}) {
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
  if (rows.length === 0) return children(select);
  const comparable = rows.length >= COMPARISON_SIDES.length;
  return (
    <>
      <div className="mb-2 flex items-center gap-3">
        <p
          className="min-w-0 flex-1 truncate text-ink-muted text-sm"
          aria-live="polite"
        >
          {comparable && tickedLabel(names, full)}
        </p>
        {tools}
        {comparable && <CompareButton picked={picked} ready={full} />}
      </div>
      {children(select)}
    </>
  );
}

/** Who is ticked so far, or what to do when nobody is. */
function tickedLabel(names: readonly string[], full: boolean): string {
  if (names.length === 0) return "Tick two Squad Members to compare them";
  return full ? names.join(" vs ") : `${names.join(" vs ")} vs …`;
}

/** The Compare link, disabled until two Squad Members are ticked. */
function CompareButton({
  picked,
  ready,
}: {
  picked: readonly string[];
  ready: boolean;
}) {
  const [searchParams] = useSearchParams();
  if (!ready) {
    return (
      <button type="button" disabled className={chipClassName(false)}>
        Compare
      </button>
    );
  }
  return (
    <Link
      to={comparePath(searchParams, picked)}
      className={`${chipClassName(true)} inline-flex items-center`}
    >
      Compare
    </Link>
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

/** What a column means, shared by the legend and the header tooltips (CLUBS-81). */
const MEANING = {
  form: "Average rating over the last 5 Appearances",
  aboveTeam:
    "Rating against teammates' average in the same Matches: above 0 lifts the team",
  red: "Red cards (EA does not report yellow cards)",
  recent: `Biggest change over the last ${RECENT_WINDOW} Appearances`,
  cs: "Clean sheets as Goalkeeper or Defender",
  eaCs: "Clean sheets in goal for a Goalkeeper, else as a Defender",
  games: "Games played this Season, as EA counts them",
  shotSuccess: "Shot success, as EA rates it",
} as const;

/** What the abbreviated headers mean. */
const KEY: readonly [string, string][] = [
  ["G / A", "Goals / assists"],
  ["/90", "Per 90 minutes played"],
  ["Tkl %", "Tackle success"],
  ["Form", MEANING.form],
  ["Above team", MEANING.aboveTeam],
  ["MOTM", "Man of the Match"],
  ["CS", MEANING.cs],
  ["Red", MEANING.red],
  ["Recent", MEANING.recent],
];

const EA_KEY: readonly [string, string][] = [
  ["Played", MEANING.games],
  ["G / A", "Goals / assists"],
  ["Shot %", MEANING.shotSuccess],
  ["Tkl %", "Tackle success"],
  ["MOTM", "Man of the Match"],
  ["CS", MEANING.eaCs],
  ["Red", MEANING.red],
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
 * A column's full name for the Columns picker (where the header abbreviates
 * it) and its meaning for the header's tooltip (CLUBS-81), by column id.
 */
type ColumnInfo = { label?: string; description: string };

const RECORDED_INFO: Readonly<Record<string, ColumnInfo>> = {
  ga: { label: "Goal contributions", description: "Goals plus assists" },
  motm: {
    label: "Man of the Match",
    description: "Man of the Match awards",
  },
  rating: {
    label: "Average rating",
    description: "Average Match rating, out of 10",
  },
  form: { description: MEANING.form },
  apps: {
    label: "Appearances",
    description: "Appearances in the Matches shown",
  },
  aboveTeam: {
    label: "Rating against teammates",
    description: MEANING.aboveTeam,
  },
  goals: { label: "Goals", description: "Goals scored" },
  assists: { label: "Assists", description: "Assists made" },
  mins: { label: "Minutes played", description: "Minutes played" },
  goals90: {
    label: "Goals per 90",
    description: "Goals per 90 minutes played",
  },
  assists90: {
    label: "Assists per 90",
    description: "Assists per 90 minutes played",
  },
  ga90: {
    label: "Goal contributions per 90",
    description: "Goals plus assists per 90 minutes played",
  },
  shots: { description: "Shots taken" },
  pass: { label: "Pass success", description: "Share of passes completed" },
  tackle: {
    label: "Tackle success",
    description: "Share of tackles won",
  },
  cs: { label: "Clean sheets", description: MEANING.cs },
  saves: { description: "Saves made in goal" },
  red: { label: "Red cards", description: MEANING.red },
  red90: {
    label: "Red cards per 90",
    description: "Red cards per 90 minutes played",
  },
  recent: { label: "Biggest recent change", description: MEANING.recent },
};

const EA_INFO: Readonly<Record<string, ColumnInfo>> = {
  ga: RECORDED_INFO.ga,
  rating: RECORDED_INFO.rating,
  games: { label: "Games played", description: MEANING.games },
  pass: RECORDED_INFO.pass,
  goals: RECORDED_INFO.goals,
  assists: RECORDED_INFO.assists,
  shot: { label: "Shot success", description: MEANING.shotSuccess },
  tackle: RECORDED_INFO.tackle,
  win: { label: "Win rate", description: "Share of games won this Season" },
  passes: { description: "Passes completed this Season" },
  tackles: { description: "Tackles won this Season" },
  motm: RECORDED_INFO.motm,
  cs: { label: "Clean sheets", description: MEANING.eaCs },
  red: RECORDED_INFO.red,
};

/** Gives each column its full name and meaning from `info`. */
function describeColumns<Row>(
  columns: DataTableColumn<Row>[],
  info: Readonly<Record<string, ColumnInfo>>,
): DataTableColumn<Row>[] {
  return columns.map((c) => ({ ...info[c.id], ...c }));
}

/** Starts hidden; the Columns picker brings it back. */
function hiddenByDefault<Row>(
  column: DataTableColumn<Row>,
): DataTableColumn<Row> {
  return { ...column, defaultHidden: true };
}

/**
 * The stats people compare lead (G+A, MOTM, rating, Form, Appearances), so a
 * phone shows them beside the name before the table scrolls. The niche ones
 * start hidden (CLUBS-80): Mins, Shots, Tkl %, CS and Saves.
 */
const COLUMNS = describeColumns<LeaderboardRow>(
  [
    nameColumn((r) => r.formIndicator),
    recordedStat("ga", "G+A", (r) => r.goalContributions),
    recordedStat("motm", "MOTM", (r) => r.manOfTheMatch),
    recordedStat("rating", "Rating", (r) => r.averageRating, formatDecimal),
    {
      ...recordedStat("form", "Form", (r) => r.form),
      cell: (r) => <FormCell form={r.form} average={r.averageRating} />,
    },
    recordedStat("apps", "Played", (r) => r.appearances),
    recordedStat(
      "aboveTeam",
      "Above team",
      (r) => r.aboveTeam,
      formatSignedDecimal,
    ),
    recordedStat("goals", "G", (r) => r.goals),
    recordedStat("assists", "A", (r) => r.assists),
    hiddenByDefault(
      recordedStat("mins", "Mins", (r) => r.minutes, formatThousands),
    ),
    recordedStat("goals90", "G/90", (r) => r.goalsPer90, per90),
    recordedStat("assists90", "A/90", (r) => r.assistsPer90, per90),
    recordedStat("ga90", "G+A/90", (r) => r.goalContributionsPer90, per90),
    hiddenByDefault(recordedStat("shots", "Shots", (r) => r.shots)),
    recordedStat("pass", "Pass %", (r) => r.passPercentage, formatPercentage),
    hiddenByDefault(
      recordedStat(
        "tackle",
        "Tkl %",
        (r) => r.tacklePercentage,
        formatPercentage,
      ),
    ),
    hiddenByDefault(recordedStat("cs", "CS", (r) => r.cleanSheets)),
    hiddenByDefault(recordedStat("saves", "Saves", (r) => r.saves)),
    recordedStat("red", "Red", (r) => r.redCards),
    recordedStat("red90", "Red/90", (r) => r.redCardsPer90, per90),
    {
      id: "recent",
      header: "Recent",
      cell: (r) => <RecentChangeCell change={r.recentChange} />,
      sortValue: (r) => recentChangeRank(r.recentChange),
    },
  ],
  RECORDED_INFO,
);

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
const EA_COLUMNS = describeColumns<EaMemberTotals>(
  [
    nameColumn(),
    stat("ga", "G+A", season(goalContributions)),
    seasonStat("rating", "Rating", "averageRating", formatDecimal),
    seasonStat("pass", "Pass %", "passSuccessRate", formatPercentage),
    seasonStat("games", "Played", "gamesPlayed"),
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
  ],
  EA_INFO,
);

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
