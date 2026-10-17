import { env } from "cloudflare:workers";
import { Link } from "react-router";

import {
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  HeadToHeadBar,
  numberColumn,
  PageHeader,
} from "~/components";
import { getDb } from "~/db/client";
import { formatLondonDate } from "~/lib/london-time";
import {
  formatCount,
  formatPercentage,
  formatSigned,
} from "~/lib/number-format";
import {
  isDefaultStatsFilter,
  type OpponentRecord,
  opponentRecords,
  statsFilterFromRequest,
} from "~/stats";

import type { Route } from "./+types/opponents";

export function meta(_: Route.MetaArgs) {
  return [{ title: "A Bloo Bloo — Opponents" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const filter = statsFilterFromRequest(request);
  const opponents = await opponentRecords(getDb(env.DB), filter);
  return { clubName: env.EA_CLUB_NAME, filter, opponents };
}

const COLUMNS: DataTableColumn<OpponentRecord>[] = [
  {
    id: "opponent",
    header: "Opponent",
    cell: (o) => (
      <Link
        to={`/opponents/${o.clubId}`}
        // Long club names truncate on phones so the stats stay in view.
        className="block max-w-36 truncate text-sound-300 hover:text-ink hover:underline sm:max-w-none"
        title={o.name}
      >
        {o.name}
      </Link>
    ),
    sortValue: (o) => o.name,
    firstSort: "asc",
  },
  numberColumn("played", "P", (o) => o.record.played),
  numberColumn("wins", "W", (o) => o.record.wins),
  numberColumn("draws", "D", (o) => o.record.draws),
  numberColumn("losses", "L", (o) => o.record.losses),
  numberColumn("goalsFor", "GF", (o) => o.record.goalsFor),
  numberColumn("goalsAgainst", "GA", (o) => o.record.goalsAgainst),
  numberColumn(
    "goalDifference",
    "GD",
    (o) => o.record.goalDifference,
    formatSigned,
  ),
  numberColumn(
    "winPercentage",
    "Win %",
    (o) => o.record.winPercentage,
    formatPercentage,
  ),
  {
    id: "lastMet",
    header: "Last met",
    align: "right",
    cell: (o) => (
      <time dateTime={o.lastMet.toISOString()}>
        {formatLondonDate(o.lastMet)}
      </time>
    ),
    sortValue: (o) => o.lastMet.getTime(),
  },
];

export default function Opponents({ loaderData }: Route.ComponentProps) {
  const { clubName, filter, opponents } = loaderData;
  const [mostPlayed] = opponents;

  return (
    <>
      <PageHeader
        title="Opponents"
        subtitle="Every club we have played, most met first."
      />
      <FilterBar filter={filter} />

      {mostPlayed ? (
        <div className="grid gap-8">
          <Link
            to={`/opponents/${mostPlayed.clubId}`}
            className="block transition-[filter] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-rave focus-visible:outline-offset-4"
          >
            <HeadToHeadBar
              size="hero"
              label="Most played"
              status={formatCount(mostPlayed.record.played, "Match", "Matches")}
              ourClub={clubName}
              opponent={mostPlayed.name}
              record={mostPlayed.record}
            />
          </Link>
          <DataTable
            caption="Head-to-head records"
            columns={COLUMNS}
            rows={opponents}
            rowKey={(o) => o.clubId}
            initialSort={{ columnId: "played", direction: "desc" }}
          />
        </div>
      ) : (
        <EmptyState
          title="No Opponents yet"
          description={
            isDefaultStatsFilter(filter)
              ? "Clubs appear here once the Poll records a Match against them."
              : "No Matches fit these filters. Widen the Match Types or dates."
          }
        />
      )}
    </>
  );
}
