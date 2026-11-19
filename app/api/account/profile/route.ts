import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getViewer } from "@/lib/auth";
import { HttpError } from "@/lib/http-error";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({ name: z.string().trim().min(1, "Please enter your name.").max(100) });

/** Update the account's display name. */
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Please log in first.");
    await rateLimit("profile-write", viewer.userId, 20, 10 * 60);
    const { name } = bodySchema.parse(await request.json());
    await getDb().update(schema.users).set({ name }).where(eq(schema.users.id, viewer.userId));
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
