import { formatCount, formatDecimal } from "~/lib/number-format";
import type { TopPerformer } from "~/stats/top-performers";

import { Ticker, type TickerItem } from "./ticker";

/**
 * A Match's top performers under its hero ScoreBar: one chip each (name, what
 * they did, a rating pill), sized to fit and centred, scrolling only when
 * they overflow.
 */
export function TopPerformersStrip({
  performers,
}: {
  performers: TopPerformer[];
}) {
  return (
    <Ticker
      label="Top performers"
      items={performers.map(toTickerItem)}
      durationSeconds={Math.max(20, performers.length * 8)}
      fit
    />
  );
}

function toTickerItem(performer: TopPerformer): TickerItem {
  const parts = [
    performer.manOfTheMatch && "Man of the Match",
    performer.goals > 0 && formatCount(performer.goals, "goal", "goals"),
    performer.assists > 0 &&
      formatCount(performer.assists, "assist", "assists"),
  ].filter(Boolean);
  return {
    id: performer.playerId,
    headline: performer.name,
    detail: parts.length > 0 ? parts.join(", ") : undefined,
    badge: performer.rating !== null && (
      <RatingPill rating={performer.rating} />
    ),
  };
}

function RatingPill({ rating }: { rating: number }) {
  return (
    <span className="clip-slant bg-sound-700 px-2.5 py-1 font-display font-extrabold text-base text-ink tabular leading-none [--slant:0.3rem]">
      <span className="sr-only">rated </span>
      {formatDecimal(rating)}
    </span>
  );
}
