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
  sendRefundVerified,
  sendStatusUpdate,
  sendTeamRequest,
} from "@/lib/email";
import { decideRefundRequest, verifyRefundRequest } from "@/lib/refunds";
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

export type ActionResult = { ok?: string; error?: string; at?: number };

/** After any dashboard change: refresh the dashboard and the shared shop caches. */
const done = (ok: string): ActionResult => {
  revalidatePath(`/${adminPath()}`, "layout");
  updateTag(CATEGORIES_TAG);
  updateTag(CONTENT_TAG);
  updateTag(OFFERS_TAG);
  return { ok, at: Date.now() };
};

/** Runs an action with permission checks; turns errors into a message for the form. */
async function run(perm: Access | null, fn: (staff: Staff) => Promise<ActionResult>) {
  let who = "";
  try {
    const staff = await requireAction(perm ?? undefined);
    who = actorName(staff);
    return await fn(staff);
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
async function sendRequest(staff: Staff, type: ApprovalType, targetId: string, reason: string) {
  const req = await team.createRequest(type, targetId, reason, actorName(staff));
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
    if (can(staff, "refunds")) {
      const refundId = await ord.refundOrder(id, actorName(staff), reason);
      await logActivity(actorName(staff), "Refunded order", id, `${refundId} — ${reason}`);
      after(() => sendStatusUpdate(id, "refunded"));
      return done(`Refunded (${refundId}).`);
    }
    await sendRequest(staff, "refund", id, reason);
    await logActivity(actorName(staff), "Requested refund", id, reason);
    return done("Refund request sent to an admin.");
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
    await logActivity(actorName(staff), "Verified refund request", req.orderId, note);
    const order = await orderRow(req.orderId);
    if (order) after(() => sendRefundVerified(order, req, staff.email));
    return done("Verified — an admin has been asked to approve it.");
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
    return done(
      decision === "approved"
        ? "Refund approved — the customer has been emailed. Send the money back from this order once Razorpay is connected."
        : "Refund rejected — the customer has been emailed.",
    );
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

export async function saveCategoryAction(_: ActionResult, f: FormData) {
  return run("categories", async (staff) => {
    const sizes = [
      ...new Set(
        str(f, "sizes")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    const data = z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(2, "Category name is too short.").max(60),
        description: z.string().max(200),
        image: z.string().max(500),
        sizes: z.array(z.string().max(20)).min(1, "Add at least one size.").max(15),
        sortOrder: z.number().int().min(0).max(999),
        active: z.boolean(),
      })
      .parse({
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

export async function saveOfferAction(_: ActionResult, f: FormData) {
  return run("offers", async (staff) => {
    const scope = z.enum(["all", "category", "product"]).parse(str(f, "scope"));
    const type = z.enum(["percent", "flat"]).parse(str(f, "type"));
    const value = num(f, "value");
    if (value < 1 || (type === "percent" && value > 90) || value > 100000) {
      return { error: type === "percent" ? "Use a discount between 1 and 90%." : "Enter a valid ₹ amount." };
    }
    const targets = f.getAll("targets").map(String).filter(Boolean);
    if (scope !== "all" && !targets.length) return { error: "Choose at least one category or product." };
    // datetime-local inputs are India time (yyyy-MM-ddTHH:mm).
    const ist = (v: string) =>
      new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? `${v}:00+05:30` : "invalid");
    const startsAt = str(f, "startsAt") ? ist(str(f, "startsAt")) : new Date();
    const endsAt = str(f, "endsAt") ? ist(str(f, "endsAt")) : null;
    if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime())))
      return { error: "Check the dates." };
    if (endsAt && endsAt <= startsAt) return { error: "The end must be after the start." };
    const name = str(f, "name").slice(0, 80);
    if (name.length < 2) return { error: "Give the offer a name (shown to customers)." };
    await cat.saveOffer({
      id: str(f, "id") || undefined,
      name,
      type,
      value,
      scope,
      targets: scope === "all" ? [] : targets,
      startsAt,
      endsAt,
      active: f.get("active") === "on",
    });
    await logActivity(actorName(staff), str(f, "id") ? "Edited offer" : "Created offer", name);
    return done("Offer saved.");
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

export async function saveContentAction(_: ActionResult, f: FormData) {
  return run("content", async (staff) => {
    const key = str(f, "key");
    let value: Record<string, unknown>;
    if (key === "banners") {
      const cats = (await getCategories(false)).map((c) => c.name);
      const items = [];
      for (const i of [0, 1, 2]) {
        const b = Object.fromEntries(bannerFields.map((k) => [k, str(f, `b${i}_${k}`).slice(0, 300)]));
        if (b.category && !cats.includes(b.category))
          return { error: `Banner ${i + 1}: choose a valid category.` };
        if (b.image && !isAllowedImageUrl(b.image)) return { error: `Banner ${i + 1}: invalid image.` };
        if (b.productId && !(await cat.getAdminProduct(b.productId))) {
          return { error: `Banner ${i + 1}: that product no longer exists.` };
        }
        items.push(b);
      }
      value = { items };
    } else if (key === "announcement") {
      value = { items: [0, 1, 2].map((i) => str(f, `item${i}`).slice(0, 120)) };
    } else if (key in contentDefaults) {
      const fields = Object.keys(contentDefaults[key as ContentKey]);
      value = Object.fromEntries(fields.map((k) => [k, str(f, k).slice(0, 1000)]));
    } else if (key.startsWith("help:") && helpDefault(key.slice(5))) {
      value = {
        title: str(f, "title").slice(0, 100),
        eyebrow: str(f, "eyebrow").slice(0, 60),
        body: str(f, "body").slice(0, 20000),
      };
    } else {
      return { error: "Unknown content block." };
    }
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

export async function addStaffAction(_: ActionResult, f: FormData) {
  return run("team", async (staff) => {
    const email = z.string().trim().toLowerCase().email("Enter a valid Google email.").parse(str(f, "email"));
    const access = accessFrom(f);
    assertCanManage(staff, access.role);
    await team.addStaff(
      email,
      { ...access, active: f.get("active") === "on", notifyOrders: f.get("notifyOrders") === "on" },
      actorName(staff),
    );
    await logActivity(actorName(staff), `Added ${access.role}`, email, accessSummary(access));
    return done(`${email} added. They log in with that Google account and create their dashboard password.`);
  });
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

/** Approve (and carry out) or reject a staff request. */
export async function decideRequestAction(_: ActionResult, f: FormData) {
  return run("requests", async (staff) => {
    const req = await team.getRequest(str(f, "id"));
    if (!req || req.status !== "pending") return { error: "This request was already handled." };
    const decision = str(f, "decision") === "approve" ? "approved" : "rejected";
    const note = str(f, "note").slice(0, 500);
    await team.decideRequest(req.id, decision, actorName(staff), note, (r) =>
      r.type === "refund"
        ? ord.refundOrder(r.targetId, actorName(staff), r.reason)
        : r.type === "delete_order"
          ? ord.deleteOrder(r.targetId, actorName(staff))
          : r.type === "delete_category"
            ? cat.deleteCategory(r.targetId)
            : cat.deleteProduct(r.targetId),
    );
    if (decision === "approved" && req.type === "refund")
      after(() => sendStatusUpdate(req.targetId, "refunded"));
    await logActivity(
      actorName(staff),
      `${decision === "approved" ? "Approved" : "Rejected"} ${req.type} request`,
      req.targetId,
      note,
    );
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
  ],
  emailLimit: ["emailDailyLimit"],
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

export async function clearErrorsAction(_: ActionResult, f: FormData) {
  return run("errors", async (staff) => {
    const source = str(f, "source");
    const valid = (errorSources as readonly string[]).includes(source) ? (source as ErrorSource) : undefined;
    await clearErrors(valid);
    await logActivity(actorName(staff), "Cleared error log", valid ?? "all");
    return done("Error log cleared.");
  });
}
