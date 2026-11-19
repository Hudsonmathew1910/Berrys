import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { GOOGLE_STATE_COOKIE, startGoogleLogin } from "@/lib/google";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/safe-next";

/**
 * GET /auth/google?next=/account — sends the visitor to Google's account
 * chooser. Used both to log in and to link Google to a logged-in account.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const site = serverEnv.siteUrl();

  if (!serverEnv.googleConfigured()) {
    return NextResponse.redirect(`${site}/login?error=google_not_configured`);
  }
  try {
    await rateLimit("google-start", clientIp(request), 30, 10 * 60);
  } catch {
    return NextResponse.redirect(`${site}/login?error=rate_limited`);
  }

  const { url: googleUrl, state, nonce, verifier } = startGoogleLogin();
  const res = NextResponse.redirect(googleUrl);
  res.cookies.set(GOOGLE_STATE_COOKIE, JSON.stringify({ state, nonce, verifier, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/google",
    maxAge: 600,
  });
  return res;
}
