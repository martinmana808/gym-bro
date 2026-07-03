import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// Common supertype of the postgres-js and PGlite drivers so callers get one API.
type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { __gymDb?: Promise<Db> };

async function createDb(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    const client = postgres(process.env.DATABASE_URL, { max: 5 });
    return drizzle(client, { schema });
  }
  // Local dev: embedded Postgres (PGlite) stored in ./.pglite, migrated on boot.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite("./.pglite");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

export function getDb(): Promise<Db> {
  if (!globalForDb.__gymDb) globalForDb.__gymDb = createDb();
  return globalForDb.__gymDb;
}

export { schema };
