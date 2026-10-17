/** Match detail: the score, both line-ups, and the two clubs' totals side by side. */
import { env } from "cloudflare:workers";
import { data, Link } from "react-router";

import {
  BackLink,
  MatchScoreBar,
  PageHeader,
  PlayerChip,
  RouteError,
  SectionHeading,
} from "~/components";
import { getDb } from "~/db/client";
import type { PositionGroup } from "~/lib/domain";
import { formatLondonDateTime } from "~/lib/london-time";
import { formatDecimal, formatPercentage, NO_VALUE } from "~/lib/number-format";
import {
  getMatch,
  type MatchAppearance,
  type PlayerTotals,
  summariseAppearances,
} from "~/stats";
// The component groups line-ups, so import the pure helper directly to keep
// the query modules out of the client bundle.
import { groupBy } from "~/stats/summaries";

import type { Route } from "./+types/match";

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "A Bloo Bloo — Match not found" }];
  const { clubName, match } = loaderData;
  return [
    {
      title: `${clubName} ${match.goalsFor}–${match.goalsAgainst} ${match.opponent.name}`,
    },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const match = await getMatch(getDb(env.DB), params.matchId);
  if (!match) throw data("Match not found", { status: 404 });
  const ours = match.appearances.filter((a) => a.isOurClub);
  const theirs = match.appearances.filter((a) => !a.isOurClub);
  return {
    clubName: env.EA_CLUB_NAME,
    match,
    ours,
    theirs,
    totals: {
      ours: summariseAppearances(ours),
      theirs: summariseAppearances(theirs),
    },
  };
}

export default function Match({ loaderData }: Route.ComponentProps) {
  const { clubName, match, ours, theirs, totals } = loaderData;
  const { opponent } = match;
  const motm = match.appearances.find((a) => a.manOfTheMatch);
  return (
    <>
      <BackLink to="/matches">All Matches</BackLink>
      <PageHeader
        title={`v ${opponent.name}`}
        subtitle={
          <time dateTime={match.playedAt.toISOString()}>
            {formatLondonDateTime(match.playedAt)}
          </time>
        }
        aside={
          <Link
            to={`/opponents/${opponent.clubId}`}
            className="text-sound-300 text-sm underline-offset-4 hover:underline"
          >
            Head-to-head with {opponent.name}
          </Link>
        }
      />

      <section aria-label="Score" className="mb-8">
        <MatchScoreBar
          clubName={clubName}
          match={match}
          size="hero"
          status={match.dnf ? undefined : "FT"}
        />
        {match.dnf &&
          (match.outcome === "W" ? (
            <DnfNote winner={clubName} quitter={opponent.name} />
          ) : (
            <DnfNote winner={opponent.name} quitter={clubName} />
          ))}
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        <section aria-label="Match stats" className="min-w-0">
          <SectionHeading title="Match stats" />
          <TeamComparison
            clubName={clubName}
            opponentName={opponent.name}
            goals={[match.goalsFor, match.goalsAgainst]}
            totals={totals}
          />
          {motm && (
            <div className="mt-6">
              <h3 className="mb-2 font-display font-bold text-ink-muted text-lg uppercase tracking-wide">
                Man of the Match
              </h3>
              <PlayerChip
                name={motm.name}
                positionGroup={motm.positionGroup ?? undefined}
                stat={formatDecimal(motm.rating)}
                to={motm.isOurClub ? playerPath(motm.playerId) : undefined}
              />
            </div>
          )}
        </section>

        <section aria-label="Line-ups" className="min-w-0 lg:col-span-2">
          <SectionHeading
            title="Line-ups"
            subtitle="Each club's Appearances by Position Group, best rated first."
          />
          <div className="flex flex-col gap-6">
            <Lineup name={clubName} appearances={ours} isOurClub />
            <Lineup
              name={opponent.name}
              appearances={theirs}
              isOurClub={false}
            />
          </div>
        </section>
      </div>
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <RouteError
      error={error}
      subject="Match"
      notFoundDescription="No recorded Match has this ID. It may be older than the first Poll."
      back={{ to: "/matches", children: "All Matches" }}
    />
  );
}

function DnfNote({ winner, quitter }: { winner: string; quitter: string }) {
  return (
    <aside
      aria-label="DNF"
      className="mt-4 flex gap-3 border-ink border-l-4 bg-shale-900 px-4 py-3 text-ink-soft text-sm"
    >
      <p>
        <strong className="text-ink">Did not finish.</strong> {quitter} quit
        before full time, so EA awarded the Match to {winner}. DNF Matches count
        in all stats unless you turn off “Include DNF” in the filters.
      </p>
    </aside>
  );
}

