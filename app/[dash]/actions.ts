"use server";
import { revalidatePath, updateTag } from "next/cache";
import { OFFERS_TAG } from "@/lib/offers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { deleteCustomer } from "@/lib/admin/insights";
import { after } from "next/server";
import {
  sendDashboardResetCode,
  sendRefundDecision,
  sendRefundProgress,
  sendRefundVerified,
  sendStatusUpdate,
  sendTeamRequest,
} from "@/lib/email";
import { decideRefundRequest, payRefundRequest, requestsForOrder, verifyRefundRequest } from "@/lib/refunds";
import { razorpayConfigured } from "@/lib/orders";
import { getSettings, updateSettings, type Settings } from "@/lib/settings";
import { clearErrors, logError } from "@/lib/error-log";
import { z, ZodError } from "zod";
import { getDb, schema } from "@/db";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import {
  accessModes,
  adminAreaKeys,
  errorSources,
  orderStatuses,
  permissionKeys,
  type AccessKey,
  type AccessMode,
  type ApprovalType,
  type ErrorSource,
} from "@/db/schema";
import * as cat from "@/lib/admin/catalog";
import * as ord from "@/lib/admin/orders";
import * as team from "@/lib/admin/team";
import { CATEGORIES_TAG, getCategories } from "@/lib/categories";
import {
  bannerFields,
  CONTENT_TAG,
  contentDefaults,
  helpDefault,
  resetContent,
  saveContent,
  type ContentKey,
} from "@/lib/content";
import { isOwnerEmail } from "@/lib/auth";
import { HttpError } from "@/lib/http-error";
import { rateLimit } from "@/lib/rate-limit";
import {
  accessSummary,
  actorName,
  adminHref,
  adminPath,
  can,
  canManageAdmins,
  getStaffForViewer,
  hashPassword,
  lockDashboard,
  logActivity,
  needsRehash,
  passwordProblem,
  requireAction,
  type Access,
  unlockDashboard,
  verifyPassword,
  type Staff,
} from "@/lib/staff";
import { isAllowedImageUrl, productSchema } from "@/lib/validation";
import { fromIndiaInput } from "@/lib/catalog";

/** `rowErrors`: for "add several" tables, the rows (by index) that couldn't be saved. */
export type ActionResult = { ok?: string; error?: string; at?: number; rowErrors?: Record<number, string> };

/** After any dashboard change: refresh the dashboard and the shared shop caches. */
const done = (ok: string): ActionResult => {
  revalidatePath(`/${adminPath()}`, "layout");
  updateTag(CATEGORIES_TAG);
  updateTag(CONTENT_TAG);
  updateTag(OFFERS_TAG);
  return { ok, at: Date.now() };
};

/** Runs an action with permission checks; turns errors into a message for the form. */
async function run(perm: Access | null, fn: (staff: Staff) => Promise<ActionResult>): Promise<ActionResult> {
  let who = "";
  try {
    const staff = await requireAction(perm ?? undefined);
    who = actorName(staff);
    const r = await fn(staff);
    // Every answer carries a time, so the form (and "Save all") always sees it as new.
    return { ...r, at: r.at ?? Date.now() };
  } catch (e) {
    if (e instanceof HttpError) return { error: e.message, at: Date.now() };
    if (e instanceof ZodError)
      return { error: e.issues[0]?.message ?? "Please check the form.", at: Date.now() };
    await logError("dashboard", e, { path: (await headers()).get("referer") ?? "", ref: who });
    return { error: "Something went wrong. Please try again.", at: Date.now() };
  }
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number.parseInt(str(f, k) || "0", 10);
const clientIp = async () => (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

// ---------------------------------------------------------------- unlock / password

/** First visit: create a password. Later visits: enter it. */
export async function unlockAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  try {
    const staff = await getStaffForViewer();
    if (!staff) throw new HttpError(404, "Not found");
    const password = String(f.get("password") ?? "");
    if (!staff.passwordHash) {
      const problem = passwordProblem(password);
      if (problem) return { error: problem };
      if (password !== String(f.get("confirm") ?? "")) return { error: "The two passwords don’t match." };
      await getDb()
        .update(schema.staffMembers)
        .set({ passwordHash: await hashPassword(password) })
        .where(eq(schema.staffMembers.id, staff.id));
      await logActivity(actorName(staff), "Created dashboard password");
    } else {
      await rateLimit("dash-unlock", staff.id, 5, 15 * 60);
      await rateLimit("dash-unlock-ip", await clientIp(), 20, 15 * 60);
      if (!(await verifyPassword(password, staff.passwordHash))) {
        await logActivity(actorName(staff), "Failed dashboard unlock");
        return { error: "That password is incorrect." };
      }
      // Transparently upgrade hashes made with an older, weaker cost.
      if (needsRehash(staff.passwordHash)) {
        await getDb()
          .update(schema.staffMembers)
          .set({ passwordHash: await hashPassword(password) })
          .where(eq(schema.staffMembers.id, staff.id));
      }
    }
    await unlockDashboard(staff.id);
    // Who got in, from where: lets the owner spot a stolen password in Activity.
    await logActivity(actorName(staff), "Unlocked dashboard", "", `IP ${await clientIp()}`);
    return done("Unlocked");
  } catch (e) {
    if (e instanceof HttpError) return { error: e.message };
    console.error(e);
    return { error: "Something went wrong. Please try again." };
  }
}

// ---------------------------------------------------------------- forgot password (code by email)

const RESET_MINUTES = 10;
const RESET_MAX_TRIES = 5;
const codeHash = (staffId: string, code: string) =>
  createHash("sha256").update(`${staffId}:${code}`).digest("hex");

/** Emails a 6-digit code to the person's own (already signed-in) Google address. */
export async function sendResetCodeAction(): Promise<ActionResult> {
  try {
    const staff = await getStaffForViewer();
    if (!staff?.email) throw new HttpError(404, "Not found");
    if (!(await getSettings()).dashboardPasswordReset)
      return { error: "Password reset by email is turned off. Ask an admin to reset it." };
    if (!staff.passwordHash) return { error: "You haven’t created a password yet." };
    await rateLimit("dash-reset-send", staff.id, 3, 15 * 60);
    await rateLimit("dash-reset-send-ip", await clientIp(), 10, 15 * 60);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await getDb()
      .update(schema.staffMembers)
      .set({
        resetCodeHash: codeHash(staff.id, code),
        resetCodeExpiresAt: new Date(Date.now() + RESET_MINUTES * 60_000),
        resetAttempts: 0,
      })
      .where(eq(schema.staffMembers.id, staff.id));
    await sendDashboardResetCode(staff.email, code);
    await logActivity(actorName(staff), "Requested dashboard password reset code");
    return {
      ok: `We emailed a 6-digit code to ${staff.email}. It expires in ${RESET_MINUTES} minutes.`,
      at: Date.now(),
    };
  } catch (e) {
    if (e instanceof HttpError) return { error: e.message, at: Date.now() };
    await logError("auth", e, { path: "dashboard reset code" });
    return { error: "We couldn’t send the code. Please try again or ask an admin.", at: Date.now() };
  }
}

/** Checks the emailed code, sets the new password and unlocks the dashboard. */
export async function resetWithCodeAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  try {
    const staff = await getStaffForViewer();
    if (!staff?.email) throw new HttpError(404, "Not found");
    if (!(await getSettings()).dashboardPasswordReset)
      return { error: "Password reset by email is turned off." };
    await rateLimit("dash-reset-verify", staff.id, 10, 15 * 60);
    const code = str(f, "code").replace(/\s+/g, "");
    const password = String(f.get("password") ?? "");
    const problem = passwordProblem(password);
    if (problem) return { error: problem, at: Date.now() };
    if (password !== String(f.get("confirm") ?? ""))
      return { error: "The two passwords don’t match.", at: Date.now() };

    // Count the attempt first (atomically), so guessing is capped even with parallel requests.
    const [row] = await getDb()
      .update(schema.staffMembers)
      .set({ resetAttempts: sql`${schema.staffMembers.resetAttempts} + 1` })
      .where(
        and(
          eq(schema.staffMembers.id, staff.id),
          gt(schema.staffMembers.resetCodeExpiresAt, new Date()),
          lt(schema.staffMembers.resetAttempts, RESET_MAX_TRIES),
        ),
      )
      .returning({ hash: schema.staffMembers.resetCodeHash });
    if (!row?.hash) return { error: "This code has expired. Ask for a new one.", at: Date.now() };
    const expected = Buffer.from(row.hash, "hex");
    const actual = Buffer.from(codeHash(staff.id, /^\d{6}$/.test(code) ? code : "x"), "hex");
    if (!timingSafeEqual(expected, actual)) {
      await logActivity(actorName(staff), "Wrong dashboard reset code");
      return { error: "That code is incorrect.", at: Date.now() };
    }

    await getDb()
      .update(schema.staffMembers)
      .set({
        passwordHash: await hashPassword(password),
        resetCodeHash: null,
        resetCodeExpiresAt: null,
        resetAttempts: 0,
      })
      .where(eq(schema.staffMembers.id, staff.id));
    // Sign out any other unlocked dashboards with the old password.
    await getDb().delete(schema.dashboardSessions).where(eq(schema.dashboardSessions.staffId, staff.id));
    await logActivity(actorName(staff), "Reset dashboard password with emailed code");
    await unlockDashboard(staff.id);
    return done("Password changed — welcome back.");
  } catch (e) {
    if (e instanceof HttpError) return { error: e.message, at: Date.now() };
    await logError("auth", e, { path: "dashboard reset" });
    return { error: "Something went wrong. Please try again.", at: Date.now() };
  }
}

