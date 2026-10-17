import {
  formatLondonDate,
  formatLondonDateTime,
  formatLondonTime,
} from "~/lib/london-time";

const FORMATS = {
  /** "Wed 14 Oct": a day on its own, e.g. "Last met". */
  day: formatLondonDate,
  /** "Wed 14 Oct, 20:30": a moment, e.g. when a Match was played. */
  moment: formatLondonDateTime,
  /** "20:30": only under a heading that already names the day. */
  time: formatLondonTime,
} as const;

type LondonTimeProps = {
  date: Date;
  format: keyof typeof FORMATS;
};

/**
 * A machine-readable `<time>` in the app's one time-format convention
 * (CLAUDE.md "Time formats").
 */
export function LondonTime({ date, format }: LondonTimeProps) {
  return (
    // The year shows only outside the current year, which server and browser
    // can disagree on for a moment at New Year.
    <time dateTime={date.toISOString()} suppressHydrationWarning>
      {FORMATS[format](date)}
    </time>
  );
}
