/**
 * The Session page's "Against our other sessions" (CLUBS-96): the stats in
 * which this Session ranks among our best and our worst, each with its
 * figure, the figure over the other Sessions and where it ranks.
 */
import { SectionHeading, Tag } from "~/components";
import type {
  SessionStandout,
  SessionStandouts,
} from "~/stats/session-standouts";
import { MIN_SESSION_MATCHES } from "~/stats/session-standouts";

const PANELS = {
  well: {
    title: "What we did well",
    rule: "border-win",
    empty: "Nothing was among our best.",
  },
  badly: {
    title: "What we did badly",
    rule: "border-loss",
    empty: "Nothing was among our worst.",
  },
} as const;

export function SessionStandoutsSection({
  standouts,
}: {
  standouts: SessionStandouts;
}) {
  const typical = standouts.well.length + standouts.badly.length === 0;
  return (
    <section aria-label="Against our other sessions" className="mb-8">
      <SectionHeading
        title="Against our other sessions"
        subtitle={`Where this session ranks among our ${standouts.sessions} sessions of ${MIN_SESSION_MATCHES} or more matches.`}
      />
      {typical ? (
        <p className="border-shale-600 border-t-2 bg-shale-900 px-4 py-3 text-ink-soft text-sm">
          A typical session: nothing was among our best or our worst.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-x-6">
          {(["well", "badly"] as const).map((end) => (
            <section
              key={end}
              aria-label={PANELS[end].title}
              className={`min-w-0 border-t-2 bg-shale-900 ${PANELS[end].rule}`}
            >
              <h3 className="px-4 pt-3 font-display font-bold text-2xl text-ink uppercase tracking-wide">
                {PANELS[end].title}
              </h3>
              {standouts[end].length > 0 ? (
                <ol>
                  {standouts[end].map((standout) => (
                    <StandoutItem key={standout.id} standout={standout} />
                  ))}
                </ol>
              ) : (
                <p className="px-4 py-3 text-ink-soft text-sm">
                  {PANELS[end].empty}
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function StandoutItem({ standout }: { standout: SessionStandout }) {
  return (
    <li className="flex items-center justify-between gap-4 border-shale-700 border-b px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <Tag>{standout.label}</Tag>
        <p className="font-semibold text-ink">{standout.standing}</p>
      </div>
      <div className="shrink-0 text-right tabular">
        <p className="font-display font-extrabold text-3xl text-ink leading-none">
          {standout.value}
        </p>
        <p className="mt-1 text-ink-muted text-sm">Usually {standout.usual}</p>
      </div>
    </li>
  );
}
