import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * All tables have Row Level Security enabled with no policies. That means the
 * public Supabase API (anon key) cannot read or write them at all; every read
 * and write goes through this app's server routes using the direct Postgres
 * connection, which is where validation and admin checks live.
 */

/**
 * Customer / owner accounts. One person = one row, with their Google account
 * and their verified mobile number linked together. Either can be used to log in.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Google's stable account id ("sub"). */
  googleSub: text("google_sub").unique(),
  /** Verified Google email, lower-case. */
  email: text("email").unique(),
  /** Verified mobile number in E.164 form, e.g. +919876543210. */
  phone: text("phone").unique(),
  name: text("name").notNull().default(""),
  avatarUrl: text("avatar_url").notNull().default(""),
  /** Mobile number the customer typed in My account (not verified; never used to log in). */
  contactPhone: text("contact_phone").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** Login sessions. Only a SHA-256 hash of the cookie token is stored. */
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
).enableRLS();

/** Product categories, managed in the dashboard. Each defines its own size range. */
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Display name; products reference it (renames cascade automatically). */
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  image: text("image").notNull().default(""),
  /** Ordered size labels for products in this category, e.g. {S,M,L,XL} or {2-3Y,3-4Y}. */
  sizes: text("sizes")
    .array()
    .notNull()
    .default(sql`'{S,M,L,XL}'::text[]`),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const genders = ["girls", "boys", "unisex"] as const;
export type Gender = (typeof genders)[number];

export const products = pgTable(
  "products",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category")
      .notNull()
      .references(() => categories.name, { onUpdate: "cascade", onDelete: "restrict" }),
    gender: text("gender").$type<Gender>().notNull().default("unisex"),
    /** Extra search keywords. */
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Gallery (up to 6); `image` is always the first one. */
    images: text("images")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /**
     * MRP (normal price) in whole rupees. Every discount — including the product's own
     * sale price — lives in offers, so there is one place that decides what customers pay.
     */
    price: integer("price").notNull(),
    description: text("description").notNull().default(""),
    image: text("image").notNull(),
    badge: text("badge").notNull().default(""),
    color: text("color").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("products_active_category_idx").on(t.active, t.category),
    index("products_created_idx").on(t.createdAt),
    index("products_updated_idx").on(t.updatedAt),
  ],
).enableRLS();

export const inventory = pgTable(
  "inventory",
  {
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    size: text("size").notNull(),
    quantity: integer("quantity").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.size] }),
    check("inventory_quantity_non_negative", sql`${t.quantity} >= 0`),
  ],
).enableRLS();

/**
 * Order lifecycle:
 *   pending_payment -> paid -> packed -> shipped -> delivered
 *   pending_payment -> cancelled  (customer closed the payment window)
 *   pending_payment -> expired    (never paid; stock returned automatically)
 *   expired/cancelled -> paid           (late payment, stock re-reserved)
 *   expired/cancelled -> needs_refund   (late payment, stock gone: refund manually)
 */
export const orderStatuses = [
  "pending_payment",
  "paid",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
  "expired",
  "needs_refund",
  "refunded",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    /** Account that placed the order, when the customer was logged in. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    customer: text("customer").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    address: text("address").notNull(),
    pincode: text("pincode").notNull(),
    subtotal: integer("subtotal").notNull(),
    shipping: integer("shipping").notNull().default(0),
    total: integer("total").notNull(),
    status: text("status").$type<OrderStatus>().notNull().default("pending_payment"),
    razorpayOrderId: text("razorpay_order_id").unique(),
    razorpayPaymentId: text("razorpay_payment_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    confirmationSentAt: timestamp("confirmation_sent_at", { withTimezone: true }),
    /** Shipping progress, shown to the customer on the order details page. */
    packedAt: timestamp("packed_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    courier: text("courier").notNull().default(""),
    trackingNumber: text("tracking_number").notNull().default(""),
    trackingUrl: text("tracking_url").notNull().default(""),
    refundId: text("refund_id"),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    /** Money sent back so far (₹), full or part refunds. Equals total once fully refunded. */
    refundedAmount: integer("refunded_amount").notNull().default(0),
    /** Internal note for staff. */
    staffNote: text("staff_note").notNull().default(""),
    /**
     * Placed while Razorpay was off (demo payments): no money was taken, and
     * the order is deleted automatically one minute later (stock restored).
     */
    isDemo: boolean("is_demo").notNull().default(false),
    /** Latest customer refund request on this order (shown in the dashboard order list). */
    refundRequest: text("refund_request").$type<RefundRequestStatus>(),
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_user_idx").on(t.userId),
    index("orders_created_idx").on(t.createdAt),
    index("orders_paid_idx").on(t.paidAt),
    index("orders_email_status_idx").on(t.email, t.status),
    index("orders_demo_idx").on(t.isDemo, t.createdAt),
  ],
).enableRLS();

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    size: text("size").notNull(),
    quantity: integer("quantity").notNull(),
    /** Unit price in rupees at the time of the order. */
    price: integer("price").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId), index("order_items_product_idx").on(t.productId)],
).enableRLS();

