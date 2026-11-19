import { requireAdmin } from "@/lib/auth";
import { handleError, json } from "@/lib/http";
import { isMockPayments, releaseExpiredOrders } from "@/lib/orders";
import { adminOverview } from "@/lib/store-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    await releaseExpiredOrders();
    const key = process.env.RAZORPAY_KEY_ID || "";
    const paymentsMode = isMockPayments()
      ? "mock"
      : key.startsWith("rzp_live_")
        ? "live"
        : key.startsWith("rzp_test_") && process.env.RAZORPAY_KEY_SECRET
          ? "test"
          : "unconfigured";
    return json({ ...(await adminOverview()), paymentsMode });
  } catch (e) {
    return handleError(e);
  }
}