export async function lockAction() {
  await lockDashboard();
  revalidatePath(`/${adminPath()}`, "layout");
}

export async function changePasswordAction(_: ActionResult, f: FormData) {
  return run(null, async (staff) => {
    if (!(await verifyPassword(String(f.get("current") ?? ""), staff.passwordHash))) {
      return { error: "Your current password is incorrect." };
    }
    const next = String(f.get("password") ?? "");
    const problem = passwordProblem(next);
    if (problem) return { error: problem };
    if (next !== String(f.get("confirm") ?? "")) return { error: "The two new passwords don’t match." };
    await getDb()
      .update(schema.staffMembers)
      .set({ passwordHash: await hashPassword(next) })
      .where(eq(schema.staffMembers.id, staff.id));
    await logActivity(actorName(staff), "Changed own dashboard password");
    return done("Password changed.");
  });
}

export async function myNotificationsAction(_: ActionResult, f: FormData) {
  return run(null, async (staff) => {
    if (isOwnerEmail(staff.email)) return { error: "The store owner address doesn’t get new-order emails." };
    const on = f.get("notifyOrders") === "on";
    await team.setNotifyOrders(staff.id, on);
    await logActivity(actorName(staff), on ? "Turned on new-order emails" : "Turned off new-order emails");
    return done(on ? "You’ll get an email for every new order." : "New-order emails turned off.");
  });
}

// ---------------------------------------------------------------- staff → admin requests

/** Saves a request for an admin and emails the admins who can approve it (and the owner). */
async function sendRequest(
  staff: Staff,
  type: ApprovalType,
  targetId: string,
  reason: string,
  amount?: number,
) {
  const req = await team.createRequest(type, targetId, reason, actorName(staff), amount);
  after(() => sendTeamRequest(req, staff.email));
}

// ---------------------------------------------------------------- orders

export async function orderStatusAction(_: ActionResult, f: FormData) {
  return run("orders", async (staff) => {
    const id = str(f, "orderId");
    const next = z.enum(orderStatuses).parse(str(f, "status"));
    const note = str(f, "note").slice(0, 500);
    await ord.setOrderStatus(id, next, actorName(staff), note);
    await logActivity(actorName(staff), `Order marked ${next}`, id);
    // Customer email (Settings → Emails), sent after the dashboard has its answer.
    after(() => sendStatusUpdate(id, next, note));
    return done(`Order marked as ${next}.`);
  });
}

export async function shippingAction(_: ActionResult, f: FormData) {
  return run("orders", async (staff) => {
    const id = str(f, "orderId");
    const trackingUrl = str(f, "trackingUrl");
    if (trackingUrl && !/^https:\/\/\S+$/.test(trackingUrl))
      return { error: "Tracking link must start with https://" };
    await ord.saveShipping(
      id,
      {
        courier: str(f, "courier").slice(0, 80),
        trackingNumber: str(f, "trackingNumber").slice(0, 80),
        trackingUrl: trackingUrl.slice(0, 500),
        staffNote: str(f, "staffNote").slice(0, 2000),
      },
      actorName(staff),
    );
    await logActivity(actorName(staff), "Updated shipping details", id);
    return done("Shipping details saved.");
  });
}

/** Refunds directly with the "refunds" permission; otherwise sends a request to admins. */
export async function refundAction(_: ActionResult, f: FormData) {
  return run("orders", async (staff) => {
    const id = str(f, "orderId");
    const reason = str(f, "reason").slice(0, 500);
    if (!reason) return { error: "Please give a reason." };
    // Empty = everything left on the order; a number = refund only that much (₹).
    const amount = str(f, "amount") ? num(f, "amount") : undefined;
    if (can(staff, "refunds")) {
      const refundId = await ord.refundAmount(id, actorName(staff), reason, { amount });
      const [o] = await getDb().select().from(schema.orders).where(eq(schema.orders.id, id)).limit(1);
      const full = o?.status === "refunded";
      await logActivity(
        actorName(staff),
        full ? "Refunded order" : "Refunded part of order",
        id,
        `${refundId}${amount ? ` — ₹${amount}` : ""} — ${reason}`,
      );
      // "On its way" (or "processed" right away for demo payments); Razorpay's webhook sends the rest.
      after(() => sendRefundProgress(refundId));
      return done(
        full
          ? `Refunded in full (${refundId}).`
          : `Refunded ₹${amount?.toLocaleString("en-IN")} (${refundId}).`,
      );
    }
    // No refund permission: ask an admin — for the whole order, or for an amount.
    if (amount !== undefined && (!Number.isInteger(amount) || amount < 1))
      return { error: "Enter an amount of at least ₹1, or leave it empty for a full refund." };
    await sendRequest(staff, "refund", id, reason, amount);
    await logActivity(actorName(staff), "Requested refund", id, `${amount ? `₹${amount} — ` : ""}${reason}`);
    return done(
      amount
        ? `Request to refund ₹${amount.toLocaleString("en-IN")} sent to an admin.`
        : "Refund request sent to an admin.",
    );
  });
}

