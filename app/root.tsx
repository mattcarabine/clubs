import { env } from "cloudflare:workers";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { AppShell, crestUrl, isNotFound, PageHeader } from "~/components";
import { getDb } from "~/db/client";
import { pageMeta } from "~/lib/page-meta";
import { SITE_NAME, THEME_COLOR } from "~/lib/site";
import { firstMatchDate, listSeasons } from "~/stats";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: crestUrl, type: "image/png" },
  { rel: "apple-touch-icon", href: crestUrl },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    // Sofia Sans for text, its Extra Condensed cut for numerals and display.
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Sofia+Sans+Extra+Condensed:ital,wght@0,600..800;1,800&family=Sofia+Sans:wght@400..700&display=swap",
  },
];

/** Only used when no route below matched or every boundary failed: each page sets its own meta. */
export function meta({ error, location }: Route.MetaArgs) {
  if (!error) return [];
  const notFound = isNotFound(error);
  return pageMeta({
    title: `${SITE_NAME} — ${notFound ? "Page not found" : "Something went wrong"}`,
    description: notFound
      ? "There is nothing at this address."
      : "This page failed to load.",
    path: location.pathname,
  });
}

export async function loader() {
  const db = getDb(env.DB);
  const [seasons, firstMatch] = await Promise.all([
    listSeasons(db),
    firstMatchDate(db),
  ]);
  return {
    clubName: env.EA_CLUB_NAME,
    /** Season numbers, oldest first, for every page's FilterBar. */
    seasons: seasons.map((season) => season.number),
    /** The FilterBar's date picker mutes the days before it. */
    firstMatchDate: firstMatch,
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content={THEME_COLOR} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function useClubName(): string {
  return useRouteLoaderData<typeof loader>("root")?.clubName ?? SITE_NAME;
}

export default function App() {
  return (
    <AppShell clubName={useClubName()}>
      <Outlet />
    </AppShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const clubName = useClubName();
  let message = "Something went wrong";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isNotFound(error)) {
    message = "Page not found";
    details = "There is nothing at this address.";
  } else if (isRouteErrorResponse(error)) {
    message = "Error";
    details = error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <AppShell clubName={clubName}>
      <PageHeader title={message} subtitle={details} />
      <Link
        to="/"
        className="font-display font-bold text-lg text-sound-300 uppercase tracking-wide hover:text-ink"
      >
        Back to Matchday
      </Link>
      {stack && (
        <pre className="w-full overflow-x-auto bg-shale-900 p-4 text-sm">
          <code>{stack}</code>
        </pre>
      )}
    </AppShell>
  );
}
