import { randomBytes, randomInt, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq, lt, sql } from "drizzle-orm";
import { db, revokedSessions, users } from "./db";

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

/**
 * Session lifetime. Was 7 days, which VAPT flagged (IDX-006) as an excessive
 * window for a stolen token. One working day is the default; override with
 * SESSION_TTL_HOURS.
 */
const SESSION_TTL_HOURS = (() => {
  const v = Number(process.env.SESSION_TTL_HOURS);
  return Number.isFinite(v) && v > 0 && v <= 168 ? v : 8;
})();
const SESSION_TTL_SECONDS = SESSION_TTL_HOURS * 3600;

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
  // `jti` makes an individual session addressable, so logout can revoke this
  // token specifically rather than merely dropping the browser's copy.
  const token = await new SignJWT({ role: u.role, name: u.name, email: u.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(u.id)
    .setJti(randomUUID())
    .setExpirationTime(`${SESSION_TTL_HOURS}h`)
    .setIssuedAt()
    .sign(secret);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/**
 * Sign out. Records the token's jti server-side BEFORE clearing the cookie, so
 * a copy captured earlier (VAPT IDX-005) stops working immediately rather than
 * staying valid until it expires.
 */
/**
 * Add a token's jti to the revocation list. Split out from destroySession so it
 * can be exercised directly by tests — the cookie plumbing around it cannot be.
 * Returns the jti that was revoked, or null if there was nothing to revoke.
 */
export async function revokeSessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    const jti = typeof payload.jti === "string" ? payload.jti : null;
    if (!jti) return null;

    const expiresAt = payload.exp
      ? new Date(payload.exp * 1000)
      : new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

    await db
      .insert(revokedSessions)
      .values({
        jti,
        userId: payload.sub ? String(payload.sub) : null,
        expiresAt,
      })
      .onConflictDoNothing();

    // A revocation only matters while the token could still be presented; drop
    // rows past that point so the table stays small.
    await db
      .delete(revokedSessions)
      .where(lt(revokedSessions.expiresAt, new Date()));

    return jti;
  } catch {
    // Unverifiable token — nothing worth revoking.
    return null;
  }
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await revokeSessionToken(token);
  jar.delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const userId = String(payload.sub);

    // Tokens minted before session revocation existed carry no jti and cannot
    // be revoked, so they are refused outright. That also retires every
    // outstanding 7-day token from the old scheme in one step.
    const jti = typeof payload.jti === "string" ? payload.jti : null;
    if (!jti) return null;

    // Re-check the account AND the revocation list on every request, so a
    // deactivated user, a demoted user, or a signed-out token loses access
    // immediately. Both checks ride on one round trip.
    const [u] = await db
      .select({
        role: users.role,
        name: users.name,
        email: users.email,
        active: users.active,
        revoked: sql<boolean>`exists (
          select 1 from revoked_sessions rs where rs.jti = ${jti}
        )`,
      })
      .from(users)
      .where(eq(users.id, userId));
    if (!u || !u.active || u.revoked) return null;

    return { userId, role: u.role, name: u.name, email: u.email };
  } catch {
    return null;
  }
}

/**
 * Assert a signed-in session inside a SERVER ACTION.
 *
 * A page-level `redirect()` guard protects only the page render. Server actions
 * are separately addressable POST endpoints — Next exposes them by id — so an
 * action that reads the session without requiring it can be invoked by anyone
 * who has ever seen the page. That is how an unauthenticated /submit POST
 * succeeded (VAPT IDX-005 follow-up). Every action that changes state must call
 * this or requireRole().
 */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHORIZED");
  return s;
}

export async function requireRole(...roles: string[]): Promise<Session> {
  const s = await getSession();
  if (!s || (roles.length && !roles.includes(s.role))) {
    throw new Error("UNAUTHORIZED");
  }
  return s;
}

