import { runMigrations } from "../scripts/migrate";
import { Pool } from "pg";

const URL = "postgres://anamnese:anamnese_dev@localhost:5432/anamnese_test";

export default async function setup() {
  // Audit-Trigger blockt TRUNCATE; Testdatenbank wird daher per Schema-Reset geleert.
  const pool = new Pool({ connectionString: URL });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await pool.end();
  await runMigrations(URL);
}
