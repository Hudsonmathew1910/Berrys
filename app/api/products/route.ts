import { handleError, json } from "@/lib/http";
import { queryProducts } from "@/lib/store-data";

export const dynamic = "force-dynamic";

/** GET /api/products?ids=a,b,c — current price and stock for the bag / favourites. */
export async function GET(request: Request) {
  try {
    const ids = (new URL(request.url).searchParams.get("ids") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 48);
    const { products } = await queryProducts({ ids, perPage: 48 });
    return json({ products });
  } catch (e) {
    return handleError(e);
  }
}
