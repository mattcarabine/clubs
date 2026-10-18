/** `/sessions` has no list of its own: the Matches page groups Matches by Session (CLUBS-34). */
import { redirect } from "react-router";

import type { Route } from "./+types/sessions";

export function loader({ request }: Route.LoaderArgs) {
  const { search } = new URL(request.url);
  return redirect(`/matches${search}`);
}
