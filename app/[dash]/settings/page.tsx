import { SectionNav } from "@/components/dashboard/section-nav";
import {
  emailConfigured,
  emailProviderNames,
  emailProvidersReady,
  emailStats,
  providerDailyLimit,
} from "@/lib/email";
import { razorpayConfigured } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import Link from "next/link";
import { adminHref, adminPath, requirePage } from "@/lib/staff";
import { ActionForm } from "@/components/dashboard/action-form";
import { ImageField } from "@/components/dashboard/image-field";
import { StatusDot, Toggle } from "@/components/dashboard/settings-ui";
import { paymentModeAction, saveSettingsAction } from "../actions";

/** Names for the "Emails sent" breakdown. */
const emailKindLabels: Record<string, string> = {
  "order-confirmation": "Order confirmations",
  "team-new-order": "New order (team)",
  "status-update": "Order status updates",
  "login-alert": "Sign-in alerts",
  "sign-in-code": "Sign-in codes",
  "dashboard-reset": "Dashboard password codes",
  "refund-requested": "Refund requests (team)",
  "refund-received": "Refund receipts (customer)",
  "refund-verified": "Refunds to approve",
  "refund-decision": "Refund decisions",
  "refund-initiated": "Refunds sent (customer)",
  "refund-processed": "Refunds received (customer)",
  "refund-failed": "Refunds failed (customer)",
  "team-request": "Staff requests to approve",
};

const socialFields = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["youtube", "YouTube"],
  ["x", "X (Twitter)"],
  ["pinterest", "Pinterest"],
] as const;

