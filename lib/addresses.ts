import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { HttpError } from "@/lib/http-error";
import type { AddressInput } from "@/lib/validation";

const { addresses } = schema;
export type Address = typeof addresses.$inferSelect;

const MAX_ADDRESSES = 10;

export async function listAddresses(userId: string) {
  return getDb()
    .select()
    .from(addresses)
    .where(eq(addresses.userId, userId))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
}

export async function getAddress(userId: string, id: string) {
  const [a] = await getDb()
    .select()
    .from(addresses)
    .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
    .limit(1);
  return a ?? null;
}

/** Creates (no id) or updates an address. The first address, or one marked default, becomes the default. */
export async function saveAddress(userId: string, input: AddressInput, id?: string) {
  return getDb().transaction(async (tx) => {
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(addresses)
      .where(eq(addresses.userId, userId));
    if (!id && count >= MAX_ADDRESSES) {
      throw new HttpError(400, `You can save up to ${MAX_ADDRESSES} addresses.`);
    }
    const makeDefault = input.isDefault || count === 0;
    if (makeDefault) {
      await tx.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));
    }
    const values = { ...input, isDefault: makeDefault };
    if (id) {
      const [updated] = await tx
        .update(addresses)
        .set(values)
        .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
        .returning();
      if (!updated) throw new HttpError(404, "Address not found.");
      return updated;
    }
    const [created] = await tx
      .insert(addresses)
      .values({ ...values, userId })
      .returning();
    return created;
  });
}

export async function deleteAddress(userId: string, id: string) {
  await getDb().transaction(async (tx) => {
    const [removed] = await tx
      .delete(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .returning();
    if (removed?.isDefault) {
      // Promote the most recent remaining address.
      const [next] = await tx
        .select({ id: addresses.id })
        .from(addresses)
        .where(eq(addresses.userId, userId))
        .orderBy(desc(addresses.createdAt))
        .limit(1);
      if (next) await tx.update(addresses).set({ isDefault: true }).where(eq(addresses.id, next.id));
    }
  });
}

/** One-line address for orders and emails. */
export function formatAddress(a: Pick<Address, "line1" | "line2" | "city" | "state">) {
  return [a.line1, a.line2, a.city, a.state].filter(Boolean).join(", ");
}
