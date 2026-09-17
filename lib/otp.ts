import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { and, eq, gt, isNull, lt, ne, sql } from "drizzle-orm";
import { db, loginCodes } from "./db";

export const CODE_LENGTH = 6;
export const CODE_TTL_MINUTES = 10;
/** Wrong guesses allowed against one code before it is burned. */
const MAX_ATTEMPTS = 5;
/** Codes one address may request inside the window, to stop mail-bombing. */
const MAX_PER_WINDOW = num("OTP_MAX_PER_EMAIL", 3);
const WINDOW_MINUTES = num("OTP_WINDOW_MINUTES", 15);

/**
 * Per-requester limits. The per-email limit alone is trivially bypassed:
 * vary one character in the address and the budget resets, so a single device
 * can pull unlimited codes (and send unlimited mail). These bind the budget to
 * the requester as well.
 *
 * MAX_EMAILS_PER_IP is the one that stops enumeration — a real person signs in
 * with one address, so a handful per hour is generous while cutting off
 * incrementing-address abuse immediately.
 */
const MAX_PER_IP = num("OTP_MAX_PER_IP", 12);
const MAX_EMAILS_PER_IP = num("OTP_MAX_EMAILS_PER_IP", 5);
const IP_EMAIL_WINDOW_MINUTES = num("OTP_IP_EMAIL_WINDOW_MINUTES", 60);

function num(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Which addresses may sign in. The internal relay accepts *any* recipient
 * (including external domains), so without this an outsider could request a
 * code for their own mailbox and be handed a nominee account.
 */
export const ALLOWED_EMAIL_DOMAINS = (
  // jazzcash.pk is included because JazzCash staff are in the same Active
  // Directory and are covered by the same SSO rules, so they are legitimate
  // nominees. Override per-environment with ALLOWED_EMAIL_DOMAINS.
  process.env.ALLOWED_EMAIL_DOMAINS ?? "jazz.com.pk,jazz.com,jazzcash.pk"
)
  .split(",")
  .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isEmailAllowed(email: string): boolean {
  if (!EMAIL_RE.test(email)) return false;
  if (ALLOWED_EMAIL_DOMAINS.length === 0) return true;
  const domain = email.split("@")[1] ?? "";
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

/**
 * Keyed hash, not a plain digest. A 6-digit code has only a million
 * possibilities, so an unkeyed SHA-256 in the database could be reversed
 * instantly with a lookup table; the HMAC key (AUTH_SECRET) is not in the
 * database, so a database reader alone cannot recover a live code.
 */
function hashCode(email: string, code: string): string {
  const key = process.env.AUTH_SECRET || "dev-insecure-secret-change-me";
  return createHmac("sha256", key).update(`${email}:${code}`).digest("hex");
}

function equalHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  if (x.length !== y.length || x.length === 0) return false;
  return timingSafeEqual(x, y);
}

/** Cryptographically random, zero-padded, no leading-digit bias. */
function generateCode(): string {
  const max = 10 ** CODE_LENGTH;
  return String(randomInt(0, max)).padStart(CODE_LENGTH, "0");
}

export type IssueResult =
  | { ok: true; code: string; codeId: string; expiresAt: Date }
  | { ok: false; reason: "rate_limited" | "ip_rate_limited" };

/**
 * Mint a code for an address. The caller mails it — this function never logs
 * it. Any earlier unconsumed code for the address is invalidated, so only the
 * newest code in someone's inbox works.
 */
export async function issueCode(
  email: string,
  requestIp?: string | null,
): Promise<IssueResult> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000);

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginCodes)
    .where(and(eq(loginCodes.email, email), gt(loginCodes.createdAt, windowStart)));

  if (n >= MAX_PER_WINDOW) return { ok: false, reason: "rate_limited" };

  // Requester-bound limits. Skipped when the address is unknown (no proxy
  // header) rather than failing open on a shared bucket for every such caller.
  if (requestIp) {
    const [{ ipCount }] = await db
      .select({ ipCount: sql<number>`count(*)::int` })
      .from(loginCodes)
      .where(
        and(eq(loginCodes.requestIp, requestIp), gt(loginCodes.createdAt, windowStart)),
      );
    if (ipCount >= MAX_PER_IP) return { ok: false, reason: "ip_rate_limited" };

    // Distinct addresses this requester has asked for, over a longer window.
    const emailWindow = new Date(Date.now() - IP_EMAIL_WINDOW_MINUTES * 60_000);
    const [{ distinctEmails }] = await db
      .select({
        distinctEmails: sql<number>`count(distinct ${loginCodes.email})::int`,
      })
      .from(loginCodes)
      .where(
        and(
          eq(loginCodes.requestIp, requestIp),
          gt(loginCodes.createdAt, emailWindow),
          ne(loginCodes.email, email),
        ),
      );
    if (distinctEmails >= MAX_EMAILS_PER_IP) {
      return { ok: false, reason: "ip_rate_limited" };
    }
  }

  // Supersede any live code for this address.
  await db
    .update(loginCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(loginCodes.email, email), isNull(loginCodes.consumedAt)));

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000);

  const [row] = await db
    .insert(loginCodes)
    .values({
      email,
      codeHash: hashCode(email, code),
      expiresAt,
      requestIp: requestIp ?? null,
    })
    .returning({ id: loginCodes.id });

  // Opportunistic sweep of long-dead rows; keeps the table from growing
  // without a scheduled job (there is no background worker in this app).
  await db
    .delete(loginCodes)
    .where(lt(loginCodes.expiresAt, new Date(Date.now() - 24 * 3600_000)));

  return { ok: true, code, codeId: row.id, expiresAt };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" };

/**
 * Check a submitted code against one specific issued row. Single use: a
 * success consumes the row, and running out of attempts burns it too.
 */
export async function verifyCode(
  codeId: string,
  email: string,
  submitted: string,
): Promise<VerifyResult> {
  const cleaned = submitted.replace(/\D/g, "");

  const [row] = await db
    .select()
    .from(loginCodes)
    .where(eq(loginCodes.id, codeId));

  if (!row || row.email !== email) return { ok: false, reason: "invalid" };
  if (row.consumedAt) return { ok: false, reason: "expired" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (row.attempts >= MAX_ATTEMPTS) {
    await db
      .update(loginCodes)
      .set({ consumedAt: new Date() })
      .where(eq(loginCodes.id, row.id));
    return { ok: false, reason: "too_many_attempts" };
  }

  if (cleaned.length !== CODE_LENGTH || !equalHex(hashCode(email, cleaned), row.codeHash)) {
    const attempts = row.attempts + 1;
    await db
      .update(loginCodes)
      .set({
        attempts,
        // Burn the code once the budget is gone, so it cannot be ground down.
        consumedAt: attempts >= MAX_ATTEMPTS ? new Date() : null,
      })
      .where(eq(loginCodes.id, row.id));
    return attempts >= MAX_ATTEMPTS
      ? { ok: false, reason: "too_many_attempts" }
      : { ok: false, reason: "invalid" };
  }

  await db
    .update(loginCodes)
    .set({ consumedAt: new Date() })
    .where(eq(loginCodes.id, row.id));

  return { ok: true };
}
