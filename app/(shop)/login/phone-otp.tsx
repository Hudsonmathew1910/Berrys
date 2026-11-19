"use client";
import { useEffect, useRef, useState } from "react";
import { initializeApp, getApps, type FirebaseApp } from "@firebase/app";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  type ConfirmationResult,
} from "@firebase/auth";
import { ArrowRight, Loader2, Smartphone } from "lucide-react";
import { api } from "@/components/store/api";
import { formatIndianMobile, normalizeIndianMobile } from "@/lib/phone";

export type FirebaseConfig = { apiKey: string; projectId: string; authDomain: string };

function firebaseApp(config: FirebaseConfig): FirebaseApp {
  return getApps()[0] ?? initializeApp(config);
}

/** Friendly text for Firebase Auth error codes. */
function message(e: unknown) {
  const code = (e as { code?: string }).code || "";
  if (code.includes("invalid-verification-code")) return "That code is incorrect. Please check the SMS.";
  if (code.includes("code-expired")) return "That code has expired. Please request a new one.";
  if (code.includes("too-many-requests") || code.includes("quota-exceeded"))
    return "Too many attempts. Please wait a while and try again.";
  if (code.includes("invalid-phone-number")) return "Please enter a valid 10-digit Indian mobile number.";
  if (code.includes("billing-not-enabled") || code.includes("operation-not-allowed"))
    return "Mobile login isn’t enabled yet. Please continue with Google.";
  if (code.includes("captcha")) return "Security check failed. Please reload the page and try again.";
  return (e as Error).message || "Something went wrong. Please try again.";
}

/**
 * Mobile number → real SMS code (sent by Firebase Phone Authentication) →
 * Firebase confirms it → our server checks Firebase's signed proof and logs in
 * (or links the number to the logged-in account).
 */
export function PhoneOtp({ config, onVerified }: { config: FirebaseConfig; onVerified: () => void }) {
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => () => verifier.current?.clear(), []);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const e164 = normalizeIndianMobile(sentTo || phone);
    if (!e164) return setError("Please enter a valid 10-digit Indian mobile number.");
    setBusy(true);
    setError("");
    try {
      const auth = getAuth(firebaseApp(config));
      auth.languageCode = "en";
      // Invisible reCAPTCHA: Firebase's protection against SMS abuse.
      verifier.current?.clear();
      verifier.current = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      confirmation.current = await signInWithPhoneNumber(auth, e164, verifier.current);
      setSentTo(e164);
      setCode("");
      setCooldown(30);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmation.current) return;
    setBusy(true);
    setError("");
    try {
      const result = await confirmation.current.confirm(code);
      const idToken = await result.user.getIdToken();
      await api("/api/auth/phone", { method: "POST", json: { idToken } });
      // Our own session is set now; the Firebase session isn't needed.
      await signOut(getAuth(firebaseApp(config))).catch(() => {});
      onVerified();
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  return (
    <>
      <div id="recaptcha-container" />
      {!sentTo ? (
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
      ) : (
        <form className="checkout-form auth-form" onSubmit={verify}>
          <label>
            Enter the 6-digit code sent to {formatIndianMobile(sentTo)}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary" disabled={busy}>
            {busy ? <Loader2 className="spin" size={17} /> : <ArrowRight size={17} />}
            Verify and continue
          </button>
          <div className="otp-actions">
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setSentTo("");
                setError("");
              }}
            >
              Change number
            </button>
            <button
              type="button"
              className="text-link"
              disabled={busy || cooldown > 0}
              onClick={() => send()}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
