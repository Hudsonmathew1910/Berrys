"use client";
import { useActionState } from "react";
import { KeyRound, Loader2, LockKeyhole } from "lucide-react";
import { unlockAction } from "@/app/[dash]/actions";

/** Shown until the dashboard is unlocked: create a password (first visit) or enter it. */
export function UnlockScreen({ email, firstTime }: { email: string; firstTime: boolean }) {
  const [state, action, pending] = useActionState(unlockAction, {});
  return (
    <main className="dash-unlock">
      <form action={action} className="dash-unlock-card">
        <span className="auth-mark">
          <img src="/images/berrys-mark.webp" alt="" />
        </span>
        <div className="eyebrow">BERRY’S STORE WORKSPACE</div>
        <h1>{firstTime ? "Create your dashboard password" : "Enter your dashboard password"}</h1>
        <p className="muted">
          {firstTime
            ? `Welcome! Set a password for ${email}. You’ll need it each time you open the dashboard.`
            : `Signed in as ${email}.`}
        </p>
        <label>
          {firstTime ? "New password" : "Password"}
          <input
            type="password"
            name="password"
            required
            autoFocus
            autoComplete={firstTime ? "new-password" : "current-password"}
            minLength={firstTime ? 10 : 1}
          />
        </label>
        {firstTime && (
          <>
            <label>
              Confirm password
              <input type="password" name="confirm" required autoComplete="new-password" minLength={10} />
            </label>
            <small className="muted">At least 10 characters, with a letter and a number.</small>
          </>
        )}
        {state.error && <p className="form-msg error">{state.error}</p>}
        <button className="primary" disabled={pending}>
          {pending ? (
            <Loader2 className="spin" size={17} />
          ) : firstTime ? (
            <KeyRound size={17} />
          ) : (
            <LockKeyhole size={17} />
          )}
          {firstTime ? "Create password & continue" : "Unlock dashboard"}
        </button>
        {!firstTime && <small className="muted">Forgot it? Ask an admin to reset your password.</small>}
      </form>
    </main>
  );
}
