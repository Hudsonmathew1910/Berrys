import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { saveProduct } from "@/lib/store-data";
import { productSchema } from "@/lib/validation";

/** Create or update a product and its per-size stock. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const product = productSchema.parse(await request.json());
    const id = await saveProduct(product);
    return json({ ok: true, id });
  } catch (e) {
    return handleError(e, "Unable to save the product. Please try again.");
  }
}
