import { Pool, type PoolConfig } from "pg";

/**
 * Build a pg Pool config from DATABASE_URL.
 *
 * We strip `sslmode` / `channel_binding` from the URL and set `ssl` on the Pool
 * directly. `pg` v8 warns loudly (a "SECURITY WARNING" that Next's dev overlay
 * surfaces as an error) whenever it parses `sslmode=require` from a URL — this
 * avoids that while keeping the connection encrypted.
 *
 * Local Postgres (no ssl in the URL, host is localhost) connects without TLS.
 */
export function poolConfig(url = process.env.DATABASE_URL || ""): PoolConfig {
  const wantsSsl = /sslmode=(require|verify|prefer)/i.test(url) || /neon\.tech/i.test(url);
  const clean = url
    .replace(/([?&])(sslmode|channel_binding|options)=[^&]*/gi, "$1")
    .replace(/[?&]+$/, "")
    .replace(/\?&/, "?")
    .replace(/&&/g, "&");

  return {
    connectionString: clean || undefined,
    max: Number(process.env.DB_POOL_MAX) || 10,
    // Managed providers (Neon) present valid certs; keep verification on. Set
    // PGSSL_NO_VERIFY=1 only if a proxy in the path breaks the chain.
    ssl: wantsSsl
      ? { rejectUnauthorized: process.env.PGSSL_NO_VERIFY !== "1" }
      : undefined,
  };
}

export function makePool(url?: string) {
  return new Pool(poolConfig(url));
}
