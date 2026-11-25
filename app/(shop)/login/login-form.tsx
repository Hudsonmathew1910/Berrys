"use client";
import Link from "next/link";
import { ArrowLeft, LogOut } from "lucide-react";
import { EmailSignIn } from "@/components/shop/email-sign-in";
import { GoogleIcon } from "@/components/shop/google-icon";

type Props = {
  next: string;
  error: string;
  googleEnabled: boolean;
  /** "Continue with email" (Dashboard → Settings → Emails). */
  emailEnabled: boolean;
  /** Set when an older mobile-only account must link Google before buying (what it is logged in with). */
  linkingFrom: string | null;
};

export function LoginForm({ next, error, googleEnabled, emailEnabled, linkingFrom }: Props) {
  const googleHref = `/auth/google?next=${encodeURIComponent(next)}`;

  return (
    <div className="auth-page">
      <div className="admin-welcome">
        <span className="auth-mark">
          <img src="/images/berrys-mark.webp" alt="" />
        </span>

        {!linkingFrom ? (
          <>
            <div className="eyebrow">WELCOME TO BERRY’S</div>
            <h1>Login or sign up.</h1>
            <p>
              Use your Google account{emailEnabled ? " or your email address" : ""}. New here? Your account is
              created automatically.
            </p>
            {error && <p className="form-error">{error}</p>}
            {googleEnabled && (
              <a className="google-btn" href={googleHref}>
                <GoogleIcon />
                Continue with Google
              </a>
            )}
            {emailEnabled && (
              <>
                {googleEnabled && (
                  <div className="auth-divider">
                    <span>or use your email</span>
                  </div>
                )}
                <EmailSignIn next={next} />
              </>
            )}
            {!googleEnabled && !emailEnabled && (
              <p className="form-error">Login isn’t configured yet. Add the Google settings to .env.</p>
            )}
          </>
        ) : (
          <>
            <div className="eyebrow">BEFORE YOU BUY</div>
            <h1>Link your Google account.</h1>
            <p>
              To place an order we need your Google email, for order updates.
              <br />
              Logged in with {linkingFrom}.
            </p>
            {error && <p className="form-error">{error}</p>}
            {googleEnabled ? (
              <a className="google-btn" href={googleHref}>
                <GoogleIcon />
                Link Google account
              </a>
            ) : (
              <p className="form-error">Google login isn’t configured yet.</p>
            )}
            <form action="/auth/signout" method="post">
              <button className="text-link" type="submit">
                <LogOut size={15} /> Log out
              </button>
            </form>
          </>
        )}

        <Link className="text-link" href="/">
          <ArrowLeft size={16} />
          Back to the storefront
        </Link>
      </div>
    </div>
  );
}
