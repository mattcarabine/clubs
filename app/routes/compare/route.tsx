/**
 * Compare (CLUBS-20): two Squad Members side by side as a broadcast tale of
 * the tape. Squad Member A is on the left in blue, B on the right in green.
 *
 *   /compare?players=A,B&scope=together&posA=midfielder&posB=forward&source=ea
 *
 * Recorded mode shows the headline stats, both rating runs on one chart and
 * Our Club's record, over every Match each played or only their Shared
 * Matches ("Played together"). Each side counts its own Position Groups.
 * Below them, "Rise and fall together?" (CLUBS-66) asks whether the two rate
 * well and badly in the same Matches, over every Shared Match.
 * EA totals mode shows the headline stats only: EA has no per-Match data.
 */
import { env } from "cloudflare:workers";
import { redirect, useSearchParams } from "react-router";

import {
  ChartFrame,
  ChartLegend,
  Chip,
  ChipGroup,
  EmptyState,
  FilterBar,
  LineChart,
  PageHeader,
  SERIES_COLORS,
  SectionHeading,
  StatGrid,
  StatTile,
} from "~/components";
import { getDb } from "~/db/client";
import {
  formatCount,
  formatDecimal,
  formatPercentage,
  formatSigned,
  formatSignedDecimal,
  NO_VALUE,
} from "~/lib/number-format";
import { pageMeta } from "~/lib/page-meta";
import {
  COMPARISON_SCOPE_LABEL,
  COMPARISON_SCOPES,
  type ComparedTotals,
  type ComparisonScope,
  canonicalComparisonParams,
  type EaSeasonTotals,
  getComparison,
  getEaComparison,
  isSmallSample,
  parseComparisonParams,
  parseStatsFilter,
  parseStatsSource,
  type RecordSummary,
  resolveStatsFilter,
  writeComparisonScope,
} from "~/stats";

import type { Route } from "./+types/route";
import { PlayerPlates } from "./player-plates";
import { RatingLink } from "./rating-link";
import {
  SMALL_SAMPLE_NOTE,
  TaleOfTheTape,
  type TapeRow,
} from "./tale-of-the-tape";

