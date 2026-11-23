"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogOut } from "lucide-react";
import { EmailSignIn } from "@/components/shop/email-sign-in";
import { GoogleIcon } from "@/components/shop/google-icon";
import { PhoneOtp, type FirebaseConfig } from "./phone-otp";

type Props = {
  next: string;
  error: string;
  googleEnabled: boolean;
  /** "Continue with email" (Dashboard → Settings → Emails). */
  emailEnabled: boolean;
  firebase: FirebaseConfig | null;
  /** Set when a logged-in visitor must add the missing method (required before buying). */
  viewer: { email: string | null; phone: string | null } | null;
};

export function LoginForm({ next, error, googleEnabled, emailEnabled, firebase, viewer }: Props) {
  const router = useRouter();
  const googleHref = `/auth/google?next=${encodeURIComponent(next)}`;
  const done = () => {
    router.replace(next);
    router.refresh();
  };

  return (
    <div className="auth-page">
      <div className="admin-welcome">
        <span className="auth-mark">
          <img src="/images/berrys-mark.webp" alt="" />
        </span>

        {!viewer ? (
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
            {googleEnabled && firebase && (
              <div className="auth-divider">
                <span>or use your mobile number</span>
              </div>
            )}
            {firebase && <PhoneOtp config={firebase} onVerified={done} />}
            {!googleEnabled && !firebase && !emailEnabled && (
              <p className="form-error">
                Login isn’t configured yet. Add Google or Firebase settings to .env.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="eyebrow">BEFORE YOU BUY</div>
            <h1>{viewer.phone ? "Link your Google account." : "Verify your mobile number."}</h1>
            <p>
              To place an order we need both your Google email and a verified mobile number, for order updates
              and delivery.
              <br />
              {viewer.email ? `Logged in with Google as ${viewer.email}.` : `Logged in with ${viewer.phone}.`}
            </p>
            {error && <p className="form-error">{error}</p>}
            {viewer.phone ? (
              googleEnabled ? (
                <a className="google-btn" href={googleHref}>
                  <GoogleIcon />
                  Link Google account
                </a>
              ) : (
                <p className="form-error">Google login isn’t configured yet.</p>
              )
            ) : firebase ? (
              <PhoneOtp config={firebase} onVerified={done} />
            ) : (
              <p className="form-error">Mobile verification isn’t configured yet.</p>
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