/** With "Delete orders & customers" it's deleted straight away; otherwise a request goes to an admin. */
export async function deleteOrderAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  const id = str(f, "orderId");
  let deleted = false;
  const result = await run("orders", async (staff) => {
    const reason = str(f, "reason").slice(0, 500);
    if (can(staff, "delete_records")) {
      const o = await ord.deleteOrder(id, actorName(staff));
      await logActivity(actorName(staff), o.isDemo ? "Deleted demo order" : "Deleted order", id, reason);
      deleted = true;
      return done(`Order ${id} deleted.`);
    }
    if (!reason) return { error: "Please give a reason for the request." };
    await sendRequest(staff, "delete_order", id, reason);
    await logActivity(actorName(staff), "Requested order deletion", id, reason);
    return done("Delete request sent to an admin.");
  });
  // The order page no longer exists: go back to the list.
  if (deleted) redirect(adminHref("orders"));
  return result;
}

/** Admins: remove every expired / cancelled (never paid) order in one go. */
export async function deleteUnpaidOrdersAction() {
  return run("delete_records", async (staff) => {
    const n = await ord.deleteUnpaidOrders(actorName(staff));
    await logActivity(actorName(staff), "Deleted unpaid orders", "", `${n} expired/cancelled`);
    return done(
      n ? `Deleted ${n} expired or cancelled orders.` : "There were no expired or cancelled orders.",
    );
  });
}

// ---------------------------------------------------------------- customer refund requests

/** Staff (Orders permission): checked the reason → passed to an admin, with a recommendation. */
export async function verifyRefundRequestAction(_: ActionResult, f: FormData) {
  return run("orders", async (staff) => {
    const recommend = str(f, "recommend") === "reject" ? "Recommend: reject" : "Recommend: approve";
    const note = [recommend, str(f, "note").slice(0, 500)].filter(Boolean).join(" — ");
    const req = await verifyRefundRequest(str(f, "id"), actorName(staff), note);
    await logActivity(actorName(staff), "Accepted refund request (sent to admin)", req.orderId, note);
    const order = await orderRow(req.orderId);
    if (order) after(() => sendRefundVerified(order, req, staff.email));
    return done("Sent to an admin — they’ll approve and send the money, or reject it.");
  });
}

/** Admins: accept or reject. The customer is emailed either way. */
export async function decideRefundRequestAction(_: ActionResult, f: FormData) {
  return run("requests", async (staff) => {
    const decision = str(f, "decision") === "approve" ? "approved" : "rejected";
    const note = str(f, "note").slice(0, 500);
    if (decision === "rejected" && note.length < 3)
      return { error: "Please write a short reason for the customer." };
    const req = await decideRefundRequest(str(f, "id"), decision, actorName(staff), note);
    await logActivity(
      actorName(staff),
      decision === "approved" ? "Approved refund request" : "Rejected refund request",
      req.orderId,
      note,
    );
    const order = await orderRow(req.orderId);
    if (order) after(() => sendRefundDecision(order, req));
    if (decision === "rejected") return done("Refund rejected — the customer has been emailed.");
    const paid = await sendApprovedRefund(staff, req.id);
    return done(
      paid.ok
        ? `Refund approved and ₹${paid.amount.toLocaleString("en-IN")} sent back to the customer (${paid.refundId}). They’ve been emailed.`
        : `Refund approved and the customer emailed — but the money couldn’t be sent yet: ${paid.error} Use “Send refund now” to try again.`,
    );
  });
}

/** Pays an approved request; never throws — tells the caller what happened. */
async function sendApprovedRefund(staff: Staff, requestId: string) {
  try {
    const { refundId, amount } = await payRefundRequest(requestId, actorName(staff));
    // The approval email already says it's on its way; this one only if it's already processed.
    after(() => sendRefundProgress(refundId, { skipInitiated: true }));
    await logActivity(actorName(staff), "Sent approved refund", requestId, `₹${amount} · ${refundId}`);
    return { ok: true as const, refundId, amount };
  } catch (e) {
    return { ok: false as const, error: e instanceof HttpError ? e.message : "Please try again." };
  }
}

/** Approved but not paid (e.g. Razorpay wasn't connected): send the money now. */
export async function payRefundRequestAction(_: ActionResult, f: FormData) {
  return run("requests", async (staff) => {
    const paid = await sendApprovedRefund(staff, str(f, "id"));
    return paid.ok
      ? done(`₹${paid.amount.toLocaleString("en-IN")} sent back to the customer (${paid.refundId}).`)
      : { error: paid.error };
  });
}

const orderRow = async (id: string) =>
  (await getDb().select().from(schema.orders).where(eq(schema.orders.id, id)).limit(1))[0] ?? null;

// ---------------------------------------------------------------- customers

/** Admins only. Orders are kept for the records, without the account link. */
export async function deleteCustomerAction(_: ActionResult, f: FormData): Promise<ActionResult> {
  let deleted = false;
  const result = await run("delete_records", async (staff) => {
    const u = await deleteCustomer(str(f, "userId"));
    await logActivity(actorName(staff), "Deleted customer account", u.email ?? u.phone ?? u.id);
    deleted = true;
    return done("Customer account deleted.");
  });
  if (deleted) redirect(adminHref("customers"));
  return result;
}

// ---------------------------------------------------------------- products

export async function saveProductAction(_: ActionResult, f: FormData) {
  return run("products", async (staff) => {
    const input = productSchema.parse(JSON.parse(str(f, "payload") || "{}"));
    const id = await cat.saveProduct(input, actorName(staff));
    await logActivity(actorName(staff), input.id ? "Edited product" : "Added product", id, input.name);
    return done(input.id ? "Product saved." : `Product added (${id}).`);
  });
}

export async function productVisibilityAction(_: ActionResult, f: FormData) {
  return run("products", async (staff) => {
    const id = str(f, "id");
    const active = str(f, "active") === "true";
    await cat.setProductActive(id, active);
    await logActivity(actorName(staff), active ? "Showed product" : "Hid product", id);
    return done(active ? "Product is visible in the shop." : "Product hidden from the shop.");
  });
}

/** Deletes with the "delete_products" permission; otherwise sends a request to admins. */
export async function deleteProductAction(_: ActionResult, f: FormData) {
  return run("products", async (staff) => {
    const id = str(f, "id");
    const reason = str(f, "reason").slice(0, 500);
    if (can(staff, "delete_products")) {
      const name = await cat.deleteProduct(id);
      await logActivity(actorName(staff), "Deleted product", id, name);
      return done(`Deleted “${name}”.`);
    }
    if (!reason) return { error: "Please give a reason for the request." };
    await sendRequest(staff, "delete_product", id, reason);
    await logActivity(actorName(staff), "Requested product deletion", id, reason);
    return done("Delete request sent to an admin. You can hide the product meanwhile.");
  });
}

// ---------------------------------------------------------------- categories

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Category name is too short.").max(60),
  description: z.string().max(200),
  image: z.string().max(500),
  sizes: z.array(z.string().max(20)).min(1, "Add at least one size.").max(15),
  sortOrder: z.number().int().min(0).max(999),
  active: z.boolean(),
});
const sizeList = (s: string) => [
  ...new Set(
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  ),
];

export async function saveCategoryAction(_: ActionResult, f: FormData) {
  return run("categories", async (staff) => {
    const sizes = sizeList(str(f, "sizes"));
    const data = categorySchema.parse({
      id: str(f, "id") || undefined,
      name: str(f, "name"),
      description: str(f, "description"),
      image: str(f, "image"),
      sizes,
      sortOrder: num(f, "sortOrder"),
      active: f.get("active") === "on",
    });
    const c = await cat.saveCategory(data);
    await logActivity(actorName(staff), data.id ? "Edited category" : "Added category", c.name);
    return done("Category saved.");
  });
}

