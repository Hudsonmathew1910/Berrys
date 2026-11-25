import "server-only";
import { cache } from "react";
import { serverEnv } from "@/lib/env";
import { HttpError } from "@/lib/http-error";
import { getSessionUser } from "@/lib/session";

export { HttpError };

export type Viewer = {
  userId: string;
  email: string | null;
  phone: string | null;
  name: string;
  avatarUrl: string;
  /** Unverified contact number from My account (E.164 or ""). */
  contactPhone: string;
} | null;

/** The logged-in visitor (from the session cookie), or null. Looked up once per request. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const u = await getSessionUser();
  if (!u) return null;
  return {
    userId: u.id,
    email: u.email,
    phone: u.phone,
    name: u.name,
    avatarUrl: u.avatarUrl,
    contactPhone: u.contactPhone,
  };
});

export function isOwnerEmail(email: string | null | undefined) {
  const owner = serverEnv.storeOwnerEmail();
  return !!email && owner.length > 0 && owner === email.toLowerCase();
}
