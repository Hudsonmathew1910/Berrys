import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { updateOrderStatus } from "@/lib/store-data";

const bodySchema = z.object({ status: z.enum(["packed", "shipped", "delivered", "cancelled"]) });

/** Move a paid order through packing, shipping and delivery. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const { status } = bodySchema.parse(await request.json());
    await updateOrderStatus((await params).id, status);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