/** Dashboard permissions that can be ticked per staff member. Admins have all of them. */
export const permissionKeys = [
  "orders",
  "products",
  "categories",
  "offers",
  "stock",
  "payments",
  "customers",
  "analytics",
  "content",
  "refunds",
  "delete_products",
  "delete_categories",
] as const;
export type Permission = (typeof permissionKeys)[number];
/** Areas only admins can be given (Team & access → admin with chosen access). */
export const adminAreaKeys = [
  "requests",
  "team",
  "settings",
  "errors",
  "activity",
  "delete_records",
] as const;
export type AdminArea = (typeof adminAreaKeys)[number];
export type AccessKey = Permission | AdminArea;
/** full = everything (admins) · default = the standard staff set · manual = only what's ticked. */
export const accessModes = ["full", "default", "manual"] as const;
export type AccessMode = (typeof accessModes)[number];
export type StaffRole = "admin" | "staff";

/**
 * Shop admins and staff. Added by an admin using the person's Google email;
 * access applies when they log in with that Google account. Each sets their
 * own dashboard password on first entry (passwordHash is null until then).
 */
export const staffMembers = pgTable("staff_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique(),
  /** Reserved for mobile-number staff accounts (mobile login is on hold). */
  phone: text("phone").unique(),
  name: text("name").notNull().default(""),
  role: text("role").$type<StaffRole>().notNull(),
  permissions: text("permissions")
    .array()
    .$type<AccessKey[]>()
    .notNull()
    .default(sql`'{}'::text[]`),
  /** How `permissions` applies: see accessModes. The store owner always has full access. */
  accessMode: text("access_mode").$type<AccessMode>().notNull().default("manual"),
  passwordHash: text("password_hash"),
  active: boolean("active").notNull().default(true),
  createdBy: text("created_by").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  /** Gets an email for every new paid order (the store owner never does). */
  notifyOrders: boolean("notify_orders").notNull().default(true),
  /** "Forgot password" one-time code sent to their Gmail (sha256, short-lived). */
  resetCodeHash: text("reset_code_hash"),
  resetCodeExpiresAt: timestamp("reset_code_expires_at", { withTimezone: true }),
  resetAttempts: integer("reset_attempts").notNull().default(0),
}).enableRLS();

/**
 * Unlocked dashboard sessions. Tied to the login session (logging out locks
 * the dashboard) and to a browser-session cookie (closing the browser locks it).
 */
export const dashboardSessions = pgTable(
  "dashboard_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staffMembers.id, { onDelete: "cascade" }),
    loginTokenHash: text("login_token_hash")
      .notNull()
      .references(() => sessions.tokenHash, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("dashboard_sessions_staff_idx").on(t.staffId)],
).enableRLS();

/** Every stock change, so stock and sales can be traced. */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: text("product_id").notNull(),
    size: text("size").notNull(),
    /** + added, − removed. */
    change: integer("change").notNull(),
    /** order | released | restock | adjust | refund */
    reason: text("reason").notNull(),
    orderId: text("order_id"),
    actor: text("actor").notNull().default("system"),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("stock_movements_product_idx").on(t.productId),
    index("stock_movements_created_idx").on(t.createdAt),
    index("stock_movements_order_idx").on(t.orderId),
  ],
).enableRLS();

/** Order history: every status change, with who and when. */
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    note: text("note").notNull().default(""),
    actor: text("actor").notNull().default("system"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId)],
).enableRLS();

/** Automatic discounts on products, categories or the whole store, between dates. */
export const offers = pgTable("offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** percent | flat (₹ off) | price (a product's own sale price: pay exactly alue) */
  type: text("type").$type<OfferType>().notNull(),
  value: integer("value").notNull(),
  /** all | category | product */
  scope: text("scope").$type<"all" | "category" | "product">().notNull(),
  /** Category names or product ids, depending on scope. */
  targets: text("targets")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  /**
   * Set only on a product's own sale price (type "price", one per product). Deleting the product
   * deletes its sale price; editing either the product or this offer edits the same row.
   */
  productId: text("product_id")
    .unique()
    .references(() => products.id, { onDelete: "cascade" }),
  /** Category / store offers: products with their own sale price that this offer leaves alone ("Skip"). */
  excluded: text("excluded")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  /**
   * Category / store offers: products whose sale price this offer replaces while it runs ("Replace").
   * The sale price itself is kept and comes back when this offer ends.
   */
  replaced: text("replaced")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  /** Category / store offers: products where this offer comes off their sale price ("Apply both"). */
  stacked: text("stacked")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export type OfferType = "percent" | "flat" | "price";

export type ApprovalType = "refund" | "delete_product" | "delete_order" | "delete_category";

/** Staff requests for actions they aren't allowed to do themselves (refunds, deletions). */
export const approvalRequests = pgTable("approval_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** refund | delete_product | delete_order | delete_category */
  type: text("type").$type<ApprovalType>().notNull(),
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull().default(""),
  status: text("status")
    .$type<"pending" | "processing" | "approved" | "rejected">()
    .notNull()
    .default("pending"),
  requestedBy: text("requested_by").notNull(),
  decidedBy: text("decided_by"),
  decisionNote: text("decision_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
}).enableRLS();

/** Who changed what in the dashboard. */
export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull().default(""),
    details: text("details").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_log_created_idx").on(t.createdAt)],
).enableRLS();

