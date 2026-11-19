import { deleteAddress, saveAddress } from "@/lib/addresses";
import { getViewer } from "@/lib/auth";
import { HttpError } from "@/lib/http-error";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { addressSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) throw new HttpError(401, "Please log in first.");
  return viewer;
}

export async function PUT(request: Request, { params }: Ctx) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer();
    await rateLimit("address-write", viewer.userId, 30, 10 * 60);
    const input = addressSchema.parse(await request.json());
    return json({ address: await saveAddress(viewer.userId, input, (await params).id) });
  } catch (e) {
    return handleError(e, "We couldn’t save the address. Please try again.");
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer();
    await rateLimit("address-write", viewer.userId, 30, 10 * 60);
    await deleteAddress(viewer.userId, (await params).id);
    return json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
