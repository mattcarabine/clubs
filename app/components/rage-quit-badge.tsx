import { type QuitInput, rageQuitLabel } from "~/stats/counted";

/**
 * Flags a Match one side rage quit ("We rage quit", "They rage quit"), so EA
 * awarded the result to the side that stayed. Renders nothing for a Match
 * played to the end.
 */
export function RageQuitBadge(match: QuitInput) {
  const label = rageQuitLabel(match);
  if (!label) return null;
  return (
    <span className="clip-slant inline-flex h-6 items-center whitespace-nowrap bg-ink px-2.5 font-display font-extrabold text-base text-shale-950 uppercase leading-none [--slant:0.3rem]">
      {label}
    </span>
  );
}
