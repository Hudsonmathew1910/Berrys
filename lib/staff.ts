import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb, schema } from "@/db";
import { getViewer, isOwnerEmail } from "@/lib/auth";
import { HttpError } from "@/lib/http-error";
import { currentSessionHash } from "@/lib/session";

const { staffMembers, dashboardSessions, activityLog } = schema;

export type Staff = typeof staffMembers.$inferSelect;
export * from "@/lib/staff-core";
import { canAccess, type Access } from "@/lib/staff-core";

// ---------------------------------------------------------------- staff lookup

/** The staff record for the logged-in person, creating the owner's admin record on first visit. */
export const getStaffForViewer = cache(async (): Promise<Staff | null> => {
  const viewer = await getViewer();
  if (!viewer?.email) return null;
  const db = getDb();
  const email = viewer.email.toLowerCase();
  let [staff] = await db.select().from(staffMembers).where(eq(staffMembers.email, email)).limit(1);
  if (isOwnerEmail(email)) {
    // STORE_OWNER_EMAIL is always an active admin.
    if (!staff) {
      [staff] = await db
        .insert(staffMembers)
        .values({ email, name: viewer.name, role: "admin", createdBy: "STORE_OWNER_EMAIL" })
        .onConflictDoNothing()
        .returning();
      staff ??= (await db.select().from(staffMembers).where(eq(staffMembers.email, email)).limit(1))[0];
    } else if (staff.role !== "admin" || !staff.active) {
      [staff] = await db
        .update(staffMembers)
        .set({ role: "admin", active: true })
        .where(eq(staffMembers.id, staff.id))
        .returning();
    }
  }
  return staff?.active ? staff : null;
});

export const isOwner = (s: Pick<Staff, "email">) => isOwnerEmail(s.email);

// ---------------------------------------------------------------- dashboard unlock

const DASH_COOKIE = "berrys_dash";
/** Hard cap even if the browser stays open. */
const DASH_MAX_HOURS = 12;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

/** After a correct password: unlocks the dashboard for this login + browser session. */
export async function unlockDashboard(staffId: string) {
  const loginHash = await currentSessionHash();
  if (!loginHash) throw new HttpError(401, "Please log in again.");
  const token = randomBytes(32).toString("base64url");
  const db = getDb();
  await db.insert(dashboardSessions).values({
    tokenHash: sha(token),
    staffId,
    loginTokenHash: loginHash,
    expiresAt: new Date(Date.now() + DASH_MAX_HOURS * 3_600_000),
  });
  await db.delete(dashboardSessions).where(lt(dashboardSessions.expiresAt, new Date()));
  await db.update(staffMembers).set({ lastSeenAt: new Date() }).where(eq(staffMembers.id, staffId));
  // No maxAge: a browser-session cookie, gone when the browser closes.
  (await cookies()).set(DASH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
}

export async function lockDashboard() {
  const jar = await cookies();
  const token = jar.get(DASH_COOKIE)?.value;
  if (token)
    await getDb()
      .delete(dashboardSessions)
      .where(eq(dashboardSessions.tokenHash, sha(token)));
  jar.set(DASH_COOKIE, "", { path: "/", maxAge: 0 });
}

async function isUnlocked(staffId: string) {
  const token = (await cookies()).get(DASH_COOKIE)?.value;
  const loginHash = await currentSessionHash();
  if (!token || !loginHash) return false;
  const [row] = await getDb()
    .select({ id: dashboardSessions.tokenHash })
    .from(dashboardSessions)
    .where(
      and(
        eq(dashboardSessions.tokenHash, sha(token)),
        eq(dashboardSessions.staffId, staffId),
        eq(dashboardSessions.loginTokenHash, loginHash),
        gt(dashboardSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return !!row;
}

export type DashboardContext = { staff: Staff; unlocked: boolean };

/**
 * Who may see the dashboard. Anyone who isn't active staff gets a 404
 * (the dashboard's existence isn't revealed).
 */
export const getDashboardContext = cache(async (): Promise<DashboardContext> => {
  const staff = await getStaffForViewer();
  if (!staff) notFound();
  return { staff, unlocked: !!staff.passwordHash && (await isUnlocked(staff.id)) };
});

/** For dashboard pages: unlocked staff with the permission, else 404 / redirect handled by layout. */
export async function requirePage(access?: Access) {
  const ctx = await getDashboardContext();
  if (!ctx.unlocked) notFound();
  if (access && !canAccess(ctx.staff, access)) notFound();
  return ctx.staff;
}

/** For server actions / API routes: throws HttpError instead of rendering 404. */
export async function requireAction(access?: Access) {
  const staff = await getStaffForViewer();
  if (!staff) throw new HttpError(404, "Not found");
  if (!staff.passwordHash || !(await isUnlocked(staff.id))) {
    throw new HttpError(401, "Your dashboard session has ended. Please unlock it again.");
  }
  if (access && !canAccess(staff, access)) {
    throw new HttpError(403, "You don’t have permission to do that.");
  }
  return staff;
}

export const actorName = (s: Pick<Staff, "email" | "name">) => s.email ?? s.name;

export async function logActivity(actor: string, action: string, target = "", details = "") {
  await getDb()
    .insert(activityLog)
    .values({ actor, action, target, details: details.slice(0, 2000) });
}