type Side = { ours: PlayerTotals; theirs: PlayerTotals };

type ComparisonRow = {
  label: string;
  ours: number | null;
  theirs: number | null;
  format?: (value: number) => string;
};

function TeamComparison({
  clubName,
  opponentName,
  goals,
  totals,
}: {
  clubName: string;
  opponentName: string;
  goals: [number, number];
  totals: Side;
}) {
  const rows: ComparisonRow[] = [
    { label: "Goals", ours: goals[0], theirs: goals[1] },
    { label: "Shots", ours: totals.ours.shots, theirs: totals.theirs.shots },
    {
      label: "Pass %",
      ours: totals.ours.passPercentage,
      theirs: totals.theirs.passPercentage,
      format: formatPercentage,
    },
    {
      label: "Tackles",
      ours: totals.ours.tacklesMade,
      theirs: totals.theirs.tacklesMade,
    },
    { label: "Saves", ours: totals.ours.saves, theirs: totals.theirs.saves },
    {
      label: "Average rating",
      ours: totals.ours.averageRating,
      theirs: totals.theirs.averageRating,
      format: formatDecimal,
    },
  ];

  return (
    <div className="border-shale-700 border-t-2 bg-shale-900 p-4">
      <div className="mb-4 grid grid-cols-2 gap-2 font-display font-extrabold text-lg uppercase leading-tight">
        <span className="truncate text-ink">{clubName}</span>
        <span className="truncate text-right text-ink-soft">
          {opponentName}
        </span>
      </div>
      <ul className="flex flex-col gap-4">
        {rows.map((row) => (
          <ComparisonBar
            key={row.label}
            row={row}
            clubName={clubName}
            opponentName={opponentName}
          />
        ))}
      </ul>
    </div>
  );
}

function ComparisonBar({
  row,
  clubName,
  opponentName,
}: {
  row: ComparisonRow;
  clubName: string;
  opponentName: string;
}) {
  const { label, ours, theirs, format = String } = row;
  const show = (v: number | null) => (v === null ? NO_VALUE : format(v));
  const sum = (ours ?? 0) + (theirs ?? 0);
  const hasValues = sum > 0;
  // Neither side has a value: an even, muted split, so the bar never collapses.
  const oursShare = hasValues ? ((ours ?? 0) / sum) * 100 : 50;
  const oursFill = hasValues ? "bg-sound-700" : "bg-shale-700";
  const theirsFill = hasValues ? "bg-shale-600" : "bg-shale-700";
  const leader = leaderOf(ours, theirs);

  return (
    <li>
      <p className="sr-only">{`${label}: ${clubName} ${show(ours)}, ${opponentName} ${show(theirs)}`}</p>
      <div aria-hidden>
        <div className="mb-1 grid grid-cols-[1fr_auto_1fr] items-baseline gap-2">
          <span
            className={`font-display font-extrabold text-3xl tabular leading-none ${leader === "theirs" ? "text-ink-muted" : "text-ink"}`}
          >
            {show(ours)}
          </span>
          <span className="text-ink-soft text-sm">{label}</span>
          <span
            className={`text-right font-display font-extrabold text-3xl tabular leading-none ${leader === "ours" ? "text-ink-muted" : "text-ink"}`}
          >
            {show(theirs)}
          </span>
        </div>
        <div className="flex h-2 gap-1">
          <span
            className={`clip-slant-r [--slant:0.4rem] ${oursFill}`}
            style={{ width: `${oursShare}%` }}
          />
          <span
            className={`clip-slant-l flex-1 [--slant:0.4rem] ${theirsFill}`}
          />
        </div>
      </div>
    </li>
  );
}

/** Which side has the higher value; null when tied or either side is missing. */
function leaderOf(
  ours: number | null,
  theirs: number | null,
): "ours" | "theirs" | null {
  if (ours === null || theirs === null || ours === theirs) return null;
  return ours > theirs ? "ours" : "theirs";
}

const POSITION_ORDER: readonly (PositionGroup | null)[] = [
  "Goalkeeper",
  "Defender",
  "Midfielder",
  "Forward",
  null,
];

const POSITION_HEADING: Record<PositionGroup, string> = {
  Goalkeeper: "Goalkeepers",
  Defender: "Defenders",
  Midfielder: "Midfielders",
  Forward: "Forwards",
};

