import {
  ChartFrame,
  DataTable,
  type DataTableColumn,
  WinRateBarChart,
} from "~/components";
import {
  type ByStrength,
  MIN_SPLIT_MATCHES,
  STRENGTH_HIGHLIGHTS,
  type StrengthGroup,
  winRateBucket,
} from "~/stats/outcome-split";
import { STRENGTH_GAP } from "~/stats/skill-rating";

import { hiddenNote, resultColumns } from "./result-groups";

/**
 * "By Opponent strength" (CLUBS-29): Win % and the Outcome Split highlights
 * against Stronger, Similar and Weaker Opponents by Skill Rating at the time,
 * so a run of losses to Stronger Opponents reads as tough draws, not bad
 * nights. Part of the Win chance section (CLUBS-73), which already says how
 * many Matches have no Skill Ratings.
 */
export function StrengthPanel({ byStrength }: { byStrength: ByStrength }) {
  const { groups } = byStrength;
  const note = strengthNote(byStrength);
  return (
    <section aria-label="By Opponent strength" className="flex flex-col gap-3">
      <div>
        <h3 className="font-display font-extrabold text-2xl text-ink uppercase leading-none tracking-wide">
          By Opponent strength
        </h3>
        <p className="mt-1 text-ink-muted text-sm">
          {`Stronger is ${STRENGTH_GAP} or more above our Skill Rating, Weaker ${STRENGTH_GAP} or more below, Similar within ${STRENGTH_GAP}.`}
        </p>
      </div>
      {note && <p className="text-ink-muted text-sm">{note}</p>}
      {groups.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-x-6">
          <ChartFrame title="Win % by Opponent strength">
            <WinRateBarChart
              label="Win % by Opponent strength"
              buckets={groups.map((g) => winRateBucket(g.label, g))}
            />
          </ChartFrame>
          <DataTable
            caption="Results by Opponent strength"
            columns={STRENGTH_COLUMNS}
            rows={groups}
            rowKey={(g) => g.id}
          />
        </div>
      )}
    </section>
  );
}

/** "Hidden with fewer than 3 Matches: Similar (2).", or null with nothing to say. */
function strengthNote({ groups, hidden }: ByStrength): string | null {
  const notes: string[] = [];
  const hiddenGroups = hiddenNote({ hidden });
  if (hiddenGroups) notes.push(hiddenGroups);
  if (groups.length === 0) {
    notes.push(
      `Each group needs at least ${MIN_SPLIT_MATCHES} rated Matches to show.`,
    );
  }
  return notes.length > 0 ? notes.join(" ") : null;
}

const STRENGTH_COLUMNS: DataTableColumn<StrengthGroup>[] = [
  ...resultColumns<StrengthGroup>("Opponent"),
  ...STRENGTH_HIGHLIGHTS.map(
    ({ id, label }): DataTableColumn<StrengthGroup> => ({
      id,
      header: label,
      align: "right",
      cell: (g) => g.highlights[id],
    }),
  ),
];
