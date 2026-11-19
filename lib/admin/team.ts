import "server-only";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Permission, StaffRole } from "@/db/schema";
import { isOwnerEmail } from "@/lib/auth";
import { HttpError } from "@/lib/http-error";

const { staffMembers, approvalRequests, activityLog, dashboardSessions } = schema;
export const PAGE_SIZE = 25;

export async function listStaff() {
  return getDb().select().from(staffMembers).orderBy(desc(staffMembers.role), staffMembers.email);
}

export async function addStaff(email: string, role: StaffRole, permissions: Permission[], by: string) {
  try {
    const [s] = await getDb()
      .insert(staffMembers)
      .values({
        email: email.toLowerCase(),
        role,
        permissions: role === "admin" ? [] : permissions,
        createdBy: by,
      })
      .returning();
    return s;
  } catch (e) {
    const code = (e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
    if (code === "23505") throw new HttpError(409, "That email is already on the team.");
    throw e;
  }
}

async function guardOwnerAndLastAdmin(
  id: string,
  change: { role?: StaffRole; active?: boolean; remove?: boolean },
) {
  const db = getDb();
  const [s] = await db.select().from(staffMembers).where(eq(staffMembers.id, id)).limit(1);
  if (!s) throw new HttpError(404, "Team member not found.");
  const demoting = change.remove || change.active === false || (change.role && change.role !== "admin");
  if (demoting && isOwnerEmail(s.email))
    throw new HttpError(400, "The store owner (STORE_OWNER_EMAIL) is always an admin.");
  if (demoting && s.role === "admin") {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(staffMembers)
      .where(and(eq(staffMembers.role, "admin"), eq(staffMembers.active, true), ne(staffMembers.id, id)));
    if (n === 0) throw new HttpError(400, "There must always be at least one active admin.");
  }
  return s;
}

export async function updateStaff(
  id: string,
  data: { role: StaffRole; permissions: Permission[]; active: boolean; name: string },
) {
  const s = await guardOwnerAndLastAdmin(id, data);
  await getDb()
    .update(staffMembers)
    .set({ ...data, permissions: data.role === "admin" ? [] : data.permissions })
    .where(eq(staffMembers.id, id));
  // Deactivated or changed: end their open dashboard sessions.
  if (!data.active || data.role !== s.role)
    await getDb().delete(dashboardSessions).where(eq(dashboardSessions.staffId, id));
  return s;
}

/** Clears the password: they'll be asked to create a new one on next entry. */
export async function resetStaffPassword(id: string) {
  const [s] = await getDb()
    .update(staffMembers)
    .set({ passwordHash: null })
    .where(eq(staffMembers.id, id))
    .returning();
  if (!s) throw new HttpError(404, "Team member not found.");
  await getDb().delete(dashboardSessions).where(eq(dashboardSessions.staffId, id));
  return s;
}

export async function removeStaff(id: string) {
  const s = await guardOwnerAndLastAdmin(id, { remove: true });
  await getDb().delete(staffMembers).where(eq(staffMembers.id, id));
  return s;
}

// ---------------------------------------------------------------- approval requests

export async function createRequest(
  type: "refund" | "delete_product",
  targetId: string,
  reason: string,
  by: string,
) {
  const db = getDb();
  const [open] = await db
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.type, type),
        eq(approvalRequests.targetId, targetId),
        eq(approvalRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (open) throw new HttpError(409, "A request for this is already waiting for an admin.");
  await db.insert(approvalRequests).values({ type, targetId, reason, requestedBy: by });
}

export async function listRequests(status: "pending" | "decided", page: number) {
  const where =
    status === "pending" ? eq(approvalRequests.status, "pending") : ne(approvalRequests.status, "pending");
  const db = getDb();
  const [[{ total }], rows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(approvalRequests)
      .where(where),
    db
      .select()
      .from(approvalRequests)
      .where(where)
      .orderBy(desc(approvalRequests.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function pendingRequestCount() {
  const [{ n }] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(approvalRequests)
    .where(eq(approvalRequests.status, "pending"));
  return n;
}

export async function getRequest(id: string) {
  const [r] = await getDb().select().from(approvalRequests).where(eq(approvalRequests.id, id)).limit(1);
  return r ?? null;
}

/**
 * Decide a request exactly once. The request is claimed first ("processing"),
 * so if two admins approve at the same moment only one carries it out.
 * `perform` runs the approved action; if it fails, the request goes back to pending.
 */
export async function decideRequest(
  id: string,
  status: "approved" | "rejected",
  by: string,
  note: string,
  perform?: (req: typeof approvalRequests.$inferSelect) => Promise<unknown>,
) {
  const db = getDb();
  const [claimed] = await db
    .update(approvalRequests)
    .set({ status: "processing", decidedBy: by })
    .where(and(eq(approvalRequests.id, id), eq(approvalRequests.status, "pending")))
    .returning();
  if (!claimed) throw new HttpError(409, "This request was already handled.");
  try {
    if (status === "approved" && perform) await perform(claimed);
  } catch (e) {
    await db
      .update(approvalRequests)
      .set({ status: "pending", decidedBy: null })
      .where(and(eq(approvalRequests.id, id), eq(approvalRequests.status, "processing")));
    throw e;
  }
  const [r] = await db
    .update(approvalRequests)
    .set({ status, decisionNote: note, decidedAt: new Date() })
    .where(eq(approvalRequests.id, id))
    .returning();
  return r;
}

// ---------------------------------------------------------------- activity

export async function listActivity(page: number) {
  const db = getDb();
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(activityLog),
    db
      .select()
      .from(activityLog)
      .orderBy(desc(activityLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);
  return { rows, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
