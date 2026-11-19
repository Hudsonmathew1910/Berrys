import { Mail, Phone } from "lucide-react";
import type { Settings } from "@/lib/settings";
import { GoogleIcon } from "./google-icon";

/** Shown to customers while maintenance mode is on (Dashboard → Settings). */
export function MaintenancePage({ settings, loggedIn }: { settings: Settings; loggedIn: boolean }) {
  return (
    <main className="maintenance-page">
      <div className="maintenance-card">
        <span className="auth-mark">
          <img src={settings.logoUrl || "/images/berrys-mark.webp"} alt="" />
        </span>
        <span className="eyebrow">{settings.siteName.toUpperCase()}</span>
        <h1>We’ll be back soon</h1>
        <p>{settings.maintenanceMessage}</p>
        {(settings.supportEmail || settings.supportPhone) && (
          <p className="maintenance-contact">
            {settings.supportEmail && (
              <a href={`mailto:${settings.supportEmail}`}>
                <Mail size={16} /> {settings.supportEmail}
              </a>
            )}
            {settings.supportPhone && (
              <a href={`tel:${settings.supportPhone.replace(/\s+/g, "")}`}>
                <Phone size={16} /> {settings.supportPhone}
              </a>
            )}
          </p>
        )}
        {!loggedIn && (
          // A full page load is needed: /auth/google redirects to Google.
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a className="maintenance-team" href="/auth/google?next=/">
            <GoogleIcon size={15} /> Team sign in
          </a>
        )}
      </div>
    </main>
  );
}
