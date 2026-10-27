import { type ReactNode, useEffect } from "react";
import { NavLink, useLocation } from "react-router";

import { fadeAttributes, useScrollFade } from "~/lib/use-scroll-fade";
// The whole crest, 96px: the favicon and touch icon.
import crestUrl from "../../assets/crest-96.png";

import { CrestMark } from "./crest-mark";

export { crestUrl };

export const NAV_ITEMS = [
  { to: "/", label: "Matches" },
  { to: "/squad", label: "Squad" },
  { to: "/trends", label: "Trends" },
  { to: "/analysis", label: "Analysis" },
  { to: "/milestones", label: "Milestones" },
] as const;

type AppShellProps = {
  clubName: string;
  /** Optional strip under the header, e.g. a <Ticker>. */
  ticker?: ReactNode;
  children: ReactNode;
};

/**
 * Page chrome: crest lockup, primary nav, optional ticker, then the page. On
 * phones the nav is one row that scrolls sideways, its clipped edge fading,
 * and the current page's item is scrolled into view.
 */
export function AppShell({ clubName, ticker, children }: AppShellProps) {
  const [navRef, edges, nav] = useScrollFade<HTMLElement>();
  const { pathname } = useLocation();
  useEffect(() => {
    // `pathname` reruns this on navigation, once the new item is current.
    void pathname;
    const active = nav?.querySelector('[aria-current="page"]');
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [nav, pathname]);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-shale-700 border-b bg-shale-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-x-8 md:flex-row md:items-stretch">
          <NavLink
            to="/"
            className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2 md:py-3"
          >
            <CrestMark />
            <span className="font-display font-extrabold text-2xl text-ink uppercase italic leading-none tracking-wide">
              {clubName}
            </span>
          </NavLink>
          <nav
            ref={navRef}
            aria-label="Primary"
            {...fadeAttributes(edges)}
            className="scroll-fade min-w-0 overflow-x-auto [scrollbar-width:none]"
          >
            <ul className="flex h-full px-1 sm:px-2 md:px-0">
              {NAV_ITEMS.map((item) => (
                <li key={item.to} className="flex">
                  <NavLink
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      [
                        "relative flex items-center whitespace-nowrap px-1.5 py-2.5 font-display font-bold text-base uppercase tracking-normal transition-colors sm:px-3 sm:text-lg sm:tracking-wide",
                        "after:absolute after:inset-x-1.5 after:bottom-0 sm:after:inset-x-2 after:h-1 after:-skew-x-12 after:transition-colors",
                        isActive
                          ? "text-ink after:bg-rave"
                          : "text-ink-muted after:bg-transparent hover:text-ink",
                      ].join(" ")
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      {ticker}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
