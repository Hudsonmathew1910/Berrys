import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { HttpError } from "@/lib/http-error";
import type { GoogleProfile } from "@/lib/users";

/**
 * "Sign in with Google" using OpenID Connect (authorization code + PKCE),
 * talking to Google directly with GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
 * Only the basic openid/email/profile scopes are requested.
 */

export const GOOGLE_STATE_COOKIE = "berrys_google_oauth";
export const redirectUri = () => `${serverEnv.siteUrl()}/auth/google/callback`;

const random = () => randomBytes(32).toString("base64url");

export function startGoogleLogin() {
  const state = random();
  const nonce = random();
  const verifier = random();
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: serverEnv.googleClientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), state, nonce, verifier };
}

/**
 * Exchanges the code for tokens and reads the ID token. The token comes
 * straight from Google's token endpoint over TLS, so per OpenID Connect Core
 * §3.1.3.7 the TLS connection authenticates the issuer; we still check the
 * audience, issuer, expiry, nonce and that the email is verified.
 */
export async function finishGoogleLogin(
  code: string,
  verifier: string,
  nonce: string,
): Promise<GoogleProfile> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: serverEnv.googleClientId(),
      client_secret: serverEnv.googleClientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) throw new Error("Google did not return an ID token.");
  return readIdToken(id_token, nonce);
}

export function readIdToken(idToken: string, nonce: string): GoogleProfile {
  const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"));
  const issuerOk = payload.iss === "https://accounts.google.com" || payload.iss === "accounts.google.com";
  if (
    !issuerOk ||
    payload.aud !== serverEnv.googleClientId() ||
    typeof payload.exp !== "number" ||
    payload.exp * 1000 < Date.now() ||
    payload.nonce !== nonce ||
    typeof payload.sub !== "string"
  ) {
    throw new Error("Google ID token failed validation.");
  }
  if (!payload.email || payload.email_verified !== true) {
    throw new HttpError(400, "Your Google account’s email address isn’t verified.");
  }
  return {
    sub: payload.sub,
    email: String(payload.email),
    name: String(payload.name || ""),
    picture: String(payload.picture || ""),
  };
}