/** Deletes with the "delete_categories" permission; otherwise sends a request to admins. */
export async function deleteCategoryAction(_: ActionResult, f: FormData) {
  return run("categories", async (staff) => {
    const id = str(f, "id");
    const reason = str(f, "reason").slice(0, 500);
    if (can(staff, "delete_categories")) {
      const name = await cat.deleteCategory(id);
      await logActivity(actorName(staff), "Deleted category", name, reason);
      return done(`Deleted “${name}”.`);
    }
    if (!reason) return { error: "Please give a reason for the request." };
    await cat.assertCategoryDeletable(id);
    await sendRequest(staff, "delete_category", id, reason);
    await logActivity(actorName(staff), "Requested category deletion", id, reason);
    return done("Delete request sent to an admin. You can hide the category meanwhile.");
  });
}

// ---------------------------------------------------------------- offers

/** Checks an offer from the form (or an "add several" row); throws a message for the person. */
function offerInput(o: {
  id?: string;
  name: string;
  type: string;
  value: number;
  scope: string;
  targets: string[];
  startsAt: string;
  endsAt: string;
  active: boolean;
}) {
  const scope = z
    .enum(["all", "category", "product"], { message: "Choose what it applies to." })
    .parse(o.scope);
  const type = z.enum(["percent", "flat"], { message: "Choose % or ₹ off." }).parse(o.type);
  const value = o.value;
  if (!(value >= 1) || (type === "percent" && value > 90) || value > 100000)
    throw new HttpError(
      400,
      type === "percent" ? "Use a discount between 1 and 90%." : "Enter a valid ₹ amount.",
    );
  const targets = o.targets.filter(Boolean);
  if (scope !== "all" && !targets.length)
    throw new HttpError(400, "Choose at least one category or product.");
  // datetime-local inputs are India time (yyyy-MM-ddTHH:mm).
  const startsAt = fromIndiaInput(o.startsAt) ?? new Date();
  const endsAt = fromIndiaInput(o.endsAt);
  if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime())))
    throw new HttpError(400, "Check the dates.");
  if (endsAt && endsAt <= startsAt) throw new HttpError(400, "The end must be after the start.");
  const name = o.name.slice(0, 80);
  if (name.length < 2) throw new HttpError(400, "Give the offer a name (shown to customers).");
  return {
    id: o.id || undefined,
    name,
    type,
    value,
    scope,
    targets: scope === "all" ? [] : targets,
    startsAt,
    endsAt,
    active: o.active,
  };
}

export async function saveOfferAction(_: ActionResult, f: FormData) {
  return run("offers", async (staff) => {
    const data = offerInput({
      id: str(f, "id"),
      name: str(f, "name"),
      type: str(f, "type"),
      value: num(f, "value"),
      scope: str(f, "scope"),
      targets: f.getAll("targets").map(String),
      startsAt: str(f, "startsAt"),
      endsAt: str(f, "endsAt"),
      active: f.get("active") === "on",
    });
    // Products with their own sale price: replace / skip / both, chosen in the form.
    const decisions = z
      .record(z.string().max(100), z.enum(["replace", "skip", "both"]))
      .catch({})
      .parse(JSON.parse(str(f, "decisions") || "{}"));
    const { replaced } = await cat.saveOffer(data, decisions);
    await logActivity(
      actorName(staff),
      data.id ? "Edited offer" : "Created offer",
      data.name,
      Object.keys(decisions).length ? JSON.stringify(decisions) : "",
    );
    return done(
      replaced
        ? `Offer saved. It replaces the sale price of ${plural(replaced, "product")} while it runs — their sale price comes back when it ends.`
        : "Offer saved.",
    );
  });
}

export async function deleteOfferAction(_: ActionResult, f: FormData) {
  return run("offers", async (staff) => {
    await cat.deleteOffer(str(f, "id"));
    await logActivity(actorName(staff), "Deleted offer", str(f, "name"));
    return done("Offer deleted.");
  });
}

// ---------------------------------------------------------------- stock

export async function adjustStockAction(_: ActionResult, f: FormData) {
  return run("stock", async (staff) => {
    const change = num(f, "change");
    if (!change || Math.abs(change) > 100000)
      return { error: "Enter how many to add (or remove with a minus)." };
    const note = str(f, "note").slice(0, 200);
    await cat.adjustStock(str(f, "productId"), str(f, "size"), change, actorName(staff), note);
    await logActivity(
      actorName(staff),
      "Adjusted stock",
      `${str(f, "productId")} / ${str(f, "size")}`,
      `${change > 0 ? "+" : ""}${change} ${note}`,
    );
    return done("Stock updated.");
  });
}

// ---------------------------------------------------------------- content

/** One content block from its dashboard form, checked and trimmed (throws a message for the person). */
async function contentFromForm(f: FormData): Promise<{ key: string; value: Record<string, unknown> }> {
  const key = str(f, "key");
  if (key === "banners") {
    const cats = (await getCategories(false)).map((c) => c.name);
    const items = [];
    for (const i of [0, 1, 2]) {
      const b = Object.fromEntries(bannerFields.map((k) => [k, str(f, `b${i}_${k}`).slice(0, 300)]));
      if (b.category && !cats.includes(b.category))
        throw new HttpError(400, `Banner ${i + 1}: choose a valid category.`);
      if (b.image && !isAllowedImageUrl(b.image)) throw new HttpError(400, `Banner ${i + 1}: invalid image.`);
      if (b.productId && !(await cat.getAdminProduct(b.productId)))
        throw new HttpError(400, `Banner ${i + 1}: that product no longer exists.`);
      items.push(b);
    }
    return { key, value: { items } };
  }
  if (key === "homeSections") {
    const cats = new Set((await getCategories(false)).map((c) => c.name));
    const offerIds = new Set((await cat.listOffers()).map((o) => o.id));
    return {
      key,
      value: {
        shelfCategories: [...new Set(f.getAll("shelfCategories").map(String))].filter((c) => cats.has(c)),
        offers: [...new Set(f.getAll("offers").map(String))].filter((o) => offerIds.has(o)),
        offersTitle: str(f, "offersTitle").slice(0, 80) || contentDefaults.homeSections.offersTitle,
      },
    };
  }
  if (key === "announcement")
    return { key, value: { items: [0, 1, 2].map((i) => str(f, `item${i}`).slice(0, 120)) } };
  if (key in contentDefaults) {
    const fields = Object.keys(contentDefaults[key as ContentKey]);
    return { key, value: Object.fromEntries(fields.map((k) => [k, str(f, k).slice(0, 1000)])) };
  }
  if (key.startsWith("help:") && helpDefault(key.slice(5)))
    return {
      key,
      value: {
        title: str(f, "title").slice(0, 100),
        eyebrow: str(f, "eyebrow").slice(0, 60),
        body: str(f, "body").slice(0, 20000),
      },
    };
  throw new HttpError(400, "Unknown content block.");
}

export async function saveContentAction(_: ActionResult, f: FormData) {
  return run("content", async (staff) => {
    const { key, value } = await contentFromForm(f);
    await saveContent(key, value, actorName(staff));
    await logActivity(actorName(staff), "Edited website content", key);
    revalidatePath("/", "layout");
    return done("Saved — the website is updated.");
  });
}

export async function resetContentAction(_: ActionResult, f: FormData) {
  return run("content", async (staff) => {
    const key = str(f, "key");
    await resetContent(key);
    await logActivity(actorName(staff), "Reset website content", key);
    revalidatePath("/", "layout");
    return done("Restored the original text.");
  });
}

// ---------------------------------------------------------------- team (admins only)

