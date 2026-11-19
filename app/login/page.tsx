import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { formatIndianMobile } from "@/lib/phone";
import { safeNext } from "@/lib/safe-next";
import { isDevOtp, smsProviderName } from "@/lib/sms";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Login — Berry’s", robots: { index: false } };
export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  google_not_configured: "Google login isn’t set up yet. Please use your mobile number.",
  google_cancelled: "Google login was cancelled.",
  google_state: "That login link expired. Please try again.",
  google_failed: "We couldn’t log you in with Google. Please try again.",
  google_unverified: "Your Google account’s email address isn’t verified.",
  link_conflict:
    "That Google account or mobile number already belongs to a different Berry’s account, so it can’t be linked to this one.",
  rate_limited: "Too many attempts. Please wait a few minutes and try again.",
};

/**
 * One page for logging in and signing up. Every account links a Google
 * account AND a verified mobile number; after the first method, the page asks
 * for the other one before sending the visitor on to `next`.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext);
  const viewer = await getViewer();
  if (viewer?.complete) redirect(next);

  return (
    <LoginForm
      next={next}
      error={error ? (errors[error] ?? "Something went wrong. Please try again.") : ""}
      googleEnabled={serverEnv.googleConfigured()}
      smsEnabled={!!smsProviderName()}
      devOtp={isDevOtp()}
      viewer={
        viewer
          ? {
              email: viewer.email,
              phone: viewer.phone ? formatIndianMobile(viewer.phone) : null,
              name: viewer.name,
            }
          : null
      }
    />
  );
}
