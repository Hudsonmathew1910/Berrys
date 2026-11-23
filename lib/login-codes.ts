import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** "Continue with email": a 6-digit code emailed to the address, checked before signing in. */
export const LOGIN_CODE_MINUTES = 10;
const MAX_TRIES = 5;
const t = schema.emailLoginCodes;

const hash = (email: string, code: string) =>
  createHash("sha256").update(`login:${email}:${code}`).digest("hex");

/** Makes a fresh code for the email (replacing any earlier one) and returns it to be emailed. */
export async function issueLoginCode(email: string): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const values = {
    codeHash: hash(email, code),
    expiresAt: new Date(Date.now() + LOGIN_CODE_MINUTES * 60_000),
    attempts: 0,
    createdAt: new Date(),
  };
  const db = getDb();
  await db
    .insert(t)
    .values({ email, ...values })
    .onConflictDoUpdate({ target: t.email, set: values });
  // Tidy up codes nobody used.
  await db.delete(t).where(lt(t.expiresAt, new Date(Date.now() - 60 * 60_000)));
  return code;
}

/**
 * Checks a code. Each check counts as a try first (atomically), so guessing is
 * capped at 5 even with parallel requests. A correct code is used up.
 */
export async function checkLoginCode(email: string, code: string): Promise<"ok" | "wrong" | "expired"> {
  const db = getDb();
  const [row] = await db
    .update(t)
    .set({ attempts: sql`${t.attempts} + 1` })
    .where(and(eq(t.email, email), gt(t.expiresAt, new Date()), lt(t.attempts, MAX_TRIES)))
    .returning({ codeHash: t.codeHash, attempts: t.attempts });
  if (!row) return "expired";
  const ok = timingSafeEqual(
    Buffer.from(row.codeHash, "hex"),
    Buffer.from(hash(email, /^\d{6}$/.test(code) ? code : "x"), "hex"),
  );
  if (!ok) return row.attempts >= MAX_TRIES ? "expired" : "wrong";
  // Delete it; if a parallel request already used it, only one of them wins.
  const used = await db
    .delete(t)
    .where(and(eq(t.email, email), eq(t.codeHash, row.codeHash)))
    .returning({ email: t.email });
  return used.length ? "ok" : "expired";
}
