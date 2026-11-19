"use client";
import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

/** Friendly error screen; reports the crash to Settings → Developer → Error log. */
export function ErrorView({
  error,
  reset,
  home = "/",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  home?: string;
}) {
  useEffect(() => {
    // Server errors (with a digest) are already logged on the server.
    if (error.digest) return;
    fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: String(error.message).slice(0, 500), path: location.pathname }),
    }).catch(() => {});
  }, [error]);

  return (
    <div className="page-section error-view">
      <span className="eyebrow">SOMETHING WENT WRONG</span>
      <h1 className="page-title">Oops — that didn’t load.</h1>
      <p className="muted">Please try again. If it keeps happening, we’ve been told and we’re on it.</p>
      <div className="error-actions">
        <button className="primary" onClick={reset}>
          <RotateCcw size={16} /> Try again
        </button>
        <a className="outline" href={home}>
          Go home
        </a>
      </div>
    </div>
  );
}
