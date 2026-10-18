/**
 * A Season Review (CLUBS-45): a finished Season told as a deck of cards,
 * from the record to the Awards. Reached only from its Discord post: no
 * page lists or links to Season Reviews. A Season still running, unknown,
 * or without its written review yet is a 404.
 */
import { env } from "cloudflare:workers";
import type { ReactNode } from "react";
import { data, Link } from "react-router";

import { latestWriteups, seasonReviewKey } from "~/ai/writeups";
import {
  MatchHeadline,
  MatchScoreBar,
  RouteError,
  StoryCard,
  StoryDeck,
  type StoryDeckCard,
} from "~/components";
import { getDb } from "~/db/client";
import { formatLondonDate } from "~/lib/london-time";
import { formatCount, formatPercentage } from "~/lib/number-format";
import { pageMeta } from "~/lib/page-meta";
import { playerPath, sessionPath } from "~/lib/paths";
import { paragraphs } from "~/lib/text";
import {
  divisionName,
  getSeasonReview,
  listMilestones,
  type MatchSummary,
  type RecordSummary,
  type SeasonReview as Review,
} from "~/stats";
import { seasonReviewPreview } from "~/stats/link-preview";

import type { Route } from "./+types/season-review";

export function meta({ loaderData, location }: Route.MetaArgs) {
  if (!loaderData) {
    return pageMeta({
      title: "A Bloo Bloo — Season Review not found",
      description: "There is no review of this Season.",
      path: location.pathname,
    });
  }
  return pageMeta({
    ...seasonReviewPreview(loaderData.clubName, loaderData.review),
    path: location.pathname,
    type: "article",
  });
}

export async function loader({ params }: Route.LoaderArgs) {
  const number = Number(params.number);
  const notFound = () => data("Season Review not found", { status: 404 });
  if (!Number.isInteger(number) || number < 1) throw notFound();
  const db = getDb(env.DB);
  const review = await getSeasonReview(db, number);
  if (!review) throw notFound();
  const pieceKeys = [
    seasonReviewKey(number, "intro"),
    seasonReviewKey(number, "outro"),
    ...review.awards.map((a) => seasonReviewKey(number, `award/${a.id}`)),
  ];
  const extremes = [review.biggestWin, review.heaviestDefeat].flatMap((m) =>
    m ? [m.matchId] : [],
  );
  const [pieces, headlines, milestones] = await Promise.all([
    latestWriteups(db, "season-review", pieceKeys),
    latestWriteups(db, "headline", extremes),
    listMilestones(db, env.EA_CLUB_NAME, {
      achievedBetween: { start: review.coveredFrom, end: review.endedAt },
    }),
  ]);
  const text = (key: string) => pieces.get(key)?.text ?? null;
  const intro = text(seasonReviewKey(number, "intro"));
  // The review exists once its writing does.
  if (!intro) throw notFound();
  return {
    clubName: env.EA_CLUB_NAME,
    review,
    intro,
    outro: text(seasonReviewKey(number, "outro")),
    citations: Object.fromEntries(
      review.awards.map((a) => [
        a.id,
        text(seasonReviewKey(number, `award/${a.id}`)),
      ]),
    ),
    headlines: Object.fromEntries(
      [...headlines].map(([id, h]) => [id, h.text]),
    ),
    // Oldest first, as the Season told them.
    milestones: milestones.reverse().map((m) => ({
      id: m.id,
      headline: m.headline,
      matchId: m.match.matchId,
    })),
  };
}

export default function SeasonReview({ loaderData }: Route.ComponentProps) {
  return (
    <StoryDeck
      label={`Season ${loaderData.review.number} Review`}
      cards={reviewCards(loaderData)}
    />
  );
}

type ReviewData = Route.ComponentProps["loaderData"];

