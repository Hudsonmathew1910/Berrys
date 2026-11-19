import type { OrderStatus } from "@/db/schema";

/** Order as returned by /api/admin/overview (dates arrive as ISO strings). */
export type AdminOrder = {
  id: string;
  customer: string;
  email: string;
  phone: string;
  address: string;
  pincode: string;
  total: number;
  status: OrderStatus;
  createdAt: string;
  razorpayPaymentId: string | null;
};

export type CategoryRank = { category: string; units: number; revenue: number };

export type Overview = {
  orders: AdminOrder[];
  ranking: CategoryRank[];
  paymentsMode: "mock" | "test" | "live" | "unconfigured";
};

export const statusLabels: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  expired: "Payment expired",
  needs_refund: "Refund needed",
};

export const salesStatuses: OrderStatus[] = ["paid", "packed", "shipped", "delivered"];
