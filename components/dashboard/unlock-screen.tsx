"use client";
import { useActionState, useState } from "react";
import { ArrowLeft, KeyRound, Loader2, LockKeyhole, Mail } from "lucide-react";
import { resetWithCodeAction, sendResetCodeAction, unlockAction } from "@/app/[dash]/actions";

/**
 * Shown until the dashboard is unlocked: create a password (first visit),
 * enter it, or — when allowed in Settings — reset it with a code emailed to
 * the person's Gmail.
 */
export function UnlockScreen({
  email,
  firstTime,
  canReset,
}: {
  email: string;
  firstTime: boolean;
  canReset: boolean;
}) {
  const [mode, setMode] = useState<"unlock" | "reset">("unlock");
  return (
    <main className="dash-unlock">
      {mode === "unlock" ? (
        <UnlockForm
          email={email}
          firstTime={firstTime}
          canReset={canReset}
          onForgot={() => setMode("reset")}
        />
      ) : (
        <ResetForm email={email} onBack={() => setMode("unlock")} />
      )}
    </main>
  );
}

function Brand() {
  return (
    <>
      <span className="auth-mark">
        <img src="/images/berrys-mark.webp" alt="" />
      </span>
      <div className="eyebrow">BERRY’S STORE WORKSPACE</div>
    </>
  );
}

function UnlockForm({
  email,
  firstTime,
  canReset,
  onForgot,
}: {
  email: string;
  firstTime: boolean;
  canReset: boolean;
  onForgot: () => void;
}) {
  const [state, action, pending] = useActionState(unlockAction, {});
  return (
    <form action={action} className="dash-unlock-card">
      <Brand />
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
      {!firstTime &&
        (canReset ? (
          <button type="button" className="text-link unlock-forgot" onClick={onForgot}>
            Forgot password?
          </button>
        ) : (
          <small className="muted">Forgot it? Ask an admin to reset your password.</small>
        ))}
    </form>
  );
}

function ResetForm({ email, onBack }: { email: string; onBack: () => void }) {
  const [sent, send, sending] = useActionState(sendResetCodeAction, {});
  const [state, reset, resetting] = useActionState(resetWithCodeAction, {});
  const codeSent = !!sent.ok;
  return (
    <div className="dash-unlock-card">
      <Brand />
      <h1>Reset your dashboard password</h1>
      {!codeSent ? (
        <form action={send} className="unlock-step">
          <p className="muted">We’ll email a 6-digit code to {email}.</p>
          {sent.error && <p className="form-msg error">{sent.error}</p>}
          <button className="primary" disabled={sending}>
            {sending ? <Loader2 className="spin" size={17} /> : <Mail size={17} />} Email me a code
          </button>
        </form>
      ) : (
        <form action={reset} className="unlock-step">
          <p className="form-msg ok">{sent.ok}</p>
          <label>
            6-digit code
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              required
              autoFocus
            />
          </label>
          <label>
            New password
            <input type="password" name="password" required minLength={10} autoComplete="new-password" />
          </label>
          <label>
            Confirm new password
            <input type="password" name="confirm" required minLength={10} autoComplete="new-password" />
          </label>
          <small className="muted">At least 10 characters, with a letter and a number.</small>
          {state.error && <p className="form-msg error">{state.error}</p>}
          <button className="primary" disabled={resetting}>
            {resetting ? <Loader2 className="spin" size={17} /> : <KeyRound size={17} />} Set new password
          </button>
        </form>
      )}
      <div className="unlock-links">
        <button type="button" className="text-link" onClick={onBack}>
          <ArrowLeft size={15} /> Back to password
        </button>
        {codeSent && (
          <form action={send}>
            <button className="text-link" disabled={sending}>
              Send a new code
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