/** Role, access mode and ticked access from the team form, made consistent. */
function accessFrom(f: FormData) {
  const role = z.enum(["admin", "staff"]).parse(str(f, "role"));
  const asked = z.enum(accessModes).catch("manual").parse(str(f, "accessMode"));
  const accessMode: AccessMode =
    role === "admin" ? (asked === "manual" ? "manual" : "full") : asked === "manual" ? "manual" : "default";
  const allowed: readonly string[] =
    role === "admin" ? [...permissionKeys, ...adminAreaKeys] : permissionKeys;
  const permissions =
    accessMode === "manual"
      ? [...new Set(f.getAll("permissions").map(String))].filter((p): p is AccessKey => allowed.includes(p))
      : [];
  return { role, accessMode, permissions };
}

/** Only the owner adds, changes or removes admins. */
function assertCanManage(staff: Staff, ...roles: string[]) {
  if (roles.includes("admin") && !canManageAdmins(staff))
    throw new HttpError(403, "Only the store owner can add or change admins.");
}

export async function updateStaffAction(_: ActionResult, f: FormData) {
  return run("team", async (staff) => {
    const id = str(f, "id");
    const current = await team.getStaff(id);
    const access = accessFrom(f);
    assertCanManage(staff, current.role, access.role);
    const s = await team.updateStaff(id, {
      ...access,
      active: f.get("active") === "on",
      name: str(f, "name").slice(0, 80),
      notifyOrders: f.get("notifyOrders") === "on",
    });
    await logActivity(
      actorName(staff),
      "Updated team member",
      s.email ?? s.id,
      `${access.role}: ${accessSummary(access)}${access.accessMode === "manual" ? ` — ${access.permissions.join(", ")}` : ""}`,
    );
    return done("Saved.");
  });
}

export async function resetStaffPasswordAction(_: ActionResult, f: FormData) {
  return run("team", async (staff) => {
    const id = str(f, "id");
    if (id !== staff.id) assertCanManage(staff, (await team.getStaff(id)).role);
    const s = await team.resetStaffPassword(id);
    await logActivity(actorName(staff), "Reset dashboard password", s.email ?? s.id);
    return done(`Password reset. ${s.email} will create a new one on their next visit.`);
  });
}

export async function removeStaffAction(_: ActionResult, f: FormData) {
  return run("team", async (staff) => {
    const id = str(f, "id");
    assertCanManage(staff, (await team.getStaff(id)).role);
    const s = await team.removeStaff(id);
    await logActivity(actorName(staff), "Removed team member", s.email ?? s.id);
    return done("Removed from the team.");
  });
}

/** Approve (and carry out) or reject one staff request. */
async function decideOne(staff: Staff, id: string, decision: "approved" | "rejected", note: string) {
  const req = await team.getRequest(id);
  if (!req || req.status !== "pending") throw new HttpError(409, "This request was already handled.");
  let refundRef = "";
  await team.decideRequest(req.id, decision, actorName(staff), note, async (r) =>
    r.type === "refund"
      ? // The amount asked for (or everything left), with the refund progress emails.
        (refundRef = await ord.refundAmount(r.targetId, actorName(staff), r.reason, {
          amount: r.amount ?? undefined,
        }))
      : r.type === "delete_order"
        ? ord.deleteOrder(r.targetId, actorName(staff))
        : r.type === "delete_category"
          ? cat.deleteCategory(r.targetId)
          : cat.deleteProduct(r.targetId),
  );
  if (decision === "approved" && refundRef) after(() => sendRefundProgress(refundRef));
  await logActivity(
    actorName(staff),
    `${decision === "approved" ? "Approved" : "Rejected"} ${req.type} request`,
    req.targetId,
    note,
  );
}

export async function decideRequestAction(_: ActionResult, f: FormData) {
  return run("requests", async (staff) => {
    const decision = str(f, "decision") === "approve" ? "approved" : "rejected";
    await decideOne(staff, str(f, "id"), decision, str(f, "note").slice(0, 500));
    return done(decision === "approved" ? "Approved and done." : "Request rejected.");
  });
}

// ---------------------------------------------------------------- settings (admins only)

const settingSections = {
  store: ["siteName", "tagline", "supportEmail", "supportPhone", "whatsapp", "storeAddress", "logoUrl"],
  social: ["instagram", "facebook", "youtube", "x", "pinterest"],
  seo: ["seoTitle", "seoDescription", "seoKeywords", "seoImage"],
  shipping: ["shippingFee", "freeShippingAbove", "returnDays"],
  emails: [
    "emailOrderStatus",
    "emailLoginAlert",
    "emailTeamNewOrder",
    "dashboardPasswordReset",
    "emailSignIn",
    "emailPrimary",
    "senderOrderStatus",
    "senderTeamNewOrder",
    "senderLoginAlert",
    "senderSignIn",
    "senderPasswordReset",
  ],
  emailLimit: ["emailDailyLimit", "resendDailyLimit"],
  maintenance: ["maintenance", "maintenanceMessage"],
  logs: ["errorLogDays"],
} as const satisfies Record<string, readonly (keyof Settings)[]>;
const booleanSettings = new Set<keyof Settings>([
  "emailOrderStatus",
  "emailLoginAlert",
  "emailTeamNewOrder",
  "dashboardPasswordReset",
  "emailSignIn",
  "maintenance",
]);

export async function saveSettingsAction(_: ActionResult, f: FormData) {
  return run("settings", async (staff) => {
    const section = str(f, "section") as keyof typeof settingSections;
    const keys = settingSections[section];
    if (!keys) return { error: "Unknown settings section." };
    const change: Record<string, unknown> = {};
    for (const k of keys) change[k] = booleanSettings.has(k) ? f.get(k) === "on" : str(f, k);
    for (const k of ["logoUrl", "seoImage"] as const) {
      if (typeof change[k] === "string" && change[k] && !isAllowedImageUrl(change[k] as string))
        return { error: "Please upload the image again." };
    }
    const before = await getSettings();
    await updateSettings(change as Partial<Settings>, actorName(staff));
    const changed = keys.filter((k) => String(before[k]) !== String(change[k]));
    await logActivity(actorName(staff), "Changed settings", section, changed.join(", "));
    revalidatePath("/", "layout");
    return done(
      section === "maintenance"
        ? change.maintenance
          ? "Maintenance mode is ON — customers now see the “back soon” page."
          : "Maintenance mode is off — the shop is open."
        : "Settings saved.",
    );
  });
}

/** Razorpay on/off. Off = demo payments for everyone (demo orders are deleted after a minute). */
export async function paymentModeAction(_: ActionResult, f: FormData) {
  return run("settings", async (staff) => {
    const mode: Settings["paymentMode"] = f.get("on") === "on" ? "razorpay" : "demo";
    await updateSettings({ paymentMode: mode }, actorName(staff));
    await logActivity(
      actorName(staff),
      mode === "razorpay" ? "Turned Razorpay on" : "Turned Razorpay off (demo payments on)",
    );
    revalidatePath("/", "layout");
    return done(
      mode === "demo"
        ? "Razorpay is OFF — demo payments are ON. Anyone can check out without paying; demo orders are deleted after 1 minute."
        : razorpayConfigured()
          ? "Razorpay payments are ON."
          : "Razorpay is ON, but its keys aren’t set yet — checkout stays closed until they are.",
    );
  });
}

