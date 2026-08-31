import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

// Cache the pool on the global in every environment — on serverless (Vercel) a
// warm function reuses it; set DB_POOL_MAX=1 there to stay within connection caps
// (or point DATABASE_URL at a pooled endpoint like Neon's -pooler host).
const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX) || 10,
  });

globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { schema };
export * from "./schema";