/** Editable website text (announcement bar, home page, help pages). */
export const siteContent = pgTable("site_content", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by").notNull().default(""),
}).enableRLS();

/** Fixed-window request counters used by lib/rate-limit.ts (shared across server instances). */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
    count: integer("count").notNull().default(0),
  },
  (t) => [index("rate_limits_window_idx").on(t.windowStart)],
).enableRLS();

/**
 * A signed-in customer's bag and favourites, so they follow the account across devices.
 * bag: [{ productId, size, quantity }] · likes: [productId]. Prices/stock are always read live.
 */
export const customerBags = pgTable("customer_bags", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  bag: jsonb("bag").$type<{ productId: string; size: string; quantity: number }[]>().notNull().default([]),
  likes: jsonb("likes").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
/** Saved delivery addresses for an account. */
export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    line1: text("line1").notNull(),
    line2: text("line2").notNull().default(""),
    city: text("city").notNull(),
    state: text("state").notNull(),
    pincode: text("pincode").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("addresses_user_idx").on(t.userId)],
).enableRLS();

/** Errors on the website, payments and emails, shown in Settings → Developer. */
export const errorLogs = pgTable(
  "error_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").$type<ErrorSource>().notNull(),
    message: text("message").notNull(),
    detail: text("detail").notNull().default(""),
    path: text("path").notNull().default(""),
    ref: text("ref").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("error_logs_created_idx").on(t.createdAt), index("error_logs_source_idx").on(t.source)],
).enableRLS();
export const errorSources = ["server", "payment", "email", "auth", "dashboard", "browser"] as const;
export type ErrorSource = (typeof errorSources)[number];

export const refundRequestStatuses = ["requested", "verified", "approved", "rejected"] as const;
export type RefundRequestStatus = (typeof refundRequestStatuses)[number];
export type RefundLine = {
  orderItemId: string;
  productId: string;
  name: string;
  size: string;
  quantity: number;
  price: number;
};

/**
 * Refund requests from customers (whole order or chosen pieces).
 * requested → (staff checks the reason) verified → admin approved / rejected.
 * The money is sent back separately (Razorpay refund).
 */
export const refundRequests = pgTable(
  "refund_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Whole order, or only the pieces in `items`. */
    wholeOrder: boolean("whole_order").notNull(),
    items: jsonb("items").$type<RefundLine[]>().notNull(),
    /** Amount the customer would get back (₹). */
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    details: text("details").notNull().default(""),
    status: text("status").$type<RefundRequestStatus>().notNull().default("requested"),
    verifiedBy: text("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    staffNote: text("staff_note").notNull().default(""),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note").notNull().default(""),
    /** Approved but the money couldn't be sent yet (e.g. Razorpay not connected): why. */
    payoutError: text("payout_error").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("refund_requests_order_idx").on(t.orderId), index("refund_requests_status_idx").on(t.status)],
).enableRLS();

/**
 * One-time 6-digit codes for "Continue with email" (one live code per email).
 * Only a hash of the code is stored; rows are removed once used or expired.
 */
export const emailLoginCodes = pgTable(
  "email_login_codes",
  {
    email: text("email").primaryKey(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_login_codes_expires_idx").on(t.expiresAt)],
).enableRLS();

/** One row per email sent (or failed), for the "emails sent" counter in Settings. No addresses are kept. */
export const emailSends = pgTable(
  "email_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull().default(""),
    ok: boolean("ok").notNull(),
    provider: text("provider").notNull().default(""),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_sends_sent_idx").on(t.sentAt)],
).enableRLS();

/**
 * Every refund paid on an order, whole or part. A row is "pending" from the moment the amount is
 * reserved until Razorpay confirms (then "done"); pending amounts count as refunded, so the same
 * money can never be sent back twice.
 */
export const orderRefunds = pgTable(
  "order_refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** ₹ sent back. */
    amount: integer("amount").notNull(),
    status: text("status").$type<"pending" | "done">().notNull().default("pending"),
    razorpayRefundId: text("razorpay_refund_id"),
    /** The customer request this pays, if any. */
    requestId: uuid("request_id").references(() => refundRequests.id, { onDelete: "set null" }),
    /** Pieces refunded (empty = an amount, or the whole order). */
    items: jsonb("items").$type<RefundLine[]>().notNull().default([]),
    reason: text("reason").notNull().default(""),
    actor: text("actor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_refunds_order_idx").on(t.orderId)],
).enableRLS();