/** Activity log: start fresh. Only the store owner (it's the record of what everyone did). */
export async function clearActivityAction() {
  return run("activity", async (staff) => {
    if (!canManageAdmins(staff)) return { error: "Only the store owner can clear the activity log." };
    const n = await team.clearActivity();
    // The clear itself is the first entry of the new log.
    await logActivity(actorName(staff), "Cleared activity log", "", `${n} entries removed`);
    return done(`Activity log cleared (${n} entries).`);
  });
}

export async function clearErrorsAction(_: ActionResult, f: FormData) {
  return run("errors", async (staff) => {
    const source = str(f, "source");
    const valid = (errorSources as readonly string[]).includes(source) ? (source as ErrorSource) : undefined;
    await clearErrors(valid);
    await logActivity(actorName(staff), "Cleared error log", valid ?? "all");
    return done("Error log cleared.");
  });
}

// ---------------------------------------------------------------- bulk: many at once

const MAX_BULK = 200;
const idsFrom = (f: FormData) => [...new Set(f.getAll("ids").map(String).filter(Boolean))].slice(0, MAX_BULK);

/** A readable message for one item that failed inside a bulk run (unexpected errors are logged). */
async function itemError(e: unknown, who: string) {
  if (e instanceof HttpError) return e.message;
  if (e instanceof ZodError) return e.issues[0]?.message ?? "Check this row.";
  await logError("dashboard", e, { path: (await headers()).get("referer") ?? "", ref: who });
  return "Something went wrong.";
}

/** Runs `fn` for every id; one failing doesn't stop the others. */
async function forEachId(staff: Staff, ids: string[], fn: (id: string) => Promise<unknown>) {
  let n = 0;
  const failed: string[] = [];
  for (const id of ids) {
    try {
      await fn(id);
      n++;
    } catch (e) {
      failed.push(`${id}: ${await itemError(e, actorName(staff))}`);
    }
  }
  return { n, failed };
}

/** "Done for 4. 1 not changed — X: reason." */
function bulkDone(r: { n: number; failed: string[] }, did: (n: number) => string): ActionResult {
  const more = r.failed.length > 3 ? ` (+${r.failed.length - 3} more)` : "";
  const why = r.failed.length
    ? `${r.failed.length} not changed — ${r.failed.slice(0, 3).join("; ")}${more}`
    : "";
  if (!r.n) return { error: why || "Nothing was selected.", at: Date.now() };
  return done(why ? `${did(r.n)} ${why}` : did(r.n));
}

const plural = (n: number, word: string) =>
  `${n} ${n === 1 ? word : word.endsWith("y") ? word.slice(0, -1) + "ies" : word + "s"}`;

/** Orders and Payments: move many orders to the next step, or delete them (or ask to). */
export async function bulkOrdersAction(_: ActionResult, f: FormData) {
  return run("orders", async (staff) => {
    const ids = idsFrom(f);
    const op = str(f, "op");
    const who = actorName(staff);
    if (op === "delete") {
      const direct = can(staff, "delete_records");
      const reason = str(f, "reason").slice(0, 500);
      if (!direct && !reason) return { error: "Please give a reason for the request.", at: Date.now() };
      const r = await forEachId(staff, ids, async (id) => {
        if (direct) {
          const o = await ord.deleteOrder(id, who);
          await logActivity(who, o.isDemo ? "Deleted demo order" : "Deleted order", id, reason);
        } else {
          await sendRequest(staff, "delete_order", id, reason);
          await logActivity(who, "Requested order deletion", id, reason);
        }
      });
      return bulkDone(r, (n) =>
        direct ? `Deleted ${plural(n, "order")}.` : `Sent ${plural(n, "delete request")} to an admin.`,
      );
    }
    const next = z.enum(["packed", "shipped", "delivered"]).parse(op);
    const r = await forEachId(staff, ids, async (id) => {
      await ord.setOrderStatus(id, next, who);
      await logActivity(who, `Order marked ${next}`, id, "bulk");
      after(() => sendStatusUpdate(id, next, ""));
    });
    return bulkDone(r, (n) => `Marked ${plural(n, "order")} as ${next}.`);
  });
}

export async function bulkProductsAction(_: ActionResult, f: FormData) {
  return run("products", async (staff) => {
    const ids = idsFrom(f);
    const op = z.enum(["show", "hide", "delete"]).parse(str(f, "op"));
    const who = actorName(staff);
    if (op === "delete") {
      const direct = can(staff, "delete_products");
      const reason = str(f, "reason").slice(0, 500);
      if (!direct && !reason) return { error: "Please give a reason for the request.", at: Date.now() };
      const r = await forEachId(staff, ids, async (id) => {
        if (direct) await logActivity(who, "Deleted product", id, await cat.deleteProduct(id));
        else {
          if (!(await cat.getAdminProduct(id))) throw new HttpError(404, "Product not found.");
          await sendRequest(staff, "delete_product", id, reason);
          await logActivity(who, "Requested product deletion", id, reason);
        }
      });
      return bulkDone(r, (n) =>
        direct ? `Deleted ${plural(n, "product")}.` : `Sent ${plural(n, "delete request")} to an admin.`,
      );
    }
    const active = op === "show";
    const r = await forEachId(staff, ids, async (id) => {
      await cat.setProductActive(id, active);
      await logActivity(who, active ? "Showed product" : "Hid product", id, "bulk");
    });
    return bulkDone(r, (n) => `${plural(n, "product")} ${active ? "visible in the shop" : "hidden"}.`);
  });
}

export async function bulkCategoriesAction(_: ActionResult, f: FormData) {
  return run("categories", async (staff) => {
    const ids = idsFrom(f);
    const op = z.enum(["show", "hide", "delete"]).parse(str(f, "op"));
    const who = actorName(staff);
    if (op === "delete") {
      const direct = can(staff, "delete_categories");
      const reason = str(f, "reason").slice(0, 500);
      if (!direct && !reason) return { error: "Please give a reason for the request.", at: Date.now() };
      const r = await forEachId(staff, ids, async (id) => {
        if (direct) await logActivity(who, "Deleted category", await cat.deleteCategory(id), reason);
        else {
          await cat.assertCategoryDeletable(id);
          await sendRequest(staff, "delete_category", id, reason);
          await logActivity(who, "Requested category deletion", id, reason);
        }
      });
      return bulkDone(r, (n) =>
        direct ? `Deleted ${plural(n, "category")}.` : `Sent ${plural(n, "delete request")} to an admin.`,
      );
    }
    const active = op === "show";
    const r = await forEachId(staff, ids, async (id) => {
      const name = await cat.setCategoryActive(id, active);
      await logActivity(who, active ? "Showed category" : "Hid category", name, "bulk");
    });
    return bulkDone(r, (n) => `${plural(n, "category")} ${active ? "shown in the shop" : "hidden"}.`);
  });
}

export async function bulkOffersAction(_: ActionResult, f: FormData) {
  return run("offers", async (staff) => {
    const ids = idsFrom(f);
    const op = z.enum(["on", "off", "delete"]).parse(str(f, "op"));
    const who = actorName(staff);
    const r = await forEachId(staff, ids, async (id) => {
      if (op === "delete") {
        await cat.deleteOffer(id);
        await logActivity(who, "Deleted offer", id, "bulk");
      } else {
        const name = await cat.setOfferActive(id, op === "on");
        await logActivity(who, op === "on" ? "Turned offer on" : "Turned offer off", name, "bulk");
      }
    });
    return bulkDone(r, (n) =>
      op === "delete" ? `Deleted ${plural(n, "offer")}.` : `${plural(n, "offer")} turned ${op}.`,
    );
  });
}

