import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { formatIndianMobile } from "@/lib/phone";
import { safeNext } from "@/lib/safe-next";
import { getSettings } from "@/lib/settings";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Login — Berry’s", robots: { index: false } };
export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  google_not_configured: "Google login isn’t set up yet.",
  google_cancelled: "Google login was cancelled.",
  google_state: "That login link expired. Please try again.",
  google_failed: "We couldn’t log you in with Google. Please try again.",
  google_unverified: "Your Google account’s email address isn’t verified.",
  link_conflict:
    "That Google account or mobile number already belongs to a different Berry’s account, so it can’t be linked to this one.",
  rate_limited: "Too many attempts. Please wait a few minutes and try again.",
};

/**
 * /login            — log in or sign up with Google (or email, when enabled).
 * /login?link=1     — an older mobile-only account links Google (needed before buying).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; link?: string }>;
}) {
  const { next: rawNext, error, link } = await searchParams;
  const next = safeNext(rawNext);
  const viewer = await getViewer();
  const linking = link === "1" && !!viewer && !viewer.email;
  if (viewer && !linking) redirect(next);

  return (
    <LoginForm
      next={next}
      error={error ? (errors[error] ?? "Something went wrong. Please try again.") : ""}
      googleEnabled={serverEnv.googleConfigured()}
      emailEnabled={(await getSettings()).emailSignIn}
      linkingFrom={
        linking && viewer ? (viewer.phone ? formatIndianMobile(viewer.phone) : "your account") : null
      }
    />
  );
}
