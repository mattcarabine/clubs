/**
 * "Rise and fall together?" (CLUBS-66): whether two Squad Members rate well
 * and badly in the same Matches, straight up and with the rest of the
 * line-up's night taken out, so riding the team's tide reads apart from a
 * link of their own.
 */
import { EmptyState, SectionHeading, SmallSampleTag, Tag } from "~/components";
import {
  formatCount,
  formatSignedDecimal,
  NO_VALUE,
} from "~/lib/number-format";
import {
  type BelowPar,
  LINK_LABEL,
  type LinkFigure,
  linkReading,
  MIN_LINK_MATCHES,
  type RatingLink as RatingLinkData,
  SMALL_LINK_SAMPLE,
} from "~/stats/rating-context";

type RatingLinkProps = {
  link: RatingLinkData;
  names: readonly [string, string];
};

export function RatingLink({ link, names: [a, b] }: RatingLinkProps) {
  const { straight, beyondTeam } = link;
  const reading = linkReading(link);
  return (
    <section aria-label="Rise and fall together?" className="mt-8">
      <SectionHeading
        title="Rise and fall together?"
        subtitle={`Their ratings in the ${formatCount(straight.matches, "Match", "Matches")} both were rated together`}
      />
      {straight.strength === null ? (
        <EmptyState
          title="Too few Matches together to call it"
          description={`${a} and ${b} have ${formatCount(straight.matches, "rated Match", "rated Matches")} together; it takes ${MIN_LINK_MATCHES}.`}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <LinkCard
              kicker="Straight up"
              figure={straight}
              detail={`Correlation of their ratings over ${formatCount(straight.matches, "Match", "Matches")}, from −1 to +1`}
              lead
            />
            <LinkCard
              kicker="Beyond the team"
              figure={beyondTeam}
              detail={
                beyondTeam.strength === null
                  ? `Needs ${MIN_LINK_MATCHES} Matches with another rated teammate; they have ${beyondTeam.matches}`
                  : `With the rest of the line-up's average taken out, over ${formatCount(beyondTeam.matches, "Match", "Matches")}`
              }
            />
          </div>
          <ul className="mt-3 flex flex-col gap-1 text-ink-soft text-sm">
            {reading && <li className="font-semibold text-ink">{reading}</li>}
            <BelowParLine first={a} second={b} par={link.aBelow} />
            <BelowParLine first={b} second={a} par={link.bBelow} />
          </ul>
        </>
      )}
    </section>
  );
}

type LinkCardProps = {
  kicker: string;
  figure: LinkFigure;
  detail: string;
  lead?: boolean;
};

function LinkCard({ kicker, figure, detail, lead = false }: LinkCardProps) {
  const { correlation, strength, matches } = figure;
  return (
    <div
      className={`flex min-w-0 flex-col gap-2 border-t-2 p-4 ${lead ? "border-rave bg-sound-900" : "border-shale-700 bg-shale-900"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Tag>{kicker}</Tag>
        {strength !== null && matches < SMALL_LINK_SAMPLE && <SmallSampleTag />}
      </div>
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display font-extrabold text-5xl text-ink tabular leading-none">
          {strength === null || correlation === null
            ? NO_VALUE
            : formatSignedDecimal(correlation, 2)}
        </span>
        <span className="font-display font-bold text-ink text-xl uppercase tracking-wide">
          {strength === null ? "No verdict" : LINK_LABEL[strength]}
        </span>
      </p>
      <p className="text-ink-muted text-xs">{detail}</p>
    </div>
  );
}

/** "When A played below their average, B did too in 4 of 6." */
type BelowParLineProps = {
  first: string;
  second: string;
  par: BelowPar;
};

function BelowParLine({ first, second, par }: BelowParLineProps) {
  if (par.below === 0) return null;
  return (
    <li>
      When {first} played below their average, {second} did too in{" "}
      {par.alsoBelow} of {par.below}.
    </li>
  );
}
