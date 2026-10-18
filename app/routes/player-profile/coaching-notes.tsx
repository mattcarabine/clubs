import type { JobWriteup } from "~/ai/writeups";
import { AiWriteup, SectionHeading } from "~/components";
import { coachingWeek } from "~/lib/coaching-week";
import { formatLondonDate } from "~/lib/london-time";

/** Who the notes are signed by: the squad's in-joke (owner, 2026-10-18). */
export const COACHING_SIGN_OFF = "The Gaff";

/** How many weeks of notes the profile shows, the latest included. */
export const COACHING_WEEKS_SHOWN = 9;

/**
 * "Coaching notes" (CLUBS-44): the latest week's notes, signed off by The
 * Gaff, then earlier weeks behind a disclosure. Hidden before the first
 * notes. `notes` is newest first, one per week (the job's subject).
 */
export function CoachingNotes({ notes }: { notes: readonly JobWriteup[] }) {
  const [latest, ...earlier] = notes;
  if (!latest) return null;
  return (
    <section aria-label="Coaching notes" className="mb-8">
      <SectionHeading
        title="Coaching notes"
        subtitle={weekLabel(latest.jobSubjectKey)}
      />
      <WeekNotes note={latest} />
      {earlier.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer font-display font-bold text-ink-soft text-lg uppercase tracking-wide hover:text-ink">
            Earlier weeks ({earlier.length})
          </summary>
          <ol className="mt-3 space-y-4">
            {earlier.map((note) => (
              <li key={note.jobSubjectKey}>
                <h3 className="mb-2 text-ink-muted text-sm">
                  {weekLabel(note.jobSubjectKey)}
                </h3>
                <WeekNotes note={note} />
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function WeekNotes({ note }: { note: JobWriteup }) {
  return (
    <AiWriteup
      label={`Coaching notes, ${weekLabel(note.jobSubjectKey)}`}
      text={note.text}
      writtenAt={note.writtenAt}
      signOff={COACHING_SIGN_OFF}
      points
    />
  );
}

/** "Week of Mon 12 Oct". */
function weekLabel(start: string): string {
  return `Week of ${formatLondonDate(coachingWeek(start).from)}`;
}
