import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env files on its own.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file is optional
  }
}

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  // Migrations need a session connection (port 5432), not the transaction pooler.
  dbCredentials: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || "" },
  strict: true,
});
