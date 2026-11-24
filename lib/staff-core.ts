import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  accessModes,
  adminAreaKeys,
  permissionKeys,
  type AccessKey,
  type AccessMode,
  type AdminArea,
  type Permission,
} from "@/db/schema";

/** Pure staff helpers (no Next.js imports), shared by lib/staff.ts and scripts/tests. */
type ScryptOpts = { N: number; r: number; p: number; maxmem: number };
const scrypt = promisify(scryptCb) as (
  pw: string,
  salt: Buffer,
  len: number,
  o?: ScryptOpts,
) => Promise<Buffer>;
export {
  accessModes,
  adminAreaKeys,
  permissionKeys,
  type AccessKey,
  type AccessMode,
  type AdminArea,
  type Permission,
};

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
  delete_categories: "Delete categories (otherwise: request)",
};

/** Extra areas that only an admin can be given. */
export const adminAreaLabels: Record<AdminArea, string> = {
  requests: "Approve requests & refunds",
  team: "Team & access (shop staff only)",
  settings: "Settings & payments",
  errors: "Error log",
  activity: "Activity log",
  delete_records: "Delete orders & customers",
};

/** What shop staff get with "Default access". */
export const staffDefaultPermissions: Permission[] = [
  "orders",
  "products",
  "categories",
  "offers",
  "stock",
  "payments",
  "customers",
  "analytics",
  "refunds",
  "delete_products",
];

/**
 * The secret dashboard address, from ADMIN_PATH (one URL segment, e.g.
 * "your-own-random-words"). Every other address shows "Page not found".
 */
export function adminPath() {
  const raw = (process.env.ADMIN_PATH || "berrys-admin").replace(/^\/+|\/+$/g, "");
  return /^[a-z0-9][a-z0-9-_]{2,63}$/i.test(raw) ? raw : "berrys-admin";
}
export const adminHref = (sub = "") => `/${adminPath()}${sub ? `/${sub.replace(/^\//, "")}` : ""}`;

// ---------------------------------------------------------------- passwords

const PW_KEYLEN = 64;
/** OWASP-recommended scrypt cost (N=2^15, r=8, p=3 ≈ 32 MB per hash). */
const PW_COST = { N: 2 ** 15, r: 8, p: 3 };
/** Hashes from before the cost upgrade used Node defaults. */
const LEGACY_COST = { N: 2 ** 14, r: 8, p: 1 };
const maxmem = (c: { N: number; r: number }) => 128 * c.N * c.r * 2;

/** Format: scrypt$v2$N$r$p$salt$hash (base64). */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const { N, r, p } = PW_COST;
  const hash = await scrypt(password.normalize("NFKC"), salt, PW_KEYLEN, {
    N,
    r,
    p,
    maxmem: maxmem(PW_COST),
  });
  return `scrypt$v2$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function parseHash(stored: string) {
  const parts = stored.split("$");
  if (parts[0] !== "scrypt") return null;
  if (parts[1] === "v2" && parts.length === 7) {
    const [N, r, p] = parts.slice(2, 5).map(Number);
    if (!(N >= 2 ** 14 && N <= 2 ** 20 && r >= 8 && r <= 16 && p >= 1 && p <= 16)) return null;
    return { cost: { N, r, p }, salt: parts[5], hash: parts[6] };
  }
  if (parts.length === 3) return { cost: LEGACY_COST, salt: parts[1], hash: parts[2] };
  return null;
}

export async function verifyPassword(password: string, stored: string | null) {
  const parsed = stored ? parseHash(stored) : null;
  if (!parsed) return false;
  const expected = Buffer.from(parsed.hash, "base64");
  const actual = await scrypt(
    password.normalize("NFKC"),
    Buffer.from(parsed.salt, "base64"),
    expected.length,
    {
      ...parsed.cost,
      maxmem: maxmem(parsed.cost),
    },
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** True when a stored hash uses an older/weaker cost and should be re-hashed after a successful login. */
export function needsRehash(stored: string | null) {
  const parsed = stored ? parseHash(stored) : null;
  return !parsed || parsed.cost.N !== PW_COST.N || parsed.cost.r !== PW_COST.r || parsed.cost.p !== PW_COST.p;
}
/** At least 10 characters with a letter and a digit. */
export function passwordProblem(pw: string) {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (pw.length > 200) return "That password is too long.";
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return "Use at least one letter and one number.";
  return null;
}

// ---------------------------------------------------------------- access

type Member = { role: string; permissions: string[]; accessMode?: string | null; email?: string | null };

const ownerEmail = () => process.env.STORE_OWNER_EMAIL?.trim().toLowerCase() || "";
export const isOwnerMember = (s: { email?: string | null }) =>
  !!s.email && ownerEmail().length > 0 && s.email.toLowerCase() === ownerEmail();

/** The store owner, and admins set to "Full access", can do everything. */
export function hasFullAccess(s: Member) {
  return isOwnerMember(s) || (s.role === "admin" && s.accessMode !== "manual");
}

/**
 * Can this person do `key`? Staff: the default set or what was ticked
 * (never the admin-only areas). Admins with chosen access: what was ticked.
 */
export function can(s: Member, key: AccessKey) {
  if (hasFullAccess(s)) return true;
  if (s.role !== "admin" && (adminAreaKeys as readonly string[]).includes(key)) return false;
  if (s.role !== "admin" && s.accessMode === "default")
    return (staffDefaultPermissions as string[]).includes(key);
  return s.permissions.includes(key);
}

export type Access = AccessKey;

/**
 * The access a dashboard section needs, from its first path segment
 * ("orders", "settings", …); null for pages everyone on the team can open.
 * Section folders are named after their access key.
 */
export function sectionAccess(pathname: string): AccessKey | null {
  const segment = pathname.split("/").filter(Boolean)[1] ?? "";
  return ([...permissionKeys, ...adminAreaKeys] as readonly string[]).includes(segment)
    ? (segment as AccessKey)
    : null;
}

export const accessLabels: Record<AccessKey, string> = { ...permissionLabels, ...adminAreaLabels };

/** Everything this person can do, in menu order. */
export function grantedAccess(s: Member): AccessKey[] {
  return [...permissionKeys, ...adminAreaKeys].filter((k) => can(s, k));
}
export const canAccess = can;

/**
 * Only the store owner changes admins (adds, edits, removes them). If no
 * owner address is set, full-access admins can.
 */
export function canManageAdmins(s: Member) {
  return isOwnerMember(s) || (!ownerEmail() && hasFullAccess(s));
}

/** Short description of someone's access for lists. */
export function accessSummary(s: Member) {
  if (isOwnerMember(s)) return "Owner — full access";
  if (hasFullAccess(s)) return "Full access";
  if (s.role !== "admin" && s.accessMode === "default") return "Default staff access";
  return `Chosen access (${s.permissions.length})`;
}

export const roleLabels = { admin: "Admin", staff: "Shop staff" } as const;
