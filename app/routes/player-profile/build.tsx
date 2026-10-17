import { EmptyState } from "~/components";
import type { PositionGroup } from "~/lib/domain";
import { formatLondonDate } from "~/lib/london-time";
import type { BuildChange, BuildState } from "~/stats";

import { formatCount, MISSING } from "./format";

/** EA publishes no names for `proStyle` codes, so the code is shown as-is. */
function playStyleLabel(code: number | null): string {
  return code === null ? MISSING : `Style ${code}`;
}

type BuildPlateProps = {
  build: BuildState | null;
  positionGroup: PositionGroup | null;
};

/**
 * The header's build plate: current overall on a green slanted block, then
 * position, Position Group and play style, from the latest Snapshot.
 */
export function BuildPlate({ build, positionGroup }: BuildPlateProps) {
  return (
    <dl className="flex items-stretch">
      <div className="clip-slant-r flex items-end gap-2 bg-rave py-2 pr-6 pl-4 text-shale-950 [--slant:0.9rem]">
        <dd className="font-display font-extrabold text-score italic leading-none tabular">
          {formatCount(build?.overall ?? null)}
        </dd>
        <dt className="pb-1 font-display font-bold text-lg uppercase leading-none">
          Overall
        </dt>
      </div>
      <div className="clip-slant-l -ml-3 grid grid-cols-[auto_auto] content-center gap-x-3 gap-y-0.5 bg-shale-800 py-2 pr-4 pl-7 text-sm [--slant:0.9rem]">
        <dt className="text-ink-muted">Position</dt>
        <dd className="font-semibold text-ink">
          {build?.position ?? MISSING}
          {positionGroup && (
            <span className="font-normal text-ink-soft"> {positionGroup}</span>
          )}
        </dd>
        <dt className="text-ink-muted">Play style</dt>
        <dd className="font-semibold text-ink">
          {playStyleLabel(build?.playStyle ?? null)}
        </dd>
      </div>
    </dl>
  );
}

type BuildProgressionProps = {
  /** Oldest first, as `buildHistory` returns it. */
  history: readonly BuildChange[];
};

/** Every change of overall, play style or position, newest first. */
export function BuildProgression({ history }: BuildProgressionProps) {
  if (history.length === 0) {
    return (
      <EmptyState
        title="No build history yet"
        description="Each Poll copies EA's season stats; changes to overall, play style or position show here."
      />
    );
  }
  return (
    <ol className="border-shale-700 border-t-2 bg-shale-900">
      {[...history].reverse().map((entry, i) => (
        <li
          key={entry.takenAt.getTime()}
          className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-x-3 border-shale-700 border-b py-2 pr-4 last:border-b-0"
        >
          <span
            className={`clip-slant-r flex h-11 items-center justify-center pr-2 font-display font-extrabold text-3xl tabular [--slant:0.6rem] ${i === 0 ? "bg-sound-900 text-ink" : "bg-shale-800 text-ink-soft"}`}
          >
            <span className="sr-only">Overall </span>
            {formatCount(entry.overall)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-ink text-sm">
              {entry.position ?? MISSING}
              <span className="ml-2 text-ink-soft">
                {playStyleLabel(entry.playStyle)}
              </span>
            </span>
            <span className="block text-ink-muted text-sm">
              {formatLondonDate(entry.takenAt)}
            </span>
          </span>
          <OverallChange change={entry.overallChange} />
        </li>
      ))}
    </ol>
  );
}

function OverallChange({ change }: { change: number | null }) {
  if (change === null || change === 0) return <span />;
  const up = change > 0;
  return (
    <span
      className={`font-display font-bold text-lg tabular ${up ? "text-win" : "text-loss"}`}
    >
      <span aria-hidden className="mr-1 text-xs">
        {up ? "▲" : "▼"}
      </span>
      {up ? `+${change}` : change}
    </span>
  );
}
