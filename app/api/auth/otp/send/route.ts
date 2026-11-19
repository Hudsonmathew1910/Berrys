import { z } from "zod";
import { HttpError } from "@/lib/http-error";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { normalizeIndianMobile } from "@/lib/phone";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sendOtp } from "@/lib/sms";

const bodySchema = z.object({ phone: z.string().max(20) });

/**
 * Sends a 6-digit login code by SMS. SMS costs money and is a target for
 * "SMS pumping" fraud, so it is rate-limited per IP and per number.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const phone = normalizeIndianMobile(bodySchema.parse(await request.json()).phone);
    if (!phone) throw new HttpError(400, "Please enter a valid 10-digit Indian mobile number.");

    const ip = clientIp(request);
    await rateLimit("otp-send-ip", ip, 5, 15 * 60);
    await rateLimit("otp-send-ip-day", ip, 20, 24 * 60 * 60);
    await rateLimit("otp-send-phone", phone, 3, 15 * 60);
    await rateLimit("otp-send-phone-day", phone, 8, 24 * 60 * 60);

    await sendOtp(phone);
    return json({ ok: true, phone });
  } catch (e) {
    return handleError(e, "We couldn’t send the code. Please try again in a moment.");
  }
}
