import { redirect } from "react-router";

/** A permanent redirect from an old address to `path`, keeping the filter in the query string. */
export function moved(request: Request, path: string): Response {
  return redirect(`${path}${new URL(request.url).search}`, 301);
}
