import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getViewer } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { finishGoogleLogin, GOOGLE_STATE_COOKIE } from "@/lib/google";
import { HttpError } from "@/lib/http-error";
import { safeNext } from "@/lib/safe-next";
import { createSession } from "@/lib/session";
import { linkGoogle, loginWithGoogle } from "@/lib/users";

/** Google redirects back here after the visitor picks an account. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const site = serverEnv.siteUrl();
  const jar = await cookies();
  const raw = jar.get(GOOGLE_STATE_COOKIE)?.value;
  jar.set(GOOGLE_STATE_COOKIE, "", { path: "/auth/google", maxAge: 0 });

  let saved: { state: string; nonce: string; verifier: string; next: string } | null = null;
  try {
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }
  const next = safeNext(saved?.next);
  // Only fixed error codes go in the URL; the login page maps them to text.
  const viewer = await getViewer();
  // Linking (already logged in) returns to the link screen so the error is shown.
  const fail = (code: string) =>
    NextResponse.redirect(
      `${site}/login?next=${encodeURIComponent(next)}&error=${code}${viewer ? "&link=1" : ""}`,
    );

  // Visitor cancelled on Google's screen.
  if (url.searchParams.get("error")) return fail("google_cancelled");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!saved || !code || !state || state !== saved.state) return fail("google_state");

  try {
    const profile = await finishGoogleLogin(code, saved.verifier, saved.nonce);
    if (viewer) {
      // Logged in already (e.g. with mobile): link Google to this same account.
      await linkGoogle(viewer.userId, profile);
    } else {
      const user = await loginWithGoogle(profile);
      await createSession(user.id);
    }
    // Logged in (or Google linked): continue to where the visitor was going.
    return NextResponse.redirect(`${site}${next}`);
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status === 409 ? "link_conflict" : "google_unverified");
    console.error("Google login failed", e);
    return fail("google_failed");
  }
}
