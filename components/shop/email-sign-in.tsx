"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { api } from "@/components/store/api";

/**
 * "Continue with email": type an email and sign in (no code check yet — a
 * 6-digit code step will be added here later). Used on /login and in the header.
 */
export function EmailSignIn({ next, compact = false }: { next: string; compact?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/api/auth/email", { method: "POST", json: { email } });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className={"email-signin" + (compact ? " compact" : "")} onSubmit={submit}>
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
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <button className="primary" disabled={busy}>
        {busy ? <Loader2 className="spin" size={16} /> : <ArrowRight size={16} />} Continue with email
      </button>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}
