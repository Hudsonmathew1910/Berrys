import { getViewer, HttpError, isOwnerEmail } from "@/lib/auth";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { setupOwner } from "@/lib/store-data";

/** One-time: registers the STORE_OWNER_EMAIL account as admin and loads the sample catalogue. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Please log in first.");
    if (!viewer.complete) throw new HttpError(403, "Link your Google account and mobile number first.");
    if (!isOwnerEmail(viewer.email)) {
      throw new HttpError(403, "Only the store owner can set up administrator access.");
    }
    await setupOwner(viewer);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
