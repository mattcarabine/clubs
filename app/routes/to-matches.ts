/**
 * Old addresses of the Match list: `/matches` (the list's address before it
 * became the home page, ADR 0008) and `/sessions` (CLUBS-34).
 */
import { moved } from "~/lib/moved";

export function loader({ request }: { request: Request }) {
  return moved(request, "/");
}