/** The cards in order, skipping any whose data is missing. */
function reviewCards({
  clubName,
  review,
  intro,
  outro,
  citations,
  headlines,
  milestones,
}: ReviewData): StoryDeckCard[] {
  const cards: (StoryDeckCard | null)[] = [
    {
      id: "intro",
      label: "Intro",
      content: (
        <StoryCard
          heading="h1"
          kicker="Season Review"
          title={`Season ${review.number}`}
          tone="club"
        >
          <p className="font-display font-bold text-ink text-xl uppercase tracking-wide">
            {formatLondonDate(review.coveredFrom, review.endedAt)} –{" "}
            {formatLondonDate(review.endedAt, review.endedAt)}
          </p>
          {review.partial && (
            <p>
              Since records began on{" "}
              {formatLondonDate(review.coveredFrom, review.endedAt)}.
            </p>
          )}
          <Prose text={intro} />
          <p className="text-ink-muted text-sm">
            <span className="lg:hidden">Tap or swipe for the next card.</span>
            <span className="max-lg:hidden">
              Scroll, or use the arrow keys.
            </span>
          </p>
        </StoryCard>
      ),
    },
    recordCard(review),
    divisionCard(review),
    extremesCard(clubName, review, headlines),
    bestSessionCard(review),
    whenWePlayCard(review),
    opponentsCard(review),
    ...review.awards.map(
      (award): StoryDeckCard => ({
        id: `award-${award.id}`,
        label: award.title,
        content: (
          <StoryCard
            kicker={award.title}
            title={
              <Link to={playerPath(award.playerId)} className="hover:text-rave">
                {award.name}
              </Link>
            }
            figure={award.value}
            figureCaption={award.unit}
          >
            {citations[award.id] && <Prose text={citations[award.id] ?? ""} />}
            <p className="text-ink-muted">{award.detail}</p>
          </StoryCard>
        ),
      }),
    ),
    milestonesCard(milestones),
    outro
      ? {
          id: "outro",
          label: "Next Season",
          content: (
            <StoryCard
              kicker="Next Season"
              title={`Season ${review.number + 1}`}
              tone="club"
            >
              <Prose text={outro} />
            </StoryCard>
          ),
        }
      : null,
  ];
  return cards.filter((card): card is StoryDeckCard => card !== null);
}

function recordCard({ record, eaRecord, partial }: Review): StoryDeckCard {
  // EA's final count leads when it covers more Matches than we recorded.
  const headline = eaRecord ?? record;
  return {
    id: "record",
    label: "Record",
    content: (
      <StoryCard
        kicker="The record"
        title={wdl(headline)}
        figure={headline.played}
        figureCaption={headline.played === 1 ? "Match" : "Matches"}
      >
        <p>
          {headline.goalsFor} scored, {headline.goalsAgainst} conceded.
        </p>
        {eaRecord && (
          <p>
            {partial ? "Recorded since records began" : "Recorded"}:{" "}
            {formatCount(record.played, "Match", "Matches")}, {wdl(record)},{" "}
            {record.goalsFor} scored and {record.goalsAgainst} conceded.
          </p>
        )}
      </StoryCard>
    ),
  };
}

function divisionCard({ division }: Review): StoryDeckCard | null {
  if (!division) return null;
  const { promotions, relegations, bestDivision, promotionSeries } = division;
  return {
    id: "division",
    label: "Division journey",
    content: (
      <StoryCard
        kicker="Division journey"
        title={
          bestDivision ? `Best: ${divisionName(bestDivision)}` : "The climb"
        }
        figure={promotions}
        figureCaption={promotions === 1 ? "Promotion" : "Promotions"}
      >
        <p>{formatCount(relegations, "Relegation", "Relegations")}.</p>
        {promotionSeries.length > 0 && (
          <ul className="space-y-1">
            {promotionSeries.map((series, i) => (
              // Series never reorder.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above.
              <li key={i}>
                Promotion Series in {divisionName(series.division)}: won{" "}
                {series.wins} of {series.played},{" "}
                {series.promoted ? "promoted" : "not promoted"}.
              </li>
            ))}
          </ul>
        )}
      </StoryCard>
    ),
  };
}

function extremesCard(
  clubName: string,
  { biggestWin, heaviestDefeat }: Review,
  headlines: Record<string, string>,
): StoryDeckCard | null {
  if (!biggestWin && !heaviestDefeat) return null;
  const item = (label: string, match: MatchSummary | null) =>
    match && (
      <div>
        <p className="mb-2 font-display font-bold text-ink text-xl uppercase tracking-wide">
          {label}
        </p>
        <Link
          to={`/matches/${match.matchId}`}
          className="block transition-[filter] hover:brightness-125"
        >
          <MatchScoreBar
            clubName={clubName}
            match={match}
            when={formatLondonDate(match.playedAt, match.playedAt)}
          />
        </Link>
        {headlines[match.matchId] && (
          <MatchHeadline text={headlines[match.matchId]} size="hero" />
        )}
      </div>
    );
  return {
    id: "extremes",
    label: "Best and worst",
    content: (
      <StoryCard kicker="Best and worst" title="The highs and the lows">
        <div className="space-y-6 text-base">
          {item("Biggest Win", biggestWin)}
          {item("Heaviest defeat", heaviestDefeat)}
        </div>
      </StoryCard>
    ),
  };
}

