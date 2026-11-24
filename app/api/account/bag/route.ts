import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { getViewer } from "@/lib/auth";
import { HttpError } from "@/lib/http-error";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** What a browser sends: its whole bag and favourites (prices and stock are never stored). */
const bagSchema = z.object({
  bag: z
    .array(
      z.object({
        productId: z.string().min(1).max(100),
        size: z.string().min(1).max(20),
        quantity: z.number().int().min(1).max(50),
      }),
    )
    .max(60),
  likes: z.array(z.string().min(1).max(100)).max(300),
});

async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) throw new HttpError(401, "Please log in first.");
  return viewer;
}

/** GET /api/account/bag — the signed-in customer's bag and favourites. */
export async function GET() {
  try {
    const viewer = await requireViewer();
    const [row] = await getDb()
      .select()
      .from(schema.customerBags)
      .where(sql`${schema.customerBags.userId} = ${viewer.userId}`)
      .limit(1);
    return json({ bag: row?.bag ?? [], likes: row?.likes ?? [], saved: !!row });
  } catch (e) {
    return handleError(e);
  }
}

/** PUT /api/account/bag — replace the account's bag and favourites with this browser's. */
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer();
    await rateLimit("bag-sync", viewer.userId, 300, 10 * 60);
    const input = bagSchema.parse(await request.json());
    // One line per product + size; one entry per favourite.
    const lines = new Map<string, (typeof input.bag)[number]>();
    for (const l of input.bag) lines.set(`${l.productId}\u0000${l.size}`, l);
    const value = { bag: [...lines.values()], likes: [...new Set(input.likes)], updatedAt: new Date() };
    await getDb()
      .insert(schema.customerBags)
      .values({ userId: viewer.userId, ...value })
      .onConflictDoUpdate({ target: schema.customerBags.userId, set: value });
    return json({ ok: true });
  } catch (e) {
    return handleError(e, "We couldn’t save your bag. Please try again.");
  }
}
