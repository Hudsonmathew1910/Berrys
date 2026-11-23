"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, KeyRound, Loader2, Mail } from "lucide-react";
import { api } from "@/components/store/api";

const RESEND_SECONDS = 30;

/**
 * "Continue with email": type an email, get a 6-digit code by email, enter it
 * to sign in (same account as Google). Used on /login and in the header.
 */
export function EmailSignIn({ next, compact = false }: { next: string; compact?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [wait, setWait] = useState(0);
  /** Came back from the code step: put the cursor in the email box. */
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function sendCode() {
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const r = await api<{ minutes: number }>("/api/auth/email/code", { method: "POST", json: { email } });
      setStep("code");
      setCode("");
      setWait(RESEND_SECONDS);
      setInfo(`We sent a 6-digit code to ${email.trim()}. It expires in ${r.minutes} minutes.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError("");
    setBusy(true);
    try {
      await api("/api/auth/email", { method: "POST", json: { email, code } });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (step === "email") void sendCode();
    else void verify();
  }

  return (
    <form className={"email-signin" + (compact ? " compact" : "")} onSubmit={submit}>
      {step === "email" ? (
        <label className="email-signin-field">
          <Mail size={17} aria-hidden="true" />
          <input
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="you@example.com"
            autoFocus={changing}
            aria-label="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
      ) : (
        <>
          {info && <p className="email-signin-info">{info}</p>}
          <label className="email-signin-field">
            <KeyRound size={17} aria-hidden="true" />
            <input
              name="code"
              className="email-signin-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              title="The 6-digit code from the email"
              required
              autoFocus
              maxLength={6}
              placeholder="6-digit code"
              aria-label="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>
        </>
      )}
      <button className="primary" disabled={busy}>
        {busy ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />}{" "}
        {step === "email" ? "Send code" : "Verify & sign in"}
      </button>
      {step === "code" && (
        <div className="email-signin-links">
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setStep("email");
              setChanging(true);
              setError("");
              setInfo("");
            }}
          >
            Change email
          </button>
          <button type="button" className="link-button" disabled={busy || wait > 0} onClick={sendCode}>
            {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
          </button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