/** Stock: ids are "productId|size". Add (or remove) the same amount, or mark sold out. */
export async function bulkStockAction(_: ActionResult, f: FormData) {
  return run("stock", async (staff) => {
    const op = z.enum(["add", "soldout"]).parse(str(f, "op"));
    const amount = num(f, "amount");
    if (op === "add" && (!amount || Math.abs(amount) > 100000))
      return { error: "Enter how many to add (or remove with a minus).", at: Date.now() };
    const who = actorName(staff);
    const r = await forEachId(staff, idsFrom(f), async (key) => {
      const at = key.indexOf("|");
      const [productId, size] = [key.slice(0, at), key.slice(at + 1)];
      if (at < 1 || !size) throw new HttpError(400, "Unknown row.");
      const change = op === "add" ? amount : -(await cat.stockOf(productId, size));
      if (!change) return;
      await cat.adjustStock(productId, size, change, who, op === "add" ? "Bulk update" : "Marked sold out");
      await logActivity(
        who,
        "Adjusted stock",
        `${productId} / ${size}`,
        `${change > 0 ? "+" : ""}${change} (bulk)`,
      );
    });
    return bulkDone(r, (n) => `Updated stock for ${plural(n, "size")}.`);
  });
}

export async function bulkCustomersAction(_: ActionResult, f: FormData) {
  return run("delete_records", async (staff) => {
    z.literal("delete").parse(str(f, "op"));
    const r = await forEachId(staff, idsFrom(f), async (id) => {
      const u = await deleteCustomer(id);
      await logActivity(actorName(staff), "Deleted customer account", u.email ?? u.phone ?? u.id, "bulk");
    });
    return bulkDone(r, (n) => `Deleted ${plural(n, "customer account")}.`);
  });
}

export async function bulkRequestsAction(_: ActionResult, f: FormData) {
  return run("requests", async (staff) => {
    const decision =
      z.enum(["approve", "reject"]).parse(str(f, "op")) === "approve" ? "approved" : "rejected";
    const note = str(f, "note").slice(0, 500);
    const r = await forEachId(staff, idsFrom(f), (id) => decideOne(staff, id, decision, note));
    return bulkDone(
      r,
      (n) => `${decision === "approved" ? "Approved" : "Rejected"} ${plural(n, "request")}.`,
    );
  });
}

const teamOpDone = {
  enable: "enabled",
  disable: "disabled",
  notify_on: "will get new-order emails",
  notify_off: "won’t get new-order emails",
  remove: "removed",
} as const;

export async function bulkTeamAction(_: ActionResult, f: FormData) {
  return run("team", async (staff) => {
    const op = z.enum(["enable", "disable", "notify_on", "notify_off", "remove"]).parse(str(f, "op"));
    const who = actorName(staff);
    const r = await forEachId(staff, idsFrom(f), async (id) => {
      const s = await team.getStaff(id);
      const label = s.email ?? s.id;
      if (isOwnerEmail(s.email)) throw new HttpError(400, "The store owner can’t be changed.");
      assertCanManage(staff, s.role);
      if (s.id === staff.id && (op === "disable" || op === "remove"))
        throw new HttpError(400, "You can’t disable or remove yourself.");
      if (op === "remove") {
        await team.removeStaff(id);
        await logActivity(who, "Removed team member", label, "bulk");
      } else if (op === "notify_on" || op === "notify_off") {
        await team.setNotifyOrders(id, op === "notify_on");
        await logActivity(
          who,
          op === "notify_on" ? "Turned on new-order emails" : "Turned off new-order emails",
          label,
          "bulk",
        );
      } else {
        const { role, accessMode, permissions, name, notifyOrders } = s;
        await team.updateStaff(id, {
          role,
          accessMode,
          permissions,
          name,
          notifyOrders,
          active: op === "enable",
        });
        await logActivity(
          who,
          op === "enable" ? "Enabled team member" : "Disabled team member",
          label,
          "bulk",
        );
      }
    });
    return bulkDone(r, (n) => `${plural(n, "team member")} ${teamOpDone[op]}.`);
  });
}

// ---------------------------------------------------------------- add several: one "Save all"

const MAX_ROWS = 100;
type RowIn = Record<string, unknown>;
const rowsFrom = (f: FormData): RowIn[] => {
  let v: unknown;
  try {
    v = JSON.parse(str(f, "rows") || "[]");
  } catch {
    throw new HttpError(400, "Nothing to save.");
  }
  if (!Array.isArray(v)) throw new HttpError(400, "Nothing to save.");
  if (v.length > MAX_ROWS) throw new HttpError(400, `Up to ${MAX_ROWS} rows at a time.`);
  return v.filter((r): r is RowIn => !!r && typeof r === "object");
};
const rs = (r: RowIn, k: string) => String(r[k] ?? "").trim();
const rn = (r: RowIn, k: string) => Number.parseInt(rs(r, k) || "0", 10) || 0;
/** A multi-choice / several-photos cell: one value per line. */
const rl = (r: RowIn, k: string) =>
  rs(r, k)
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

/** Saves each row; answers which rows (by index) failed so they stay on screen. */
async function eachRow(
  staff: Staff,
  rows: RowIn[],
  fn: (r: RowIn) => Promise<unknown>,
  did: (n: number) => string,
): Promise<ActionResult> {
  if (!rows.length) return { error: "Fill in at least one row.", at: Date.now() };
  const rowErrors: Record<number, string> = {};
  let n = 0;
  for (const [i, r] of rows.entries()) {
    try {
      await fn(r);
      n++;
    } catch (e) {
      rowErrors[i] = await itemError(e, actorName(staff));
    }
  }
  const bad = Object.keys(rowErrors).length;
  if (!n)
    return {
      error: bad === 1 ? Object.values(rowErrors)[0] : `None saved — fix the ${bad} rows marked in red.`,
      rowErrors,
      at: Date.now(),
    };
  const res = done(bad ? `${did(n)} ${bad} still to fix (marked in red).` : did(n));
  return bad ? { ...res, rowErrors } : res;
}

export async function addCategoriesAction(_: ActionResult, f: FormData) {
  return run("categories", async (staff) =>
    eachRow(
      staff,
      rowsFrom(f),
      async (r) => {
        const data = categorySchema.parse({
          name: rs(r, "name"),
          description: rs(r, "description").slice(0, 200),
          image: "",
          sizes: sizeList(rs(r, "sizes")),
          sortOrder: rn(r, "sortOrder"),
          active: r.active !== false,
        });
        const c = await cat.saveCategory(data);
        await logActivity(actorName(staff), "Added category", c.name);
      },
      (n) => `Added ${plural(n, "category")}.`,
    ),
  );
}

export async function addProductsAction(_: ActionResult, f: FormData) {
  return run("products", async (staff) => {
    const cats = await getCategories(false);
    return eachRow(
      staff,
      rowsFrom(f),
      async (r) => {
        const c = cats.find((x) => x.name === rs(r, "category"));
        if (!c) throw new HttpError(400, "Choose a category.");
        const price = rn(r, "price");
        // "S=3" lines: stock for each size of the category (missing sizes start at 0).
        const counts = Object.fromEntries(
          rl(r, "stock").map((l) => {
            const at = l.lastIndexOf("=");
            return [l.slice(0, at), Number.parseInt(l.slice(at + 1), 10) || 0];
          }),
        );
        const input = productSchema.parse({
          name: rs(r, "name"),
          category: c.name,
          gender: rs(r, "gender") || "unisex",
          price,
          salePrice: rn(r, "salePrice"),
          saleStartsAt: rs(r, "saleStartsAt"),
          saleEndsAt: rs(r, "saleEndsAt"),
          images: rl(r, "images"),
          description: rs(r, "description").slice(0, 5000),
          tags: rs(r, "tags")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          badge: rs(r, "badge"),
          color: "#e9dccf",
          active: r.active !== false,
          stock: Object.fromEntries(c.sizes.map((s) => [s, Math.max(0, counts[s] ?? 0)])),
        });
        const id = await cat.saveProduct(input, actorName(staff));
        await logActivity(actorName(staff), "Added product", id, input.name);
      },
      (n) => `Added ${plural(n, "product")}.`,
    );
  });
}

