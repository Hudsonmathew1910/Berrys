import "server-only";
import { serverEnv } from "@/lib/env";
import { HttpError } from "@/lib/http-error";
import { getSessionUser } from "@/lib/session";
import { isComplete } from "@/lib/users";

export { HttpError };

export type Viewer = {
  userId: string;
  email: string | null;
  phone: string | null;
  name: string;
  avatarUrl: string;
  /** Google account and mobile number are both linked. */
  complete: boolean;
} | null;

/** The logged-in visitor (from the session cookie), or null. */
export async function getViewer(): Promise<Viewer> {
  const u = await getSessionUser();
  if (!u) return null;
  return {
    userId: u.id,
    email: u.email,
    phone: u.phone,
    name: u.name,
    avatarUrl: u.avatarUrl,
    complete: isComplete(u),
  };
}

export function isOwnerEmail(email: string | null | undefined) {
  const owner = serverEnv.storeOwnerEmail();
  return !!email && owner.length > 0 && owner === email.toLowerCase();
}
