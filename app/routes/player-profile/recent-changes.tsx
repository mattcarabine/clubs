import {
  ChangeArrow,
  EmptyState,
  SmallSampleTag,
  Sparkline,
  Tag,
} from "~/components";
import { ROLLING_WINDOW } from "~/stats/formulas";
import {
  MIN_RECENT_APPEARANCES,
  RECENT_WINDOW,
  type RecentChange,
  type RecentChanges,
} from "~/stats/recent-change";

type RecentChangesPanelProps = {
  name: string;
  changes: RecentChanges;
};

/**
 * "Recent changes" (CLUBS-37): up to 3 stats a Squad Member is improving in
 * and 3 they are dropping off in, their last 10 Appearances against the ones
 * before, each with its trend. An EmptyState says why when there is nothing
 * clear to report.
 */
export function RecentChangesPanel({ name, changes }: RecentChangesPanelProps) {
  const { ready, improving, dropping, recentCount, baselineCount } = changes;
  if (!ready) {
    const total = recentCount + baselineCount;
    return (
      <EmptyState
        title="Not enough Appearances yet"
        description={`Recent changes compare the last ${RECENT_WINDOW} Appearances with at least ${MIN_RECENT_APPEARANCES} before them. ${name} has ${total} in these filters.`}
      />
    );
  }
  if (improving.length === 0 && dropping.length === 0) {
    return (
      <EmptyState
        title="No clear changes"
        description={`${name}'s last ${RECENT_WINDOW} Appearances are in line with the ${baselineCount} before them.`}
      />
    );
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ChangeList title="Improving" changes={improving} />
      <ChangeList title="Dropping off" changes={dropping} />
    </div>
  );
}

function ChangeList({
  title,
  changes,
}: {
  title: string;
  changes: readonly RecentChange[];
}) {
  if (changes.length === 0) return null;
  return (
    <div className="min-w-0">
      <h3 className="mb-2 font-display font-bold text-ink-soft text-lg uppercase tracking-wide">
        {title}
      </h3>
      <ul aria-label={title} className="grid gap-3">
        {changes.map((change) => (
          <ChangeItem key={change.id} change={change} />
        ))}
      </ul>
    </div>
  );
}

function ChangeItem({ change }: { change: RecentChange }) {
  const border = change.direction === "up" ? "border-win" : "border-loss";
  return (
    <li className={`grid min-w-0 gap-2 border-t-2 bg-shale-900 p-4 ${border}`}>
      <div className="flex flex-wrap items-center gap-2">
        {/* On shale-900: `loss` text is too faint on the tag's shale-800. */}
        <ChangeArrow direction={change.direction} className="text-xs" />
        <Tag>{change.label}</Tag>
        {change.smallSample && <SmallSampleTag />}
      </div>
      <p className="text-ink">{change.text}</p>
      <p className="text-ink-muted text-sm">{change.counts}</p>
      <Sparkline
        values={change.trend}
        label={`${change.label}, ${ROLLING_WINDOW}-Appearance average over the last ${change.trend.length} Appearances`}
      />
    </li>
  );
}
