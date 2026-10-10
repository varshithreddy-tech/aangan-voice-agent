// Applies db/schema.sql to Neon. Usage:
//   npm run db:migrate -- test   (the "test" branch, NEON_TEST_DATABASE_URL)
//   npm run db:migrate -- prod   (production, NEON_DATABASE_URL)
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

config({ path: ".env" });

const target = process.argv[2];
const url = target === "prod" ? process.env.NEON_DATABASE_URL : target === "test" ? process.env.NEON_TEST_DATABASE_URL : undefined;
if (!url) {
  console.error('Usage: npm run db:migrate -- test|prod  (and set the matching URL in .env)');
  process.exit(1);
}

const sql = neon(url);
const statements = readFileSync("db/schema.sql", "utf8")
  .split(/;\s*$/m)
  .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

async function main() {
  for (const s of statements) await sql.query(s);
  const cols = await sql.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'calls'");
  console.log(`Applied ${statements.length} statements to ${target}. calls has ${cols[0].n} columns.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
