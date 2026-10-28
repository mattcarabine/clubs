import {
  useLocation,
  useNavigation,
  useRouteLoaderData,
  useSearchParams,
} from "react-router";

import type { loader as rootLoader } from "~/root";

import {
  CAMPAIGN_REF_LABEL,
  type CampaignRef,
  type DateRange,
  MATCH_TYPES,
  parseStatsFilter,
  type StatsFilter,
  selectCampaign,
  toggleMatchType,
  writeStatsFilter,
} from "~/stats/filter";
import {
  parseStatsSource,
  STATS_SOURCE_LABEL,
  STATS_SOURCES,
  type StatsSource,
  writeStatsSource,
} from "~/stats/source";

import { Chip, ChipGroup } from "./chip";
import { DateRangePicker } from "./date-range-picker";
import {
  EA_POSITIONS_DISABLED,
  MainPositionToggle,
} from "./main-position-toggle";
import { ScrollRail } from "./scroll-rail";

type FilterBarProps = {
  /** The page's current filter, parsed in its loader with `statsFilterFromRequest`. */
  filter: StatsFilter;
  /**
   * Shows the Recorded / EA totals toggle with this value (from
   * `statsSourceFromRequest`). On EA totals the Match filters are hidden,
   * because EA's totals cannot be narrowed.
   */
  source?: StatsSource;
  /**
   * Shows the "Main position only" toggle (`?positions=all` turns it off).
   * Only player-level pages (Squad, a profile, Compare) pass it; team-level
   * pages leave it off. On EA totals it stays visible but disabled.
   */
  positions?: boolean;
};

/**
 * The global stats filter: Match Types, rage quits, date range, Season and
 * Campaign. The Season picker lists the Seasons from the root loader, and
 * shows once there are two to choose between; the Campaign chips show once a
 * Campaign is tracked. Every change rewrites the URL, so the page's
 * loader reruns with the new filter and the view can be shared.
 *
 * With a `source`, it leads with the Recorded / EA totals toggle; with
 * `positions`, the "Main position only" toggle follows it.
 *
 * While a filter change is loading, the chips show the pending URL and the
 * next change builds on it, so quick successive clicks all count.
 */
