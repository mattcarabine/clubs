import { Link } from "react-router";

import { formatCount, formatPercentage } from "~/lib/number-format";
import {
  CHOICE_VERDICTS,
  type ChoiceMix,
  type ChoiceVerdict,
} from "~/stats/choices";

import { SmallSampleTag } from "../tag";

export type ChoiceBarRow = {
  id: string;
  /** Who the bar is: a Squad Member, "Our club", "Opponents". */
  name: string;
  mix: ChoiceMix;
  /** Beside the name, in place of "207 choices": for a mix whose count means little. */
  note?: string;
  /** Makes the name a link, e.g. to a profile. */
  to?: string;
};

export type ChoiceBarGroup = {
  /** A small heading over the group: "Squad members". */
  label?: string;
  rows: readonly ChoiceBarRow[];
};

type ChoiceBarsProps = {
  /** Names the panel for screen readers. */
  label: string;
  /** Groups of bars, a hairline between them. */
  groups: readonly ChoiceBarGroup[];
};

/** Each verdict's fill, with the text colour that reads on it. */
const VERDICT_FILL: Record<ChoiceVerdict, string> = {
  best: "bg-rave text-shale-950",
  good: "bg-rave-deep text-shale-950",
  // The middle verdict is the quiet one: the ends carry the meaning.
  none: "bg-shale-600 text-ink",
  poor: "bg-loss text-shale-950",
};

/**
 * Choice Mixes as 100% bars (CLUBS-100), one row each: best and good options
 * from the left edge, "should have passed elsewhere" from the right, so both
 * ends compare down the rows whatever the number of choices. A share is
 * printed on its segment where it fits; the row says the share that was good
 * or best, which a ranking goes by, and marks a small sample in words.
 * Hovering a bar lists all four shares, and each bar's label carries them for
 * screen readers.
 */
export function ChoiceBars({ label, groups }: ChoiceBarsProps) {
  const shown = groups.filter((group) => group.rows.length > 0);
  if (shown.length === 0) return null;
  return (
    <figure
      aria-label={label}
      className="min-w-0 border-shale-700 border-t-2 bg-shale-900 p-4 sm:p-5"
    >
      <ChoiceLegend />
      <div className="mt-4 grid gap-4">
        {shown.map((group, i) => (
          <div
            key={group.label ?? i}
            className={i > 0 ? "border-shale-700 border-t pt-4" : undefined}
          >
            {group.label && (
              <p className="mb-3 font-display font-bold text-ink-muted text-sm uppercase tracking-wide">
                {group.label}
              </p>
            )}
            <ul className="grid gap-4 sm:gap-3">
              {group.rows.map((row) => (
                <ChoiceBar key={row.id} row={row} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      <figcaption className="mt-4 text-ink-muted text-xs">
        EA judges every pass and shot. Best option is mostly given for shots on
        target, and no good option includes most passes that went astray.
      </figcaption>
    </figure>
  );
}

function ChoiceBar({ row }: { row: ChoiceBarRow }) {
  const { mix } = row;
  const summary = CHOICE_VERDICTS.map(
    ({ id, label }) => `${label} ${formatPercentage(mix.shares[id])}`,
  ).join(", ");
  return (
    <li
      data-choices={row.name}
      className="grid gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:items-start"
    >
      <span className="flex min-w-0 items-baseline justify-between gap-x-3 sm:flex-col sm:justify-start">
        {row.to ? (
          <Link
            to={row.to}
            className="truncate font-semibold text-ink text-sm hover:text-rave hover:underline sm:max-w-full"
          >
            {row.name}
          </Link>
        ) : (
          <span className="font-semibold text-ink text-sm">{row.name}</span>
        )}
        <span className="shrink-0 text-ink-muted text-xs">
          {row.note ?? formatCount(Math.round(mix.total), "choice", "choices")}
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-1.5">
        <span
          role="img"
          aria-label={`${row.name}: ${summary}`}
          className="group/bar relative flex h-5 gap-0.5"
        >
          {CHOICE_VERDICTS.map(({ id }) =>
            mix.shares[id] > 0 ? (
              <span
                key={id}
                data-verdict={id}
                className={`@container flex min-w-0 items-center justify-center overflow-hidden font-display font-extrabold text-sm leading-none tabular ${VERDICT_FILL[id]}`}
                style={{ flexGrow: mix.shares[id], flexBasis: 0 }}
              >
                {/* Printed only where the segment is wide enough to hold it. */}
                <span aria-hidden className="@[1.375rem]:block hidden">
                  {formatPercentage(mix.shares[id])}
                </span>
              </span>
            ) : null,
          )}
          <ChoiceTooltip row={row} />
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-soft text-xs">
          <span>
            <span className="font-semibold text-ink">
              {formatPercentage(mix.goodOrBest)}
            </span>{" "}
            good or best · {formatPercentage(mix.shares.poor)} should have
            passed elsewhere
          </span>
          {mix.smallSample && <SmallSampleTag />}
        </span>
      </span>
    </li>
  );
}

/** All four shares over a bar while the pointer is on it, styled like the LineChart's tooltip. */
function ChoiceTooltip({ row }: { row: ChoiceBarRow }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 hidden min-w-52 border-rave border-l-2 bg-shale-800 px-3 py-2 group-hover/bar:block"
    >
      <span className="mb-1 block text-ink-muted text-xs">{row.name}</span>
      {CHOICE_VERDICTS.map(({ id, label }) => (
        <span key={id} className="flex items-center gap-2 text-sm">
          <VerdictSwatch id={id} />
          <span className="w-9 font-semibold text-ink tabular">
            {formatPercentage(row.mix.shares[id])}
          </span>
          <span className="text-ink-soft">{label}</span>
        </span>
      ))}
    </span>
  );
}

function VerdictSwatch({ id }: { id: ChoiceVerdict }) {
  return <span aria-hidden className={`size-3 shrink-0 ${VERDICT_FILL[id]}`} />;
}

/** The key: each verdict's colour and EA's name for it, best first. */
export function ChoiceLegend() {
  return (
    <ul
      aria-label="Key"
      className="flex flex-wrap gap-x-4 gap-y-1 text-ink-soft text-sm"
    >
      {CHOICE_VERDICTS.map(({ id, label }) => (
        <li key={id} className="flex items-center gap-2">
          <VerdictSwatch id={id} />
          {label}
        </li>
      ))}
    </ul>
  );
}
