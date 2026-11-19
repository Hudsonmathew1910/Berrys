"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, LogOut, Smartphone } from "lucide-react";
import { api } from "@/components/store/api";
import { formatIndianMobile } from "@/lib/phone";

type Props = {
  next: string;
  error: string;
  googleEnabled: boolean;
  smsEnabled: boolean;
  devOtp: boolean;
  /** Set when logged in but the account still needs Google or a mobile number linked. */
  viewer: { email: string | null; phone: string | null; name: string } | null;
};

export function LoginForm({ next, error, googleEnabled, smsEnabled, devOtp, viewer }: Props) {
  const googleHref = `/auth/google?next=${encodeURIComponent(next)}`;
  const router = useRouter();
  // Re-runs the server page: complete accounts are redirected to `next`,
  // otherwise it shows the remaining linking step.
  const done = () => router.refresh();

  return (
    <main className="auth-page">
      <div className="admin-welcome">
        <Link href="/" className="auth-logo">
          <img src="/images/berrys-logo.png" alt="Berry’s" />
        </Link>

        {!viewer ? (
          <>
            <div className="eyebrow">WELCOME TO BERRY’S</div>
            <h1>Login or sign up.</h1>
            <p>
              Use your Google account or mobile number. New here? We’ll create your account automatically.
            </p>
            {error && <p className="form-error">{error}</p>}
            {googleEnabled && (
              <a className="google-btn" href={googleHref}>
                <GoogleIcon />
                Continue with Google
              </a>
            )}
            {googleEnabled && smsEnabled && (
              <div className="auth-divider">
                <span>or use your mobile number</span>
              </div>
            )}
            {smsEnabled && <PhoneOtp devOtp={devOtp} onVerified={done} />}
            {!googleEnabled && !smsEnabled && (
              <p className="form-error">Login isn’t configured yet. Add Google or SMS settings to .env.</p>
            )}
          </>
        ) : (
          <>
            <div className="eyebrow">ONE LAST STEP</div>
            <h1>{viewer.phone ? "Link your Google account." : "Verify your mobile number."}</h1>
            <p>
              Your Berry’s account uses both, so you can log in with either next time.
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
            ) : smsEnabled ? (
              <PhoneOtp devOtp={devOtp} onVerified={done} />
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
    </main>
  );
}

/** Mobile number → SMS code → verified. */
function PhoneOtp({ devOtp, onVerified }: { devOtp: boolean; onVerified: () => void }) {
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ phone: string }>("/api/auth/otp/send", {
        method: "POST",
        json: { phone: sentTo || phone },
      });
      setSentTo(res.phone);
      setCode("");
      setCooldown(30);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/otp/verify", { method: "POST", json: { phone: sentTo, code } });
      onVerified();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!sentTo) {
    return (
      <form className="checkout-form auth-form" onSubmit={send}>
        <label>
          Mobile number
          <div className="phone-input">
            <span>+91</span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="98765 43210"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? <Loader2 className="spin" size={17} /> : <Smartphone size={17} />}
          Send code by SMS
        </button>
      </form>
    );
  }

  return (
    <form className="checkout-form auth-form" onSubmit={verify}>
      <label>
        Enter the 6-digit code sent to {formatIndianMobile(sentTo)}
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{4,8}"
          maxLength={8}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      {devOtp && (
        <p className="test-note">
          Development mode: no SMS is sent. The code is printed in the terminal running <b>npm run dev</b>.
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
      <button className="primary" disabled={busy}>
        {busy ? <Loader2 className="spin" size={17} /> : <ArrowRight size={17} />}
        Verify and continue
      </button>
      <div className="otp-actions">
        <button type="button" className="text-link" onClick={() => setSentTo("")}>
          Change number
        </button>
        <button type="button" className="text-link" disabled={busy || cooldown > 0} onClick={() => send()}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </form>
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
