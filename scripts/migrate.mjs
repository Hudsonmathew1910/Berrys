// Applies pending migrations from ./drizzle (npm run db:migrate).
// Uses drizzle-orm's migrator directly: drizzle-kit migrate can exit 1 without
// saying why, while this prints the real database error.
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file is optional
  }
}

// Migrations need a session connection (port 5432), not the transaction pooler.
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Set DIRECT_URL or DATABASE_URL (in .env) first.");
  process.exit(1);
}
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const client = postgres(url, { max: 1, ssl: local ? false : "require", onnotice: () => {} });

const applied = async () => {
  try {
    const [row] = await client`select count(*)::int as n from drizzle.__drizzle_migrations`;
    return row.n;
  } catch {
    return 0; // fresh database
  }
};

let code = 0;
try {
  const before = await applied();
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  const after = await applied();
  console.log(
    after > before
      ? `Applied ${after - before} migration(s); ${after} in total.`
      : `Already up to date (${after} migrations).`,
  );
} catch (e) {
  code = 1;
  console.error("Migration failed:", e.cause?.message || e.message);
} finally {
  await client.end();
}
process.exit(code);
