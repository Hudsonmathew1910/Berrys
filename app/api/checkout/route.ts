import { z } from "zod";
import { formatAddress, getAddress, saveAddress } from "@/lib/addresses";
import { getViewer } from "@/lib/auth";
import { firebaseConfig } from "@/lib/firebase-verify";
import { HttpError } from "@/lib/http-error";
import { assertSameOrigin, handleError, json } from "@/lib/http";
import { createPendingOrder, paymentState } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { addressSchema, bagSchema, checkoutSchema } from "@/lib/validation";

const bodySchema = z.object({
  items: bagSchema,
  /** A saved address of this account… */
  addressId: z.string().uuid().optional(),
  /** …or a new one typed at checkout. */
  address: addressSchema.optional(),
  saveAddress: z.boolean().default(false),
});

/**
 * Step 1: reserve stock and create the Razorpay order the browser will pay.
 * Needs a logged-in account with a Google email (and a verified mobile when
 * mobile login is enabled). The order is addressed from a saved address or
 * a new one, optionally saved to the account.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Please log in to place your order.");
    if (!viewer.email) throw new HttpError(403, "Link your Google account to place an order.");
    if (firebaseConfig() && !viewer.phone) {
      throw new HttpError(403, "Verify your mobile number to place an order.");
    }
    const [payment, settings] = await Promise.all([paymentState(), getSettings()]);
    if (settings.maintenance)
      throw new HttpError(503, "The shop is closed for maintenance. Please check back soon.");
    if (!payment.ready) {
      throw new HttpError(503, "Online payment isn’t available yet. Please check back soon.");
    }
    await rateLimit("checkout", clientIp(request), 10, 10 * 60);
    // Per account as well, so one account can't hold stock from many addresses.
    await rateLimit("checkout-user", viewer.userId, 10, 10 * 60);
    await rateLimit("checkout-user-day", viewer.userId, 40, 24 * 60 * 60);

    const body = bodySchema.parse(await request.json());
    let address = body.addressId ? await getAddress(viewer.userId, body.addressId) : null;
    if (body.addressId && !address) throw new HttpError(404, "That address no longer exists.");
    if (!address) {
      if (!body.address) throw new HttpError(400, "Please choose or add a delivery address.");
      address = body.saveAddress
        ? await saveAddress(viewer.userId, body.address)
        : { ...body.address, id: "", userId: viewer.userId, createdAt: new Date() };
    }

    const input = checkoutSchema.parse({
      items: body.items,
      customer: address.name,
      email: viewer.email,
      phone: address.phone,
      address: formatAddress(address),
      pincode: address.pincode,
    });
    return json(await createPendingOrder(input, viewer, payment));
  } catch (e) {
    return handleError(e, "We could not start checkout. Please try again.", {
      source: "payment",
      path: "/api/checkout",
    });
  }
}
