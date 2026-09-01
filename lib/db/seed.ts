import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "./schema";

// Creates ONE bootstrap admin. Everyone else (reviewers, more admins/chairs) is
// added afterwards from /admin/users while signed in as this account.
//   BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD  — set both in .env
//   BOOTSTRAP_ADMIN_NAME                              — optional
// Local dev fallback: admin@jazzworld.test / password123
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@jazzworld.test")
    .trim()
    .toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "password123";
  const name = process.env.BOOTSTRAP_ADMIN_NAME || "Awards Admin";

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));

  if (existing) {
    console.log(`bootstrap admin already present: ${email}`);
  } else {
    await db.insert(schema.users).values({
      email,
      name,
      role: "admin",
      passwordHash: await bcrypt.hash(password, 10),
    });
    console.log(
      `bootstrap admin created: ${email}` +
        (process.env.BOOTSTRAP_ADMIN_PASSWORD ? "" : "  (password: password123)"),
    );
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
