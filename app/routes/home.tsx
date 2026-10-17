import { env } from "cloudflare:workers";
import { PageHeader } from "~/components";
import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [{ title: "A Bloo Bloo — Matchday" }];
}

export function loader() {
  return { clubName: env.EA_CLUB_NAME };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return <PageHeader title={loaderData.clubName} subtitle="Matchday" />;
}
