import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { emailConfigured, sendLoginCode } from "@/lib/email";
import { logError } from "@/lib/error-log";
import { HttpError } from "@/lib/http-error";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { issueLoginCode, LOGIN_CODE_MINUTES } from "@/lib/login-codes";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().max(254).email("Please enter a valid email address."),
});

/** "Continue with email", step 1: email a 6-digit sign-in code. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!(await getSettings()).emailSignIn)
      throw new HttpError(403, "Email sign-in is turned off. Please continue with Google.");
    if (!emailConfigured())
      throw new HttpError(503, "Email sign-in isn’t available right now. Please continue with Google.");
    if (await getViewer()) throw new HttpError(400, "You’re already signed in.");
    await rateLimit("login-code-ip", clientIp(request), 20, 10 * 60);
    const { email } = bodySchema.parse(await request.json());
    await rateLimit("login-code", email, 3, 10 * 60);
    // Daily cap too: 10 codes × 5 tries = at most 50 guesses a day at one account.
    await rateLimit("login-code-day", email, 10, 24 * 60 * 60);

    const code = await issueLoginCode(email);
    try {
      await sendLoginCode(email, code, LOGIN_CODE_MINUTES);
    } catch (e) {
      await logError("email", e, { path: "/api/auth/email/code", message: "Sign-in code not sent" });
      throw new HttpError(502, "We couldn’t send the code. Please check the email address and try again.");
    }
    return json({ ok: true, minutes: LOGIN_CODE_MINUTES });
  } catch (e) {
    return handleError(e, "We couldn’t send the code. Please try again.", {
      source: "auth",
      path: "/api/auth/email/code",
    });
  }
}