function bestSessionCard({
  bestSession,
  endedAt,
}: Review): StoryDeckCard | null {
  if (!bestSession) return null;
  const { record } = bestSession;
  return {
    id: "best-session",
    label: "Best Session",
    content: (
      <StoryCard
        kicker="Best Session"
        title={formatLondonDate(bestSession.start, endedAt)}
        figure={record.wins}
        figureCaption={record.wins === 1 ? "Win in a night" : "Wins in a night"}
      >
        <p>
          {wdl(record)} from {formatCount(record.played, "Match", "Matches")},{" "}
          {record.goalsFor} scored and {record.goalsAgainst} conceded.
        </p>
        <p>
          <Link
            to={sessionPath(bestSession.id)}
            className="text-sound-300 underline underline-offset-4 hover:text-ink"
          >
            Open the Session
          </Link>
        </p>
      </StoryCard>
    ),
  };
}

function whenWePlayCard({ whenWePlay: when }: Review): StoryDeckCard | null {
  if (!when) return null;
  const slot = (label: string, s: NonNullable<typeof when.best>) => (
    <p>
      {label}: {s.label}, {formatPercentage(s.winPercentage)} Wins over{" "}
      {formatCount(s.played, "Match", "Matches")}.
    </p>
  );
  return {
    id: "when-we-play",
    label: "When we play",
    content: (
      <StoryCard
        kicker="When we play"
        title={`${when.busiestNight.label} nights`}
        figure={when.busiestNight.played}
        figureCaption={`Matches on a ${when.busiestNight.label}`}
      >
        <p>
          Busiest kick-off: {when.busiestTime.label}, with{" "}
          {formatCount(when.busiestTime.played, "Match", "Matches")}.
        </p>
        {when.best && slot("Best slot", when.best)}
        {when.worst && slot("Worst slot", when.worst)}
      </StoryCard>
    ),
  };
}

function opponentsCard({
  nemesis,
  favouriteOpponent: favourite,
}: Review): StoryDeckCard | null {
  if (!nemesis && !favourite) return null;
  const rival = (
    label: string,
    club: NonNullable<typeof nemesis>,
    fact: string,
  ) => (
    <div>
      <p className="font-display font-bold text-ink-muted text-lg uppercase tracking-wide">
        {label}
      </p>
      <Link
        to={`/opponents/${club.clubId}`}
        className="block break-words font-display font-extrabold text-4xl text-ink uppercase italic leading-none hover:text-rave"
      >
        {club.name}
      </Link>
      <p className="mt-1">{fact}</p>
    </div>
  );
  return {
    id: "opponents",
    label: "Opponents",
    content: (
      <StoryCard kicker="Opponents" title="Nemesis and favourite">
        <div className="space-y-6">
          {nemesis &&
            rival(
              "Nemesis",
              nemesis,
              `Took points off us ${nemesis.droppedPoints} times in ${formatCount(nemesis.played, "Match", "Matches")}.`,
            )}
          {favourite &&
            rival(
              "Favourite Opponent",
              favourite,
              `${formatCount(favourite.wins, "Win", "Wins")} in ${formatCount(favourite.played, "Match", "Matches")}.`,
            )}
        </div>
      </StoryCard>
    ),
  };
}

/** The Milestones reached this Season (CLUBS-36): how many, and the first few. */
function milestonesCard(
  milestones: ReviewData["milestones"],
): StoryDeckCard | null {
  if (milestones.length === 0) return null;
  const shown = milestones.slice(0, MILESTONES_SHOWN);
  const more = milestones.length - shown.length;
  return {
    id: "milestones",
    label: "Milestones",
    content: (
      <StoryCard
        kicker="Milestones"
        title="Landmarks and feats"
        figure={milestones.length}
        figureCaption={milestones.length === 1 ? "Milestone" : "Milestones"}
      >
        <ul className="space-y-1">
          {shown.map((m) => (
            <li key={m.id}>
              <Link
                to={`/matches/${m.matchId}`}
                className="hover:text-ink hover:underline"
              >
                {m.headline}
              </Link>
            </li>
          ))}
        </ul>
        {more > 0 && (
          <p>
            <Link
              to="/milestones"
              className="text-sound-300 underline underline-offset-4 hover:text-ink"
            >
              {formatCount(more, "more Milestone", "more Milestones")}
            </Link>
          </p>
        )}
      </StoryCard>
    ),
  };
}

/** How many Milestones the card lists before linking to the rest. */
const MILESTONES_SHOWN = 6;

/** "W12 D3 L6". */
function wdl({
  wins,
  draws,
  losses,
}: Pick<RecordSummary, "wins" | "draws" | "losses">) {
  return `W${wins} D${draws} L${losses}`;
}

function Prose({ text }: { text: string }): ReactNode {
  return paragraphs(text).map((paragraph, i) => (
    // Paragraphs never reorder.
    // biome-ignore lint/suspicious/noArrayIndexKey: see above.
    <p key={i}>{paragraph}</p>
  ));
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <RouteError
      error={error}
      subject="Season Review"
      notFoundDescription="There is no review of this Season. A review is written once a Season has ended."
      back={{ to: "/", children: "Matchday" }}
    />
  );
}
