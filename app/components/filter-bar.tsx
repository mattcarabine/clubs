import type { ReactNode } from "react";
import { useLocation, useNavigation, useSearchParams } from "react-router";

import {
  DATE_RANGE_LABEL,
  DATE_RANGES,
  MATCH_TYPES,
  parseMinAppearances,
  parseStatsFilter,
  type StatsFilter,
  toggleMatchType,
  writeMinAppearances,
  writeStatsFilter,
} from "~/stats/filter";

type FilterBarProps = {
  /** The page's current filter, parsed in its loader with `statsFilterFromRequest`. */
  filter: StatsFilter;
  /** Shows the leaderboard minimum-Appearances stepper with this value (from `parseMinAppearances`). */
  minAppearances?: number;
};

/**
 * The global stats filter: Match Types, DNF and date range, plus an optional
 * leaderboard minimum. Every change rewrites the URL, so the page's loader
 * reruns with the new filter and the view can be shared.
 *
 * While a filter change is loading, the chips show the pending URL and the
 * next change builds on it, so quick successive clicks all count.
 */
export function FilterBar(props: FilterBarProps) {
  const [, setSearchParams] = useSearchParams();
  const pending = usePendingSearchParams();
  const filter = pending ? parseStatsFilter(pending) : props.filter;
  const minAppearances =
    pending && props.minAppearances !== undefined
      ? parseMinAppearances(pending)
      : props.minAppearances;

  const apply = (write: (params: URLSearchParams) => URLSearchParams) =>
    setSearchParams((current) => write(pending ?? current), {
      preventScrollReset: true,
    });
  const updateFilter = (change: (filter: StatsFilter) => StatsFilter) =>
    apply((params) =>
      writeStatsFilter(params, change(parseStatsFilter(params))),
    );
  const stepMinAppearances = (by: number) =>
    apply((params) =>
      writeMinAppearances(
        params,
        Math.max(0, parseMinAppearances(params) + by),
      ),
    );

  return (
    <section
      aria-label="Stats filters"
      aria-busy={pending !== null}
      className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3 border-shale-700 border-t-2 bg-shale-900 px-3 py-3 sm:px-4"
    >
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
        {DATE_RANGES.map((range) => (
          <Chip
            key={range}
            pressed={filter.range === range}
            onClick={() => updateFilter((f) => ({ ...f, range }))}
          >
            {DATE_RANGE_LABEL[range]}
          </Chip>
        ))}
      </FilterGroup>

      {minAppearances !== undefined && (
        <FilterGroup label="Minimum Appearances">
          <Chip
            aria-label="Fewer minimum Appearances"
            disabled={minAppearances <= 0}
            onClick={() => stepMinAppearances(-1)}
          >
            −
          </Chip>
          <output
            aria-live="polite"
            className="flex min-w-8 items-center justify-center font-display font-extrabold text-ink text-xl tabular"
          >
            {minAppearances}
          </output>
          <Chip
            aria-label="More minimum Appearances"
            onClick={() => stepMinAppearances(1)}
          >
            +
          </Chip>
        </FilterGroup>
      )}
    </section>
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
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-ink-muted text-sm">{label}</legend>
      <div className="flex flex-wrap gap-1">{children}</div>
    </fieldset>
  );
}

type ChipProps = {
  /** Set for toggles; leave out for plain actions like the stepper. */
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  "aria-label"?: string;
  children: ReactNode;
};

/** A slanted filter button: a toggle when `pressed` is set, else a plain action. */
export function Chip({ pressed, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={[
        "clip-slant min-h-9 px-3.5 font-display font-bold text-base uppercase tracking-wide transition-colors [--slant:0.35rem]",
        // clip-slant would cut off an outer focus ring, so draw it inside, in ink to show on rave too.
        "focus-visible:-outline-offset-4 focus-visible:outline-ink",
        "disabled:cursor-not-allowed",
        pressed
          ? "bg-rave text-shale-950"
          : "bg-shale-800 text-ink-soft hover:bg-shale-700 hover:text-ink disabled:hover:bg-shale-800",
      ].join(" ")}
      {...props}
    />
  );
}
