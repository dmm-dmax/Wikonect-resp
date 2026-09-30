import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const g = globalThis as unknown as { __pool?: Pool };

function pool(): Pool {
  if (!g.__pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL fehlt");
    g.__pool = new Pool({ connectionString: url, max: 10 });
  }
  return g.__pool;
}

let _db: NodePgDatabase<typeof schema> | undefined;
export function db(): NodePgDatabase<typeof schema> {
  _db ??= drizzle(pool(), { schema });
  return _db;
}

export type Db = NodePgDatabase<typeof schema>;
/** Datenbank oder laufende Transaktion. */
export type Conn = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
