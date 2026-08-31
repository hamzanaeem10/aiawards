import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import bcrypt from "bcryptjs";
import * as schema from "./schema";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const pw = await bcrypt.hash("password123", 10);
  const people = [
    { email: "admin@jazzworld.test", name: "Awards Admin", role: "admin" },
    { email: "chair@jazzworld.test", name: "Panel Chair", role: "chair" },
    { email: "reviewer1@jazzworld.test", name: "Reviewer One", role: "reviewer" },
    { email: "reviewer2@jazzworld.test", name: "Reviewer Two", role: "reviewer" },
    { email: "nominee@jazzworld.test", name: "Sample Nominee", role: "nominee" },
  ];

  for (const p of people) {
    await db
      .insert(schema.users)
      .values({ ...p, passwordHash: pw })
      .onConflictDoNothing();
  }

  console.log("seeded users (password: password123):");
  people.forEach((p) => console.log(`  ${p.role.padEnd(9)} ${p.email}`));
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
