import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { permissionKeys, type Permission } from "@/db/schema";

/** Pure staff helpers (no Next.js imports), shared by lib/staff.ts and scripts/tests. */
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export { permissionKeys, type Permission };

/** Labels for the permission checkboxes. */
export const permissionLabels: Record<Permission, string> = {
  orders: "Orders & shipping",
  products: "Products",
  categories: "Categories",
  offers: "Offers",
  stock: "Stock",
  payments: "Payments",
  customers: "Customers",
  analytics: "Sales & analytics",
  content: "Website content",
  refunds: "Issue refunds (otherwise: request)",
  delete_products: "Delete products (otherwise: request)",
};

/**
 * The secret dashboard address, from ADMIN_PATH (one URL segment, e.g.
 * "berrys-office-7k2"). Every other address shows "Page not found".
 */
export function adminPath() {
  const raw = (process.env.ADMIN_PATH || "berrys-admin").replace(/^\/+|\/+$/g, "");
  return /^[a-z0-9][a-z0-9-_]{2,63}$/i.test(raw) ? raw : "berrys-admin";
}
export const adminHref = (sub = "") => `/${adminPath()}${sub ? `/${sub.replace(/^\//, "")}` : ""}`;

// ---------------------------------------------------------------- passwords

const PW_KEYLEN = 64;
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, PW_KEYLEN);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}
export async function verifyPassword(password: string, stored: string | null) {
  if (!stored?.startsWith("scrypt$")) return false;
  const [, saltB64, hashB64] = stored.split("$");
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
/** At least 10 characters with a letter and a digit. */
export function passwordProblem(pw: string) {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (pw.length > 200) return "That password is too long.";
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return "Use at least one letter and one number.";
  return null;
}

export function can(staff: { role: string; permissions: string[] }, perm: Permission) {
  return staff.role === "admin" || staff.permissions.includes(perm);
}
