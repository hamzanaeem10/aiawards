import { randomInt } from "crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, users } from "./db";

/** A readable 14-char password: no ambiguous chars (0/O, 1/l/I). */
export function generatePassword(len = 14): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[randomInt(chars.length)];
  return out;
}

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET || "dev-insecure-secret-change-me",
);
const COOKIE = "aia_session";

export type Session = { userId: string; role: string; name: string; email: string };

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyLogin(email: string, password: string) {
  const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  if (!u || !u.active) return null;
  if (!(await bcrypt.compare(password, u.passwordHash))) return null;
  return u;
}

export async function createSession(u: {
  id: string;
  role: string;
  name: string;
  email: string;
}) {
  const token = await new SignJWT({ role: u.role, name: u.name, email: u.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(u.id)
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(secret);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const userId = String(payload.sub);

    // Re-check the account against the DB on every request, so a deactivated or
    // demoted user loses access immediately — not whenever their 7-day token
    // happens to expire. (One primary-key lookup.)
    const [u] = await db
      .select({
        role: users.role,
        name: users.name,
        email: users.email,
        active: users.active,
      })
      .from(users)
      .where(eq(users.id, userId));
    if (!u || !u.active) return null;

    return { userId, role: u.role, name: u.name, email: u.email };
  } catch {
    return null;
  }
}

export async function requireRole(...roles: string[]): Promise<Session> {
  const s = await getSession();
  if (!s || (roles.length && !roles.includes(s.role))) {
    throw new Error("UNAUTHORIZED");
  }
  return s;
}
