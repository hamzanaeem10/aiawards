"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, users, auditLog } from "@/lib/db";
import { requireRole, hashPassword, generatePassword } from "@/lib/auth";

type Result = { ok: boolean; password?: string; error?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Admins create REVIEWER accounts only. */
export async function createReviewer(input: {
  name: string;
  email: string;
}): Promise<Result> {
  const s = await requireRole("admin");
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (!name) return { ok: false, error: "Enter a name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const [dupe] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (dupe) return { ok: false, error: "That email already has an account." };

  const password = generatePassword();
  await db.insert(users).values({
    name,
    email,
    role: "reviewer",
    passwordHash: await hashPassword(password),
    createdByUserId: s.userId,
  });
  await db.insert(auditLog).values({
    actorUserId: s.userId,
    action: "user.create",
    target: email,
    meta: { role: "reviewer" },
  });

  revalidatePath("/admin/users");
  return { ok: true, password };
}

export async function resetReviewerPassword(userId: string): Promise<Result> {
  const s = await requireRole("admin");
  if (!UUID.test(userId)) return { ok: false, error: "Not a reviewer account." };
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || u.role !== "reviewer") {
    return { ok: false, error: "Not a reviewer account." };
  }
  const password = generatePassword();
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(users.id, userId));
  await db.insert(auditLog).values({
    actorUserId: s.userId,
    action: "user.reset_password",
    target: u.email,
  });

  revalidatePath("/admin/users");
  return { ok: true, password };
}

export async function setReviewerActive(userId: string, active: boolean) {
  const s = await requireRole("admin");
  if (!UUID.test(userId)) return;
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || u.role !== "reviewer") return;
  await db.update(users).set({ active }).where(eq(users.id, userId));
  await db.insert(auditLog).values({
    actorUserId: s.userId,
    action: active ? "user.activate" : "user.deactivate",
    target: u.email,
  });
  revalidatePath("/admin/users");
}
