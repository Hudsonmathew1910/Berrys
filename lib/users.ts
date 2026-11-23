import "server-only";
import { and, eq, ne, or } from "drizzle-orm";
import { getDb, schema, type Tx } from "@/db";
import { HttpError } from "@/lib/http-error";

const { users, sessions, orders, addresses } = schema;

export type User = typeof users.$inferSelect;

export type GoogleProfile = {
  sub: string;
  email: string;
  name: string;
  picture: string;
};

/** An account is complete once both a Google account and a mobile number are linked. */
export const isComplete = (u: Pick<User, "googleSub" | "phone">) => !!(u.googleSub && u.phone);

/**
 * Folds `drop` into `keep`: moves its orders and addresses across, deletes
 * it, then applies `patch` (the identity fields keep is taking over).
 * Deleting first frees the unique email/phone/google values for `keep`.
 */
async function mergeInto(tx: Tx, keep: User, drop: User, patch: Partial<User>) {
  await tx.update(orders).set({ userId: keep.id }).where(eq(orders.userId, drop.id));
  await tx.update(addresses).set({ userId: keep.id, isDefault: false }).where(eq(addresses.userId, drop.id));
  await tx.delete(sessions).where(eq(sessions.userId, drop.id));
  await tx.delete(users).where(eq(users.id, drop.id));
  const [updated] = await tx.update(users).set(patch).where(eq(users.id, keep.id)).returning();
  return updated;
}

function googleFields(p: GoogleProfile, current?: User) {
  return {
    googleSub: p.sub,
    email: p.email.toLowerCase(),
    name: current?.name || p.name,
    avatarUrl: p.picture || current?.avatarUrl || "",
  };
}

/** Log in (or sign up) with Google. Matches by Google id, then by verified email. */
export async function loginWithGoogle(p: GoogleProfile): Promise<User> {
  return getDb().transaction(async (tx) => {
    const email = p.email.toLowerCase();
    const [existing] = await tx
      .select()
      .from(users)
      .where(or(eq(users.googleSub, p.sub), eq(users.email, email)))
      .for("update");
    if (existing) {
      if (existing.googleSub && existing.googleSub !== p.sub) {
        throw new HttpError(409, "This email is linked to a different Google account.");
      }
      // Google proves who owns this email: sign out every session that an
      // email-only login (which has no code check yet) may have opened.
      if (!existing.googleSub) await tx.delete(sessions).where(eq(sessions.userId, existing.id));
      const [u] = await tx
        .update(users)
        .set({ ...googleFields(p, existing), lastLoginAt: new Date() })
        .where(eq(users.id, existing.id))
        .returning();
      return u;
    }
    const [created] = await tx.insert(users).values(googleFields(p)).returning();
    return created;
  });
}

/**
 * Log in (or sign up) with just an email address. One account per email:
 * the same account whether the person uses Google or email.
 * TODO: verify a one-time code sent to the email before calling this.
 */
export async function loginWithEmail(rawEmail: string): Promise<User> {
  const email = rawEmail.trim().toLowerCase();
  return getDb().transaction(async (tx) => {
    const [existing] = await tx.select().from(users).where(eq(users.email, email)).for("update");
    if (existing) {
      const [u] = await tx
        .update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, existing.id))
        .returning();
      return u;
    }
    const name = email
      .split("@")[0]
      .replace(/[._+-]+/g, " ")
      .replace(/\d+/g, "")
      .trim();
    const [created] = await tx
      .insert(users)
      .values({ email, name: name ? name.replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : "" })
      .returning();
    return created;
  });
}

/** Log in (or sign up) with a verified mobile number. */
export async function loginWithPhone(phone: string): Promise<User> {
  return getDb().transaction(async (tx) => {
    const [existing] = await tx.select().from(users).where(eq(users.phone, phone)).for("update");
    if (existing) {
      const [u] = await tx
        .update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, existing.id))
        .returning();
      return u;
    }
    const [created] = await tx.insert(users).values({ phone }).returning();
    return created;
  });
}

/** Adds a Google account to the logged-in user, merging a separate Google-only account if one exists. */
export async function linkGoogle(userId: string, p: GoogleProfile): Promise<User> {
  return getDb().transaction(async (tx) => {
    const [me] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!me) throw new HttpError(401, "Please log in again.");
    if (me.googleSub === p.sub) return me;
    if (me.googleSub) {
      throw new HttpError(409, "Your account is already linked to a different Google account.");
    }
    const email = p.email.toLowerCase();
    const [other] = await tx
      .select()
      .from(users)
      .where(and(ne(users.id, me.id), or(eq(users.googleSub, p.sub), eq(users.email, email))))
      .for("update");
    if (!other) {
      const [u] = await tx.update(users).set(googleFields(p, me)).where(eq(users.id, me.id)).returning();
      return u;
    }
    if (other.phone && me.phone && other.phone !== me.phone) {
      throw new HttpError(409, "This Google account is already linked to a different mobile number.");
    }
    return mergeInto(tx, me, other, { ...googleFields(p, me), phone: me.phone || other.phone });
  });
}

/** Adds a verified mobile number to the logged-in user, merging a separate mobile-only account if one exists. */
export async function linkPhone(userId: string, phone: string): Promise<User> {
  return getDb().transaction(async (tx) => {
    const [me] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!me) throw new HttpError(401, "Please log in again.");
    if (me.phone === phone) return me;
    if (me.phone) throw new HttpError(409, "Your account already has a different mobile number.");
    const [other] = await tx
      .select()
      .from(users)
      .where(and(ne(users.id, me.id), eq(users.phone, phone)))
      .for("update");
    if (!other) {
      const [u] = await tx.update(users).set({ phone }).where(eq(users.id, me.id)).returning();
      return u;
    }
    if (other.googleSub && me.googleSub && other.googleSub !== me.googleSub) {
      throw new HttpError(409, "This mobile number is already linked to a different Google account.");
    }
    return mergeInto(tx, me, other, {
      phone,
      googleSub: me.googleSub || other.googleSub,
      email: me.email || other.email,
      name: me.name || other.name,
      avatarUrl: me.avatarUrl || other.avatarUrl,
    });
  });
}