// ---- email-only sign-in ------------------------------------------------------
//
// SECURITY: this path checks NO PASSWORD. Anyone who can reach /login and knows
// an admin address gets full admin. It exists because the portal was asked for
// an email-only flow while the award cycle is being set up; `verifyLogin` above
// is left intact so password auth can be restored by swapping the server action
// in app/login/page.tsx back to it.
//
// Which addresses are admins is config, not code:
//   ADMIN_EMAILS=admin@jazz.com,someone.else@jazz.com.pk
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "admin@jazz.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/** Evaluation-committee members. REVIEWER_EMAILS=a@jazz.com.pk,b@jazz.com.pk */
export const REVIEWER_EMAILS = (process.env.REVIEWER_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/**
 * Approvers see the same aggregate view as an administrator and additionally
 * sign off on each submission. They cannot manage accounts.
 */
export const APPROVER_EMAILS = (process.env.APPROVER_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export function isReviewerEmail(email: string): boolean {
  return REVIEWER_EMAILS.includes(email.trim().toLowerCase());
}

export function isApproverEmail(email: string): boolean {
  return APPROVER_EMAILS.includes(email.trim().toLowerCase());
}

/** Roles allowed to open the aggregate administration view. */
export function canSeeAggregate(role: string): boolean {
  return role === "admin" || role === "approver";
}

/** Only these roles may record an approval decision. */
export function canApprove(role: string): boolean {
  return role === "approver";
}

/**
 * Roles that may open the evaluation queue and score a submission.
 *
 * Approvers score alongside reviewers — their scores count in the panel
 * average exactly like anyone else's. Approving is a separate, additional act
 * recorded in `approvals`, and neither changes the other.
 */
export function canEvaluate(role: string): boolean {
  return role === "reviewer" || role === "admin" || role === "approver";
}

/** The role the configuration says an address should have. */
export function configuredRole(
  email: string,
): "admin" | "approver" | "reviewer" | "nominee" {
  if (isAdminEmail(email)) return "admin";
  if (isApproverEmail(email)) return "approver";
  if (isReviewerEmail(email)) return "reviewer";
  return "nominee";
}

/**
 * Promotion ladder — used to raise a role, never lower it. `approver` sits
 * above `reviewer` because it carries the aggregate view as well.
 */
const RANK: Record<string, number> = {
  nominee: 0,
  reviewer: 1,
  approver: 2,
  admin: 3,
};

/** Where a role lands after signing in. */
export function homeFor(role: string): string {
  if (role === "admin" || role === "approver") return "/admin";
  if (role === "reviewer") return "/committee/queue";
  // Nominees reach sign-in by clicking "Submit an initiative" on the public
  // landing page, so send them to the form itself — returning them to the
  // landing page would make them click the same button twice.
  return "/submit";
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] || email;
  const words = local
    .split(/[._\-+]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.join(" ") || email;
}

/**
 * Sign in with just an email address, provisioning the account on first use.
 * Returns null for a malformed address or a deactivated account.
 *
 * An existing account keeps the role it already has — signing in must never
 * demote a reviewer or admin. The one exception is promotion: an address listed
 * in ADMIN_EMAILS is raised to admin, so the configured admin cannot be locked
 * out by a stale row.
 */
export async function signInByEmail(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;

  const [existing] = await db.select().from(users).where(eq(users.email, email));

  if (existing) {
    if (!existing.active) return null;

    // Promotion only. Signing in must never strip a role someone already has
    // — an admin listed in REVIEWER_EMAILS stays an admin — but an address
    // newly added to a list is raised on its next sign-in.
    const want = configuredRole(email);
    if ((RANK[want] ?? 0) > (RANK[existing.role] ?? 0)) {
      const [promoted] = await db
        .update(users)
        .set({ role: want })
        .where(eq(users.id, existing.id))
        .returning();
      return promoted;
    }
    return existing;
  }

  // First sight of this address — create the account. The password hash is a
  // random secret nobody holds, so these accounts cannot be used on the
  // password route even if it is re-enabled.
  const [created] = await db
    .insert(users)
    .values({
      email,
      name: nameFromEmail(email),
      role: configuredRole(email),
      passwordHash: await hashPassword(randomBytes(32).toString("hex")),
    })
    .returning();

  return created;
}

// ---- pending sign-in (between "email entered" and "code verified") ---------
//
// The address and the issued code's id are carried in a short-lived signed
// cookie rather than a query string, so a visitor cannot swap in someone
// else's address at the verify step. It grants nothing on its own — the code
// still has to match.
const PENDING = "aia_pending";
const PENDING_TTL_MINUTES = 15;

export type PendingLogin = { email: string; codeId: string };

export async function setPendingLogin(p: PendingLogin) {
  const token = await new SignJWT({ email: p.email, codeId: p.codeId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PENDING_TTL_MINUTES}m`)
    .sign(secret);
  (await cookies()).set(PENDING, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PENDING_TTL_MINUTES * 60,
  });
}

export async function getPendingLogin(): Promise<PendingLogin | null> {
  const token = (await cookies()).get(PENDING)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const email = String(payload.email || "");
    const codeId = String(payload.codeId || "");
    if (!email || !codeId) return null;
    return { email, codeId };
  } catch {
    return null;
  }
}

export async function clearPendingLogin() {
  (await cookies()).delete(PENDING);
}
