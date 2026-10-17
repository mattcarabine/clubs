import { type ReactNode, useId, useState } from "react";
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

import { Chip } from "./chip";
import { DateRangePicker, formatDateRange } from "./date-range-picker";

type FilterBarProps = {
  /** The page's current filter, parsed in its loader with `statsFilterFromRequest`. */
  filter: StatsFilter;
  /**
   * Shows the Recorded / EA totals toggle with this value (from
   * `statsSourceFromRequest`). On EA totals the Match filters are hidden,
   * because EA's totals cannot be narrowed.
   */
  source?: StatsSource;
};

/**
 * The global stats filter: Match Types, DNF, date range and Season. The
 * Season picker lists the Seasons from the root loader, and shows once there
 * are two to choose between. Every change rewrites the URL, so the page's
 * loader reruns with the new filter and the view can be shared.
 *
 * With a `source`, it leads with the Recorded / EA totals toggle.
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
    <FilterGroup label="Source">
      {STATS_SOURCES.map((option) => (
        <Chip
          key={option}
          pressed={source === option}
          onClick={() => apply((params) => writeStatsSource(params, option))}
        >
          {STATS_SOURCE_LABEL[option]}
        </Chip>
      ))}
    </FilterGroup>
  );

  if (source === "ea") {
    return (
      <section
        aria-label="Stats filters"
        aria-busy={pending !== null}
        // Short, so it wraps on phones too rather than cutting the note off.
        className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3 border-shale-700 border-t-2 bg-shale-900 px-3 py-3 sm:px-4"
      >
        {sourceToggle}
        <p className="max-w-md text-ink-muted text-sm leading-snug sm:self-center">
          EA's own totals, including Matches from before tracking began. The
          Match filters don't apply to them.
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
      {/* One scrolling rail on phones, so the filters take one row, not a screen. */}
      <div className="flex items-end gap-x-6 gap-y-3 overflow-x-auto px-3 py-3 [scrollbar-width:thin] sm:flex-wrap sm:overflow-visible sm:px-4">
        {sourceToggle}

        <FilterGroup label="Match Type">
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
        </FilterGroup>

        <FilterGroup label="DNF">
          <Chip
            pressed={filter.includeDnf}
            onClick={() =>
              updateFilter((f) => ({ ...f, includeDnf: !f.includeDnf }))
            }
          >
            Include DNF
          </Chip>
        </FilterGroup>

        <FilterGroup label="Dates">
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
        </FilterGroup>

        {(seasons.length > 1 || filter.season !== undefined) && (
          <FilterGroup label="Season">
            <SeasonSelect
              seasons={seasons}
              value={filter.season}
              onChange={(season) => updateFilter((f) => ({ ...f, season }))}
            />
          </FilterGroup>
        )}
      </div>

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

type FilterGroupProps = {
  label: string;
  children: ReactNode;
};

/** The search params of a navigation to this same page that is still loading, else null. */
function usePendingSearchParams(): URLSearchParams | null {
  const { pathname } = useLocation();
  const { location } = useNavigation();
  return location?.pathname === pathname
    ? new URLSearchParams(location.search)
    : null;
}

function FilterGroup({ label, children }: FilterGroupProps) {
  return (
    <fieldset className="shrink-0 sm:min-w-0 sm:shrink">
      <legend className="mb-1.5 whitespace-nowrap text-ink-muted text-sm">
        {label}
      </legend>
      <div className="flex gap-1 sm:flex-wrap">{children}</div>
    </fieldset>
  );
}
