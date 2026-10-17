import { useId, useState } from "react";
import {
  useLocation,
  useNavigation,
  useRouteLoaderData,
  useSearchParams,
} from "react-router";

import type { loader as rootLoader } from "~/root";

import {
  ALL_DATES,
  DATE_PRESET_LABEL,
  DATE_PRESETS,
  type DateRange,
  MATCH_TYPES,
  parseStatsFilter,
  type StatsFilter,
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
import { DateRangePicker, formatDateRange } from "./date-range-picker";
import {
  EA_POSITIONS_DISABLED,
  PositionGroupPicker,
} from "./position-group-picker";
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
   * Shows the Position Group selection (`?pos=`). Only player-level pages
   * (the Squad table, a profile) pass it; team-level pages leave it off. On
   * EA totals it stays visible but disabled.
   */
  positions?: boolean;
};

/**
 * The global stats filter: Match Types, DNF, date range and Season. The
 * Season picker lists the Seasons from the root loader, and shows once there
 * are two to choose between. Every change rewrites the URL, so the page's
 * loader reruns with the new filter and the view can be shared.
 *
 * With a `source`, it leads with the Recorded / EA totals toggle; with
 * `positions`, the Position Group selection follows it.
 *
 * While a filter change is loading, the chips show the pending URL and the
 * next change builds on it, so quick successive clicks all count.
 */
export function FilterBar(props: FilterBarProps) {
  const [, setSearchParams] = useSearchParams();
  const pending = usePendingSearchParams();
  const filter = pending ? parseStatsFilter(pending) : props.filter;
  const seasons = useSeasonNumbers();
  const [pickingDates, setPickingDates] = useState(false);
  const pickerId = useId();
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
  const setDates = (dates: DateRange) => {
    setPickingDates(false);
    updateFilter((f) => ({ ...f, dates }));
  };
  const { dates } = filter;

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
    <PositionGroupPicker
      value={filter.positionGroups}
      onChange={(positionGroups) =>
        updateFilter((f) => ({ ...f, positionGroups }))
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
          {props.positions && " Nor can they be split by Position Group."}
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

        <ChipGroup label="DNF">
          <Chip
            pressed={filter.includeDnf}
            onClick={() =>
              updateFilter((f) => ({ ...f, includeDnf: !f.includeDnf }))
            }
          >
            Include DNF
          </Chip>
        </ChipGroup>

        <ChipGroup label="Dates">
          <Chip
            pressed={dates.kind === "all"}
            onClick={() => setDates(ALL_DATES)}
          >
            All
          </Chip>
          {DATE_PRESETS.map((preset) => (
            <Chip
              key={preset}
              pressed={dates.kind === "preset" && dates.preset === preset}
              onClick={() => setDates({ kind: "preset", preset })}
            >
              {DATE_PRESET_LABEL[preset]}
            </Chip>
          ))}
          <Chip
            pressed={dates.kind === "custom"}
            aria-expanded={pickingDates}
            aria-controls={pickerId}
            onClick={() => setPickingDates((open) => !open)}
          >
            {dates.kind === "custom"
              ? formatDateRange(dates.from, dates.to)
              : "Custom"}
            <svg
              aria-hidden
              viewBox="0 0 10 6"
              className={`mb-0.5 ml-1.5 inline-block h-1.5 w-2.5 transition-transform motion-reduce:transition-none ${pickingDates ? "rotate-180" : ""}`}
            >
              <path d="M0 0h10L5 6z" fill="currentColor" />
            </svg>
          </Chip>
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
      </ScrollRail>

      {/* Below the rail, not in it, so a phone never scrolls it out of view. */}
      {pickingDates && (
        <DateRangePicker
          // A range applied elsewhere (Back, a shared link) restarts the draft.
          key={dates.kind === "custom" ? `${dates.from}/${dates.to}` : "none"}
          id={pickerId}
          applied={dates.kind === "custom" ? dates : undefined}
          onApply={({ from, to }) => setDates({ kind: "custom", from, to })}
          onCancel={() => setPickingDates(false)}
        />
      )}
    </section>
  );
}

const RAIL_PADDING = "px-3 py-3 sm:px-4";

/** Season numbers known to the root loader, oldest first. */
function useSeasonNumbers(): readonly number[] {
  return useRouteLoaderData<typeof rootLoader>("root")?.seasons ?? [];
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
