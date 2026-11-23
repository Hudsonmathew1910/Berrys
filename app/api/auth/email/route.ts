import { after } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { sendLoginAlert } from "@/lib/email";
import { HttpError } from "@/lib/http-error";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createSession } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { loginWithEmail } from "@/lib/users";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email("Please enter a valid email address."),
});

/**
 * "Continue with email". Same account as Google for the same email. For now
 * the email alone signs in (Settings → Emails → Sign in with email). Next step: send a 6-digit code here and check it in a
 * second request before calling loginWithEmail.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!(await getSettings()).emailSignIn)
      throw new HttpError(403, "Email sign-in is turned off. Please continue with Google.");
    if (await getViewer()) throw new HttpError(400, "You’re already signed in.");
    const ip = clientIp(request);
    await rateLimit("email-login-ip", ip, 30, 10 * 60);
    const { email } = bodySchema.parse(await request.json());
    await rateLimit("email-login", email, 5, 10 * 60);

    const user = await loginWithEmail(email);
    await createSession(user.id);
    const device = (request.headers.get("user-agent") ?? "").slice(0, 120);
    after(() => sendLoginAlert(email, user.name, { ip, device: device || "Unknown device" }));
    return json({ ok: true });
  } catch (e) {
    return handleError(e, "We couldn’t sign you in. Please try again.", {
      source: "auth",
      path: "/api/auth/email",
    });
  }
}
