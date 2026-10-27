import { useId } from "react";
import { Link } from "react-router";

import { londonDateKey } from "~/lib/london-time";
import { fadeAttributes, useScrollFade } from "~/lib/use-scroll-fade";
import type { ClubRecord, RecordWhen } from "~/stats/club-records";

import { LondonTime } from "./london-time";

/**
 * Our Club's records since records began (CLUBS-77), as broadcast record
 * boards like `ClubLeaders`: a slanted tab names the record, its figure is a
 * scoreboard numeral, and a line and a date say where it came from. A run
 * still going is tagged "Still going". The low points (heaviest defeat,
 * longest winless run) take a `loss` tab and rule. On phones one row of
 * compact boards (no dates) that scrolls sideways (its clipped edge fades);
 * a grid from `sm`. The whole
 * board links to the Match or Session when there is one. Hidden with none.
 */
export function ClubRecords({
  records,
  subtitle,
}: {
  records: readonly ClubRecord[];
  subtitle?: string;
}) {
  const [ref, edges] = useScrollFade<HTMLUListElement>();
  const headingId = useId();
  if (records.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="mb-6 sm:mb-8">
      <div className="mb-3">
        <h2
          id={headingId}
          className="font-display font-extrabold text-3xl text-ink uppercase leading-none tracking-wide"
        >
          Club records
        </h2>
        {subtitle && <p className="mt-1 text-ink-muted text-sm">{subtitle}</p>}
      </div>
      <ul
        ref={ref}
        {...fadeAttributes(edges)}
        className="scroll-fade flex snap-x gap-2 overflow-x-auto [scrollbar-width:none] sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible lg:grid-cols-4 xl:grid-cols-6"
      >
        {records.map((record) => (
          <RecordTile key={record.id} record={record} />
        ))}
      </ul>
    </section>
  );
}

function RecordTile({ record }: { record: ClubRecord }) {
  const body = (
    <>
      <h3
        className={`clip-slant-r self-start py-1 pr-4 pl-3 font-display font-extrabold text-shale-950 text-sm uppercase leading-none tracking-wide [--slant:0.4rem] ${record.low ? "bg-loss" : "bg-rave"}`}
      >
        {record.label}
      </h3>
      <span className="mt-2 block px-3 font-display font-extrabold text-4xl text-ink italic tabular leading-none sm:text-5xl">
        {record.figure}
      </span>
      <span className="mt-1 truncate px-3 text-ink-soft text-sm group-hover:text-ink sm:line-clamp-2 sm:whitespace-normal">
        {record.note}
      </span>
      <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-2 text-ink-muted text-xs">
        {record.when && (
          <span className="hidden sm:inline">
            <When when={record.when} />
          </span>
        )}
        {record.ongoing && (
          <span className="clip-slant bg-rave px-2 py-0.5 font-display font-bold text-shale-950 text-xs uppercase tracking-wide [--slant:0.2rem]">
            Still going
          </span>
        )}
      </span>
    </>
  );
  const className = `flex min-w-0 flex-1 flex-col border-t-2 bg-shale-900 pb-3 ${record.low ? "border-loss" : "border-rave"}`;
  return (
    <li className="flex w-40 shrink-0 snap-start sm:w-auto">
      {record.href ? (
        <Link
          to={record.href}
          className={`group ${className} hover:bg-shale-800`}
        >
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}

/** A moment, a day, or a run's days ("Wed 14 Oct – Sat 17 Oct", one day when it fits in one). */
function When({ when }: { when: RecordWhen }) {
  if (when.kind !== "span") {
    return <LondonTime date={when.at} format={when.kind} />;
  }
  if (londonDateKey(when.from) === londonDateKey(when.to)) {
    return <LondonTime date={when.from} format="day" />;
  }
  return (
    <span>
      <LondonTime date={when.from} format="day" /> –{" "}
      <LondonTime date={when.to} format="day" />
    </span>
  );
}