export function FilterBar(props: FilterBarProps) {
  const [, setSearchParams] = useSearchParams();
  const pending = usePendingSearchParams();
  const filter = pending ? parseStatsFilter(pending) : props.filter;
  const { seasons, firstMatchDate, campaignCount } = useRootFilterData();
  const source =
    pending && props.source !== undefined
      ? parseStatsSource(pending)
      : props.source;

  const apply = (write: (params: URLSearchParams) => URLSearchParams) =>
    setSearchParams((current) => write(pending ?? current), {
      preventScrollReset: true,
    });
  const updateFilter = (change: (filter: StatsFilter) => StatsFilter) =>
    apply((params) =>
      writeStatsFilter(params, change(parseStatsFilter(params))),
    );
  const setDates = (dates: DateRange) => updateFilter((f) => ({ ...f, dates }));

  const sourceToggle = source !== undefined && (
    <ChipGroup label="Source">
      {STATS_SOURCES.map((option) => (
        <Chip
          key={option}
          pressed={source === option}
          onClick={() => apply((params) => writeStatsSource(params, option))}
        >
          {STATS_SOURCE_LABEL[option]}
        </Chip>
      ))}
    </ChipGroup>
  );

  const positionPicker = props.positions && (
    <MainPositionToggle
      value={filter.mainPositionOnly}
      onChange={(mainPositionOnly) =>
        updateFilter((f) => ({ ...f, mainPositionOnly }))
      }
      disabledReason={source === "ea" ? EA_POSITIONS_DISABLED : undefined}
    />
  );

  if (source === "ea") {
    return (
      <section
        aria-label="Stats filters"
        aria-busy={pending !== null}
        className="mb-6 border-shale-700 border-t-2 bg-shale-900"
      >
        <ScrollRail className={RAIL_PADDING}>
          {sourceToggle}
          {positionPicker}
        </ScrollRail>
        {/* Under the rail, so phones never scroll the note out of view. */}
        <p className="max-w-md px-3 pb-3 text-ink-muted text-sm leading-snug sm:px-4">
          EA's own totals, including Matches from before tracking began. The
          Match filters don't apply to them.
          {/* Phones have no tooltips, so the disabled chips' reason is said here too. */}
          {props.positions && " Nor can they be split by position."}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Stats filters"
      aria-busy={pending !== null}
      className="mb-6 border-shale-700 border-t-2 bg-shale-900"
    >
      <ScrollRail className={RAIL_PADDING}>
        {sourceToggle}
        {positionPicker}

        <ChipGroup label="Match Type">
          {MATCH_TYPES.map((type) => {
            const selected = filter.matchTypes.includes(type);
            return (
              <Chip
                key={type}
                pressed={selected}
                // The last selected Match Type cannot be turned off.
                disabled={selected && filter.matchTypes.length === 1}
                onClick={() => updateFilter((f) => toggleMatchType(f, type))}
              >
                {type}
              </Chip>
            );
          })}
        </ChipGroup>

        <ChipGroup label="Rage quits">
          <Chip
            pressed={filter.includeDnf}
            onClick={() =>
              updateFilter((f) => ({ ...f, includeDnf: !f.includeDnf }))
            }
          >
            Include rage quits
          </Chip>
        </ChipGroup>

        <ChipGroup label="Dates">
          <DateRangePicker
            value={filter.dates}
            firstMatchDate={firstMatchDate}
            onApply={setDates}
          />
        </ChipGroup>

        {(seasons.length > 1 || filter.season !== undefined) && (
          <ChipGroup label="Season">
            <SeasonSelect
              seasons={seasons}
              value={filter.season}
              onChange={(season) => updateFilter((f) => ({ ...f, season }))}
            />
          </ChipGroup>
        )}

        {(campaignCount > 0 || filter.campaign !== undefined) && (
          <CampaignChips
            campaignCount={campaignCount}
            value={filter.campaign?.ref}
            onChange={(ref) => updateFilter((f) => selectCampaign(f, ref))}
          />
        )}
      </ScrollRail>
    </section>
  );
}

const RAIL_PADDING = "px-3 py-3 sm:px-4";

/** What the root loader knows for every FilterBar: Season numbers (oldest first), the first Match's date and how many Campaigns there are. */
function useRootFilterData() {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  return {
    seasons: root?.seasons ?? [],
    firstMatchDate: root?.firstMatchDate ?? null,
    campaignCount: root?.campaignCount ?? 0,
  };
}

type CampaignChipsProps = {
  campaignCount: number;
  /** Undefined for no Campaign. */
  value: CampaignRef | undefined;
  onChange: (ref: CampaignRef | undefined) => void;
};

/**
 * "This Campaign" and, once there is one, "Last Campaign": pressing the
 * selected chip again clears it. A Campaign by number, from a shared link,
 * shows as its own chip.
 */
function CampaignChips({ campaignCount, value, onChange }: CampaignChipsProps) {
  const refs: CampaignRef[] =
    campaignCount > 1 ? ["current", "previous"] : ["current"];
  if (typeof value === "number") refs.push(value);
  return (
    <ChipGroup label="Campaign" title="League Matches only">
      {refs.map((ref) => (
        <Chip
          key={ref}
          pressed={value === ref}
          onClick={() => onChange(value === ref ? undefined : ref)}
        >
          {typeof ref === "number"
            ? `Campaign ${ref}`
            : CAMPAIGN_REF_LABEL[ref]}
        </Chip>
      ))}
    </ChipGroup>
  );
}

type SeasonSelectProps = {
  seasons: readonly number[];
  /** Undefined for all Seasons. */
  value: number | undefined;
  onChange: (season: number | undefined) => void;
};

/** All Seasons, then each Season newest first, the latest marked current. */
function SeasonSelect({ seasons, value, onChange }: SeasonSelectProps) {
  const current = seasons.at(-1);
  const known = new Set(seasons);
  // A Season from a shared URL that this database has not detected still shows.
  if (value !== undefined) known.add(value);
  const options = [...known].sort((a, b) => b - a);
  return (
    <select
      aria-label="Season"
      value={value ?? ""}
      onChange={(event) =>
        onChange(event.target.value ? Number(event.target.value) : undefined)
      }
      className={[
        "clip-slant min-h-9 cursor-pointer bg-shale-800 px-3.5 font-display font-bold text-base text-ink uppercase tracking-wide [--slant:0.35rem] hover:bg-shale-700",
        "focus-visible:-outline-offset-4 focus-visible:outline-ink",
      ].join(" ")}
    >
      <option value="">All Seasons</option>
      {options.map((season) => (
        <option key={season} value={season}>
          {season === current
            ? `Season ${season} (current)`
            : `Season ${season}`}
        </option>
      ))}
    </select>
  );
}

/** The search params of a navigation to this same page that is still loading, else null. */
function usePendingSearchParams(): URLSearchParams | null {
  const { pathname } = useLocation();
  const { location } = useNavigation();
  return location?.pathname === pathname
    ? new URLSearchParams(location.search)
    : null;
}
