/**
 * The Discord post for one Session (CLUBS-39): one embed with the Session's
 * title and link, its Matches' scorelines and headlines, the top performer,
 * its Milestones (CLUBS-36) and the recap's first paragraph, unlabelled. And the one announcing a
 * Season Review (CLUBS-45). Pure, so they are unit tested.
 *
 * Club names, persona names and the model's text all reach Discord, so each
 * is escaped (`discordText`) and the webhook pings nobody
 * (`allowed_mentions`).
 */
import { clampText, paragraphs } from "~/lib/text";
import type { Award } from "~/stats/awards";
import { formatRecord, scoreLine, sessionPreview } from "~/stats/link-preview";
import type { MatchSummary } from "~/stats/matches";
import { type PerformerTotals, sessionTopPerformer } from "~/stats/sessions";
import type { RecordSummary } from "~/stats/summaries";
import { formatPerformerStat } from "~/stats/top-performers";

/** The `sound-900` token in `app/app.css`, as Discord's integer colour. */
export const EMBED_COLOR = 0x0f3f7a;

/** Discord's embed limits, in characters. */
export const EMBED_LIMITS = {
  title: 256,
  description: 4096,
  fieldValue: 1024,
  /** Title, description and every field's name and value together. */
  total: 6000,
};

/** The recap excerpt's cap, so the scorelines always fit beside it. */
const MAX_RECAP_LENGTH = 1_500;

/**
 * Third-party or model text made inert in Discord: on one line, with every
 * Markdown character escaped (so no formatting, masked link or `https://`
 * auto-link), and `@` broken by a zero-width space so nothing reads as a
 * mention, even where `allowed_mentions` would not apply.
 */
export function discordText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\\*_~`|>#[\]()<:-]/g, "\\$&")
    .replace(/@/g, "@​");
}

export interface SessionPostInput {
  /** The Session page, absolute. */
  url: string;
  clubName: string;
  start: Date;
  record: RecordSummary;
  /** Oldest first. */
  matches: readonly MatchSummary[];
  players: readonly PerformerTotals[];
  /** Each Match's headline (CLUBS-43), by Match ID. */
  headlines: ReadonlyMap<string, string>;
  /** The Session recap, if written. */
  recap: string | null;
  /** The Session's Milestone headlines, oldest first: "Loltown95 — 50th goal". */
  milestones: readonly string[];
}

export interface WebhookBody {
  allowed_mentions: { parse: [] };
  embeds: [Embed];
}

interface Embed {
  title: string;
  url: string;
  color: number;
  description: string;
  fields: { name: string; value: string }[];
}

export function sessionPostBody(input: SessionPostInput): WebhookBody {
  const { title } = sessionPreview(input);
  const top = sessionTopPerformer(input.players);
  const [lede] = input.recap ? paragraphs(input.recap) : [];
  const excerpt = lede && discordText(clampText(lede, MAX_RECAP_LENGTH));
  const fields: Embed["fields"] = [];
  if (top) {
    fields.push({
      name: "Top performer",
      value: `${discordText(top.name)} · ${formatPerformerStat(top, top.averageRating)}`,
    });
  }
  if (input.milestones.length > 0) {
    fields.push({
      name: "Milestones",
      value: fitLines(
        input.milestones.map(discordText),
        EMBED_LIMITS.fieldValue,
      ),
    });
  }
  const room = EMBED_LIMITS.description - (excerpt ? excerpt.length + 2 : 0);
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: clampText(title, EMBED_LIMITS.title),
        url: input.url,
        color: EMBED_COLOR,
        description: [excerpt, scorelines(input, room)]
          .filter(Boolean)
          .join("\n\n"),
        fields,
      },
    ],
  };
}

/** One line per Match, oldest first: "**W** A Bloo Bloo 3–1 Opponent — its headline". */
function scorelines(input: SessionPostInput, room: number): string {
  const lines = input.matches.map((match) => {
    const headline = input.headlines.get(match.matchId);
    return [
      `**${match.outcome}**`,
      discordText(scoreLine(input.clubName, match)),
      match.dnf && "(DNF)",
      headline && `— ${discordText(headline)}`,
    ]
      .filter(Boolean)
      .join(" ");
  });
  return fitLines(lines, room);
}

/**
 * The lines joined, within `room` characters: lines that would pass it are
 * left out and counted instead ("…and 3 more").
 */
function fitLines(lines: readonly string[], room: number): string {
  const kept: string[] = [];
  let length = 0;
  for (const [i, line] of lines.entries()) {
    const more = `…and ${lines.length - i} more`;
    const isLast = i === lines.length - 1;
    // Always leave room for the "…and N more" line unless this is the last.
    if (length + line.length + 1 + (isLast ? 0 : more.length + 1) > room) {
      kept.push(more);
      break;
    }
    kept.push(line);
    length += line.length + 1;
  }
  return kept.join("\n");
}

/** How many Award winners a Season Review post names. */
export const POSTED_AWARDS = 3;

export interface SeasonReviewPostInput {
  /** The review page, absolute. */
  url: string;
  number: number;
  record: Pick<RecordSummary, "wins" | "draws" | "losses">;
  /** In the review's order; the first `POSTED_AWARDS` are named. */
  awards: readonly Pick<Award, "title" | "name" | "value" | "unit">[];
}

/**
 * The Discord post announcing a Season Review (CLUBS-45): "Season 3 Review
 * is in", the link, the recorded W-D-L and the first `POSTED_AWARDS`
 * Awards' winners. The page itself tells the story.
 */
export function seasonReviewPostBody(
  input: SeasonReviewPostInput,
): WebhookBody {
  return {
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `Season ${input.number} Review is in`,
        url: input.url,
        color: EMBED_COLOR,
        description: `${formatRecord(input.record)}. The Awards, the best and worst of it, and a look at next Season.`,
        fields: input.awards.slice(0, POSTED_AWARDS).map((award) => ({
          name: award.title,
          value: `${discordText(award.name)} · ${award.value} ${award.unit}`,
        })),
      },
    ],
  };
}
