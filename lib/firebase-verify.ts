import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { HttpError } from "@/lib/http-error";
import { normalizeIndianMobile } from "@/lib/phone";

/**
 * Mobile OTP is sent and checked by Firebase Phone Authentication in the
 * browser. Firebase then gives the browser a signed ID token containing the
 * verified phone number; this checks that token's signature against Google's
 * public keys, so the number can't be faked.
 */

/** Mobile OTP login is on only when PHONE_LOGIN_ENABLED=true and Firebase is configured. */
export function firebaseConfig() {
  if (process.env.PHONE_LOGIN_ENABLED !== "true") return null;
  const apiKey = process.env.FIREBASE_API_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) return null;
  return {
    apiKey,
    projectId,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
  };
}

const jwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

/** Returns the verified Indian mobile number (E.164) from a Firebase ID token. */
export async function verifyFirebasePhoneToken(idToken: string): Promise<string> {
  const config = firebaseConfig();
  if (!config) throw new HttpError(503, "Mobile login isn’t set up yet. Please continue with Google.");
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, jwks, {
      algorithms: ["RS256"],
      audience: config.projectId,
      issuer: `https://securetoken.google.com/${config.projectId}`,
      maxTokenAge: "10 minutes",
    }));
  } catch {
    throw new HttpError(401, "Your mobile verification expired. Please request a new code.");
  }
  const provider = (payload.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider;
  const phone = normalizeIndianMobile(String(payload.phone_number || ""));
  if (provider !== "phone" || !phone) {
    throw new HttpError(400, "Please verify an Indian mobile number.");
  }
  return phone;
}
