import { listAddresses, saveAddress } from "@/lib/addresses";
import { getViewer } from "@/lib/auth";
import { HttpError } from "@/lib/http-error";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { addressSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) throw new HttpError(401, "Please log in first.");
  return viewer;
}

export async function GET() {
  try {
    const viewer = await requireViewer();
    return json({ addresses: await listAddresses(viewer.userId) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer();
    await rateLimit("address-write", viewer.userId, 30, 10 * 60);
    const input = addressSchema.parse(await request.json());
    return json({ address: await saveAddress(viewer.userId, input) });
  } catch (e) {
    return handleError(e, "We couldn’t save the address. Please try again.");
  }
}
