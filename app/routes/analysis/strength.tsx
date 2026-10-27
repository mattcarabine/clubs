import {
  ChartFrame,
  DataTable,
  type DataTableColumn,
  SectionHeading,
  WinRateBarChart,
} from "~/components";
import { formatCount } from "~/lib/number-format";
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
 * nights.
 */
export function StrengthSection({ byStrength }: { byStrength: ByStrength }) {
  const { groups } = byStrength;
  return (
    <section aria-label="By Opponent strength" className="flex flex-col gap-4">
      <SectionHeading
        title="By Opponent strength"
        subtitle={`The Opponent's Skill Rating against ours at each Match: Stronger is ${STRENGTH_GAP} or more above ours, Weaker ${STRENGTH_GAP} or more below, Similar within ${STRENGTH_GAP}.`}
      />
      <p className="text-ink-muted text-sm">{strengthNote(byStrength)}</p>
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

/** "2 Matches without Skill Ratings are left out. Hidden with fewer than 3 Matches: Similar (2)." */
function strengthNote({ groups, hidden, unrated }: ByStrength): string {
  const notes = [
    unrated === 0
      ? "Every Match here has both Skill Ratings."
      : `${formatCount(unrated, "Match", "Matches")} without Skill Ratings ${unrated === 1 ? "is" : "are"} left out.`,
  ];
  const hiddenGroups = hiddenNote({ hidden });
  if (hiddenGroups) notes.push(hiddenGroups);
  if (groups.length === 0) {
    notes.push(
      `Each group needs at least ${MIN_SPLIT_MATCHES} rated Matches to show.`,
    );
  }
  return notes.join(" ");
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
