import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
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

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  /** Selling price in whole rupees. */
  price: integer("price").notNull(),
  /** "Was" price in whole rupees, shown struck through. */
  originalPrice: integer("original_price").notNull(),
  description: text("description").notNull().default(""),
  image: text("image").notNull(),
  badge: text("badge").notNull().default(""),
  color: text("color").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

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
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_user_idx").on(t.userId),
    index("orders_created_idx").on(t.createdAt),
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
  (t) => [index("order_items_order_idx").on(t.orderId)],
).enableRLS();

export const admins = pgTable("admins", {
  /** The owner's account. */
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

/** Fixed-window request counters used by lib/rate-limit.ts (shared across server instances). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  count: integer("count").notNull().default(0),
}).enableRLS();
