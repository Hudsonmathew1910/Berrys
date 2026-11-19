"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z, ZodError } from "zod";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import { orderStatuses, permissionKeys, type Permission } from "@/db/schema";
import * as cat from "@/lib/admin/catalog";
import * as ord from "@/lib/admin/orders";
import * as team from "@/lib/admin/team";
import { contentDefaults, helpDefault, resetContent, saveContent, type ContentKey } from "@/lib/content";
import { HttpError } from "@/lib/http-error";
import { rateLimit } from "@/lib/rate-limit";
import {
  actorName,
  adminPath,
  can,
  getStaffForViewer,
  hashPassword,
  lockDashboard,
  logActivity,
  passwordProblem,
  requireAction,
  unlockDashboard,
  verifyPassword,
  type Staff,
} from "@/lib/staff";
import { productSchema } from "@/lib/validation";

export type ActionResult = { ok?: string; error?: string; at?: number };

const done = (ok: string): ActionResult => {
  revalidatePath(`/${adminPath()}`, "layout");
  return { ok, at: Date.now() };
};

/** Runs an action with permission checks; turns errors into a message for the form. */
async function run(perm: Permission | "admin" | null, fn: (staff: Staff) => Promise<ActionResult>) {
  try {
    const staff = await requireAction(perm ?? undefined);
    return await fn(staff);
  } catch (e) {
    if (e instanceof HttpError) return { error: e.message, at: Date.now() };
    if (e instanceof ZodError)
      return { error: e.issues[0]?.message ?? "Please check the form.", at: Date.now() };
    console.error(e);
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
    }
    await unlockDashboard(staff.id);
    return done("Unlocked");
  } catch (e) {
    if (e instanceof HttpError) return { error: e.message };
    console.error(e);
    return { error: "Something went wrong. Please try again." };
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

// ---------------------------------------------------------------- orders

export async function orderStatusAction(_: ActionResult, f: FormData) {
  return run("orders", async (staff) => {
    const id = str(f, "orderId");
    const next = z.enum(orderStatuses).parse(str(f, "status"));
    await ord.setOrderStatus(id, next, actorName(staff), str(f, "note").slice(0, 500));
    await logActivity(actorName(staff), `Order marked ${next}`, id);
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
      return done(`Refunded (${refundId}).`);
    }
    await team.createRequest("refund", id, reason, actorName(staff));
    await logActivity(actorName(staff), "Requested refund", id, reason);
    return done("Refund request sent to an admin.");
  });
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
    await team.createRequest("delete_product", id, reason, actorName(staff));
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

export async function deleteCategoryAction(_: ActionResult, f: FormData) {
  return run("categories", async (staff) => {
    const name = await cat.deleteCategory(str(f, "id"));
    await logActivity(actorName(staff), "Deleted category", name);
    return done(`Deleted “${name}”.`);
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
    if (key === "announcement") {
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

const permsFrom = (f: FormData) =>
  f
    .getAll("permissions")
    .map(String)
    .filter((p): p is Permission => (permissionKeys as readonly string[]).includes(p));

export async function addStaffAction(_: ActionResult, f: FormData) {
  return run("admin", async (staff) => {
    const email = z.string().trim().toLowerCase().email("Enter a valid Google email.").parse(str(f, "email"));
    const role = z.enum(["admin", "staff"]).parse(str(f, "role"));
    await team.addStaff(email, role, permsFrom(f), actorName(staff));
    await logActivity(actorName(staff), `Added ${role}`, email);
    return done(`${email} added. They log in with that Google account and create their dashboard password.`);
  });
}

export async function updateStaffAction(_: ActionResult, f: FormData) {
  return run("admin", async (staff) => {
    const role = z.enum(["admin", "staff"]).parse(str(f, "role"));
    const s = await team.updateStaff(str(f, "id"), {
      role,
      permissions: permsFrom(f),
      active: f.get("active") === "on",
      name: str(f, "name").slice(0, 80),
    });
    await logActivity(
      actorName(staff),
      "Updated team member",
      s.email ?? s.id,
      `${role}: ${permsFrom(f).join(", ")}`,
    );
    return done("Saved.");
  });
}

export async function resetStaffPasswordAction(_: ActionResult, f: FormData) {
  return run("admin", async (staff) => {
    const s = await team.resetStaffPassword(str(f, "id"));
    await logActivity(actorName(staff), "Reset dashboard password", s.email ?? s.id);
    return done(`Password reset. ${s.email} will create a new one on their next visit.`);
  });
}

export async function removeStaffAction(_: ActionResult, f: FormData) {
  return run("admin", async (staff) => {
    const s = await team.removeStaff(str(f, "id"));
    await logActivity(actorName(staff), "Removed team member", s.email ?? s.id);
    return done("Removed from the team.");
  });
}

/** Approve (and carry out) or reject a staff request. */
export async function decideRequestAction(_: ActionResult, f: FormData) {
  return run("admin", async (staff) => {
    const req = await team.getRequest(str(f, "id"));
    if (!req || req.status !== "pending") return { error: "This request was already handled." };
    const decision = str(f, "decision") === "approve" ? "approved" : "rejected";
    const note = str(f, "note").slice(0, 500);
    if (decision === "approved") {
      if (req.type === "refund") await ord.refundOrder(req.targetId, actorName(staff), req.reason);
      else await cat.deleteProduct(req.targetId);
    }
    await team.decideRequest(req.id, decision, actorName(staff), note);
    await logActivity(
      actorName(staff),
      `${decision === "approved" ? "Approved" : "Rejected"} ${req.type} request`,
      req.targetId,
      note,
    );
    return done(decision === "approved" ? "Approved and done." : "Request rejected.");
  });
}