export async function addStockRowsAction(_: ActionResult, f: FormData) {
  return run("stock", async (staff) =>
    eachRow(
      staff,
      rowsFrom(f),
      async (r) => {
        const productId = rs(r, "productId");
        const size = rs(r, "size");
        const change = rn(r, "change");
        const note = rs(r, "note").slice(0, 200);
        if (!productId) throw new HttpError(400, "Choose a product.");
        if (!size) throw new HttpError(400, "Choose a size.");
        if (!change || Math.abs(change) > 100000)
          throw new HttpError(400, "Enter how many to add (or remove with a minus).");
        await cat.adjustStock(productId, size, change, actorName(staff), note);
        await logActivity(
          actorName(staff),
          "Adjusted stock",
          `${productId} / ${size}`,
          `${change > 0 ? "+" : ""}${change} ${note}`,
        );
      },
      (n) => `Saved ${plural(n, "stock change")}.`,
    ),
  );
}

export async function addStaffRowsAction(_: ActionResult, f: FormData) {
  return run("team", async (staff) =>
    eachRow(
      staff,
      rowsFrom(f),
      async (r) => {
        const email = z
          .string()
          .trim()
          .toLowerCase()
          .email("Enter a valid Google email.")
          .parse(rs(r, "email"));
        const role = z.enum(["admin", "staff"]).catch("staff").parse(rs(r, "role"));
        assertCanManage(staff, role);
        // Empty or "default"/"full" = the role's standard access; "manual" = only the ticked items.
        const manual = rs(r, "access") === "manual";
        const allowed: readonly string[] =
          role === "admin" ? [...permissionKeys, ...adminAreaKeys] : permissionKeys;
        const access = {
          role,
          accessMode: (manual ? "manual" : role === "admin" ? "full" : "default") as AccessMode,
          permissions: manual ? rl(r, "permissions").filter((k): k is AccessKey => allowed.includes(k)) : [],
        };
        if (manual && !access.permissions.length)
          throw new HttpError(400, "Tick at least one thing they can use.");
        await team.addStaff(
          email,
          { ...access, active: r.active !== false, notifyOrders: r.notifyOrders !== false },
          actorName(staff),
        );
        await logActivity(actorName(staff), `Added ${role}`, email, accessSummary(access));
      },
      (n) =>
        `Added ${plural(n, "team member")}. They log in with Google and create their dashboard password.`,
    ),
  );
}

// ---------------------------------------------------------------- customer refund requests, many at once

type RefundOp = "approve" | "reject" | "verify_approve" | "verify_reject";

/**
 * One step on one customer refund request, with the same rules as the single buttons:
 * approvers ("requests") approve or reject (the customer is emailed, rejecting needs a note);
 * staff with Orders verify with a recommendation for the admin.
 */
async function refundStep(staff: Staff, requestId: string, op: RefundOp, note: string) {
  const who = actorName(staff);
  if (op === "approve" || op === "reject") {
    if (!can(staff, "requests"))
      throw new HttpError(403, "Only admins who handle requests can decide refunds.");
    const decision = op === "approve" ? "approved" : "rejected";
    const req = await decideRefundRequest(requestId, decision, who, note);
    await logActivity(
      who,
      decision === "approved" ? "Approved refund request" : "Rejected refund request",
      req.orderId,
      note,
    );
    const order = await orderRow(req.orderId);
    if (order) after(() => sendRefundDecision(order, req));
    if (decision === "approved") {
      const paid = await sendApprovedRefund(staff, req.id);
      if (!paid.ok) throw new HttpError(502, `approved, but not paid yet — ${paid.error}`);
    }
    return;
  }
  const full = [op === "verify_reject" ? "Recommend: reject" : "Recommend: approve", note]
    .filter(Boolean)
    .join(" — ");
  const req = await verifyRefundRequest(requestId, who, full);
  await logActivity(who, "Accepted refund request (sent to admin)", req.orderId, full);
  const order = await orderRow(req.orderId);
  if (order) after(() => sendRefundVerified(order, req, staff.email));
}

const refundOpDone: Record<RefundOp, string> = {
  approve: "Approved and paid {n} — each customer has been emailed.",
  reject: "Rejected {n} — each customer has been emailed.",
  verify_approve: "Accepted {n} and sent to an admin to send the money.",
  verify_reject: "Sent {n} to an admin, marked not valid.",
};

function refundOpFrom(f: FormData) {
  const op = z
    .enum(["approve", "reject", "verify_approve", "verify_reject"], { message: "Choose what to do." })
    .parse(str(f, "op"));
  const note = str(f, "note").slice(0, 500);
  if (op === "reject" && note.length < 3)
    throw new HttpError(400, "Write a short reason for the customers (sent to each of them).");
  return { op, note };
}

/** Requests page: approve or reject many customer refund requests (ids are refund request ids). */
export async function bulkRefundRequestsAction(_: ActionResult, f: FormData) {
  return run("requests", async (staff) => {
    const { op, note } = refundOpFrom(f);
    const r = await forEachId(staff, idsFrom(f), (id) => refundStep(staff, id, op, note));
    return bulkDone(r, (n) => refundOpDone[op].replace("{n}", plural(n, "refund request")));
  });
}

/** Orders page (refund requests filter): ids are order ids; acts on each order's open refund request. */
export async function bulkOrderRefundsAction(_: ActionResult, f: FormData) {
  return run("orders", async (staff) => {
    const { op, note } = refundOpFrom(f);
    const r = await forEachId(staff, idsFrom(f), async (orderId) => {
      const open = (await requestsForOrder(orderId)).find((x) =>
        op.startsWith("verify")
          ? x.status === "requested"
          : x.status === "requested" || x.status === "verified",
      );
      if (!open)
        throw new HttpError(
          409,
          op.startsWith("verify") ? "No refund request waiting to be verified." : "No open refund request.",
        );
      await refundStep(staff, open.id, op, note);
    });
    return bulkDone(r, (n) => refundOpDone[op].replace("{n}", plural(n, "refund request")));
  });
}

// ---------------------------------------------------------------- products' own sale prices

/** Change or switch off a product's sale price from the Offers page (the same row the product uses). */
export async function saveSalePriceAction(_: ActionResult, f: FormData) {
  return run("offers", async (staff) => {
    const startsAt = fromIndiaInput(str(f, "startsAt")) ?? new Date();
    const endsAt = fromIndiaInput(str(f, "endsAt"));
    if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime())))
      return { error: "Check the dates." };
    if (endsAt && endsAt <= startsAt) return { error: "The sale must end after it starts." };
    const name = await cat.saveSalePrice(str(f, "id"), {
      value: num(f, "value"),
      startsAt,
      endsAt,
      active: f.get("active") === "on",
    });
    await logActivity(actorName(staff), "Changed sale price", name, `₹${num(f, "value")}`);
    return done("Sale price saved.");
  });
}
