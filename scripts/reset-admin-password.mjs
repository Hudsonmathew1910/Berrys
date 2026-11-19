#!/usr/bin/env node
/**
 * Clears a dashboard password so the person creates a new one on their next
 * visit (they must still log in with their Google account first).
 *
 *   npm run reset-admin-password -- owner@gmail.com
 *
 * Reads DIRECT_URL / DATABASE_URL from .env.local or .env.
 */
import postgres from "postgres";

for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {}
}

const email = (process.argv[2] || process.env.STORE_OWNER_EMAIL || "").trim().toLowerCase();
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!email) {
  console.error("Usage: npm run reset-admin-password -- <google-email>");
  process.exit(1);
}
if (!url) {
  console.error("DATABASE_URL / DIRECT_URL is not set.");
  process.exit(1);
}

const local = /@(localhost|127.0.0.1)[:/]/.test(url);
const sql = postgres(url, { prepare: false, max: 1, ssl: local ? false : "require" });
try {
  const rows = await sql`
    update staff_members set password_hash = null where email = ${email}
    returning id, role`;
  if (!rows.length) {
    console.error(`No team member with the email ${email}.`);
    process.exitCode = 1;
  } else {
    await sql`delete from dashboard_sessions where staff_id = ${rows[0].id}`;
    await sql`insert into activity_log (actor, action, target) values ('command line', 'Reset dashboard password', ${email})`;
    console.log(
      `Password cleared for ${email} (${rows[0].role}). They will create a new one on their next visit.`,
    );
  }
} finally {
  await sql.end();
}
