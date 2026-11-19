import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { deactivateProduct } from "@/lib/store-data";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    await deactivateProduct((await params).id);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
