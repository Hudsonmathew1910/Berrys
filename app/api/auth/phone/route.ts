import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { verifyFirebasePhoneToken } from "@/lib/firebase-verify";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createSession } from "@/lib/session";
import { isComplete, linkPhone, loginWithPhone } from "@/lib/users";

const bodySchema = z.object({ idToken: z.string().min(20).max(5000) });

/**
 * Called after Firebase has verified the SMS code in the browser.
 * Logs in with the number, or links it to the account that is already logged in.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit("phone-login", clientIp(request), 20, 15 * 60);
    const { idToken } = bodySchema.parse(await request.json());
    const phone = await verifyFirebasePhoneToken(idToken);

    const viewer = await getViewer();
    const user = viewer ? await linkPhone(viewer.userId, phone) : await loginWithPhone(phone);
    if (!viewer) await createSession(user.id);
    return json({ ok: true, complete: isComplete(user) });
  } catch (e) {
    return handleError(e, "We couldn’t verify your mobile number. Please try again.");
  }
}
