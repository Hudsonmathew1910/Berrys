import { getViewer, hasAnyAdmin, isAdmin, isOwnerEmail } from "@/lib/auth";
import { seedProducts } from "@/lib/catalog";
import { handleError, json } from "@/lib/http";
import { listProducts } from "@/lib/store-data";

export const dynamic = "force-dynamic";

/** Public catalogue plus who is looking at it. */
export async function GET() {
  try {
    const [products, viewer, seeded] = await Promise.all([listProducts(), getViewer(), hasAnyAdmin()]);
    const admin = await isAdmin(viewer);
    // Before the owner has set the store up, show the sample catalogue as a
    // read-only preview (checkout stays closed until real stock exists).
    const preview = !seeded && products.length === 0;
    return json({
      products: preview ? seedProducts : products,
      preview,
      viewer: viewer
        ? { email: viewer.email, phone: viewer.phone, name: viewer.name, complete: viewer.complete }
        : null,
      admin: admin && !!viewer?.complete,
      needsSetup: !seeded && !!viewer?.complete && isOwnerEmail(viewer.email),
    });
  } catch (e) {
    return handleError(e, "We could not load the store. Please try again.");
  }
}