/** Rating leads, so it stays in view on a phone without scrolling the table. */
const STAT_COLUMNS: {
  abbr: string;
  title: string;
  cell: (a: MatchAppearance) => string | number;
  emphasis?: boolean;
}[] = [
  {
    abbr: "Rtg",
    title: "Rating",
    cell: (a) => formatDecimal(a.rating),
    emphasis: true,
  },
  { abbr: "G", title: "Goals", cell: (a) => a.goals },
  { abbr: "A", title: "Assists", cell: (a) => a.assists },
  { abbr: "Sh", title: "Shots", cell: (a) => a.shots },
  {
    abbr: "Pas",
    title: "Passes completed of attempted",
    cell: (a) => `${a.passesMade}/${a.passAttempts}`,
  },
  { abbr: "Tkl", title: "Tackles", cell: (a) => a.tacklesMade },
  { abbr: "Sv", title: "Saves", cell: (a) => a.saves },
];

function Lineup({
  name,
  appearances,
  isOurClub,
}: {
  name: string;
  appearances: MatchAppearance[];
  isOurClub: boolean;
}) {
  const groups = groupBy(
    [...appearances].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1)),
    (a) => a.positionGroup,
  );
  const columnCount = STAT_COLUMNS.length + 1;

  return (
    <div className="min-w-0 border-shale-700 border-t-2 bg-shale-900">
      <h3
        className={`clip-slant-r px-4 py-2 pr-8 font-display font-extrabold text-xl uppercase tracking-wide [--slant:0.75rem] ${isOurClub ? "bg-sound-900 text-ink" : "bg-shale-800 text-ink-soft"}`}
      >
        {name}
      </h3>
      {appearances.length === 0 ? (
        <p className="p-4 text-ink-soft text-sm">
          EA sent no player stats for this side.
        </p>
      ) : (
        <section
          className="overflow-x-auto"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region
          tabIndex={0}
          aria-label={`${name} line-up`}
        >
          <table className="w-full border-separate border-spacing-0 text-sm tabular">
            <caption className="sr-only">{`${name} line-up`}</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 border-shale-700 border-b bg-shale-800 px-3 py-2 text-left font-display font-bold text-base text-ink-muted uppercase tracking-wide"
                >
                  Player
                </th>
                {STAT_COLUMNS.map((c) => (
                  <th
                    key={c.abbr}
                    scope="col"
                    className="border-shale-700 border-b bg-shale-800 px-2.5 py-2 text-right font-display font-bold text-base text-ink-muted uppercase tracking-wide"
                  >
                    <abbr title={c.title} className="no-underline">
                      {c.abbr}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            {POSITION_ORDER.filter((group) => groups.has(group)).map(
              (group) => (
                <tbody key={group ?? "unknown"}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={columnCount}
                      className="border-shale-700 border-b bg-shale-950/40 px-3 pt-3 pb-1 text-left font-display font-bold text-ink-muted text-sm uppercase tracking-wider"
                    >
                      {group ? POSITION_HEADING[group] : "Position unknown"}
                    </th>
                  </tr>
                  {groups.get(group)?.map((a) => (
                    <LineupRow key={a.playerId} appearance={a} />
                  ))}
                </tbody>
              ),
            )}
          </table>
        </section>
      )}
    </div>
  );
}

function LineupRow({ appearance: a }: { appearance: MatchAppearance }) {
  const cell =
    "whitespace-nowrap border-shale-700 border-b px-2.5 py-2.5 text-right group-hover:bg-shale-800";
  return (
    <tr className="group">
      <th
        scope="row"
        className="sticky left-0 z-10 whitespace-nowrap border-shale-700 border-b bg-shale-900 px-3 py-2.5 text-left font-semibold text-ink shadow-[1px_0_0_var(--color-shale-700)] group-hover:bg-shale-800"
      >
        <span className="flex items-center gap-2">
          {a.isOurClub ? (
            <Link
              to={playerPath(a.playerId)}
              className="text-sound-300 underline-offset-4 hover:underline"
            >
              {a.name}
            </Link>
          ) : (
            <span>{a.name}</span>
          )}
          {a.manOfTheMatch && <MotmMarker />}
        </span>
      </th>
      {STAT_COLUMNS.map((c) => (
        <td
          key={c.abbr}
          className={`${cell} ${c.emphasis ? "font-display font-extrabold text-ink text-lg" : "text-ink-soft"}`}
        >
          {c.cell(a)}
        </td>
      ))}
    </tr>
  );
}

function playerPath(playerId: string): string {
  return `/players/${playerId}`;
}

function MotmMarker() {
  return (
    <abbr
      title="Man of the Match"
      className="clip-slant bg-rave px-2 py-0.5 font-display font-extrabold text-shale-950 text-xs leading-none no-underline [--slant:0.25rem]"
    >
      MOTM
    </abbr>
  );
}
