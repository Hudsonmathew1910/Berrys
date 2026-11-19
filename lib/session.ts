import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb, schema } from "@/db";

const COOKIE = "berrys_session";
const SESSION_DAYS = 30;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: maxAgeSeconds,
});

/** Starts a login session: random token in an httpOnly cookie, only its hash in the database. */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const db = getDb();
  await db.insert(schema.sessions).values({ tokenHash: hash(token), userId, expiresAt });
  // Opportunistic clean-up of expired sessions.
  if (Math.random() < 0.05) {
    await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  }
  (await cookies()).set(COOKIE, token, cookieOptions(SESSION_DAYS * 86_400));
}

/** Hash of the current login session token (links dashboard unlocks to this login). */
export async function currentSessionHash() {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? hash(token) : null;
}

/** The logged-in user, or null. */
export async function getSessionUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await getDb()
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenHash, hash(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return row?.user ?? null;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token)
    await getDb()
      .delete(schema.sessions)
      .where(eq(schema.sessions.tokenHash, hash(token)));
  jar.set(COOKIE, "", cookieOptions(0));
}