export default async function SettingsPage() {
  await requirePage("settings");
  const s = await getSettings();
  const mail = emailConfigured();
  const ready = emailProvidersReady();
  // Each email type picks its own sender, so count every service against its own daily limit.
  const sent = await emailStats();
  const meters = await Promise.all(
    (["resend", "smtp"] as const)
      .filter((p) => ready[p])
      .map(async (p) => {
        const day = (await emailStats(p)).day;
        const limit = providerDailyLimit(s, p);
        return { p, day, limit, used: Math.min(100, Math.round((day / limit) * 100)) };
      }),
  );
  const used = Math.max(0, ...meters.map((m) => m.used));
  const setUp = (["resend", "smtp"] as const).filter((p) => ready[p]).map((p) => emailProviderNames[p]);
  const rzp = razorpayConfigured();
  const checks: [string, boolean, string][] = [
    ["Environment", true, process.env.NODE_ENV === "production" ? "Production" : "Development"],
    ["Database", !!process.env.DATABASE_URL, process.env.DATABASE_URL ? "Connected" : "DATABASE_URL missing"],
    [
      "Google login",
      !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      process.env.GOOGLE_CLIENT_ID ? "Configured" : "GOOGLE_CLIENT_ID / SECRET missing",
    ],
    ["Razorpay keys", rzp, rzp ? "Set" : "Not set"],
    [
      "Razorpay webhook",
      !!process.env.RAZORPAY_WEBHOOK_SECRET,
      process.env.RAZORPAY_WEBHOOK_SECRET ? "Secret set" : "RAZORPAY_WEBHOOK_SECRET not set",
    ],
    ["Email", mail, mail ? setUp.join(" + ") : "Not set up"],
    [
      "Store owner",
      !!process.env.STORE_OWNER_EMAIL,
      process.env.STORE_OWNER_EMAIL ? "STORE_OWNER_EMAIL set" : "STORE_OWNER_EMAIL missing",
    ],
    [
      "Dashboard address",
      adminPath() !== "berrys-admin",
      adminPath() !== "berrys-admin" ? "Custom ADMIN_PATH" : "Default — set ADMIN_PATH",
    ],
    [
      "Product images",
      !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      "Supabase Storage",
    ],
  ];
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const region = process.env.VERCEL_REGION;

  return (
    <div className="dash-page">
      <div className="dash-heading">
        <div>
          <h1>Settings</h1>
          <span className="muted">Changes apply to the website straight away.</span>
        </div>
      </div>
      <SectionNav
        items={[
          { id: "store", label: "Store details" },
          { id: "payments", label: "Payments" },
          { id: "shipping", label: "Shipping & returns" },
          { id: "emails", label: "Emails" },
          { id: "email-usage", label: "Emails sent" },
          { id: "maintenance", label: "Maintenance" },
          { id: "social", label: "Social media" },
          { id: "status", label: "System status" },
          { id: "logs", label: "Log settings" },
          { id: "seo", label: "SEO" },
        ]}
      />

      <div className="settings-grid">
        <section className="dash-panel" id="store">
          <h2>Store details</h2>
          <ActionForm action={saveSettingsAction} saveAll>
            <input type="hidden" name="section" value="store" />
            <div className="form-grid">
              <label>
                Website name
                <input name="siteName" required maxLength={40} defaultValue={s.siteName} />
              </label>
              <label>
                Tagline
                <input name="tagline" maxLength={80} defaultValue={s.tagline} />
              </label>
              <label>
                Support email
                <input name="supportEmail" type="email" maxLength={120} defaultValue={s.supportEmail} />
              </label>
              <label>
                Contact number
                <input name="supportPhone" type="tel" maxLength={20} defaultValue={s.supportPhone} />
              </label>
              <label>
                WhatsApp number
                <input
                  name="whatsapp"
                  type="tel"
                  maxLength={20}
                  defaultValue={s.whatsapp}
                  placeholder="98765 43210"
                />
              </label>
              <label className="wide">
                Store address (shown at the bottom of every email)
                <textarea name="storeAddress" rows={2} maxLength={300} defaultValue={s.storeAddress} />
              </label>
            </div>
            <ImageField
              name="logoUrl"
              label="Logo (square)"
              initial={s.logoUrl}
              fallback="/images/berrys-mark.webp"
              hint="Shown in the header, footer and maintenance page. A square PNG, JPG or WebP works best."
            />
            <button className="primary">Save store details</button>
          </ActionForm>
        </section>

        <section className="dash-panel" id="payments">
          <h2>Payments</h2>
          <p>
            <StatusDot ok={rzp}>{rzp ? "Razorpay keys are set" : "Razorpay keys not set yet"}</StatusDot>
          </p>
          <ActionForm
            action={paymentModeAction}
            confirmOff={
              s.paymentMode === "razorpay"
                ? {
                    field: "on",
                    title: "Turn off Razorpay?",
                    confirmLabel: "Turn off and use demo payments",
                    message: (
                      <>
                        <p>
                          <b>Demo payments will switch on.</b> Customers will be able to place orders{" "}
                          <b>without paying anything</b>.
                        </p>
                        <p>
                          Demo orders are marked “DEMO” and deleted automatically 1 minute later, with their
                          stock put back. Nothing will be shipped or paid for.
                        </p>
                        <p>Only do this for testing. Turn Razorpay back on before real customers shop.</p>
                      </>
                    ),
                  }
                : undefined
            }
          >
            <Toggle
              name="on"
              title="Razorpay payments"
              checked={s.paymentMode === "razorpay"}
              text="Customers pay by UPI, cards, netbanking and wallets."
            />
            {s.paymentMode === "demo" && (
              <p className="demo-banner">
                <b>Demo payments are ON.</b> Anyone can check out without paying. Demo orders are marked
                “DEMO” and deleted automatically 1 minute later, with their stock put back.
              </p>
            )}
            <small className="muted">Turning Razorpay off switches demo payments on automatically.</small>
            <button className="outline">Save</button>
          </ActionForm>
        </section>

        <section className="dash-panel" id="shipping">
          <h2>Shipping & returns</h2>
          <ActionForm action={saveSettingsAction} saveAll>
            <input type="hidden" name="section" value="shipping" />
            <div className="form-grid">
              <label>
                Shipping charge (₹)
                <input name="shippingFee" type="number" min={0} max={100000} defaultValue={s.shippingFee} />
              </label>
              <label>
                Free shipping above (₹)
                <input
                  name="freeShippingAbove"
                  type="number"
                  min={0}
                  max={100000}
                  defaultValue={s.freeShippingAbove}
                />
              </label>
              <label>
                Return / refund window (days after delivery)
                <input name="returnDays" type="number" min={0} max={90} defaultValue={s.returnDays} />
              </label>
            </div>
            <small className="muted">
              Shipping 0 = always free. Free-above 0 = no free-shipping limit. Return window 0 = no returns.
            </small>
            <button className="primary">Save shipping</button>
          </ActionForm>
        </section>

        <section className="dash-panel" id="emails">
          <h2>Emails</h2>
          <p>
            <StatusDot ok={mail}>
              {mail
                ? `Set up: ${setUp.join(" and ")}`
                : "Email isn’t set up (RESEND_API_KEY, or SMTP_USER / SMTP_PASS)"}
            </StatusDot>
          </p>
          <ActionForm action={saveSettingsAction} saveAll>
            <input type="hidden" name="section" value="emails" />
            <p className="muted email-note">
              Turn each email on or off and choose which service sends it. If it fails or isn’t set up, the
              other service sends it instead.
            </p>
            <div className="email-type">
              <Toggle
                name="emailOrderStatus"
                title="Order status emails"
                text="Email the customer whenever their order is packed, shipped, delivered, cancelled or refunded."
                checked={s.emailOrderStatus}
              />
              <SenderPick name="senderOrderStatus" value={s.senderOrderStatus} ready={ready} />
            </div>
            <div className="email-type">
              <Toggle
                name="emailTeamNewOrder"
                title="New order emails to the team"
                text="Team members with “Email me every new order” ticked get each new paid order (never the store owner address)."
                checked={s.emailTeamNewOrder}
              />
              <SenderPick name="senderTeamNewOrder" value={s.senderTeamNewOrder} ready={ready} />
            </div>
            <div className="email-type">
              <Toggle
                name="emailLoginAlert"
                title="Sign-in alerts"
                text="Email people each time their account signs in to the website."
                checked={s.emailLoginAlert}
              />
              <SenderPick name="senderLoginAlert" value={s.senderLoginAlert} ready={ready} />
            </div>
            <div className="email-type">
              <Toggle
                name="emailSignIn"
                title="Sign in with email"
                text="Anyone can sign in with their email: we email a 6-digit code to prove it’s theirs. Same account as Google for that email. Needs Resend or Gmail SMTP set up."
                checked={s.emailSignIn}
              />
              <SenderPick name="senderSignIn" value={s.senderSignIn} ready={ready} />
            </div>
            <div className="email-type">
              <Toggle
                name="dashboardPasswordReset"
                title="Forgot dashboard password by email"
                text="“Forgot password?” on the dashboard lock screen emails a 6-digit code to the person’s Gmail."
                checked={s.dashboardPasswordReset}
              />
              <SenderPick name="senderPasswordReset" value={s.senderPasswordReset} ready={ready} />
            </div>
            <div className="email-type">
              <div className="setting-toggle static">
                <span className="setting-text">
                  <b>Other emails</b>
                  <small>
                    Order confirmations, refund requests and decisions, and staff requests to approve.
                  </small>
                </span>
                <span className="always-on">Always on</span>
              </div>
              <SenderPick name="emailPrimary" value={s.emailPrimary} ready={ready} />
            </div>
            <button className="primary">Save email settings</button>
          </ActionForm>
        </section>

        <section className={"dash-panel" + (used >= 80 ? " highlight" : "")} id="email-usage">
          <h2>Emails sent</h2>
          <p className="muted">
            Counted over the last 24 hours for each service. Resend’s free plan sends 100 a day (3,000 a
            month); a Gmail account about 500 (2,000 with Google Workspace). Past a limit, the other service
            sends instead (if it’s set up).
          </p>
          {meters.map((m) => (
            <div
              key={m.p}
              className="mail-meter"
              role="img"
              aria-label={`${m.day} of ${m.limit} emails sent with ${emailProviderNames[m.p]} in the last 24 hours`}
            >
              <div className="mail-meter-top">
                <b>{m.day.toLocaleString("en-IN")}</b>
                <span className="muted">
                  of {m.limit.toLocaleString("en-IN")} today with {emailProviderNames[m.p]}
                </span>
              </div>
              <div className={"mail-meter-bar" + (m.used >= 90 ? " danger" : m.used >= 70 ? " warn" : "")}>
                <span style={{ width: `${Math.max(m.used, m.day ? 2 : 0)}%` }} />
              </div>
              <small className="muted">
                {Math.max(0, m.limit - m.day).toLocaleString("en-IN")} left today
                {m.used >= 80 && " — close to the limit"}
              </small>
            </div>
          ))}
          <dl className="mail-stats">
            <div>
              <dt>Last 7 days</dt>
              <dd>{sent.week.toLocaleString("en-IN")}</dd>
            </div>
            <div>
              <dt>Last 30 days</dt>
              <dd>{sent.month.toLocaleString("en-IN")}</dd>
            </div>
            <div>
              <dt>Failed (24 h)</dt>
              <dd className={sent.failedDay ? "minus" : ""}>{sent.failedDay}</dd>
            </div>
          </dl>
          {sent.byKind.length > 0 && (
            <table className="dash-table compact">
              <tbody>
                {sent.byKind.map((k) => (
                  <tr key={k.kind}>
                    <td>{emailKindLabels[k.kind] ?? (k.kind || "Other")}</td>
                    <td className="num">{k.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <ActionForm action={saveSettingsAction} saveAll>
            <input type="hidden" name="section" value="emailLimit" />
            <div className="form-grid">
              <label>
                Resend daily limit
                <input
                  name="resendDailyLimit"
                  type="number"
                  min={10}
                  max={1000000}
                  required
                  defaultValue={s.resendDailyLimit}
                />
              </label>
              <label>
                Gmail SMTP daily limit
                <input
                  name="emailDailyLimit"
                  type="number"
                  min={10}
                  max={100000}
                  required
                  defaultValue={s.emailDailyLimit}
                />
              </label>
            </div>
            <small className="muted">
              Resend: 100 on the free plan. Gmail: 500 for a normal account, 2000 for Google Workspace.
            </small>
            <button className="outline">Save limits</button>
          </ActionForm>
        </section>

        <section className={"dash-panel" + (s.maintenance ? " highlight" : "")} id="maintenance">
          <h2>Maintenance mode</h2>
          <ActionForm action={saveSettingsAction} saveAll>
            <input type="hidden" name="section" value="maintenance" />
            <Toggle
              name="maintenance"
              title="Close the shop for maintenance"
              text="Customers see a “we’ll be back soon” page. The team still sees the shop and the dashboard."
              checked={s.maintenance}
            />
            <label>
              Message for customers
              <textarea
                name="maintenanceMessage"
                rows={2}
                maxLength={300}
                defaultValue={s.maintenanceMessage}
              />
            </label>
            <button className="primary">Save</button>
          </ActionForm>
        </section>

        <section className="dash-panel" id="social">
          <h2>Social media</h2>
          <ActionForm action={saveSettingsAction} saveAll>
            <input type="hidden" name="section" value="social" />
            <div className="form-grid">
              {socialFields.map(([k, label]) => (
                <label key={k}>
                  {label}
                  <input name={k} type="url" maxLength={300} defaultValue={s[k]} placeholder="https://…" />
                </label>
              ))}
            </div>
            <small className="muted">Shown in the website footer. Leave empty to hide.</small>
            <button className="primary">Save links</button>
          </ActionForm>
        </section>

        <section className="dash-panel" id="status">
          <h2>System status</h2>
          <ul className="status-list">
            {checks.map(([label, ok, text]) => (
              <li key={label}>
                <span>{label}</span>
                <StatusDot ok={ok}>{text}</StatusDot>
              </li>
            ))}
            {(version || region) && (
              <li>
                <span>Deployment</span>
                <span className="muted">
                  {version && `Version ${version}`}
                  {version && region && " · "}
                  {region && `Region ${region}`}
                </span>
              </li>
            )}
          </ul>
        </section>

        <section className="dash-panel" id="logs">
          <h2>Log settings</h2>
          <ActionForm action={saveSettingsAction} saveAll>
            <input type="hidden" name="section" value="logs" />
            <label>
              Keep errors for (days)
              <input name="errorLogDays" type="number" min={1} max={365} defaultValue={s.errorLogDays} />
            </label>
            <button className="outline">Save</button>
          </ActionForm>
          <p className="muted">
            See the <Link href={adminHref("errors")}>Error log</Link> and the{" "}
            <Link href={adminHref("activity")}>Activity log</Link>.
          </p>
        </section>

        <section className="dash-panel wide" id="seo">
          <h2>SEO (Google & link previews)</h2>
          <ActionForm action={saveSettingsAction} saveAll>
            <input type="hidden" name="section" value="seo" />
            <label>
              Page title <small className="muted">(up to 70 characters)</small>
              <input name="seoTitle" maxLength={70} defaultValue={s.seoTitle} />
            </label>
            <label>
              Description{" "}
              <small className="muted">(up to 170 characters — shown under the title on Google)</small>
              <textarea name="seoDescription" rows={2} maxLength={170} defaultValue={s.seoDescription} />
            </label>
            <label>
              Keywords <small className="muted">(comma separated)</small>
              <input name="seoKeywords" maxLength={200} defaultValue={s.seoKeywords} />
            </label>
            <ImageField
              name="seoImage"
              label="Share image (WhatsApp and Facebook link previews)"
              initial={s.seoImage}
              fallback="/images/berrys-logo-full.webp"
              hint="1200×630 works best."
            />
            <button className="primary">Save SEO</button>
          </ActionForm>
        </section>
      </div>
    </div>
  );
}

/** "Send with" picker under an email type's on/off switch. */
function SenderPick({
  name,
  value,
  ready,
}: {
  name: string;
  value: "resend" | "smtp";
  ready: Record<"resend" | "smtp", boolean>;
}) {
  return (
    <label className="sender-pick">
      <span>Send with</span>
      <select name={name} defaultValue={value}>
        <option value="resend">Resend{ready.resend ? "" : " (not set up)"}</option>
        <option value="smtp">Gmail SMTP{ready.smtp ? "" : " (not set up)"}</option>
      </select>
    </label>
  );
}
