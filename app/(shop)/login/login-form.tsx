"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogOut } from "lucide-react";
import { PhoneOtp, type FirebaseConfig } from "./phone-otp";

type Props = {
  next: string;
  error: string;
  googleEnabled: boolean;
  firebase: FirebaseConfig | null;
  /** Set when a logged-in visitor must add the missing method (required before buying). */
  viewer: { email: string | null; phone: string | null } | null;
};

export function LoginForm({ next, error, googleEnabled, firebase, viewer }: Props) {
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
              Use your Google account or your mobile number. New here? Your account is created automatically.
            </p>
            {error && <p className="form-error">{error}</p>}
            {googleEnabled && (
              <a className="google-btn" href={googleHref}>
                <GoogleIcon />
                Continue with Google
              </a>
            )}
            {googleEnabled && firebase && (
              <div className="auth-divider">
                <span>or use your mobile number</span>
              </div>
            )}
            {firebase && <PhoneOtp config={firebase} onVerified={done} />}
            {!googleEnabled && !firebase && (
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

/** Google "G" mark, per Google's sign-in branding guidelines. */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z"
      />
    </svg>
  );
}
