import { redirect } from "next/navigation";
import { getSession, homeFor, setPendingLogin } from "@/lib/auth";
import { clientIp } from "@/lib/clientIp";
import { loginCodeEmail, sendMail } from "@/lib/mail";
import {
  ALLOWED_EMAIL_DOMAINS,
  CODE_TTL_MINUTES,
  isEmailAllowed,
  issueCode,
  normalizeEmail,
} from "@/lib/otp";
import { Logo } from "../components/Logo";
import AwardMark from "./AwardMark";
import EmailForm from "./EmailForm";

// Step 1 of sign-in: prove you can read the mailbox. No password exists.
async function requestCode(formData: FormData) {
  "use server";
  const email = normalizeEmail(String(formData.get("email") || ""));

  if (!isEmailAllowed(email)) redirect("/login?e=domain");

  const ip = await clientIp();

  const issued = await issueCode(email, ip);
  if (!issued.ok) {
    redirect(issued.reason === "ip_rate_limited" ? "/login?e=iprate" : "/login?e=rate");
  }

  const { subject, text, html } = loginCodeEmail(issued.code, CODE_TTL_MINUTES);
  try {
    await sendMail({ to: email, subject, text, html });
  } catch {
    // The code exists but could not be delivered — almost always the SMTP
    // relay being unreachable. Say so rather than parking the user on a
    // verify screen waiting for mail that will never arrive.
    redirect("/login?e=send");
  }

  await setPendingLogin({ email, codeId: issued.codeId });
  redirect("/login/verify");
}

const ERRORS: Record<string, string> = {
  domain: `Use your work email address (${ALLOWED_EMAIL_DOMAINS.map((d) => "@" + d).join(" or ")}).`,
  rate: "Too many codes requested for that address. Wait a few minutes and try again.",
  iprate:
    "Too many sign-in codes requested from this device. Wait a while and try again, or contact the awards team.",
  send: "We couldn't send the email just now. Please try again, or contact the awards team.",
  expired: "That code expired. Request a new one.",
  attempts: "Too many incorrect attempts. Request a new code.",
  inactive: "That account has been deactivated. Contact the awards team.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const existing = await getSession();
  if (existing) redirect(homeFor(existing.role));
  const { e } = await searchParams;

  return (
    <div className="auth">
      <a href="/" className="logo auth-brand">
        <Logo />
        <span className="lock">
          <b>JazzWorld</b>
          <span>AI Impact Awards</span>
        </span>
      </a>

      <div className="auth-form">
        <div className="auth-inner">
          <h1>Sign in</h1>
          <p className="auth-lede">
            Enter your work email and we&apos;ll send you a {CODE_TTL_MINUTES}-minute
            sign-in code. No password to remember.
          </p>

          {e && (
            <div className="notice n-danger" role="alert">
              {ERRORS[e] ?? "Something went wrong. Please try again."}
            </div>
          )}

          <EmailForm action={requestCode} />

          <p className="auth-foot">
            Nominees, evaluators and administrators all sign in here — you&apos;re
            routed automatically once your code is verified.
          </p>
        </div>
      </div>

      <aside className="auth-panel">
        <div className="auth-panel-inner">
          <AwardMark />
          <p className="auth-panel-line">
            Recognising the work that moves us forward.
          </p>
        </div>
      </aside>
    </div>
  );
}
