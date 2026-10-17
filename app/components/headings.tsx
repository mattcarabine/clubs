import type { ReactNode } from "react";

type HeadingProps = {
  title: string;
  subtitle?: ReactNode;
  /** Right-aligned on desktop, below on phones, e.g. a LastUpdatedBadge. */
  aside?: ReactNode;
};

/** The page's h1 with a slanted rave underline. One per page. */
export function PageHeader({ title, subtitle, aside }: HeadingProps) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-display font-extrabold text-5xl text-ink uppercase italic leading-none tracking-wide sm:text-6xl">
          {title}
        </h1>
        <span
          aria-hidden
          className="mt-2 block h-1.5 w-16 -skew-x-[24deg] bg-rave"
        />
        {subtitle && <p className="mt-3 text-ink-soft">{subtitle}</p>}
      </div>
      {aside}
    </header>
  );
}

/** An h2 for a section within a page. */
export function SectionHeading({ title, subtitle, aside }: HeadingProps) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="font-display font-extrabold text-3xl text-ink uppercase leading-none tracking-wide">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-ink-muted text-sm">{subtitle}</p>}
      </div>
      {aside}
    </div>
  );
}
