import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { makePool } from "./pool";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

// Cache the pool on the global — a warm serverless function (Vercel) reuses it.
// Set DB_POOL_MAX=1 there, or point DATABASE_URL at Neon's -pooler host.
const pool = globalForDb.pool ?? makePool();
globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { schema };
export * from "./schema";
