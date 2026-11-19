import type { OrderStatus } from "@/db/schema";

export const statusLabels: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  expired: "Payment expired",
  needs_refund: "Refund needed",
  refunded: "Refunded",
};

/** Statuses that count as real sales. */
export const salesStatuses: OrderStatus[] = ["paid", "packed", "shipped", "delivered"];

/** Fulfilment steps staff can move an order through. */
export const nextStatuses: Partial<Record<OrderStatus, OrderStatus[]>> = {
  paid: ["packed", "shipped", "delivered"],
  packed: ["shipped", "delivered"],
  shipped: ["delivered"],
};
