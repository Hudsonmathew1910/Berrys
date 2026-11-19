import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getViewer } from "@/lib/auth";
import { HttpError } from "@/lib/http-error";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { normalizeIndianMobile } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(100),
  /** Contact mobile (optional, not verified, never used to log in). Empty clears it. */
  phone: z.string().trim().max(20).optional(),
});

/** Update the account's display name and contact mobile number. */
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Please log in first.");
    await rateLimit("profile-write", viewer.userId, 20, 10 * 60);
    const { name, phone } = bodySchema.parse(await request.json());
    let contactPhone: string | undefined;
    if (phone !== undefined) {
      if (phone === "") contactPhone = "";
      else {
        const e164 = normalizeIndianMobile(phone);
        if (!e164) throw new HttpError(400, "Please enter a valid 10-digit Indian mobile number.");
        contactPhone = e164;
      }
    }
    await getDb()
      .update(schema.users)
      .set({ name, ...(contactPhone !== undefined && { contactPhone }) })
      .where(eq(schema.users.id, viewer.userId));
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
