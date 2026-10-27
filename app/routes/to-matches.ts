/**
 * Old addresses of the Match list: `/matches` (the list's address before it
 * became the home page, ADR 0008) and `/sessions` (CLUBS-34). Both keep their
 * filter on the way to `/`.
 */
import { redirect } from "react-router";

export function loader({ request }: { request: Request }) {
  const { search } = new URL(request.url);
  return redirect(`/${search}`, 301);
}
