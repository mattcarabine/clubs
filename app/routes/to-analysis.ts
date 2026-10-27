/** `/trends`, merged into Analysis (ADR 0008). */
import { moved } from "~/lib/moved";

export function loader({ request }: { request: Request }) {
  return moved(request, "/analysis");
}
