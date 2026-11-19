import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { HttpError } from "@/lib/http-error";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { normalizeIndianMobile } from "@/lib/phone";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createSession } from "@/lib/session";
import { checkOtp } from "@/lib/sms";
import { isComplete, linkPhone, loginWithPhone } from "@/lib/users";

const bodySchema = z.object({
  phone: z.string().max(20),
  code: z.string().regex(/^\d{4,8}$/, "Enter the code from the SMS."),
});

/** Checks the SMS code, then logs in with the number, or links it to the logged-in account. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = bodySchema.parse(await request.json());
    const phone = normalizeIndianMobile(body.phone);
    if (!phone) throw new HttpError(400, "Please enter a valid 10-digit Indian mobile number.");

    await rateLimit("otp-verify-ip", clientIp(request), 15, 15 * 60);
    await rateLimit("otp-verify-phone", phone, 6, 15 * 60);

    if (!(await checkOtp(phone, body.code))) {
      throw new HttpError(400, "That code is incorrect or has expired.");
    }

    const viewer = await getViewer();
    const user = viewer ? await linkPhone(viewer.userId, phone) : await loginWithPhone(phone);
    if (!viewer) await createSession(user.id);
    return json({ ok: true, complete: isComplete(user) });
  } catch (e) {
    return handleError(e, "We couldn’t verify the code. Please try again.");
  }
}
