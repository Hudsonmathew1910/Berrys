import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env files on its own.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file is optional
  }
}

/** Encrypted connection (sslmode=require) for remote databases; local ones stay plain. */
function withSsl(url: string) {
  if (!url || /@(localhost|127.0.0.1)[:/]/.test(url) || /[?&]sslmode=/.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "sslmode=require";
}

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  // Migrations need a session connection (port 5432), not the transaction pooler.
  dbCredentials: { url: withSsl(process.env.DIRECT_URL || process.env.DATABASE_URL || "") },
  strict: true,
});
