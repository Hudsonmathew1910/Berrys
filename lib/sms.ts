import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { HttpError } from "@/lib/http-error";

/**
 * Mobile-number OTP. Pick a provider with SMS_PROVIDER:
 *
 *  - "dev"    (default in `npm run dev`) — no SMS is sent; the code is printed
 *             in the terminal running the dev server. Free, for testing only.
 *             Refused in production.
 *  - "twilio" — Twilio Verify: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 *             TWILIO_VERIFY_SERVICE_SID.
 *  - "msg91"  — MSG91 OTP API: MSG91_AUTH_KEY, MSG91_TEMPLATE_ID
 *             (a DLT-approved OTP template).
 */

type Provider = {
  send(phone: string): Promise<void>;
  check(phone: string, code: string): Promise<boolean>;
};

function env(name: string) {
  const v = process.env[name];
  if (!v)
    throw new Error(`Missing environment variable ${name} for SMS_PROVIDER=${process.env.SMS_PROVIDER}.`);
  return v;
}

export function smsProviderName() {
  return process.env.SMS_PROVIDER || (process.env.NODE_ENV === "production" ? "" : "dev");
}

export const isDevOtp = () => smsProviderName() === "dev";

// ---- dev: codes stored (hashed) in our own table, printed to the console ----
const OTP_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const hashCode = (phone: string, code: string) =>
  createHash("sha256").update(`${phone}:${code}`).digest("hex");

const devProvider: Provider = {
  async send(phone) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const values = {
      phone,
      codeHash: hashCode(phone, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      attempts: 0,
    };
    await getDb()
      .insert(schema.otpCodes)
      .values(values)
      .onConflictDoUpdate({ target: schema.otpCodes.phone, set: values });
    console.log(`\n[DEV OTP] Login code for ${phone}: ${code}  (valid 10 minutes)\n`);
  },
  async check(phone, code) {
    const db = getDb();
    const [row] = await db
      .update(schema.otpCodes)
      .set({ attempts: sql`${schema.otpCodes.attempts} + 1` })
      .where(eq(schema.otpCodes.phone, phone))
      .returning();
    if (!row || row.expiresAt < new Date() || row.attempts > MAX_ATTEMPTS) return false;
    const a = Buffer.from(row.codeHash);
    const b = Buffer.from(hashCode(phone, code));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    await db.delete(schema.otpCodes).where(eq(schema.otpCodes.phone, phone));
    return true;
  },
};

// ---- Twilio Verify — https://www.twilio.com/docs/verify/api ----
const twilioProvider: Provider = {
  async send(phone) {
    await twilio("Verifications", { To: phone, Channel: "sms" });
  },
  async check(phone, code) {
    const res = await twilio("VerificationCheck", { To: phone, Code: code }, true);
    return res?.status === "approved";
  },
};

async function twilio(path: string, form: Record<string, string>, allow404 = false) {
  const auth = Buffer.from(`${env("TWILIO_ACCOUNT_SID")}:${env("TWILIO_AUTH_TOKEN")}`).toString("base64");
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${env("TWILIO_VERIFY_SERVICE_SID")}/${path}`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form),
    },
  );
  // 404 on VerificationCheck = expired / already used code.
  if (allow404 && res.status === 404) return null;
  if (!res.ok) throw new Error(`Twilio ${path} failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as { status?: string };
}

// ---- MSG91 OTP — https://docs.msg91.com/otp ----
const msg91Provider: Provider = {
  async send(phone) {
    const url = new URL("https://control.msg91.com/api/v5/otp");
    url.search = new URLSearchParams({
      template_id: env("MSG91_TEMPLATE_ID"),
      mobile: phone.replace(/^\+/, ""),
      otp_length: "6",
      otp_expiry: "10",
    }).toString();
    const res = await fetch(url, { method: "POST", headers: { authkey: env("MSG91_AUTH_KEY") } });
    const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok || body.type !== "success") throw new Error(`MSG91 send failed: ${JSON.stringify(body)}`);
  },
  async check(phone, code) {
    const url = new URL("https://control.msg91.com/api/v5/otp/verify");
    url.search = new URLSearchParams({ otp: code, mobile: phone.replace(/^\+/, "") }).toString();
    const res = await fetch(url, { headers: { authkey: env("MSG91_AUTH_KEY") } });
    const body = (await res.json().catch(() => ({}))) as { type?: string };
    return res.ok && body.type === "success";
  },
};

function provider(): Provider {
  const name = smsProviderName();
  if (name === "dev") {
    if (process.env.NODE_ENV === "production") {
      throw new HttpError(503, "Mobile login isn’t available right now.");
    }
    return devProvider;
  }
  if (name === "twilio") return twilioProvider;
  if (name === "msg91") return msg91Provider;
  throw new HttpError(503, "Mobile login isn’t set up yet. Please continue with Google.");
}

export const sendOtp = (phone: string) => provider().send(phone);
export const checkOtp = (phone: string, code: string) => provider().check(phone, code);
