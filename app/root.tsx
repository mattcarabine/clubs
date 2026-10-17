import { env } from "cloudflare:workers";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { AppShell, crestUrl, PageHeader } from "~/components";

const FALLBACK_CLUB_NAME = "A Bloo Bloo";

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

export function loader() {
  return { clubName: env.EA_CLUB_NAME };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0d1721" />
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
  return (
    useRouteLoaderData<typeof loader>("root")?.clubName ?? FALLBACK_CLUB_NAME
  );
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

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Page not found" : "Error";
    details =
      error.status === 404
        ? "There is nothing at this address. Use the menu to pick a page."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <AppShell clubName={clubName}>
      <PageHeader title={message} subtitle={details} />
      {stack && (
        <pre className="w-full overflow-x-auto bg-shale-900 p-4 text-sm">
          <code>{stack}</code>
        </pre>
      )}
    </AppShell>
  );
}
