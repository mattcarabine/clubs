import { Link } from "react-router";

import type { FormStatus } from "~/lib/domain";
import { playerPath } from "~/lib/paths";
import type { SquadFormRow } from "~/stats/squad";

import { FormBadge } from "./form-badge";

const FORM_WATCH: readonly { status: FormStatus; label: string }[] = [
  { status: "hot", label: "In form" },
  { status: "cold", label: "Out of form" },
];

/**
 * Hot and Cold form (CLUBS-40): a compact strip naming who is "In form" and
 * "Out of form". Render it only when someone qualifies (`formWatch`).
 */
export function FormWatch({ rows }: { rows: readonly SquadFormRow[] }) {
  return (
    <section
      aria-label="Form watch"
      className="flex flex-col divide-y divide-shale-700 border-shale-700 border-t-2 bg-shale-900"
    >
      {FORM_WATCH.map(({ status, label }) => {
        const players = rows.filter((r) => r.formIndicator.status === status);
        if (players.length === 0) return null;
        return (
          <div
            key={status}
            className="flex min-w-0 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <h2 className="shrink-0 font-display font-extrabold text-ink text-lg uppercase tracking-wide sm:w-32">
              {label}
            </h2>
            <ul
              aria-label={label}
              className="flex min-w-0 flex-wrap gap-x-5 gap-y-2"
            >
              {players.map(({ playerId, name, formIndicator }) => (
                <li key={playerId} className="flex min-w-0 items-center gap-2">
                  <FormBadge
                    status={formIndicator.status}
                    detail={formIndicator.text}
                  />
                  <Link
                    to={playerPath(playerId)}
                    className="truncate font-semibold text-sound-300 hover:text-ink"
                  >
                    {name}
                  </Link>
                  {/* The badge already reads this out. */}
                  <span aria-hidden className="text-ink-muted text-sm tabular">
                    {formIndicator.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
