import type { ReactNode } from "react";

import { NO_VALUE } from "~/lib/number-format";
import type { Standing } from "~/stats/event-stats";

/** Where a figure stands against its yardstick, in the way that is good for us. */
export type YardstickStanding = Standing;

export type YardstickItem = {
  id: string;
  /** Sentence case: "Shots on target". */
  label: string;
  /** What the figure means, as the row's tooltip. */
  description?: string;
  value: number | null;
  /** The figure it is set against, or null when there is none. */
  yardstick: number | null;
  /** Null for a figure that only describes style, or with no yardstick. */
  standing: YardstickStanding | null;
  format: (value: number) => string;
};

type YardstickListProps = {
  /** Names the list for screen readers. */
  label: string;
  /** Who the marker is, after the figure: "typical opposing midfielder". */
  against: string;
  items: readonly YardstickItem[];
};

const STANDING = {
  better: { word: "Better", colour: "text-win" },
  worse: { word: "Worse", colour: "text-loss" },
  level: { word: "Level", colour: "text-ink-muted" },
} as const satisfies Record<
  YardstickStanding,
  { word: string; colour: string }
>;

/** How far along the track the larger of the two figures reaches. */
const FULL_BAR = 0.86;

/**
 * Figures set against a yardstick (CLUBS-85): each row is a bar for the
 * figure and a marker for what it is set against, with both numbers and
 * "Better", "Worse" or "Level" in words. Place it on `shale-900`, which the
 * `loss` text needs.
 */
export function YardstickList({ label, against, items }: YardstickListProps) {
  return (
    <ul aria-label={label} className="flex flex-col gap-3.5">
      {items.map((item) => (
        <YardstickRow key={item.id} item={item} against={against} />
      ))}
    </ul>
  );
}

function YardstickRow({
  item,
  against,
}: {
  item: YardstickItem;
  against: string;
}) {
  const { value, yardstick, standing, format } = item;
  const scale = Math.max(value ?? 0, yardstick ?? 0) / FULL_BAR;
  const width = (n: number) => `${scale > 0 ? (n / scale) * 100 : 0}%`;
  return (
    <li title={item.description} data-yardstick={item.id}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-ink-soft text-sm">{item.label}</span>
        <span className="font-display font-extrabold text-2xl text-ink leading-none">
          {value === null ? NO_VALUE : format(value)}
        </span>
      </div>
      <div aria-hidden className="relative mt-1.5 h-2 bg-shale-800">
        {value !== null && (
          <span
            className="absolute inset-y-0 left-0 bg-sound-300"
            style={{ width: width(value) }}
          />
        )}
        {yardstick !== null && (
          <span
            className="absolute -inset-y-1 w-0.5 bg-ink"
            style={{ left: width(yardstick) }}
          />
        )}
      </div>
      <p className="mt-1 flex flex-wrap gap-x-2 text-ink-muted text-xs">
        {yardstick === null ? (
          <span>No {against} to set it against</span>
        ) : (
          <span>{`${against.charAt(0).toUpperCase()}${against.slice(1)}: ${format(yardstick)}`}</span>
        )}
        {standing && <StandingWord standing={standing} />}
      </p>
    </li>
  );
}

function StandingWord({
  standing,
}: {
  standing: YardstickStanding;
}): ReactNode {
  const { word, colour } = STANDING[standing];
  return <span className={`font-semibold ${colour}`}>{word}</span>;
}