export function meta({ location }: Route.MetaArgs) {
  return pageMeta({
    title: "A Bloo Bloo — Compare",
    description: "Two Squad Members side by side: a tale of the tape.",
    path: location.pathname,
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const comparison = parseComparisonParams(params);
  const db = getDb(env.DB);
  const filter = await resolveStatsFilter(db, parseStatsFilter(params));
  const data =
    parseStatsSource(params) === "ea"
      ? {
          source: "ea" as const,
          ...(await getEaComparison(db, comparison)),
        }
      : {
          source: "recorded" as const,
          ...(await getComparison(db, filter, comparison)),
        };
  // A repeated or unknown ID leaves its side to the picker: drop it from
  // the URL, so each side keeps its own Position Groups.
  const canonical = canonicalComparisonParams(
    params,
    comparison,
    data.players.map((p) => p.playerId),
  );
  if (canonical) throw redirect(`/compare?${canonical}`);
  return { ...data, filter, comparison };
}

type CompareData = Route.ComponentProps["loaderData"];
type CompareDataFor<Source> = Extract<CompareData, { source: Source }>;

/** Each Squad Member's colour, from the fixed series order: A blue, B green. */
const SIDE_COLORS = [SERIES_COLORS[1], SERIES_COLORS[0]] as const;

export default function Compare({ loaderData }: Route.ComponentProps) {
  const { filter, source, comparison, members, players } = loaderData;
  const [a, b] = players;
  return (
    <>
      <PageHeader
        title="Compare"
        subtitle={
          a && b
            ? `${a.name} and ${b.name}, side by side`
            : "Two Squad Members, side by side"
        }
      />
      <FilterBar filter={filter} source={source} />
      <PlayerPlates
        members={members}
        players={players}
        positionGroups={comparison.positionGroups}
        source={source}
        formIndicators={
          loaderData.source === "recorded"
            ? loaderData.sides.map((s) => s.formIndicator)
            : undefined
        }
      />
      {!a ? (
        <EmptyState
          title="Pick two Squad Members"
          description="Choose a Squad Member above, then another to compare them with."
        />
      ) : (
        <>
          {!b && (
            <p className="mb-6 text-ink-soft text-sm">
              Pick a second Squad Member under "Compare to" to set them side by
              side.
            </p>
          )}
          {loaderData.source === "ea" ? (
            <EaComparison {...loaderData} />
          ) : (
            <RecordedComparison {...loaderData} />
          )}
        </>
      )}
    </>
  );
}

function names(data: CompareData): readonly [string, string | null] {
  return [data.players[0]?.name ?? "", data.players[1]?.name ?? null];
}

function RecordedComparison(data: CompareDataFor<"recorded">) {
  const { sides, shared, comparison, link, players } = data;
  const twoSides = sides.length === 2;
  const scope = twoSides ? comparison.scope : "all";
  return (
    <>
      {twoSides && <ScopeToggle scope={scope} />}
      <section aria-label="Headline stats" className="mb-8">
        <SectionHeading
          title="Headline stats"
          subtitle={
            scope === "together"
              ? `Only the ${formatCount(shared?.played ?? 0, "Match", "Matches")} they played together`
              : "Every Match each played"
          }
        />
        <TaleOfTheTape
          caption="Headline stats"
          names={names(data)}
          rows={recordedRows(sides)}
        />
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <RatingChart data={data} />
        <section aria-label="Team record" className="min-w-0">
          {shared ? (
            <>
              <SectionHeading
                title="Team record"
                subtitle="Our Club's results in the Matches they played together"
              />
              <SharedRecord record={shared} />
            </>
          ) : (
            <>
              <SectionHeading
                title="Team record"
                subtitle="Our Club's results in the Matches each played"
              />
              <TaleOfTheTape
                caption="Team record"
                names={names(data)}
                rows={recordRows(sides.map((s) => s.record))}
              />
            </>
          )}
        </section>
      </div>
      {link && players[1] && (
        <RatingLink link={link} names={[players[0].name, players[1].name]} />
      )}
    </>
  );
}

function EaComparison(data: CompareDataFor<"ea">) {
  return (
    <>
      <section aria-label="Headline stats" className="mb-6">
        <SectionHeading
          title="Headline stats"
          subtitle="EA's season totals, including Matches from before tracking began"
        />
        <TaleOfTheTape
          caption="Headline stats"
          names={names(data)}
          rows={eaRows(data.sides)}
        />
      </section>
      <p className="max-w-prose border-shale-700 border-l-2 pl-3 text-ink-muted text-sm">
        EA gives no per-Match data, so the rating chart, team record and "Played
        together" need Recorded mode.
      </p>
    </>
  );
}

/** "All matches" or "Played together" (`?scope=together`). */
function ScopeToggle({ scope }: { scope: ComparisonScope }) {
  const [, setSearchParams] = useSearchParams();
  return (
    <div className="mb-6">
      <ChipGroup label="Matches">
        {COMPARISON_SCOPES.map((option) => (
          <Chip
            key={option}
            pressed={scope === option}
            onClick={() =>
              setSearchParams(
                (params) => writeComparisonScope(params, option),
                { preventScrollReset: true },
              )
            }
          >
            {COMPARISON_SCOPE_LABEL[option]}
          </Chip>
        ))}
      </ChipGroup>
    </div>
  );
}

/** A pair of figures, one per side; B is null until there is a second Squad Member. */
function pair<T>(
  sides: readonly T[],
  pick: (side: T) => number | null,
): [number | null, number | null] {
  const value = (side: T | undefined) => (side ? pick(side) : null);
  return [value(sides[0]), value(sides[1])];
}

/** Whether each side's figures rest on a small sample of `matches`. */
function smallSamples<T>(
  sides: readonly T[],
  matches: (side: T) => number,
): [boolean, boolean] {
  const [a, b] = pair(sides, matches);
  return [a !== null && isSmallSample(a), b !== null && isSmallSample(b)];
}

/** The headline stats over Recorded Appearances; a side with none shows "–" throughout. */
function recordedRows(sides: readonly ComparedTotals[]): TapeRow[] {
  const smallSample = smallSamples(sides, (s) => s.totals.appearances);
  const stat = (
    label: string,
    pick: (side: ComparedTotals["totals"]) => number | null,
    format: (value: number) => string = String,
  ): TapeRow => ({
    label,
    values: pair(sides, (s) =>
      s.totals.appearances === 0 ? null : pick(s.totals),
    ),
    format,
    better: "higher",
    smallSample,
  });
  return [
    stat("Appearances", (t) => t.appearances),
    stat("Goals", (t) => t.goals),
    stat("Assists", (t) => t.assists),
    stat("G+A", (t) => t.goalContributions),
    stat(
      "G+A per 90",
      (t) => t.goalContributionsPer90,
      (v) => formatDecimal(v, 2),
    ),
    stat("Pass %", (t) => t.passPercentage, formatPercentage),
    stat("Tackle %", (t) => t.tacklePercentage, formatPercentage),
    stat("Avg rating", (t) => t.averageRating, formatDecimal),
    {
      label: "Vs team",
      values: pair(sides, (s) => s.vsTeam.gap),
      format: formatSignedDecimal,
      better: "higher",
      smallSample: smallSamples(sides, (s) => s.vsTeam.matches),
      bars: false,
    },
    // Consistency (CLUBS-74): a dash under 5 rated Appearances.
    {
      label: "Floor",
      values: pair(sides, (s) => s.consistency.floor),
      format: formatDecimal,
      better: "higher",
    },
    {
      label: "Spread",
      values: pair(sides, (s) => s.consistency.spread),
      format: (v) => formatDecimal(v, 2),
      better: "lower",
      bars: false,
    },
    stat("MOTM", (t) => t.manOfTheMatch),
    stat("Form", (t) => t.form, formatDecimal),
  ];
}

/** EA's season totals: no per-90s or Form, since EA sends no minutes or per-Match ratings. */
function eaRows(sides: readonly (EaSeasonTotals | null)[]): TapeRow[] {
  const stat = (
    label: string,
    pick: (season: EaSeasonTotals) => number | null,
    format: (value: number) => string = String,
  ): TapeRow => ({
    label,
    values: pair(sides, (s) => (s ? pick(s) : null)),
    format,
    better: "higher",
  });
  return [
    stat("Games", (s) => s.gamesPlayed),
    stat("Goals", (s) => s.goals),
    stat("Assists", (s) => s.assists),
    stat("G+A", (s) =>
      s.goals === null || s.assists === null ? null : s.goals + s.assists,
    ),
    stat("Pass %", (s) => s.passSuccessRate, formatPercentage),
    stat("Tackle %", (s) => s.tackleSuccessRate, formatPercentage),
    stat("Avg rating", (s) => s.averageRating, formatDecimal),
    stat("MOTM", (s) => s.manOfTheMatch),
    stat("Win %", (s) => s.winRate, formatPercentage),
  ];
}

/** Our Club's record in each side's Matches, as a tape. */
function recordRows(records: readonly RecordSummary[]): TapeRow[] {
  const smallSample = smallSamples(records, (r) => r.played);
  const row = (
    label: string,
    pick: (record: RecordSummary) => number | null,
    better: TapeRow["better"],
    format: (value: number) => string = String,
    bars = true,
  ): TapeRow => ({
    label,
    values: pair(records, (r) => (r.played === 0 ? null : pick(r))),
    format,
    better,
    smallSample,
    bars,
  });
  return [
    row("Played", (r) => r.played, null),
    row("Won", (r) => r.wins, "higher"),
    row("Drawn", (r) => r.draws, null),
    row("Lost", (r) => r.losses, "lower"),
    row("Goal diff", (r) => r.goalDifference, "higher", formatSigned, false),
    row("Win %", (r) => r.winPercentage, "higher", formatPercentage),
  ];
}

/** Under "Played together", one record for the Shared Matches. */
function SharedRecord({ record }: { record: RecordSummary }) {
  const empty = record.played === 0;
  const figure = (
    value: number | null,
    format: (value: number) => string = String,
  ) => (empty || value === null ? NO_VALUE : format(value));
  return (
    <>
      <StatGrid>
        <StatTile label="Played" value={record.played} featured />
        <StatTile label="Won" value={figure(record.wins)} />
        <StatTile label="Drawn" value={figure(record.draws)} />
        <StatTile label="Lost" value={figure(record.losses)} />
        <StatTile
          label="Goal difference"
          value={figure(record.goalDifference, formatSigned)}
        />
        <StatTile
          label="Win %"
          value={figure(record.winPercentage, formatPercentage)}
        />
      </StatGrid>
      {isSmallSample(record.played) && (
        <p className="mt-2 text-ink-muted text-xs">{SMALL_SAMPLE_NOTE}</p>
      )}
    </>
  );
}

/** Both rating runs on one chart, by Appearance, each with its 5-Match average. */
function RatingChart({ data }: { data: CompareDataFor<"recorded"> }) {
  const runs = data.sides.map((side, i) => ({
    name: data.players[i].name,
    color: SIDE_COLORS[i],
    form: side.form,
  }));
  const length = Math.max(0, ...runs.map((r) => r.form.length));
  if (length === 0) {
    return (
      <EmptyState
        title="No ratings to chart"
        description="Neither Squad Member has an Appearance in these filters."
      />
    );
  }
  const series = runs.flatMap(({ name, color, form }, i) => {
    const values = (
      pick: (p: ComparedTotals["form"][number]) => number | null,
    ) => Array.from({ length }, (_, n) => (form[n] ? pick(form[n]) : null));
    return [
      {
        id: `rating-${i}`,
        label: `${name} rating`,
        color,
        values: values((p) => p.rating),
      },
      {
        id: `rolling-${i}`,
        label: `${name} 5-Match avg`,
        color,
        dashed: true,
        values: values((p) => p.ratingRolling),
      },
    ];
  });
  return (
    <ChartFrame
      title="Match rating"
      subtitle="By Appearance, oldest first; dashed is the 5-Match average"
      legend={<ChartLegend entries={series} />}
    >
      <LineChart
        label="Match rating"
        labels={Array.from({ length }, (_, n) => `App ${n + 1}`)}
        series={series}
        formatValue={formatDecimal}
        includeZero={false}
        height={260}
      />
    </ChartFrame>
  );
}
