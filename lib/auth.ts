import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { serverEnv } from "@/lib/env";
import { HttpError } from "@/lib/http-error";
import { getSessionUser } from "@/lib/session";
import { isComplete } from "@/lib/users";

export { HttpError };

export type Viewer = {
  userId: string;
  email: string | null;
  phone: string | null;
  name: string;
  avatarUrl: string;
  /** Google account and mobile number are both linked. */
  complete: boolean;
} | null;

/** The logged-in visitor (from the session cookie), or null. */
export async function getViewer(): Promise<Viewer> {
  const u = await getSessionUser();
  if (!u) return null;
  return {
    userId: u.id,
    email: u.email,
    phone: u.phone,
    name: u.name,
    avatarUrl: u.avatarUrl,
    complete: isComplete(u),
  };
}

export async function isAdmin(viewer: Viewer): Promise<boolean> {
  if (!viewer) return false;
  const rows = await getDb()
    .select({ userId: schema.admins.userId })
    .from(schema.admins)
    .where(eq(schema.admins.userId, viewer.userId))
    .limit(1);
  return rows.length > 0;
}

export async function hasAnyAdmin(): Promise<boolean> {
  const rows = await getDb().select({ userId: schema.admins.userId }).from(schema.admins).limit(1);
  return rows.length > 0;
}

export function isOwnerEmail(email: string | null | undefined) {
  const owner = serverEnv.storeOwnerEmail();
  return !!email && owner.length > 0 && owner === email.toLowerCase();
}

/** Throws a 401/403 HttpError unless the visitor is a store admin. */
export async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer) throw new HttpError(401, "Please log in first.");
  if (!(await isAdmin(viewer))) throw new HttpError(403, "Admin access is required.");
  return viewer;
}
