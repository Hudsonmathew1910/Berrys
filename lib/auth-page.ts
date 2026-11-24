import "server-only";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";

/**
 * For pages that need a signed-in customer: the viewer, or a redirect to log in.
 * Pages must check this themselves — a layout's redirect runs alongside the page,
 * not before it, so the page can't assume the layout has already checked.
 */
export async function requireViewerPage(next: string) {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(next)}`);
  return viewer;
}
